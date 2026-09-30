// 運営スタッフ注意喚起動画：時刻 t から場面の状態を決定的に計算する（乱数は固定シード）。
import { layout, parking, stations, T, receptionParts, receptionSteps, quietParts, songBreakAt, rules, staffVideo } from './staffConfig.js';
import { prepKeyframes, sampleKeyframes, PALETTE } from './people.js';
import { buildSeating } from '../seating.js';
import { clamp01, lerp, smooth } from '../timeline.js';

const PI = Math.PI;
const FACE = { W: -PI / 2, E: PI / 2, N: PI, S: 0 }; // W=-x(ステージ側) E=+x(玄関側) N=-z(上手側) S=+z(下手側)
const inR = (t, [a, b]) => t >= a && t < b;
const Q = (i) => ({ x: layout.queue.x0 + i * layout.queue.pitch, z: layout.queue.z });

// ---------------------------------------------------------------- 座席（設営動画と同じ配置）
const seating = buildSeating();
const seatOf = (i) => {
  const c = seating[i];
  return { x: c.x, z: c.z, yaw: c.rotY };
};

// ---------------------------------------------------------------- 人物（キーフレーム）
const kf = (arr) => prepKeyframes(arr);
const V = PALETTE.visitors;
const actors = [];
const add = (id, def) => actors.push({ id, ...def, kfs: kf(def.kfs) });

// 受付
add('S_booth', {
  staff: true,
  armUp: [[17.4, 19.0], [22.4, 23.6]],
  kfs: [{ t: 0, x: layout.booth.x1 - 1.0, z: layout.booth.windowZ, yaw: FACE.E }, { t: 30, x: layout.booth.x1 - 1.0, z: layout.booth.windowZ, hide: true }],
});
add('V1', {
  color: V[0],
  kfs: [
    { t: 0, ...Q(0), yaw: FACE.W },
    { t: 19.4, ...Q(0) },
    { t: 21.0, x: 43.6, z: -1.8 },
    { t: 23.2, x: 38.6, z: -1.8 },
    { t: 26.0, x: 36.0, z: -0.8 },
    { t: 29.0, x: 34.6, z: 0.6 },
    { t: 30, x: 34.6, z: 0.6, hide: true },
  ],
});
add('V2', {
  color: V[1],
  kfs: [
    { t: 0, ...Q(1), yaw: FACE.W },
    { t: 20.0, ...Q(1) },
    { t: 21.0, ...Q(0) },
    { t: 23.8, ...Q(0) },
    { t: 25.4, x: 43.6, z: -1.8 },
    { t: 27.5, x: 38.6, z: -1.8 },
    { t: 29.6, x: 36.4, z: 1.8 },
    { t: 30, x: 36.4, z: 1.8, hide: true },
  ],
});
add('V3', {
  color: V[2],
  kfs: [
    { t: 0, ...Q(2), yaw: FACE.W },
    { t: 20.0, ...Q(2) },
    { t: 21.0, ...Q(1) },
    { t: 24.0, ...Q(1) },
    { t: 25.0, ...Q(0) },
    { t: 30, ...Q(0), hide: true },
  ],
});
add('V4', {
  color: V[3],
  kfs: [
    { t: 0, ...Q(3), yaw: FACE.W },
    { t: 20.0, ...Q(3) },
    { t: 21.0, ...Q(2) },
    { t: 24.0, ...Q(2) },
    { t: 25.0, ...Q(1) },
    { t: 30, ...Q(1), hide: true },
  ],
});
add('V5', {
  color: V[4],
  kfs: [
    { t: 0, x: 56.6, z: layout.queue.z, yaw: FACE.W },
    { t: 6, x: 56.6, z: layout.queue.z },
    { t: 12, ...Q(4) },
    { t: 20.0, ...Q(4) },
    { t: 21.0, ...Q(3) },
    { t: 24.0, ...Q(3) },
    { t: 25.0, ...Q(2) },
    { t: 30, ...Q(2), hide: true },
  ],
});
add('V6', {
  color: V[5],
  kfs: [
    { t: 0, x: 61, z: layout.queue.z, yaw: FACE.W },
    { t: 6, x: 61, z: layout.queue.z },
    { t: 14, ...Q(5) },
    { t: 20.0, ...Q(5) },
    { t: 21.0, ...Q(4) },
    { t: 24.0, ...Q(4) },
    { t: 25.0, ...Q(3) },
    { t: 30, ...Q(3), hide: true },
  ],
});
// 2階トイレへ向かう来場者（受け渡し完了後は開場前でも自由に利用可）
add('T1', {
  color: V[6],
  kfs: [
    { t: 24.0, x: 36.6, z: -2.6, yaw: FACE.N },
    { t: 24.6, x: 35.4, z: -5.4, y: 0 },
    { t: 26.0, x: 35.4, z: -8.4, y: 1.4 },
    { t: 26.4, x: 35.4, z: -9.6, y: 1.4 },
    { t: 26.8, x: 36.4, z: -9.6, y: 1.4 },
    { t: 28.2, x: 40.1, z: -9.6, y: 4.2 },
    { t: 28.9, x: 40.2, z: -5.5, y: 4.2 },
    { t: 29.7, x: 42.6, z: -5.5, y: 4.2 },
    { t: 30, x: 42.6, z: -5.5, y: 4.2, hide: true },
  ],
});

