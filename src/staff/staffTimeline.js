// 運営スタッフ注意喚起動画：時刻 t から場面の状態を決定的に計算する（乱数は固定シード）。
import { layout, parking, stations, T, receptionParts, receptionSteps, quietParts, hall, ban, pickup, entry, talk, late, loud, dark, rules, staffVideo } from './staffConfig.js';
import { prepKeyframes, sampleKeyframes, PALETTE } from './people.js';
import { buildSeating } from '../seating.js';
import { lerp, smooth, clamp01 } from '../timeline.js';

const PI = Math.PI;
const FACE = { W: -PI / 2, E: PI / 2, N: PI, S: 0 }; // W=-x(ステージ側) E=+x(玄関側) N=-z(上手側) S=+z(下手側)
const inR = (t, [a, b]) => t >= a && t < b;
const Q = (i) => ({ x: layout.queue.x0 + i * layout.queue.pitch, z: layout.queue.z }); // チケット受け取りの列
const WQ = (i) => ({ x: layout.waitQueue.x0 + i * layout.waitQueue.pitch, z: layout.waitQueue.z }); // 開場待ちの列

// ---------------------------------------------------------------- 座席（設営動画と同じ配置）
const seating = buildSeating();
const seatOf = (i) => {
  const c = seating[i];
  return { x: c.x, z: c.z, yaw: c.rotY };
};

// 大声で話す客：C ブロックの最後列で、壁側の端の2席（設営動画と同じ席配置）
const lastRowC = seating.map((c, i) => ({ c, i })).filter(({ c }) => c.sector === 'C' && c.row === 13).sort((a, b) => b.c.angleDeg - a.c.angleDeg);
const loudSeat = lastRowC[0].i;
const friendSeat = lastRowC[1].i;
const LS = seatOf(loudSeat);
const FS = seatOf(friendSeat);
const faceV = { x: Math.sin(LS.yaw), z: Math.cos(LS.yaw) }; // 椅子の正面（演奏位置のほう）
const backV = { x: -faceV.x, z: -faceV.z };
const outV = { x: -faceV.z, z: faceV.x }; // 角度が増える向き（壁側）に近い横方向
const sideSign = Math.sign(outV.z) || 1; // 壁（+z）側へ
const sideV = { x: outV.x * sideSign, z: outV.z * sideSign };
const PUNCH = { x: LS.x + sideV.x * 0.95, z: LS.z + sideV.z * 0.95 };
PUNCH.yaw = Math.atan2(LS.x - PUNCH.x, LS.z - PUNCH.z);
const th = loud.hit;
const lie = (d) => ({ x: LS.x + backV.x * d, z: LS.z + backV.z * d });

// ---------------------------------------------------------------- 人物・車
const V = PALETTE.visitors;
const actors = [];
const add = (id, def) => actors.push({ id, ...def, kfs: prepKeyframes(def.kfs) });

/** 折れ線 pts を速さ speed で歩くキーフレームを返す（先頭が startT の位置）。 */
function walk(startT, pts, speed = 2.7) {
  const out = [{ t: startT, ...pts[0] }];
  let t = startT;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    t += Math.max(0.25, d / speed);
    out.push({ t, ...pts[i] });
  }
  return out;
}

// ---- 受け取り窓口の列（チケット受け取りの人）と、その後の動き ----
const S = pickup.serve;
function boothQueue(i) {
  const k = [{ t: 0, ...Q(i), yaw: FACE.W }];
  let slot = i;
  for (let j = 0; j < i; j++) {
    k.push({ t: S[j] + 0.3, ...Q(slot) });
    slot -= 1;
    k.push({ t: S[j] + 1.1, ...Q(slot) });
  }
  return k;
}
const toFoyerRoute = (from) => [from, { x: 43.6, z: -2.4 }, { x: 40.9, z: -1.8 }, { x: 37.6, z: -1.0 }, { x: 34.2, z: 2.2 }];

add('S_booth', {
  staff: true,
  armUp: pickup.armWindows,
  kfs: [{ t: 0, x: layout.booth.x1 - 1.0, z: layout.booth.windowZ, yaw: FACE.E }],
});

// 開場待ちの列へ進む人（受け取りの列の 0,2,3,4,5 番目）
const DOORQ = [
  { id: 'V1', i: 0 },
  { id: 'V3', i: 2 },
  { id: 'V4', i: 3 },
  { id: 'V5', i: 4 },
  { id: 'V6', i: 5 },
];
const HIDE_AT = 41.95; // 開場のシーンが終わる直前で消す
DOORQ.forEach((p, m) => {
  const k = boothQueue(p.i);
  const route = walk(S[p.i] + 0.2, [...toFoyerRoute(Q(0)), WQ(m)]);
  k.push(...route);
  // 前の人が確認を済ませるたびに、1歩ずつ前へ詰める
  let slot = m;
  for (let j = 0; j < m; j++) {
    const c = entry.checks[j];
    k.push({ t: c + 0.6, ...WQ(slot) });
    slot -= 1;
    k.push({ t: c + 1.4, ...WQ(slot) });
  }
  // 自分の番：確認 → ドアを通って体育館へ
  const c = entry.checks[m];
  k.push({ t: c, ...WQ(0) });
  k.push(...walk(c + 0.3, [WQ(0), { x: 28.4, z: 4.3 }, { x: 27.15, z: 4.4 }, { x: 24.6, z: 4.4 }, { x: 22.0, z: 4.7 }], 2.2).slice(1));
  const clipped = k.filter((q) => q.t <= HIDE_AT);
  const last = clipped[clipped.length - 1];
  if (clipped.length < k.length) clipped.push({ t: HIDE_AT + 0.01, x: last.x, z: last.z, hide: true });
  else last.hide = true;
  add(p.id, { color: V[p.i], kfs: clipped });
});

