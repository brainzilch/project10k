import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { subscriptionCount } from "@/lib/push";

// One row per device/browser. Re-subscribing with the same endpoint is a no-op.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const sub = body.subscription as
    | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    | undefined;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  getDb()
    .prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .run(sub.endpoint, sub.keys.p256dh, sub.keys.auth);
  return NextResponse.json({ ok: true, devices: subscriptionCount() });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const endpoint = String(body.endpoint ?? "");
  if (endpoint) {
    getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }
  return NextResponse.json({ ok: true, devices: subscriptionCount() });
}
