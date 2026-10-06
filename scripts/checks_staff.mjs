// 運営スタッフ動画の検証フレームを書き出す： `npm run checks:staff`  → dist/staff/checks/*.png
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from './lib/browser.mjs';

const outDir = path.resolve('dist/staff/checks');
fs.mkdirSync(outDir, { recursive: true });
const times = (process.env.TIMES || '0,3,7,11,15,18,21,23,27,29,31,33,36,38,44,50,55,60,64,68,71,75,79,83,86,89,92,95,98,100,104,107,111,114,118,123')
  .split(',')
  .map(Number);
const { page, info, errors, close } = await openApp({ pagePath: '/staff.html', globalName: '__staff' });
console.log('info', JSON.stringify({ duration: info.duration, fps: info.fps, chairTotal: info.chairTotal }));
for (const t of times) {
  const s = await page.evaluate((tt) => window.__staff.setTime(tt), t);
  await page.screenshot({ path: path.join(outDir, `t${String(t).padStart(5, '0')}.png`), type: 'png' });
  console.log(`saved t=${t}  ${s.scene}  ${s.chip}  ${s.step}`);
}
if (errors.length) console.log('page errors:', errors);
await close();
