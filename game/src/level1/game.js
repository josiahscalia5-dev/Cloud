// Level 1 rules: how swipes move the boy, what happens where he lands, hearts, sections, rewards.
//
// Two ways of moving, both driven by the same three swipes:
//   on blocks   each swipe is one move to the next block: UP = the block ahead, LEFT / RIGHT = the
//               block on that side. He turns his whole body toward the block, crouches, jumps and
//               lands on it (running instead of jumping if there is no gap).
//   on roads    he runs by himself; LEFT / RIGHT change lane (he turns toward the lane he is moving
//               to), UP jumps (over gaps and strikes).
import * as THREE from "three";
import { SEQ, SECTIONS } from "./course.js";

const TAU = Math.PI * 2;
const angleWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _f = {};

export const COIN = 10;

export class Game {
  constructor({ course, level, boy, hud, fx, audio }) {
    this.course = course;
    this.level = level;
    this.boy = boy;
    this.hud = hud;
    this.fx = fx;
    this.audio = audio || { play() {} };
    this.time = 0;          // level clock (for moving platforms)
    this.elapsed = 0;       // play time shown in the HUD
    this.state = "play";    // play | over (out of hearts) | done
    this.hearts = 3;
    this.coins = 0; this.gems = 0; this.tokens = 0;
    this.heartsLost = 0; this.wrong = 0; this.secret = false; this.route = null;
    this.seqStep = 0;       // colour steps done in section 1 (the first red block makes it 1/7)
    this.queue = [];
    this.section = 0;
    this.sectionSeen = new Set([0]);
    this.cloud = null; this.orb = null;
    this.events = [];
    this.p = {
      mode: "stand", tile: course.start, rail: null, s: 0, x: 0, lane: 0, v: 0,
      pos: course.start.stand(), yaw: course.start.yaw, targetYaw: course.start.yaw,
      lastSafe: course.start, checkpoint: course.start, hop: null, jump: null, fall: null, blink: 0, stun: 0,
    };
    boy.teleport(this.p.pos, this.p.yaw);
  }

  // ---- input --------------------------------------------------------------------------------
  swipe(dir) {
    if (this.state !== "play") return;
    const p = this.p;
    if (p.mode === "run" || p.mode === "lead") { this._railInput(dir); return; }
    if (this.queue.length < 2) this.queue.push(dir);
  }

  // ---- per frame ------------------------------------------------------------------------------
  update(dt) {
    if (this.state === "over") return;
    this.time += dt;
    runGameTimers(this);
    if (this.state === "play") this.elapsed += dt;
    const p = this.p;
    this.level.update(dt, this.time, p.pos);
    p.blink = Math.max(0, p.blink - dt);
    p.stun = Math.max(0, p.stun - dt);

    switch (p.mode) {
      case "stand": this._stand(dt); break;
      case "hop": this._hop(dt); break;
      case "lead": case "run": this._run(dt); break;
      case "fall": this._fall(dt); break;
      case "bounce": this._hop(dt); break;
      case "finish": this._finish(dt); break;
    }

    // turn the whole body toward where he is going (fast when moving, calmer when standing)
    const rate = p.mode === "stand" ? 7 : 15;
    const dy = angleWrap(p.targetYaw - p.yaw);
    p.yaw += Math.sign(dy) * Math.min(Math.abs(dy), rate * dt);
    this.boy.root.position.copy(p.pos);
    this.boy.root.rotation.y = p.yaw;
    this.boy.root.visible = p.blink <= 0 || Math.floor(p.blink * 14) % 2 === 0;
    this.boy.update(dt);

    // hazards
    if (this.cloud) {
      const onRail = (p.mode === "run" || p.mode === "lead") && p.rail === this.cloud.rail;
      const hit = this.cloud.update(dt, onRail ? { s: p.s, x: p.x, v: p.v, air: !!p.jump } : null, () => p.lane);
      if (hit && p.blink <= 0) this._hurt("strike");
    }
    if (this.orb) this.orb.update(dt, this.section === 3);
    this._pickups();
    this.hud.update(this);
  }