// 開場（17:00）：館長室と放送室の間のドア（下手側）と上手側のドアから入場。チケット確認は行わない。
const wkf = (start, from, viaLower, seat) => {
  // from: 待機位置。ドアを通って体育館へ進み、途中で場面が切り替わる
  const door = viaLower ? { x: layout.eastWallX, z: layout.gymDoors[1].z } : { x: layout.eastWallX, z: layout.gymDoors[0].z };
  const pre = viaLower ? { x: 30.0, z: 4.4 } : { x: 29.4, z: -4.2 };
  return [
    { t: 30, ...from, yaw: FACE.W },
    { t: start, ...from },
    { t: start + 1.7, ...pre },
    { t: start + 3.3, ...door },
    { t: start + 6.6, x: 21.0, z: door.z },
    { t: 41.9, x: 18.6, z: door.z + (viaLower ? 0.4 : -0.4), hide: true },
  ];
};
add('W1', { color: V[0], kfs: wkf(34.0, { x: 32.6, z: 3.4 }, true) });
add('W3', { color: V[2], kfs: wkf(34.4, { x: 33.6, z: 4.6 }, true) });
add('W6', { color: V[5], kfs: wkf(34.8, { x: 32.2, z: 5.0 }, true) });
add('W2', { color: V[1], kfs: wkf(34.2, { x: 32.0, z: -3.4 }, false) });
add('W4', { color: V[3], kfs: wkf(34.6, { x: 33.0, z: -4.6 }, false) });
add('W5', { color: V[4], kfs: wkf(35.0, { x: 32.4, z: -2.2 }, false) });

// 配置スタッフ（公演中）
add('S_gate', { staff: true, marker: 'staff', kfs: [{ t: 30, x: stations.gate.x, z: stations.gate.z, yaw: FACE.E }] });
add('S_foyer', { staff: true, marker: 'staff', kfs: [{ t: 30, x: stations.foyerDoor.x - 2.0, z: stations.foyerDoor.z, yaw: FACE.W }] });
add('S_L1', { staff: true, marker: 'staff', kfs: [{ t: 56, ...stations.wallLower[0], yaw: FACE.N }] });
add('S_L2', {
  staff: true,
  marker: 'staff',
  kfs: [
    { t: 56, ...stations.wallLower[1], yaw: FACE.N },
    { t: 62.0, ...stations.wallLower[1] },
    { t: 64.6, x: 13.5, z: stations.wallLower[1].z },
    { t: 64.7, x: 13.5, z: stations.wallLower[1].z, yaw: FACE.N },
  ],
});
add('S_U1', { staff: true, marker: 'staff', kfs: [{ t: 56, ...stations.wallUpper[0], yaw: FACE.S }] });
add('S_U2', { staff: true, marker: 'staff', kfs: [{ t: 56, ...stations.wallUpper[1], yaw: FACE.S }] });

