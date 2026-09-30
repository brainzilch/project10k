// =====================================================================
//  運営スタッフ注意喚起動画 設定ファイル
//
//  座標は設営動画と同じ 3D 座標（原点＝演奏位置、単位 m）。
//    x：右がホワイエ／玄関側、左がステージ側   z：小さい方が平面図の上（上手側）、大きい方が下（下手側）
//  平面図（作図用座標）から x=(planX-773)/15.85, z=(planY-667)/15.85 で換算した概算です。現地実測値ではありません。
//  「// 仮」は未確認の値、「// 回答済み」は依頼者の回答を反映した値です。
// =====================================================================

export const staffVideo = {
  duration: 90, // 秒。長さの目安は仮（案：約90秒）
};

// 方位：平面図の方位記号は右（玄関側）が北。よって +x = 北、+z = 東（駐車場は会場の東）。   // 仮（読み取り）
export const compass = { northAxis: '+x', eastAxis: '+z' };

// ---- 運用ルール（依頼者の回答） ---------------------------------------
export const rules = {
  // 入場時のチケット確認：回答が2通りあるため切り替え可能にしている。
  //  false = 「チケット確認は行わない。受け渡しを完了した人のみ来館できる」（運営としての回答）
  //  true  = 「17:00から建物内左手のドアを開場、チケット確認後に入場」（案内文の言い回し）
  ticketCheckAtDoor: false,
  openTime: '17:00', // 回答済み。これ以外の時刻（開演・終演など）は未提供
  seatsOn2FAllowed: false, // 2階席は着席NG（回答済み）
  lateEntryOnlyBetweenSongs: true, // 遅れて来た方の入場は曲間のみ（回答済み）
};

// ---- 建物レイアウト ---------------------------------------------------
export const layout = {
  eastWallX: 27.15,
  // 体育館とホワイエの間のドア：上手側（z-）と下手側（z+）。下手側は館長室と放送室の間（回答済み）
  gymDoors: [
    { id: 'upper', z: -4.2, w: 2.4, h: 2.6, label: '上手側ドア' },
    { id: 'lower', z: 4.4, w: 2.4, h: 2.6, label: '館長室と放送室の間のドア（下手側）' },
  ],
  foyer: { x0: 27.3, x1: 40.2, z0: -10.2, z1: 10.2 },
  rooms: {
    broadcast: { x0: 27.3, x1: 30.85, z0: -3.0, z1: 3.1, label: '放送室' },
    director: { x0: 27.3, x1: 33.2, z0: 5.7, z1: 9.8, label: '館長室' },
    meeting: { x0: 27.3, x1: 33.2, z0: -10.2, z1: -5.6, label: '集会室' },
  },
  entrance: { x: 40.2, doorZ: [-1.8, 1.8], doorW: 1.7, doorH: 2.5 },
  porch: { x0: 40.2, x1: 46.2, z0: -8, z1: 8 },
  deck: { x0: 38.9, x1: 46.2, z0: -10.2, z1: 10.2, y: 4.2 }, // 玄関上の2階バルコニー（写真の白い手すり）
  booth: { x0: 40.4, x1: 42.4, z0: -6.6, z1: -3.9, windowZ: -5.25 }, // 受け渡し窓口（玄関に向かって右手・庇の下）
  toilet2F: { x0: 41.0, x1: 44.6, z0: -9.6, z1: -6.0 }, // 2階トイレの位置は仮（「玄関の2階」までが回答）  // 仮
  stairs: { xLine: 35.4, width: 1.8, landingZ: 10.0 },
  queue: { x0: 43.6, pitch: 1.0, z: -5.25 }, // 行列は窓口の正面からまっすぐ（回答済み）
};

// ---- 駐車場（周辺図：概略）---------------------------------------------
// 会場（33.24973, 130.30186）と佐嘉神社外苑駐車場（33.24981, 130.30288）の座標差から、駐車場は会場の東 約95 m。
export const parking = {
  lot: { x0: -31, x1: 141, z0: 75, z1: 115 }, // 航空写真からの概略。北側入口＝x1 側、南側入口＝x0 側     // 仮
  northGate: { x: 137, z: 75 },
  southGate: { x: -27, z: 75 },
  distanceLabel: '会場の東 約95 m（地図の座標から算出）',
};

