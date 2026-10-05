// 設営・撤去動画に音楽と効果音をつける： `npm run audio`
//  1) audio_setup.html で効果音と BGM を合成（audio/bgm.* があれば、BGM はそちらを使う）
//  2) 無音の映像（_silent.mp4）と合成して AAC の MP4 にする。映像は再描画しない（コピーのみ）
//  環境変数: OUT  FFMPEG  CHROMIUM_PATH
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { openApp } from './lib/browser.mjs';
import { video } from '../src/config.js';

const OUT = process.env.OUT || 'dist/ichimura_setup_teardown_3d.mp4';
const SILENT = OUT.replace(/\.mp4$/, '_silent.mp4');
const WAV = OUT.replace(/\.mp4$/, '.wav');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';

const hasAudio = (f) => execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).toString().trim() !== '';
// 直前の書き出し（無音）を _silent として保存。すでに音声つきなら、保存済みの _silent を使う
if (fs.existsSync(OUT) && !hasAudio(OUT)) fs.copyFileSync(OUT, SILENT);
if (!fs.existsSync(SILENT)) throw new Error(`無音の映像が見つかりません: ${SILENT}（先に npm run render）`);

const customBgm = ['mp3', 'wav', 'm4a', 'ogg', 'flac'].map((e) => `audio/bgm.${e}`).find((f) => fs.existsSync(f));
const { page, close } = await openApp({ pagePath: '/audio_setup.html', globalName: '__audio' });
console.log(customBgm ? `custom BGM: ${customBgm}` : 'BGM: 内蔵の自作曲を合成');
const r = await page.evaluate((noBgm) => window.__audio.render({ noBgm }), !!customBgm);
await close();
const raw = WAV.replace(/\.wav$/, '.pcm');
fs.writeFileSync(raw, Buffer.from(r.base64, 'base64'));
execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(r.sampleRate), '-ac', '2', '-i', raw, WAV]);
fs.rmSync(raw);
console.log(`audio: ${(r.samples / r.sampleRate).toFixed(1)}s  peak(before normalize)=${r.peak.toFixed(2)}`);

const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', SILENT, '-i', WAV];
let filter = '[1:a]loudnorm=I=-16:TP=-2:LRA=11,alimiter=limit=0.89[a]';
if (customBgm) {
  args.push('-stream_loop', '-1', '-i', customBgm);
  filter = `[2:a]atrim=0:${video.duration},volume=0.55,afade=t=in:st=0:d=1,afade=t=out:st=${video.duration - 2}:d=2[b];[1:a][b]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-2:LRA=11,alimiter=limit=0.89[a]`;
}
args.push('-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-ar', '48000', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT);
execFileSync(FFMPEG, args);
console.log('wrote', OUT);
