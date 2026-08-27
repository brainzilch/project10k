import { NextResponse } from "next/server";
import {
  driveConnected,
  getDriveFolders,
  uploadBufferToDrive,
} from "@/lib/drive";
import { timestampParts } from "@/lib/attachments";

// Settings "Test Upload": send a small text file to PROJECT_10K root.
export async function POST() {
  if (!driveConnected()) {
    return NextResponse.json({ error: "Driveが接続されていません" }, { status: 400 });
  }
  try {
    const rootId = getDriveFolders()["PROJECT_10K"];
    if (!rootId) {
      return NextResponse.json(
        { error: "PROJECT_10Kフォルダが未作成です。接続をやり直してください" },
        { status: 400 },
      );
    }
    const ts = timestampParts();
    const name = `climb-test-upload_${ts.datePart}_${ts.timePart}.txt`;
    const result = await uploadBufferToDrive(
      Buffer.from(`CLIMB test upload at ${new Date().toISOString()}\n`),
      name,
      "text/plain",
      rootId,
    );
    return NextResponse.json({ ok: true, name, url: result.webViewLink ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "test upload failed" },
      { status: 500 },
    );
  }
}
