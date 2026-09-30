// 会場の周辺（芝生・木・駐車場・入口）の概略。位置は航空写真と地図の座標からの目安で、実測ではありません。
import * as THREE from 'three';
import { parking } from './staffConfig.js';
import { makeFitSprite, makeLabelSprite } from '../props.js';

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

export function buildSurroundings() {
  const group = new THREE.Group();
  group.name = 'surroundings';

  // 芝生
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 700), new THREE.MeshStandardMaterial({ color: 0x5d7e4f, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(60, -0.06, 60);
  ground.receiveShadow = true;
  group.add(ground);

  // 木（建物・駐車場を避けて配置）
  const r = rng(11);
  const trunkGeo = new THREE.CylinderGeometry(0.4, 0.55, 3, 6);
  const leafGeo = new THREE.ConeGeometry(3.2, 8, 8);
  const N = 90;
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), N);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x3e6b3a, roughness: 1 }), N);
  const tmp = new THREE.Object3D();
  let n = 0;
  let guard = 0;
  while (n < N && guard++ < 4000) {
    const x = -60 + r() * 260;
    const z = -60 + r() * 220;
    const inBuilding = x > -16 && x < 78 && z > -32 && z < 32;
    const inLot = x > parking.lot.x0 - 6 && x < parking.lot.x1 + 6 && z > parking.lot.z0 - 6 && z < parking.lot.z1 + 6;
    const inPath = x > 40 && x < 70 && z > -14 && z < 14;
    if (inBuilding || inLot || inPath) continue;
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

  // 駐車場（佐嘉神社外苑駐車場・概略）
  const L = parking.lot;
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(L.x1 - L.x0, L.z1 - L.z0), new THREE.MeshStandardMaterial({ color: 0x4b5057, roughness: 1 }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set((L.x0 + L.x1) / 2, 0.02, (L.z0 + L.z1) / 2);
  lot.receiveShadow = true;
  group.add(lot);

  const carGeo = new THREE.BoxGeometry(1.8, 1.4, 4.2);
  const rows = [78.5, 83.5, 91.5, 96.5, 104.5, 109.5];
  const cars = [];
  const rc = rng(5);
  for (const z of rows) for (let x = L.x0 + 3; x < L.x1 - 3; x += 2.7) if (rc() < 0.68) cars.push([x, z, rc()]);
  const carInst = new THREE.InstancedMesh(carGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), cars.length);
  const cols = [0xd8d8d8, 0x2e3440, 0xa33a3a, 0x3d5a80, 0xe8e2d0, 0x5c6b73, 0x7a8b99];
  cars.forEach(([x, z, k], i) => {
    tmp.position.set(x, 0.7, z);
    tmp.scale.set(1, 1, 1);
    tmp.rotation.set(0, 0, 0);
    tmp.updateMatrix();
    carInst.setMatrixAt(i, tmp.matrix);
    carInst.setColorAt(i, new THREE.Color(cols[Math.floor(k * cols.length)]));
  });
  carInst.instanceColor.needsUpdate = true;
  carInst.castShadow = true;
  group.add(carInst);

  // 入口（北側＝x が大きい方、南側＝x が小さい方）
  const gateMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6 });
  for (const g of [parking.northGate, parking.southGate]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), gateMat);
    post.position.set(g.x, 2.5, g.z - 3);
    group.add(post);
    const p = makeLabelSprite('P', '#ffffff', 0x1a5fb4);
    p.scale.set(6, 6, 1);
    p.position.set(g.x, 7.5, g.z - 3);
    group.add(p);
  }

  // ラベル
  const mk = (text, w, x, y, z, opts = {}) => {
    const s = makeFitSprite(text, opts);
    s.position.set(x, y, z);
    group.add(s);
    return s;
  };
  // 会場 → 駐車場 の矢印（概略）
  const arrow = new THREE.Group();
  const strip = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 60), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
  strip.position.set(52, 0.3, 40);
  const head = new THREE.Mesh(new THREE.ConeGeometry(4, 8, 4), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
  head.rotation.x = Math.PI / 2;
  head.position.set(52, 0.3, 74);
  arrow.add(strip, head);
  arrow.name = 'lotArrow';
  group.add(arrow);
  const labels = {
    lot: mk('佐嘉神社外苑駐車場（主な有料駐車場）', 92, (L.x0 + L.x1) / 2, 14, (L.z0 + L.z1) / 2 + 6),
    north: mk('北側入口', 26, parking.northGate.x, 14, parking.northGate.z - 8),
    south: mk('南側入口', 26, parking.southGate.x, 14, parking.southGate.z - 8),
    venue: mk('市村記念体育館', 46, 17, 42, -30, { border: '#93c5fd' }),
    distance: mk(parking.distanceLabel, 84, 60, 6, 42, { border: '#f2c14e' }),
    north_dir: mk('北 →', 20, 118, 8, 22, { border: '#cbd5e1' }),
    arrow,
  };
  const fsOf = { lot: 46, north: 46, south: 46, venue: 40, distance: 38, north_dir: 34 };
  for (const [k, v] of Object.entries(fsOf)) labels[k].userData.screenFont = v;
  return { group, labels };
}
