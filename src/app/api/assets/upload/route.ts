import { NextRequest, NextResponse } from "next/server";
import {
  AssetSource,
  saveAssetFile,
  SUPPORTED_IMAGE_MIMES,
  timestampParts,
} from "@/lib/attachments";

const SOURCES: AssetSource[] = ["X_SCREENSHOT", "ANALYTICS", "CLIMB", "OTHER"];

// Direct image upload into the asset store (no Claude call) - the cloud
// replacement for the local data/inbox drop folder.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const sourceRaw = String(form.get("source") ?? "OTHER");
  const source = (SOURCES as string[]).includes(sourceRaw)
    ? (sourceRaw as AssetSource)
    : "OTHER";
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "no files" }, { status: 400 });
  }
  for (const f of files) {
    if (!SUPPORTED_IMAGE_MIMES.includes(f.type)) {
      return NextResponse.json(
        { error: `unsupported image type: ${f.type || f.name}` },
        { status: 400 },
      );
    }
  }

  const saved = [];
  for (const f of files) {
    const buffer = Buffer.from(await f.arrayBuffer());
    const ts = timestampParts();
    const safe = f.name.replace(/[^\w.\-]+/g, "_");
    saved.push(
      saveAssetFile({
        buffer,
        source,
        originalFilename: f.name,
        mimeType: f.type,
        storedFilename: `${ts.datePart}_${ts.timePart}_upload_${safe}`,
      }),
    );
  }
  return NextResponse.json({
    ok: true,
    count: saved.length,
    files: saved.map((s) => ({ id: s.id, stored_filename: s.stored_filename })),
  });
}