// 2階のトイレへ行く人（受け取りの列の1番目）：受け取り後は開場前でも自由に使える
{
  const k = boothQueue(1);
  const r = walk(S[1] + 0.2, [Q(0), { x: 43.6, z: -2.4 }, { x: 40.9, z: -1.8 }, { x: 37.0, z: -2.4 }], 2.7);
  k.push(...r);
  const t0 = r[r.length - 1].t;
  k.push({ t: t0 + 1.0, x: 35.4, z: -5.4, y: 0 });
  k.push({ t: t0 + 2.3, x: 35.4, z: -8.4, y: 1.4 });
  k.push({ t: t0 + 2.8, x: 35.4, z: -9.6, y: 1.4 });
  k.push({ t: t0 + 3.2, x: 36.4, z: -9.6, y: 1.4 });
  k.push({ t: t0 + 4.4, x: 40.1, z: -9.6, y: 4.2, hide: true });
  add('V2', { color: V[1], kfs: k });
}

// スタッフ：左手のドアの前（チケットの再確認）
add('S_door', {
  staff: true,
  marker: 'staff',
  kfs: [
    { t: 30, x: stations.doorStaff.x, z: stations.doorStaff.z, yaw: FACE.E - 0.5 },
    // 公演中の私語の例：玄関のスタッフのところへ歩いていって話し込み、注意されて戻る
    { t: talk.walk[0], x: stations.doorStaff.x, z: stations.doorStaff.z },
    { t: talk.walk[1], x: stations.talkSpot.x, z: stations.talkSpot.z, yaw: FACE.E },
    { t: talk.back[0], x: stations.talkSpot.x, z: stations.talkSpot.z },
    { t: talk.back[1], x: stations.doorStaff.x, z: stations.doorStaff.z, yaw: FACE.E - 0.5 },
    // 暗い会場：ドアの横に立ち、入場する方に「足元にご注意ください」と小声で声をかけ、手でドアのほうを示す
    { t: dark.t0 + 0.3, x: stations.doorStaff.x, z: stations.doorStaff.z, yaw: FACE.E - 0.5 },
    { t: dark.say[0] - 0.5, x: 29.0, z: 5.7, yaw: FACE.W, ar: 0 },
    { t: dark.say[0] + 0.3, x: 29.0, z: 5.7, yaw: FACE.W, ar: -1.35 },
    { t: dark.say[1] - 0.4, x: 29.0, z: 5.7, yaw: FACE.W, ar: -1.35 },
    { t: dark.say[1] + 0.2, x: 29.0, z: 5.7, yaw: FACE.W, ar: 0 },
    { t: dark.end, x: 29.0, z: 5.7, yaw: FACE.W },
    { t: dark.end + 1.2, x: stations.doorStaff.x, z: stations.doorStaff.z, yaw: FACE.E - 0.5 },
  ],
});
add('S_gate', { staff: true, marker: 'staff', kfs: [{ t: 56, x: stations.gate.x, z: stations.gate.z, yaw: FACE.W + 0.4 }] });
add('S_L1', {
  staff: true,
  marker: 'staff',
  kfs: [
    { t: 56, ...stations.wallLower[0], yaw: FACE.N },
    { t: hall.chat[0] - 0.4, ...stations.wallLower[0], yaw: FACE.E }, // 会場内の会話の例：隣のスタッフのほうを向く
    { t: hall.back[0], ...stations.wallLower[0], yaw: FACE.N },
  ],
});
// 会場内の例：壁際のスタッフが足音を立てて歩き、隣のスタッフと話し込む → 静かに元の位置へ戻る
add('S_L2', {
  staff: true,
  marker: 'staff',
  kfs: [
    { t: 56, ...stations.wallLower[1], yaw: FACE.N },
    { t: hall.walk[0], ...stations.wallLower[1] },
    { t: hall.walk[1], x: 6.6, z: 16.3 },
    { t: hall.back[0], x: 6.6, z: 16.3 },
    { t: hall.back[1], ...stations.wallLower[1], yaw: FACE.N },
    // 大声で話す客を見つけて歩いていき、注意する（演出：殴る）
    { t: loud.approach[0] - 0.3, ...stations.wallLower[1], yaw: Math.atan2(LS.x - stations.wallLower[1].x, LS.z - stations.wallLower[1].z), ar: 0 },
    { t: loud.approach[1], x: PUNCH.x, z: PUNCH.z, yaw: PUNCH.yaw, ar: 0 },
    { t: loud.windup[1] - 0.1, x: PUNCH.x, z: PUNCH.z, yaw: PUNCH.yaw, ar: 1.5, still: true },
    { t: loud.hit, x: PUNCH.x, z: PUNCH.z, yaw: PUNCH.yaw, ar: -1.6, still: true },
    { t: loud.hit + 0.5, x: PUNCH.x, z: PUNCH.z, yaw: PUNCH.yaw, ar: -1.6, still: true },
    { t: loud.hit + 1.1, x: PUNCH.x, z: PUNCH.z, yaw: PUNCH.yaw, ar: 0, still: true },
    { t: loud.back[0], x: PUNCH.x, z: PUNCH.z, yaw: PUNCH.yaw, ar: 0 },
    { t: loud.back[1], ...stations.wallLower[1], yaw: FACE.N },
  ],
});
add('S_U1', { staff: true, marker: 'staff', kfs: [{ t: 56, ...stations.wallUpper[0], yaw: FACE.S }] });
add('S_U2', { staff: true, marker: 'staff', kfs: [{ t: 56, ...stations.wallUpper[1], yaw: FACE.S }] });

