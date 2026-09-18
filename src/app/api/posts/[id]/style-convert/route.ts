import { NextRequest, NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";
import { getClient, getModel, textOf, trackUsage } from "@/lib/anthropic";
import { STYLE_CONVERT_SYSTEM, exemplarBlock } from "@/lib/styleConvert";

// POST: generate one dialogue-style variant of the latest draft.
// POST with adopt:true + text: record the adopted variant as a revision
// (kind STYLE_EDIT, shown as 型変換: セリフ in the timeline).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const post = db
    .prepare("SELECT id, raw_text FROM posts WHERE id = ?")
    .get(id) as { id: number; raw_text: string } | undefined;
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.adopt === true) {
    const text = String(body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
    const draftCount = inTransaction(() => {
      const { next } = db
        .prepare(
          "SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM post_revisions WHERE post_id = ?",
        )
        .get(id) as { next: number };
      db.prepare(
        "INSERT INTO post_revisions (post_id, revision, kind, text) VALUES (?, ?, 'STYLE_EDIT', ?)",
      ).run(id, next, text);
      const { n } = db
        .prepare(
          "SELECT COUNT(*) AS n FROM post_revisions WHERE post_id = ? AND kind IN ('RAW', 'REWRITE', 'STYLE_EDIT')",
        )
        .get(id) as { n: number };
      return n;
    });
    return NextResponse.json({ ok: true, draft_count: draftCount });
  }

  const latestDraft = db
    .prepare(
      `SELECT text FROM post_revisions
       WHERE post_id = ? AND kind IN ('RAW', 'REWRITE', 'STYLE_EDIT')
       ORDER BY revision DESC LIMIT 1`,
    )
    .get(id) as { text: string } | undefined;
  const source = latestDraft?.text ?? post.raw_text;

  try {
    const response = await getClient().messages.create({
      model: getModel(),
      max_tokens: 4000,
      system: STYLE_CONVERT_SYSTEM + exemplarBlock(),
      messages: [{ role: "user", content: `原文:\n${source}` }],
    });
    return NextResponse.json({ text: textOf(trackUsage("型変換", response)).trim() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "変換に失敗しました" },
      { status: 500 },
    );
  }
}
