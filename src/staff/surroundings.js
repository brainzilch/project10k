// 会場の周辺（芝生・木・道路・駐車場・入口）の概略。位置は航空写真と地図の座標からの目安で、実測ではありません。
import * as THREE from 'three';
import { parking } from './staffConfig.js';
import { makeFitSprite, makeLabelSprite } from '../props.js';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}
const box = (parent, w, h, d, x, y, z, mat, cast = false) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};

export function buildSurroundings() {
  const group = new THREE.Group();
  group.name = 'surroundings';
  const P = parking;

  // 芝生
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 800), new THREE.MeshStandardMaterial({ color: 0x5d7e4f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.06, 60);
  ground.receiveShadow = true;
  group.add(ground);

  // 道路（多布施川沿い・東西）
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x45494f, roughness: 1 });
  box(group, P.road.x1 - P.road.x0, 0.06, 360, (P.road.x0 + P.road.x1) / 2, 0.01, 60, asphalt);
  for (let z = -100; z < 220; z += 7) box(group, 0.25, 0.02, 3.4, (P.road.x0 + P.road.x1) / 2, 0.06, z, new THREE.MeshBasicMaterial({ color: 0xe8e8e0 }));

  // 入口の舗装（ボラードのある歩道側）と、関係者駐車場
  const brick = new THREE.MeshStandardMaterial({ color: 0xb08a72, roughness: 0.95 });
  const pl = P.plaza;
  box(group, pl.x1 - pl.x0, 0.05, pl.z1 - pl.z0, (pl.x0 + pl.x1) / 2, 0.03, (pl.z0 + pl.z1) / 2, brick);
  const bollard = new THREE.MeshStandardMaterial({ color: 0x8c9096, metalness: 0.6, roughness: 0.4 });
  for (let z = pl.z0 + 0.6; z <= pl.z1 - 0.5; z += 2.4) box(group, 0.16, 0.9, 0.16, pl.x0 + 0.3, 0.45, z, bollard);
  // 入口の看板（利用者以外の駐車を禁じます）
  const sign = makeLabelSprite('P×', '#ffffff', 0xd62828, { fontSize: 120 });
  sign.scale.set(2.6, 2.6, 1);
  sign.position.set(pl.x0 + 1.0, 2.3, P.entrance.z + 3.4);
  group.add(sign);
  const sl = P.staffLot;
  box(group, sl.x1 - sl.x0, 0.05, sl.z1 - sl.z0, (sl.x0 + sl.x1) / 2, 0.02, (sl.z0 + sl.z1) / 2, asphalt);
  box(group, 12, 0.05, 7, -40, 0.02, (pl.z1 + sl.z0) / 2, asphalt); // 道路と駐車場を結ぶ通路

  // 木（建物・駐車場・道路を避けて配置）
  const r = rng(11);
  const N = 110;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.55, 3, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), N);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0x3e6b3a, roughness: 1 }), N);
  const tmp = new THREE.Object3D();
  let n = 0;
  let guard = 0;
  while (n < N && guard++ < 6000) {
    const x = -60 + r() * 200;
    const z = -70 + r() * 230;
    const inBuilding = x > -18 && x < 80 && z > -32 && z < 34;
    const inLot = x > P.lot.x0 - 6 && x < P.lot.x1 + 6 && z > P.lot.z0 - 6 && z < P.lot.z1 + 6;
    const inPath = x > 40 && x < 72 && z > -14 && z < 14;
    const inRoad = x > P.road.x0 - 6 && x < -30 && z > -20 && z < 70;
    const inStaffLot = x > sl.x0 - 5 && x < sl.x1 + 5 && z > sl.z0 - 5 && z < sl.z1 + 5;
    if (inBuilding || inLot || inPath || inRoad || inStaffLot) continue;
    const sc = 0.8 + r() * 0.7;
    tmp.position.set(x, 1.5 * sc, z);
    tmp.scale.set(sc, sc, sc);
    tmp.updateMatrix();
    trunks.setMatrixAt(n, tmp.matrix);
    tmp.position.set(x, 3 * sc + 3.6 * sc, z);
    tmp.updateMatrix();
    leaves.setMatrixAt(n, tmp.matrix);
    n++;
  }
  trunks.count = n;
  leaves.count = n;
  trunks.castShadow = true;
  leaves.castShadow = true;
  group.add(trunks, leaves);

  // 主な有料駐車場（佐嘉神社外苑駐車場）
  const L = P.lot;
  box(group, L.x1 - L.x0, 0.05, L.z1 - L.z0, (L.x0 + L.x1) / 2, 0.02, (L.z0 + L.z1) / 2, asphalt);
  const carGeo = new THREE.BoxGeometry(1.8, 1.4, 4.2);
  const cols = [0xd8d8d8, 0x2e3440, 0xa33a3a, 0x3d5a80, 0xe8e2d0, 0x5c6b73, 0x7a8b99];
  const rc = rng(5);
  const placeCars = (rows, x0, x1, z0, z1, dens, seed) => {
    const list = [];
    const rr = rng(seed);
    for (const zz of rows) for (let x = x0 + 3; x < x1 - 3; x += 2.7) if (rr() < dens) list.push([x, zz, rr()]);
    const inst = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), list.length);
    list.forEach(([x, z, k], i) => {
      tmp.position.set(x, 0.7, z);
      tmp.scale.set(1, 1, 1);
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      inst.setMatrixAt(i, tmp.matrix);
      inst.setColorAt(i, new THREE.Color(cols[Math.floor(k * cols.length)]));
    });
    inst.instanceColor.needsUpdate = true;
    inst.castShadow = true;
    group.add(inst);
  };
  placeCars([78.5, 83.5, 91.5, 96.5, 104.5, 109.5], L.x0, L.x1, L.z0, L.z1, 0.68, 5);
  // 関係者駐車場は数台だけ
  placeCars([32, 38, 44, 50], sl.x0, sl.x1, sl.z0, sl.z1, 0.3, 9);
  void rc;

  // 有料駐車場の入口の「P」
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6 });
  {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), gateMat);
    post.position.set(L.x0 - 3, 2.5, (L.z0 + L.z1) / 2);
    group.add(post);
    const pp = makeLabelSprite('P', '#ffffff', 0x1a5fb4);
    pp.scale.set(6, 6, 1);
    pp.position.set(L.x0 - 3, 7.5, (L.z0 + L.z1) / 2);
    group.add(pp);
  }

  // 道路から有料駐車場へ向かう案内の矢印（案内するときだけ表示）
  const arrow = new THREE.Group();
  const aMat = new THREE.MeshBasicMaterial({ color: 0xf2c14e });
  const zStart = P.entrance.z + 12;
  const zEnd = (L.z0 + L.z1) / 2 - 6;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, zEnd - zStart), aMat);
  strip.position.set(P.road.eastbound, 0.2, (zStart + zEnd) / 2);
  const head = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6.5, 4), aMat);
  head.rotation.x = Math.PI / 2;
  head.position.set(P.road.eastbound, 0.2, zEnd + 2.5);
  arrow.add(strip, head);
  arrow.name = 'lotArrow';
  group.add(arrow);

  // 立ち位置の目印（赤枠の位置）
  const frame = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.9, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: 0xd62828, side: THREE.DoubleSide, depthTest: false }));
  frame.rotation.x = -Math.PI / 2;
  frame.position.set(P.entrance.x, 0.3, P.entrance.z);
  frame.renderOrder = 5;
  group.add(frame);

  const labels = { arrow, frame };
  void makeFitSprite;
  return { group, labels };
}
