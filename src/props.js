// 小道具：折り畳みパイプ椅子(InstancedMesh)、ピアノ、コントラバス、展示物、養生シートとロール
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { chairs as chairCfg, performance, exhibits as exhibitCfg, sheet as sheetCfg, storage } from './config.js';
import { buildSeating, verifySeating } from './seating.js';
import { stageFrontX } from './venue.js';
import { venue } from './config.js';

// ---------------------------------------------------------------- 椅子
function box(w, h, d, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g;
}
function cyl(r, h, x, y, z, rx = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(r, r, h, 8);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** 折り畳みパイプ椅子。モデルの +z が正面（座った人が向く方向）。 */
export function buildChairGeometries() {
  const w = chairCfg.width;
  const d = chairCfg.depth;
  const seatY = 0.45;
  const r = 0.013;
  // 金属フレーム
  const frame = mergeGeometries([
    // 前脚（垂直）
    cyl(r, seatY, w / 2 - 0.03, seatY / 2, d / 2 - 0.05),
    cyl(r, seatY, -w / 2 + 0.03, seatY / 2, d / 2 - 0.05),
    // 後脚（やや斜め）→ 背もたれの支柱まで続く
    cyl(r, 0.98, w / 2 - 0.03, 0.49, -d / 2 + 0.06, 0.12),
    cyl(r, 0.98, -w / 2 + 0.03, 0.49, -d / 2 + 0.06, 0.12),
    // 横桟
    cyl(r, w - 0.06, 0, 0.12, d / 2 - 0.05, 0, Math.PI / 2),
    cyl(r, w - 0.06, 0, 0.12, -d / 2 + 0.08, 0, Math.PI / 2),
    // 座面枠
    box(w - 0.02, 0.02, 0.02, 0, seatY - 0.01, d / 2 - 0.04),
  ]);
  // 座面と背もたれ（布・樹脂）
  const pads = mergeGeometries([
    box(w, 0.045, d - 0.06, 0, seatY, 0.0),
    box(w - 0.04, 0.34, 0.035, 0, 0.82, -d / 2 - 0.02, -0.12),
  ]);
  return { frame, pads };
}

export function buildChairs() {
  const layout = buildSeating();
  const v = verifySeating(layout);
  if (!v.ok) throw new Error('seating verification failed: ' + v.problems.join('; '));
  const { frame, pads } = buildChairGeometries();
  const frameMat = new THREE.MeshStandardMaterial({ color: chairCfg.colors.frame, metalness: 0.7, roughness: 0.35 });
  const padMat = new THREE.MeshStandardMaterial({ color: chairCfg.colors.seat, roughness: 0.8 });
  const n = layout.length;
  const frameInst = new THREE.InstancedMesh(frame, frameMat, n);
  const padInst = new THREE.InstancedMesh(pads, padMat, n);
  frameInst.castShadow = true;
  padInst.castShadow = true;
  frameInst.receiveShadow = true;
  padInst.receiveShadow = true;
  frameInst.name = 'chairFrames';
  padInst.name = 'chairPads';
  const group = new THREE.Group();
  group.add(frameInst, padInst);
  const tmp = new THREE.Object3D();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  /**
   * progress[i] : 0 = 未設置（非表示） … 1 = 設置完了。途中は上から降りてくる。
   */
  const update = (progress) => {
    for (let i = 0; i < n; i++) {
      const p = progress[i];
      if (p <= 0) {
        frameInst.setMatrixAt(i, hidden);
        padInst.setMatrixAt(i, hidden);
        continue;
      }
      const c = layout[i];
      const e = 1 - (1 - Math.min(1, p)) ** 2; // ease-out
      tmp.position.set(c.x, (1 - e) * 0.7, c.z);
      tmp.rotation.set(0, c.rotY, 0);
      const s = 0.6 + 0.4 * e;
      tmp.scale.set(s, s, s);
      tmp.updateMatrix();
      frameInst.setMatrixAt(i, tmp.matrix);
      padInst.setMatrixAt(i, tmp.matrix);
    }
    frameInst.instanceMatrix.needsUpdate = true;
    padInst.instanceMatrix.needsUpdate = true;
  };
  return { group, layout, update, counts: v.counts, total: v.total };
}

// ---------------------------------------------------------------- ピアノ
export function buildPiano() {
  const cfg = performance.piano;
  const g = new THREE.Group();
  g.name = 'piano';
  const bodyMat = new THREE.MeshStandardMaterial({ color: cfg[cfg.type].color, roughness: 0.25, metalness: 0.2 });
  const keyMat = new THREE.MeshStandardMaterial({ color: 0xf5f2ea, roughness: 0.5 });
  if (cfg.type === 'grand') {
    const { length: L, width: Wd, height: Hh } = cfg.grand;
    // グランドピアノの輪郭（鍵盤側が -z、奥が +z の曲線）
    const s = new THREE.Shape();
    const hw = Wd / 2;
    s.moveTo(-hw, 0);
    s.lineTo(hw, 0);
    s.lineTo(hw, L * 0.45);
    s.bezierCurveTo(hw, L * 0.75, hw * 0.3, L, -hw * 0.1, L);
    s.bezierCurveTo(-hw * 0.7, L, -hw, L * 0.8, -hw, L * 0.5);
    s.lineTo(-hw, 0);
    const bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 0.28, bevelEnabled: false });
    bodyGeo.rotateX(Math.PI / 2);
    bodyGeo.translate(0, Hh - 0.05, 0);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    g.add(body);
    // 屋根（少し開く）
    const lidGeo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false });
    lidGeo.rotateX(Math.PI / 2);
    const lid = new THREE.Mesh(lidGeo, bodyMat);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(-hw, Hh - 0.05, 0);
    lid.position.set(hw, 0.04, 0);
    lidPivot.add(lid);
    lidPivot.rotation.z = -0.55; // 左側（-x）をヒンジに開く
    g.add(lidPivot);
    // 突上げ棒
    const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6), keyMat);
    prop.position.set(hw * 0.75, Hh + 0.3, L * 0.55);
    prop.rotation.z = 0.45;
    g.add(prop);
    // 鍵盤
    const kb = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.1, 0.06, 0.28), keyMat);
    kb.position.set(0, Hh - 0.2, -0.12);
    g.add(kb);
    const kbBox = new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.14, 0.3), bodyMat);
    kbBox.position.set(0, Hh - 0.25, -0.12);
    g.add(kbBox);
    // 脚
    for (const [x, z] of [
      [-hw + 0.12, 0.1],
      [hw - 0.12, 0.1],
      [-hw * 0.2, L - 0.25],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, Hh - 0.3, 0.1), bodyMat);
      leg.position.set(x, (Hh - 0.3) / 2, z);
      leg.castShadow = true;
      g.add(leg);
    }
    // 椅子（ピアノ椅子）
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.35), bodyMat);
    bench.position.set(0, 0.5, -0.65);
    g.add(bench);
    for (const sx of [-0.4, 0.4]) {
      for (const sz of [-0.78, -0.52]) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.05), bodyMat);
        bl.position.set(sx, 0.23, sz);
        g.add(bl);
      }
    }
  } else {
    const { width: Wd, depth: Dd, height: Hh } = cfg.upright;
    const body = new THREE.Mesh(new THREE.BoxGeometry(Wd, Hh, Dd), bodyMat);
    body.position.set(0, Hh / 2 + 0.05, 0);
    body.castShadow = true;
    g.add(body);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(Wd - 0.1, 0.05, 0.25), keyMat);
    kb.position.set(0, 0.72, -Dd / 2 - 0.1);
    g.add(kb);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.35), bodyMat);
    bench.position.set(0, 0.5, -Dd / 2 - 0.55);
    g.add(bench);
  }
  // 運搬用の台車の雰囲気（移動中のみ表示）
  const dolly = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 1.0), new THREE.MeshStandardMaterial({ color: 0x555555 }));
  dolly.position.set(0, 0.06, 0.5);
  dolly.name = 'dolly';
  dolly.visible = false;
  g.add(dolly);
  return g;
}

