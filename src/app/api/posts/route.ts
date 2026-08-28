import { NextRequest, NextResponse } from "next/server";
import { getDb, inTransaction } from "@/lib/db";

export async function GET() {
  const rows = getDb()
    .prepare("SELECT * FROM posts ORDER BY id DESC")
    .all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawText = String(body.raw_text ?? "").trim();
  const postType = body.post_type === "CASUAL" ? "CASUAL" : "PRIMARY";
  const tags: string[] = Array.isArray(body.tags)
    ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
    : [];
  if (!rawText) {
    return NextResponse.json({ error: "raw_text is required" }, { status: 400 });
  }

  const db = getDb();
  const postId = inTransaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO posts (post_type, raw_text) VALUES (?, ?)")
      .run(postType, rawText);
    db.prepare(
      "INSERT INTO post_revisions (post_id, revision, kind, text) VALUES (?, 1, 'RAW', ?)",
    ).run(lastInsertRowid, rawText);
    const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
    const getTag = db.prepare("SELECT id FROM tags WHERE name = ?");
    const link = db.prepare(
      "INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)",
    );
    for (const name of tags) {
      insertTag.run(name);
      const tag = getTag.get(name) as { id: number };
      link.run(lastInsertRowid, tag.id);
    }
    return Number(lastInsertRowid);
  });

  return NextResponse.json({ id: postId });
}
