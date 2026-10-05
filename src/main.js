// エントリ：シーン構築、タイムラインの適用、プレビュー操作、書き出し用 API
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import cfg, { video, storage, exhibits as exhibitCfg, performance, cameras as camCfg, pa as paCfg } from './config.js';
import { buildVenue } from './venue.js';
import { buildChairs, buildPiano, buildDoubleBass, buildExhibits, buildSheets, buildPA, buildSeatMarks, makeTextSprite, makeFitSprite, makeCameraIconSprite } from './props.js';
import { makePerson, setPose } from './staff/people.js';
import { computeState, CAMS } from './timeline.js';
import { createHud } from './hud.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.get('capture') === '1';
if (CAPTURE) document.body.classList.add('capture');

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('gl');
const stageEl = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1f26);
const camera = new THREE.PerspectiveCamera(camCfg.fov, 16 / 9, 0.1, 400);

// ライト
const hemi = new THREE.HemisphereLight(0xfff5e0, 0x6b5a45, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(20, 40, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -40;
sc.right = 40;
sc.top = 40;
sc.bottom = -40;
sc.near = 5;
sc.far = 120;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun);
scene.add(sun.target);
sun.target.position.set(8, 0, 0);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9);
fill.position.set(-30, 25, -20);
scene.add(fill);
const amb = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(amb);

// ---------------------------------------------------------------- objects
const venue = buildVenue();
scene.add(venue.group);

const chairs = buildChairs();
scene.add(chairs.group);

const piano = buildPiano();
scene.add(piano);
const bass = buildDoubleBass();
scene.add(bass);

const exhibits = buildExhibits();
exhibits.forEach((e) => scene.add(e.group));

const sheets = buildSheets();
scene.add(sheets.group);

// 椅子を並べる位置の目印（床の養生テープ）と作業者
const marks = buildSeatMarks();
scene.add(marks.group);
const workers = [makePerson({ staff: true }), makePerson({ staff: true })];
workers.forEach((w) => {
  w.visible = false;
  scene.add(w);
});
const ZN = marks.zones;
const zoneMid = (sec) => {
  const z = ZN[cfg.chairs.order.indexOf(sec)];
  const c = z.corners;
  return { x: (c[0].x + c[1].x + c[2].x + c[3].x) / 4, z: (c[0].z + c[1].z + c[2].z + c[3].z) / 4 };
};
const markLabelDefs = {
  center: { text: '基準点：演奏位置の中心に × 印', pos: [0, 2.4, 0], fs: 36 },
  peel: { text: 'テープをはがす（ゾーンごとに）', pos: [cfg.chairs.r0 + 6, 2.1, 0], fs: 36 },
  align: { text: 'テープの範囲の中に椅子を置く', pos: [cfg.chairs.r0 + 6, 2.1, 0], fs: 36 },
  aisle: { text: 'ゾーンの間＝通路（テープなし）', pos: [8.5, 1.2, -3.0], fs: 34 },
};
for (const sec of cfg.chairs.order) {
  const m = zoneMid(sec);
  markLabelDefs[`zone${sec}`] = { text: `${sec}：外周を直線のテープで囲む`, pos: [m.x - 3.2, 1.4, m.z + (sec === 'A' ? -3.0 : sec === 'C' ? 3.0 : 0)], fs: 34 };
  markLabelDefs[`dots${sec}`] = { text: `${sec}：巻き尺で4つの角に印`, pos: [m.x - 3.2, 1.4, m.z + (sec === 'A' ? -3.0 : sec === 'C' ? 3.0 : 0)], fs: 34 };
}
const markLabels = {};
for (const [k, d] of Object.entries(markLabelDefs)) {
  const sp = makeFitSprite(d.text, { border: '#ffffff' });
  sp.position.set(...d.pos);
  sp.userData.screenFont = d.fs;
  sp.visible = false;
  scene.add(sp);
  markLabels[k] = sp;
}

// 音響（PA）：スピーカーと音響卓の仮位置。椅子の設置と同時に出し、設営手順には番号を付けない
const pa = buildPA();
scene.add(pa.group);
const paLabels = pa.items.map((it) => {
  const sp = makeTextSprite(it.label, { width: 4.6, border: '#93c5fd', fontSize: 78 });
  sp.position.set(it.x, it.h + 0.6, it.z);
  sp.visible = false;
  scene.add(sp);
  return sp;
});

// 収納庫ラベル・演奏位置ラベル
const storageLabel = makeTextSprite(storage.label, { width: 5.5 });
storageLabel.position.set(storage.door.x, 3.7, storage.door.z + (storage.door.z > 0 ? -0.8 : 0.8));
scene.add(storageLabel);
const perfLabel = makeTextSprite('演奏位置（赤丸）', { width: 5.5, border: '#e0202a' });
perfLabel.position.set(performance.center.x, 3.2, performance.center.z);
scene.add(perfLabel);
const exhibitLabel = makeTextSprite('中央展示物（仮）', { width: 5.5, border: '#93c5fd' });
scene.add(exhibitLabel);
const camIcon = makeCameraIconSprite();
scene.add(camIcon);

