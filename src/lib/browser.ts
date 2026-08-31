import { chromium, Browser } from "playwright-core";

// Uses an installed Chrome/Edge (playwright-core ships no browser binary).
// Shared by self-capture and report-card rendering.
export async function launchBrowser(): Promise<Browser> {
  const candidates: {
    executablePath?: string;
    channel?: string;
    args?: string[];
  }[] = [];
  if (process.env.CLIMB_CHROME_PATH) {
    // explicit path implies a container/server context, where Chromium's
    // sandbox is typically unavailable; the only pages rendered are CLIMB's own
    candidates.push({
      executablePath: process.env.CLIMB_CHROME_PATH,
      args: ["--no-sandbox"],
    });
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
