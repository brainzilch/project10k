// 簡易な人型（スタッフ・来場者）。歩行は脚と腕を振るだけの記号的な表現。
import * as THREE from 'three';

const SKIN = 0xf1c9a5;
const shared = {
  head: new THREE.SphereGeometry(0.13, 16, 12),
  torso: new THREE.CapsuleGeometry(0.2, 0.4, 4, 12),
  leg: new THREE.BoxGeometry(0.16, 0.8, 0.16),
  arm: new THREE.CapsuleGeometry(0.055, 0.42, 4, 8),
  vest: new THREE.CapsuleGeometry(0.215, 0.36, 4, 12),
  skinMat: new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 }),
  legMat: new THREE.MeshStandardMaterial({ color: 0x2d3340, roughness: 0.85 }),
};

export const PALETTE = {
  staff: 0xf28c1a, // スタッフはオレンジのベスト
  visitors: [0x3b6ea8, 0x2c8c7c, 0x7a5aa6, 0x8a8f99, 0xb0505a, 0x4f7f3a, 0x6b7fb5, 0xa07a3a],
};

/**
 * @param {{staff?:boolean, color?:number, scale?:number}} o
 */
export function makePerson({ staff = false, color = 0x3b6ea8, scale = 0.92 } = {}) {
  const g = new THREE.Group();
  const root = new THREE.Group();
  g.add(root);

  const torsoMat = new THREE.MeshStandardMaterial({ color: staff ? 0x24303f : color, roughness: 0.75 });
  const torso = new THREE.Mesh(shared.torso, torsoMat);
  torso.position.y = 1.2;
  torso.scale.z = 0.75;
  torso.castShadow = true;
  root.add(torso);
  if (staff) {
    const vest = new THREE.Mesh(shared.vest, new THREE.MeshStandardMaterial({ color: PALETTE.staff, roughness: 0.7 }));
    vest.position.y = 1.2;
    vest.scale.set(1.0, 0.92, 0.82);
    root.add(vest);
  }
  const head = new THREE.Mesh(shared.head, shared.skinMat);
  head.position.y = 1.74;
  head.castShadow = true;
  root.add(head);

  const mkLimb = (geo, mat, x, y, ymesh) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = ymesh;
    m.castShadow = true;
    pivot.add(m);
    root.add(pivot);
    return pivot;
  };
  const legL = mkLimb(shared.leg, shared.legMat, -0.1, 0.8, -0.4);
  const legR = mkLimb(shared.leg, shared.legMat, 0.1, 0.8, -0.4);
  const armMat = new THREE.MeshStandardMaterial({ color: staff ? 0x24303f : color, roughness: 0.75 });
  const armL = mkLimb(shared.arm, armMat, -0.27, 1.42, -0.25);
  const armR = mkLimb(shared.arm, armMat, 0.27, 1.42, -0.25);

  g.rotation.order = 'YXZ';
  g.scale.setScalar(scale);
  g.userData = { root, legL, legR, armL, armR, baseScale: scale };
  return g;
}

/** 位置・向き・歩行・着席をまとめて設定する。 */
export function setPose(person, s) {
  const { root, legL, legR, armL, armR, baseScale } = person.userData;
  person.visible = !!s.vis;
  if (!s.vis) return;
  person.position.set(s.x, s.y || 0, s.z);
  person.rotation.set(s.fx || 0, s.yaw || 0, s.fz || 0);
  person.scale.setScalar(baseScale);
  if (s.seat) {
    root.position.y = -0.42;
    legL.rotation.x = -Math.PI / 2;
    legR.rotation.x = -Math.PI / 2;
    armL.rotation.x = -0.6;
    armR.rotation.x = -0.6;
  } else {
    const sw = s.moving ? Math.sin(s.phase) * 0.6 : 0;
    root.position.y = s.moving ? Math.abs(Math.sin(s.phase)) * 0.035 : 0;
    legL.rotation.x = sw;
    legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.8 + (s.armUp ? -2.4 : 0);
    armR.rotation.x = sw * 0.8;
  }
  // 演出用の腕の振り（殴る動作など）。着席中も足せる
  armR.rotation.x += s.ar || 0;
  armL.rotation.x += s.al || 0;
}

/** キーフレーム列 [{t,x,z,y?,yaw?,seat?,hide?}] から時刻 t の姿勢を返す。 */
export function prepKeyframes(kfs) {
  const out = kfs.map((k) => ({ y: 0, ...k }));
  for (let i = 0; i < out.length; i++) {
    if (out[i].yaw === undefined) {
      if (i > 0) {
        const a = out[i - 1];
        const b = out[i];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        out[i].yaw = Math.hypot(dx, dz) > 0.05 ? Math.atan2(dx, dz) : a.yaw;
      } else out[i].yaw = 0;
    }
  }
  return out;
}

export function sampleKeyframes(kfs, t) {
  const first = kfs[0];
  const last = kfs[kfs.length - 1];
  if (t < first.t) return { vis: false };
  if (t >= last.t) {
    if (last.hide) return { vis: false };
    return { vis: true, x: last.x, y: last.y, z: last.z, yaw: last.yaw, seat: !!last.seat, moving: false, phase: 0, fx: last.fx || 0, fz: last.fz || 0, ar: last.ar || 0, al: last.al || 0 };
  }
  let i = 0;
  while (i < kfs.length - 2 && t >= kfs[i + 1].t) i++;
  const a = kfs[i];
  const b = kfs[i + 1];
  const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dy = b.y - a.y;
  const moving = Math.hypot(dx, dz) > 0.05 && !a.still;
  const ex = (k) => (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * u;
  // keepYaw：車のように、向きをキーフレームの値から補間する（バックなどで進行方向と向きが違うため）
  const yaw = a.keepYaw ? a.yaw + (b.yaw - a.yaw) * u : moving ? Math.atan2(dx, dz) : a.yaw;
  return {
    vis: true,
    x: a.x + dx * u,
    y: a.y + dy * u,
    z: a.z + dz * u,
    yaw,
    seat: !!a.seat && !moving,
    moving,
    phase: t * 7.5,
    fx: ex('fx'),
    fz: ex('fz'),
    ar: ex('ar'),
    al: ex('al'),
  };
}

/** 簡易な乗用車（車体・キャビン・タイヤ）。進行方向が +z。 */
export function makeCar(color = 0x2f6fdd) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 4.2), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 }));
  body.position.y = 0.75;
  body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0xbfd6e8, roughness: 0.2 }));
  cab.position.set(0, 1.4, -0.2);
  cab.castShadow = true;
  g.add(body, cab);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  for (const [x, z] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    g.add(w);
  }
  g.userData = { isCar: true };
  return g;
}