  // ---- standing on a tile ---------------------------------------------------------------------
  _stand(dt) {
    const p = this.p, t = p.tile;
    // ride moving blocks
    t.stand(p.pos);
    if (!this.level.solidNow(t)) { this._startFall(t.motion && t.motion.type === "sink" ? "sink" : "thrown"); return; }
    // rolling / flipping blocks don't turn under him for a moment after he lands
    p.targetYaw = t.yaw;
    if (this.queue.length) this._move(this.queue.shift());
  }

  _move(dir) {
    const p = this.p, t = p.tile;
    const link = t.links[dir];
    if (!link) { this._nope(dir); return; }
    if (link.rail) { this._enterRail(link.rail); return; }
    this._startHop(link.tile, { flip: !!link.flip, dir });
  }

  _nope(dir) {
    // nowhere to go that way: a glance and a shake of the head
    const p = this.p;
    if (dir !== "up") p.targetYaw = p.tile.yaw + (dir === "left" ? 0.5 : -0.5);
    this.audio.play("nope");
    this._event("nope", dir);
  }

  _startHop(target, o = {}) {
    const p = this.p;
    const from = p.pos.clone();
    const to = target.base.clone();
    if (target.kind === "island") {
      // land on the near side of an island
      const d = _v.subVectors(from, to).setY(0);
      const r = Math.min(target.radius * 0.5, d.length());
      to.addScaledVector(d.normalize(), r);
    }
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    const flip = !!o.flip;
    const gap = target.kind === "island" ? dist - target.radius - 1 : dist - 1.9;
    const run = !flip && gap < 0.35 && Math.abs(to.y - from.y) < 0.3;     // no gap: just run across
    const air = flip ? 1.05 : run ? 0 : 0.34 + 0.048 * dist;
    const apex = flip ? 2.9 : 0.62 + 0.1 * dist + Math.max(0, to.y - from.y) * 0.9;
    p.hop = { from, to, target, t: 0, crouch: run ? 0 : 0.085, air, runDur: run ? dist / 4.4 : 0, land: 0.15,
      apex, flip, run, phase: run ? "run" : "crouch", dir: o.dir, back: !!o.back };
    p.targetYaw = Math.atan2(to.x - from.x, to.z - from.z);
    if (o.back) p.targetYaw = p.yaw;       // bounced back: keep facing forward
    p.mode = o.back ? "bounce" : "hop";
    if (!run) { this.boy.setMode("crouch"); this.boy.modeT = 0; }
    this.audio.play(flip ? "spring" : "jump");
    this._event("hop", { from: p.tile ? p.tile.id : null, to: target.id, dir: o.dir, flip, yaw: p.targetYaw });
  }

  _hop(dt) {
    const p = this.p, h = p.hop, B = this.boy;
    h.t += dt;
    if (h.phase === "run") {
      const k = Math.min(1, h.t / h.runDur);
      p.pos.lerpVectors(h.from, h.to, k);
      if (k >= 1) this._arrive(h);
      return;
    }
    if (h.phase === "crouch") {
      B.modeT = Math.min(1, h.t / h.crouch);
      if (h.t >= h.crouch) { h.phase = "air"; h.t = 0; B.setMode("air", { flip: h.flip, lead: Math.random() < 0.5 ? 1 : -1 }); }
      return;
    }
    if (h.phase === "air") {
      const u = Math.min(1, h.t / h.air);
      // home in on a moving block over the last part of the jump
      const tgt = h.target;
      const end = h.to.clone();
      if (tgt.motion && u > 0.55 && this._landable(tgt, h)) {
        const k = THREE.MathUtils.smoothstep(u, 0.55, 0.95);
        end.lerp(tgt.pos, k);
      }
      p.pos.lerpVectors(h.from, end, u);
      p.pos.y = h.from.y + (end.y - h.from.y) * u + 4 * h.apex * u * (1 - u);
      B.modeT = u;
      if (u >= 1) this._arrive(h);
      return;
    }
    if (h.phase === "land") {
      B.modeT = Math.min(1, h.t / h.land);
      p.pos.copy(p.tile.pos);
      if (p.tile.kind === "island") p.pos.copy(h.to);
      // a queued move can go as soon as his feet are down
      if (h.t > 0.06 && this.queue.length && p.mode === "hop" && p.tile.kind !== "island") { B.setMode("ground"); p.mode = "stand"; return; }
      if (h.t >= h.land) {
        B.setMode("ground");
        p.mode = "stand";
        if (p.tile.kind === "island") this._walkToCenter();
        this._afterLand(p.tile);
      }
    }
  }

