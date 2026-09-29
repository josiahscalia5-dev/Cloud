// The world around the course: sky, a sea of clouds below, painted floating islands (cut from the
// reference art) all around at many distances so they drift past with real parallax, big
// crystals, rainbow waterfalls, sparkles in the air, and the dark zone of the fake-platform section.
import * as THREE from "three";
import { skyMaterial, shared } from "./materials.js";
import { mul, loadTexture, sparkleTexture } from "./textures.js";
import { gemGeometry, GEM_COLORS } from "./meshes.js";

const A = "assets/level1/3d/";
// painted islands: file, width / height, how high the art is in metres at scale 1
export const ISLAND_ART = [
  { f: "isl_castles", ar: 0.831, h: 13 },
  { f: "isl_castle_falls", ar: 0.631, h: 15 },
  { f: "isl_small_castle", ar: 0.77, h: 9 },
  { f: "isl_trees", ar: 0.746, h: 10 },
  { f: "isl_top_right", ar: 0.602, h: 9 },
  { f: "isl_p3_castle", ar: 0.812, h: 11 },
  { f: "isl_p9_left", ar: 0.697, h: 9 },
  { f: "isl_p8_left", ar: 0.82, h: 9 },
  { f: "isl_p6_right", ar: 0.571, h: 11 },
  { f: "isl_falls_cliff", ar: 1.066, h: 16, wide: true },
];

