import { NextRequest, NextResponse } from "next/server";
import { importAnyAnalyticsCsv } from "@/lib/analyticsCsv";
import { saveAssetFile, timestampParts } from "@/lib/attachments";

// X analytics content CSV upload. The CSV itself is kept as an ANALYTICS
// asset (Drive-synced) so the raw export is never lost.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  }

  const totals = {
    rows: 0,
    repliesSkipped: 0,
    appended: 0,
    unchanged: 0,
    created: 0,
    dailyRows: 0,
  };
  try {
    for (const file of files) {
      const text = await file.text();
      const ts = timestampParts();
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      saveAssetFile({
        buffer: Buffer.from(text, "utf-8"),
        source: "ANALYTICS",
        originalFilename: file.name,
        mimeType: "text/csv",
        storedFilename: `${ts.datePart}_${ts.timePart}_analytics_${safe}`,
      });
      const r = importAnyAnalyticsCsv(text);
      if (r.kind === "overview") {
        totals.dailyRows += r.rows;
      } else {
        totals.rows += r.rows;
        totals.repliesSkipped += r.repliesSkipped;
        totals.appended += r.appended;
        totals.unchanged += r.unchanged;
        totals.created += r.created;
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "CSVの取り込みに失敗しました" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, ...totals });
}
