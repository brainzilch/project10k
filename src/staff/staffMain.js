// 運営スタッフ注意喚起動画：シーン構築・時刻の適用・プレビュー操作・書き出し API
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import cfg, { video, cameras as camCfg } from '../config.js';
import { buildVenue } from '../venue.js';
import { buildChairs, buildPiano, buildDoubleBass, buildExhibits, buildSheets, makeFitSprite, makeLabelSprite } from '../props.js';
import { computeState as computeSetupState } from '../timeline.js';
import { layout, T, staffVideo } from './staffConfig.js';
import { buildFoyer, setDoorOpen } from './foyer.js';
import { buildSurroundings } from './surroundings.js';
import { makePerson, setPose, makeCar } from './people.js';
import { ACTORS, LABEL_DEFS, computeStaffState } from './staffTimeline.js';

const params = new URLSearchParams(location.search);
const CAPTURE = params.get('capture') === '1';
if (CAPTURE) document.body.classList.add('capture');
const DURATION = staffVideo.duration;

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
scene.background = new THREE.Color(0x1b2330);
const camera = new THREE.PerspectiveCamera(camCfg.fov, 16 / 9, 0.1, 900);

scene.add(new THREE.HemisphereLight(0xfff5e0, 0x6b5a45, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(40, 60, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -55;
sc.right = 55;
sc.top = 55;
sc.bottom = -55;
sc.near = 5;
sc.far = 200;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
sun.target.position.set(20, 0, 0);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9);
fill.position.set(-30, 25, -20);
scene.add(fill, new THREE.AmbientLight(0xffffff, 0.35));

// ---------------------------------------------------------------- 会場
const venue = buildVenue({ eastDoors: layout.gymDoors });
scene.add(venue.group);
venue.eastOuter.visible = false;
const foyer = buildFoyer();
scene.add(foyer.group);
const surroundings = buildSurroundings();
scene.add(surroundings.group);

// 公演の状態（椅子300脚・ピアノ・コントラバス・養生シート）は設営動画の完成状態を再利用
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
{
  const st = computeSetupState(72, { rects: sheets.rects, chairCount: chairs.total });
  st.sheets.forEach((s) => (s.showLabel = false));
  sheets.update(st.sheets);
  chairs.update(st.chairs);
  exhibits.forEach((e, j) => {
    const s = st.exhibits[j];
    e.group.position.set(s.x, 0, s.z);
    e.group.rotation.y = s.rotY;
  });
  piano.position.set(st.piano.x, 0, st.piano.z);
  piano.rotation.y = st.piano.rotY;
  piano.getObjectByName('dolly').visible = false;
  bass.position.set(cfg.performance.bass.position.x, 0, cfg.performance.bass.position.z);
  bass.rotation.y = cfg.performance.bass.rotationDeg * (Math.PI / 180);
}

// ---------------------------------------------------------------- 人物・ラベル・効果
const persons = {};
const markers = {};
const markerGeo = new THREE.RingGeometry(0.72, 1.0, 40);
for (const a of ACTORS) {
  const p = a.car ? makeCar(0x2f6fdd) : makePerson({ staff: !!a.staff, color: a.color });
  p.visible = false;
  scene.add(p);
  persons[a.id] = p;
  if (a.marker) {
    const m = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: a.marker === 'staff' ? 0xf28c1a : 0x2f6fdd, transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.09;
    m.visible = false;
    m.material.depthTest = false;
    m.renderOrder = 6;
    scene.add(m);
    markers[a.id] = m;
  }
}
const labelSprites = {};
for (const l of LABEL_DEFS) {
  const s = makeFitSprite(l.text, { border: l.text.includes('NG') ? '#e05a5a' : '#f2c14e' });
  s.userData.screenFont = l.fs || 34;
  s.position.set(...l.pos);
  s.visible = false;
  scene.add(s);
  labelSprites[l.id] = s;
}
// ✔（チケット確認）
const checkSprites = [];
for (let i = 0; i < 4; i++) {
  const sp = makeLabelSprite('✔', '#ffffff', 0x2ea043, { fontSize: 150 });
  sp.scale.set(1.5, 1.5, 1);
  sp.visible = false;
  scene.add(sp);
  checkSprites.push(sp);
}
const rippleMeshes = [];
const rippleGeo = new THREE.RingGeometry(0.93, 1.0, 64);
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.12;
  m.visible = false;
  scene.add(m);
  rippleMeshes.push(m);
}
const bubbleL = makeFitSprite('…', { border: '#f2c14e', fontSize: 120 });
const bubbleR = makeFitSprite('…', { border: '#f2c14e', fontSize: 120 });
bubbleL.visible = bubbleR.visible = false;
scene.add(bubbleL, bubbleR);
const cross = makeLabelSprite('×', '#ffffff', 0xd62828, { fontSize: 200 });
cross.scale.set(4.6, 4.6, 1);
cross.visible = false;
scene.add(cross);
const crossTexts = {
  foyer: makeFitSprite('ホワイエ・玄関でも会話は必要最低限に', { border: '#d62828' }),
  hallStep: makeFitSprite('会場内も足音NG', { border: '#d62828' }),
  hallTalk: makeFitSprite('会場内も会話NG', { border: '#d62828' }),
};
Object.values(crossTexts).forEach((sp) => {
  sp.visible = false;
  scene.add(sp);
});

// ---------------------------------------------------------------- HUD
const el = {
  root: document.getElementById('hud'),
  chip: document.getElementById('hud-chip'),
  step: document.getElementById('hud-step'),
  sub: document.getElementById('hud-sub'),
  panel: document.getElementById('hud-panel'),
  clockBig: document.getElementById('hud-clock-big'),
  clock: document.getElementById('hud-clock'),
  compass: document.getElementById('hud-compass'),
  bar: document.getElementById('hud-progress-bar'),
  markers: document.getElementById('hud-markers'),
};
for (const k of ['reception', 'open', 'parking', 'quiet', 'outro']) {
  const d = document.createElement('div');
  d.className = 'm' + (k === 'quiet' ? ' td' : '');
  d.style.left = `${(T[k][0] / DURATION) * 100}%`;
  el.markers.appendChild(d);
}
function fitHud() {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  const s = Math.min(w / 1920, h / 1080);
  el.root.style.transform = `scale(${s})`;
  el.root.style.left = `${(w - 1920 * s) / 2}px`;
  el.root.style.top = `${(h - 1080 * s) / 2}px`;
}
function updateHud(st) {
  const H = st.hud;
  el.chip.textContent = H.chip;
  el.chip.className = 'chip ' + H.chipClass;
  el.step.textContent = H.step;
  el.sub.textContent = H.sub;
  el.sub.className = H.chipClass;
  el.compass.style.display = H.compass ? 'block' : 'none';
  el.clockBig.style.display = H.clockBig ? 'block' : 'none';
  if (H.clockBig) el.clockBig.innerHTML = `<div class="lbl">${H.clockBig.lbl}</div><div class="time">${H.clockBig.time}</div>`;
  el.clock.style.display = H.clockBig ? 'none' : 'block';
  el.clock.innerHTML =
    `<div class="row ${H.phase === 'recv' ? 'on' : ''}"><span class="time">16:30</span><span class="lbl">チケット受け渡し開始</span></div>` +
    `<div class="row ${H.phase === 'open' ? 'on' : ''}"><span class="time">17:00</span><span class="lbl">開場</span></div>`;
  if (H.panel) {
    el.panel.style.display = 'block';
    const P = H.panel;
    const upto = P.showUntil === undefined ? P.items.length : P.showUntil;
    el.panel.innerHTML =
      `<div class="ttl">${P.title}</div>` +
      P.items
        .map((s, i) => (i < upto ? `<div class="card ${i === P.active ? 'on' : i < P.active ? 'done' : ''}">${s}</div>` : ''))
        .join('');
  } else el.panel.style.display = 'none';
  el.bar.style.width = `${(st.t / DURATION) * 100}%`;
}

// ---------------------------------------------------------------- 撮影・録音の禁止カード
const banEl = document.getElementById('hud-ban');
const iconCam = `<svg viewBox="0 0 120 120"><rect x="14" y="36" width="92" height="60" rx="10" fill="#e5e7eb"/><rect x="40" y="26" width="30" height="14" rx="4" fill="#e5e7eb"/><circle cx="60" cy="66" r="20" fill="#374151"/><circle cx="60" cy="66" r="11" fill="#93c5fd"/></svg>`;
const iconVideo = `<svg viewBox="0 0 120 120"><rect x="10" y="34" width="66" height="52" rx="10" fill="#e5e7eb"/><path d="M80 52 L110 36 L110 84 L80 68 Z" fill="#e5e7eb"/><circle cx="26" cy="46" r="5" fill="#ef4444"/></svg>`;
const iconMic = `<svg viewBox="0 0 120 120"><rect x="44" y="12" width="32" height="56" rx="16" fill="#e5e7eb"/><path d="M30 56 a30 30 0 0 0 60 0" fill="none" stroke="#e5e7eb" stroke-width="7" stroke-linecap="round"/><line x1="60" y1="86" x2="60" y2="106" stroke="#e5e7eb" stroke-width="7" stroke-linecap="round"/><line x1="42" y1="106" x2="78" y2="106" stroke="#e5e7eb" stroke-width="7" stroke-linecap="round"/></svg>`;
const noSign = `<svg class="no" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="#e11d1d" stroke-width="12"/><line x1="24" y1="96" x2="96" y2="24" stroke="#e11d1d" stroke-width="12" stroke-linecap="round"/></svg>`;
banEl.innerHTML = [
  ['photo', iconCam, '写真'],
  ['video', iconVideo, '動画'],
  ['rec', iconMic, '録音'],
]
  .map(([id, icon, label]) => `<div class="card" data-id="${id}">${icon}${noSign}<div class="lbl">${label}</div></div>`)
  .join('');
function updateBan(st) {
  const b = st.ban;
  const any = b.photo || b.video || b.rec;
  banEl.style.display = any ? 'flex' : 'none';
  document.getElementById('hud-dim').style.display = any ? 'block' : 'none';
  banEl.querySelectorAll('.card').forEach((c) => {
    const on = b[c.dataset.id];
    c.style.display = on ? 'block' : 'none';
    const t0 = c.dataset.id === 'rec' ? 82.0 : b.t0;
    const u = Math.min(1, (st.t - t0) / 0.25);
    c.style.transform = `scale(${0.6 + 0.4 * u + 0.06 * Math.max(0, 1 - (st.t - t0) / 0.4)})`;
    c.style.opacity = String(Math.max(0, u));
  });
}

// ---------------------------------------------------------------- 状態の適用
let currentState = null;
const camPos = new THREE.Vector3();
function applyState(st, freeCam) {
  // 人物
  for (const a of ACTORS) {
    if (a.car) {
      const c = st.people[a.id];
      persons[a.id].visible = !!c.vis;
      if (c.vis) {
        persons[a.id].position.set(c.x, 0, c.z);
        persons[a.id].rotation.y = c.yaw;
      }
    } else setPose(persons[a.id], st.people[a.id]);
  }
  for (const [id, m] of Object.entries(markers)) {
    const p = st.people[id];
    m.visible = !!p.vis && st.markerScale > 0;
    if (m.visible) {
      m.position.set(p.x, 0.09, p.z);
      m.scale.setScalar(st.markerScale);
    }
  }
  // ドア
  for (const d of foyer.doors) setDoorOpen(d, st.doors[d.id]);
  // ラベル
  for (const l of LABEL_DEFS) labelSprites[l.id].visible = !!st.labels[l.id];
  // 暗幕・光
  const cur = foyer.curtain;
  cur.pivot.visible = st.curtain.drop > 0.01;
  cur.mesh.scale.y = Math.max(0.02, st.curtain.drop);
  cur.mesh.position.y = -(cur.h / 2) * Math.max(0.02, st.curtain.drop);
  cur.pivot.rotation.z = -st.curtain.swing * 0.55;
  foyer.wedge.visible = st.light > 0.01;
  foyer.wedge.material.opacity = 0.62 * st.light;
  // ✔
  checkSprites.forEach((sp) => (sp.visible = false));
  st.checks.slice(0, checkSprites.length).forEach((c, i) => {
    const sp = checkSprites[i];
    sp.visible = true;
    sp.position.set(c.x, 2.5 + c.u * 0.5, c.z);
    sp.material.opacity = 1 - Math.max(0, c.u - 0.7) / 0.3;
  });
  // 駐車場の矢印・入口の赤枠
  surroundings.labels.arrow.visible = st.arrowVisible;
  surroundings.labels.frame.visible = st.scene === 'parking';
  // 波紋
  rippleMeshes.forEach((m) => (m.visible = false));
  st.ripples.slice(0, rippleMeshes.length).forEach((r, i) => {
    const m = rippleMeshes[i];
    const rad = 0.5 + r.u * (r.kind === 'talk' ? 9 : 6.5);
    m.visible = true;
    m.position.x = r.x;
    m.position.z = r.z;
    m.scale.setScalar(rad);
    m.material.color.setHex(r.kind === 'talk' ? 0xf2a900 : 0x60a5fa);
    m.material.opacity = 0.85 * (1 - r.u);
  });
  // 吹き出し・×
  bubbleL.visible = bubbleR.visible = !!st.bubbles;
  if (st.bubbles) {
    const l1 = st.people[st.bubbles[0]];
    const l2 = st.people[st.bubbles[1]];
    bubbleL.position.set(l1.x, 2.7, l1.z + 1.0);
    bubbleR.position.set(l2.x, 2.7, l2.z - 1.0);
  }
  Object.values(crossTexts).forEach((sp) => (sp.visible = false));
  cross.visible = !!st.cross;
  if (st.cross) {
    const a = st.people[st.cross.a];
    const b = st.people[st.cross.b];
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    cross.position.set(mid.x, 4.6, mid.z);
    const ct = crossTexts[st.cross.kind];
    ct.visible = true;
    ct.position.set(mid.x, 2.9, mid.z);
    const k = 1 + 0.08 * Math.sin(st.t * 14);
    cross.scale.set(4.6 * k, 4.6 * k, 1);
  }
  // 撮影・録音の禁止カード（画面に重ねる）
  updateBan(st);
  // 可視性の切り替え
  const c = freeCam || st.camera;
  venue.south.visible = c.pos[2] <= cfg.venue.floor.zMax + 0.3;
  venue.east.visible = st.scene !== 'open' && st.scene !== 'quiet';
  surroundings.group.visible = true;
  venue.ceiling.visible = c.pos[1] < 12 && st.scene !== 'open';
  foyer.deckGroup.visible = st.deckVisible;
  // カメラ
  camera.up.set(0, 1, 0);
  camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
  camera.lookAt(c.target[0], c.target[1], c.target[2]);
  // スプライトの大きさを、カメラからの距離に合わせて少し補正（遠景では大きく）
  camPos.set(c.pos[0], c.pos[1], c.pos[2]);
  const halfTan = Math.tan((camera.fov * Math.PI) / 360);
  const fitSprite = (sp, screenFont) => {
    const hPx = (screenFont * (sp.userData.canvasH || 256)) / (sp.userData.fontPx || 96);
    const h = (hPx / 1080) * 2 * camPos.distanceTo(sp.position) * halfTan;
    sp.scale.set((sp.userData.aspect || 4) * h, h, 1);
  };
  for (const l of LABEL_DEFS) fitSprite(labelSprites[l.id], labelSprites[l.id].userData.screenFont);
  fitSprite(bubbleL, 56);
  fitSprite(bubbleR, 56);
  Object.values(crossTexts).forEach((sp) => fitSprite(sp, 44));
  updateHud(st);
}

function resize() {
  const w = CAPTURE ? video.width : stageEl.clientWidth;
  const h = CAPTURE ? video.height : stageEl.clientHeight;
  renderer.setPixelRatio(CAPTURE ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fitHud();
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- プレビュー操作
const playBtn = document.getElementById('btn-play');
const seek = document.getElementById('seek');
const timeEl = document.getElementById('time');
const camSelect = document.getElementById('cam-select');
const speedSel = document.getElementById('speed');
seek.max = String(DURATION);
let t = 0;
let playing = false;
let speed = 1;
let camMode = 'auto';
const orbit = new OrbitControls(camera, canvas);
orbit.enabled = false;

function renderAt(time) {
  t = Math.max(0, Math.min(DURATION, time));
  currentState = computeStaffState(t);
  if (camMode === 'free') {
    applyState(currentState, { pos: camera.position.toArray(), target: orbit.target.toArray() });
    orbit.update();
  } else applyState(currentState);
  renderer.render(scene, camera);
  seek.value = String(t);
  timeEl.textContent = `${t.toFixed(1)} / ${DURATION.toFixed(1)} s`;
}
let last = performance.now() / 1000;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000;
  const dt = now - last;
  last = now;
  if (playing) {
    let nt = t + dt * speed;
    if (nt >= DURATION) nt = 0;
    renderAt(nt);
  } else if (camMode === 'free') renderAt(t);
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
    camera.position.set(40, 30, 50);
    orbit.target.set(20, 0, 0);
  }
  renderAt(t);
});
speedSel.addEventListener('change', () => (speed = parseFloat(speedSel.value)));
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    playBtn.click();
  } else if (e.code === 'ArrowRight') renderAt(t + (e.shiftKey ? 5 : 1));
  else if (e.code === 'ArrowLeft') renderAt(t - (e.shiftKey ? 5 : 1));
});

window.__staff = {
  duration: DURATION,
  fps: video.fps,
  chairTotal: chairs.total,
  chairCounts: chairs.counts,
  async setTime(time) {
    camMode = 'auto';
    playing = false;
    renderAt(time);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return currentState && { t: currentState.t, scene: currentState.scene, chip: currentState.hud.chip, step: currentState.hud.step };
  },
  getState: () => currentState,
  three: { renderer, scene, camera, venue, foyer, persons },
  ready: true,
};
renderAt(0);
if (!CAPTURE) {
  playing = true;
  playBtn.textContent = '❚❚ 一時停止';
}
loop();
