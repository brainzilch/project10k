// タイムライン：時刻 t (秒) から場面の状態を決定的に計算する。乱数は使わない。
import {
  timeline as T,
  storage,
  transportPath,
  sheet as sheetCfg,
  chairs as chairCfg,
  seatMarking,
  performance,
  exhibits as exhibitCfg,
  exhibitStorageOffsets,
  photoTiming,
  sheetTiming,
  venue,
  video,
} from './config.js';

import { buildSeating, seatZones } from './seating.js';

const DEG = Math.PI / 180;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const inRange = (t, [a, b]) => t >= a && t < b;
const frac = (t, [a, b]) => clamp01((t - a) / (b - a));

// ---------------------------------------------------------------- 経路
function pathLen(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}
/** 経路上の割合 u (0..1) の位置と進行方向 */
export function alongPath(pts, u) {
  const cum = pathLen(pts);
  const total = cum[cum.length - 1];
  const s = clamp01(u) * total;
  for (let i = 1; i < pts.length; i++) {
    if (s <= cum[i] || i === pts.length - 1) {
      const seg = cum[i] - cum[i - 1] || 1;
      const k = clamp01((s - cum[i - 1]) / seg);
      const x = lerp(pts[i - 1][0], pts[i][0], k);
      const z = lerp(pts[i - 1][1], pts[i][1], k);
      const heading = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return { x, z, heading };
    }
  }
  return { x: pts[0][0], z: pts[0][1], heading: 0 };
}
/** 角度の補間（最短経路） */
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------------------------------------------------------------- カメラ定義
// すべての斜めカメラは z+（帯1側）から z- 方向を見る → ステージ（-x）が常に画面左。
export const CAMS = {
  overviewHigh: { pos: [17, 30, 42], target: [7, 0, -1] },
  overviewHigh2: { pos: [19, 28, 39], target: [7, 0, -1] },
  complete: { pos: [19, 22, 33], target: [6, 0, -1] },
  complete2: { pos: [17, 21, 31], target: [6, 0, -1] },
  storage: { pos: [19, 9.5, 9], target: [6, 1.0, -18] },
  storage2: { pos: [17, 9, 7], target: [6, 1.0, -18] },
  exhibit: { pos: [25, 10, 19], target: [11, 0.6, 3] },
  exhibit2: { pos: [23, 9.5, 18], target: [11, 0.6, 3] },
  move: { pos: [27, 15, 20], target: [9, 0.5, -8] },
  top: { pos: [9.5, 72, 4.5], target: [9.5, 0, 4.5], up: [0, 0, -1] },
  foldClose: { pos: [-0.5, 4.8, 24], target: [-4.6, 0.2, 13.5] },
  foldClose2: { pos: [-1.5, 4.4, 22.5], target: [-4.9, 0.2, 13.5] },
  tapeObl: { pos: [14.5, 10.5, 12.5], target: [4.6, 0.4, -0.2] },
  tapeTop: { pos: [10.5, 41, 0.5], target: [10.5, 0, 0.5], up: [0, 0, -1] },
  chairs: { pos: [27, 13, 25], target: [4, 0, -1] },
  chairs2: { pos: [24, 12, 22], target: [4, 0, -1] },
  piano: { pos: [16, 9, 15], target: [1, 0.6, -5] },
  piano2: { pos: [11, 7, 12], target: [0, 0.6, -2] },
};

/** [t0, t1, from, to] のリストからカメラを決める。区間の切り替えはカット。 */
function cameraSchedule() {
  const S = [];
  const add = (range, a, b = a) => S.push([range[0], range[1], CAMS[a], CAMS[b]]);
  add(T.intro, 'overviewHigh', 'overviewHigh2');
  add(T.s1, 'storage', 'storage2');
  add([T.s2[0], T.s2[0] + photoTiming.moveFrom + 1.2], 'exhibit', 'exhibit2');
  add([T.s2[0] + photoTiming.moveFrom + 1.2, T.s2[1]], 'move', 'move');
  // s3: 帯1展開は真上、帯1の折り返しは寄り、その後は真上
  const bandDur = (T.s3[1] - T.s3[0]) / sheetCfg.bands.length;
  const fold1Start = T.s3[0] + bandDur * sheetTiming.unrollFrac;
  const fold1End = T.s3[0] + bandDur * (sheetTiming.unrollFrac + sheetTiming.foldFrac) + 0.3;
  add([T.s3[0], fold1Start], 'top');
  add([fold1Start, fold1End], 'foldClose', 'foldClose2');
  add([fold1End, T.s3[1]], 'top');
  const tp = seatMarking.timing;
  add(T.s4chairs, 'chairs', 'chairs2');
  add(T.s5, 'piano', 'piano2');
  add(T.complete, 'complete', 'complete2');
  add(T.t1, 'piano2', 'piano');
  add(T.t2chairs, 'chairs2', 'chairs');
  add(T.t3, 'top');
  add(T.t4, 'exhibit', 'exhibit2');
  add([T.t5[0], T.t5[1] + 1], 'storage', 'storage2');
  return S;
}
const CAM_SCHEDULE = cameraSchedule();

