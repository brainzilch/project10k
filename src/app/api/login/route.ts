import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const password = process.env.CLIMB_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "password gate is not enabled" }, { status: 400 });
  }
  const body = await req.json();
  if (String(body.password ?? "") !== password) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }
  const hash = crypto.createHash("sha256").update(password).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("climb_auth", hash, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 24 * 90,
    path: "/",
  });
  return res;
}
