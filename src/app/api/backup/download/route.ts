import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb, EXPORTS_DIR } from "@/lib/db";
import { timestampParts } from "@/lib/attachments";

// Off-site backup path (b): download a consistent DB snapshot to the browser.
export async function GET() {
  const ts = timestampParts();
  const name = `climb-${ts.datePart.replaceAll("-", "")}-${ts.timePart}.db`;
  const dest = path.join(EXPORTS_DIR, name);
  getDb().exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  const data = fs.readFileSync(dest);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
