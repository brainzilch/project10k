import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const date = String(body.date ?? "");
  const category = String(body.category ?? "").trim();
  const minutes = Number(body.minutes);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !category || !Number.isInteger(minutes) || minutes <= 0) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }
  getDb()
    .prepare("INSERT INTO time_logs (date, category, minutes) VALUES (?, ?, ?)")
    .run(date, category, minutes);
  return NextResponse.json({ ok: true });
}