function cloudTexture(seed) {
  // soft cumulus: overlapping lit puffs, lavender underneath
  const W = 512, H = 256, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const rnd = mul(seed);
  const puffs = [];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const x = W * (0.14 + 0.72 * t + (rnd() - 0.5) * 0.08);
    const r = H * (0.17 + 0.22 * Math.sin(Math.PI * t) + rnd() * 0.06);
    const y = H * 0.72 - r * (0.55 + rnd() * 0.25);
    puffs.push([x, y, r]);
  }
  for (let i = 0; i < 6; i++) puffs.push([W * (0.3 + rnd() * 0.4), H * (0.3 + rnd() * 0.15), H * (0.16 + rnd() * 0.08)]);
  // shadow pass (lavender, offset down) then lit pass (white), both soft-edged
  g.filter = "blur(6px)";
  for (const [x, y, r] of puffs) {
    const grd = g.createRadialGradient(x, y + r * 0.2, r * 0.2, x, y + r * 0.1, r);
    grd.addColorStop(0, "rgba(214,198,246,0.95)");
    grd.addColorStop(0.7, "rgba(214,198,246,0.7)");
    grd.addColorStop(1, "rgba(214,198,246,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y + r * 0.1, r, 0, Math.PI * 2); g.fill();
  }
  for (const [x, y, r] of puffs) {
    const grd = g.createRadialGradient(x - r * 0.2, y - r * 0.3, r * 0.05, x, y - r * 0.1, r * 0.85);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.6, "rgba(255,253,255,0.85)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y - r * 0.1, r * 0.85, 0, Math.PI * 2); g.fill();
  }
  g.filter = "none";
  // flat-ish base fading out
  const base = g.createLinearGradient(0, H * 0.6, 0, H);
  base.addColorStop(0, "rgba(0,0,0,0)");
  base.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = base;
  g.fillRect(0, H * 0.6, W, H * 0.4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One draw call for hundreds of cloud billboards. */
function cloudField(items, tex) {
  const n = items.length;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(n * 3), sc = new Float32Array(n * 2), tint = new Float32Array(n * 2);
  items.forEach((it, i) => {
    off.set([it.p.x, it.p.y, it.p.z], i * 3);
    sc.set([it.w, it.h], i * 2);
    tint.set([it.shade, it.flip ? 1 : 0], i * 2);
  });
  geo.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute("aScale", new THREE.InstancedBufferAttribute(sc, 2));
  geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 2));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uTime: shared.uTime, uDark: { value: 0 },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
    transparent: true, depthWrite: false, fog: true,
    vertexShader: /* glsl */`
      attribute vec3 aOff; attribute vec2 aScale; attribute vec2 aTint;
      varying vec2 vUv; varying float vShade;
      uniform float uTime;
      #include <fog_pars_vertex>
      void main() {
        vUv = vec2(aTint.y > 0.5 ? 1.0 - uv.x : uv.x, uv.y); vShade = aTint.x;
        vec3 c = aOff + vec3(sin(uTime * 0.05 + aOff.z * 0.1) * 1.5, 0.0, 0.0);
        vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam);
        vec3 right = vec3(toCam.z, 0.0, -toCam.x);
        vec3 wp = c + right * position.x * aScale.x + vec3(0.0, position.y * aScale.y, 0.0);
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uDark;
      varying vec2 vUv; varying float vShade;
      #include <fog_pars_fragment>
      void main() {
        vec4 t = texture2D(uMap, vUv);
        vec3 col = t.rgb * vShade;
        col = mix(col, col * vec3(0.42, 0.3, 0.55) + vec3(0.18, 0.06, 0.02), uDark);
        gl_FragColor = vec4(col, t.a);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

/** Endless cloud floor: soft billows lit from above, lavender in the hollows. */
function seaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uDark: { value: 0 }, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
    fog: true, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vW;
      #include <fog_pars_vertex>
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDark; varying vec2 vW;
      #include <fog_pars_fragment>
      float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }
      void main() {
        vec2 p = vW * 0.03 + vec2(uTime * 0.01, 0.0);
        float c = fbm(p);
        float lit = fbm(p * 1.7 + 4.0);
        vec3 hollow = mix(vec3(0.8, 0.72, 0.95), vec3(0.3, 0.14, 0.3), uDark);
        vec3 top = mix(vec3(1.0, 0.99, 1.0), vec3(0.55, 0.36, 0.55), uDark);
        vec3 col = mix(hollow, top, smoothstep(0.35, 0.72, c) * (0.75 + 0.25 * lit));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}

export class World {
  constructor(scene, course) {
    this.scene = scene;
    this.course = course;
    this.dark = 0;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMaterial());
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);
    this.day = { fog: new THREE.Color(0xeedcff), hemiSky: new THREE.Color(0xdfe6ff), hemiGround: new THREE.Color(0xc8a8e8) };
    this.night = { fog: new THREE.Color(0x3a2250), hemiSky: new THREE.Color(0x9a86d8), hemiGround: new THREE.Color(0x7a3a4a) };
    scene.fog = new THREE.Fog(this.day.fog.clone(), 110, 760);
    this.samples = this._courseSamples();
    this.sprites = [];
    this._backdrop();
    this._islands();
    this._clouds();
    this._crystals();
    this._sparkles();
  }

  /** Points every few metres along the course (tiles and roads), with the section each is in. */
  _courseSamples() {
    const pts = [];
    for (const t of this.course.tiles) pts.push({ p: t.base.clone(), yaw: t.yaw, section: t.section });
    const f = {};
    for (const r of this.course.rails) for (let s = 0; s < r.length; s += 5) { r.frame(s, f); pts.push({ p: f.p.clone(), yaw: f.yaw, section: r.section }); }
    return pts;
  }

  _nearCourse(p, min) {
    for (const s of this.samples) if (Math.hypot(s.p.x - p.x, s.p.z - p.z) < min) return true;
    return false;
  }

  /** The painted far backdrop (the Level 1 art with the path cleared): always far ahead of the camera. */
  _backdrop() {
    const t = loadTexture("assets/level1/bg_level1.webp");
    t.repeat.set(1, 0.562);
    t.offset.set(0, 0.219);
    const H = 250, Wd = H * (1176 / 1540);
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, color: 0xffffff });
    // soften the card's edges into the sky
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
        vec2 e = min(vMapUv - vec2(0.0, 0.219), vec2(1.0, 0.781) - vMapUv);
        float fx = smoothstep(0.0, 0.16, min(vMapUv.x, 1.0 - vMapUv.x));
        float fy = smoothstep(0.0, 0.06, (vMapUv.y - 0.219) / 0.562) * smoothstep(0.0, 0.12, (0.781 - vMapUv.y) / 0.562);
        diffuseColor.a *= fx * fy;`);
    };
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(Wd, H), m);
    this.backdrop.renderOrder = -8;
    this.backdrop.frustumCulled = false;
    this.backdropH = H;
    this.scene.add(this.backdrop);
  }

  _islands() {
    const rnd = mul(2024);
    const tex = {};
    const mats = {};
    const matFor = (art, dark) => {
      const k = art.f + (dark ? "D" : "");
      if (mats[k]) return mats[k];
      if (!tex[art.f]) tex[art.f] = loadTexture(A + art.f + ".webp");
      // double-sided so a sprite can be mirrored with a negative scale
      const m = new THREE.SpriteMaterial({ map: tex[art.f], transparent: true, depthWrite: false, fog: true, alphaTest: 0.03,
        side: THREE.DoubleSide, color: dark ? new THREE.Color(0.5, 0.36, 0.62) : new THREE.Color(1, 1, 1) });
      return (mats[k] = m);
    };
    const place = (art, p, h, flip, dark) => {
      const sp = new THREE.Sprite(matFor(art, dark));
      sp.scale.set(h * art.ar * (flip ? -1 : 1), h, 1);
      sp.position.copy(p);
      sp.renderOrder = -5;
      this.scene.add(sp);
      this.sprites.push(sp);
      return sp;
    };
    // walk the main line of the course; islands on both sides at near, mid and far distances
    const main = this.samples.filter((_, i) => i % 2 === 0);
    for (let i = 0; i < main.length; i++) {
      const s = main[i];
      const dark = s.section === 3;
      const R = new THREE.Vector3(-Math.cos(s.yaw), 0, Math.sin(s.yaw)), F = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      for (const side of [-1, 1]) {
        const bands = [[11, 24, 0.75, 9, 15, -5, 7], [28, 60, 0.9, 15, 26, 0, 22], [70, 150, 0.45, 24, 42, 6, 40]];
        for (const [d0, d1, prob, h0, h1, y0, y1] of bands) {
          if (rnd() > prob) continue;
          const art = ISLAND_ART[Math.floor(rnd() * ISLAND_ART.length)];
          const d = d0 + rnd() * (d1 - d0);
          const h = (h0 + rnd() * (h1 - h0)) * (art.h / 11);
          const p = s.p.clone().addScaledVector(R, side * d).addScaledVector(F, (rnd() - 0.3) * 10);
          p.y += y0 + rnd() * (y1 - y0);
          if (this._nearCourse(p, 9 + h * art.ar * 0.5)) continue;
          place(art, p, h, rnd() < 0.5, dark);
        }
      }
    }
    // a ring of far islands ahead of the start so the view is full from the first frame
    const s0 = this.samples[0];
    for (let k = 0; k < 14; k++) {
      const a = s0.yaw + (k / 14 - 0.5) * 2.4;
      const d = 160 + rnd() * 180;
      const art = ISLAND_ART[Math.floor(rnd() * ISLAND_ART.length)];
      const h = (28 + rnd() * 26) * (art.h / 11);
      const p = s0.p.clone().add(new THREE.Vector3(Math.sin(a) * d, -10 + rnd() * 40, Math.cos(a) * d));
      if (!this._nearCourse(p, 20)) place(art, p, h, rnd() < 0.5, false);
    }
  }

  _clouds() {
    const rnd = mul(77);
    const items = [];
    const main = this.samples;
    for (let i = 0; i < main.length; i++) {
      const s = main[i];
      if (i % 2) continue;
      const R = new THREE.Vector3(-Math.cos(s.yaw), 0, Math.sin(s.yaw));
      // puffs under the course, peeking out around the blocks
      for (let k = 0; k < 3; k++) {
        const lat = (rnd() - 0.5) * 2 * (3 + rnd() * 16);
        const p = s.p.clone().addScaledVector(R, lat);
        p.y -= 9 + rnd() * 7;
        const w = 7 + rnd() * 8;
        items.push({ p, w, h: w * 0.5, shade: 0.94 + rnd() * 0.08, flip: rnd() < 0.5, key: i });
      }
      // banks further out on both sides
      for (const side of [-1, 1]) {
        if (rnd() < 0.35) continue;
        const d = 24 + rnd() * 70;
        const p = s.p.clone().addScaledVector(R, side * d);
        p.y -= 14 + rnd() * 10 + d * 0.08;
        const w = 16 + rnd() * 20 + d * 0.2;
        items.push({ p, w, h: w * 0.48, shade: 0.93 + rnd() * 0.07, flip: rnd() < 0.5, key: i });
      }
    }
    // far ones first: the course runs away from the camera
    items.sort((a, b) => b.key - a.key);
    this.clouds = cloudField(items, cloudTexture(5));
    this.clouds.renderOrder = -4;
    this.scene.add(this.clouds);
    // the sea of clouds far below, all the way to the horizon
    let minY = Infinity;
    for (const s of this.samples) minY = Math.min(minY, s.p.y);
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), seaMaterial());
    this.sea.position.y = minY - 24;
    this.sea.renderOrder = -6;
    this.scene.add(this.sea);
  }

  _crystals() {
    const rnd = mul(31);
    this.crystals = [];
    const cols = ["purple", "pink", "blue"];
    for (let i = 4; i < this.samples.length; i += 5) {
      const s = this.samples[i];
      const R = new THREE.Vector3(-Math.cos(s.yaw), 0, Math.sin(s.yaw));
      const side = rnd() < 0.5 ? -1 : 1;
      const p = s.p.clone().addScaledVector(R, side * (6 + rnd() * 10));
      p.y += 1.5 + rnd() * 5;
      if (this._nearCourse(p, 4.5)) continue;
      const c = GEM_COLORS[cols[i % 3]];
      const m = new THREE.Mesh(gemGeometry(6, 1, 0.4), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6,
        metalness: 0.1, roughness: 0.12, flatShading: true, transparent: true, opacity: 0.92 }));
      const sc = 0.9 + rnd() * 1.1;
      m.scale.set(sc, sc * 1.35, sc);
      m.position.copy(p);
      m.userData.base = p.y;
      m.userData.ph = rnd() * 6;
      this.scene.add(m);
      this.crystals.push(m);
    }
  }

  _sparkles() {
    const n = 260, pos = new Float32Array(n * 3), rnd = mul(9);
    for (let i = 0; i < n; i++) pos.set([rnd() * 70 - 35, rnd() * 30 - 10, rnd() * 70 - 35], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime, uMap: { value: sparkleTexture() }, uCam: { value: new THREE.Vector3() }, uScale: { value: 300 },
        uColor: { value: new THREE.Color(1, 0.95, 1) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        uniform vec3 uCam; uniform float uTime, uScale; varying float vA;
        void main() {
          vec3 box = vec3(70.0, 30.0, 70.0);
          vec3 p = position + vec3(0.0, sin(uTime * 0.4 + position.x) * 0.6, 0.0);
          p = uCam + mod(p - uCam + box * 0.5, box) - box * 0.5;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float tw = 0.5 + 0.5 * sin(uTime * (1.5 + fract(position.x * 7.1) * 3.0) + position.z);
          vA = tw * smoothstep(60.0, 20.0, -mv.z);
          gl_PointSize = uScale * (0.12 + 0.1 * fract(position.y * 3.3)) / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
        void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor * t.a * vA, 1.0); }`,
    });
    this.sparkles = new THREE.Points(geo, mat);
    this.sparkles.frustumCulled = false;
    this.scene.add(this.sparkles);
  }

  update(dt, camera, darkTarget, pixelScale, heading) {
    this.sky.position.copy(camera.position);
    if (this.backdrop) {
      const D = 330;
      const F = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      this.backdrop.position.copy(camera.position).addScaledVector(F, D);
      this.backdrop.position.y = camera.position.y - 0.02 * this.backdropH;
      this.backdrop.rotation.set(0, heading + Math.PI, 0);
      this.backdrop.material.color.setRGB(1, 1, 1).lerp(new THREE.Color(0.42, 0.28, 0.5), this.dark);
    }
    this.dark += (darkTarget - this.dark) * (1 - Math.exp(-dt * 1.6));
    const k = this.dark;
    const sm = this.sky.material.uniforms;
    sm.uDark.value = k;
    sm.uTop.value.setHex(0x2f67dc).lerp(new THREE.Color(0x120a2a), k);
    sm.uMid.value.setHex(0x7fa7f6).lerp(new THREE.Color(0x3a1e5c), k);
    sm.uHorizon.value.setHex(0xf6dcff).lerp(new THREE.Color(0xc2527a), k);
    sm.uBelow.value.setHex(0xeee0ff).lerp(new THREE.Color(0x5a2a4a), k);
    sm.uCloud.value.setHex(0xffffff).lerp(new THREE.Color(0x9a6aa8), k);
    sm.uCloudShade.value.setHex(0xc9b6f2).lerp(new THREE.Color(0x4a2a5a), k);
    this.scene.fog.color.copy(this.day.fog).lerp(this.night.fog, k);
    this.clouds.material.uniforms.uDark.value = k;
    this.sea.material.uniforms.uDark.value = k;
    this.sea.position.x = camera.position.x;
    this.sea.position.z = camera.position.z;
    this.sparkles.material.uniforms.uCam.value.copy(camera.position);
    this.sparkles.material.uniforms.uScale.value = 260 * pixelScale;
    const t = shared.uTime.value;
    for (const c of this.crystals) {
      c.rotation.y += dt * 0.5;
      c.position.y = c.userData.base + Math.sin(t * 0.8 + c.userData.ph) * 0.35;
    }
  }
}
