// 運営スタッフ注意喚起動画の MP4 検証： `npm run verify:staff [file]`
//  映像 1920x1080 / 30fps / h264 / 約90秒、音声 aac ステレオ が入っていることを確認する。
import { execFileSync } from 'node:child_process';
import { video } from '../src/config.js';
import { staffVideo } from '../src/staff/staffConfig.js';

const file = process.argv[2] || 'dist/staff/ichimura_staff_notice_3d.mp4';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const j = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,channels,sample_rate,duration', '-show_entries', 'format=duration,size', '-of', 'json', file]).toString());
const v = j.streams.find((s) => s.codec_type === 'video');
const a = j.streams.find((s) => s.codec_type === 'audio');
const [n, d] = v.r_frame_rate.split('/').map(Number);
const report = {
  file,
  video: { codec: v.codec_name, width: v.width, height: v.height, fps: n / d, frames: Number(v.nb_frames) },
  audio: a ? { codec: a.codec_name, channels: a.channels, sampleRate: Number(a.sample_rate) } : null,
  duration_s: +Number(j.format.duration).toFixed(3),
  size_MB: +(Number(j.format.size) / 1e6).toFixed(1),
};
console.log(JSON.stringify(report, null, 2));
const ok = v.width === video.width && v.height === video.height && Math.abs(n / d - video.fps) < 0.01 && v.codec_name === 'h264' && !!a && a.codec_name === 'aac' && Math.abs(Number(j.format.duration) - staffVideo.duration) < 0.5;
console.log(ok ? 'STAFF VIDEO CHECK OK' : 'STAFF VIDEO CHECK FAILED');
process.exit(ok ? 0 : 1);