  _landable(t, h) {
    if (t.gone) return false;
    const m = t.motion;
    if (!m) return true;
    if (m.type === "slide") return Math.abs(t.offset || 0) < 0.95;
    if (m.type === "sink") return (t.sunk || 0) < 0.15;
    if (m.type === "roll" || m.type === "flip") return !t.moving;
    return true;
  }

  _arrive(h) {
    const p = this.p, t = h.target;
    if (!this._landable(t, h)) {
      p.tile = null;
      this._startFall(t.motion && t.motion.type === "slide" ? "missed" : "knocked", h);
      return;
    }
    p.tile = t;
    h.phase = "land"; h.t = 0;
    if (h.walk) { h.land = 0.05; this.boy.setMode("ground"); p.pos.copy(h.to); return; }
    if (!h.run) { this.boy.setMode("land"); this.boy.modeT = 0; this.audio.play("land"); }
    else this.boy.setMode("ground");
    p.pos.copy(t.kind === "island" ? h.to : t.pos);
    // standing on a rolling cube: it waits a moment before it turns again
    if (t.motion && (t.motion.type === "roll" || t.motion.type === "flip")) this._holdTile(t, 1.35);
    this._landedOn(t, h);
  }

  _holdTile(t, sec) {
    const m = t.motion;
    // shift the block's cycle so that it rests for `sec` more seconds from now
    const u = (((this.time - (t.holdShift || 0)) / m.period + m.phase) % 1 + 1) % 1;
    const rest = m.flat / m.period;
    const left = (rest - u) * m.period;
    if (left < sec) t.holdShift = (t.holdShift || 0) + (sec - left);
  }

  _landedOn(t, h) {
    const p = this.p;
    this._setSection(t.section);
    this._event("land", { tile: t.id, kind: t.kind, color: t.color, fake: t.fake, section: t.section });
    if (t.fake) {
      // it looked real... it crumbles
      setTimeoutGame(this, 0.18, () => { this._crumble(t); if (p.tile === t) this._startFall("fake"); });
      this.audio.play("crack");
      return;
    }
    if (t.seq !== -1 || t.correct === false) {
      if (t.section === 0 && t.kind === "block") {
        if (t.correct && t.seq === this.seqStep) {
          this.seqStep++;
          this.fx.pop(t.pos, 0xffffff);
          this.audio.play("ding");
        } else if (!t.correct || t.seq !== this.seqStep) {
          // wrong colour: the block buzzes and throws him back
          this.wrong++;
          t.obj.userData.mat.uniforms.uFlash.value = 0.8;
          setTimeoutGame(this, 0.5, () => { t.obj.userData.mat.uniforms.uFlash.value = 0; });
          this.audio.play("wrong");
          this.hud.say(["Wrong color!", `Jump on the ${SEQ[this.seqStep].toUpperCase()} block`], "icon_fake", 1.6);
          const back = p.lastSafe;
          setTimeoutGame(this, 0.28, () => { if (p.tile === t) this._startHop(back, { back: true }); });
          return;
        }
      }
    }
    if (!t.motion && !t.fake) p.lastSafe = t;
    if (t.checkpoint) p.checkpoint = t;
    if (t.rail && (t.kind === "pad" || t.route)) {
      // launch pads and the arrow blocks at the fork start their road straight away
      if (t.secret) { this.secret = true; this.hud.toast("Secret route found!"); this.audio.play("secret"); }
      if (t.route) this.route = t.route;
      setTimeoutGame(this, 0.2, () => { if (p.tile === t && p.mode === "stand") this._enterRail(t.rail); });
    }
  }