export function cameraAt(t) {
  let seg = CAM_SCHEDULE[CAM_SCHEDULE.length - 1];
  for (const s of CAM_SCHEDULE) {
    if (t >= s[0] && t < s[1]) {
      seg = s;
      break;
    }
  }
  const [t0, t1, a, b] = seg;
  const k = smooth((t - t0) / Math.max(0.001, t1 - t0));
  const pos = a.pos.map((v, i) => lerp(v, b.pos[i], k));
  const target = a.target.map((v, i) => lerp(v, b.target[i], k));
  return { pos, target, up: a.up || [0, 1, 0], isTop: !!a.up };
}

// ---------------------------------------------------------------- 各要素の状態
const bandDur = () => (T.s3[1] - T.s3[0]) / sheetCfg.bands.length;

function rollStoragePos(i) {
  return { x: storage.rollShelf.x, z: storage.rollShelf.z0 + i * storage.rollShelf.pitch };
}

/** 帯 i の状態 */
function sheetState(t, i, rect) {
  const R0 = sheetCfg.rollRadiusStart;
  const R1 = sheetCfg.rollRadiusBeforeFold;
  const R2 = sheetCfg.rollRadiusEnd;
  const zc = (rect.zMin + rect.zMax) / 2;
  const staging = { x: rect.xRight - R0 * 0.9, z: zc };
  const st = { laid: 0, fold: 0, rollPos: null, rollRadius: R0, rollY: 0, showLabel: false, labelAtRoll: false, rollRotY: 0, rollLen: 1 };
  const pathOut = [[rollStoragePos(i).x, rollStoragePos(i).z], ...transportPath.sheetRolls.slice(1), [staging.x, staging.z]];
  const tLen = transportPath.rollTransportLength / (rect.zMax - rect.zMin);
  // 運搬中：軸を進行方向に向け、束ねた長さで描く。到着直前に帯の幅へ広げ、軸を z 方向へ戻す
  const transport = (u, pts) => {
    const p = alongPath(pts, u);
    st.rollPos = { x: p.x, z: p.z };
    const k = smooth((u - 0.88) / 0.12);
    st.rollRotY = lerpAngle(p.heading, 0, k);
    st.rollLen = lerp(tLen, 1, k);
    const k0 = smooth(u / 0.08); // 出発直後：棚の向き（x軸）から進行方向へ
    if (u < 0.08) st.rollRotY = lerpAngle(Math.PI / 2, p.heading, k0);
  };
  const atShelf = () => {
    st.rollPos = rollStoragePos(i);
    st.rollRotY = Math.PI / 2;
    st.rollLen = tLen;
  };

  const laidAll = () => {
    st.laid = 1;
    st.fold = 1;
    st.rollPos = null;
    st.showLabel = true;
  };

  if (inRange(t, T.intro) || inRange(t, T.s4) || inRange(t, T.s5) || inRange(t, T.complete) || inRange(t, T.t1) || inRange(t, T.t2)) {
    laidAll();
    return st;
  }
  if (t < T.s1[0]) {
    atShelf();
    return st;
  }
  if (inRange(t, T.s1)) {
    // 収納庫から順に搬出（ずらして出す）
    const start = T.s1[0] + 0.3 + i * 0.9;
    const dur = 2.6;
    const u = smooth((t - start) / dur);
    if (u <= 0) atShelf();
    else transport(u, pathOut);
    st.showLabel = u > 0.02;
    st.labelAtRoll = true;
    return st;
  }
  if (inRange(t, T.s2)) {
    st.rollPos = staging;
    st.showLabel = true;
    st.labelAtRoll = true;
    return st;
  }
  if (inRange(t, T.s3)) {
    const bd = bandDur();
    const b0 = T.s3[0] + i * bd;
    const uEnd = b0 + bd * sheetTiming.unrollFrac;
    const fEnd = uEnd + bd * sheetTiming.foldFrac;
    if (t < b0) {
      st.rollPos = staging;
      st.showLabel = true;
      st.labelAtRoll = true;
      return st;
    }
    if (t < uEnd) {
      const u = smooth((t - b0) / (uEnd - b0));
      st.laid = u;
      const rr = lerp(R0, R1, u);
      st.rollRadius = rr;
      const x = Math.max(rect.xLeft + rr * 0.3, rect.xRight - u * rect.laidLength - rr * 0.55);
      st.rollPos = { x, z: zc };
      st.showLabel = true;
      st.labelAtRoll = true;
      return st;
    }
    if (t < fEnd) {
      const f = smooth((t - uEnd) / (fEnd - uEnd));
      st.laid = 1;
      st.fold = f;
      const rr = lerp(R1, R2, f);
      st.rollRadius = rr;
      st.rollPos = { x: rect.xLeft + f * rect.foldLength + rr * 0.6, z: zc };
      st.rollY = sheetCfg.thickness * 2 + 0.006;
      st.showLabel = true;
      st.labelAtRoll = true;
      return st;
    }
    laidAll();
    return st;
  }
  if (inRange(t, T.t3)) {
    // 4→3→2→1 の順で回収
    const k = sheetCfg.bands.length - 1 - i;
    const each = (T.t3[1] - T.t3[0]) / sheetCfg.bands.length;
    const b0 = T.t3[0] + k * each;
    const unfoldEnd = b0 + each * 0.3;
    const rollEnd = b0 + each * 0.95;
    if (t < b0) {
      laidAll();
      return st;
    }
    if (t < unfoldEnd) {
      const f = 1 - smooth((t - b0) / (unfoldEnd - b0));
      st.laid = 1;
      st.fold = f;
      const rr = lerp(R1, R2, f);
      st.rollRadius = rr;
      st.rollPos = { x: rect.xLeft + f * rect.foldLength + rr * 0.6, z: zc };
      st.rollY = sheetCfg.thickness * 2 + 0.006;
      st.showLabel = true;
      st.labelAtRoll = true;
      return st;
    }
    if (t < rollEnd) {
      const u = 1 - smooth((t - unfoldEnd) / (rollEnd - unfoldEnd));
      st.laid = u;
      const rr = lerp(R0, R1, u);
      st.rollRadius = rr;
      st.rollPos = { x: Math.max(rect.xLeft + rr * 0.3, rect.xRight - u * rect.laidLength - rr * 0.55), z: zc };
      st.showLabel = true;
      st.labelAtRoll = true;
      return st;
    }
    st.rollPos = staging;
    st.showLabel = true;
    st.labelAtRoll = true;
    return st;
  }
  if (inRange(t, T.t4)) {
    st.rollPos = staging;
    st.showLabel = true;
    st.labelAtRoll = true;
    return st;
  }
  if (t >= T.t5[0]) {
    const start = T.t5[0] + i * 0.15;
    const dur = T.t5[1] - T.t5[0] - 0.5;
    const u = smooth((t - start) / dur);
    if (u >= 1) atShelf();
    else {
      // 帰り：出発時に束ね、到着時に棚の向きへ
      const p = alongPath([...pathOut].reverse(), u);
      st.rollPos = { x: p.x, z: p.z };
      const k = smooth(u / 0.12);
      st.rollRotY = lerpAngle(0, p.heading, k);
      st.rollLen = lerp(1, tLen, k);
      const k1 = smooth((u - 0.92) / 0.08);
      if (u > 0.92) st.rollRotY = lerpAngle(p.heading, Math.PI / 2, k1);
    }
    st.showLabel = u < 0.98;
    st.labelAtRoll = true;
    return st;
  }
  atShelf();
  return st;
}

