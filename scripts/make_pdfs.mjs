// 新しい客席配置（14列・約2 m後ろ・PA）で、PDF資料2点を作り直す。 `npm run pdf`
//   dist/pdf/setup_teardown_guide.pdf  … スタッフ用の設営・撤去手順書（3ページ）
//   dist/pdf/seating_300_detail.pdf    … A/B/C 各100脚の詳細図（2ページ）
// 客席・PA・音響卓の位置は src/config.js と src/seating.js から計算（動画と同じ数値）。
// 背景は reference/floorplan_color.png（着色した平面図）。作図座標との対応は、床（橙）の範囲 x 1320–2396, y 764–1892 から求めた。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildSeating, verifySeating, frontRowOuterChair } from '../src/seating.js';
import { chairs as C, venue, pa, performance } from '../src/config.js';

const root = path.resolve('.');
const out = path.resolve('dist/pdf');
fs.mkdirSync(out, { recursive: true });
const b64 = (f) => fs.readFileSync(path.join(root, 'reference', f)).toString('base64');
const planImg = `data:image/png;base64,${b64('floorplan_color.png')}`;
const sheetImg = `data:image/png;base64,${b64('sheet_layout_clean.png')}`;

const list = buildSeating();
const ver = verifySeating(list);
const rows = C.rowsPerSector.length;
const rad = (i) => C.r0 + C.rowPitch * i;

// ---- 作図 -----------------------------------------------------------------
const PX = 31.8; // 画像 4000px 幅での 1 m あたりのピクセル
const OX = 1536.5;
const OY = 1330;
const speakers = pa.speakers.map((sp) => {
  const e = frontRowOuterChair(list, sp.sector);
  const a = (e.angleDeg * Math.PI) / 180;
  const r = C.r0 - pa.speakerFront;
  return { id: sp.sector, x: r * Math.cos(a), z: r * Math.sin(a), rotDeg: e.angleDeg };
});

function chairPoly(c) {
  const fx = Math.sin(c.rotY);
  const fz = Math.cos(c.rotY);
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]]
    .map(([a, b]) => `${(c.x + a * (C.width / 2) * fz + b * (C.depth / 2) * fx).toFixed(3)},${(c.z - a * (C.width / 2) * fx + b * (C.depth / 2) * fz).toFixed(3)}`)
    .join(' ');
}

