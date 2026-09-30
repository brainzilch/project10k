// 体育館の建築形状（簡略化）：木質床、左のステージと舞台幕、曲面天井、左右と奥の赤い観覧席、手すり、収納庫
import * as THREE from 'three';
import { venue, storage, performance } from './config.js';

export function stageFrontX(z) {
  const zh = Math.max(Math.abs(venue.floor.zMin), Math.abs(venue.floor.zMax));
  const s = venue.stage;
  return s.xFrontCenter + (s.xFrontEnds - s.xFrontCenter) * (z / zh) ** 2;
}

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 2048;
  const g = c.getContext('2d');
  // 木質の板目
  g.fillStyle = '#c99a5b';
  g.fillRect(0, 0, c.width, c.height);
  const plankH = 24;
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let y = 0; y < c.height; y += plankH) {
    const shade = 0.9 + rnd() * 0.2;
    g.fillStyle = `rgb(${Math.round(201 * shade)},${Math.round(154 * shade)},${Math.round(91 * shade)})`;
    g.fillRect(0, y, c.width, plankH);
    // 板の継ぎ目
    g.fillStyle = 'rgba(90,60,30,0.25)';
    g.fillRect(0, y, c.width, 2);
    let x = Math.floor(rnd() * 300);
    while (x < c.width) {
      g.fillRect(x, y, 2, plankH);
      x += 300 + Math.floor(rnd() * 400);
    }
  }
  // コートラインの雰囲気（簡略）
  g.strokeStyle = '#e8b93a';
  g.lineWidth = 8;
  g.strokeRect(c.width * 0.2, c.height * 0.17, c.width * 0.6, c.height * 0.66);
  g.beginPath();
  g.arc(c.width * 0.5, c.height * 0.5, c.width * 0.08, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.moveTo(c.width * 0.5, c.height * 0.17);
  g.lineTo(c.width * 0.5, c.height * 0.83);
  g.stroke();
  g.strokeStyle = '#3d8f5a';
  g.lineWidth = 5;
  g.strokeRect(c.width * 0.26, c.height * 0.3, c.width * 0.48, c.height * 0.4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeCeilingTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#d3d0bf';
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(120,115,100,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= 32; i++) {
    const p = (i * c.width) / 32;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, c.height);
    g.stroke();
    g.beginPath();
    g.moveTo(0, p);
    g.lineTo(c.width, p);
    g.stroke();
  }
  // 照明の丸
  g.fillStyle = '#fffbe8';
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      g.beginPath();
      g.arc(((i + 0.5) * c.width) / 8, ((j + 0.5) * c.height) / 8, 16, 0, Math.PI * 2);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildVenue() {
  const group = new THREE.Group();
  group.name = 'venue';
  // 南側（z+、帯1側・カメラ側）の要素。カメラが外側にあるときは非表示にして内部を見せる
  const south = new THREE.Group();
  south.name = 'south';
  group.add(south);
  const f = venue.floor;
  const W = f.xMax - f.xMin;
  const D = f.zMax - f.zMin;
  const cx = (f.xMin + f.xMax) / 2;
  const cz = (f.zMin + f.zMax) / 2;

  // ---- 床（木質） ----
  const floorMat = new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.55, metalness: 0.05 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, D + 0.2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // 演奏位置の赤丸（参考図の赤丸に対応、床上の薄いリング）
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(performance.markerRadius - 0.12, performance.markerRadius, 64),
    new THREE.MeshBasicMaterial({ color: 0xe0202a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(performance.center.x, 0.012, performance.center.z);
  ring.name = 'performanceMarker';
  group.add(ring);

  // ---- 建物の外郭（観覧席の外側の壁） ----
  const gal = venue.gallery;
  const outer = {
    xMin: venue.stage.xBack - 0.4,
    xMax: f.xMax + gal.depth + 1.0,
    zMin: f.zMin - gal.depth - 1.0,
    zMax: f.zMax + gal.depth + 1.0,
  };
  const wallMat = new THREE.MeshStandardMaterial({ color: venue.colors.wall, roughness: 0.9, side: THREE.DoubleSide });
  const H = venue.wallHeight;
  const wallOuter = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat);
    m.position.set((x0 + x1) / 2, H / 2, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    m.receiveShadow = true;
    return m;
  };
  south.add(wallOuter(outer.xMax, outer.zMax, outer.xMin, outer.zMax));
  group.add(wallOuter(outer.xMin, outer.zMin, outer.xMax, outer.zMin));
  group.add(wallOuter(outer.xMax, outer.zMin, outer.xMax, outer.zMax));
  group.add(wallOuter(outer.xMin, outer.zMax, outer.xMin, outer.zMin));

  // ---- 観覧席下の壁（床の縁、収納庫などの部屋の壁）。収納庫の扉は開口にする ----
  const lowMat = new THREE.MeshStandardMaterial({ color: 0xcfc9bb, roughness: 0.9 });
  const lowH = gal.floorY;
  const lowWall = (x0, x1, z, thick = 0.3) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), lowH, thick), lowMat);
    m.position.set((x0 + x1) / 2, lowH / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  // 南側（z+, 帯1側）: 扉の開口を残す
  const dz = storage.door;
  const dHalf = dz.width / 2;
  south.add(lowWall(venue.stage.xBack, dz.x - dHalf, f.zMax + 0.15));
  south.add(lowWall(dz.x + dHalf, f.xMax, f.zMax + 0.15));
  // 扉のまぐさ（開口の上）
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(dz.width, lowH - dz.height, 0.3), lowMat);
  lintel.position.set(dz.x, dz.height + (lowH - dz.height) / 2, f.zMax + 0.15);
  south.add(lintel);
  // 北側（z-）
  group.add(lowWall(venue.stage.xBack, f.xMax, f.zMin - 0.15));
  // 東側（x+, ステージの反対側）
  const eWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, lowH, D + 0.6), lowMat);
  eWall.position.set(f.xMax + 0.15, lowH / 2, cz);
  group.add(eWall);

  // ---- 観覧席（赤い座席）: 左右（z±）と奥（x+）、床より高い位置 ----
  const seatMat = new THREE.MeshStandardMaterial({ color: gal.seatColor, roughness: 0.7 });
  const galFloorMat = new THREE.MeshStandardMaterial({ color: 0x8c8780, roughness: 0.95 });
  const railMat = new THREE.MeshStandardMaterial({ color: gal.railColor, roughness: 0.4, metalness: 0.6 });
  const seatGeo = new THREE.BoxGeometry(0.48, 0.45, 0.5);
  const seats = [];
  const addGallery = (len, depth, rows, place, parent = group) => {
    // 段床
    for (let r = 0; r < rows; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4 + r * 0.4, depth / rows), galFloorMat);
      const local = { along: 0, across: (r + 0.5) * (depth / rows), y: (0.4 + r * 0.4) / 2 };
      place(step, local);
      step.receiveShadow = true;
      parent.add(step);
      const n = Math.floor(len / 0.55);
      for (let i = 0; i < n; i++) {
        seats.push({ along: (i + 0.5) * 0.55 - len / 2, across: (r + 0.5) * (depth / rows), y: 0.4 + r * 0.4 + 0.22, place, parent });
      }
    }
  };
  const inst = { count: 0 };
  const placeSouth = (m, l) => {
    m.position.set(cx + l.along, gal.floorY + l.y, f.zMax + 0.5 + l.across);
  };
  const placeNorth = (m, l) => {
    m.position.set(cx - l.along, gal.floorY + l.y, f.zMin - 0.5 - l.across);
    m.rotation.y = Math.PI;
  };
  const placeEast = (m, l) => {
    m.position.set(f.xMax + 0.5 + l.across, gal.floorY + l.y, cz - l.along);
    m.rotation.y = Math.PI / 2;
  };
  addGallery(W - 2, gal.depth, gal.rows, placeSouth, south);
  addGallery(W - 2, gal.depth, gal.rows, placeNorth);
  addGallery(D - 2, gal.depth, gal.rows, placeEast);
  const tmp = new THREE.Object3D();
  for (const parent of [group, south]) {
    const mine = seats.filter((s) => s.parent === parent);
    const seatInst = new THREE.InstancedMesh(seatGeo, seatMat, mine.length);
    mine.forEach((s, i) => {
      tmp.position.set(0, 0, 0);
      tmp.rotation.set(0, 0, 0);
      s.place(tmp, s);
      tmp.updateMatrix();
      seatInst.setMatrixAt(i, tmp.matrix);
    });
    seatInst.instanceMatrix.needsUpdate = true;
    parent.add(seatInst);
  }
  inst.count = seats.length;

  // 手すり（観覧席前縁）
  const railY = gal.floorY + 1.0;
  const addRail = (x0, z0, x1, z1, parent = group) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 8), railMat);
    bar.rotation.z = Math.PI / 2;
    bar.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    bar.position.set((x0 + x1) / 2, railY, (z0 + z1) / 2);
    parent.add(bar);
    const bar2 = bar.clone();
    bar2.position.y = railY - 0.45;
    parent.add(bar2);
    const n = Math.floor(len / 2.5);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 8), railMat);
      post.position.set(x0 + (x1 - x0) * t, gal.floorY + 0.52, z0 + (z1 - z0) * t);
      parent.add(post);
    }
  };
  addRail(venue.stage.xBack + 1, f.zMax + 0.3, f.xMax, f.zMax + 0.3, south);
  addRail(venue.stage.xBack + 1, f.zMin - 0.3, f.xMax, f.zMin - 0.3);
  addRail(f.xMax + 0.3, f.zMin - 0.3, f.xMax + 0.3, f.zMax + 0.3);

  // ---- ステージ（左）：前縁が曲面で床側に張り出す ----
  const st = venue.stage;
  const shape = new THREE.Shape();
  shape.moveTo(st.xBack, f.zMin - 0.2);
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const z = f.zMin + ((f.zMax - f.zMin) * i) / N;
    shape.lineTo(stageFrontX(z), z);
  }
  shape.lineTo(st.xBack, f.zMax + 0.2);
  shape.closePath();
  const stageGeo = new THREE.ExtrudeGeometry(shape, { depth: st.height, bevelEnabled: false });
  // Shape は XY 平面。Y→Z に回して床に置く
  stageGeo.rotateX(Math.PI / 2);
  stageGeo.translate(0, st.height, 0);
  const stageMat = new THREE.MeshStandardMaterial({ color: venue.colors.stageFloor, roughness: 0.6 });
  const stage = new THREE.Mesh(stageGeo, stageMat);
  stage.castShadow = true;
  stage.receiveShadow = true;
  stage.name = 'stage';
  group.add(stage);
  // ステージ前縁の縁取り
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.8 });
  for (let i = 0; i < N; i++) {
    const z0 = f.zMin + ((f.zMax - f.zMin) * i) / N;
    const z1 = f.zMin + ((f.zMax - f.zMin) * (i + 1)) / N;
    const x0 = stageFrontX(z0);
    const x1 = stageFrontX(z1);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, st.height, len + 0.02), edgeMat);
    e.position.set((x0 + x1) / 2, st.height / 2, (z0 + z1) / 2);
    e.rotation.y = -Math.atan2(x1 - x0, z1 - z0);
    group.add(e);
  }

  // 舞台幕：奥の幕（横一杯）、上部のバランス幕、両袖の幕、プロセニアム
  const curtainMat = new THREE.MeshStandardMaterial({ color: st.curtainColor, roughness: 0.95 });
  const valanceMat = new THREE.MeshStandardMaterial({ color: st.valanceColor, roughness: 0.95 });
  const prosH = 8.5;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(D, prosH - st.height), curtainMat);
  back.position.set(st.xBack + 0.2, st.height + (prosH - st.height) / 2, cz);
  back.rotation.y = Math.PI / 2;
  group.add(back);
  // 幕のひだ（縦の帯）
  const pleatMat = new THREE.MeshStandardMaterial({ color: 0x5a4a6a, roughness: 0.95 });
  for (let i = 0; i < 26; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, prosH - st.height - 0.2, 0.35), pleatMat);
    p.position.set(st.xBack + 0.45, st.height + (prosH - st.height) / 2, f.zMin + 0.7 + i * ((D - 1.4) / 25));
    group.add(p);
  }
  const valance = new THREE.Mesh(new THREE.BoxGeometry(st.xFrontCenter - st.xBack + 0.4, 1.6, D + 0.6), valanceMat);
  valance.position.set((st.xBack + st.xFrontCenter) / 2, prosH - 0.8, cz);
  group.add(valance);
  const sideCurtainL = new THREE.Mesh(new THREE.BoxGeometry(st.xFrontEnds - st.xBack, prosH - st.height, 1.2), curtainMat);
  sideCurtainL.position.set((st.xBack + st.xFrontEnds) / 2, st.height + (prosH - st.height) / 2, f.zMin + 0.6);
  group.add(sideCurtainL);
  const sideCurtainR = sideCurtainL.clone();
  sideCurtainR.position.z = f.zMax - 0.6;
  group.add(sideCurtainR);
  // プロセニアム上部の壁
  const pros = new THREE.Mesh(new THREE.BoxGeometry(0.5, H - prosH + 0.2, D + 1.2), wallMat);
  pros.position.set(st.xFrontEnds, prosH + (H - prosH) / 2, cz);
  group.add(pros);
  // ステージ脇の壁（床レベル、ステージ両端から外壁まで）
  const stageWingWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, gal.depth + 1.5), wallMat);
  stageWingWall.position.set(st.xFrontEnds, H / 2, f.zMax + (gal.depth + 1.5) / 2);
  south.add(stageWingWall);
  const stageWingWall2 = stageWingWall.clone();
  stageWingWall2.position.z = f.zMin - (gal.depth + 1.5) / 2;
  group.add(stageWingWall2);
  // 時計（写真の雰囲気）
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0xf4f2ea }));
  clock.rotation.z = Math.PI / 2;
  clock.position.set(st.xFrontEnds + 0.3, prosH + 1.6, f.zMax + 2.6);
  group.add(clock);

  // ---- 曲面天井（大きな楕円ドーム状の面。下から見える） ----
  const ceilTex = makeCeilingTexture();
  ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping;
  ceilTex.repeat.set(3, 3);
  const cw = outer.xMax - outer.xMin;
  const cd = outer.zMax - outer.zMin;
  const ceilGeo = new THREE.PlaneGeometry(cw, cd, 48, 48);
  const pos = ceilGeo.attributes.position;
  const a = cw / 2;
  const b = cd / 2;
  const { edgeHeight, centerHeight } = venue.ceiling;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i); // 平面上のもう一方の軸（回転後に z）
    const r2 = Math.min(1, (x / a) ** 2 + (y / b) ** 2);
    pos.setZ(i, edgeHeight + (centerHeight - edgeHeight) * (1 - r2));
  }
  ceilGeo.computeVertexNormals();
  // 平面の z（高さ）を y に。法線は上向きになるので、下から見えるように BackSide で描く
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, color: 0xffffff, roughness: 1, side: THREE.BackSide, emissive: 0x2a2820 });
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.set((outer.xMin + outer.xMax) / 2, 0, (outer.zMin + outer.zMax) / 2);
  ceil.name = 'ceiling';
  group.add(ceil);

  // ---- 収納庫（仮位置）：観覧席の下の部屋。扉から床につながる ----
  const stMat = new THREE.MeshStandardMaterial({ color: 0xb9b6ad, roughness: 0.9, transparent: true, opacity: 0.55 });
  const roomW = storage.room.width;
  const roomD = storage.room.depth;
  const room = new THREE.Mesh(new THREE.BoxGeometry(roomW, lowH - 0.05, roomD), stMat);
  room.position.set(storage.anchor.x + 1.5, (lowH - 0.05) / 2, f.zMax + 0.3 + roomD / 2);
  room.name = 'storageRoom';
  group.add(room);
  const roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), new THREE.MeshStandardMaterial({ color: 0xa5a29a }));
  roomFloor.rotation.x = -Math.PI / 2;
  roomFloor.position.set(storage.anchor.x + 1.5, 0.01, f.zMax + 0.3 + roomD / 2);
  roomFloor.receiveShadow = true;
  group.add(roomFloor);
  // 扉の枠（黄色の目印）
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6 });
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.15, dz.height, 0.4), frameMat);
  frameL.position.set(dz.x - dHalf - 0.07, dz.height / 2, f.zMax + 0.15);
  group.add(frameL);
  const frameR = frameL.clone();
  frameR.position.x = dz.x + dHalf + 0.07;
  group.add(frameR);
  const frameT = new THREE.Mesh(new THREE.BoxGeometry(dz.width + 0.3, 0.15, 0.4), frameMat);
  frameT.position.set(dz.x, dz.height + 0.07, f.zMax + 0.15);
  group.add(frameT);

  const storageBox = {
    xMin: storage.anchor.x + 1.5 - roomW / 2,
    xMax: storage.anchor.x + 1.5 + roomW / 2,
    zMin: f.zMax + 0.3,
    zMax: f.zMax + 0.3 + roomD,
    yMax: lowH,
  };
  return { group, south, ceiling: ceil, storageRoom: room, storageBox, seatCount: inst.count, outer, floorCenter: { x: cx, z: cz } };
}
