import { NextResponse } from "next/server";
import { disconnectDrive } from "@/lib/drive";

export async function POST() {
  disconnectDrive();
  return NextResponse.json({ ok: true });
}