// 駐車場の入口スタッフ（北側・南側に各1名）と、迷っている方
add('P_N', { staff: true, marker: 'staff', kfs: [{ t: 42, x: parking.northGate.x, z: parking.northGate.z + 2, yaw: FACE.S }, { t: 58, x: parking.northGate.x, z: parking.northGate.z + 2, hide: true }] });
add('P_S', { staff: true, marker: 'staff', kfs: [{ t: 42, x: parking.southGate.x, z: parking.southGate.z + 2, yaw: FACE.S }, { t: 58, x: parking.southGate.x, z: parking.southGate.z + 2, hide: true }] });
add('LV', {
  color: 0x2f6fdd,
  marker: 'visitor',
  kfs: [
    { t: 42, x: 62, z: 16, yaw: FACE.W },
    { t: 46.5, x: 54, z: 22 },
    { t: 48.5, x: 58, z: 27 },
    { t: 50.5, x: 56, z: 25 },
    { t: 57.9, x: 56, z: 52 },
    { t: 58, x: 56, z: 52, hide: true },
  ],
});

// 遅れて来た方：入場は曲間のみ
const lateSeat = seatOf(268);
add('LV_late', {
  color: 0x2f6fdd,
  kfs: [
    { t: 63.0, x: 45.0, z: 1.8, yaw: FACE.W },
    { t: 66.0, x: 39.2, z: 1.8 },
    { t: 77.4, x: 39.2, z: 1.8, yaw: FACE.W },
    { t: 78.6, x: 33.0, z: 3.6 },
    { t: 79.7, x: 29.6, z: 4.4 },
    { t: 80.6, x: layout.eastWallX, z: 4.4 },
    { t: 82.0, x: 21.5, z: 4.4 },
    { t: 82.3, x: 21.5, z: 4.4, hide: true },
  ],
});

// 着席している観客（固定の席・42秒から）
const audienceIdx = [];
for (let k = 0; k < 44; k++) audienceIdx.push((5 + k * 6 + (k % 3)) % 300);
audienceIdx.forEach((si, k) => {
  const s = seatOf(si);
  add('A' + k, { color: V[k % V.length], kfs: [{ t: 42, x: s.x, z: s.z, yaw: s.yaw, seat: true }] });
});

export const ACTORS = actors;

// ---------------------------------------------------------------- ドア
const OPEN_ANIM = {
  lower: [
    [32.6, 34.0, 1], [45.0, 46.5, 0], [78.3, 79.1, 1], [81.7, 82.7, 0],
  ],
  upper: [
    [33.0, 34.4, 1], [45.0, 46.5, 0],
  ],
};
function doorOpen(id, t) {
  let v = 0;
  for (const [a, b, to] of OPEN_ANIM[id]) {
    if (t < a) return v;
    if (t < b) return lerp(v, to, smooth((t - a) / (b - a)));
    v = to;
  }
  return v;
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
  open1: { pos: [58, 11.5, 5], target: [29, 0, 0.5] },
  open2: { pos: [51, 10.5, 5], target: [28, 0, 0.5] },
  park1: { pos: [55, 150, 190], target: [55, 0, 52] },
  park2: { pos: [55, 132, 172], target: [55, 0, 58] },
  quiet1: { pos: [30, 17, 34], target: [13, 0, -1] },
  quiet2: { pos: [27, 15, 31], target: [12, 0, -1] },
  late1: { pos: [48, 21, 36], target: [23, 0, 1.0] },
  late2: { pos: [45, 19, 33], target: [22, 0, 1.0] },
};
const camSched = [
  [T.intro, C.ovA, C.ovB],
  [receptionParts.queue, C.booth1, C.booth2],
  [receptionParts.steps, C.steps1, C.steps2],
  [receptionParts.handover, C.enter1, C.enter2],
  [[25, 28.3], C.toilet1, C.toilet2],
  [[28.3, 30], C.deck1, C.deck2],
  [T.open, C.open1, C.open2],
  [T.parking, C.park1, C.park2],
  [[58, 72], C.quiet1, C.quiet2],
  [[72, 82], C.late1, C.late2],
  [T.outro, C.ovB, C.ovA],
];
export function cameraAt(t) {
  let seg = camSched[camSched.length - 1];
  for (const s of camSched) if (inR(t, s[0])) seg = s;
  const [[t0, t1], a, b] = seg;
  const k = smooth((t - t0) / (t1 - t0));
  return {
    pos: a.pos.map((v, i) => lerp(v, b.pos[i], k)),
    target: a.target.map((v, i) => lerp(v, b.target[i], k)),
    up: [0, 1, 0],
  };
}

