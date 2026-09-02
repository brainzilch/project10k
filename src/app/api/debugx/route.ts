import { NextResponse } from "next/server";
import { pushTick } from "@/lib/push";
import { getDb } from "@/lib/db";
export async function GET() {
  await pushTick();
  return NextResponse.json({ log: getDb().prepare("SELECT kind, ref FROM push_log").all() });
}
