// ポスター画像（全体配置の静止画）を書き出す： `node scripts/poster.mjs`
import fs from 'node:fs';
import path from 'node:path';
import { openApp } from './lib/browser.mjs';
import { timeline as T } from '../src/config.js';

const OUT = process.env.OUT || 'dist/poster.png';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const { page, close } = await openApp();
await page.evaluate((t) => window.__anim.setTime(t, 'overview'), T.complete[0] + 1);
// ポスター用のタイトルに差し替える
await page.evaluate(() => {
  document.getElementById('hud-chip').textContent = '完成配置';
  document.getElementById('hud-chip').className = 'chip info';
  document.getElementById('hud-step').textContent = '市村記念体育館 コンサート設営・撤去 3Dアニメーション';
  document.getElementById('hud-sub').textContent =
    '養生シート4帯（1→2→3→4、右→左、余長は折り返し）／パイプ椅子300脚（A・B・C各100脚・14列・通路2本、旧案より約2 m後ろ）／ピアノとコントラバス等は演奏位置（赤丸）。スピーカー・音響卓・寸法・収納庫・経路は仮値。';
  document.getElementById('hud-sub').className = 'info';
  document.getElementById('hud-progress').style.display = 'none';
});
await page.screenshot({ path: OUT, type: 'png' });
await close();
console.log('wrote', OUT);
