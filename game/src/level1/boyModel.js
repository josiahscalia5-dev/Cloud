// The boy's 3D model, built from simple rounded shapes and coloured to match the reference art:
// spiky brown hair, cream T-shirt, big blue backpack with leather flap and straps, navy shorts,
// brown knee pads, chunky brown boots with light tread, fingerless gloves.
//
// Every body part is its own bone group (pelvis, chest, head, upper/lower arms, hands, thighs,
// shins, feet). Each bone carries ONE merged mesh with vertex colours plus an ink outline, so
// the whole boy is ~30 draw calls. Bone spaces: +Y up the bone (legs and arms hang along -Y),
// +Z is the boy's forward. The boy's left is +X.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Proportions (metres). The boy is about 1.38 m to the tips of his hair.
export const DIM = {
  thigh: 0.285, shin: 0.285, ankleH: 0.077,   // hip joint -> knee -> ankle; ankle joint above the sole
  hipX: 0.085,                                // hip joints either side of the pelvis centre
  hipY: 0.645,                                // hip joint height with straight legs
  spineY: 0.05,                               // lumbar joint above the pelvis centre
  shoulderX: 0.168, shoulderY: 0.252,         // shoulder joints in chest space
  upperArm: 0.2, foreArm: 0.172,
  neckY: 0.3,                                 // head joint in chest space
};

export const COLORS = {
  skin: 0xf3c7a0, skinShade: 0xe4ab86, lip: 0xc98470,
  hair: 0x4c2411, hairMid: 0x6e3719, hairTip: 0xa05e2c,
  shirt: 0xf3efe6, shirtShade: 0xd9d2c4,
  shorts: 0x2b4a8e, shortsDark: 0x1d3468,
  pack: 0x2c5cb0, packLight: 0x4588d8, packDark: 0x1d4185,
  leather: 0x9a5f33, leatherDark: 0x6b3e1f, brass: 0xe7b85c,
  boot: 0x7d4a26, bootDark: 0x5b331a, sole: 0x3b312b, tread: 0xcdb999,
  glove: 0x4a2b1c, cuff: 0xb9733c, kneepad: 0x8e5a31, strap: 0x5e3820,
  eye: 0x2c1a12, white: 0xffffff, brow: 0x4a2412,
};

const _c = new THREE.Color();

function prep(geo) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  return g;
}

function paint(geo, color, grad) {
  const pos = geo.attributes.position, n = pos.count;
  const col = new Float32Array(n * 3);
  const a = new THREE.Color(color), b = grad ? new THREE.Color(grad.to) : null;
  for (let i = 0; i < n; i++) {
    if (grad) {
      const t = THREE.MathUtils.clamp(grad.fn(pos.getX(i), pos.getY(i), pos.getZ(i)), 0, 1);
      _c.copy(a).lerp(b, t);
    } else _c.copy(a);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

/** Collects coloured shapes for one bone and merges them. */
class Parts {
  constructor() { this.list = []; }
  add(geo, color, o = {}) {
    const g = prep(geo);
    if (o.scale) g.scale(o.scale[0], o.scale[1], o.scale[2]);
    if (o.rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rot[0], o.rot[1], o.rot[2], o.order || "XYZ")));
    if (o.quat) g.applyQuaternion(o.quat);
    if (o.pos) g.translate(o.pos[0], o.pos[1], o.pos[2]);
    paint(g, color, o.grad);
    this.list.push(g);
    return g;
  }
  build() {
    const g = mergeGeometries(this.list, false);
    g.computeBoundingSphere();
    return g;
  }
}

/** Surface of revolution around Y from a profile given bottom -> top as [radius, y] pairs. */
function lathe(profile, seg = 16) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);
}