// 途中入場の方（曲間はないので、演奏中に暗幕をくぐって入る）
add('LV_late', {
  color: 0x2f6fdd,
  kfs: [
    ...walk(late.arrive, [{ x: 46.0, z: 1.8 }, { x: 40.0, z: 1.8 }, { x: 34.4, z: 3.4 }, WQ(0)], 2.4),
    { t: late.pass[0], ...WQ(0) },
    { t: late.pass[0] + 0.9, x: 28.4, z: 4.4 },
    { t: late.pass[0] + 1.35, x: 27.15, z: 4.4 },
    { t: late.pass[0] + 2.0, x: 25.0, z: 4.4 },
    { t: late.pass[1], x: 22.2, z: 4.8, hide: true },
  ],
});

add('G_friend', { color: 0x5aa0c8, kfs: [{ t: quietParts.loud[0] - 0.01, x: FS.x, z: FS.z, yaw: FS.yaw, seat: true }, { t: quietParts.loud[1], x: FS.x, z: FS.z, yaw: FS.yaw, seat: true, hide: true }] });
// 大声で話す客：話している → 殴られる → 椅子から転げ落ちる → 目を回す
add('G_loud', {
  color: 0xe0b020,
  kfs: [
    { t: quietParts.loud[0] - 0.01, x: LS.x, z: LS.z, yaw: LS.yaw, seat: true, still: true, ar: 0 },
    { t: th - 0.01, x: LS.x, z: LS.z, yaw: LS.yaw, seat: true, still: true },
    { t: th + 0.1, ...lie(0.2), yaw: LS.yaw, y: 0.45, fx: -0.45, still: true },
    { t: th + 0.32, ...lie(0.45), yaw: LS.yaw, y: 0.5, fx: -1.0, still: true },
    { t: th + 0.55, ...lie(0.6), yaw: LS.yaw, y: 0.22, fx: -1.5, still: true },
    { t: th + 0.7, ...lie(0.62), yaw: LS.yaw, y: 0.3, fx: -1.45, still: true },
    { t: th + 0.9, ...lie(0.62), yaw: LS.yaw, y: 0.21, fx: -1.52, still: true },
    { t: quietParts.loud[1] - 0.2, ...lie(0.62), yaw: LS.yaw, y: 0.21, fx: -1.52, still: true },
    { t: quietParts.loud[1], ...lie(0.62), yaw: LS.yaw, y: 0.21, fx: -1.52, hide: true },
  ],
});
export const GAG = { loudSeat, friendSeat, lie: lie(0.62), head: { x: LS.x + backV.x * 2.1, z: LS.z + backV.z * 2.1 }, punch: PUNCH, seat: LS };

// 暗い会場に入る2人：ドアの前で待ち、「足元にご注意ください」と言われて、ゆっくり暗い会場へ
for (const [id, m, c] of [['DV1', 0, 0x8a8f99], ['DV2', 1, 0xb0505a]]) {
  const t0 = dark.arrive + m * 0.6;
  const k = walk(t0, [{ x: 40.0, z: 1.8 }, { x: 34.4, z: 3.4 }, WQ(m)], 2.4);
  const ps = dark.pass[0] + m * 0.8;
  k.push({ t: ps, ...WQ(m) });
  k.push(...walk(ps, [WQ(m), { x: 28.4, z: 4.4 }, { x: 27.15, z: 4.4 }, { x: 24.0, z: 4.4 }, { x: 21.6, z: 4.9 }], 1.6).slice(1));
  const clipped = k.filter((q) => q.t <= dark.end);
  const lastK = clipped[clipped.length - 1];
  clipped.push({ t: dark.end + 0.01, x: lastK.x, z: lastK.z, hide: true });
  add(id, { color: c, kfs: clipped });
}

// 着席している観客（42 秒から）。大声の客と友人の席は使わない
const audienceIdx = [];
for (let k = 0; k < 44; k++) {
  const si = (5 + k * 6 + (k % 3)) % 300;
  if (si !== loudSeat && si !== friendSeat) audienceIdx.push(si);
}
audienceIdx.forEach((si, k) => {
  const s = seatOf(si);
  add('A' + k, { color: V[k % V.length], kfs: [{ t: 42, x: s.x, z: s.z, yaw: s.yaw, seat: true }] });
});