/** 平面図つきの客席図（メートル座標で描き、画像座標に変換）。opts.detail で寸法・列番号を足す。 */
function planSvg({ detail = false, w = 1000, h = 800 } = {}) {
  const x0 = -9.2;
  const x1 = 27.4;
  const z0 = -18.4;
  const z1 = 18.4;
  const vx = OX + x0 * PX;
  const vy = OY + z0 * PX;
  const vw = (x1 - x0) * PX;
  const vh = (z1 - z0) * PX;
  const colour = { A: '#9a4a5c', B: '#9a4a5c', C: '#9a4a5c' };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" width="${w}" height="${h}" style="display:block;background:#fff">`;
  s += `<image href="${planImg}" x="0" y="0" width="4000" height="2827"/>`;
  s += `<g transform="translate(${OX} ${OY}) scale(${PX})" font-family="IPAGothic, IPAPGothic, sans-serif">`;
  // 椅子
  for (const c of list) s += `<polygon points="${chairPoly(c)}" fill="${colour[c.sector]}" stroke="#4a1a28" stroke-width="0.025"/>`;
  // 演奏位置（赤丸）とピアノ
  s += `<circle cx="0" cy="0" r="2.4" fill="#fff7e6" stroke="#8c2f43" stroke-width="0.12" fill-opacity="0.9"/>`;
  s += `<ellipse cx="-0.2" cy="0.1" rx="1.0" ry="0.8" fill="#222" transform="rotate(20)"/>`;
  s += `<ellipse cx="1.2" cy="0.3" rx="0.28" ry="0.42" fill="#a8602a"/>`;
  // スピーカー（各ブロックの最前列の外端の前）
  for (const sp of speakers) {
    s += `<g transform="translate(${sp.x} ${sp.z}) rotate(${sp.rotDeg})"><rect x="-0.3" y="-0.45" width="0.6" height="0.9" fill="#111"/><rect x="-0.3" y="-0.45" width="0.18" height="0.9" fill="#e8a317"/></g>`;
    s += `<text x="${sp.x - 0.1}" y="${sp.z + (sp.z < 0 ? -1.0 : 1.5)}" font-size="0.85" font-weight="bold" text-anchor="middle" fill="#111" stroke="#fff" stroke-width="0.18" paint-order="stroke">SP-${sp.id}</text>`;
  }
  // 音響卓
  s += `<rect x="${pa.desk.x - 0.9}" y="${pa.desk.z - 0.5}" width="1.8" height="1.0" fill="#2a4a8a" stroke="#fff" stroke-width="0.06"/>`;
  s += `<text x="${pa.desk.x + 1.2}" y="${pa.desk.z + 0.3}" font-size="0.85" font-weight="bold" fill="#123" stroke="#fff" stroke-width="0.18" paint-order="stroke">音響卓</text>`;
  // ブロック名
  const lab = (t, x, z) =>
    `<circle cx="${x}" cy="${z}" r="0.95" fill="#fff" stroke="#8c2f43" stroke-width="0.12"/><text x="${x}" y="${z + 0.4}" font-size="1.25" font-weight="bold" text-anchor="middle" fill="#6a1f2f">${t}</text>`;
  s += lab('A', 11.5, -10.9) + lab('B', 20.9, 0) + lab('C', 11.5, 10.9);
  if (detail) {
    // 最前列・最後列の円弧（破線）と凡例
    for (const i of [0, rows - 1]) {
      const r = rad(i);
      s += `<path d="M ${r * Math.cos(-0.62)} ${r * Math.sin(-0.62)} A ${r} ${r} 0 0 1 ${r * Math.cos(0.62)} ${r * Math.sin(0.62)}" fill="none" stroke="#0d6f82" stroke-width="0.09" stroke-dasharray="0.3 0.22"/>`;
    }
    s += `<rect x="-3.5" y="12.2" width="13.2" height="3.6" fill="#fff" fill-opacity="0.92" stroke="#0d6f82" stroke-width="0.06"/><text x="-3.2" y="13.5" font-size="0.85" fill="#0d4f5f">青い破線：演奏中心を中心にした円弧</text><text x="-3.2" y="14.5" font-size="0.85" fill="#0d4f5f">1列目 ${rad(0).toFixed(2)} m ／ ${rows}列目 ${rad(rows - 1).toFixed(2)} m</text><text x="-3.2" y="15.4" font-size="0.85" fill="#0d4f5f">（各列は 0.9 m ずつ後ろ）</text>`;
    s += `<line x1="0" y1="0" x2="${rad(rows - 1) + 0.6}" y2="0" stroke="#2a6f7f" stroke-width="0.07"/>`;
    s += `<line x1="0" y1="0.9" x2="${C.r0}" y2="0.9" stroke="#e8a317" stroke-width="0.1"/><text x="${C.r0 / 2}" y="1.9" font-size="0.85" text-anchor="middle" fill="#7a4e00" stroke="#fff" stroke-width="0.16" paint-order="stroke">最前列まで ${C.r0.toFixed(2)} m</text>`;
  }
  s += `</g></svg>`;
  return s;
}

