import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const FIELDS = [
  "impressions",
  "likes",
  "reposts",
  "replies",
  "bookmarks",
  "profile_visits",
  "follows",
] as const;

// Metrics are append-only: every measurement is a new row, never an overwrite.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const post = db.prepare("SELECT id FROM posts WHERE id = ?").get(id);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  const values = FIELDS.map((f) => {
    const v = body[f];
    return v === "" || v === undefined || v === null ? null : Number(v);
  });
  db.prepare(
    `INSERT INTO post_metrics (post_id, ${FIELDS.join(", ")})
     VALUES (?, ${FIELDS.map(() => "?").join(", ")})`,
  ).run(id, ...values);
  return NextResponse.json({ ok: true });
}