// ---- 駐車場（市村記念体育館の関係者駐車場入口）----
// スタッフが入口に立ち、停めに来た車を主な有料駐車場（佐嘉神社外苑駐車場）へ案内する。
const P = parking;
add('P_staff', {
  staff: true,
  marker: 'staff',
  armUp: [[48.2, 51.4]],
  kfs: [{ t: 42, x: P.entrance.x + 2.2, z: P.entrance.z, yaw: -PI / 2 }, { t: 58, x: P.entrance.x + 2.2, z: P.entrance.z, hide: true }],
});
add('CAR', {
  car: true,
  kfs: [
    { t: 43.4, x: P.road.eastbound, z: P.entrance.z - 62, yaw: 0, keepYaw: true },
    { t: 46.8, x: P.road.eastbound, z: P.entrance.z - 5, yaw: 0, keepYaw: true },
    { t: 47.8, x: P.road.eastbound + 1.2, z: P.entrance.z - 1.6, yaw: PI / 4, keepYaw: true },
    { t: 48.6, x: P.entrance.x - 2.0, z: P.entrance.z, yaw: PI / 2, keepYaw: true },
    { t: 51.2, x: P.entrance.x - 2.0, z: P.entrance.z, yaw: PI / 2, keepYaw: true },
    { t: 52.4, x: P.road.eastbound + 0.6, z: P.entrance.z, yaw: PI / 2, keepYaw: true },
    { t: 53.4, x: P.road.eastbound, z: P.entrance.z + 3.0, yaw: PI / 6, keepYaw: true },
    { t: 54.2, x: P.road.eastbound, z: P.entrance.z + 9.0, yaw: 0, keepYaw: true },
    { t: 58, x: P.road.eastbound, z: P.entrance.z + 52.0, yaw: 0, keepYaw: true, hide: true },
  ],
});

export const ACTORS = actors;
const actorById = Object.fromEntries(actors.map((a) => [a.id, a]));

// ---------------------------------------------------------------- ドア・暗幕・光
function ramp(t, [a, b], from, to) {
  return lerp(from, to, smooth((t - a) / (b - a)));
}
function doorLower(t) {
  if (t < entry.openAt[0]) return 0;
  if (t < entry.openAt[1]) return ramp(t, entry.openAt, 0, 1);
  if (t < entry.closeAt[0]) return 1;
  if (t < entry.closeAt[1]) return ramp(t, entry.closeAt, 1, 0);
  if (t < late.doorOpen[0]) return 0;
  if (t < late.doorOpen[1]) return ramp(t, late.doorOpen, 0, 0.9);
  if (t < late.doorClose[0]) return 0.9;
  if (t < late.doorClose[1]) return ramp(t, late.doorClose, 0.9, 0);
  if (t < dark.doorOpen[0]) return 0;
  if (t < dark.doorOpen[1]) return ramp(t, dark.doorOpen, 0, 0.9);
  if (t < dark.doorClose[0]) return 0.9;
  if (t < dark.doorClose[1]) return ramp(t, dark.doorClose, 0.9, 0);
  return 0;
}
function curtainState(t) {
  const drop = t < late.curtainDrop[0] ? 0 : t < late.curtainDrop[1] ? ramp(t, late.curtainDrop, 0.02, 1) : 1;
  // 通る人が押し分けるように、下側が体育館の側へ少し揺れる
  const mids = [late.pass[0] + 1.35, dark.pass[0] + 2.2, dark.pass[0] + 0.8 + 2.8];
  let swing = 0;
  for (const mid of mids) if (t >= mid - 0.9 && t <= mid + 1.4) swing = Math.max(swing, Math.sin(clamp01((t - (mid - 0.9)) / 2.3) * PI));
  return { drop: t < late.curtainDrop[0] ? 0 : drop, swing };
}
function lightState(t) {
  // ドアが開いていて暗幕がないとき、ホワイエの光がホールに差し込む
  const open = doorLower(t);
  const c = curtainState(t).drop;
  const amount = open * (1 - c);
  const duringLate = t >= late.doorOpen[0] && t < late.doorClose[1];
  return duringLate ? amount : 0;
}

// 会場の明るさ（1＝通常）。公演中は少し暗く、途中入場と暗い会場の場面ではかなり暗くする。
function dimState(t) {
  const q = quietParts;
  if (t < q.steps[0]) return 1;
  if (t < q.steps[0] + 2) return lerp(1, 0.72, smooth((t - q.steps[0]) / 2));
  if (t < q.late[0]) return 0.72;
  if (t < q.late[0] + 1.2) return lerp(0.72, 0.3, smooth((t - q.late[0]) / 1.2));
  if (t < q.stations[0]) return 0.3;
  if (t < q.stations[0] + 1.2) return lerp(0.3, 0.62, smooth((t - q.stations[0]) / 1.2));
  if (t < T.outro[0]) return 0.62;
  if (t < T.outro[0] + 1.2) return lerp(0.62, 1, smooth((t - T.outro[0]) / 1.2));
  return 1;
}