// ---------------------------------------------------------------- コントラバス
export function buildDoubleBass() {
  const cfg = performance.bass;
  const g = new THREE.Group();
  g.name = 'doubleBass';
  const wood = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1410, roughness: 0.6 });
  // 胴（上下の膨らみ：楕円体2つ）
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 14), wood);
  lower.scale.set(1, 1.15, 0.45);
  lower.position.set(0, 0.7, 0);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 14), wood);
  upper.scale.set(1, 1.1, 0.45);
  upper.position.set(0, 1.25, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.85, 8), dark);
  neck.position.set(0, 1.9, -0.02);
  const scroll = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), dark);
  scroll.position.set(0, 2.36, -0.02);
  const fb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.0, 0.02), dark);
  fb.position.set(0, 1.55, 0.17);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 6), dark);
  pin.position.set(0, 0.17, 0);
  // スタンド
  const stand = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 8, 20), new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7 }));
  stand.rotation.x = Math.PI / 2;
  stand.position.y = 0.02;
  g.add(lower, upper, neck, scroll, fb, pin, stand);
  g.children.forEach((c) => (c.castShadow = true));
  g.rotation.x = -0.12; // 少し傾けて立てかける
  return g;
}

// ---------------------------------------------------------------- 展示物（仮）
export function buildExhibits() {
  const list = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0x9fb3c8, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.45, roughness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.7 });
  for (const e of exhibitCfg) {
    const g = new THREE.Group();
    g.name = 'exhibit_' + e.id;
    const [w, h, d] = e.size;
    if (e.kind === 'case') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.6, d), mat);
      base.position.y = h * 0.3;
      const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, h * 0.4, d * 0.95), glass);
      top.position.y = h * 0.8;
      g.add(base, top);
    } else if (e.kind === 'pedestal') {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.8, d), mat);
      ped.position.y = h * 0.4;
      const obj = new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.4, 1), dark);
      obj.position.y = h * 0.8 + w * 0.4;
      g.add(ped, obj);
    } else {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      panel.position.y = h / 2 + 0.1;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.1, 0.6), dark);
      foot.position.y = 0.05;
      g.add(panel, foot);
    }
    // 向きが分かる目印（前面の矢印板）
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0xffd23f }));
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0.2, d / 2 + 0.25);
    g.add(arrow);
    g.traverse((c) => (c.castShadow = true));
    list.push({ cfg: e, group: g });
  }
  return list;
}

