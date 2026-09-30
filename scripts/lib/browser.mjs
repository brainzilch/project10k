// Playwright(ヘッドレス Chromium) でビルド済みプレビューを開く共通処理
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function openApp({ width = 1920, height = 1080, port = Number(process.env.PREVIEW_PORT || 4180) } = {}) {
  const server = await preview({ root, preview: { port, host: '127.0.0.1', strictPort: true, open: false }, logLevel: 'silent' });
  const url = `http://127.0.0.1:${port}/?capture=1`;
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-gpu-vsync',
      '--hide-scrollbars',
      '--font-render-hinting=none',
      '--lang=ja-JP',
    ],
  });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ja-JP' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__anim && window.__anim.ready, null, { timeout: 60000 });
  // フォント読み込みを待つ
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const info = await page.evaluate(() => ({
    duration: window.__anim.duration,
    fps: window.__anim.fps,
    chairCounts: window.__anim.chairCounts,
    chairTotal: window.__anim.chairTotal,
    bandRects: window.__anim.bandRects,
  }));
  const close = async () => {
    await browser.close();
    await server.close();
  };
  return { page, info, errors, close };
}
