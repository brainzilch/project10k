import { NextResponse } from "next/server";
import { runCoach } from "@/lib/coachRun";

export async function POST() {
  try {
    const r = await runCoach();
    return NextResponse.json({
      ok: true,
      summary: r.summary,
      actions: r.actions,
      new_learnings: r.learnings,
      new_proposals: r.proposals,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "coach failed" },
      { status: 500 },
    );
  }
}
