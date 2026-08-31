import { NextResponse } from "next/server";
import { generateReport, pendingReport } from "@/lib/report";

// Manual "make a report draft now" button. The scheduled path lives in
// autoReportTick (instrumentation); this one always generates on demand.
export async function POST() {
  if (pendingReport()) {
    return NextResponse.json(
      { error: "未処理の報告下書きがあります。先にそれを投稿するか破棄してください。" },
      { status: 409 },
    );
  }
  try {
    const result = await generateReport();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "report generation failed" },
      { status: 500 },
    );
  }
}