function exhibitState(t, j) {
  const e = exhibitCfg[j];
  const home = { x: e.home.x, z: e.home.z, rot: e.home.rotDeg * DEG };
  const off = exhibitStorageOffsets[j];
  const slot = { x: off[0], z: off[1], rot: Math.PI / 2 };
  const path = [[home.x, home.z], ...transportPath.exhibits.slice(1), [slot.x, slot.z]];
  const atHome = { x: home.x, z: home.z, rotY: home.rot, moving: false };
  const atSlot = { x: slot.x, z: slot.z, rotY: slot.rot, moving: false };
  if (inRange(t, T.intro)) return atSlot; // 完成イメージでは収納済み
  if (t < T.s2[0] + photoTiming.moveFrom) return atHome;
  if (inRange(t, T.s2)) {
    const start = T.s2[0] + photoTiming.moveFrom + j * 0.8;
    const dur = 4.4;
    const u = smooth((t - start) / dur);
    const p = alongPath(path, u);
    return { x: p.x, z: p.z, rotY: lerpAngle(home.rot, slot.rot, smooth((u - 0.7) / 0.3)), moving: u > 0 && u < 1 };
  }
  if (t < T.t4[0]) return atSlot;
  if (inRange(t, T.t4)) {
    const start = T.t4[0] + j * 0.45;
    const dur = 1.9;
    const u = smooth((t - start) / dur);
    const p = alongPath([...path].reverse(), u);
    return { x: p.x, z: p.z, rotY: lerpAngle(slot.rot, home.rot, smooth((u - 0.7) / 0.3)), moving: u > 0 && u < 1 };
  }
  return atHome;
}

