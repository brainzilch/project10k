import { NextResponse } from "next/server";
import { retryPendingUploads } from "@/lib/drive";

export async function POST() {
  const queued = retryPendingUploads();
  return NextResponse.json({ ok: true, queued });
}
