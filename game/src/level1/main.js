// Rainbow Cascades - Level 1 (3D). Boots the renderer, the world, the course, the boy and the HUD,
// and runs the game loop. window.RCLevel1 exposes a small API for the automated tests.
import * as THREE from "three";
import { buildCourse, SECTIONS } from "./course.js";
import { Level } from "./level.js";
import { World } from "./world.js";
import { Boy } from "./boy.js";
import { Game } from "./game.js";
import { FollowCam, CAM } from "./camera.js";
import { attachSwipes } from "./input.js";
import { Hud } from "./hud.js";
import { Fx } from "./fx.js";
import { Sfx } from "./audio.js";
import { CloudMonster, LaserOrb } from "./hazards.js";
import { updateShared } from "./materials.js";

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---- renderer --------------------------------------------------------------------------------
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: q.has("test") });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const maxPr = q.has("pr") ? +q.get("pr") : 2;
let pr = Math.min(window.devicePixelRatio || 1, maxPr);
renderer.setPixelRatio(pr);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAM.fov, 1, 0.1, 2400);
const hemi = new THREE.HemisphereLight(0xe2e8ff, 0xcaa6e6, 0.75);
const sun = new THREE.DirectionalLight(0xfff1de, 1.55);
sun.position.set(-0.35, 0.85, -0.4).multiplyScalar(100);
const rim = new THREE.DirectionalLight(0xeadcff, 0.9);
rim.position.set(0.25, 0.45, 1).multiplyScalar(100);
scene.add(hemi, sun, rim);

// soft sky reflections for the gold, gems and the boy (a painted gradient, no files)
{
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, "#3d72e0"); grd.addColorStop(0.38, "#9dbbff"); grd.addColorStop(0.5, "#fbe6ff");
  grd.addColorStop(0.62, "#f4e8ff"); grd.addColorStop(1, "#b89be0");
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  g.fillStyle = "rgba(255,244,220,0.95)";
  g.beginPath(); g.arc(90, 30, 12, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(t).texture;
  scene.environmentIntensity = 0.7;
  t.dispose();
  pm.dispose();
}

// ---- level -----------------------------------------------------------------------------------
const course = buildCourse();
const world = new World(scene, course);
const level = new Level(scene, course);
const boy = new Boy();
boy.m.meshes.forEach((m) => { m.frustumCulled = false; });
scene.add(boy.root);
const fx = new Fx(scene, $("fxLayer"));
const sfx = new Sfx();
if (q.has("mute") || q.has("test")) sfx.on = false;
let paused = false;
const profile = window.RCProfile ? window.RCProfile.load() : { coins: 0, gems: 0, levels: {} };

const hud = new Hud({
  pause: () => setPaused(true),
  resume: () => setPaused(false),
  restart: () => location.reload(),
  home: () => { location.href = "index.html"; },
  retry: () => game.retry(),
  next: () => { hud.toast("Level 2 is coming soon!"); setTimeout(() => { location.href = "index.html"; }, 1600); },
});
const game = new Game({ course, level, boy, hud, fx, audio: sfx });
game.cloud = new CloudMonster(scene, level.props.cloudRail);
game.orb = new LaserOrb(scene, level.props.orbPos, course.tiles.filter((t) => t.fake));
const cam = new FollowCam(camera);

attachSwipes($("screen"), (dir) => {
  sfx.unlock();
  if (paused || game.state !== "play") return;
  if (dir !== "down") game.swipe(dir);
});

function setPaused(on) {
  if (game.state === "done") return;
  paused = on;
  hud.showPause(on);
}
document.addEventListener("visibilitychange", () => { if (document.hidden && game.state === "play") setPaused(true); });

