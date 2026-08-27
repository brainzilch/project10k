import { NextRequest, NextResponse } from "next/server";
import { chromium, Browser } from "playwright-core";
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

// Uses an installed Chrome/Edge (playwright-core ships no browser binary).
async function launchBrowser(): Promise<Browser> {
  const candidates: { executablePath?: string; channel?: string }[] = [];
  if (process.env.CLIMB_CHROME_PATH) {
    candidates.push({ executablePath: process.env.CLIMB_CHROME_PATH });
  }
  candidates.push({ channel: "chrome" }, { channel: "msedge" });

  let lastError: unknown;
  for (const c of candidates) {
    try {
      return await chromium.launch({ headless: true, ...c });
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `Chrome/Edgeが見つかりません。どちらかをインストールするか、環境変数 CLIMB_CHROME_PATH にブラウザ実行ファイルのパスを設定してください。(${lastError instanceof Error ? lastError.message.split("\n")[0] : "launch failed"})`,
  );
}

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
