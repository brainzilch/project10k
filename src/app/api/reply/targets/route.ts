import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Add (or re-activate) a reply target. Handle without @, X rules: 1-15 chars.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const handle = String(body.handle ?? "").trim().replace(/^@/, "");
  const note = String(body.note ?? "").trim().slice(0, 80) || null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    return NextResponse.json({ error: "ユーザー名は英数字と_で1〜15文字（@不要）" }, { status: 400 });
  }
  getDb()
    .prepare(
      `INSERT INTO reply_targets (handle, note) VALUES (?, ?)
       ON CONFLICT(handle) DO UPDATE SET active = 1, note = COALESCE(excluded.note, reply_targets.note)`,
    )
    .run(handle, note);
  return NextResponse.json({ ok: true });
}
