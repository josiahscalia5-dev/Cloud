// Shaders for the world: jelly / stone blocks, rainbow roads, light falls, waterfalls, sky and
// clouds. They share a few uniforms (time, sun direction) that main.js updates once per frame.
import * as THREE from "three";
import { symbolTexture, crackTexture, lightfallTexture, glowTexture } from "./textures.js";

export const shared = {
  uTime: { value: 0 },
  uSunView: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },   // sun direction in view space
};
const SUN_WORLD = new THREE.Vector3(-0.35, 0.85, -0.4).normalize();      // from behind the camera, high
export function updateShared(camera, t) {
  shared.uTime.value = t;
  shared.uSunView.value.copy(SUN_WORLD).transformDirection(camera.matrixWorldInverse);
}

const NOISE = /* glsl */`
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

const HSV = /* glsl */`
  vec3 hsv2rgb(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
`;

// ---------------------------------------------------------------------------------------------
// Blocks

const symbolCache = {};
function symbol(kind) { return symbolCache[kind] || (symbolCache[kind] = symbolTexture(kind)); }
let crackTex = null;

export const PALETTE = {
  red: { color: 0xff2e4c, light: 0xff9fb0, deep: 0xa80c2a, symbol: "flower" },
  yellow: { color: 0xffc01c, light: 0xfff29a, deep: 0xd46a00, symbol: "circle" },
  blue: { color: 0x1f8dff, light: 0x9fd8ff, deep: 0x0a3fbd, symbol: "triangle" },
  green: { color: 0x2fdc4c, light: 0xb4ffa4, deep: 0x0b8a2c, symbol: "club" },
  purple: { color: 0xa24dff, light: 0xdcb8ff, deep: 0x5a16b8, symbol: "star4" },
  pink: { color: 0xff48cc, light: 0xffb6ee, deep: 0xb4128e, symbol: "heart" },
  white: { color: 0xe9dcff, light: 0xffffff, deep: 0xa58ee0, symbol: "star4" },
  stone: { color: 0x5a4a72, light: 0xb9a0dc, deep: 0x21182f, symbol: "star4", symbolColor: 0xff86e6, edge: 0xffc862, stone: true },
  gold: { color: 0xffbe2e, light: 0xfff0a0, deep: 0xc2700a, symbol: "arrow" },
  ice: { color: 0x58c6ff, light: 0xd8f6ff, deep: 0x1c62d6, symbol: "arrow" },
  spring: { color: 0x39e0c8, light: 0xc0fff4, deep: 0x0c8f86, symbol: "arrow" },
};

export function jellyMaterial(paletteKey, size, opts = {}) {
  const P = PALETTE[paletteKey];
  if (!crackTex) crackTex = crackTexture();
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime, uSunView: shared.uSunView,
      uColor: { value: new THREE.Color(P.color) }, uLight: { value: new THREE.Color(P.light) }, uDeep: { value: new THREE.Color(P.deep) },
      uSymbolColor: { value: new THREE.Color(P.symbolColor || 0xffffff) }, uEdge: { value: new THREE.Color(P.edge || 0xffffff) },
      uSize: { value: new THREE.Vector3(size.w, size.h, size.d) },
      uSymbol: { value: symbol(opts.symbol || P.symbol) }, uSymbolOn: { value: opts.symbolOn === false ? 0 : 1 },
      uAllFaces: { value: opts.allFaces ? 1 : 0 },
      uCrack: { value: crackTex }, uCrackOn: { value: 0 },
      uStone: { value: P.stone ? 1 : 0 },
      uGlow: { value: 0 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(0xff2040) },
      uOpacity: { value: 1 }, uSeed: { value: Math.random() * 50 },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 },
    },
    fog: true,
    vertexShader: /* glsl */`
      varying vec3 vObj; varying vec3 vObjN; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_vertex>
      void main() {
        vObj = position; vObjN = normal;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uLight, uDeep, uSymbolColor, uEdge, uSize, uFlashColor, uSunView;
      uniform sampler2D uSymbol, uCrack;
      uniform float uSymbolOn, uAllFaces, uCrackOn, uStone, uGlow, uFlash, uOpacity, uSeed, uTime;
      varying vec3 vObj; varying vec3 vObjN; varying vec3 vN; varying vec3 vV;
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        vec3 n = normalize(vObjN), an = abs(n);
        vec2 fc; float isTop = 0.0; float face = 0.0;
        if (an.y >= an.x && an.y >= an.z) { fc = vObj.xz / uSize.xz; isTop = step(0.0, n.y); face = 1.0 + isTop; }
        else if (an.x >= an.z) { fc = vec2(vObj.z / uSize.z, vObj.y / uSize.y); face = 3.0 + step(0.0, n.x); }
        else { fc = vec2(vObj.x / uSize.x, vObj.y / uSize.y); face = 5.0 + step(0.0, n.z); }
        float hy = clamp(vObj.y / uSize.y + 0.5, 0.0, 1.0);
        float topness = smoothstep(0.55, 0.92, n.y);
        float sideF = 1.0 - topness;
        // sides: deep at the bottom, rich colour above, a band of light under the top edge
        vec3 col = mix(uDeep, uColor, smoothstep(0.0, 0.62, hy));
        col += uLight * 0.3 * smoothstep(0.55, 1.0, hy) * (1.0 - uStone * 0.7);
        // top: pastel and glossy, lighter toward the far edge
        vec3 topCol = mix(uColor, uLight, 0.48 + 0.18 * fc.y);
        col = mix(col, topCol, topness);
        // glow from inside, strongest in the middle of each face
        float cen = 1.0 - clamp(length(fc) * 1.5, 0.0, 1.0);
        col += uLight * (0.24 + 0.1 * topness) * cen * (1.0 - 0.6 * uStone);
        // light streaking down the sides (jelly only)
        float sx = fc.x * 10.0 + uSeed;
        float streak = pow(max(0.0, sin(sx * 1.3 + sin(sx * 0.73 + uTime * 0.6) * 1.8)), 12.0);
        col += vec3(1.0) * streak * sideF * (0.2 + 0.45 * (1.0 - hy)) * (1.0 - uStone);
        // stone: mottled rock
        if (uStone > 0.5) {
          float r = fbm(fc * 5.0 + face * 7.0);
          col *= 0.72 + 0.5 * r;
        }
        // symbol (top face, or every face on the rolling cubes)
        float sm = 0.0;
        if (isTop > 0.5 || uAllFaces > 0.5) sm = texture2D(uSymbol, fc * 1.18 + 0.5).a;
        col = mix(col, uSymbolColor, sm * uSymbolOn * 0.94);
        // cracks on fake blocks
        if (uCrackOn > 0.0) {
          float cr = texture2D(uCrack, fc * 0.9 + 0.5 + face * 0.13).a;
          col = mix(col, vec3(1.0, 0.55, 0.95), cr * uCrackOn);
        }
        // glossy rounded edges, brightest along the top rim
        float edge = 1.0 - max(an.x, max(an.y, an.z));
        float rimTop = step(0.0, n.y) * smoothstep(0.3, 0.9, hy);
        col = mix(col, uEdge, smoothstep(0.03, 0.18, edge) * (0.45 + 0.4 * rimTop + 0.15 * uStone));
        // light
        vec3 N = normalize(vN), V = normalize(vV), L = normalize(uSunView);
        col *= 0.8 + 0.26 * max(dot(N, L), 0.0);
        float fr = pow(1.0 - max(dot(N, V), 0.0), 2.4);
        col += (uLight * 0.3 + 0.1) * fr;
        vec3 H = normalize(V + L);
        col += pow(max(dot(N, H), 0.0), 60.0) * 0.6 * (0.4 + 0.6 * topness);
        // twinkles
        vec2 g = fc * 6.0 + face * 3.1;
        vec2 id = floor(g), f = fract(g) - 0.5;
        float h = hash12(id + uSeed);
        if (h > 0.82) {
          float tw = pow(0.5 + 0.5 * sin(uTime * (2.0 + 3.0 * h) + h * 40.0), 10.0);
          float d = length(f - (vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5) * 0.5);
          col += vec3(1.0) * smoothstep(0.1, 0.0, d) * tw * 1.4;
        }
        col += uLight * uGlow * 0.55;
        col = mix(col, uFlashColor, uFlash);
        gl_FragColor = vec4(col, uOpacity);
        #include <fog_fragment>
      }`,
  });
  m.transparent = !!opts.transparent;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Roads: rainbow (0), ice (1), gold (2). Geometry uv: x across (0..1), y = metres along.

export function roadMaterial(mode = 0, lanes = 3) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSunView: shared.uSunView, uMode: { value: mode }, uLanes: { value: lanes },
      uOpacity: { value: 1 },
      fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
    fog: true,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vSide;
      attribute float side;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vSide = side;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uMode, uLanes, uOpacity; uniform vec3 uSunView;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vSide;
      #include <fog_pars_fragment>
      ${NOISE}
      ${HSV}
      vec3 bands(float t) {
        float x = clamp(t, 0.0, 0.9999) * 7.0;
        float i = floor(x), f = fract(x);
        float h0 = i / 7.0 * 0.86, h1 = (i + 1.0) / 7.0 * 0.86;
        float h = mix(h0, h1, smoothstep(0.3, 0.7, f));
        return hsv2rgb(vec3(h, 0.78, 1.0));
      }
      void main() {
        float u = vUv.x, v = vUv.y;
        vec3 col;
        if (uMode < 0.5) col = bands(u);
        else if (uMode < 1.5) col = mix(vec3(0.38, 0.78, 1.0), vec3(0.8, 0.96, 1.0), 0.35 + 0.35 * fbm(vec2(u * 4.0, v * 0.5)));
        else col = mix(vec3(1.0, 0.68, 0.12), vec3(1.0, 0.9, 0.45), 0.3 + 0.5 * fbm(vec2(u * 5.0, v * 0.6)));
        // glassy blocks: faint joins every 2.4 m and between lanes
        float join = smoothstep(0.03, 0.0, abs(fract(v / 2.4) - 0.5) - 0.47);
        float laneJ = uLanes > 1.5 ? smoothstep(0.012, 0.0, abs(fract(u * uLanes) - 0.5) - 0.488) : 0.0;
        col = mix(col, vec3(1.0), (join + laneJ) * 0.35);
        // flowing gloss streaks along the road
        float fl = pow(0.5 + 0.5 * sin(v * 0.9 - uTime * 3.0 + sin(u * 9.0) * 1.2), 10.0);
        float fl2 = pow(0.5 + 0.5 * sin(v * 0.37 + uTime * 1.3 + u * 20.0), 18.0);
        col += vec3(1.0) * (fl * 0.28 + fl2 * 0.35);
        // bright edges
        float e = smoothstep(0.42, 0.5, abs(u - 0.5));
        col = mix(col, vec3(1.0), e * 0.75);
        // sides of the road (vSide = 1): deeper, glowing downward
        if (vSide > 0.5) col = col * 0.72 + vec3(0.25, 0.2, 0.35);
        // light and gloss
        vec3 N = normalize(vN), V = normalize(vV), L = normalize(uSunView);
        col *= 0.82 + 0.22 * max(dot(N, L), 0.0);
        float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        col += fr * 0.28;
        // twinkles
        vec2 g = vec2(u * 8.0, v * 1.4);
        vec2 id = floor(g), f = fract(g) - 0.5;
        float h = hash12(id);
        if (h > 0.86) { float tw = pow(0.5 + 0.5 * sin(uTime * (2.5 + 3.0 * h) + h * 30.0), 10.0); col += smoothstep(0.12, 0.0, length(f)) * tw * 1.5; }
        gl_FragColor = vec4(col, uOpacity);
        #include <fog_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------------------------
// Light streaming down from blocks and roads into the clouds (additive, faces the camera around Y).

let lfTex = null;
export function lightfallMaterial(color) {
  if (!lfTex) lfTex = lightfallTexture();
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uMap: { value: lfTex }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.42 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // cylindrical billboard: keep the quad upright but turned toward the camera
        vec3 c = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam);
        vec3 right = vec3(toCam.z, 0.0, -toCam.x);
        float sx = length(modelMatrix[0].xyz), sy = length(modelMatrix[1].xyz);
        vec3 wp = c + right * position.x * sx + vec3(0.0, position.y * sy, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uTime, uOpacity;
      varying vec2 vUv;
      void main() {
        float a = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y + uTime * 0.12)).a;
        float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
        gl_FragColor = vec4(uColor * a * fade * uOpacity, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------------------------------------
// Rainbow waterfall: bands across, flowing down, foam at the lip and mist at the bottom.

export function waterfallMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, fogColor: { value: new THREE.Color() }, fogNear: { value: 1 }, fogFar: { value: 1000 } },
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec2 vUv;
      #include <fog_pars_fragment>
      ${NOISE}
      ${HSV}
      void main() {
        float u = vUv.x, v = vUv.y;               // v = 1 at the top
        float x = u * 7.0; float i = floor(x);
        vec3 col = hsv2rgb(vec3(mix(i, i + 1.0, smoothstep(0.3, 0.7, fract(x))) / 7.0 * 0.86, 0.62, 1.0));
        float flow = fbm(vec2(u * 18.0, v * 3.0 + uTime * 1.6));
        col = mix(col, vec3(1.0), smoothstep(0.55, 0.85, flow) * 0.7);
        col += pow(0.5 + 0.5 * sin(u * 60.0 + flow * 6.0), 8.0) * 0.25;
        float a = smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.94, u);
        a *= smoothstep(0.0, 0.35, v);            // dissolves into mist near the bottom
        col = mix(col, vec3(1.0), smoothstep(0.93, 1.0, v) * 0.8);
        gl_FragColor = vec4(col, a * 0.92);
        #include <fog_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------------------------
// Sky dome (follows the camera) with soft clouds near the horizon. Colours blend between a
// bright day and the dark zone of the fake-platform section.

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: shared.uTime,
      uTop: { value: new THREE.Color(0x2f67dc) }, uMid: { value: new THREE.Color(0x7fa7f6) },
      uHorizon: { value: new THREE.Color(0xf6dcff) }, uBelow: { value: new THREE.Color(0xeee0ff) },
      uCloud: { value: new THREE.Color(0xffffff) }, uCloudShade: { value: new THREE.Color(0xc9b6f2) },
      uDark: { value: 0 },
    },
    side: THREE.BackSide, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uMid, uHorizon, uBelow, uCloud, uCloudShade; uniform float uTime, uDark;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = y > 0.0 ? mix(uHorizon, uMid, smoothstep(0.0, 0.28, y)) : mix(uHorizon, uBelow, smoothstep(0.0, -0.2, y));
        col = mix(col, uTop, smoothstep(0.25, 0.85, y));
        // soft cloud banks around and above the horizon
        vec2 p = vec2(atan(d.x, d.z) * 3.0, y * 9.0);
        float c = fbm(p * vec2(1.0, 1.4) + vec2(uTime * 0.004, 0.0));
        float band = smoothstep(-0.1, 0.06, y) * (1.0 - smoothstep(0.1, 0.45, y));
        float cl = smoothstep(0.48, 0.72, c) * band;
        vec3 cc = mix(uCloudShade, uCloud, smoothstep(0.45, 0.8, fbm(p * 2.0 + 3.0)));
        col = mix(col, cc, cl * 0.85);
        // high wisps
        float w = smoothstep(0.62, 0.82, fbm(vec2(atan(d.x, d.z) * 5.0, y * 5.0) + 11.0)) * smoothstep(0.2, 0.5, y);
        col = mix(col, uCloud, w * 0.35 * (1.0 - uDark));
        // sparkles in the sky
        vec2 g = vec2(atan(d.x, d.z) * 60.0, y * 60.0);
        vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        float h = hash12(id);
        if (h > 0.985 && y > 0.05) col += smoothstep(0.2, 0.0, length(f)) * pow(0.5 + 0.5 * sin(uTime * 2.0 + h * 90.0), 6.0) * (0.5 + uDark);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Additive glow sprite material (coins, gems, gate, orbs). */
let glowTex = null;
export function glowMaterial(color, opacity = 1) {
  if (!glowTex) glowTex = glowTexture();
  return new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}
export function getGlowTexture() { if (!glowTex) glowTex = glowTexture(); return glowTex; }