// ---------------------------------------------------------------- ラベル（3D スプライト）
export const LABEL_DEFS = [
  { id: 'booth', text: '受け渡し窓口（1か所・机なし）', pos: [41.4, 4.0, -5.25], fs: 34, t: [6, 25] },
  { id: 'queue', text: '行列は窓口の正面からまっすぐ', pos: [46.0, 3.0, -5.25], fs: 34, t: [6, 20] },
  { id: 'toilet', text: '2階トイレ（位置は仮）', pos: [42.8, 7.6, -7.8], fs: 34, t: [25, 30] },
  { id: 'doorLow', text: '館長室と放送室の間のドア', pos: [29.0, 3.7, 4.4], fs: 34, t: [30, 42] },
  { id: 'doorUp', text: '上手側のドア', pos: [29.0, 3.7, -4.2], fs: 34, t: [30, 42] },
  { id: 'noSeat2', text: '2階席は着席NG', pos: [20.0, 6.8, -12.0], fs: 38, t: [35, 42] },
  { id: 'gate', text: '玄関 1名', pos: [36.2, 4.6, -3.0], fs: 34, t: [73, 82] },
  { id: 'foyer', text: 'ホワイエ 1名', pos: [29.8, 3.4, 3.5], fs: 34, t: [73, 77.4] },
  { id: 'lower', text: '下手の壁際 2名', pos: [8, 3.6, 16.9], fs: 34, t: [73, 82] },
  { id: 'upper', text: '上手の壁際 2名', pos: [10, 3.6, -16.9], fs: 34, t: [73, 82] },
  { id: 'wait', text: '曲間まで待機', pos: [40.5, 3.2, 4.4], fs: 34, t: [66, 77.4] },
  { id: 'enter', text: '曲間に入場', pos: [33.0, 3.4, 6.4], fs: 34, t: [77.6, 82] },
  { id: 'noSeat3', text: '2階席は着席NG', pos: [3.0, 6.8, -19.6], fs: 36, t: [58, 66] },
];

// ---------------------------------------------------------------- 効果（波紋・吹き出し・×）
function ripples(t) {
  const out = [];
  const life = 1.7;
  // 足音：S_L2 が歩く間 0.6 秒ごと
  for (let k = 0; k < 5; k++) {
    const ts = 62.2 + 0.55 * k;
    if (t >= ts && t < ts + life) {
      const a = sampleKeyframes(actorById.S_L2.kfs, ts);
      out.push({ x: a.x, z: a.z, u: (t - ts) / life, kind: 'step' });
    }
  }
  // 会話：S_L1 と S_L2 の間で 66.4〜69.5
  for (let k = 0; k < 5; k++) {
    const ts = 66.4 + 0.65 * k;
    if (t >= ts && t < ts + 2.0 && ts < 69.6) {
      for (const id of ['S_L1', 'S_L2']) {
        const a = sampleKeyframes(actorById[id].kfs, ts);
        out.push({ x: a.x, z: a.z, u: (t - ts) / 2.0, kind: 'talk' });
      }
    }
  }
  return out;
}
const actorById = Object.fromEntries(actors.map((a) => [a.id, a]));

