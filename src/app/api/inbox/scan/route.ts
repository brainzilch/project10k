import { NextResponse } from "next/server";
import { ingestInbox, INBOX_DIR } from "@/lib/inbox";

export async function POST() {
  try {
    const count = ingestInbox();
    return NextResponse.json({ ok: true, count, inbox: INBOX_DIR });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "inbox scan failed" },
      { status: 500 },
    );
  }
}