// ---- 公演中のスタッフ配置（回答済み）-------------------------------------
export const stations = {
  wallLower: [
    { x: 3, z: 16.9 },
    { x: 17, z: 16.9 },
  ], // 下手側の壁際 2名
  wallUpper: [
    { x: 3, z: -16.9 },
    { x: 17, z: -16.9 },
  ], // 上手側の壁際 2名
  gate: { x: 37.6, z: 0 }, // 玄関のドア 1名
  foyerDoor: { x: 31.8, z: 3.6 }, // ホワイエのドア 1名（ホワイエ側から体育館へのドア付近）   // 仮（解釈）
};

// ---- タイムライン（秒）-----------------------------------------------
export const T = {
  intro: [0, 6],
  reception: [6, 30],
  open: [30, 42],
  parking: [42, 58],
  quiet: [58, 82],
  outro: [82, 90],
};
// 受付の小区間
export const receptionParts = {
  queue: [6, 10],
  steps: [10, 20],
  handover: [20, 25],
  toilet: [25, 30],
};
// 手順カード（受付）
export const receptionSteps = [
  { t: 10.5, text: '予約のお名前を確認' },
  { t: 13.5, text: 'リストで照合' },
  { t: 16.5, text: 'チケットをお渡し' },
];
// 公演中の小区間
export const quietParts = {
  intro: [58, 66], // 足音が響く・ドアの遮音性が低い・生音
  talk: [66, 72], // 会話は必要最低限に
  stations: [72, 82], // 配置と、遅れて来た方は曲間のみ
};
export const songBreakAt = 77.2; // 曲間（遅れて来た方が入れる）。演出上の値

// ---- 効果音・音楽のきっかけ（秒）-----------------------------------------
export const cues = [
  { t: 0.15, type: 'whoosh' },
  { t: 6.0, type: 'whoosh' },
  { t: 30.0, type: 'whoosh' },
  { t: 42.0, type: 'whoosh' },
  { t: 58.0, type: 'whoosh' },
  { t: 82.0, type: 'whoosh' },
  // 受付の手順
  { t: 10.5, type: 'ding', note: 0 },
  { t: 13.5, type: 'ding', note: 1 },
  { t: 16.5, type: 'ding', note: 2 },
  { t: 18.8, type: 'pop' },
  // 受け渡し後の移動
  { t: 20.4, type: 'steps', dur: 3.0, tail: 0.3 },
  { t: 24.6, type: 'steps', dur: 4.0, tail: 0.3 },
  // 開場 17:00
  { t: 31.4, type: 'chime17' },
  { t: 34.2, type: 'door' },
  { t: 34.6, type: 'door' },
  { t: 35.6, type: 'steps', dur: 5.0, tail: 0.3 },
  // 駐車場案内
  { t: 44.0, type: 'ding', note: 0 },
  { t: 48.5, type: 'ding', note: 1 },
  { t: 53.0, type: 'ding', note: 2 },
  { t: 46.0, type: 'steps', dur: 6.0, tail: 0.2 },
  // 公演中
  { t: 59.0, type: 'shh' },
  { t: 62.0, type: 'steps', dur: 2.0, tail: 1.6 }, // 足音が響く
  { t: 66.4, type: 'murmur', dur: 3.2 }, // 会話
  { t: 69.7, type: 'buzz' }, // ×
  { t: 73.0, type: 'ding', note: 1 },
  { t: 77.2, type: 'applause', dur: 3.2 },
  { t: 78.6, type: 'door' },
  { t: 79.0, type: 'steps', dur: 2.6, tail: 0.6 },
  { t: 81.8, type: 'door' },
  // まとめ
  { t: 83.0, type: 'ding', note: 0 },
  { t: 85.0, type: 'ding', note: 1 },
  { t: 87.0, type: 'ding', note: 2 },
  { t: 89.0, type: 'chime' },
];

// 生演奏（公演中）の区間。この間は BGM を下げて、生音に近い小さめのピアノだけにする
export const livePiano = { from: 58.0, to: 77.2 };

export default { staffVideo, rules, layout, parking, stations, T, receptionParts, receptionSteps, quietParts, songBreakAt, cues, livePiano };