// ---------------------------------------------------------------- 養生シート
/**
 * 帯ごとの敷設範囲を 3D 座標で計算する（床の範囲にクリップ）。
 */
export function computeBandRects() {
  const { region, bands, clipToFloor, edgeMargin, bandGap } = sheetCfg;
  const p2w = (px, py) => ({ x: (px - 773) / 15.85, z: (py - 667) / 15.85 });
  return bands.map((b) => {
    const a = p2w(region.x1, b.y1);
    const c = p2w(region.x2, b.y2);
    let xLeft = Math.min(a.x, c.x);
    let xRight = Math.max(a.x, c.x);
    let zMin = Math.min(a.z, c.z) + bandGap / 2;
    let zMax = Math.max(a.z, c.z) - bandGap / 2;
    const nominalLength = xRight - xLeft; // 図上の帯の長さ
    if (clipToFloor) {
      zMin = Math.max(zMin, venue.floor.zMin + edgeMargin);
      zMax = Math.min(zMax, venue.floor.zMax - edgeMargin);
      xRight = Math.min(xRight, venue.floor.xMax - edgeMargin);
      // ステージ前縁（曲線）の帯内での最も床側の点で止める
      const zs = [zMin, zMax, (zMin + zMax) / 2];
      const front = Math.max(...zs.map(stageFrontX));
      xLeft = Math.max(xLeft, front + edgeMargin);
    }
    return { id: b.id, color: b.color, name: b.name, xLeft, xRight, zMin, zMax, nominalLength, laidLength: xRight - xLeft, foldLength: sheetCfg.foldLength };
  });
}

