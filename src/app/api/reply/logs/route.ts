import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function jstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// One reply done today for a target. DELETE undoes today's last one.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const targetId = Number(body.target_id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "target_id required" }, { status: 400 });
  }
  getDb()
    .prepare("INSERT INTO reply_logs (target_id, date) VALUES (?, ?)")
    .run(targetId, jstToday());
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const targetId = Number(body.target_id);
  getDb()
    .prepare(
      `DELETE FROM reply_logs WHERE id = (
         SELECT id FROM reply_logs WHERE target_id = ? AND date = ? ORDER BY id DESC LIMIT 1)`,
    )
    .run(targetId, jstToday());
  return NextResponse.json({ ok: true });
}
