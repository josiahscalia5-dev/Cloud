// Meshes for the course: jelly blocks, rolling cubes, stone blocks, grassy checkpoint islands,
// road ribbons, coins, gems, rings and big floating crystals.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { jellyMaterial, roadMaterial, lightfallMaterial, glowMaterial, PALETTE, waterfallMaterial } from "./materials.js";
import { mul } from "./textures.js";

const geoCache = {};
function roundedBox(w, h, d, r) {
  const k = [w, h, d, r].join(",");
  return geoCache[k] || (geoCache[k] = new RoundedBoxGeometry(w, h, d, 4, r));
}

/** A glossy jelly (or stone) block whose top face sits at y = 0 of the returned group. */
export function makeBlock(paletteKey, size, opts = {}) {
  const g = new THREE.Group();
  const mat = jellyMaterial(paletteKey, size, opts);
  const mesh = new THREE.Mesh(roundedBox(size.w, size.h, size.d, Math.min(0.2, size.h * 0.22)), mat);
  mesh.position.y = -size.h / 2;
  g.add(mesh);
  g.userData.mesh = mesh;
  g.userData.mat = mat;
  if (opts.lightfall !== false) {
    const P = PALETTE[paletteKey];
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0), lightfallMaterial(P.stone ? 0xff7a3c : P.light));
    lf.scale.set(size.w * 1.05, opts.fallLen || 5.5, 1);
    lf.position.y = -size.h * 0.85;
    lf.frustumCulled = false;
    g.add(lf);
    g.userData.lightfall = lf;
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Checkpoint islands: a grassy disc with flowers on top of a craggy rock cone.

