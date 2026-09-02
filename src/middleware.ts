import { NextRequest, NextResponse } from "next/server";

// Single-user password gate. Active only when CLIMB_PASSWORD is set - required
// the moment CLIMB is reachable from outside the PC (cloud hosting). Not a
// multi-user auth system: one password, one cookie.
// sw.js / manifest / icons must load without the auth cookie (PWA install,
// service-worker fetches)
const PUBLIC_PATHS = ["/login", "/api/login", "/sw.js", "/manifest.webmanifest", "/icons/"];

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const password = process.env.CLIMB_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("climb_auth")?.value;
  if (cookie && cookie === (await sha256Hex(password))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon\\.ico).*)"],
};
