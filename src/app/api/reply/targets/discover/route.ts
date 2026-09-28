import { NextResponse } from "next/server";
import { discoverReplyTargets, shortage } from "@/lib/replyDiscovery";

export const maxDuration = 120;

// Fill the reply-target list automatically (archive interactions first, then
// AI candidates, each verified against the public profile). Takes up to a
// minute or so - the button says so.
export async function POST() {
  const s = shortage();
  const need = Math.max(s.missing, 3) + 2;
  try {
    const r = await discoverReplyTargets(need);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "探索に失敗しました" },
      { status: 500 },
    );
  }
}