export function makeIsland(radius, seed = 1, opts = {}) {
  const rnd = mul(seed * 97 + 13);
  const g = new THREE.Group();
  const parts = [];
  const col = (geo, fn) => {
    geo = geo.index ? geo.toNonIndexed() : geo;
    geo.deleteAttribute("uv");
    const p = geo.attributes.position, c = new Float32Array(p.count * 3), tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), tmp); c.set([tmp.r, tmp.g, tmp.b], i * 3); }
    geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
    parts.push(geo);
  };
  // rock underside: a lumpy cone
  const rock = new THREE.CylinderGeometry(radius * 1.02, radius * 0.18, radius * 2.3, 20, 8, true);
  rock.translate(0, -radius * 1.15 - 0.35, 0);
  const rp = rock.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) {
    v.fromBufferAttribute(rp, i);
    const a = Math.atan2(v.z, v.x), t = (-v.y - 0.35) / (radius * 2.3);
    const n = 1 + 0.16 * Math.sin(a * 5 + seed) + 0.1 * Math.sin(a * 11 + t * 9 + seed * 2) + 0.12 * Math.sin(t * 14 + a * 3);
    v.x *= n; v.z *= n;
    if (t > 0.02) v.y -= Math.sin(a * 7 + seed) * 0.25 * radius * t;
    rp.setXYZ(i, v.x, v.y, v.z);
  }
  rock.computeVertexNormals();
  const rockA = new THREE.Color(0xb58a7a), rockB = new THREE.Color(0x6e4f6e), rockC = new THREE.Color(0x8a6aa0);
  col(rock, (x, y, z, c) => {
    const t = THREE.MathUtils.clamp((-y) / (radius * 2.4), 0, 1);
    const band = 0.5 + 0.5 * Math.sin(y * 3.1 + Math.atan2(z, x) * 2);
    c.copy(rockA).lerp(rockB, t).lerp(rockC, band * 0.25);
  });
  // grass cap
  const cap = new THREE.CylinderGeometry(radius * 1.08, radius * 1.02, 0.5, 28, 1, false);
  cap.translate(0, -0.25, 0);
  const grass = new THREE.Color(0x6fd24a), grassDark = new THREE.Color(0x3f9a36), soil = new THREE.Color(0x8a5e3c);
  col(cap, (x, y, z, c) => {
    if (y > -0.02) c.copy(grass).lerp(grassDark, 0.3 + 0.3 * Math.sin(x * 3.1) * Math.sin(z * 2.7));
    else c.copy(grassDark).lerp(soil, THREE.MathUtils.clamp(-y / 0.5, 0, 1));
  });
  // little flowers (five petals round a yellow heart) and blades of grass around the rim
  const cols = [0xff7ab8, 0xffffff, 0xb98aff, 0xff9a6a, 0x8fd0ff];
  const heart = new THREE.Color(0xffd84a);
  for (let i = 0; i < Math.round(radius * 11); i++) {
    const a = rnd() * Math.PI * 2, r = radius * (0.5 + rnd() * 0.47);
    const fx = Math.cos(a) * r, fz = Math.sin(a) * r;
    const cc = new THREE.Color(cols[i % cols.length]);
    const ph = rnd() * 6;
    for (let k = 0; k < 5; k++) {
      const pa = ph + k * Math.PI * 2 / 5;
      const pet = new THREE.SphereGeometry(0.045, 6, 4);
      pet.scale(1, 0.45, 1);
      pet.translate(fx + Math.cos(pa) * 0.05, 0.06, fz + Math.sin(pa) * 0.05);
      col(pet, (x, y, z, c) => c.copy(cc));
    }
    const hc = new THREE.SphereGeometry(0.03, 6, 4);
    hc.translate(fx, 0.075, fz);
    col(hc, (x, y, z, c) => c.copy(heart));
    for (let k = 0; k < 3; k++) {
      const ba = a + 0.25 + k * 0.05, br = r * (0.93 + k * 0.03);
      const blade = new THREE.ConeGeometry(0.025, 0.2 + rnd() * 0.12, 3);
      blade.rotateZ((rnd() - 0.5) * 0.5);
      blade.translate(Math.cos(ba) * br, 0.1, Math.sin(ba) * br);
      col(blade, (x, y, z, c) => c.copy(grassDark).lerp(grass, THREE.MathUtils.clamp(y / 0.25, 0, 1)));
    }
  }
  // a small round tree at the back edge
  if (opts.tree !== false) {
    const a = rnd() * Math.PI * 2;
    const tx = Math.cos(a) * radius * 0.78, tz = Math.sin(a) * radius * 0.78;
    const trunk = new THREE.CylinderGeometry(0.1, 0.14, 1.2, 6);
    trunk.translate(tx, 0.6, tz);
    col(trunk, (x, y, z, c) => c.set(0x7a4a2a));
    for (let k = 0; k < 3; k++) {
      const b = new THREE.IcosahedronGeometry(0.55 - k * 0.1, 1);
      b.translate(tx + (k - 1) * 0.25, 1.35 + k * 0.28, tz + (k % 2) * 0.2);
      col(b, (x, y, z, c) => c.set(0x4fb848).lerp(new THREE.Color(0x9be36a), (y - 1.2) / 1.2));
    }
    g.userData.tree = { x: tx, z: tz };
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.receiveShadow = true;
  g.add(mesh);
  if (opts.falls) {
    // a rainbow waterfall pouring off the edge into the clouds
    const a = opts.falls;
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(radius * 0.9, 9, 1, 1).translate(0, -4.5, 0), waterfallMaterial());
    wf.position.set(Math.cos(a) * radius * 1.03, -0.05, Math.sin(a) * radius * 1.03);
    wf.rotation.y = -a + Math.PI / 2;
    g.add(wf);
  }
  return g;
}

// ---------------------------------------------------------------------------------------------
// Roads: a ribbon along a curve, with thin glowing sides. uv.x runs across, uv.y is metres along.