// ---- layout ----------------------------------------------------------------------------------
function readSafeArea() {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const s = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  if (window.__RC_SAFE_AREA) Object.assign(s, window.__RC_SAFE_AREA);
  if (q.has("safeTop")) s.top = +q.get("safeTop");
  if (q.has("safeBottom")) s.bottom = +q.get("safeBottom");
  return s;
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep the reference framing on wider screens (tablets): don't let the view get much wider
  camera.fov = w / h > 0.62 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAM.fov) / 2) * (0.62 / (w / h)) ** 0.5)) : CAM.fov;
  camera.updateProjectionMatrix();
  const safe = readSafeArea();
  const u = Math.min(w / 412, (h - safe.top - safe.bottom) / 860);
  const root = document.documentElement.style;
  root.setProperty("--u", u + "px");
  root.setProperty("--safe-top", safe.top + "px");
  root.setProperty("--safe-bottom", safe.bottom + "px");
  const ink = boy.m.inkMat;
  if (ink) { ink.uniforms.uRes.value.set(w * pr, h * pr); ink.uniforms.uWidth.value = 1.25 * pr; }
}
window.addEventListener("resize", resize);
resize();

// ---- loop ------------------------------------------------------------------------------------
let timeScale = q.has("speed") ? +q.get("speed") : 1;
let manual = q.has("manual");            // tests step the game themselves
let last = performance.now();
const fpsWin = [];

function cameraInputs() {
  const p = game.p;
  const f = {};
  if ((p.mode === "run" || p.mode === "lead" || p.mode === "finish") && p.rail) {
    p.rail.frame(Math.max(0, Math.min(p.s, p.rail.length)), f);
    return { heading: f.yaw, center: f.p, ground: f.p.y };
  }
  const t = p.mode === "hop" || p.mode === "bounce" ? p.hop.target : p.tile;
  if (t) return { heading: t.yaw, center: t.kind === "island" ? t.base : t.center.clone().add(t.pos).sub(t.base), ground: t.kind === "island" ? t.base.y : t.pos.y };
  const lt = p.lastSafe || course.start;
  return { heading: lt.yaw, center: lt.center, ground: lt.base.y };
}

function step(dt) {
  if (!paused) {
    game.update(dt);
    fx.update(dt);
  }
  const ci = cameraInputs();
  cam.update(dt, { boy: game.p.pos, ground: ci.ground, heading: ci.heading, center: ci.center, falling: game.p.mode === "fall" });
  updateShared(camera, game.time);
  world.update(dt, camera, game.section === 3 ? 1 : 0, pr * window.innerHeight / 900, cam.yaw);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!manual) step(dt * timeScale);
  renderer.render(scene, camera);
  // adaptive resolution: if the phone can't keep up, render fewer pixels
  fpsWin.push(dt);
  if (fpsWin.length > 90) {
    const avg = fpsWin.reduce((a, b) => a + b, 0) / fpsWin.length;
    fpsWin.length = 0;
    if (avg > 1 / 42 && pr > 1) { pr = Math.max(1, pr - 0.25); resize(); }
  }
}

// ---- completion: save rewards to the wallet -----------------------------------------------------
const _complete = game._complete.bind(game);
game._complete = function () {
  _complete();
  const r = game.result;
  profile.coins = (profile.coins || 0) + r.coins + r.perfect;
  profile.gems = (profile.gems || 0) + r.gems * 5;
  profile.tokens = (profile.tokens || 0) + r.tokens * 5;
  const prev = (profile.levels || (profile.levels = {}))["1"] || {};
  profile.levels["1"] = { stars: Math.max(r.stars, prev.stars || 0), bestMs: Math.round(r.time * 1000), secret: !!(prev.secret || r.secret) };
  if (window.RCProfile) window.RCProfile.save(profile);
};

// ---- start once textures and fonts are in ---------------------------------------------------------
function ready() {
  resize();
  step(0.001);
  cam.snap();
  step(0.016);
  $("loading").classList.add("gone");
  document.body.dataset.ready = "1";
}
let loaded = false;
THREE.DefaultLoadingManager.onLoad = () => { if (!loaded) { loaded = true; Promise.resolve(document.fonts && document.fonts.ready).then(ready); } };
setTimeout(() => { if (!loaded) { loaded = true; ready(); } }, 6000);
requestAnimationFrame(frame);

