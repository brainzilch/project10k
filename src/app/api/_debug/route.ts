import { NextResponse } from "next/server";
import { buildCoachContext, winnersPromptBlock } from "@/lib/coach";
export async function GET() {
  return NextResponse.json({ winners: winnersPromptBlock(), ctx: buildCoachContext() });
}