/** Tapered limb hanging from y=0 down to y=-len, radius r0 at the top and r1 at the bottom, rounded ends. */
function limb(r0, r1, len, seg = 14, capTop = 0.6, capBot = 0.6) {
  const p = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {                       // bottom cap, from the pole up
    const a = (i / n) * Math.PI / 2;
    p.push([Math.sin(a) * r1, -len - Math.cos(a) * r1 * capBot]);
  }
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    p.push([r1 + (r0 - r1) * t, -len + len * t]);
  }
  for (let i = 0; i <= n; i++) {                       // top cap, up to the pole
    const a = (i / n) * Math.PI / 2;
    p.push([Math.cos(a) * r0, Math.sin(a) * r0 * capTop]);
  }
  return lathe(p, seg);
}

function sphere(r, ws = 18, hs = 12) { return new THREE.SphereGeometry(r, ws, hs); }
function rbox(w, h, d, r, seg = 3) { return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999); }

/** Tube along a list of points, with an elliptical cross-section flattened by `flat`. */
function strap(points, radius, flat = 0.45, seg = 24) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, seg, radius, 6, false);
  // flatten the tube against the body: squash each ring along the body's surface normal there
  // (approximated by the direction from a point inside the chest)
  const pos = g.attributes.position;
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg);
    const out = new THREE.Vector3(c.x * 0.45, c.y - 0.14, c.z).normalize();
    for (let j = 0; j <= 6; j++) {
      const k = i * 7 + j;
      const v = new THREE.Vector3().fromBufferAttribute(pos, k).sub(c);
      const along = v.dot(out);
      v.addScaledVector(out, -along * (1 - flat));
      pos.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------
// Materials

/** Body material: soft PBR with a lavender rim so the boy reads against the bright sky, as in the art. */
export function makeBodyMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: new THREE.Color(0xe8dcff) };
    sh.fragmentShader = "uniform vec3 uRim;\n" + sh.fragmentShader.replace(
      "#include <dithering_fragment>",
      `#include <dithering_fragment>
       float rimF = 1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);
       gl_FragColor.rgb += uRim * pow(rimF, 3.0) * 0.42;`);
  };
  m.customProgramCacheKey = () => "rcBody";
  return m;
}