// ---------------------------------------------------------------- HUD 文言
function hud(t) {
  const H = { chip: '', chipClass: 'info', step: '', sub: '', panel: null, clockBig: false, scene: '' };
  const steps3 = ['予約のお名前を確認', 'リストで照合', 'チケットをお渡し'];
  if (inR(t, T.intro)) {
    H.scene = 'intro';
    H.chip = '運営スタッフ向け';
    H.step = '本日の運営で気をつける3つのこと';
    H.sub = '① 受付　② 駐車場案内　③ 公演中の私語を慎む。開場は 17:00 です。';
    H.panel = { title: '3つのこと', items: ['① 受付', '② 駐車場案内', '③ 公演中は静かに'], active: -1 };
  } else if (inR(t, T.reception)) {
    H.scene = 'reception';
    H.chip = '① 受付';
    H.chipClass = 'setup';
    H.step = 'チケットの受け渡し（もぎりなし）';
    if (inR(t, receptionParts.queue)) H.sub = '担当：佐賀県文化課／LiveS Beyond事務局。窓口は玄関の庇の下・右手に1か所、机はありません。';
    else if (inR(t, receptionParts.steps)) {
      H.sub = '行列は窓口の正面からまっすぐ。当日券も同じ窓口。引換用チケットは松永さん保管→山浦さんへ。';
      let a = -1;
      receptionSteps.forEach((s, i) => {
        if (t >= s.t) a = i;
      });
      H.panel = { title: '窓口の手順', items: steps3.map((s, i) => `${i + 1}  ${s}`), active: a, showUntil: a + 1 };
    } else if (inR(t, receptionParts.handover)) {
      H.sub = rules.ticketCheckAtDoor
        ? '受け渡しが完了した方から入館。開場後、左手のドアでチケットを確認して入場します。'
        : '受け渡しが完了した方のみ入館できます。入場時のチケット確認（もぎり）はありません。';
    } else H.sub = '受け渡し後は、玄関の2階のトイレを開場前でも自由に使えます。';
  } else if (inR(t, T.open)) {
    H.scene = 'open';
    H.chip = '開場 17:00';
    H.chipClass = 'setup';
    H.step = '17:00 になったら、ドアを開けて開場';
    H.clockBig = t < 38;
    H.sub =
      t < 36
        ? rules.ticketCheckAtDoor
          ? '館長室と放送室の間のドアと上手側のドアを開ける。左手のドアでチケットを確認して入場。'
          : '館長室と放送室の間のドアと、上手側のドアを開けます。チケット確認は行いません。'
        : '2階席は着席NG。玄関とホワイエのドアに各1名が立ちます。';
  } else if (inR(t, T.parking)) {
    H.scene = 'parking';
    H.chip = '② 駐車場案内';
    H.chipClass = 'setup';
    H.step = '「駐車場なし」は案内済み。迷った方をフォロー';
    if (t < 48.5) H.sub = '駐車場がないことは、チラシ・申込フォームで案内済み。迷っている方がいれば案内します。';
    else if (t < 53) H.sub = '市村駐車場は関係者のみ。案内先は主な有料駐車場（佐嘉神社外苑駐車場・会場の東 約95 m）。';
    else H.sub = '駐車場の北側入口・南側入口に各1名が立ちます。位置関係は概略です。';
  } else if (inR(t, T.quiet)) {
    H.scene = 'quiet';
    H.chip = '③ 公演中';
    H.chipClass = 'teardown';
    H.step = '公演中は私語を慎む';
    const items = ['足音・ドアの音が響く', '会話は必要最低限に', '遅れた方の入場は曲間のみ'];
    if (inR(t, quietParts.intro)) {
      H.sub = '足音が響き、各ドアの遮音性も低い会場です。演奏は生音に近い音量で行います。';
      H.panel = { title: '公演中に気をつけること', items: items.map((s, i) => `${i + 1}  ${s}`), active: 0, showUntil: 1 };
    } else if (inR(t, quietParts.talk)) {
      H.sub = '玄関付近を含め、スタッフ同士の会話は必要最低限にとどめます。';
      H.panel = { title: '公演中に気をつけること', items: items.map((s, i) => `${i + 1}  ${s}`), active: 1, showUntil: 2 };
    } else {
      H.sub = '壁際は下手・上手に各2名、玄関とホワイエのドアに各1名。遅れた方の入場は曲間のみ。';
      H.panel = { title: '公演中に気をつけること', items: items.map((s, i) => `${i + 1}  ${s}`), active: 2, showUntil: 3 };
    }
  } else {
    H.scene = 'outro';
    H.chip = 'まとめ';
    H.step = '受付・駐車場案内・私語を慎む';
    H.sub = '受付は 予約名→リスト照合→チケットをお渡し。迷った方は有料駐車場へ。公演中は静かに。';
    const a = t < 84 ? 0 : t < 86 ? 1 : 2;
    H.panel = { title: '3つのこと', items: ['① 受付', '② 駐車場案内', '③ 公演中は静かに'], active: a, showUntil: 3 };
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
  const labels = {};
  for (const l of LABEL_DEFS) labels[l.id] = inR(t, l.t);
  const scene = hud(t).scene;
  return {
    t,
    people,
    camera: cameraAt(t),
    doors: { lower: doorOpen('lower', t), upper: doorOpen('upper', t) },
    labels,
    ripples: ripples(t),
    bubbles: t >= 66.4 && t < 69.6,
    cross: t >= 69.7 && t < 72.6,
    hud: hud(t),
    scene,
    deckVisible: scene !== 'open' && scene !== 'quiet' && !(t >= 24.5 && t < 28.3),
    markerScale: scene === 'parking' ? 3.4 : scene === 'quiet' || scene === 'open' ? 1.15 : 0,
    songBreak: t >= songBreakAt && t < songBreakAt + 3,
  };
}

export { T };
