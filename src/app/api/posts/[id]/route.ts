import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
    db.prepare(
      `UPDATE posts SET final_text = ?, minimal_edit_used = ?, status = 'FINAL'
       WHERE id = ?`,
    ).run(body.final_text, body.minimal_edit_used ? 1 : 0, id);
  }
  if (body.published === true) {
    db.prepare(
      `UPDATE posts SET status = 'PUBLISHED', published_at = datetime('now')
       WHERE id = ?`,
    ).run(id);
  }
  return NextResponse.json({ ok: true });
}