// ---------------------------------------------------------------- state application
const ctx = { rects: sheets.rects, chairCount: chairs.total };
let currentState = null;

function applyState(state, camOverride) {
  sheets.update(state.sheets);
  chairs.update(state.chairs);
  exhibits.forEach((e, j) => {
    const s = state.exhibits[j];
    e.group.position.set(s.x, s.moving ? 0.12 : 0, s.z);
    e.group.rotation.y = s.rotY;
  });
  const p = state.piano;
  piano.position.set(p.x, p.moving ? 0.05 : 0, p.z);
  piano.rotation.y = p.rotY;
  piano.getObjectByName('dolly').visible = p.moving;
  bass.visible = state.bassVisible;
  bass.position.set(performance.bass.position.x, 0, performance.bass.position.z);
  bass.rotation.y = performance.bass.rotationDeg * (Math.PI / 180);
  // 音響（椅子が1脚でもあるあいだ表示。ラベルは完成状態の場面だけ）
  pa.group.visible = paCfg.show && state.chairs.some((p) => p > 0);
  const tl = cfg.timeline;
  const showPaLabels = paCfg.show && (state.t < tl.intro[1] || (state.t >= tl.complete[0] && state.t < tl.complete[1]));
  paLabels.forEach((sp) => (sp.visible = showPaLabels));
  // 床のテープ・作業者・ラベル
  marks.update(state.tape);
  setPose(workers[0], state.tape.workers[0]);
  setPose(workers[1], state.tape.workers[1]);
  for (const k of Object.keys(markLabels)) markLabels[k].visible = !!state.tape.labels[k];
  // ラベル
  const ex0 = state.exhibits[0];
  const exHome = exhibitCfg[0].home;
  const exAtHome = Math.hypot(ex0.x - exHome.x, ex0.z - exHome.z) < 0.05;
  exhibitLabel.visible = exAtHome;
  exhibitLabel.position.set(exHome.x, 3.2, exHome.z);
  perfLabel.visible = !state.hud.showPhoto && !state.tape.hidePerf;
  camIcon.visible = state.photo.iconVisible;
  camIcon.position.set(exHome.x + 3.5, 2.6 + Math.sin(state.t * 4) * 0.1, exHome.z + 3.5);

  // カメラ
  const c = camOverride || state.camera;
  camera.up.set(c.up[0], c.up[1], c.up[2]);
  camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
  camera.lookAt(c.target[0], c.target[1], c.target[2]);
  // カメラが建物の外（南側）や天井より上にあるときは、その側の壁・観覧席・天井を消して内部を見せる
  venue.south.visible = c.pos[2] <= cfg.venue.floor.zMax + 0.3;
  venue.ceiling.visible = c.pos[1] < cfg.venue.ceiling.edgeHeight - 0.5;
  // 半透明の収納庫ボックスの中や近くにカメラがあるときは、ボックス越しに見えないよう非表示
  const sb = venue.storageBox;
  const nearBox = c.pos[0] > sb.xMin - 1.5 && c.pos[0] < sb.xMax + 1.5 && c.pos[2] > sb.zMin - 1.5 && c.pos[2] < sb.zMax + 1.5 && c.pos[1] < sb.yMax + 2.5;
  venue.storageRoom.visible = !nearBox;
  const highView = c.pos[1] > 15;
  perfLabel.visible = perfLabel.visible && highView;
  exhibitLabel.visible = exhibitLabel.visible && highView;
  storageLabel.visible = c.pos[1] > 8 && c.pos[1] < 15 && !state.tape.hidePerf;
  // 帯番号のスプライトはカメラが近いときに小さくする
  const camPos = new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]);
  for (const b of sheets.bands) {
    const d = b.label.position.distanceTo(camPos);
    const sc = 2.2 * Math.max(0.35, Math.min(1, d / 30));
    b.label.scale.set(sc, sc, 1);
  }
  // テープのラベルは、画面上の文字サイズをそろえる
  const halfTan = Math.tan((camera.fov * Math.PI) / 360);
  for (const sp of Object.values(markLabels)) {
    if (!sp.visible) continue;
    const hPx = (sp.userData.screenFont * (sp.userData.canvasH || 256)) / (sp.userData.fontPx || 96);
    const h = (hPx / 1080) * 2 * camPos.distanceTo(sp.position) * halfTan;
    sp.scale.set((sp.userData.aspect || 4) * h, h, 1);
  }
  hud.update(state);
}