// ---------------------------------------------------------------- カメラ
const C = {
  ovA: { pos: [46, 38, 56], target: [20, 0, -1] },
  ovB: { pos: [52, 34, 52], target: [22, 0, -1] },
  booth1: { pos: [66, 9, 14], target: [44, 1.6, -4.5] },
  booth2: { pos: [62, 8.5, 12], target: [44, 1.6, -4.8] },
  steps1: { pos: [54, 4.6, 3.5], target: [42.6, 1.4, -5.2] },
  steps2: { pos: [52, 4.2, 1.5], target: [42.6, 1.4, -5.2] },
  enter1: { pos: [56, 7.5, 12], target: [41, 1.4, -2.5] },
  enter2: { pos: [52, 7.5, 9], target: [39, 1.4, -2] },
  toilet1: { pos: [49, 14, 11], target: [37, 1.5, -6.5] },
  toilet2: { pos: [47, 13, 9], target: [37, 1.5, -6.5] },
  deck1: { pos: [62, 11, -1], target: [42.5, 5.0, -8] },
  deck2: { pos: [58, 10.5, -1], target: [42.5, 5.0, -8] },
  twoQ1: { pos: [62, 17, 15], target: [38, 0, 0] },
  twoQ2: { pos: [58, 15, 13], target: [36, 0, 1.5] },
  door1: { pos: [44, 9, 10], target: [30, 1.2, 4.2] },
  door2: { pos: [41, 7.5, 9], target: [28.8, 1.2, 4.2] },
  mapA: { pos: [-112, 96, 48], target: [-12, 0, 48] },
  mapB: { pos: [-104, 88, 44], target: [-12, 0, 44] },
  car1: { pos: [-66, 21, -6], target: [-41, 1.5, 12] },
  car2: { pos: [-63, 19, -2], target: [-41, 1.5, 12] },
  mapC: { pos: [-100, 84, 40], target: [-10, 0, 46] },
  hall1: { pos: [27, 17, 37], target: [10, 0, 9] },
  hall2: { pos: [24, 15, 34], target: [9, 0, 9] },
  talk1: { pos: [48, 16, 15], target: [31, 0, 1.5] },
  talk2: { pos: [45, 14, 13], target: [31, 0, 2] },
  corr: { pos: [35.2, 2.7, 4.7], target: [26.0, 1.3, 4.3] },
  loud1: { pos: [31, 9.5, 28], target: [15.8, 0.8, 9.4] },
  loud1b: { pos: [29, 8.5, 26], target: [15.8, 0.8, 9.6] },
  loud2: { pos: [25.2, 5.6, 18.8], target: [16.4, 1.0, 10.6] },
  loud2b: { pos: [24.6, 5.2, 18.2], target: [16.6, 0.9, 10.6] },
  dark1: { pos: [38.6, 3.6, 4.7], target: [28.9, 1.2, 4.9] },
  dark2: { pos: [37.0, 3.3, 4.7], target: [28.6, 1.2, 4.9] },
  dark3: { pos: [19.6, 3.4, 9.8], target: [26.2, 1.1, 4.6] },
  dark4: { pos: [19.0, 3.3, 9.2], target: [25.2, 1.0, 4.7] },
  wide1: { pos: [48, 21, 36], target: [23, 0, 1.0] },
  wide2: { pos: [45, 19, 33], target: [22, 0, 1.0] },
};
const camSched = [
  [T.intro, C.ovA, C.ovB],
  [receptionParts.queue, C.booth1, C.booth2],
  [receptionParts.steps, C.steps1, C.steps2],
  [receptionParts.handover, C.enter1, C.enter2],
  [[25, 28.3], C.toilet1, C.toilet2],
  [[28.3, 30], C.deck1, C.deck2],
  [[30, 36], C.twoQ1, C.twoQ2],
  [[36, 42], C.door1, C.door2],
  [[42, 47], C.mapA, C.mapB],
  [[47, 53.2], C.car1, C.car2],
  [[53.2, 58], C.mapB, C.mapC],
  [[58, 71.2], C.talk1, C.talk2],
  [quietParts.hall, C.hall1, C.hall2],
  [[quietParts.loud[0], loud.approach[1]], C.loud1, C.loud1b],
  [[loud.approach[1], quietParts.loud[1]], C.loud2, C.loud2b],
  [quietParts.rec, C.hall2, C.hall1],
  [quietParts.late, C.corr, C.corr],
  [[quietParts.dark[0], dark.pass[0] + 1.6], C.dark1, C.dark2],
  [[dark.pass[0] + 1.6, quietParts.dark[1]], C.dark3, C.dark4],
  [quietParts.stations, C.wide1, C.wide2],
  [T.outro, C.ovB, C.ovA],
];
export function cameraAt(t) {
  let seg = camSched[camSched.length - 1];
  for (const s of camSched) if (inR(t, s[0])) seg = s;
  const [[t0, t1], a, b] = seg;
  const k = smooth((t - t0) / (t1 - t0));
  return { pos: a.pos.map((v, i) => lerp(v, b.pos[i], k)), target: a.target.map((v, i) => lerp(v, b.target[i], k)), up: [0, 1, 0] };
}

