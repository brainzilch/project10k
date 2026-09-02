import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// Record "this post is now pinned on X" (history row; the X-side pinning is
// done by the owner).
export async function POST(req: NextRequest) {
  const body = await req.json();
  const postId = Number(body.post_id);
  const db = getDb();
  const post = db
    .prepare("SELECT id FROM posts WHERE id = ? AND status = 'PUBLISHED'")
    .get(postId);
  if (!post) return NextResponse.json({ error: "公開済みの投稿を選んでください" }, { status: 400 });
  const latest = db
    .prepare("SELECT post_id FROM pinned_posts ORDER BY id DESC LIMIT 1")
    .get() as { post_id: number } | undefined;
  if (latest?.post_id === postId) {
    return NextResponse.json({ error: "すでに固定ポストです" }, { status: 409 });
  }
  db.prepare("INSERT INTO pinned_posts (post_id, applied_on) VALUES (?, ?)").run(
    postId,
    jstToday(),
  );
  return NextResponse.json({ ok: true });
}