  _walkToCenter() {
    // after landing on an island he trots over to the front of it (ready for the next section)
    const p = this.p, t = p.tile;
    const to = t.stand();
    const d = Math.hypot(to.x - p.pos.x, to.z - p.pos.z);
    if (d < 0.3) { p.pos.copy(to); return; }
    p.hop = { from: p.pos.clone(), to, target: t, t: 0, run: true, runDur: d / 3.4, phase: "run", land: 0.1, walk: true };
    p.targetYaw = Math.atan2(to.x - p.pos.x, to.z - p.pos.z);
    p.mode = "hop";
  }

  _afterLand(t) { void t; }

  _crumble(t) {
    if (t.gone) return;
    t.gone = true;
    this.fx.shatter(t.obj, t.color);
    t.obj.visible = false;
  }

  // ---- roads ------------------------------------------------------------------------------------
  _enterRail(rail) {
    const p = this.p;
    rail.frame(0, _f);
    const lead = Math.hypot(_f.p.x - p.pos.x, _f.p.z - p.pos.z);
    p.rail = rail;
    p.leadFrom = p.pos.clone();
    p.leadLen = lead;
    p.s = -lead;
    p.x = 0; p.lane = 0;
    p.v = Math.max(p.v, 1.5);
    p.mode = "lead";
    p.tile = null;
    p.jump = null;
    this.boy.setMode("ground");
    this._setSection(rail.section);
    if (rail.strikes && this.cloud && !this.cloud.active) this.cloud.start(p.pos);
    if (rail.finish) this.hud.say(SECTIONS[7].say, null, 0);
    this._event("rail", { section: rail.section, route: rail.route || null, secret: !!rail.secret });
  }

  _railInput(dir) {
    const p = this.p, r = p.rail;
    if (dir === "up") {
      if (!p.jump && p.mode === "run") {
        p.jump = { t: 0, dur: 0.62, apex: 1.15 };
        this.boy.setMode("air", { lead: Math.random() < 0.5 ? 1 : -1 });
        this.boy.modeT = 0;
        this.audio.play("jump");
        this._event("jump", {});
      }
      return;
    }
    if (r.lanes < 2) { this._event("nope", dir); return; }
    const half = (r.lanes - 1) / 2;
    const nl = THREE.MathUtils.clamp(p.lane + (dir === "left" ? -1 : 1), -half, half);
    if (nl !== p.lane) { p.lane = nl; this.audio.play("swish"); this._event("lane", { lane: nl, dir }); }
  }

