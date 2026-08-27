import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  driveConfigured,
  DRIVE_SCOPE,
  publicOrigin,
  redirectUriFor,
} from "@/lib/drive";

export async function GET(req: NextRequest) {
  if (!driveConfigured()) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が未設定です（README参照）" },
      { status: 400 },
    );
  }
  const redirectUri = redirectUriFor(
    publicOrigin(req.headers, req.nextUrl.origin),
  );
  const state = crypto.randomBytes(16).toString("hex");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set("drive_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
