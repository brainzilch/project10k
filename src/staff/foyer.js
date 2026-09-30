// 玄関・ホワイエ・受け渡し窓口・階段・2階バルコニー（トイレ）・体育館へのドアの簡略モデル
import * as THREE from 'three';
import { layout } from './staffConfig.js';

const MAT = {
  concrete: new THREE.MeshStandardMaterial({ color: 0xb9b3a6, roughness: 0.95 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.95 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xd3cdbf, roughness: 0.92 }),
  room: new THREE.MeshStandardMaterial({ color: 0xb7c2cc, roughness: 0.9 }),
  rail: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe3ff, roughness: 0.1, transparent: true, opacity: 0.35 }),
  door: new THREE.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.7 }),
  mat: new THREE.MeshStandardMaterial({ color: 0x2f7d46, roughness: 0.95 }),
  booth: new THREE.MeshStandardMaterial({ color: 0xcbc3b0, roughness: 0.9 }),
  boothRoof: new THREE.MeshStandardMaterial({ color: 0x8c7f6b, roughness: 0.9 }),
  step: new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.95 }),
};

function tileTexture(a = '#d9d2c0', b = '#cfc7b3') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? a : b;
      g.fillRect(i * 64, j * 64, 64, 64);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function box(parent, w, h, d, x, y, z, mat, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildFoyer() {
  const L = layout;
  const group = new THREE.Group();
  group.name = 'foyer';
  const deckGroup = new THREE.Group(); // 2階バルコニー（玄関の庇）と、その上のトイレ
  deckGroup.name = 'deck';
  group.add(deckGroup);

  // ---- 床（ホワイエ・ポーチ・前庭の舗装）----
  const f = L.foyer;
  const tex = tileTexture();
  tex.repeat.set((f.x1 - f.x0) / 2, (f.z1 - f.z0) / 2);
  const foyerFloor = new THREE.Mesh(new THREE.PlaneGeometry(f.x1 - f.x0, f.z1 - f.z0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  foyerFloor.rotation.x = -Math.PI / 2;
  foyerFloor.position.set((f.x0 + f.x1) / 2, 0.03, (f.z0 + f.z1) / 2);
  foyerFloor.receiveShadow = true;
  group.add(foyerFloor);

  const p = L.porch;
  const tex2 = tileTexture('#c9c2b1', '#bdb5a2');
  tex2.repeat.set((p.x1 - p.x0) / 2, (p.z1 - p.z0) / 2);
  const porchFloor = new THREE.Mesh(new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0), new THREE.MeshStandardMaterial({ map: tex2, roughness: 0.7 }));
  porchFloor.rotation.x = -Math.PI / 2;
  porchFloor.position.set((p.x0 + p.x1) / 2, 0.03, (p.z0 + p.z1) / 2);
  porchFloor.receiveShadow = true;
  group.add(porchFloor);

  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshStandardMaterial({ color: 0xa9a59b, roughness: 0.95 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(p.x1 + 20 - 0.01, 0.01, 0);
  plaza.receiveShadow = true;
  group.add(plaza);

  // ---- ホワイエの側壁（北は庇の下まで、南は断面が見えるよう低く）----
  box(group, f.x1 - f.x0, 4.2, 0.3, (f.x0 + f.x1) / 2, 2.1, f.z0 - 0.15, MAT.wall);
  box(group, f.x1 - f.x0, 1.0, 0.3, (f.x0 + f.x1) / 2, 0.5, f.z1 + 0.15, MAT.wall);

  // ---- 玄関（ファサード）：ガラス扉2組と柱 ----
  const E = L.entrance;
  const hw = E.doorW / 2;
  const segs = [
    [f.z0, E.doorZ[0] - hw],
    [E.doorZ[0] + hw, E.doorZ[1] - hw],
    [E.doorZ[1] + hw, f.z1],
  ];
  for (const [za, zb] of segs) box(group, 0.4, 4.2, zb - za, E.x, 2.1, (za + zb) / 2, MAT.concrete);
  for (const z of E.doorZ) {
    box(group, 0.4, 4.2 - E.doorH, E.doorW, E.x, E.doorH + (4.2 - E.doorH) / 2, z, MAT.concrete);
    // 扉：ガラスの両開き（開いた状態で描く）
    for (const s of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05, E.doorH - 0.1, hw - 0.05), MAT.glass);
      const pivot = new THREE.Group();
      pivot.position.set(E.x + 0.05, 0, z + s * hw);
      leaf.position.set(0, (E.doorH - 0.1) / 2, -s * (hw - 0.05) / 2);
      pivot.rotation.y = -s * 1.25;
      pivot.add(leaf);
      group.add(pivot);
    }
    // 足元の緑のマット
    box(group, 1.6, 0.03, E.doorW, E.x - 1.2, 0.05, z, MAT.mat, false);
  }

  // ---- 部屋（放送室・館長室・集会室）：模型のブロックとして表現 ----
  const labels = {};
  for (const [id, r] of Object.entries(L.rooms)) {
    box(group, r.x1 - r.x0, 2.6, r.z1 - r.z0, (r.x0 + r.x1) / 2, 1.3, (r.z0 + r.z1) / 2, MAT.room);
  }

  // ---- 階段（北・南）：折り返し階段を簡略化 ----
  const S = L.stairs;
  const buildStair = (sign, parent) => {
    // 第1flight：z 方向へ 1.4 m 上る（8段）
    const n1 = 8;
    for (let i = 0; i < n1; i++) {
      const h = ((i + 1) * 1.4) / n1;
      box(parent, S.width, h, 0.38, S.xLine, h / 2, sign * (5.4 + (i + 0.5) * 0.38), MAT.step);
    }
    // 踊り場
    box(parent, S.width + 0.2, 1.4, 1.9, S.xLine, 0.7, sign * (8.44 + 0.95), MAT.step);
    // 第2flight：x 方向へ 4.2 m まで（12段）
    const n2 = 12;
    for (let i = 0; i < n2; i++) {
      const h = 1.4 + ((i + 1) * 2.8) / n2;
      box(parent, 0.31, h, S.width, 36.4 + (i + 0.5) * 0.31, h / 2, sign * 9.6, MAT.step);
    }
  };
  buildStair(-1, group);
  buildStair(1, group);

  // ---- 体育館へのドア（下手側・上手側）：両開きで、ホワイエ側へ開く ----
  const doors = L.gymDoors.map((d) => {
    const leaves = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(L.eastWallX, 0, d.z + s * (d.w / 2 - 0.02));
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.07, d.h - 0.05, d.w / 2 - 0.04), MAT.door);
      leaf.position.set(0, (d.h - 0.05) / 2, -s * (d.w / 4 - 0.02));
      leaf.castShadow = true;
      pivot.add(leaf);
      group.add(pivot);
      leaves.push({ pivot, sign: s });
    }
    return { id: d.id, z: d.z, leaves };
  });

  // ---- 受け渡し窓口（昔の遊園地・水族館の入口受付のような小さなブース）----
  const B = L.booth;
  const bw = B.x1 - B.x0;
  const bd = B.z1 - B.z0;
  const booth = new THREE.Group();
  booth.name = 'booth';
  group.add(booth);
  box(booth, 0.15, 2.4, bd, B.x0 + 0.075, 1.2, (B.z0 + B.z1) / 2, MAT.booth); // 奥の壁
  box(booth, bw, 2.4, 0.15, (B.x0 + B.x1) / 2, 1.2, B.z0 + 0.075, MAT.booth); // 側壁（上手側）
  box(booth, bw, 2.4, 0.15, (B.x0 + B.x1) / 2, 1.2, B.z1 - 0.075, MAT.booth); // 側壁（下手側）
  box(booth, bw + 0.3, 0.16, bd + 0.3, (B.x0 + B.x1) / 2 + 0.05, 2.48, (B.z0 + B.z1) / 2, MAT.boothRoof); // 屋根
  // 前面：窓の下（カウンター）・窓の上・窓の左右
  const wz = B.windowZ;
  box(booth, 0.15, 1.0, bd, B.x1 - 0.075, 0.5, (B.z0 + B.z1) / 2, MAT.booth);
  box(booth, 0.15, 0.5, bd, B.x1 - 0.075, 2.15, (B.z0 + B.z1) / 2, MAT.booth);
  box(booth, 0.15, 0.9, (bd - 1.1) / 2, B.x1 - 0.075, 1.45, B.z0 + (bd - 1.1) / 4, MAT.booth);
  box(booth, 0.15, 0.9, (bd - 1.1) / 2, B.x1 - 0.075, 1.45, B.z1 - (bd - 1.1) / 4, MAT.booth);
  box(booth, 0.4, 0.06, 1.2, B.x1 + 0.15, 1.03, wz, MAT.rail); // カウンターの張り出し
  // 窓枠
  box(booth, 0.05, 0.05, 1.2, B.x1 + 0.02, 1.93, wz, MAT.frame, false);

  // ---- 2階バルコニー（玄関の庇）と手すり、柱、上部の壁 ----
  const D = L.deck;
  box(deckGroup, D.x1 - D.x0, 0.35, D.z1 - D.z0, (D.x0 + D.x1) / 2, D.y - 0.175, (D.z0 + D.z1) / 2, MAT.concrete);
  box(deckGroup, 0.4, 5.6, D.z1 - D.z0, D.x0 - 0.2, D.y + 2.8, (D.z0 + D.z1) / 2, MAT.concreteDark); // 背後の壁（写真の建物の壁）
  // 白い手すり（前縁と両脇）
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = -Math.atan2(z1 - z0, x1 - x0);
    for (const y of [D.y + 0.55, D.y + 1.05]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), MAT.rail);
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      m.rotation.y = yaw;
      deckGroup.add(m);
    }
    const n = Math.max(2, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      box(deckGroup, 0.06, 1.05, 0.06, x0 + (x1 - x0) * k, D.y + 0.525, z0 + (z1 - z0) * k, MAT.rail, false);
    }
  };
  rail(D.x1, D.z0, D.x1, D.z1);
  rail(D.x0, D.z0, D.x1, D.z0);
  rail(D.x0, D.z1, D.x1, D.z1);
  // 柱（庇を支える）
  for (const z of [-9.6, 0, 9.6]) box(deckGroup, 0.5, D.y - 0.35, 0.5, D.x1 - 0.6, (D.y - 0.35) / 2, z, MAT.concrete);

  // 2階トイレ（位置は仮）
  const T = L.toilet2F;
  box(deckGroup, T.x1 - T.x0, 2.7, T.z1 - T.z0, (T.x0 + T.x1) / 2, D.y + 1.35, (T.z0 + T.z1) / 2, MAT.wall);
  box(deckGroup, 1.0, 2.0, 0.08, (T.x0 + T.x1) / 2, D.y + 1.0, T.z1 + 0.02, MAT.door, false);

  return { group, deckGroup, doors, booth, materials: MAT };
}

/** ドアの開き具合 k(0..1) を設定（ホワイエ側へ最大 95°）。 */
export function setDoorOpen(door, k) {
  for (const l of door.leaves) l.pivot.rotation.y = -l.sign * k * 1.66;
}