export function makeRoad(curve, width, mode, lanes, ranges, opts = {}) {
  const g = new THREE.Group();
  const L = curve.getLength();
  const mat = roadMaterial(mode, lanes);
  const thick = opts.thick || 0.34;
  for (const [s0, s1] of ranges) {
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.5));
    const pos = [], nor = [], uv = [], side = [], idx = [];
    const push = (p, nn, u, v, sd) => { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uv.push(u, v); side.push(sd); };
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const strips = [];          // each strip: 2 vertices per ring
    const rings = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + (s1 - s0) * (i / n);
      curve.getPointAt(Math.min(1, s / L), P);
      curve.getTangentAt(Math.min(1, s / L), T);
      const yaw = Math.atan2(T.x, T.z);
      const R = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));       // the boy's right
      const lE = P.clone().addScaledVector(R, -width / 2), rE = P.clone().addScaledVector(R, width / 2);
      rings.push({ s, lE, rE, R, P: P.clone() });
    }
    const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
    // top surface
    let base = 0;
    for (const r of rings) { push(r.lE, up, 0, r.s, 0); push(r.rE, up, 1, r.s, 0); }
    for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    base = pos.length / 3;
    // left side, right side, bottom (all wound to face outward)
    for (const [e, nrm] of [["lE", -1], ["rE", 1]]) {
      const b0 = pos.length / 3;
      for (const r of rings) {
        const nn = r.R.clone().multiplyScalar(nrm);
        push(r[e], nn, nrm < 0 ? 0 : 1, r.s, 1);
        push(r[e].clone().add(new THREE.Vector3(0, -thick, 0)), nn, nrm < 0 ? 0.02 : 0.98, r.s, 1);
      }
      for (let i = 0; i < n; i++) {
        const a = b0 + i * 2;
        if (nrm < 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const b1 = pos.length / 3;
    for (const r of rings) { push(r.lE.clone().setY(r.lE.y - thick), down, 0, r.s, 1); push(r.rE.clone().setY(r.rE.y - thick), down, 1, r.s, 1); }
    for (let i = 0; i < n; i++) { const a = b1 + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("side", new THREE.Float32BufferAttribute(side, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    g.add(mesh);
    // light falling from the road's edges
    const lfCol = mode === 0 ? 0xffffff : mode === 1 ? 0x9fdcff : 0xffd27a;
    for (let s = s0 + 1.2; s < s1 - 0.6; s += 3.2) {
      curve.getPointAt(Math.min(1, s / L), P);
      const lf = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0), lightfallMaterial(lfCol));
      lf.scale.set(width * 0.9, 5, 1);
      lf.position.copy(P).add(new THREE.Vector3(0, -thick, 0));
      lf.frustumCulled = false;
      g.add(lf);
    }
  }
  g.userData.mat = mat;
  return g;
}

// ---------------------------------------------------------------------------------------------
// Pickups

let coinGeo = null, coinMat = null;
export function makeCoin() {
  if (!coinGeo) {
    const rim = new THREE.CylinderGeometry(0.3, 0.3, 0.07, 28, 1);
    rim.rotateX(Math.PI / 2);
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.085 : 0.19;
      i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const star = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 1 });
    star.translate(0, 0, -0.05);
    const ring = new THREE.TorusGeometry(0.255, 0.028, 6, 28);
    const parts = [rim, star, ring].map((g) => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute("uv"); return g; });
    const colors = [0xffc93a, 0xfff08a, 0xffe070];
    parts.forEach((g, i) => {
      const c = new THREE.Color(colors[i]), a = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < a.length; k += 3) a.set([c.r, c.g, c.b], k);
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    });
    coinGeo = mergeGeometries(parts);
    coinMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.28, emissive: 0x8a5a00, emissiveIntensity: 0.55 });
  }
  const m = new THREE.Mesh(coinGeo, coinMat);
  return m;
}

let ringGeo = null, ringMat = null;
export function makeRing() {
  if (!ringGeo) {
    ringGeo = new THREE.TorusGeometry(0.62, 0.085, 10, 40);
    ringMat = new THREE.MeshStandardMaterial({ color: 0xffc53a, metalness: 0.6, roughness: 0.25, emissive: 0xff9a10, emissiveIntensity: 0.75 });
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ringGeo, ringMat));
  const glow = new THREE.Sprite(glowMaterial(0xffc040, 0.55));
  glow.scale.set(2.2, 2.2, 1);
  g.add(glow);
  return g;
}

const gemGeoCache = {};
export function gemGeometry(sides = 6, h = 1, r = 0.42) {
  const k = sides + ":" + h + ":" + r;
  if (gemGeoCache[k]) return gemGeoCache[k];
  const pos = [];
  const top = [0, h * 0.62, 0], bot = [0, -h * 0.38, 0];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    const p0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r], p1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
    pos.push(...top, ...p1, ...p0, ...bot, ...p0, ...p1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return (gemGeoCache[k] = g);
}

export const GEM_COLORS = { purple: 0xb14dff, blue: 0x3a9bff, pink: 0xff4fd8 };
export function makeGem(color = "purple", scale = 0.5) {
  const g = new THREE.Group();
  const c = GEM_COLORS[color] || color;
  const m = new THREE.Mesh(gemGeometry(6, 1, 0.42), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55,
    metalness: 0.1, roughness: 0.15, flatShading: true, transparent: true, opacity: 0.95 }));
  g.add(m);
  const glow = new THREE.Sprite(glowMaterial(c, 0.7));
  glow.scale.set(2.2, 2.2, 1);
  g.add(glow);
  g.scale.setScalar(scale);
  return g;
}
