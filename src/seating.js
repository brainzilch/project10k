// 椅子300脚の配置計算（Three.js に依存しない純粋な計算。Node のテストからも使う）
import { chairs as chairCfg, performance } from './config.js';

const DEG = Math.PI / 180;

/**
 * 椅子の配置を返す。椅子は演奏位置を向く。
 *
 * layout === 'pitch'（既定）:
 *   各列 i の半径は r0 + rowPitch*i。列ごとの脚数は rowsPerSector[i]（A・B・C 共通）。
 *   席中心間隔は seatPitch で一定（弦の長さ）。B は中心角 0 に左右対称、A と C はその外側に並べ、
 *   セクター間の通路は有効幅 aisleWidth（椅子の端から端）で一定。
 * layout === 'angular'（旧方式）:
 *   各セクターの角度範囲 lo〜hi を列ごとに等分し、j 番目を lo+(hi-lo)*(j+0.5)/脚数 に置く。
 *
 * @returns {{sector:string,row:number,index:number,x:number,z:number,angleDeg:number,rotY:number,r:number}[]}
 */
export function buildSeating(cfg = chairCfg, center = performance.center) {
  const list = [];
  const push = (sector, row, index, r, aRad) => {
    const x = center.x + r * Math.cos(aRad);
    const z = center.z + r * Math.sin(aRad);
    // 椅子の正面（モデルの +z）が演奏位置を向く
    const rotY = Math.atan2(center.x - x, center.z - z);
    list.push({ sector, row, index, x, z, angleDeg: aRad / DEG, rotY, r });
  };

  if (cfg.layout === 'angular') {
    for (const sector of cfg.order) {
      const { lo, hi } = cfg.sectors[sector];
      cfg.rowsPerSector.forEach((count, i) => {
        const r = cfg.r0 + cfg.rowPitch * i;
        for (let j = 0; j < count; j++) push(sector, i, j, r, (lo + ((hi - lo) * (j + 0.5)) / count) * DEG);
      });
    }
    return list;
  }

  // ---- pitch 方式 ----
  const sign = { A: -1, B: 0, C: 1 };
  for (const sector of cfg.order) {
    cfg.rowsPerSector.forEach((n, i) => {
      const r = cfg.r0 + cfg.rowPitch * i;
      const step = 2 * Math.asin(cfg.seatPitch / (2 * r)); // 隣の椅子との中心間隔が seatPitch になる角度
      const gap = 2 * Math.asin((cfg.aisleWidth + cfg.width) / (2 * r)); // 通路をはさむ椅子の中心どうしの角度
      const centerAngle = sign[sector] * ((n - 1) * step + gap);
      for (let j = 0; j < n; j++) push(sector, i, j, r, centerAngle + (j - (n - 1) / 2) * step);
    });
  }
  return list;
}

/** A/B/C 各100脚・合計300脚、席の間隔、通路を検証。 */
export function verifySeating(list, cfg = chairCfg) {
  const counts = {};
  for (const c of list) counts[c.sector] = (counts[c.sector] || 0) + 1;
  const total = list.length;
  const problems = [];
  for (const s of cfg.order) {
    if (counts[s] !== 100) problems.push(`sector ${s}: ${counts[s]} (expected 100)`);
  }
  if (total !== 300) problems.push(`total ${total} (expected 300)`);

  // 同じ列で隣り合う椅子の中心間隔
  let minPitch = Infinity;
  let maxPitch = 0;
  for (const s of cfg.order) {
    cfg.rowsPerSector.forEach((_, i) => {
      const row = list.filter((c) => c.sector === s && c.row === i);
      for (let j = 1; j < row.length; j++) {
        const d = Math.hypot(row[j].x - row[j - 1].x, row[j].z - row[j - 1].z);
        minPitch = Math.min(minPitch, d);
        maxPitch = Math.max(maxPitch, d);
      }
    });
  }

  // 通路：隣り合うセクターの端どうしの有効幅（椅子の幅を引く）。列ごとの最小値
  const aisleClear = [];
  const pairs = [
    ['A', 'B'],
    ['B', 'C'],
  ];
  for (const [a, b] of pairs) {
    let minClear = Infinity;
    cfg.rowsPerSector.forEach((_, i) => {
      const ra = list.filter((c) => c.sector === a && c.row === i);
      const rb = list.filter((c) => c.sector === b && c.row === i);
      // a は角度の小さい側。a の最後の椅子と b の最初の椅子
      const ea = ra.reduce((m, c) => (c.angleDeg > m.angleDeg ? c : m), ra[0]);
      const eb = rb.reduce((m, c) => (c.angleDeg < m.angleDeg ? c : m), rb[0]);
      const d = Math.hypot(ea.x - eb.x, ea.z - eb.z);
      minClear = Math.min(minClear, d - cfg.width);
    });
    aisleClear.push({ between: `${a}-${b}`, minClear_m: +minClear.toFixed(2) });
  }
  // セクターの間に椅子が割り込んでいないこと（A < B < C の角度順）
  cfg.rowsPerSector.forEach((_, i) => {
    const byS = Object.fromEntries(cfg.order.map((s) => [s, list.filter((c) => c.sector === s && c.row === i).map((c) => c.angleDeg)]));
    if (Math.max(...byS.A) >= Math.min(...byS.B) || Math.max(...byS.B) >= Math.min(...byS.C)) problems.push(`row ${i}: sectors overlap`);
  });
  if (cfg.layout === 'pitch') {
    for (const a of aisleClear) {
      if (a.minClear_m < cfg.aisleWidth - 0.02) problems.push(`aisle ${a.between}: clear ${a.minClear_m} m < ${cfg.aisleWidth} m`);
    }
  }
  return { ok: problems.length === 0, problems, counts, total, minPitch, maxPitch, aisleClear };
}

/** 各セクターの最前列で、角度の外側（セクターの端）にある椅子。スピーカーの位置決めに使う。 */
export function frontRowOuterChair(list, sector) {
  const row = list.filter((c) => c.sector === sector && c.row === 0);
  return row.reduce((m, c) => (Math.abs(c.angleDeg) > Math.abs(m.angleDeg) ? c : m), row[0]);
}

/**
 * 列ごと・セクターごとの円弧（椅子の並ぶ角度範囲）。床のテープの位置を決めるのに使う。
 * @returns {{row:number, r:number, arcs:{sector:string, lo:number, hi:number, count:number}[]}[]} 角度はラジアン
 */
export function seatRowArcs(list, cfg = chairCfg) {
  return cfg.rowsPerSector.map((_, i) => {
    const r = cfg.r0 + cfg.rowPitch * i;
    const half = Math.asin(cfg.seatPitch / (2 * r)); // 端の椅子の外側まで（席の間隔の半分）
    const arcs = cfg.order.map((s) => {
      const as = list.filter((c) => c.sector === s && c.row === i).map((c) => (c.angleDeg * Math.PI) / 180);
      return { sector: s, lo: Math.min(...as) - half, hi: Math.max(...as) + half, count: as.length };
    });
    return { row: i, r, arcs };
  });
}
