import { NextResponse } from "next/server";
import { getVapid } from "@/lib/push";

export async function GET() {
  return NextResponse.json({ publicKey: getVapid().publicKey });
}
