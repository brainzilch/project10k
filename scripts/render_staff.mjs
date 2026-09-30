// 運営スタッフ注意喚起動画の書き出し： `npm run render:staff`
//  1) 効果音と BGM を Web Audio で合成して WAV にする（audio/bgm.mp3 等があればそれを BGM に使う）
//  2) ヘッドレス Chromium で 1 フレームずつ描画し、ffmpeg で H.264 にする
//  3) 映像と音声を 1 本の MP4（AAC）にまとめる
//  環境変数: OUT  FPS  START  END  CRF  FFMPEG  CHROMIUM_PATH  AUDIO_ONLY=1  SKIP_VIDEO=1（音声だけ作り直して既存の無音映像と合成）
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from './lib/browser.mjs';
import { video } from '../src/config.js';
import { staffVideo } from '../src/staff/staffConfig.js';

const OUT = process.env.OUT || 'dist/staff/ichimura_staff_notice_3d.mp4';
const SILENT = OUT.replace(/\.mp4$/, '_silent.mp4');
const WAV = OUT.replace(/\.mp4$/, '.wav');
const FPS = Number(process.env.FPS || video.fps);
const START = Number(process.env.START || 0);
const END = Number(process.env.END || staffVideo.duration);
const CRF = process.env.CRF || '18';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// ---------------------------------------------------------------- 音声
async function makeAudio() {
  const customBgm = ['mp3', 'wav', 'm4a', 'ogg', 'flac'].map((e) => `audio/bgm.${e}`).find((f) => fs.existsSync(f));
  const { page, close } = await openApp({ pagePath: '/audio.html', globalName: '__audio' });
  console.log(customBgm ? `custom BGM: ${customBgm}` : 'BGM: 内蔵の自作曲を合成');
  const r = await page.evaluate((noBgm) => window.__audio.render({ noBgm }), !!customBgm);
  await close();
  const pcm = Buffer.from(r.base64, 'base64');
  const raw = WAV.replace(/\.wav$/, '.pcm');
  fs.writeFileSync(raw, pcm);
  execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(r.sampleRate), '-ac', '2', '-i', raw, WAV]);
  fs.rmSync(raw);
  console.log(`audio: ${r.samples / r.sampleRate}s  peak(before normalize)=${r.peak.toFixed(2)}`);
  return customBgm;
}

// ---------------------------------------------------------------- 映像
async function makeVideo() {
  const { page, info, errors, close } = await openApp({ pagePath: '/staff.html', globalName: '__staff', width: video.width, height: video.height });
  console.log(`rendering ${video.width}x${video.height} @${FPS}fps  t=${START}..${END}s`);
  const ff = spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(FPS), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', SILENT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))));
  const cdp = await page.context().newCDPSession(page);
  const n = Math.round((END - START) * FPS);
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const t = START + i / FPS;
    await page.evaluate((tt) => window.__staff.setTime(tt), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, fromSurface: true });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 90 === 0 || i === n - 1) {
      const el = (Date.now() - t0) / 1000;
      console.log(`frame ${i + 1}/${n}  t=${t.toFixed(2)}s  elapsed ${el.toFixed(0)}s  eta ${((el / (i + 1)) * (n - i - 1)).toFixed(0)}s`);
    }
  }
  ff.stdin.end();
  await done;
  if (errors.length) console.log('page errors:', errors);
  await close();
}

// ---------------------------------------------------------------- 合成
function mux(customBgm) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', SILENT, '-i', WAV];
  let filter = '[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]';
  if (customBgm) {
    args.push('-stream_loop', '-1', '-i', customBgm);
    // 外部 BGM は公演中（生演奏）の間は消し、他は小さめに重ねる。曲が短ければループする
    filter = `[2:a]atrim=0:${staffVideo.duration},volume=0.55,volume=enable='between(t,58,79)':volume=0,afade=t=in:st=0:d=1,afade=t=out:st=${staffVideo.duration - 2}:d=2[b];[1:a][b]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
  }
  args.push('-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT);
  execFileSync(FFMPEG, args);
  console.log('wrote', OUT);
}

let custom = null;
if (!process.env.SKIP_AUDIO) custom = await makeAudio();
else if (fs.existsSync(WAV)) custom = null;
if (!process.env.AUDIO_ONLY) {
  if (!process.env.SKIP_VIDEO) await makeVideo();
  mux(custom);
}
