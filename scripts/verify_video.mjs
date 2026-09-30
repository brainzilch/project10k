// 最終 MP4 の解像度・fps・長さ・コーデックを ffprobe で検証： `npm run verify:video`
import { execFileSync } from 'node:child_process';
import { video } from '../src/config.js';

const file = process.argv[2] || 'dist/ichimura_setup_teardown_3d.mp4';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const out = execFileSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,codec_name,nb_frames,duration', '-show_entries', 'format=duration,size', '-of', 'json', file]).toString();
const j = JSON.parse(out);
const s = j.streams[0];
const [n, d] = s.r_frame_rate.split('/').map(Number);
const fps = n / d;
const duration = Number(j.format.duration);
const report = {
  file,
  width: s.width,
  height: s.height,
  fps,
  codec: s.codec_name,
  frames: Number(s.nb_frames),
  duration_s: +duration.toFixed(3),
  size_MB: +(Number(j.format.size) / 1e6).toFixed(1),
  expected: { width: video.width, height: video.height, fps: video.fps, duration: video.duration },
};
console.log(JSON.stringify(report, null, 2));
const ok = s.width === video.width && s.height === video.height && Math.abs(fps - video.fps) < 0.01 && s.codec_name === 'h264' && Math.abs(duration - video.duration) < 0.5;
console.log(ok ? 'VIDEO CHECK OK' : 'VIDEO CHECK FAILED');
process.exit(ok ? 0 : 1);
