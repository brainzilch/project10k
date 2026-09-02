import { NextRequest, NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";
import { getClient, getModel, textOf, trackUsage } from "@/lib/anthropic";
import {
  DIAGNOSIS_SYSTEM,
  MINIMAL_EDIT_SYSTEM,
  PROMPT_VERSION,
} from "@/lib/diagnosis";
import { postTypeLabel } from "@/lib/labels";
import { learningsPromptBlock, winnersPromptBlock } from "@/lib/coach";

// Diagnose the latest draft (RAW or REWRITE) and, in the same run, produce the
// single suggestion-applied version so the user can compare before deciding to
// rewrite or adopt it.
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

  const latestDraft = db
    .prepare(
      `SELECT id, text FROM post_revisions
       WHERE post_id = ? AND kind IN ('RAW', 'REWRITE')
       ORDER BY revision DESC LIMIT 1`,
    )
    .get(id) as { id: number; text: string } | undefined;
  const text = latestDraft?.text ?? post.raw_text;

  try {
    const model = getModel();
    const client = getClient();

    const diagnosisResponse = await client.messages.create({
      model,
      max_tokens: 6000,
      system: [
        {
          type: "text",
          text: DIAGNOSIS_SYSTEM + learningsPromptBlock() + winnersPromptBlock(),
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `投稿タイプ: ${postTypeLabel(post.post_type)}\n\n投稿原文:\n${text}`,
        },
      ],
    });
    const feedback = textOf(trackUsage("投稿診断", diagnosisResponse));

    const editResponse = await client.messages.create({
      model,
      max_tokens: 6000,
      system: MINIMAL_EDIT_SYSTEM,
      messages: [
        {
          role: "user",
          content: `投稿原文:\n${text}\n\n診断結果:\n${feedback}`,
        },
      ],
    });
    const aiEdit = textOf(trackUsage("提案版", editResponse));

    const draftCount = inTransaction(() => {
      db.prepare(
        "UPDATE posts SET ai_feedback = ?, ai_minimal_edit = ?, prompt_version = ? WHERE id = ?",
      ).run(feedback, aiEdit, PROMPT_VERSION, id);
      if (latestDraft) {
        db.prepare("UPDATE post_revisions SET ai_feedback = ? WHERE id = ?").run(
          feedback,
          latestDraft.id,
        );
      }
      const { next } = db
        .prepare(
          "SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM post_revisions WHERE post_id = ?",
        )
        .get(id) as { next: number };
      db.prepare(
        "INSERT INTO post_revisions (post_id, revision, kind, text) VALUES (?, ?, 'AI_EDIT', ?)",
      ).run(id, next, aiEdit);
      const { n } = db
        .prepare(
          "SELECT COUNT(*) AS n FROM post_revisions WHERE post_id = ? AND kind IN ('RAW', 'REWRITE')",
        )
        .get(id) as { n: number };
      return n;
    });

    return NextResponse.json({
      ai_feedback: feedback,
      ai_minimal_edit: aiEdit,
      draft_count: draftCount,
      model,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "diagnosis failed" },
      { status: 500 },
    );
  }
}