export function buildSheets() {
  const rects = computeBandRects();
  const th = sheetCfg.thickness;
  const group = new THREE.Group();
  group.name = 'sheets';
  const bands = rects.map((r, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1 - i, polygonOffsetUnits: -1 });
    const width = r.zMax - r.zMin;
    // 下層（展開中に x 方向へ伸びる）。原点を右端に置き、scale.x で長さを変える
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1, th, width), mat);
    lower.castShadow = false;
    lower.receiveShadow = true;
    // 上層（折り返し）。原点を左端に置く。二重になった部分が分かるよう少し濃い色にする
    const upperMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(r.color).multiplyScalar(0.8), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 - i, polygonOffsetUnits: -1 });
    const upper = new THREE.Mesh(new THREE.BoxGeometry(1, th, width), upperMat);
    upper.receiveShadow = true;
    // 折り返した端（上層の右端）の縁取り
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, th * 1.1, width), new THREE.MeshStandardMaterial({ color: new THREE.Color(r.color).lerp(new THREE.Color(0xffffff), 0.55), roughness: 0.9 }));
    // 折り目（左端の丸み）
    const fold = new THREE.Mesh(new THREE.CylinderGeometry(th, th, width, 12), mat);
    fold.rotation.x = Math.PI / 2;
    // ロール
    const rollMat = new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.7 });
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, width, 24), rollMat);
    roll.rotation.x = Math.PI / 2;
    roll.castShadow = true;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, width + 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x8b7355 }));
    core.rotation.x = Math.PI / 2;
    // ロールの向き（軸の向き）を変えるための親
    const rollPivot = new THREE.Group();
    rollPivot.add(roll, core);
    // 番号ラベル（帯の中央にスプライト）
    const label = makeLabelSprite(String(r.id), '#ffffff', r.color);
    label.scale.set(2.2, 2.2, 1);
    group.add(lower, upper, edge, fold, rollPivot, label);
    return { rect: r, lower, upper, edge, fold, roll, core, rollPivot, label, width };
  });

  /**
   * state: { laid:0..1, fold:0..1, rollPos:{x,z}|null, rollRadius, showLabel }
   */
  const update = (states) => {
    bands.forEach((b, i) => {
      const s = states[i];
      const r = b.rect;
      const zc = (r.zMin + r.zMax) / 2;
      const L = r.laidLength;
      const laidLen = Math.max(0, s.laid * L);
      b.lower.visible = laidLen > 0.01;
      b.lower.scale.x = Math.max(0.01, laidLen);
      b.lower.position.set(r.xRight - laidLen / 2, th / 2 + 0.006, zc);
      const foldLen = Math.max(0, s.fold * r.foldLength);
      b.upper.visible = foldLen > 0.01;
      b.upper.scale.x = Math.max(0.01, foldLen);
      b.upper.position.set(r.xLeft + foldLen / 2, th * 1.5 + 0.006, zc);
      b.fold.visible = foldLen > 0.01;
      b.fold.position.set(r.xLeft, th + 0.006, zc);
      b.edge.visible = foldLen > 0.01;
      b.edge.position.set(r.xLeft + foldLen, th * 1.5 + 0.006, zc);
      if (s.rollPos) {
        b.rollPivot.visible = true;
        const rr = Math.max(0.05, s.rollRadius);
        const len = s.rollLen == null ? 1 : s.rollLen;
        b.roll.scale.set(rr, len, rr);
        b.core.scale.set(1, len, 1);
        b.rollPivot.position.set(s.rollPos.x, rr + (s.rollY || 0), s.rollPos.z);
        b.rollPivot.rotation.y = s.rollRotY || 0;
      } else {
        b.rollPivot.visible = false;
      }
      b.label.visible = !!s.showLabel;
      b.label.position.set(r.xRight - laidLen / 2, 1.2, zc);
      if (s.labelAtRoll && s.rollPos) b.label.position.set(s.rollPos.x, 1.6 + (s.rollY || 0), s.rollPos.z);
    });
  };
  return { group, bands, rects, update };
}

