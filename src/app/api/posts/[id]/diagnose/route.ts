import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getClient, getModel, textOf } from "@/lib/anthropic";
import { DIAGNOSIS_SYSTEM, PROMPT_VERSION } from "@/lib/diagnosis";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const post = db
    .prepare("SELECT id, raw_text, post_type FROM posts WHERE id = ?")
    .get(id) as { id: number; raw_text: string; post_type: string } | undefined;
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const model = getModel();
    const response = await getClient().messages.create({
      model,
      max_tokens: 1024,
      system: DIAGNOSIS_SYSTEM,
      messages: [
        {
          role: "user",
          content: `投稿タイプ: ${post.post_type}\n\n投稿原文:\n${post.raw_text}`,
        },
      ],
    });
    const feedback = textOf(response);
    db.prepare(
      "UPDATE posts SET ai_feedback = ?, prompt_version = ? WHERE id = ?",
    ).run(feedback, PROMPT_VERSION, id);
    return NextResponse.json({ ai_feedback: feedback, model });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "diagnosis failed" },
      { status: 500 },
    );
  }
}