function chairProgress(t, n) {
  const p = new Float32Array(n);
  const per = 100;
  const win = T.s4chairs; // 椅子を並べる時間帯（前半は床にテープで目印をつくる）
  const secDur = (win[1] - win[0]) / chairCfg.order.length;
  if (inRange(t, T.intro) || (t >= win[1] && t < T.t2[0])) {
    p.fill(1);
    return p;
  }
  if (inRange(t, win)) {
    for (let i = 0; i < n; i++) {
      const s = Math.floor(i / per);
      const k = i % per;
      const start = win[0] + s * secDur + (k / per) * (secDur - chairCfg.appearDuration - 0.25);
      p[i] = clamp01((t - start) / chairCfg.appearDuration);
    }
    return p;
  }
  if (inRange(t, T.t2)) {
    const w = T.t2chairs;
    const dur = w[1] - w[0];
    for (let i = 0; i < n; i++) {
      const rem = w[0] + ((n - 1 - i) / (n - 1)) * (dur - 0.4);
      p[i] = 1 - clamp01((t - rem) / 0.3);
    }
    return p;
  }
  return p;
}

// ---------------------------------------------------------------- 床のテープ（椅子を並べる範囲の目印）
const ZONES = seatZones(buildSeating(), chairCfg, seatMarking.margin);
export { ZONES };
const zoneIndex = (sector) => chairCfg.order.indexOf(sector);
/**
 * テープの状態。
 *  centerP: 中心の×印の進み(0..1)。zones[i]: {sides:[4辺の進み 0..1], dots: 打った角の数}。
 *  workers: 作業者2人。measure: 巻き尺（中心から作業者2までの線）。labels: ラベルの表示。
 * 流れ：中心に×印 → ゾーンごとに「巻き尺で4つの角を決める → 角と角を直線のテープでつなぐ」。
 * 通路は、ゾーンとゾーンの間のテープのない帯。
 */