// ---------------------------------------------------------------- 写真（展示物の移動前の状態を真上から撮った画像）
function makeExhibitPhoto() {
  const w = 512;
  const h = 320;
  const rt = new THREE.WebGLRenderTarget(w, h, { colorSpace: THREE.SRGBColorSpace });
  const cam = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
  const home = exhibitCfg[0].home;
  cam.position.set(home.x + 6, 5, home.z + 5);
  cam.lookAt(home.x, 0.6, home.z);
  const prevBg = scene.background;
  // 展示物を元位置に置いて撮影
  const state = computeState(cfg.timeline.s2[0] + 0.1, ctx);
  applyState(state);
  exhibitLabel.visible = false;
  perfLabel.visible = false;
  storageLabel.visible = false;
  camIcon.visible = false;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  const buf = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  renderer.setRenderTarget(null);
  storageLabel.visible = true;
  scene.background = prevBg;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * w * 4;
    img.data.set(buf.subarray(src, src + w * 4), y * w * 4);
  }
  g.putImageData(img, 0, 0);
  // 日付風のスタンプ
  g.fillStyle = 'rgba(255,200,60,0.95)';
  g.font = 'bold 26px sans-serif';
  g.fillText('設営前 撮影', 16, h - 18);
  rt.dispose();
  return c.toDataURL('image/png');
}

// ---------------------------------------------------------------- HUD / resize
const hud = createHud();
function resize() {
  const w = CAPTURE ? video.width : stageEl.clientWidth;
  const h = CAPTURE ? video.height : stageEl.clientHeight;
  renderer.setPixelRatio(CAPTURE ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hud.fit(stageEl);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- preview controls
const playBtn = document.getElementById('btn-play');
const seek = document.getElementById('seek');
const timeEl = document.getElementById('time');
const camSelect = document.getElementById('cam-select');
const speedSel = document.getElementById('speed');
const stillBtn = document.getElementById('btn-still');
seek.max = String(video.duration);

let t = 0;
let playing = false;
let speed = 1;
let camMode = 'auto';
const orbit = new OrbitControls(camera, canvas);
orbit.enabled = false;
orbit.target.set(8, 0, 0);

function renderAt(time) {
  t = Math.max(0, Math.min(video.duration, time));
  currentState = computeState(t, ctx);
  let override = null;
  if (camMode === 'overview') override = { ...CAMS.overviewHigh, up: [0, 1, 0] };
  else if (camMode === 'top') override = { ...CAMS.top };
  if (camMode === 'free') {
    // 自由カメラ：位置は OrbitControls に任せる
    sheets.update(currentState.sheets);
    chairs.update(currentState.chairs);
    applyState(currentState, { pos: camera.position.toArray(), target: orbit.target.toArray(), up: [0, 1, 0] });
    orbit.update();
  } else {
    applyState(currentState, override);
  }
  renderer.render(scene, camera);
  seek.value = String(t);
  timeEl.textContent = `${t.toFixed(1)} / ${video.duration.toFixed(1)} s`;
}

hud.setPhoto(makeExhibitPhoto());

let last = performance_now();
function performance_now() {
  return window.performance.now() / 1000;
}
function loop() {
  requestAnimationFrame(loop);
  const now = performance_now();
  const dt = now - last;
  last = now;
  if (playing) {
    let nt = t + dt * speed;
    if (nt >= video.duration) {
      nt = 0; // ループ再生
    }
    renderAt(nt);
  } else if (camMode === 'free') {
    renderAt(t);
  }
}

playBtn.addEventListener('click', () => {
  playing = !playing;
  playBtn.textContent = playing ? '❚❚ 一時停止' : '▶ 再生';
});
seek.addEventListener('input', () => {
  playing = false;
  playBtn.textContent = '▶ 再生';
  renderAt(parseFloat(seek.value));
});
camSelect.addEventListener('change', () => {
  camMode = camSelect.value;
  orbit.enabled = camMode === 'free';
  if (camMode === 'free') {
    camera.up.set(0, 1, 0);
    camera.position.set(22, 20, 30);
    orbit.target.set(8, 0, 0);
  }
  renderAt(t);
});
speedSel.addEventListener('change', () => (speed = parseFloat(speedSel.value)));
stillBtn.addEventListener('click', () => {
  renderAt(t);
  const a = document.createElement('a');
  a.download = `frame_${t.toFixed(2)}s.png`;
  a.href = renderer.domElement.toDataURL('image/png');
  a.click();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    playBtn.click();
  } else if (e.code === 'ArrowRight') renderAt(t + (e.shiftKey ? 5 : 1));
  else if (e.code === 'ArrowLeft') renderAt(t - (e.shiftKey ? 5 : 1));
});

// ---------------------------------------------------------------- 書き出し用 API（Playwright から呼ぶ）
window.__anim = {
  duration: video.duration,
  fps: video.fps,
  chairCounts: chairs.counts,
  chairTotal: chairs.total,
  bandRects: sheets.rects,
  /** 指定時刻を描画して、描画完了まで待つ */
  async setTime(time, mode = 'auto') {
    camMode = mode;
    playing = false;
    renderAt(time);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return currentState && { t: currentState.t, chairCount: currentState.chairCount, hud: currentState.hud };
  },
  getState: () => currentState,
  // デバッグ用
  three: { renderer, scene, camera, sheets, venue },
  ready: true,
};

renderAt(0);
if (!CAPTURE) {
  playing = true;
  playBtn.textContent = '❚❚ 一時停止';
}
loop();
