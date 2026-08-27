import fs from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getAsset } from "@/lib/attachments";

// Serve the local original of an asset (for display in the chat UI).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = getAsset(Number(id));
  if (!asset || !fs.existsSync(asset.local_path)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const data = fs.readFileSync(asset.local_path);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": asset.mime_type,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