function tapeState(t) {
  const st = {
    centerP: 0,
    zones: ZONES.map(() => ({ sides: [0, 0, 0, 0], dots: 0 })),
    workers: [{ vis: false }, { vis: false }],
    measure: null,
    labels: {},
    hidePerf: false,
  };
  const full = () => {
    st.centerP = 1;
    st.zones = ZONES.map(() => ({ sides: [1, 1, 1, 1], dots: 4 }));
  };
  const tp = seatMarking.timing;
  const a0 = T.s4tape[0];
  const order = seatMarking.order;
  const zStart = (n) => a0 + tp.intro + n * tp.perZone; // n 番目に貼るゾーンの開始
  const tEnd = zStart(order.length);
  if (!seatMarking.show) return st;
  if (inRange(t, T.intro)) {
    full();
    return st;
  }
  if (t >= T.t2tape[1]) return st;
  if (inRange(t, T.t2tape)) {
    // テープをはがす：C → A → B の逆順。最後に中心の×印
    const pp = (t - T.t2tape[0]) / (T.t2tape[1] - T.t2tape[0]);
    st.centerP = 1 - clamp01((pp - 0.85) / 0.15);
    const rev = [...order].reverse();
    st.zones = ZONES.map((z, zi) => {
      const k = rev.indexOf(z.sector);
      const f = 1 - clamp01((pp / 0.85) * rev.length - k);
      return { sides: [f, f, f, f], dots: f > 0.02 ? 4 : 0 };
    });
    st.labels = { peel: true };
    st.hidePerf = true;
    return st;
  }
  if (t < a0) return st;
  if (t >= T.s4tape[1]) {
    full();
    st.labels = { align: t < T.s4chairs[0] + 4.5 };
    st.hidePerf = t < T.s4chairs[0] + 4.5;
    return st;
  }
  // ---- 設営：テープを貼る ----
  st.hidePerf = true;
  st.centerP = clamp01((t - a0) / Math.min(tp.intro, 1.0));
  st.labels = { center: t < zStart(0) + 0.8 };
  let measureTo = null;
  let workerPos = null;
  order.forEach((sector, n) => {
    const zi = zoneIndex(sector);
    const z = ZONES[zi];
    const t0 = zStart(n);
    if (t < t0) return;
    const u = clamp01((t - t0) / tp.perZone);
    // 前半 35%：巻き尺で4つの角に印（点）を打つ。後半 65%：角と角を直線のテープでつなぐ（4辺）
    const uDots = clamp01(u / 0.35);
    const uTape = clamp01((u - 0.35) / 0.65);
    st.zones[zi].dots = Math.floor(uDots * 4 + 0.0001) + (uDots >= 1 ? 0 : 0);
    if (uDots >= 1) st.zones[zi].dots = 4;
    for (let k = 0; k < 4; k++) st.zones[zi].sides[k] = clamp01(uTape * 4 - k);
    // 作業者2：印の位置 → テープを貼る先端。作業者1：中心で巻き尺を押さえる
    if (u < 1) {
      if (u < 0.35) {
        const kk = Math.min(3, Math.floor(uDots * 4));
        const c = z.corners[kk];
        measureTo = { x: c.x, z: c.z };
        workerPos = { x: c.x, z: c.z, moving: true, yaw: Math.atan2(c.x, c.z) };
      } else {
        const side = Math.min(3, Math.floor(uTape * 4));
        const f = clamp01(uTape * 4 - side);
        const a = z.corners[side];
        const b = z.corners[(side + 1) % 4];
        const px = a.x + (b.x - a.x) * f;
        const pz = a.z + (b.z - a.z) * f;
        workerPos = { x: px, z: pz, moving: f > 0 && f < 1, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
      }
    }
    st.labels[`zone${sector}`] = u >= 0.35 && u < 1.0 + 0.9 / tp.perZone;
    st.labels[`dots${sector}`] = u < 0.35;
  });
  if (t < tEnd + 0.5) {
    st.workers[0] = { vis: true, x: 0.55, z: -0.2, yaw: workerPos ? Math.atan2(workerPos.x - 0.55, workerPos.z + 0.2) : Math.PI / 2, moving: false, phase: 0 };
    if (workerPos) st.workers[1] = { vis: true, x: workerPos.x, z: workerPos.z, yaw: workerPos.yaw, moving: workerPos.moving, phase: t * 6 };
  }
  st.measure = measureTo;
  if (t >= tEnd - 0.3) st.labels.aisle = true;
  return st;
}

function pianoState(t) {
  const cfg = performance.piano;
  const home = { x: cfg.position.x, z: cfg.position.z, rotY: cfg.rotationDeg * DEG };
  const path = [[storage.pianoAnchor.x, storage.pianoAnchor.z], ...transportPath.piano.slice(1, -1), [home.x, home.z]];
  const atStore = { x: storage.pianoAnchor.x, z: storage.pianoAnchor.z, rotY: Math.PI / 2, moving: false, atHome: false };
  const atHome = { ...home, moving: false, atHome: true };
  if (inRange(t, T.intro) || inRange(t, T.complete) || (t >= T.s5[1] && t < T.t1[0])) return atHome;
  if (inRange(t, T.s5)) {
    const start = T.s5[0] + 0.6;
    const end = T.s5[1] - 0.9;
    const u = smooth((t - start) / (end - start));
    const p = alongPath(path, u);
    const settle = smooth((t - end) / 0.8);
    const rotY = lerpAngle(p.heading, home.rotY, settle);
    return { x: p.x, z: p.z, rotY: u <= 0 ? atStore.rotY : rotY, moving: t > start && t < end, atHome: false };
  }
  if (inRange(t, T.t1)) {
    const start = T.t1[0] + 0.5;
    const end = T.t1[1] - 0.2;
    const u = smooth((t - start) / (end - start));
    const p = alongPath([...path].reverse(), u);
    const pre = smooth((t - T.t1[0]) / 0.5);
    const rotY = u <= 0 ? lerpAngle(home.rotY, p.heading, pre) : p.heading;
    return { x: p.x, z: p.z, rotY, moving: t > start && t < end, atHome: false };
  }
  return atStore;
}

// ---------------------------------------------------------------- HUD 文言
function hudState(t, ctx) {
  const H = { chip: '', chipClass: 'info', step: '', sub: '', showCounter: false, badge: false, photoNote: '', showPhoto: false, storageLabel: true };
  const bandNames = sheetCfg.bands;
  if (inRange(t, T.intro)) {
    H.chip = '完成イメージ';
    H.step = 'コンサート設営の完成形（仮配置）';
    H.sub = 'ステージは画面左。養生シート4帯、パイプ椅子300脚（A・B・C各100脚）、演奏位置のピアノとコントラバス等を先に確認します。';
    H.showCounter = true;
    H.badge = true;
  } else if (inRange(t, T.s1)) {
    H.chip = '設営 1／5';
    H.chipClass = 'setup';
    H.step = '① 収納庫から養生シートを出す';
    H.sub = '養生シートのロールを収納庫から床の右端（敷き始め側）へ運びます。収納庫の位置・扉・経路は未確定のため仮位置です。';
  } else if (inRange(t, T.s2)) {
    H.chip = '設営 2／5';
    H.chipClass = 'setup';
    H.step = '② 中央展示物を撮影してから収納庫へ';
    const rel = t - T.s2[0];
    if (rel < photoTiming.moveFrom) {
      H.sub = '動かす前に、展示物の位置と向きを写真に撮ります（撤去後の原状復帰の基準）。';
    } else {
      H.sub = '撮影が終わってから展示物を収納庫へ移動します。順番を逆にしないでください。';
    }
    H.showPhoto = rel >= photoTiming.thumbAt;
    H.photoNote = '位置と向きを記録';
  } else if (inRange(t, T.s3)) {
    H.chip = '設営 3／5';
    H.chipClass = 'setup';
    H.step = '③ 養生シートを 1 → 2 → 3 → 4 の順に敷く';
    const bd = bandDur();
    const i = Math.min(bandNames.length - 1, Math.floor((t - T.s3[0]) / bd));
    const rel = (t - T.s3[0] - i * bd) / bd;
    const b = bandNames[i];
    if (rel < sheetTiming.unrollFrac) {
      H.sub = `帯 ${b.id}（${b.name}）を右から左へ展開中。図の下から上へ、帯 1 → 4 の順に敷きます。`;
    } else if (rel < sheetTiming.unrollFrac + sheetTiming.foldFrac) {
      H.sub = `帯 ${b.id}（${b.name}）：シートが長いため、敷き終わりで余った長さ（約${sheetCfg.foldLength} m・仮値）を上に折り返します。`;
    } else {
      H.sub = i === bandNames.length - 1 ? '4帯とも折り返し済み。養生完了 → ここから土足での作業ができます。' : `帯 ${b.id}（${b.name}）完了。次は帯 ${bandNames[i + 1].id}（${bandNames[i + 1].name}）。`;
    }
    H.badge = i === bandNames.length - 1 && rel >= sheetTiming.unrollFrac + sheetTiming.foldFrac;
  } else if (inRange(t, T.s4)) {
    H.chip = '設営 4／5';
    H.chipClass = 'setup';
    const rows = chairCfg.rowsPerSector.length;
    H.step = '④ パイプ椅子300脚を設置';
    const secDur = (T.s4chairs[1] - T.s4chairs[0]) / 3;
    const s = Math.min(2, Math.floor((t - T.s4chairs[0]) / secDur));
    const names = ['A（図の上側）', 'B（正面）', 'C（図の下側）'];
    H.sub = `${names[s]} を${rows}列、前の列から順に置きます。通路を2本残します（仮配置）。`;
    if (ctx.chairCount.total >= 300) H.sub = '300脚の設置完了。A・B・C 各100脚、通路2本を確認。';
    H.showCounter = true;
    H.badge = true;
  } else if (inRange(t, T.s5)) {
    H.chip = '設営 5／5';
    H.chipClass = 'setup';
    H.step = '⑤ ピアノを収納庫から演奏位置へ';
    H.sub = '椅子300脚を置いた後に、ピアノを赤丸の演奏位置へ運びます。通過経路は未確定のため仮の安全経路で示しています。';
    H.showCounter = true;
    H.badge = true;
  } else if (inRange(t, T.complete)) {
    H.chip = '設営完了';
    H.step = 'ピアノ・コントラバス等、椅子300脚、養生4帯を確認';
    H.sub = 'イベント本番の状態。この後、撤去は設営の逆順（①ピアノ → ②椅子 → ③シート4→1 → ④展示物復旧 → ⑤シート収納）で行います。';
    H.showCounter = true;
    H.badge = true;
  } else if (inRange(t, T.t1)) {
    H.chip = '撤去 1／5';
    H.chipClass = 'teardown';
    H.step = '① ピアノを収納庫へ戻す';
    H.sub = '椅子を撤去する前に、ピアノを演奏位置から収納庫へ戻します。';
    H.showCounter = true;
    H.badge = true;
  } else if (inRange(t, T.t2)) {
    H.chip = '撤去 2／5';
    H.chipClass = 'teardown';
    H.step = '② 椅子300脚を撤去';
    H.sub = '全300脚を回収して客席を空にします。';
    H.showCounter = true;
    H.badge = true;
  } else if (inRange(t, T.t3)) {
    H.chip = '撤去 3／5';
    H.chipClass = 'teardown';
    H.step = '③ 養生シートを 4 → 3 → 2 → 1 の順に回収';
    const each = (T.t3[1] - T.t3[0]) / 4;
    const k = Math.min(3, Math.floor((t - T.t3[0]) / each));
    const b = bandNames[3 - k];
    H.sub = `帯 ${b.id}（${b.name}）の折り返しを戻し、巻き取ってまとめます。番号を逆にたどります。`;
  } else if (inRange(t, T.t4)) {
    H.chip = '撤去 4／5';
    H.chipClass = 'teardown';
    H.step = '④ 展示物を元の位置・向きへ';
    H.sub = '設営前に撮った写真と見比べて、展示物を体育館中央の元の位置・向きに戻します。';
    H.showPhoto = true;
    H.photoNote = t > T.t4[1] - 0.6 ? '✔ 位置・向きを復旧' : '写真と照合中…';
  } else {
    H.chip = '撤去 5／5';
    H.chipClass = 'teardown';
    H.step = '⑤ まとめた養生シートを収納庫へ戻す';
    H.sub = '撤去完了。展示物は元の位置、床は養生前の状態に戻っています。';
  }
  return H;
}

// ---------------------------------------------------------------- 全体
/**
 * @param {number} t 秒
 * @param {{rects: any[], chairCount: number}} ctx 帯の矩形（props.computeBandRects）と椅子数
 */
export function computeState(t, ctx) {
  t = Math.max(0, Math.min(video.duration, t));
  const sheets = ctx.rects.map((r, i) => sheetState(t, i, r));
  const exhibits = exhibitCfg.map((_, j) => exhibitState(t, j));
  const chairs = chairProgress(t, ctx.chairCount);
  const chairCount = { A: 0, B: 0, C: 0, total: 0 };
  for (let i = 0; i < chairs.length; i++) {
    if (chairs[i] >= 1) {
      chairCount[chairCfg.order[Math.floor(i / 100)]]++;
      chairCount.total++;
    }
  }
  const piano = pianoState(t);
  const bassVisible = piano.atHome;
  const camera = cameraAt(t);
  const photo = { flash: 0, iconVisible: false };
  if (inRange(t, T.s2)) {
    const rel = t - T.s2[0];
    photo.iconVisible = rel > 0.4 && rel < photoTiming.moveFrom - 0.2;
    const f = rel - photoTiming.flashAt;
    photo.flash = f >= 0 && f < 0.35 ? 1 - f / 0.35 : 0;
  }
  const hud = hudState(t, { chairCount });
  const tape = tapeState(t);
  return { t, sheets, exhibits, chairs, chairCount, piano, bassVisible, camera, photo, hud, tape };
}

export { T as timelineConfig };
