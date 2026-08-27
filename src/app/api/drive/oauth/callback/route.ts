import { NextRequest, NextResponse } from "next/server";
import { ensureFolderStructure, redirectUriFor, saveTokens } from "@/lib/drive";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get("drive_oauth_state")?.value;

  const fail = (message: string) => {
    const url = req.nextUrl.clone();
    url.pathname = "/settings";
    url.search = `?drive_error=${encodeURIComponent(message)}`;
    return NextResponse.redirect(url);
  };

  if (!code) return fail("認証がキャンセルされました");
  if (!state || state !== expectedState) return fail("stateが一致しません（再試行してください）");

  const redirectUri = redirectUriFor(req.nextUrl.origin);

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) return fail(`トークン交換に失敗しました (${res.status})`);
    const tokens = await res.json();
    saveTokens({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
    });

    // OAuth完了後にPROJECT_10Kフォルダ構成を作成または既存取得（spec section 31）
    await ensureFolderStructure();

    const url = req.nextUrl.clone();
    url.pathname = "/settings";
    url.search = "?drive=connected";
    return NextResponse.redirect(url);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Drive接続に失敗しました");
  }
}
