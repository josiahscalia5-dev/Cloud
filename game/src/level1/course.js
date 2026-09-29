// Level 1: one continuous course through the floating rainbow world, in the order of the
// reference sheet:
//
//   1 Follow the Color Sequence    hop onto the colours in order (red, yellow, blue, green, purple, pink, red)
//   2 Platforms Rotate             rolling cubes: jump while they are flat
//   3 Dodge the Cloud              run down a rainbow road while the cloud monster strikes the lanes
//   4 Watch for Fake Platforms     dark zone; one block of each pair is fake and crumbles
//   5 Take the Secret Rainbow Route   a hidden rainbow road curves away on the left
//   6 Moving Platforms             sliding, sinking and flipping blocks, a spring pad for a flip jump
//   7 Choose Your Path             safe ice road on the left, gold road with gaps and more rewards on the right
//   8 Reach the Rainbow Gate       wide rainbow road into the gate
//
// Each section starts on a grassy checkpoint island (where you restart after running out of hearts).
// The course is laid out with a "turtle": a position and a heading that walk forward, turn and rise.
// Heading yaw: 0 = +Z, increasing yaw turns LEFT. Lateral offsets are to the RIGHT (screen right).
import * as THREE from "three";

export const SECTIONS = [
  { key: "color", title: "Follow the Color Sequence!", say: ["Jump on the matching colors in order!"] },
  { key: "rotate", title: "Platforms Rotate!", say: ["Platforms Rotate!", "Time your jumps!"], icon: "icon_rotate" },
  { key: "cloud", title: "Dodge the Cloud!", say: ["Dodge the Cloud!", "It chases you!"], icon: "icon_warning" },
  { key: "fake", title: "Watch for Fake Platforms!", say: ["Watch for Fake Platforms!", "They disappear!"], icon: "icon_fake" },
  { key: "secret", title: "Take the Secret Rainbow Route!", say: ["Take the secret rainbow route!"] },
  { key: "move", title: "Moving Platforms!", say: ["Moving Platforms!", "Jump, slide and flip!"], icon: "icon_up" },
  { key: "path", title: "Choose Your Path!", say: ["Choose Your Path!", "Safer Route or Bigger Rewards?"], icon: "icon_left", icon2: "icon_right" },
  { key: "gate", title: "Reach the Rainbow Gate!", say: ["Reach the Rainbow Gate!", "Complete the level!"] },
];
export const SEQ = ["red", "yellow", "blue", "green", "purple", "pink", "red"];

export const BLOCK = { w: 1.9, h: 0.9, d: 1.9 };
export const CUBE = { w: 1.75, h: 1.75, d: 1.75 };
const ROW = 2.75, LANE = 2.3;

let nextId = 0;
export class Tile {
  constructor(o) {
    this.id = nextId++;
    Object.assign(this, {
      kind: "block", color: "white", size: BLOCK, section: 0, motion: null, fake: false, seq: -1,
      checkpoint: false, rail: null, radius: 0, links: {}, pickups: [],
    }, o);
    this.base = o.base.clone();       // top centre at rest
    this.pos = this.base.clone();     // live top centre (moving blocks)
    this.center = (o.center || o.base).clone();   // course centre line here (for the camera)
    this.solid = true;
    this.gone = false;
  }
  /** Where the boy stands on this tile: the top centre, or near the front of an island. */
  stand(out = new THREE.Vector3()) {
    if (this.kind !== "island") return out.copy(this.pos);
    const k = Math.max(0, this.radius - 0.75);
    return out.set(this.base.x + Math.sin(this.yaw) * k, this.base.y, this.base.z + Math.cos(this.yaw) * k);
  }
}

/** A road the boy runs along by himself. Lanes are across it, lane 0 in the middle. */
export class Rail {
  constructor(o) {
    Object.assign(this, { lanes: 1, laneW: 2.0, mode: 0, section: 0, gaps: [], speed: 4.6, strikes: false }, o);
    this.curve = new THREE.CatmullRomCurve3(o.points, false, "centripetal");
    this.length = this.curve.getLength();
    this.width = this.lanes * this.laneW + 0.4;
    this.exit = null;                 // tile he reaches at the end
    this.entry = null;                // tile the road starts from
  }
  frame(s, out = {}) {
    const u = THREE.MathUtils.clamp(s / this.length, 0, 1);
    out.p = this.curve.getPointAt(u, out.p || new THREE.Vector3());
    const t = this.curve.getTangentAt(u, out.t || new THREE.Vector3());
    out.t = t;
    out.yaw = Math.atan2(t.x, t.z);
    out.r = (out.r || new THREE.Vector3()).set(-Math.cos(out.yaw), 0, Math.sin(out.yaw));
    return out;
  }
  inGap(s) { return this.gaps.some(([a, b]) => s > a && s < b); }
  laneX(lane) { return lane * this.laneW; }
}

