import { NextRequest, NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";

// Save FINAL text / mark published. RAW is immutable - only final-stage fields change.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(id);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (typeof body.final_text === "string") {
    inTransaction(() => {
      db.prepare(
        `UPDATE posts SET final_text = ?, minimal_edit_used = ?, status = 'FINAL'
         WHERE id = ?`,
      ).run(body.final_text, body.minimal_edit_used ? 1 : 0, id);
      const { next } = db
        .prepare(
          "SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM post_revisions WHERE post_id = ?",
        )
        .get(id) as { next: number };
      db.prepare(
        "INSERT INTO post_revisions (post_id, revision, kind, text) VALUES (?, ?, 'FINAL', ?)",
      ).run(id, next, body.final_text);
    });
  }
  // Free-text theme label for per-theme performance stats. Empty clears it.
  if (typeof body.theme === "string") {
    const theme = body.theme.trim().slice(0, 50);
    db.prepare("UPDATE posts SET theme = ? WHERE id = ?").run(theme || null, id);
  }
  if (body.published === true) {
    db.prepare(
      `UPDATE posts SET status = 'PUBLISHED', published_at = datetime('now')
       WHERE id = ?`,
    ).run(id);
  }
  // Undo for swipe-publish: revert to the pre-publish status (no confirm
  // dialog in the UI, so the undo path is the safety net)
  if (body.unpublish === true) {
    const to = body.to === "FINAL" ? "FINAL" : "DRAFT";
    db.prepare(
      "UPDATE posts SET status = ?, published_at = NULL WHERE id = ?",
    ).run(to, id);
  }
  // Logical delete (hidden from the default list, data retained) and its undo
  if (body.discard === true) {
    db.prepare("UPDATE posts SET status = 'DISCARDED' WHERE id = ?").run(id);
  }
  if (body.restore === true) {
    db.prepare("UPDATE posts SET status = 'DRAFT' WHERE id = ?").run(id);
  }
  return NextResponse.json({ ok: true });
}
