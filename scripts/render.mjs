// 動画書き出し： `npm run render`
// ビルド済みプレビューをヘッドレス Chromium で 1 フレームずつ描画し、ffmpeg で H.264 MP4 にする。
// 同じタイムライン（src/timeline.js）から決定的に描画するので、何度でも同じ動画になる。
//
//   使い方: npm run build && npm run render
//   環境変数: OUT=dist/ichimura_setup_teardown_3d.mp4  FPS=30  START=0  END=90  CRF=18  FFMPEG=ffmpeg
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from './lib/browser.mjs';
import { video } from '../src/config.js';

const OUT = process.env.OUT || 'dist/ichimura_setup_teardown_3d.mp4';
const FPS = Number(process.env.FPS || video.fps);
const START = Number(process.env.START || 0);
const END = Number(process.env.END || video.duration);
const CRF = process.env.CRF || '18';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const W = video.width;
const H = video.height;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const { page, info, errors, close } = await openApp({ width: W, height: H });
console.log(`rendering ${W}x${H} @${FPS}fps  t=${START}..${END}s  chairs=${info.chairTotal} (${JSON.stringify(info.chairCounts)})`);

const ff = spawn(
  FFMPEG,
  [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'image2pipe',
    '-vcodec',
    'png',
    '-framerate',
    String(FPS),
    '-i',
    '-',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    CRF,
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(FPS),
    '-movflags',
    '+faststart',
    OUT,
  ],
  { stdio: ['pipe', 'inherit', 'inherit'] },
);
const done = new Promise((resolve, reject) => {
  ff.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code))));
});

const cdp = await page.context().newCDPSession(page);
const nFrames = Math.round((END - START) * FPS);
const t0 = Date.now();
for (let i = 0; i < nFrames; i++) {
  const t = START + i / FPS;
  await page.evaluate((tt) => window.__anim.setTime(tt, 'auto'), t);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
  const buf = Buffer.from(data, 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 60 === 0 || i === nFrames - 1) {
    const el = (Date.now() - t0) / 1000;
    const eta = (el / (i + 1)) * (nFrames - i - 1);
    process.stdout.write(`frame ${i + 1}/${nFrames}  t=${t.toFixed(2)}s  elapsed ${el.toFixed(0)}s  eta ${eta.toFixed(0)}s\n`);
  }
}
ff.stdin.end();
await done;
if (errors.length) console.log('page errors:', errors);
await close();
console.log('wrote', OUT);
