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

  // 通路：隣り合うセクターの椅子の四隅どうしの最小距離（実際の有効幅）
  const cornersOf = (ch) => {
    const fx = Math.sin(ch.rotY);
    const fz = Math.cos(ch.rotY);
    const rx = fz;
    const rz = -fx;
    return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => ({ x: ch.x + a * (cfg.width / 2) * rx + b * (cfg.depth / 2) * fx, z: ch.z + a * (cfg.width / 2) * rz + b * (cfg.depth / 2) * fz }));
  };
  const aisleClear = [];
  for (const [a, b] of [['A', 'B'], ['B', 'C']]) {
    const pa = list.filter((c) => c.sector === a).flatMap(cornersOf);
    const pb = list.filter((c) => c.sector === b).flatMap(cornersOf);
    let mn = Infinity;
    for (const p of pa) for (const q of pb) mn = Math.min(mn, Math.hypot(p.x - q.x, p.z - q.z));
    aisleClear.push({ between: `${a}-${b}`, minClear_m: +mn.toFixed(2) });
  }
  // セクターの間に椅子が割り込んでいないこと（A < B < C の角度順）
  cfg.rowsPerSector.forEach((_, i) => {
    const byS = Object.fromEntries(cfg.order.map((s) => [s, list.filter((c) => c.sector === s && c.row === i).map((c) => c.angleDeg)]));
    if (Math.max(...byS.A) >= Math.min(...byS.B) || Math.max(...byS.B) >= Math.min(...byS.C)) problems.push(`row ${i}: sectors overlap`);
  });
  if (cfg.layout === 'pitch' && cfg.aisleClearMin) {
    for (const a of aisleClear) {
      if (a.minClear_m < cfg.aisleClearMin - 0.02) problems.push(`aisle ${a.between}: clear ${a.minClear_m} m < ${cfg.aisleClearMin} m`);
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
 * 各セクター（ゾーン）の外周：椅子すべての四隅を含む最小の台形（前の縁・後ろの縁は演奏位置を向く直線、
 * 左右の縁は、そのゾーンの端の椅子の外側をつなぐ直線）に margin を足した4つの角。
 * 角の順は 前の縁（小さい角度側 → 大きい角度側）→ 後ろの縁（大きい角度側 → 小さい角度側）。
 * 台形は「椅子の四隅がすべて内側」になるまで、左右の縁を外側へ広げて求める。
 * @returns {{sector:string, corners:{x:number,z:number}[]}[]}
 */
export function seatZones(list, cfg = chairCfg, margin = 0.12) {
  return cfg.order.map((s) => {
    const mine = list.filter((c) => c.sector === s);
    const last = cfg.rowsPerSector.length - 1;
    const cornersOf = (ch) => {
      const fx = Math.sin(ch.rotY);
      const fz = Math.cos(ch.rotY);
      const rx = fz;
      const rz = -fx;
      const out = [];
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) out.push({ x: ch.x + a * (cfg.width / 2) * rx + b * (cfg.depth / 2) * fx, z: ch.z + a * (cfg.width / 2) * rz + b * (cfg.depth / 2) * fz });
    return out;
    };
    const pts = mine.flatMap(cornersOf);
    // 角度（演奏位置から見た）と半径の範囲
    const ang = (p) => Math.atan2(p.z, p.x);
    const rad = (p) => Math.hypot(p.x, p.z);
    const rMin = Math.min(...pts.map(rad)) - margin;
    const rMax = Math.max(...pts.map(rad)) + margin;
    // 左右の縁：演奏位置を通らない直線。前の縁と後ろの縁の 2 点（最前列と最後列の端）を結ぶ。
    // 端の椅子の外側の四隅だけから、直線の位置（法線方向の最大張り出し）を求める。
    const sideLine = (sign) => {
      const fr = mine.filter((c) => c.row === 0);
      const bk = mine.filter((c) => c.row === last);
      const pick = (arr) => arr.reduce((m, c) => (sign * c.angleDeg > sign * m.angleDeg ? c : m), arr[0]);
      const a = pick(fr);
      const b = pick(bk);
      // 外側の2つの四隅（その椅子で角度がもっとも外側のもの）
      const outer = (c) => cornersOf(c).sort((p, q) => sign * (ang(q) - ang(p)))[0];
      return { p: outer(a), q: outer(b) };
    };
    const L = sideLine(-1);
    const R = sideLine(+1);
    // 直線 pq を外側へ margin だけ平行移動し、すべての四隅が内側になるように広げる
    const shift = (ln, sign) => {
      const dx = ln.q.x - ln.p.x;
      const dz = ln.q.z - ln.p.z;
      const len = Math.hypot(dx, dz);
      let nx = -dz / len;
      let nz = dx / len;
      // 外向き（そのゾーンの角度の外側）にそろえる
      const mid = { x: (ln.p.x + ln.q.x) / 2, z: (ln.p.z + ln.q.z) / 2 };
      if (sign * (nx * -mid.z + nz * mid.x) < 0) {
        nx = -nx;
        nz = -nz;
      }
      let off = margin;
      // すべての四隅が、直線の内側になるまで外へ
      for (const pt of pts) {
        const d = (pt.x - ln.p.x) * nx + (pt.z - ln.p.z) * nz; // 外向きの距離
        off = Math.max(off, d + margin);
      }
      return { p: { x: ln.p.x + nx * off, z: ln.p.z + nz * off }, q: { x: ln.q.x + nx * off, z: ln.q.z + nz * off } };
    };
    const Ls = shift(L, -1);
    const Rs = shift(R, +1);
    // 前の縁（半径 rMin の弦）・後ろの縁（半径 rMax の弦）との交点を角にする
    const hit = (ln, r) => {
      // 直線 ln と、中心から半径 r の円との交点（外側のほう）
      const dx = ln.q.x - ln.p.x;
      const dz = ln.q.z - ln.p.z;
      const a = dx * dx + dz * dz;
      const b = 2 * (ln.p.x * dx + ln.p.z * dz);
      const c = ln.p.x * ln.p.x + ln.p.z * ln.p.z - r * r;
      const disc = Math.max(0, b * b - 4 * a * c);
      const t1 = (-b + Math.sqrt(disc)) / (2 * a);
      return { x: ln.p.x + dx * t1, z: ln.p.z + dz * t1 };
    };
    // 前の縁・後ろの縁は円弧ではなく、角どうしを結ぶ直線（弦）
    // 前の縁・後ろの縁は直線（弦）。円弧は弦より外側にふくらむので、そのぶん（サジッタ）を後ろの縁へ足す。
    // 前の縁の椅子は、ふくらみの内側（演奏位置側）にはみ出さないよう、同じぶんを前の縁から引く。
    const chord = (r1, r2) => {
      const c = hit(Ls, r1);
      const d = hit(Rs, r1);
      const w = Math.hypot(c.x - d.x, c.z - d.z);
      return r1 - Math.sqrt(Math.max(0, r1 * r1 - (w / 2) * (w / 2))); // 円弧が弦よりふくらむ量
    };
    const sagB = chord(rMax, rMax);
    const sagF = chord(rMin, rMin);
    const rFront = rMin - 0.0; // 前の縁は円弧の内側(演奏位置側)へふくらまないので、弦を椅子の前に置く
    return { sector: s, corners: [hit(Ls, rFront), hit(Rs, rFront), hit(Rs, rMax + sagB), hit(Ls, rMax + sagB)], rMin, rMax, sagB, sagF };
  });
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
