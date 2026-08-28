import { NextRequest, NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";

// Save a rewrite as a new revision. The original RAW is never modified -
// every stage stays on record as story material.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });

  const db = getDb();
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(id);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  const draftCount = inTransaction(() => {
    const { next } = db
      .prepare(
        "SELECT COALESCE(MAX(revision), 0) + 1 AS next FROM post_revisions WHERE post_id = ?",
      )
      .get(id) as { next: number };
    db.prepare(
      "INSERT INTO post_revisions (post_id, revision, kind, text) VALUES (?, ?, 'REWRITE', ?)",
    ).run(id, next, text);
    const { n } = db
      .prepare(
        "SELECT COUNT(*) AS n FROM post_revisions WHERE post_id = ? AND kind IN ('RAW', 'REWRITE')",
      )
      .get(id) as { n: number };
    return n;
  });

  return NextResponse.json({ ok: true, draft_count: draftCount });
}