  _run(dt) {
    const p = this.p, r = p.rail, B = this.boy;
    const vmax = p.stun > 0 ? r.speed * 0.55 : r.speed;
    p.v += THREE.MathUtils.clamp(vmax - p.v, -14 * dt, 10 * dt);
    p.s += p.v * dt;
    let ground;
    if (p.s < 0) {
      // lead-in from the island / block onto the start of the road
      const k = 1 + p.s / Math.max(0.01, p.leadLen);
      r.frame(0, _f);
      p.pos.lerpVectors(p.leadFrom, _f.p, k);
      ground = p.pos.y;
      p.targetYaw = Math.atan2(_f.p.x - p.leadFrom.x, _f.p.z - p.leadFrom.z);
      if (p.leadLen < 0.05) p.targetYaw = _f.yaw;
    } else {
      p.mode = "run";
      const tx = r.laneX(p.lane);
      const vx = THREE.MathUtils.clamp((tx - p.x) * 7, -4.3, 4.3);
      p.x += vx * dt;
      r.frame(Math.min(p.s, r.length), _f);
      ground = _f.p.y;
      p.pos.copy(_f.p).addScaledVector(_f.r, p.x);
      // face the way he is actually moving: along the road, turned toward a lane change
      const dir = _v.set(Math.sin(_f.yaw), 0, Math.cos(_f.yaw)).multiplyScalar(p.v).addScaledVector(_f.r, vx);
      p.targetYaw = Math.atan2(dir.x, dir.z);
      p.yaw = p.yaw + angleWrap(p.targetYaw - p.yaw) * Math.min(1, dt * 14);
    }
    if (p.jump) {
      const j = p.jump;
      j.t += dt;
      const u = Math.min(1, j.t / j.dur);
      p.pos.y = ground + 4 * j.apex * u * (1 - u);
      B.modeT = u;
      if (u >= 1) {
        if (r.inGap(p.s)) { this._startFall("gap"); return; }
        p.jump = null;
        B.setMode("land"); B.modeT = 0;
        p.landT = 0.12;
      }
    } else {
      p.pos.y = ground;
      if (p.landT > 0) {
        p.landT -= dt;
        B.modeT = 1 - p.landT / 0.12;
        if (p.landT <= 0) B.setMode("ground");
      }
      if (p.s > 0 && r.inGap(p.s)) { this._startFall("gap"); return; }
    }
    if (p.s >= r.length) {
      if (r.finish) { this._startFinish(); return; }
      // run off the end of the road onto the next island
      const exit = r.exit;
      const to = exit.stand();
      p.mode = "hop";
      p.hop = { from: p.pos.clone(), to, target: exit, t: 0, run: true, phase: "run",
        runDur: Math.hypot(to.x - p.pos.x, to.z - p.pos.z) / Math.max(2.5, p.v * 0.8), land: 0.1 };
      p.targetYaw = Math.atan2(to.x - p.pos.x, to.z - p.pos.z);
      if (p.jump) { p.jump = null; B.setMode("ground"); }
      if (r.strikes && this.cloud) this.cloud.stop();
      p.rail = null;
      p.v = 0;
    }
  }

