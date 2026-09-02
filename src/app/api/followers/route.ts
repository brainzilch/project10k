import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { deriveFollowersFromDailyStats } from "@/lib/followers";

export async function GET() {
  const rows = getDb()
    .prepare("SELECT date, followers FROM daily_followers ORDER BY date ASC")
    .all();
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const date = String(body.date ?? "");
  const followers = Number(body.followers);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(followers) || followers < 0) {
    return NextResponse.json({ error: "invalid date or followers" }, { status: 400 });
  }
  // one row per date - same-date input overwrites
  getDb()
    .prepare(
      `INSERT INTO daily_followers (date, followers, source) VALUES (?, ?, 'MANUAL')
       ON CONFLICT(date) DO UPDATE SET followers = excluded.followers, source = 'MANUAL'`,
    )
    .run(date, followers);
  // a new anchor changes every derived day around it
  try {
    deriveFollowersFromDailyStats();
  } catch {}
  return NextResponse.json({ ok: true });
}
