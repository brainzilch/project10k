import { NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push";

export async function POST() {
  const sent = await sendPushToAll({
    title: "CLIMB",
    body: "プッシュ通知が有効になりました",
    url: "/",
    tag: "test",
  });
  return NextResponse.json({ ok: true, sent });
}
