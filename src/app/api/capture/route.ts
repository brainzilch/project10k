import { NextRequest, NextResponse } from "next/server";
import { Browser } from "playwright-core";
import { launchBrowser } from "@/lib/browser";
import { saveAssetFile, timestampParts } from "@/lib/attachments";

// Self-capture: CLIMB screenshots its own screens headlessly and registers
// them as CLIMB assets (evidence material for PROJECT 10K posts / note).
const PAGES: [string, string][] = [
  ["dashboard", "/"],
  ["compose", "/compose"],
  ["chat", "/chat"],
  ["posts", "/posts"],
  ["followers", "/followers"],
  ["weekly", "/weekly"],
  ["settings", "/settings"],
];

export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "browser launch failed" },
      { status: 500 },
    );
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const files: { id: number; stored_filename: string }[] = [];
    for (const [name, route] of PAGES) {
      await page.goto(origin + route, { waitUntil: "networkidle", timeout: 30000 });
      const buffer = Buffer.from(await page.screenshot({ fullPage: true, type: "png" }));
      const ts = timestampParts();
      const saved = saveAssetFile({
        buffer,
        source: "CLIMB",
        originalFilename: `${name}.png`,
        mimeType: "image/png",
        storedFilename: `${ts.datePart}_${ts.timePart}_climb_${name}.png`,
      });
      files.push({ id: saved.id, stored_filename: saved.stored_filename });
    }
    return NextResponse.json({ ok: true, count: files.length, files });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "capture failed" },
      { status: 500 },
    );
  } finally {
    await browser.close();
  }
}
