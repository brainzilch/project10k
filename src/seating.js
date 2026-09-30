// 椅子300脚の配置計算（Three.js に依存しない純粋な計算。Node のテストからも使う）
import { chairs as chairCfg, performance } from './config.js';

const DEG = Math.PI / 180;

/**
 * 椅子の配置を返す。
 * 各セクター8列、列ごとの脚数 rowsPerSector、半径 r0 + rowPitch*i、
 * 角度 lo + (hi-lo)*(j+0.5)/count、椅子は演奏位置を向く。
 * @returns {{sector:string,row:number,index:number,x:number,z:number,angleDeg:number,rotY:number}[]}
 */
export function buildSeating(cfg = chairCfg, center = performance.center) {
  const list = [];
  for (const sector of cfg.order) {
    const { lo, hi } = cfg.sectors[sector];
    cfg.rowsPerSector.forEach((count, i) => {
      const r = cfg.r0 + cfg.rowPitch * i;
      for (let j = 0; j < count; j++) {
        const a = lo + ((hi - lo) * (j + 0.5)) / count;
        const x = center.x + r * Math.cos(a * DEG);
        const z = center.z + r * Math.sin(a * DEG);
        // 椅子の正面（モデルの +z）が演奏位置を向く
        const fx = center.x - x;
        const fz = center.z - z;
        const rotY = Math.atan2(fx, fz);
        list.push({ sector, row: i, index: j, x, z, angleDeg: a, rotY, r });
      }
    });
  }
  return list;
}

/** A/B/C 各100脚・合計300脚などを検証。失敗時は throw。 */
export function verifySeating(list, cfg = chairCfg) {
  const counts = {};
  for (const c of list) counts[c.sector] = (counts[c.sector] || 0) + 1;
  const total = list.length;
  const problems = [];
  for (const s of cfg.order) {
    if (counts[s] !== 100) problems.push(`sector ${s}: ${counts[s]} (expected 100)`);
  }
  if (total !== 300) problems.push(`total ${total} (expected 300)`);

  // 席中心間隔（同じ列の隣り合う椅子）の範囲を確認
  let minPitch = Infinity;
  let maxPitch = 0;
  for (const s of cfg.order) {
    cfg.rowsPerSector.forEach((count, i) => {
      const row = list.filter((c) => c.sector === s && c.row === i);
      for (let j = 1; j < row.length; j++) {
        const d = Math.hypot(row[j].x - row[j - 1].x, row[j].z - row[j - 1].z);
        minPitch = Math.min(minPitch, d);
        maxPitch = Math.max(maxPitch, d);
      }
    });
  }
  // 通路：セクター間に椅子が無いこと（角度の隙間）
  const aisles = [
    [cfg.sectors.A.hi, cfg.sectors.B.lo],
    [cfg.sectors.B.hi, cfg.sectors.C.lo],
  ];
  for (const [a0, a1] of aisles) {
    const inAisle = list.filter((c) => c.angleDeg > a0 && c.angleDeg < a1);
    if (inAisle.length) problems.push(`aisle ${a0}..${a1} has ${inAisle.length} chairs`);
  }
  return { ok: problems.length === 0, problems, counts, total, minPitch, maxPitch, aisles };
}
