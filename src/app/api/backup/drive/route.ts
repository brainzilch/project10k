import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb, EXPORTS_DIR } from "@/lib/db";
import { timestampParts } from "@/lib/attachments";
import {
  driveConnected,
  getDriveFolders,
  uploadBufferToDrive,
} from "@/lib/drive";

// Snapshot the DB and store it in Drive (PROJECT_10K/CLIMB/exports).
export async function POST() {
  if (!driveConnected()) {
    return NextResponse.json({ error: "Driveが接続されていません" }, { status: 400 });
  }
  try {
    const folderId = getDriveFolders()["CLIMB/exports"];
    if (!folderId) {
      return NextResponse.json(
        { error: "CLIMB/exportsフォルダが未作成です。接続をやり直してください" },
        { status: 400 },
      );
    }
    const ts = timestampParts();
    const name = `climb-${ts.datePart.replaceAll("-", "")}-${ts.timePart}.db`;
    const dest = path.join(EXPORTS_DIR, name);
    getDb().exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    const result = await uploadBufferToDrive(
      fs.readFileSync(dest),
      name,
      "application/octet-stream",
      folderId,
    );
    return NextResponse.json({ ok: true, name, url: result.webViewLink ?? null });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "drive backup failed" },
      { status: 500 },
    );
  }
}