// ---------------------------------------------------------------- ラベル（3D スプライト。fs は画面上の文字サイズ px）
export const LABEL_DEFS = [
  { id: 'booth', text: '受け渡し窓口（1か所・机なし）', pos: [41.4, 4.0, -5.25], fs: 34, t: [6, 25] },
  { id: 'queue', text: 'チケット受け取りの列（窓口の正面からまっすぐ）', pos: [47.5, 3.0, -5.25], fs: 32, t: [6, 20] },
  { id: 'toilet', text: '2階トイレ（位置は仮）', pos: [42.8, 7.6, -7.8], fs: 34, t: [25, 30] },
  { id: 'queueA', text: 'チケット受け取りの列', pos: [47.8, 3.0, -5.25], fs: 34, t: [30, 36] },
  { id: 'queueB', text: '開場待ちの列', pos: [34.4, 3.0, 4.4], fs: 36, t: [30, 42] },
  { id: 'doorLow', text: '入口は左手のドアだけ', pos: [27.6, 3.9, 4.4], fs: 34, t: [33, 42] },
  { id: 'doorUp', text: '上手側のドアは使わない', pos: [27.6, 3.9, -4.2], fs: 34, t: [33, 42] },
  { id: 'check', text: 'ドアの前でチケットを再確認', pos: [30.6, 3.4, 6.6], fs: 32, t: [33, 42] },
  { id: 'noSeat2', text: '2階席は着席NG', pos: [20.0, 6.8, -12.0], fs: 36, t: [37, 42] },
  // 駐車場（市村記念体育館の関係者駐車場入口）
  { id: 'pkVenue', text: '市村記念体育館', pos: [16, 14, 0], fs: 34, t: [42, 47] },
  { id: 'pkEntrance', text: '関係者駐車場入口（スタッフ1名）', pos: [-36.5, 6.0, 12], fs: 34, t: [42, 47.6] },
  { id: 'pkEntrance2', text: '関係者駐車場入口（スタッフ1名）', pos: [-36.5, 6.0, 12], fs: 34, t: [51.8, 58] },
  { id: 'pkStaffLot', text: '市村駐車場（関係者のみ）', pos: [-22, 6.0, 41], fs: 34, t: [42, 47] },
  { id: 'pkShrine', text: '主な有料駐車場（佐嘉神社外苑駐車場）', pos: [-18, 12, 96], fs: 34, t: [42, 47] },
  { id: 'pkShrine2', text: '有料駐車場へどうぞ', pos: [-38, 9, 75], fs: 36, t: [53.2, 58] },
  { id: 'pkSay', text: '関係者のみです。有料駐車場へどうぞ', pos: [-38.0, 5.2, 12], fs: 36, t: [48.4, 51.6] },
  // 会場内で大声で話す方への注意
  { id: 'loudWho', text: '大声で話している方', pos: [15.8, 4.4, 8.9], fs: 38, t: [loud.chat[0] + 0.6, loud.hit - 0.2], border: '#d62828' },
  { id: 'loudStaff', text: '壁際のスタッフが注意する', pos: [17, 3.7, 15.0], fs: 36, t: [loud.approach[0] - 0.5, loud.approach[1] + 0.2] },
  { id: 'gagNote', text: '※ 演出です。実際は殴りません', pos: [20.6, 0.7, 13.4], fs: 40, t: [loud.stars[0], quietParts.loud[1]], border: '#d62828' },
  // 暗い会場
  { id: 'darkWarn', text: '会場内は暗い → 足元に注意', pos: [25.4, 3.0, 7.6], fs: 38, t: [dark.pass[0] + 1.8, dark.end], border: '#f2c14e' },
  { id: 'sayDark', text: 'スタッフ「足元にご注意ください」（小声で）', pos: [30.6, 2.7, 7.0], fs: 36, t: [dark.say[0], dark.pass[0] + 1.6] },
  // 公演中（ホワイエも含む）
  { id: 'lightWarn', text: 'ドアを開けるとホワイエの光が差し込む', pos: [25.6, 3.4, 4.4], fs: 34, t: [late.doorOpen[0], late.curtainDrop[0]] },
  { id: 'curtain', text: 'ドアに暗幕を1枚垂らす', pos: [25.6, 3.4, 4.4], fs: 36, t: [late.curtainDrop[0], quietParts.late[1]] },
  { id: 'gate', text: '玄関 1名', pos: [37.0, 4.8, -3.0], fs: 34, t: [quietParts.stations[0] + 0.2, quietParts.stations[1]] },
  { id: 'foyerDoor', text: 'ホワイエのドア 1名', pos: [29.8, 3.6, 7.0], fs: 34, t: [quietParts.stations[0] + 0.2, quietParts.stations[1]] },
  { id: 'lower', text: '下手の壁際 2名', pos: [8, 3.6, 16.9], fs: 34, t: [quietParts.stations[0] + 0.2, quietParts.stations[1]] },
  { id: 'upper', text: '上手の壁際 2名', pos: [10, 3.6, -16.9], fs: 34, t: [quietParts.stations[0] + 0.2, quietParts.stations[1]] },
];

// ---------------------------------------------------------------- 効果（波紋・吹き出し・×・✔）
function ripples(t) {
  const out = [];
  // 足音：ドア前のスタッフが歩く間 0.52 秒ごと
  for (let k = 0; k < 6; k++) {
    const ts = talk.walk[0] + 0.5 + 0.52 * k;
    if (t >= ts && t < ts + 1.9) {
      const a = sampleKeyframes(actorById.S_door.kfs, ts);
      out.push({ x: a.x, z: a.z, u: (t - ts) / 1.9, kind: 'step' });
    }
  }
  // 会場内：足音
  for (let k = 0; k < 5; k++) {
    const ts = hall.walk[0] + 0.3 + 0.5 * k;
    if (ts < hall.walk[1] && t >= ts && t < ts + 1.9) {
      const a = sampleKeyframes(actorById.S_L2.kfs, ts);
      out.push({ x: a.x, z: a.z, u: (t - ts) / 1.9, kind: 'step' });
    }
  }
  // 会場内：会話
  for (let k = 0; k < 4; k++) {
    const ts = hall.chat[0] + 0.5 * k;
    if (ts < hall.chat[1] && t >= ts && t < ts + 2.0) {
      for (const id of ['S_L1', 'S_L2']) {
        const a = sampleKeyframes(actorById[id].kfs, ts);
        out.push({ x: a.x, z: a.z, u: (t - ts) / 2.0, kind: 'talk' });
      }
    }
  }
  // 大声で話す客：大きな波紋（赤）
  for (let k = 0; k < 9; k++) {
    const ts = loud.chat[0] + 0.7 * k;
    if (ts < loud.hit && t >= ts && t < ts + 2.0) out.push({ x: GAG.seat.x, z: GAG.seat.z, u: (t - ts) / 2.0, kind: 'loud' });
  }
  // 会話（ホワイエ）
  for (let k = 0; k < 5; k++) {
    const ts = talk.chat[0] + 0.62 * k;
    if (t >= ts && t < ts + 2.2 && ts < talk.chat[1]) {
      for (const id of ['S_door', 'S_gate']) {
        const a = sampleKeyframes(actorById[id].kfs, ts);
        out.push({ x: a.x, z: a.z, u: (t - ts) / 2.2, kind: 'talk' });
      }
    }
  }
  return out;
}
function checks(t) {
  const out = [];
  entry.checks.forEach((c) => {
    if (t >= c && t < c + 1.0) out.push({ x: layout.waitQueue.x0 - 0.2, z: layout.waitQueue.z, u: (t - c) / 1.0 });
  });
  return out;
}