/** Ink outline: back faces pushed out along their normals by a constant number of screen pixels. */
export function makeOutlineMaterial(color = 0x2a1830) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uWidth: { value: 1.6 }, uRes: { value: new THREE.Vector2(1080, 1920) } },
    side: THREE.BackSide,
    vertexShader: `
      uniform float uWidth; uniform vec2 uRes;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 nv = normalize(normalMatrix * normal);
        vec2 nc = (projectionMatrix * vec4(nv, 0.0)).xy;
        float l = length(nc);
        if (l > 1e-5) clip.xy += (nc / l) * uWidth * 2.0 / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
}

// ---------------------------------------------------------------------------------------------
// Body parts. Each returns a merged BufferGeometry in its bone's space.

function buildPelvis() {
  const C = COLORS, p = new Parts();
  // shorts seat: a rounded bowl from the waist down to the crotch
  p.add(sphere(1, 20, 14), C.shorts, { scale: [0.152, 0.118, 0.112], pos: [0, 0.0, -0.004],
    grad: { to: C.shortsDark, fn: (x, y) => 0.5 - y * 4 } });
  p.add(lathe([[0.138, 0.0], [0.142, 0.05], [0.14, 0.09]], 20), C.shorts, { scale: [1, 1, 0.76] });
  // belt loops / waistband seam
  p.add(new THREE.TorusGeometry(0.139, 0.009, 6, 28), C.shortsDark, { rot: [Math.PI / 2, 0, 0], scale: [1, 0.76, 1], pos: [0, 0.075, 0] });
  return p.build();
}

function buildChest() {
  const C = COLORS, p = new Parts();
  // T-shirt torso
  const torso = [[0.128, -0.1], [0.131, -0.05], [0.134, 0.0], [0.14, 0.05], [0.149, 0.11], [0.157, 0.16],
    [0.16, 0.2], [0.157, 0.235], [0.143, 0.262], [0.118, 0.283], [0.082, 0.298], [0.05, 0.305], [0.0, 0.307]];
  p.add(lathe(torso, 22), C.shirt, { scale: [1, 1, 0.72], grad: { to: C.shirtShade, fn: (x, y) => (0.05 - y) * 4 } });
  p.add(new THREE.TorusGeometry(0.129, 0.012, 6, 28), C.shirtShade, { rot: [Math.PI / 2, 0, 0], scale: [1, 0.72, 1], pos: [0, -0.095, 0] });
  // collar
  p.add(new THREE.TorusGeometry(0.052, 0.012, 6, 20), C.shirtShade, { rot: [Math.PI / 2 - 0.2, 0, 0], pos: [0, 0.3, 0.004] });

  // --- backpack (behind the chest, the boy's back is -Z) ---
  const bz = -0.2;
  p.add(rbox(0.31, 0.33, 0.155, 0.055, 4), C.pack, { pos: [0, 0.125, bz],
    grad: { to: C.packDark, fn: (x, y) => 0.55 - y * 2.2 } });
  // front pocket (faces the camera) with a leather flap
  p.add(rbox(0.225, 0.145, 0.06, 0.026, 3), C.packLight, { pos: [0, 0.055, bz - 0.087] });
  p.add(rbox(0.232, 0.052, 0.068, 0.02, 3), C.leather, { pos: [0, 0.125, bz - 0.09], rot: [0.12, 0, 0] });
  p.add(rbox(0.05, 0.022, 0.014, 0.006, 2), C.brass, { pos: [0, 0.098, bz - 0.126] });
  // pocket stitching
  p.add(rbox(0.2, 0.006, 0.004, 0.002, 1), C.packDark, { pos: [0, 0.0, bz - 0.119] });
  // top flap and strap with buckle
  p.add(rbox(0.318, 0.058, 0.172, 0.024, 3), C.leather, { pos: [0, 0.29, bz - 0.004],
    grad: { to: C.leatherDark, fn: (x, y) => 0.3 - (y - 0.29) * 8 } });
  p.add(rbox(0.05, 0.16, 0.016, 0.007, 2), C.leather, { pos: [0, 0.225, bz - 0.083], rot: [0.08, 0, 0] });
  p.add(rbox(0.066, 0.04, 0.02, 0.008, 2), C.brass, { pos: [0, 0.18, bz - 0.09] });
  p.add(rbox(0.036, 0.018, 0.022, 0.005, 1), C.leatherDark, { pos: [0, 0.18, bz - 0.092] });
  // carry handle
  p.add(new THREE.TorusGeometry(0.038, 0.011, 6, 12, Math.PI), C.leatherDark, { pos: [0, 0.318, bz] });
  // side pockets
  for (const s of [-1, 1]) {
    p.add(rbox(0.058, 0.15, 0.11, 0.022, 3), C.packDark, { pos: [s * 0.162, 0.06, bz] });
    p.add(rbox(0.062, 0.03, 0.114, 0.01, 2), C.leather, { pos: [s * 0.163, 0.13, bz] });
  }
  // leather base
  p.add(rbox(0.3, 0.048, 0.15, 0.02, 3), C.leatherDark, { pos: [0, -0.04, bz] });
  // shoulder straps: from the top of the pack, over the shoulders, down the front of the chest
  for (const s of [-1, 1]) {
    p.add(strap([[s * 0.085, 0.24, -0.125], [s * 0.098, 0.296, -0.07], [s * 0.104, 0.306, 0.0],
      [s * 0.1, 0.27, 0.085], [s * 0.094, 0.17, 0.118], [s * 0.09, 0.06, 0.113]], 0.021, 0.42, 26), C.leather);
    p.add(rbox(0.04, 0.03, 0.014, 0.007, 2), C.brass, { pos: [s * 0.094, 0.15, 0.122] });
  }
  return p.build();
}

function hairCap(center, r) {
  // A sphere whose vertices below the hairline sink inside the skull. The hairline is low at the
  // nape, above the ears at the sides and at the top of the forehead at the front.
  const g = new THREE.SphereGeometry(r, 28, 20);
  const pos = g.attributes.position;
  const knots = [[0, -62], [55, -48], [90, -8], [120, 14], [150, 26], [180, 30]];
  const hl = (az) => {
    for (let i = 1; i < knots.length; i++) if (az <= knots[i][0]) {
      const t = (az - knots[i - 1][0]) / (knots[i][0] - knots[i - 1][0]);
      return knots[i - 1][1] + (knots[i][1] - knots[i - 1][1]) * t;
    }
    return knots[knots.length - 1][1];
  };
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const el = THREE.MathUtils.radToDeg(Math.asin(v.y));
    const az = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(v.x, -v.z)));   // 0 at the back, 180 at the face
    const below = hl(az) - el;
    const k = below > 0 ? Math.max(0.86, 1 - below * 0.02) : 1;
    pos.setXYZ(i, v.x * r * k, v.y * r * k, v.z * r * k);
  }
  g.translate(center.x, center.y, center.z);
  return g;
}

function buildHead() {
  const C = COLORS, p = new Parts();
  const hc = new THREE.Vector3(0, 0.138, -0.004);            // skull centre in head space
  // neck
  p.add(limb(0.046, 0.05, 0.1, 12, 0.2, 0.2), C.skinShade, { pos: [0, 0.035, 0] });
  // skull and cheeks
  p.add(sphere(0.158, 26, 18), C.skin, { scale: [1.0, 1.0, 1.03], pos: [hc.x, hc.y, hc.z] });
  p.add(sphere(0.126, 22, 14), C.skin, { scale: [1.04, 0.9, 1.0], pos: [0, 0.086, 0.032] });
  // ears
  for (const s of [-1, 1]) {
    p.add(sphere(0.036, 12, 8), C.skinShade, { scale: [0.45, 1, 0.72], pos: [s * 0.156, 0.112, -0.012] });
  }
  // face (seen when he turns): eyes with highlights, brows, nose, a small smile
  for (const s of [-1, 1]) {
    p.add(sphere(0.027, 12, 10), C.eye, { scale: [0.82, 1.22, 0.46], pos: [s * 0.057, 0.127, 0.148] });
    p.add(sphere(0.0075, 8, 6), C.white, { pos: [s * 0.052 + 0.006, 0.139, 0.16] });
    p.add(rbox(0.05, 0.012, 0.014, 0.005, 1), C.brow, { pos: [s * 0.058, 0.178, 0.146], rot: [0, 0, s * -0.16] });
  }
  p.add(sphere(0.018, 10, 8), C.skinShade, { pos: [0, 0.098, 0.163] });
  p.add(new THREE.TorusGeometry(0.024, 0.0045, 5, 10, Math.PI * 0.8), C.lip,
    { rot: [0, 0, Math.PI + Math.PI * 0.1], pos: [0, 0.064, 0.152] });

  // hair: a cap plus spiky clumps swept back and up, as in the art
  const hairGrad = (base) => ({ to: C.hairTip, fn: (x, y, z) => {
    const d = Math.hypot(x - hc.x, y - hc.y, z - hc.z);
    return (d - 0.175) / 0.16 + base;
  } });
  p.add(hairCap(hc, 0.171), C.hair, { grad: { to: C.hairMid, fn: (x, y) => (y - 0.15) * 5 } });

  // Locks: [azimuth deg (0 = back, +90 = his left, 180 = face), elevation deg, length, base radius, sweep-up]
  // Big swept-back locks radiating from the crown, like the painted boy; a short fringe in front.
  const LOCKS = [
    [0, 84, 0.2, 0.078, 0.2], [40, 76, 0.19, 0.075, 0.3], [-40, 76, 0.19, 0.075, 0.3], [140, 72, 0.17, 0.07, 0.5], [-140, 72, 0.17, 0.07, 0.5],
    [90, 68, 0.17, 0.072, 0.4], [-90, 68, 0.17, 0.072, 0.4], [180, 70, 0.15, 0.068, 0.55],
    [0, 55, 0.2, 0.08, 0.1], [30, 48, 0.19, 0.078, 0.05], [-30, 48, 0.19, 0.078, 0.05], [62, 42, 0.18, 0.074, 0.05], [-62, 42, 0.18, 0.074, 0.05],
    [95, 36, 0.15, 0.068, 0.0], [-95, 36, 0.15, 0.068, 0.0], [120, 45, 0.14, 0.064, 0.2], [-120, 45, 0.14, 0.064, 0.2],
    [0, 22, 0.17, 0.078, -0.15], [36, 16, 0.16, 0.074, -0.2], [-36, 16, 0.16, 0.074, -0.2], [72, 12, 0.13, 0.066, -0.25], [-72, 12, 0.13, 0.066, -0.25],
    [16, -10, 0.12, 0.068, -0.45], [-16, -10, 0.12, 0.068, -0.45], [50, -8, 0.1, 0.06, -0.45], [-50, -8, 0.1, 0.06, -0.45],
    [18, 66, 0.15, 0.06, 0.3], [-18, 66, 0.15, 0.06, 0.3], [64, 58, 0.14, 0.06, 0.3], [-64, 58, 0.14, 0.06, 0.3],
  ];
  const FRINGE = [[160, 42, 0.11, 0.058], [-160, 42, 0.11, 0.058], [180, 46, 0.12, 0.06], [138, 36, 0.1, 0.052], [-138, 36, 0.1, 0.052]];
  const dirOf = (azD, elD) => {
    const az = THREE.MathUtils.degToRad(azD), el = THREE.MathUtils.degToRad(elD);
    return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az));
  };
  const up = new THREE.Vector3(0, 1, 0);
  const lock = (dir, len, rad, axis, bendDir, bend) => {
    // a flattened cone, bent along its length toward bendDir
    const cone = new THREE.ConeGeometry(rad, len, 7, 5);
    cone.translate(0, len / 2 - 0.02, 0);
    cone.scale(1, 1, 0.68);
    const q = new THREE.Quaternion().setFromUnitVectors(up, axis);
    cone.applyQuaternion(q);
    const pos = cone.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const h = Math.max(0, v.dot(axis)) / len;
      v.addScaledVector(bendDir, bend * h * h * len);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    cone.computeVertexNormals();
    const base = hc.clone().addScaledVector(dir, 0.14);
    p.add(cone, C.hair, { pos: [base.x, base.y, base.z], grad: hairGrad(0) });
  };
  const back = new THREE.Vector3(0, 0, -1);
  for (const [az, el, len, rad, upw] of LOCKS) {
    const dir = dirOf(az, el);
    // sweep back (and up for the crown locks)
    const axis = dir.clone().multiplyScalar(1.0).add(new THREE.Vector3(0, upw * 0.8, -0.32)).normalize();
    const bendDir = back.clone().addScaledVector(axis, -back.dot(axis)).normalize();
    lock(dir, len, rad, axis, bendDir, 0.35);
  }
  for (const [az, el, len, rad] of FRINGE) {
    const dir = dirOf(az, el);
    const axis = dir.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, -0.35, 0.5)).normalize();
    const down = new THREE.Vector3(0, -1, 0);
    const bendDir = down.addScaledVector(axis, -down.dot(axis)).normalize();
    lock(dir, len, rad, axis, bendDir, 0.3);
  }
  return p.build();
}

function buildUpperArm(side) {
  const C = COLORS, p = new Parts(), L = DIM.upperArm;
  p.add(sphere(0.061, 16, 12), C.shirt, { scale: [1, 0.95, 1] });
  p.add(lathe([[0.059, -0.105], [0.061, -0.09], [0.062, -0.04], [0.06, 0.0], [0.045, 0.04]], 16), C.shirt,
    { grad: { to: C.shirtShade, fn: (x, y) => -y * 6 } });
  p.add(new THREE.TorusGeometry(0.058, 0.008, 6, 18), C.shirtShade, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.1, 0] });
  p.add(limb(0.041, 0.036, L - 0.07, 14), C.skin, { pos: [0, -0.07, 0] });
  void side;
  return p.build();
}

function buildForeArm() {
  const C = COLORS, p = new Parts(), L = DIM.foreArm;
  p.add(sphere(0.038, 12, 10), C.skin);
  p.add(limb(0.037, 0.031, L - 0.02, 14), C.skin);
  p.add(lathe([[0.04, -L - 0.004], [0.042, -L + 0.02], [0.041, -L + 0.05], [0.036, -L + 0.056]], 14), C.cuff);
  return p.build();
}

function buildHand(side) {
  const C = COLORS, p = new Parts();
  p.add(rbox(0.058, 0.072, 0.056, 0.022, 3), C.glove, { pos: [0, -0.04, 0.004] });
  p.add(rbox(0.056, 0.03, 0.05, 0.013, 2), C.skinShade, { pos: [0, -0.078, 0.014], rot: [0.35, 0, 0] });
  p.add(limb(0.014, 0.012, 0.035, 8), C.skin, { pos: [side * 0.027, -0.026, 0.024], rot: [0.5, 0, side * 0.5] });
  return p.build();
}

function buildThigh() {
  const C = COLORS, p = new Parts(), L = DIM.thigh;
  // shorts leg
  p.add(lathe([[0.071, -0.172], [0.074, -0.16], [0.077, -0.08], [0.079, 0.0], [0.07, 0.04]], 16), C.shorts,
    { grad: { to: C.shortsDark, fn: (x, y) => -y * 3.2 } });
  p.add(new THREE.TorusGeometry(0.072, 0.009, 6, 18), C.shortsDark, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.168, 0] });
  // skin between the hem and the knee
  p.add(limb(0.057, 0.048, L - 0.14, 14, 0.3, 0.6), C.skin, { pos: [0, -0.14, 0] });
  return p.build();
}

function buildShin() {
  const C = COLORS, p = new Parts(), L = DIM.shin;
  p.add(sphere(0.049, 12, 10), C.skin);                                   // knee
  p.add(limb(0.046, 0.04, L - 0.1, 14), C.skin);
  // knee pad with its strap
  p.add(sphere(1, 16, 12), C.kneepad, { scale: [0.056, 0.066, 0.042], pos: [0, -0.012, 0.03],
    grad: { to: C.leatherDark, fn: (x, y) => -y * 8 + 0.1 } });
  p.add(new THREE.TorusGeometry(0.049, 0.008, 6, 18), C.strap, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.055, 0.002] });
  // boot shaft up to mid-shin, with a rolled cuff
  p.add(lathe([[0.052, -L - 0.03], [0.055, -L + 0.02], [0.056, -L + 0.1], [0.058, -L + 0.14]], 16), C.boot,
    { grad: { to: C.bootDark, fn: (x, y) => (-L + 0.14 - y) * 5 } });
  p.add(new THREE.TorusGeometry(0.06, 0.013, 6, 18), C.bootDark, { rot: [Math.PI / 2, 0, 0], pos: [0, -L + 0.14, 0] });
  return p.build();
}

function buildFoot() {
  const C = COLORS, p = new Parts(), A = DIM.ankleH;
  // origin at the ankle joint; toes toward +Z; the tread is flush with y = -ankleH
  p.add(sphere(0.054, 14, 10), C.boot, { pos: [0, -0.012, -0.004] });
  p.add(rbox(0.104, 0.078, 0.205, 0.036, 3), C.boot, { pos: [0, -A + 0.052, 0.046],
    grad: { to: C.bootDark, fn: (x, y, z) => 0.15 + (0.1 - z) * 1.2 } });
  p.add(sphere(1, 14, 10), C.boot, { scale: [0.054, 0.042, 0.05], pos: [0, -A + 0.046, 0.128] });
  p.add(rbox(0.112, 0.026, 0.228, 0.011, 2), C.sole, { pos: [0, -A + 0.017, 0.047] });
  p.add(rbox(0.1, 0.007, 0.206, 0.003, 1), C.tread, { pos: [0, -A + 0.0035, 0.047] });
  // laces
  for (let i = 0; i < 3; i++) p.add(rbox(0.05, 0.007, 0.012, 0.003, 1), C.bootDark, { pos: [0, -A + 0.093 - i * 0.006, 0.08 + i * 0.025], rot: [0.5, 0, 0] });
  return p.build();
}

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds the bone groups (empty of pose) and their meshes.
 * Returns { root, pivot, body, pelvis, chest, head, upperArm[2], foreArm[2], hand[2], thigh[2], shin[2], foot[2], meshes }
 * Index 0 = left (+X), 1 = right (-X).
 */
export function buildBoyModel({ outline = true } = {}) {
  const bodyMat = makeBodyMaterial();
  const inkMat = outline ? makeOutlineMaterial() : null;
  const meshes = [];
  const bone = (name, geo, parent) => {
    const g = new THREE.Group();
    g.name = name;
    if (geo) {
      const m = new THREE.Mesh(geo, bodyMat);
      m.castShadow = true;
      g.add(m);
      meshes.push(m);
      if (inkMat) { const o = new THREE.Mesh(geo, inkMat); o.name = name + "_ink"; g.add(o); meshes.push(o); }
    }
    if (parent) parent.add(g);
    return g;
  };

  const root = new THREE.Group(); root.name = "boy";
  const pivot = bone("pivot", null, root);       // flips and whole-body tilts turn around the hips
  const body = bone("body", null, pivot);
  const pelvis = bone("pelvis", buildPelvis(), body);
  const chest = bone("chest", buildChest(), pelvis);
  const head = bone("head", buildHead(), chest);
  const upperArm = [], foreArm = [], hand = [], thigh = [], shin = [], foot = [];
  const handGeo = [buildHand(1), buildHand(-1)];
  const uaGeo = buildUpperArm(1), faGeo = buildForeArm(), thGeo = buildThigh(), shGeo = buildShin(), ftGeo = buildFoot();
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    upperArm[i] = bone("upperArm" + i, uaGeo, chest);
    upperArm[i].position.set(s * DIM.shoulderX, DIM.shoulderY, -0.005);
    foreArm[i] = bone("foreArm" + i, faGeo, upperArm[i]);
    foreArm[i].position.set(0, -DIM.upperArm, 0);
    hand[i] = bone("hand" + i, handGeo[i], foreArm[i]);
    hand[i].position.set(0, -DIM.foreArm, 0);
    thigh[i] = bone("thigh" + i, thGeo, body);
    shin[i] = bone("shin" + i, shGeo, body);
    foot[i] = bone("foot" + i, ftGeo, body);
  }
  chest.position.set(0, DIM.spineY, 0);
  head.position.set(0, DIM.neckY, 0.0);
  for (const g of [pelvis, chest, head, ...upperArm, ...foreArm, ...hand]) g.rotation.order = "YXZ";
  for (const g of [...upperArm, ...foreArm]) g.rotation.order = "XYZ";
  return { root, pivot, body, pelvis, chest, head, upperArm, foreArm, hand, thigh, shin, foot, meshes, bodyMat, inkMat };
}