/** Freezes the turtle's current frame: returns (fwd, right, up) => world point. */
function frameOf(T) {
  const p = T.p.clone(), F = T.F, R = T.R;
  return (f = 0, r = 0, u = 0) => p.clone().addScaledVector(F, f).addScaledVector(R, r).add(new THREE.Vector3(0, u, 0));
}

class Turtle {
  constructor() { this.p = new THREE.Vector3(0, 0, 0); this.yaw = 0; }
  get F() { return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get R() { return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)); }
  at(fwd = 0, right = 0, up = 0) { return this.p.clone().addScaledVector(this.F, fwd).addScaledVector(this.R, right).add(new THREE.Vector3(0, up, 0)); }
  move(fwd, right = 0, up = 0) { this.p = this.at(fwd, right, up); return this; }
  turn(deg) { this.yaw += THREE.MathUtils.degToRad(deg); return this; }
}

/**
 * Builds the course data (no meshes). Returns { tiles, rails, pickups, props, start }.
 * pickups: { type: coin|gem|ring, pos, section, color? }
 * props: landmarks for the world: tower, cloud monster route, gate, laser orb, arrow signs.
 */
export function buildCourse() {
  nextId = 0;
  const T = new Turtle();
  const tiles = [], rails = [], pickups = [], props = [];
  let sec = 0;
  const tile = (o) => { const t = new Tile({ section: sec, yaw: T.yaw, ...o }); tiles.push(t); return t; };
  const block = (fwd, right, up, o = {}) => tile({ base: T.at(fwd, right, up), center: T.at(fwd, 0, up), ...o });
  const island = (o = {}) => tile({ kind: "island", base: T.p.clone(), checkpoint: true, color: "grass", ...o, radius: Math.min(o.radius || 2.1, 2.1) });
  const coin = (p, n = 1, step = null) => { for (let i = 0; i < n; i++) pickups.push({ type: "coin", pos: step ? p.clone().addScaledVector(step, i) : p.clone(), section: sec }); };
  const above = (t, h = 1.0) => t.base.clone().add(new THREE.Vector3(0, h, 0));

  // ---- 1 Follow the Color Sequence ----------------------------------------------------------
  const start = island({ radius: 1.9, start: true });
  props.push({ type: "sign", pos: T.at(1.2, -1.45, 0), yaw: T.yaw });
  const rows = [
    [[0, "red", 0]],
    [[0, "yellow", 1], [1, "green"]],
    [[-1, "blue", 2], [1, "purple"]],
    [[0, "green", 3], [-1, "red"]],
    [[1, "purple", 4], [-1, "yellow"]],
    [[0, "pink", 5], [1, "blue"]],
    [[0, "red", 6]],
  ];
  T.move(3.6, 0, 0.25);
  rows.forEach((row, i) => {
    if (i) T.move(ROW, 0, 0.48).turn(i % 2 ? -3 : 2);
    for (const [lane, color, seq] of row) {
      const t = block(0, lane * LANE, 0, { color, seq: seq === undefined ? -1 : seq, correct: seq !== undefined });
      if (seq !== undefined && i > 0) coin(above(t, 0.95));
    }
  });
  pickups.push({ type: "gem", color: "purple", pos: T.at(-6.5, 3.4, 1.6), section: sec, big: true });
  pickups.push({ type: "ring", pos: T.at(-3.5, 4.0, 2.2), section: sec, yaw: T.yaw + 0.9 });

  // ---- 2 Platforms Rotate ------------------------------------------------------------------
  sec = 1;
  T.move(4.4, 0, 0.3).turn(6);
  island({ radius: 2.3, falls: 2.4 });
  props.push({ type: "tower", pos: T.at(16, 17, -6), yaw: T.yaw });
  const cubeLanes = [0, 1, 0, -1, 0];
  const cubeCols = ["purple", "green", "yellow", "pink", "blue"];
  T.move(4.3, 0, 0.35);
  cubeLanes.forEach((lane, i) => {
    if (i) T.move(2.9, 0, 0.45).turn(i % 2 ? 3 : -2);
    const t = block(0, lane * LANE, 0, { kind: "cube", size: CUBE, color: cubeCols[i],
      motion: { type: "roll", period: 3.0 + (i % 3) * 0.25, flat: 2.05, phase: i * 0.37 } });
    if (i === 1 || i === 3) pickups.push({ type: "ring", pos: above(t, 1.7), section: sec, yaw: T.yaw });
    else coin(above(t, 1.0));
  });

  // ---- 3 Dodge the Cloud ----------------------------------------------------------------------
  sec = 2;
  T.move(4.4, 0, 0.3).turn(-4);
  const isl3 = island({ radius: 2.4 });
  {
    const pts = [];
    const t0 = new Turtle(); t0.p = T.p.clone(); t0.yaw = T.yaw;
    t0.move(2.2, 0, 0);
    pts.push(t0.p.clone());
    for (let i = 0; i < 12; i++) { t0.move(4.6, 0, 0.4).turn(i < 4 ? -3.5 : i < 9 ? 4.5 : -2); pts.push(t0.p.clone()); }
    const rail = new Rail({ points: pts, lanes: 3, laneW: 2.0, mode: 0, section: sec, strikes: true, speed: 4.5 });
    rail.entry = isl3;
    isl3.rail = rail;
    rails.push(rail);
    // coins in short lines, switching lanes
    const f = {};
    for (let s = 8, k = 0; s < rail.length - 6; s += 7.5, k++) {
      const lane = [0, -1, 1, 0, 1, -1][k % 6];
      for (let j = 0; j < 3; j++) { rail.frame(s + j * 1.3, f); pickups.push({ type: "coin", pos: f.p.clone().addScaledVector(f.r, lane * rail.laneW).add(new THREE.Vector3(0, 0.9, 0)), section: sec }); }
    }
    props.push({ type: "cloud", rail });
    T.p = t0.p.clone(); T.yaw = t0.yaw;
  }

  // ---- 4 Watch for Fake Platforms (dark zone) -------------------------------------------------
  sec = 3;
  T.move(2.8, 0, 0.0);
  const isl4 = island({ radius: 2.4, dark: true });
  rails[rails.length - 1].exit = isl4;
  T.move(4.1, 0, 0.2);
  const fakeSide = [1, -1, -1, 1, -1];
  for (let i = 0; i < 5; i++) {
    if (i) T.move(2.8, 0, 0.35).turn(i % 2 ? 4 : -4);
    for (const side of [-1, 1]) {
      const t = block(0, side * 1.25, 0, { kind: "cube", size: { w: 1.7, h: 1.7, d: 1.7 }, color: "stone", fake: side === fakeSide[i] });
      if (!t.fake && i % 2 === 0) coin(above(t, 1.0));
    }
  }
  props.push({ type: "orb", pos: T.at(-2, 7, 7.5) });
  pickups.push({ type: "gem", color: "pink", pos: T.at(-5.5, -3.8, 1.8), section: sec, big: true });

  // ---- 5 Take the Secret Rainbow Route ----------------------------------------------------------
  sec = 4;
  T.move(4.3, 0, 0.2).turn(3);
  island({ radius: 2.4, falls: 2.0 });
  T.move(4.1, 0, 0.15);
  const F5 = frameOf(T);                       // local frame at the first main block
  const main1 = block(0, 0, 0, { color: "white" });
  // the secret road starts on a rainbow pad on the left of the first block
  const padPos = F5(0.4, -2.6, 0.0);
  const pad = tile({ kind: "pad", base: padPos, center: F5(0.4, 0, 0), color: "rainbow", size: { w: 1.7, h: 0.3, d: 1.7 }, secret: true });
  const mains = [main1];
  for (let i = 0; i < 5; i++) { T.move(2.8, 0, 0.3); mains.push(block(0, 0, 0, { color: "white" })); }
  coin(above(mains[2], 0.95)); coin(above(mains[4], 0.95));
  T.move(4.3, 0, 0.2);
  const isl6 = island({ radius: 2.5, falls: -2.5 });
  {
    // out to the left in a wide arc and back in onto the left side of island 6
    const mainRise = isl6.base.y - main1.base.y;
    const way = [[0.4, -2.6], [3.6, -4.4], [7.0, -6.2], [10.5, -7.3], [13.8, -7.0], [16.4, -5.6], [18.0, -3.8], [18.6, -2.3]];
    const pts = way.map(([f, l], i) => F5(f, l, (mainRise * i) / (way.length - 1)));
    const rail = new Rail({ points: pts, lanes: 1, laneW: 1.8, mode: 0, section: sec, speed: 5.0, secret: true });
    rail.entry = pad; pad.rail = rail; rail.exit = isl6;
    rails.push(rail);
    const f = {};
    for (let s = 5; s < rail.length - 3; s += 3.2) {
      rail.frame(s, f);
      const k = Math.round(s / 3.2);
      if (k % 3 === 0) pickups.push({ type: "ring", pos: f.p.clone().add(new THREE.Vector3(0, 1.25, 0)), section: sec, yaw: f.yaw });
      else if (k % 3 === 1) pickups.push({ type: "gem", color: ["purple", "blue", "pink"][k % 3], pos: f.p.clone().add(new THREE.Vector3(0, 0.95, 0)), section: sec });
      else coin(f.p.clone().add(new THREE.Vector3(0, 0.9, 0)));
    }
  }

  // ---- 6 Moving Platforms ---------------------------------------------------------------------
  sec = 5;
  isl6.section = sec;
  T.turn(-2);
  const mv = [
    { color: "green", motion: { type: "slide", amp: 2.3, period: 3.6, phase: 0.0 } },
    { color: "blue", motion: { type: "sink", depth: 4.2, period: 4.2, phase: 0.3 } },
    { color: "purple", motion: { type: "slide", amp: 2.3, period: 3.4, phase: 0.5 } },
    { color: "spring", kind: "spring" },
    { color: "pink", motion: { type: "flip", period: 3.4, flat: 2.3, phase: 0.1 }, far: true },
    { color: "yellow", motion: { type: "slide", amp: 2.0, period: 3.2, phase: 0.25 } },
  ];
  T.move(4.4, 0, 0.2);
  mv.forEach((m, i) => {
    if (i) T.move(m.far ? 6.4 : 2.9, 0, m.far ? 0.8 : 0.4).turn(i % 2 ? 3 : -3);
    const t = block(0, 0, 0, { color: m.color, kind: m.kind || "block", motion: m.motion || null });
    if (i === 0 || i === 2 || i === 5) pickups.push({ type: "ring", pos: above(t, 1.7), section: sec, yaw: T.yaw });
    if (m.far) {
      // rings along the flip jump
      for (let k = 1; k <= 2; k++) pickups.push({ type: "ring", pos: T.at(-6.4 * k / 3, 0, 2.2 + 0.4 * (k % 2)), section: sec, yaw: T.yaw });
    }
  });
  pickups.push({ type: "gem", color: "blue", pos: T.at(-4, 4.2, 2.4), section: sec, big: true });

  // ---- 7 Choose Your Path ----------------------------------------------------------------------
  sec = 6;
  T.move(4.4, 0, 0.2);
  const isl7 = island({ radius: 2.5 });
  const forkYaw = T.yaw;
  const F7 = frameOf(T);
  const safe = block(3.6, -2.7, 0.15, { kind: "cube", color: "ice", size: { w: 2.0, h: 2.0, d: 2.0 }, route: "safe" });
  const gold = block(3.6, 2.7, 0.15, { kind: "cube", color: "gold", size: { w: 2.0, h: 2.0, d: 2.0 }, route: "gold" });
  props.push({ type: "arrowSign", pos: safe.base.clone(), color: "ice" }, { type: "arrowSign", pos: gold.base.clone(), color: "gold" });
  // the merge island ahead
  const tm = new Turtle(); tm.p = F7(28.8, 0, 1.2); tm.yaw = forkYaw;
  const routeRail = (from, side, mode, extra) => {
    // bows out to its side and curves back in to the back edge of the merge island
    const way = [[3.6, 2.7], [6.8, 4.3], [10.2, 5.5], [13.8, 5.9], [17.4, 5.4], [20.8, 4.0], [23.8, 2.3], [26.2, 1.0]];
    const y0 = from.base.y - F7(0, 0, 0).y, y1 = 1.2;
    const pts = way.map(([f, l], i) => F7(f, side * l, y0 + (y1 - y0) * (i / (way.length - 1))));
    const rail = new Rail({ points: pts, lanes: 1, laneW: 2.0, mode, section: sec, speed: 4.6, route: from.route, ...extra });
    rail.entry = from; from.rail = rail;
    rails.push(rail);
    return rail;
  };
  const safeRail = routeRail(safe, -1, 1, {});
  const goldRail = routeRail(gold, 1, 2, { gaps: [[9.5, 11.3], [19.5, 21.3]] });
  {
    const f = {};
    for (let s = 4; s < safeRail.length - 3; s += 5) { safeRail.frame(s, f); coin(f.p.clone().add(new THREE.Vector3(0, 0.9, 0))); }
    for (let s = 3; s < goldRail.length - 2; s += 1.6) {
      if (goldRail.inGap(s) || goldRail.inGap(s - 0.8) || goldRail.inGap(s + 0.8)) continue;
      goldRail.frame(s, f);
      coin(f.p.clone().add(new THREE.Vector3(0, 0.9, 0)));
    }
    for (const s of [10.4, 20.4]) { goldRail.frame(s, f); pickups.push({ type: "gem", color: "purple", pos: f.p.clone().add(new THREE.Vector3(0, 2.0, 0)), section: sec }); }
  }

  // ---- 8 Reach the Rainbow Gate ----------------------------------------------------------------
  sec = 7;
  T.p = tm.p.clone(); T.yaw = tm.yaw;
  const isl8 = island({ radius: 2.6, falls: 2.3 });
  safeRail.exit = isl8; goldRail.exit = isl8;
  {
    const t0 = new Turtle(); t0.p = T.p.clone(); t0.yaw = T.yaw;
    t0.move(2.4, 0, 0);
    const pts = [t0.p.clone()];
    for (let i = 0; i < 10; i++) { t0.move(4.8, 0, 0.3).turn(i < 3 ? 2 : i < 6 ? -2 : 0); pts.push(t0.p.clone()); }
    const rail = new Rail({ points: pts, lanes: 3, laneW: 2.1, mode: 0, section: sec, speed: 5.0, finish: true });
    rail.entry = isl8; isl8.rail = rail;
    rails.push(rail);
    const f = {};
    for (let s = 6, k = 0; s < rail.length - 8; s += 1.5, k++) {
      const lane = [0, 0, 0, 0, -1, -1, -1, -1, 1, 1, 1, 1][k % 12];
      rail.frame(s, f);
      coin(f.p.clone().addScaledVector(f.r, lane * rail.laneW).add(new THREE.Vector3(0, 0.9, 0)));
    }
    rail.frame(rail.length, f);
    props.push({ type: "gate", pos: f.p.clone(), yaw: f.yaw, rail });
  }

  linkTiles(tiles);
  return { tiles, rails, pickups, props, start };
}