// ---------------------------------------------------------------- HUD 文言
function hud(t) {
  const H = { chip: '', chipClass: 'info', step: '', sub: '', panel: null, clockBig: null, scene: '', compass: false, phase: 'none' };
  const steps3 = ['予約のお名前を確認', 'リストで照合', 'チケットをお渡し'];
  if (inR(t, T.intro)) {
    H.scene = 'intro';
    H.chip = '運営スタッフ向け';
    H.step = '本日の運営で気をつける3つのこと';
    H.sub = '① 受付　② 駐車場案内　③ 公演中は静かに（撮影・録音もNG）。チケットの受け渡しは 16:30 から、開場は 17:00 です。';
    H.panel = { title: '3つのこと', items: ['① 受付', '② 駐車場案内', '③ 公演中は静かに・撮影録音NG'], active: -1 };
  } else if (inR(t, T.reception)) {
    H.scene = 'reception';
    H.chip = '① 受付';
    H.chipClass = 'setup';
    H.step = 'チケットの受け渡し（16:30 から）';
    H.phase = 'recv';
    if (t < 9.6) H.clockBig = { lbl: '受け渡し開始', time: '16:30' };
    if (inR(t, receptionParts.queue)) H.sub = '16:30 からチケットの受け渡しを開始（開場は 17:00）。担当：佐賀県文化課／LiveS Beyond事務局。窓口は玄関の庇の下・右手に1か所、机なし。';
    else if (inR(t, receptionParts.steps)) {
      H.sub = '列は窓口の正面からまっすぐ。当日券も同じ窓口。引換用チケットは松永さん保管→山浦さんへ。';
      let a = -1;
      receptionSteps.forEach((s, i) => {
        if (t >= s.t) a = i;
      });
      H.panel = { title: '窓口の手順', items: steps3.map((s, i) => `${i + 1}  ${s}`), active: a, showUntil: a + 1 };
    } else if (inR(t, receptionParts.handover)) H.sub = '受け取りが終わった方は、左手のドアの前で開場待ち。玄関やトイレまで入っている方もいます。';
    else H.sub = '受け取り後は、玄関の2階のトイレを開場前でも自由に使えます。';
  } else if (inR(t, T.open)) {
    H.scene = 'open';
    H.chip = '開場 17:00';
    H.chipClass = 'setup';
    H.step = '列は2つ：「受け取り」と「開場待ち」';
    H.phase = 'open';
    if (t < 37) H.clockBig = { lbl: '開場', time: '17:00' };
    if (t < 33) H.sub = '「チケット受け取りの人」は窓口の正面、「開場待ちの人」は左手のドアの前に並びます。';
    else if (t < 37) H.sub = '17:00 に、会場内の入口は左手のドアだけを開けます。上手側のドアは使いません。';
    else H.sub = 'ドアの前でスタッフがチケットを再確認して入場。2階席は着席NGです。';
  } else if (inR(t, T.parking)) {
    H.scene = 'parking';
    H.chip = '② 駐車場案内';
    H.chipClass = 'setup';
    H.step = '関係者駐車場の入口で、停めに来た方をフォロー';
    H.compass = true;
    if (t < 47) H.sub = '赤枠の位置が市村記念体育館の関係者駐車場入口。ここにスタッフが1名立ちます。神社側には配置しません。';
    else if (t < 53.2) H.sub = 'お客さんは停められません。他の有料駐車場を案内します。';
    else H.sub = '案内先は主な有料駐車場（佐嘉神社外苑駐車場・会場の東 約95 m）。';
  } else if (inR(t, T.quiet)) {
    H.scene = 'quiet';
    H.chip = '③ 公演中';
    H.chipClass = 'teardown';
    H.step = '公演中は、ホワイエも会場内も静かに';
    const items = ['足音・ドアの音が響く', 'ホワイエ・玄関：会話は最低限', '会場内も会話・足音はNG', '大声で話す方には注意', '撮影（写真・動画）・録音はNG', '途中入場は暗幕でそっと', '暗いので足元に注意'];
    const panel = (a) => ({ title: '公演中に気をつけること', items: items.map((s2, i2) => `${i2 + 1}  ${s2}`), active: a, showUntil: a + 1 });
    if (inR(t, quietParts.steps)) {
      H.sub = '足音が響き、各ドアの遮音性も低い会場です。ホワイエの音もホールに届きます。演奏は生音に近い音量です。';
      H.panel = panel(0);
    } else if (inR(t, quietParts.talk)) {
      H.sub = '玄関付近・ホワイエを含め、スタッフ同士の会話は必要最低限にとどめます。';
      H.panel = panel(1);
    } else if (inR(t, quietParts.hall)) {
      H.sub = t < hall.chat[0] ? 'ホワイエだけでなく、会場内でも足音を立てません。' : 'ホワイエだけでなく、会場内でも話しません。';
      H.panel = panel(2);
    } else if (inR(t, quietParts.loud)) {
      H.sub =
        t < loud.hit
          ? '会場内で大声で話している方がいたら、近くのスタッフがすぐに注意します。'
          : '※ 演出です。実際は手を出さず、小声で静かにお声がけを。';
      H.panel = panel(3);
    } else if (inR(t, quietParts.rec)) {
      H.sub = t < ban.rec ? 'カメラでの撮影は、写真も動画もどちらも禁止です。' : '録音も禁止です。';
      H.panel = panel(4);
    } else if (inR(t, quietParts.late)) {
      H.sub =
        t < late.curtainDrop[0]
          ? '曲はすべてつながっていて曲間はありません。途中入場でドアを開けると、ホワイエの光がホールに差し込みます。'
          : 'ドアに暗幕を1枚垂らして光を遮り、途中入場の方はそっと通します。';
      H.panel = panel(5);
    } else if (inR(t, quietParts.dark)) {
      H.sub = '公演中の会場内は暗くなります。入場する方には、スタッフから「足元にご注意ください」と小声でお声がけを。';
      H.panel = panel(6);
    } else {
      H.sub = '公演中の配置：壁際は下手・上手に各2名、玄関とホワイエのドアに各1名。演奏が終わるまで静かに。';
      H.panel = panel(6);
    }
  } else {
    H.scene = 'outro';
    H.chip = 'まとめ';
    H.step = '受付・駐車場案内・私語を慎む';
    H.sub = '列は「受け取り」と「開場待ち」の2つ。市村の駐車場は関係者のみ。公演中はホワイエも会場内も静かに、撮影・録音はNG。会場は暗いので足元に注意。';
    const o0 = T.outro[0];
    const a = t < o0 + 2 ? 0 : t < o0 + 4.4 ? 1 : 2;
    H.panel = { title: '3つのこと', items: ['① 受付', '② 駐車場案内', '③ 公演中は静かに・足元注意'], active: a, showUntil: 3 };
  }
  return H;
}

