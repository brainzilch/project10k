// 椅子300脚（A/B/C各100脚）と床範囲・通路の検証。 `npm run verify:seating`
import { buildSeating, verifySeating } from '../src/seating.js';
import { venue, chairs, performance } from '../src/config.js';

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

const report = {
  total: v.total,
  counts: v.counts,
  seatPitch_m: { min: +v.minPitch.toFixed(3), max: +v.maxPitch.toFixed(3), reference: chairs.seatPitchRange },
  aislesDeg: v.aisles,
  outsideFloor: outside.length,
  insidePerformanceRadius: tooClose.length,
  problems: [...v.problems],
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
