// 椅子300脚（A/B/C各100脚）、席の間隔、通路、床範囲、PA・音響卓との干渉の検証。 `npm run verify:seating`
import { buildSeating, verifySeating, frontRowOuterChair } from '../src/seating.js';
import { venue, chairs, performance, pa } from '../src/config.js';

const list = buildSeating();
const v = verifySeating(list);

// 床の範囲内か（壁・ステージにはみ出さないか）
const stageFrontX = (z) => {
  const zh = Math.max(Math.abs(venue.floor.zMin), Math.abs(venue.floor.zMax));
  const s = venue.stage;
  return s.xFrontCenter + (s.xFrontEnds - s.xFrontCenter) * (z / zh) ** 2;
};
const half = Math.hypot(chairs.width, chairs.depth) / 2;
const outside = list.filter(
  (c) =>
    c.x - half < stageFrontX(c.z) ||
    c.x + half > venue.floor.xMax ||
    c.z - half < venue.floor.zMin ||
    c.z + half > venue.floor.zMax,
);
// 演奏位置の周りに空きがあるか
const tooClose = list.filter((c) => Math.hypot(c.x - performance.center.x, c.z - performance.center.z) < chairs.r0 - 0.01);

// 客席の大きさ（参考）
const xs = list.map((c) => c.x);
const zs = list.map((c) => c.z);
const extent = {
  width_m: +(Math.max(...zs) - Math.min(...zs) + chairs.depth).toFixed(1),
  depth_from_center_m: +(Math.max(...xs) + chairs.depth / 2).toFixed(1),
  rows: chairs.rowsPerSector.length,
  frontRowRadius_m: chairs.r0,
  backRowRadius_m: +(chairs.r0 + chairs.rowPitch * (chairs.rowsPerSector.length - 1)).toFixed(2),
};

// PA（スピーカー）・音響卓が椅子・楽器にぶつからないか（仮位置の簡易チェック：円の重なり）
const paProblems = [];
const paItems = [];
if (pa.show) {
  for (const sp of pa.speakers) {
    const e = frontRowOuterChair(list, sp.sector);
    const a = (e.angleDeg * Math.PI) / 180;
    const r = chairs.r0 - pa.speakerFront;
    paItems.push({ id: sp.label, x: r * Math.cos(a), z: r * Math.sin(a), rad: 0.75 });
  }
  paItems.push({ id: pa.desk.label, x: pa.desk.x, z: pa.desk.z, rad: 1.1 });
  for (const it of paItems) {
    const near = list.find((c) => Math.hypot(c.x - it.x, c.z - it.z) < it.rad + 0.35);
    if (near) paProblems.push(`${it.id} overlaps chair (${near.sector} row ${near.row})`);
    if (Math.hypot(it.x - performance.piano.position.x, it.z - performance.piano.position.z) < 2.2) paProblems.push(`${it.id} too close to piano`);
    if (it.x - it.rad < stageFrontX(it.z) || it.z - it.rad < venue.floor.zMin || it.z + it.rad > venue.floor.zMax) paProblems.push(`${it.id} outside floor`);
  }
}

const report = {
  layout: chairs.layout,
  total: v.total,
  counts: v.counts,
  rowsPerSector: chairs.rowsPerSector,
  seatPitch_m: { min: +v.minPitch.toFixed(3), max: +v.maxPitch.toFixed(3), reference: chairs.seatPitchRange },
  aisleClearWidth: v.aisleClear,
  outsideFloor: outside.length,
  insidePerformanceRadius: tooClose.length,
  extent,
  pa: paItems.map((i) => ({ id: i.id, x: +i.x.toFixed(2), z: +i.z.toFixed(2) })),
  problems: [...v.problems, ...paProblems],
};
if (outside.length) report.problems.push(`${outside.length} chairs outside floor`);
if (tooClose.length) report.problems.push(`${tooClose.length} chairs inside r0`);
if (v.minPitch < chairs.seatPitchRange[0] - 0.01 || v.maxPitch > chairs.seatPitchRange[1] + 0.01) {
  report.problems.push(`seat pitch ${v.minPitch.toFixed(3)}..${v.maxPitch.toFixed(3)} outside reference range`);
}
console.log(JSON.stringify(report, null, 2));
if (report.problems.length) {
  console.error('SEATING CHECK FAILED');
  process.exit(1);
}
console.log('SEATING CHECK OK: A=100 B=100 C=100 total=300');
