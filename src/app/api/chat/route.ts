import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { getDb } from "@/lib/db";
import { getClient, getModel, textOf } from "@/lib/anthropic";
import {
  getAttachmentsForMessages,
  saveChatImage,
  SUPPORTED_IMAGE_MIMES,
} from "@/lib/attachments";

const CHAT_SYSTEM = `あなたはPROJECT 10K（Xアカウント@brainzilchを365日で1,458→10,000フォロワーへ成長させる実証プロジェクト）の相談相手。
本人が体験し、考え、書き、判断する。あなたは指摘・記録・整理・分析補助を担当する。簡潔に答える。`;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const text = String(form.get("text") ?? "").trim();
  const conversationIdRaw = form.get("conversation_id");
  const files = form
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!text && files.length === 0) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }
  for (const f of files) {
    if (!SUPPORTED_IMAGE_MIMES.includes(f.type)) {
      return NextResponse.json(
        { error: `unsupported image type: ${f.type || "unknown"}` },
        { status: 400 },
      );
    }
  }

  const db = getDb();

  // 1. conversation (create with a title from the first message if new)
  let conversationId = conversationIdRaw ? Number(conversationIdRaw) : 0;
  if (conversationId) {
    const exists = db
      .prepare("SELECT id FROM conversations WHERE id = ?")
      .get(conversationId);
    if (!exists)
      return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  } else {
    const title = (text || "画像").slice(0, 40);
    const { lastInsertRowid } = db
      .prepare("INSERT INTO conversations (title) VALUES (?)")
      .run(title);
    conversationId = Number(lastInsertRowid);
  }

  // 2. save user message, then 3. save images locally + provisional asset rows.
  // Local save and DB records come first - the Claude call must not be able to
  // lose them, and a future Drive upload runs in the background afterwards.
  const { lastInsertRowid: userMessageId } = db
    .prepare(
      "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'user', ?)",
    )
    .run(conversationId, text);

  const savedAssets = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const buffer = Buffer.from(await f.arrayBuffer());
    savedAssets.push(
      saveChatImage(conversationId, Number(userMessageId), buffer, f.name, f.type, i + 1),
    );
  }

  // 4. rebuild full history (attachments included) and call Claude
  const history = db
    .prepare(
      "SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC",
    )
    .all(conversationId) as { id: number; role: string; content: string }[];
  const attachmentsByMessage = getAttachmentsForMessages(history.map((m) => m.id));

  const apiMessages: Anthropic.MessageParam[] = history.map((m) => {
    const attachments = attachmentsByMessage.get(m.id) ?? [];
    if (m.role !== "user" || attachments.length === 0) {
      return { role: m.role as "user" | "assistant", content: m.content };
    }
    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const a of attachments) {
      if (!fs.existsSync(a.local_path)) continue;
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: a.mime_type as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: fs.readFileSync(a.local_path).toString("base64"),
        },
      });
    }
    if (m.content) blocks.push({ type: "text", text: m.content });
    return { role: "user", content: blocks };
  });

  try {
    const model = getModel();
    const response = await getClient().messages.create({
      model,
      max_tokens: 16000,
      system: CHAT_SYSTEM,
      messages: apiMessages,
    });
    const assistantText = textOf(response);

    const { lastInsertRowid: assistantMessageId } = db
      .prepare(
        "INSERT INTO messages (conversation_id, role, content, model) VALUES (?, 'assistant', ?, ?)",
      )
      .run(conversationId, assistantText, model);
    db.prepare(
      "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?",
    ).run(conversationId);

    return NextResponse.json({
      conversation_id: conversationId,
      user_message_id: Number(userMessageId),
      assistant: {
        id: Number(assistantMessageId),
        content: assistantText,
        model,
      },
      attachments: savedAssets,
    });
  } catch (e) {
    // The user message and images are already saved - only the reply failed.
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "chat failed",
        conversation_id: conversationId,
        attachments: savedAssets,
      },
      { status: 500 },
    );
  }
}
