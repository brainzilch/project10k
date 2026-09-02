import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/db";

// Only whitelisted keys - API keys and tokens are NEVER stored in the DB.
const ALLOWED_KEYS = ["claude_model", "push_reminder_time"];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const key = String(body.key ?? "");
  const value = String(body.value ?? "").trim();
  if (!ALLOWED_KEYS.includes(key) || !value) {
    return NextResponse.json({ error: "invalid key or value" }, { status: 400 });
  }
  setSetting(key, value);
  return NextResponse.json({ ok: true });
}