// ---------------------------------------------------------------- 全体
export function computeStaffState(t) {
  t = Math.max(0, Math.min(staffVideo.duration, t));
  const people = {};
  for (const a of actors) {
    const s = sampleKeyframes(a.kfs, t);
    if (s.vis && a.armUp) s.armUp = a.armUp.some(([x, y]) => t >= x && t < y);
    people[a.id] = s;
  }
  const scene = hud(t).scene;
  const labels = {};
  for (const l of LABEL_DEFS) labels[l.id] = inR(t, l.t);
  const inTalk = t >= talk.chat[0] && t < talk.chat[1];
  const inHallTalk = t >= hall.chat[0] && t < hall.chat[1];
  let cross = null;
  if (t >= loud.hit + 0.7 && t < loud.hit + 2.8) cross = { kind: 'loud', a: 'G_loud', b: 'G_loud' };
  else if (t >= talk.cross[0] && t < talk.cross[1]) cross = { kind: 'foyer', a: 'S_door', b: 'S_gate' };
  else if (t >= hall.crossStep[0] && t < hall.crossStep[1]) cross = { kind: 'hallStep', a: 'S_L2', b: 'S_L2' };
  else if (t >= hall.crossTalk[0] && t < hall.crossTalk[1]) cross = { kind: 'hallTalk', a: 'S_L1', b: 'S_L2' };
  const banState = { photo: t >= ban.photoVideo && t < ban.end, video: t >= ban.photoVideo && t < ban.end, rec: t >= ban.rec && t < ban.end, t0: ban.photoVideo };
  return {
    t,
    scene,
    people,
    camera: cameraAt(t),
    doors: { lower: doorLower(t), upper: 0 },
    curtain: curtainState(t),
    light: lightState(t),
    labels,
    ripples: ripples(t),
    checks: checks(t),
    bubbles: inTalk ? ['S_door', 'S_gate'] : inHallTalk ? ['S_L1', 'S_L2'] : null,
    gag: {
      loudBubble: t >= loud.chat[0] && t < loud.hit - 0.05,
      bam: t >= loud.hit && t < loud.hit + 0.9 ? { x: GAG.seat.x + (GAG.punch.x - GAG.seat.x) * 0.45, z: GAG.seat.z + (GAG.punch.z - GAG.seat.z) * 0.45, u: (t - loud.hit) / 0.9 } : null,
      stars: t >= loud.stars[0] && t < loud.stars[1] ? { x: GAG.head.x, z: GAG.head.z, u: (t - loud.stars[0]) / (loud.stars[1] - loud.stars[0]) } : null,
      shake: t >= loud.hit && t < loud.hit + 0.55 ? 0.45 * (1 - (t - loud.hit) / 0.55) : 0,
    },
    dim: dimState(t),
    cross,
    ban: banState,
    hud: hud(t),
    deckVisible: scene !== 'open' && scene !== 'quiet' && !(t >= 24.5 && t < 28.3),
    markerScale: scene === 'quiet' || scene === 'open' ? 1.15 : scene === 'parking' ? 2.2 : 0,
    arrowVisible: t >= 53.2 && t < 58,
  };
}

export { T };