  // ---- falling, getting hurt, respawning -------------------------------------------------------------
  _startFall(why, h) {
    const p = this.p;
    if (p.mode === "fall") return;
    const vel = new THREE.Vector3();
    if (h && h.air) {
      const dir = new THREE.Vector3().subVectors(h.to, h.from).setY(0).normalize();
      vel.copy(dir).multiplyScalar(3.2);
    } else if (p.mode === "run") {
      vel.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)).multiplyScalar(p.v * 0.8);
    }
    vel.y = why === "thrown" || why === "knocked" ? 3.5 : 0.5;
    p.fall = { t: 0, vel, why };
    p.mode = "fall";
    p.jump = null;
    this.boy.setMode("fall");
    this.audio.play("fall");
    this._event("fall", { why });
  }

  _fall(dt) {
    const p = this.p, f = p.fall;
    f.t += dt;
    f.vel.y -= 24 * dt;
    p.pos.addScaledVector(f.vel, dt);
    if (f.t > 1.05) this._respawn();
  }

  _hurt(why) {
    const p = this.p;
    this.hearts--;
    this.heartsLost++;
    p.blink = 1.4;
    p.stun = 0.5;
    this.fx.flash("rgba(255,60,90,0.45)");
    this.audio.play("hit");
    this._event("hurt", { why, hearts: this.hearts });
    if (this.hearts <= 0) this._outOfHearts();
  }

  _respawn() {
    const p = this.p;
    this.hearts--;
    this.heartsLost++;
    this._event("hurt", { why: "fall", hearts: this.hearts });
    this.fx.flash("rgba(255,255,255,0.8)");
    if (this.hearts <= 0) { this._outOfHearts(); return; }
    const t = p.lastSafe && !p.lastSafe.gone ? p.lastSafe : p.checkpoint;
    this._placeOn(t);
    p.blink = 1.3;
  }

  _placeOn(t) {
    const p = this.p;
    if (this.cloud && this.cloud.active) this.cloud.stop();
    p.mode = "stand";
    p.tile = t;
    p.rail = null;
    p.jump = null;
    p.hop = null;
    p.v = 0;
    t.stand(p.pos);
    p.yaw = p.targetYaw = t.yaw;
    this.queue = [];
    this.boy.teleport(p.pos, p.yaw);
    this._setSection(t.section);
  }

  _outOfHearts() {
    this.state = "over";
    this.hud.showOver(true);
    this._event("over", {});
  }

  retry() {
    const p = this.p;
    const cp = p.checkpoint;
    this.hearts = 3;
    this.level.resetSection(cp.section);
    if (cp.section === 0) this.seqStep = 0;
    this.state = "play";
    this.hud.showOver(false);
    this._placeOn(cp);
    p.lastSafe = cp;
    p.blink = 1.0;
  }

  // ---- the gate ----------------------------------------------------------------------------------------
  _startFinish() {
    const p = this.p;
    p.mode = "finish";
    p.finT = 0;
    this.audio.play("gate");
    this._event("gate", {});
  }

  _finish(dt) {
    const p = this.p;
    p.finT += dt;
    // keep running into the light of the portal
    p.pos.x += Math.sin(p.yaw) * p.v * dt;
    p.pos.z += Math.cos(p.yaw) * p.v * dt;
    p.targetYaw = p.rail.frame(p.rail.length).yaw;
    if (p.finT > 0.45) this.fx.whiteout(Math.min(1, (p.finT - 0.45) / 0.6));
    if (p.finT > 1.2 && this.state === "play") this._complete();
  }

  _complete() {
    this.state = "done";
    const perfect = this.heartsLost === 0 && this.wrong === 0;
    const faults = this.heartsLost + this.wrong;
    const stars = faults === 0 ? 3 : faults <= 2 ? 2 : 1;
    this.result = { coins: this.coins * COIN, gems: this.gems, tokens: this.tokens, perfect: perfect ? 100 : 0,
      secret: this.secret ? 1 : 0, stars, time: this.elapsed, route: this.route };
    this.hud.showComplete(this.result);
    this.audio.play("win");
    this._event("done", this.result);
  }

  // ---- pickups -------------------------------------------------------------------------------------------
  _pickups() {
    const p = this.p;
    const c = _v.copy(p.pos).add(new THREE.Vector3(0, 0.75, 0));
    for (const it of this.level.pickups) {
      if (it.taken) continue;
      const r = it.type === "ring" ? 1.25 : it.type === "gem" ? (it.big ? 1.3 : 1.0) : 0.95;
      const o = it.obj.position;
      if (Math.abs(o.x - c.x) > r || Math.abs(o.z - c.z) > r) continue;
      if (c.distanceTo(o) > r + 0.3) continue;
      it.taken = true;
      if (it.type === "coin") { this.coins++; this.audio.play("coin"); }
      else if (it.type === "gem") { this.gems++; this.audio.play("gem"); }
      else { this.tokens++; this.audio.play("ring"); }
      this.hud.bump(it.type);
    }
  }

  // ---- sections ------------------------------------------------------------------------------------------
  _setSection(s) {
    if (s === this.section) return;
    this.section = s;
    this.hud.setSection(s, !this.sectionSeen.has(s));
    this.sectionSeen.add(s);
    this._event("section", { section: s });
  }

  _event(type, data) {
    this.events.push({ t: this.time, type, data });
    if (this.events.length > 400) this.events.shift();
  }
}

/** Timers that run on the game clock (so they pause with the game). */
export function setTimeoutGame(game, sec, fn) {
  (game._timers || (game._timers = [])).push({ at: game.time + sec, fn });
}
export function runGameTimers(game) {
  if (!game._timers) return;
  const due = game._timers.filter((t) => t.at <= game.time);
  game._timers = game._timers.filter((t) => t.at > game.time);
  for (const t of due) t.fn();
}