// ---- 共通のスタイル -----------------------------------------------------------
const css = `
@page { size: A4 landscape; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: IPAPGothic, IPAGothic, sans-serif; color: #26343f }
.page { width: 297mm; height: 210mm; position: relative; overflow: hidden; page-break-after: always; background: #fff }
.head { background: #26343f; color: #fff; height: 26mm; padding: 6mm 14mm 0 14mm; border-left: 5mm solid #3aa7b5 }
.head h1 { margin: 0; font-size: 22pt; font-weight: normal }
.head p { margin: 2mm 0 0; font-size: 10.5pt; color: #dfe8ee }
.foot { position: absolute; left: 12mm; right: 12mm; bottom: 6mm; border-top: 1px solid #ddd; padding-top: 2mm; font-size: 8pt; color: #666; display: flex; justify-content: space-between }
.cols { display: flex; gap: 10mm; padding: 6mm 12mm 0 12mm }
.col { flex: 1 }
.colh { color: #fff; padding: 2.5mm 4mm; border-radius: 3mm; font-size: 11pt; margin-bottom: 3mm }
.set .colh { background: #0b6e7f } .tear .colh { background: #9a5060 }
.step { border: 1px solid #ccd; border-radius: 3mm; height: 23mm; margin-bottom: 2.2mm; padding: 3mm 4mm 0 4mm; position: relative; display: flex; gap: 4mm }
.num { flex: 0 0 11mm; height: 11mm; border-radius: 50%; text-align: center; line-height: 11mm; font-size: 14pt; margin-top: 3mm }
.set .num { background: #e3f1f3; color: #0b6e7f } .tear .num { background: #f6e8eb; color: #9a5060 }
.step h3 { margin: 0 0 1.5mm; font-size: 13pt; font-weight: normal }
.step p { margin: 0; font-size: 8.8pt; color: #46525c; line-height: 1.5 }
.box { position: absolute; right: 4mm; top: 3mm; width: 4mm; height: 4mm; border: 1.4px solid }
.set .box { border-color: #0b6e7f } .tear .box { border-color: #9a5060 }
.common { margin: 2mm 12mm 0; background: #f3f6f6; border-radius: 3mm; padding: 4mm 5mm; font-size: 9.5pt }
.common b { color: #0b6e7f; margin-right: 8mm; font-weight: normal }
.common .sign { margin-top: 4mm; font-size: 8.5pt; color: #555 }
.side { position: absolute; right: 12mm; top: 33mm; width: 78mm; background: #f3f6f6; border-radius: 4mm; padding: 5mm 6mm; font-size: 9.5pt; line-height: 1.55; height: 158mm }
.side h4 { margin: 0 0 2mm; font-weight: normal; font-size: 10.5pt }
.side hr { border: 0; border-top: 1px solid #d5dcdc; margin: 3mm 0 }
.pill { display: inline-block; width: 6mm; height: 6mm; border-radius: 50%; background: #9a4a5c; color: #fff; text-align: center; font-size: 8pt; line-height: 6mm; margin-right: 3mm }
.big { font-size: 15pt; color: #9a4a5c; margin: 2mm 0 }
.tag { color: #0b6e7f; font-size: 9.5pt }
.change { background: #fff6dc; border-left: 1.2mm solid #e8a317; padding: 2mm 3mm; font-size: 8.8pt; margin: 3mm 0 }
table { border-collapse: collapse; font-size: 9.5pt }
th, td { border: 1px solid #c8d0d4; padding: 1.4mm 3mm; text-align: center }
th { background: #26343f; color: #fff; font-weight: normal }
tr.tot td { background: #f3e6e9; font-weight: bold }
`;

const head = (t, sub) => `<div class="head"><h1>${t}</h1><p>${sub}</p></div>`;
const foot = (n, m) => `<div class="foot"><span>市村記念体育館 | コンサート設営・撤去</span><span>${n} / ${m}</span></div>`;