// ---- test API ---------------------------------------------------------------------------------------
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
window.RCLevel1 = {
  THREE, game, boy, course, level, camera, renderer, scene, cam, SECTIONS,
  state() {
    const p = game.p;
    return { mode: p.mode, state: game.state, section: game.section, hearts: game.hearts, coins: game.coins, gems: game.gems,
      tokens: game.tokens, seqStep: game.seqStep, tile: p.tile ? p.tile.id : null, rail: p.rail ? course.rails.indexOf(p.rail) : null,
      s: p.s, lane: p.lane, x: p.x, yaw: p.yaw, pos: p.pos.toArray(), boyMode: boy.mode, elapsed: game.elapsed,
      heartsLost: game.heartsLost, wrong: game.wrong, secret: game.secret, route: game.route, result: game.result || null };
  },
  swipe(dir) { game.swipe(dir); },
  setManual(on) { manual = on; last = performance.now(); },
  step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) step(dt); renderer.render(scene, camera); },
  setSpeed(k) { timeScale = k; },
  events(since = 0) { return game.events.filter((e) => e.t >= since).map((e) => ({ t: e.t, type: e.type, data: e.data })); },
  tiles() {
    return course.tiles.map((t) => ({ id: t.id, kind: t.kind, color: t.color, section: t.section, seq: t.seq, correct: t.correct, fake: t.fake,
      route: t.route || null, secret: !!t.secret, motion: t.motion ? t.motion.type : null, pos: t.pos.toArray(), yaw: t.yaw,
      links: Object.fromEntries(Object.entries(t.links).map(([k, v]) => [k, v.rail ? "rail" + course.rails.indexOf(v.rail) : v.tile.id])) }));
  },
  solid(id) { return level.solidNow(course.tiles[id]); },
  goto(section) {
    const t = course.tiles.find((x) => x.kind === "island" && x.section === section);
    game.p.checkpoint = t; game.p.lastSafe = t;
    game._placeOn(t);
    cam.snap();
  },
  /** How well the boy's body lines up with the way he is moving (for tests). */
  alignment() {
    const M = boy.m;
    boy.root.updateMatrixWorld(true);
    const yaw = boy.root.rotation.y;
    const fwd = _a.set(Math.sin(yaw), 0, Math.cos(yaw));
    const parts = {};
    const yawOf = (obj, axis = new THREE.Vector3(0, 0, 1)) => {
      const v = axis.clone().transformDirection(obj.matrixWorld);
      return Math.atan2(v.x, v.z);
    };
    const d = (a) => Math.round(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw))));
    parts.pelvis = d(yawOf(M.pelvis));
    parts.chest = d(yawOf(M.chest));
    parts.head = d(yawOf(M.head));
    parts.kneeL = d(yawOf(M.shin[0])); parts.kneeR = d(yawOf(M.shin[1]));
    parts.footL = d(yawOf(M.foot[0])); parts.footR = d(yawOf(M.foot[1]));
    // knees must bend forward: the knee sits in front of the hip-ankle line
    const bend = (i) => {
      const hip = new THREE.Vector3().setFromMatrixPosition(M.thigh[i].matrixWorld);
      const knee = new THREE.Vector3().setFromMatrixPosition(M.shin[i].matrixWorld);
      const ankle = new THREE.Vector3().setFromMatrixPosition(M.foot[i].matrixWorld);
      const mid = hip.clone().lerp(ankle, 0.5);
      return +(knee.sub(mid).dot(fwd)).toFixed(3);
    };
    const soles = [0, 1].map((i) => +boy.soleWorld(i, _b).y.toFixed(3));
    return { yaw: +THREE.MathUtils.radToDeg(yaw).toFixed(1), parts, kneeForward: [bend(0), bend(1)], soleY: soles,
      rootY: +boy.root.position.y.toFixed(3), mode: boy.mode, planted: boy.feet.map((f) => f.planted) };
  },
};