/** Works out where a swipe takes you from each tile: up (ahead), left, right. */
function linkTiles(tiles) {
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), d = new THREE.Vector3();
  for (const a of tiles) {
    if (a.rail) { a.links.up = { rail: a.rail }; }
    fwd.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    right.set(-Math.cos(a.yaw), 0, Math.sin(a.yaw));
    let best = { up: null, left: null, right: null }, score = { up: 1e9, left: 1e9, right: 1e9 };
    for (const b of tiles) {
      if (b === a || b.start) continue;
      d.subVectors(b.base, a.base);
      const f = d.dot(fwd), l = d.dot(right), dy = d.y;
      const dist = Math.hypot(f, l);
      const reach = a.kind === "spring" ? 7.2 : a.kind === "island" || b.kind === "island" ? 5.2 : 4.4;
      if (dist > reach + (a.radius || 0) * 0.2 || dy > 1.6 || dy < -3) continue;
      if (f < -0.4) continue;
      if (Math.abs(l) < 1.0 && f > 0.8) { if (f < score.up) { score.up = f; best.up = b; } }
      else if (l < -0.9) { if (dist < score.left) { score.left = dist; best.left = b; } }
      else if (l > 0.9) { if (dist < score.right) { score.right = dist; best.right = b; } }
    }
    for (const k of ["up", "left", "right"]) if (!a.links[k] && best[k]) a.links[k] = { tile: best[k] };
    // the spring pad's up is the long flip jump
    if (a.kind === "spring" && a.links.up) a.links.up.flip = true;
  }
}