const set = [
  ['養生シートを出す', '収納庫から養生シートを取り出す。'],
  ['展示物を撮影して収納', '体育館中央の展示物の位置・向きを撮影。<br>撮影後、展示物を収納庫へ移動する。'],
  ['養生シートを配置', '図の 1 → 2 → 3 → 4 の順に敷く。<br>各帯は ← 方向。余った長さは折り返す。'],
  ['椅子300脚を設置', '折り畳みパイプ椅子を客席図に沿って配置。<br>A・B・C 各100脚、合計300脚（14列）。'],
  ['ピアノを定位置へ', '収納庫から演奏位置へ移動する。'],
];
const tear = [
  ['ピアノを収納庫へ', '演奏位置から収納庫へ戻す。'],
  ['椅子300脚を撤去', '全300脚を回収し、客席を空にする。'],
  ['養生シートを撤去', '4 → 3 → 2 → 1 の順に回収・まとめる。'],
  ['展示物を元の位置へ', '収納庫から体育館中央へ戻す。<br>設営前の写真と見比べて配置を復旧。'],
  ['養生シートを収納庫へ', 'まとめたシートを収納庫へ戻す。'],
];
const steps = (arr) => arr.map(([t, d], i) => `<div class="step"><div class="num">${i + 1}</div><div><h3>${t}</h3><p>${d}</p></div><div class="box"></div></div>`).join('');

const seatSide = `
<div class="side">
  <h4>座席数</h4>
  <div><span class="pill">A</span>100脚</div><div style="margin-top:2mm"><span class="pill">B</span>100脚</div><div style="margin-top:2mm"><span class="pill">C</span>100脚</div>
  <div class="big">合計 300脚（${rows}列）</div>
  <hr>
  <div>椅子の寸法　幅${C.width * 1000} × 奥行${C.depth * 1000} mm</div>
  <div>列間隔 ${C.rowPitch * 1000} mm　席中心間隔 約${Math.round(C.seatPitch * 1000)} mm</div>
  <div>客席間の通路 2か所（有効幅 ${C.aisleClearMin} m 以上）</div>
  <div>最前列は演奏中心から ${C.r0.toFixed(2)} m</div>
  <div class="change">音響担当の要望で変更：客席を約2 m後ろへ、幅を狭く縦に長く（8列→${rows}列）。スピーカーを各ブロックの最前列の外端の前に置く。</div>
  <div class="tag">現地確認</div>
  <div style="font-size:9pt">スピーカー設置後に最前列を調整。通路と機材の移動経路、ケーブルが通路を横切らないことを確認してから最終配置。</div>
</div>`;

const page1 = `
<div class="page">${head('コンサート設営・撤去 作業手順', '上から順に実施。各工程の完了時に右上の□をチェックしてください。')}
 <div class="cols"><div class="col set"><div class="colh">設営 ｜ イベント前</div>${steps(set)}</div><div class="col tear"><div class="colh">撤去 ｜ イベント終了後</div>${steps(tear)}</div></div>
 <div class="common"><b>共通確認</b>土足での作業は養生完了後。展示物の原状復帰には移動前の写真を使う。<div class="sign">作業日：____________________　　責任者：____________________　　写真の保管先：____________________</div></div>
 ${foot(1, 3)}</div>`;

const page2 = `
<div class="page">${head('養生シートの配置順', '番号・矢印・折り返しの指示を確認してから作業してください。')}
 <div style="position:absolute;left:12mm;top:32mm;width:196mm;height:160mm;border:1px solid #ccd;display:flex;align-items:center;justify-content:center"><img src="${sheetImg}" style="max-width:100%;max-height:100%"></div>
 <div class="side" style="width:68mm;font-size:11pt;line-height:1.8"><h4>設営　1 → 2 → 3 → 4</h4><h4>撤去　4 → 3 → 2 → 1</h4><hr>各帯は右から左へ。敷き終わりで余った長さを折り返します。</div>
 ${foot(2, 3)}</div>`;

const page3 = `
<div class="page">${head('椅子300脚の参考配置', '演奏位置を囲む配置（客席を約2 m後ろへ変更）。設営手順4で、この図を確認してください。')}
 <div style="position:absolute;left:12mm;top:32mm;width:197mm;height:158mm;border:1px solid #bbb">${planSvg({ w: 744, h: 597 }).replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>
 ${seatSide}
 ${foot(3, 3)}</div>`;