// ---------------------------------------------------------------- ラベル用スプライト
export function makeLabelSprite(text, fg = '#fff', bg = 0x333333, opts = {}) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  const col = '#' + new THREE.Color(bg).getHexString();
  g.fillStyle = col;
  g.beginPath();
  g.arc(128, 128, 118, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = fg;
  g.font = `bold ${opts.fontSize || 150}px "Noto Sans JP","Hiragino Sans","Yu Gothic","IPAGothic",sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10;
  return sp;
}

/** 文字の看板スプライト（収納庫などの場所ラベル） */
export function makeTextSprite(text, opts = {}) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || 'rgba(20,24,32,0.85)';
  const r = 40;
  g.beginPath();
  g.roundRect(8, 8, c.width - 16, c.height - 16, r);
  g.fill();
  g.strokeStyle = opts.border || '#f2c14e';
  g.lineWidth = 10;
  g.stroke();
  g.fillStyle = opts.fg || '#ffffff';
  // 文字数に応じてフォントを縮めて枠内に収める
  let fs = opts.fontSize || 96;
  const family = '"Noto Sans JP","Hiragino Sans","Yu Gothic","IPAGothic",sans-serif';
  g.font = `bold ${fs}px ${family}`;
  while (g.measureText(text).width > c.width - 80 && fs > 40) {
    fs -= 4;
    g.font = `bold ${fs}px ${family}`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 11;
  sp.scale.set(opts.width || 6, (opts.width || 6) / 4, 1);
  sp.userData.fontPx = fs;
  return sp;
}

/** 文字の長さに合わせて枠の大きさが変わるラベル（スタッフ向け動画用）。画面上の文字サイズは fitSprite で揃える */
export function makeFitSprite(text, opts = {}) {
  const family = '"Noto Sans JP","Hiragino Sans","Yu Gothic","IPAGothic",sans-serif';
  const fs = opts.fontSize || 88;
  const m = document.createElement('canvas').getContext('2d');
  m.font = `bold ${fs}px ${family}`;
  const w = Math.min(2400, Math.ceil(m.measureText(text).width + 110));
  const h = Math.ceil(fs * 1.75);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || 'rgba(20,24,32,0.88)';
  g.beginPath();
  g.roundRect(6, 6, w - 12, h - 12, 34);
  g.fill();
  g.strokeStyle = opts.border || '#f2c14e';
  g.lineWidth = 9;
  g.stroke();
  g.fillStyle = opts.fg || '#ffffff';
  g.font = `bold ${fs}px ${family}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 11;
  sp.userData.fontPx = fs;
  sp.userData.canvasH = h;
  sp.userData.aspect = w / h;
  sp.scale.set(4 * (w / h), 4, 1);
  return sp;
}

/** カメラ（撮影）アイコンのスプライト */
export function makeCameraIconSprite() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.roundRect(28, 78, 200, 130, 22);
  g.fill();
  g.fillRect(90, 50, 76, 40);
  g.fillStyle = '#1f2937';
  g.beginPath();
  g.arc(128, 143, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#93c5fd';
  g.beginPath();
  g.arc(128, 143, 26, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 12;
  sp.scale.set(2.4, 2.4, 1);
  return sp;
}

export { storage };
