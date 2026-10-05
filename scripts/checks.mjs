// 検証用フレームを書き出す： `npm run checks`
// 0秒、折り返し途中、椅子150脚、完成、撤去後、真上視点、斜め俯瞰 などを dist/checks/ に PNG 保存
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from './lib/browser.mjs';
import { timeline as T, sheetTiming, sheet as sheetCfg, seatMarking } from '../src/config.js';

const outDir = path.resolve('dist/checks');
fs.mkdirSync(outDir, { recursive: true });

const bandDur = (T.s3[1] - T.s3[0]) / sheetCfg.bands.length;
const secDur = (T.s4chairs[1] - T.s4chairs[0]) / 3;
const tp = seatMarking.timing;
const tC1 = T.s4tape[0] + tp.center;
const tS1 = tC1 + tp.slowRow;
const frames = [
  { name: '00_t0_intro', t: 0 },
  { name: '01_sheets_out', t: T.s1[0] + 3.2 },
  { name: '02_photo', t: T.s2[0] + 1.9 },
  { name: '02b_exhibit_move', t: T.s2[0] + 7.5 },
  { name: '03_band1_unroll_top', t: T.s3[0] + bandDur * 0.35 },
  { name: '03b_band1_fold_close', t: T.s3[0] + bandDur * (sheetTiming.unrollFrac + sheetTiming.foldFrac * 0.5) },
  { name: '03c_band3_unroll_top', t: T.s3[0] + bandDur * 2.4 },
  { name: '03d_all_folded_top', t: T.s3[1] - 0.2 },
  { name: '03e_tape_center', t: T.s4tape[0] + 1.0 },
  { name: '03f_tape_row1', t: tC1 + tp.slowRow * 0.55 },
  { name: '03g_tape_fast', t: tS1 + tp.fastRows * 0.5 },
  { name: '03h_tape_done_top', t: T.s4tape[1] - 0.2 },
  { name: '04_chairs_150', t: T.s4chairs[0] + secDur * 1.5 },
  { name: '04b_chairs_300', t: T.s4chairs[1] - 0.1 },
  { name: '05_piano_move', t: T.s5[0] + 4.0 },
  { name: '06_complete', t: T.complete[0] + 2 },
  { name: '07_td_piano', t: T.t1[0] + 1.5 },
  { name: '08_td_chairs', t: T.t2chairs[0] + 1.5 },
  { name: '08b_td_tape_peel', t: T.t2tape[0] + 1.5 },
  { name: '09_td_sheets_top', t: T.t3[0] + 1.6 },
  { name: '10_td_exhibits_restore', t: T.t4[1] - 0.3 },
  { name: '11_after_teardown', t: T.t5[1] - 0.05 },
  { name: '12_complete_top', t: T.complete[0] + 1, mode: 'top' },
  { name: '13_complete_overview', t: T.complete[0] + 1, mode: 'overview' },
];

const { page, info, errors, close } = await openApp();
console.log('app info:', JSON.stringify({ duration: info.duration, fps: info.fps, chairCounts: info.chairCounts, chairTotal: info.chairTotal }));
console.log('band rects (m):');
for (const r of info.bandRects) console.log(`  band ${r.id} ${r.name}: x ${r.xLeft.toFixed(2)}..${r.xRight.toFixed(2)}  z ${r.zMin.toFixed(2)}..${r.zMax.toFixed(2)}  laid ${r.laidLength.toFixed(2)} m + fold ${r.foldLength} m`);
const report = [];
for (const f of frames) {
  const s = await page.evaluate(([t, mode]) => window.__anim.setTime(t, mode), [f.t, f.mode || 'auto']);
  const file = path.join(outDir, `${f.name}.png`);
  await page.screenshot({ path: file, type: 'png' });
  report.push({ name: f.name, t: f.t, chairs: s.chairCount, chip: s.hud.chip, step: s.hud.step });
  console.log(`saved ${f.name}  t=${f.t.toFixed(2)}  chairs=${s.chairCount.total} (A${s.chairCount.A} B${s.chairCount.B} C${s.chairCount.C})  ${s.hud.chip} ${s.hud.step}`);
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (errors.length) console.log('page errors:', errors);
await close();