// ---- 詳細図 ---------------------------------------------------------------
const perRow = C.rowsPerSector;
const tableRows = perRow
  .map((n, i) => {
    const r = rad(i);
    const step = ((2 * Math.asin(C.seatPitch / (2 * r))) * 180) / Math.PI;
    return `<tr><td>${i + 1}</td><td>${r.toFixed(2)}</td><td>${n}</td><td>${n}</td><td>${n}</td><td>${n * 3}</td><td>${(C.seatPitch * 1000).toFixed(0)}</td></tr>`;
  })
  .join('');
const sumRow = perRow.reduce((a, b) => a + b, 0);
const d1 = `
<div class="page">${head('客席 A・B・C 各100脚 詳細図', `${rows}列・合計300脚。上＝上手（A）、下＝下手（C）、左＝ステージ。`)}
 <div style="position:absolute;left:12mm;top:32mm;width:197mm;height:158mm;border:1px solid #bbb">${planSvg({ detail: true, w: 744, h: 597 }).replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>
 <div class="side" style="font-size:9pt;line-height:1.6">
  <h4>寸法（仮・演奏中心から）</h4>
  <div>最前列 ${C.r0.toFixed(2)} m ／ 最後列 ${rad(rows - 1).toFixed(2)} m</div>
  <div>列間隔 ${C.rowPitch} m（${rows}列）</div>
  <div>席中心間隔 ${C.seatPitch} m（基準 ${C.seatPitchRange[0]}〜${C.seatPitchRange[1]} m）</div>
  <div>通路の有効幅 ${ver.aisleClear.map((a) => `${a.between} ${a.minClear_m} m`).join('、')}（椅子の四隅どうし）</div>
  <hr>
  <h4>音響機材（仮位置）</h4>
  <div>スピーカー：A・C 各1か所（Low×${pa.units.low}、Hi/Mid×${pa.units.himid}）。最前列の外端より ${pa.speakerFront} m ステージ側。</div>
  <div>音響卓：ステージ上手の横</div>
  <div>通路を横切るケーブルは作らない。最前列はスピーカー設置後に調整。</div>
  <hr>
  <div style="color:#7a4e00">寸法・機材位置は仮配置。現地で確認してから確定してください。</div>
 </div>
 ${foot(1, 2)}</div>`;

const d2 = `
<div class="page">${head('客席 列ごとの脚数', 'A・B・C は同じ脚数（各ブロックの列の中心を演奏位置に向ける）。')}
 <div style="position:absolute;left:14mm;top:34mm"><table><tr><th>列</th><th>演奏中心から (m)</th><th>A</th><th>B</th><th>C</th><th>列の合計</th><th>席中心間隔 (mm)</th></tr>${tableRows}<tr class="tot"><td colspan="2">合計</td><td>${sumRow}</td><td>${sumRow}</td><td>${sumRow}</td><td>${sumRow * 3}</td><td></td></tr></table></div>
 <div class="side" style="width:100mm;font-size:9.5pt">
  <h4>並べ方</h4>
  <div>1. 演奏位置の中心から ${C.r0.toFixed(2)} m を最前列とし、後ろへ ${C.rowPitch} m ずつ ${rows}列。</div>
  <div>2. Bは演奏位置の正面、左右対称に。AとCは通路をはさんで、Bの外側に。</div>
  <div>3. 椅子はすべて演奏位置を向ける。</div>
  <div>4. 通路は有効幅 ${C.aisleClearMin} m 以上を確保（巻き尺で、椅子の端から端を測る）。</div>
  <div>5. スピーカーと音響卓を置いたあと、最前列の位置を調整。</div>
  <hr>
  <div style="color:#7a4e00">床へのテープなどの目印は使わない前提です。</div>
 </div>
 ${foot(2, 2)}</div>`;

const html = (pages) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css}</style></head><body>${pages.join('')}</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [name, pages] of [['setup_teardown_guide', [page1, page2, page3]], ['seating_300_detail', [d1, d2]]]) {
  await page.setContent(html(pages), { waitUntil: 'load' });
  await page.pdf({ path: path.join(out, `${name}.pdf`), width: '297mm', height: '210mm', printBackground: true });
  console.log('wrote', `dist/pdf/${name}.pdf`);
}
await browser.close();
