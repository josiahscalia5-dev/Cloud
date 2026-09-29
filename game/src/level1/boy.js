// The boy's animation: a procedural rig driven by how the game moves his root.
//
// The game places boy.root (position on the ground, yaw = the way he faces) every frame and
// sets boy.mode. From the root's actual motion the boy works out his own pose:
//
//   ground  idle or running. The stride is driven by the distance travelled, so a planted foot
//           stays exactly where it touched down (no sliding); feet re-step when he turns on the
//           spot so his legs never twist. Knees always bend forward (2-bone IK with a forward
//           knee hint) and every foot points the way the body faces.
//   crouch  wind-up before a jump (feet planted, hips drop, arms back).
//   air     jump arc: push-off, one knee tucked forward and the other leg trailing, then both
//           legs reach down so the feet touch the platform exactly as the arc lands. Optional
//           front flip around the hips.
//   land    knees absorb the landing, then back to ground.
//   fall    missed the platform: arms up, legs kicking.
//   cheer   arms up (the Rainbow Gate).
//
// Root space: +Z = the boy's forward, +X = his left, y = 0 on the ground under him.
import * as THREE from "three";
import { buildBoyModel, DIM } from "./boyModel.js";

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = (t) => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _e = new THREE.Euler();

function angleWrap(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }

/** Orients `obj` so its local -Y runs along `dir` and its local +Z leans toward `hint`. */
function aimBone(obj, pos, dir, hint) {
  _y.copy(dir).negate().normalize();
  _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  obj.position.copy(pos);
  obj.quaternion.setFromRotationMatrix(_m);
}

export class Boy {
  constructor(opts = {}) {
    this.m = buildBoyModel(opts);
    this.root = this.m.root;
    this.mode = "ground";
    this.modeT = 0;          // 0..1 progress for crouch / air / land, seconds for fall / cheer
    this.flip = false;       // front flip during this jump
    this.lead = 1;           // leg that leads in the air (+1 left, -1 right)
    this.ground = 0;         // world height of the surface under him (used while running)
    this.phase = 0;          // gait cycles
    this.speed = 0;          // smoothed ground speed (m/s)
    this.turnRate = 0;       // smoothed yaw rate (rad/s)
    this.time = 0;
    this._prevPos = new THREE.Vector3();
    this._prevYaw = 0;
    this._first = true;
    this.feet = [0, 1].map((i) => ({
      side: i === 0 ? 1 : -1,
      planted: true,
      world: new THREE.Vector3(),
      yaw: 0,               // world yaw of a planted foot
      local: new THREE.Vector3(i === 0 ? 0.095 : -0.095, 0, 0),
      relYaw: 0, pitch: 0,
      swing: null,          // { from, fromYaw, to, t, dur, lift, phase: bool }
    }));
    this.airFrom = [new THREE.Vector3(), new THREE.Vector3()];
    // smoothed upper-body pose
    this.p = { hipY: DIM.hipY - 0.02, lean: 0.05, twist: 0, roll: 0, sway: 0, headX: 0, headY: 0,
      arm: [{ x: 0.1, z: 0.12, e: 0.3 }, { x: 0.1, z: 0.12, e: 0.3 }], flipA: 0 };
    this.metrics = { maxFootSlip: 0, footYawErr: 0, kneeErr: 0 };
  }

  /** Put the boy somewhere new (no stepping, feet planted under him). */
  teleport(pos, yaw) {
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this.root.updateMatrixWorld(true);
    this._prevPos.copy(pos);
    this._prevYaw = yaw;
    this.speed = 0;
    this.mode = "ground";
    this.modeT = 0;
    for (const f of this.feet) {
      f.swing = null;
      f.planted = true;
      f.local.set(f.side * 0.095, 0, 0);
      f.world.copy(f.local).applyMatrix4(this.root.matrixWorld);
      f.yaw = yaw;
      f.relYaw = 0;
      f.pitch = 0;
    }
    this._first = false;
  }

  setMode(mode, opts = {}) {
    if (mode === "air" && this.mode !== "air") {
      for (let i = 0; i < 2; i++) { this.airFrom[i].copy(this.feet[i].local); this.feet[i].planted = false; this.feet[i].swing = null; }
      this.flip = !!opts.flip;
      this.lead = opts.lead || (Math.random() < 0.5 ? 1 : -1);
    }
    if ((mode === "land" || mode === "ground") && (this.mode === "air" || this.mode === "fall")) this._plantAll();
    if (mode === "fall") for (const f of this.feet) { f.planted = false; f.swing = null; }
    this.mode = mode;
    this.modeT = 0;
  }

  _plantAll() {
    this.root.updateMatrixWorld(true);
    for (const f of this.feet) {
      f.local.y = 0;
      f.planted = true;
      f.swing = null;
      f.world.copy(f.local).applyMatrix4(this.root.matrixWorld);
      f.yaw = this.root.rotation.y + f.relYaw;
    }
  }

  _rootToWorld(v, out) { return out.copy(v).applyMatrix4(this.root.matrixWorld); }
  _worldToRoot(v, out) { _m.copy(this.root.matrixWorld).invert(); return out.copy(v).applyMatrix4(_m); }

  /** Gait parameters for a ground speed. */
  gait(v) {
    const k = clamp((v - 1.0) / 4.2, 0, 1);
    return {
      cycle: lerp(1.0, 1.72, k),     // metres per full stride (left + right step)
      stance: lerp(0.56, 0.32, k),   // share of the cycle a foot is on the ground
      contact: lerp(0.1, 0.19, k),   // a foot touches down this far in front of the hips
      lift: lerp(0.09, 0.25, k),
      hip: lerp(DIM.hipY - 0.03, DIM.hipY - 0.06, k),
      lean: lerp(0.07, 0.25, k),
      armSwing: lerp(0.32, 0.95, k),
      elbow: lerp(0.45, 1.5, k),
      bob: lerp(0.012, 0.036, k),
      twist: lerp(0.05, 0.14, k),
      k,
    };
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const root = this.root;
    root.updateMatrixWorld(true);
    const yaw = root.rotation.y;
    if (this._first) this.teleport(root.position.clone(), yaw);

    // --- root motion -----------------------------------------------------------------------
    _v.subVectors(root.position, this._prevPos);
    const dist = Math.hypot(_v.x, _v.z);
    const rawV = dt > 0 ? dist / dt : 0;
    const dyaw = angleWrap(yaw - this._prevYaw);
    this.turnRate = lerp(this.turnRate, dt > 0 ? dyaw / dt : 0, 1 - Math.exp(-dt * 10));
    this._prevPos.copy(root.position);
    this._prevYaw = yaw;
    const grounded = this.mode === "ground" || this.mode === "crouch" || this.mode === "land";
    this.speed = lerp(this.speed, grounded ? rawV : this.speed, 1 - Math.exp(-dt * 14));
    if (this.mode === "crouch" || this.mode === "land") this.speed = Math.min(this.speed, rawV);

    if (this.mode === "fall" || this.mode === "cheer") this.modeT += dt;

    const g = this.gait(this.speed);
    const running = this.mode === "ground" && this.speed > 0.45;
    if (running) this.phase += dist / g.cycle;

    // --- feet --------------------------------------------------------------------------------
    if (this.mode === "ground" || this.mode === "crouch" || this.mode === "land") this._groundFeet(dt, g, running);
    else if (this.mode === "air") this._airFeet();
    else if (this.mode === "fall") this._fallFeet();
    else if (this.mode === "cheer") this._groundFeet(dt, g, false);

    // --- upper body targets --------------------------------------------------------------------
    const t = this._upperTargets(g, running);
    const p = this.p;
    const a = 1 - Math.exp(-dt * (this.mode === "air" ? 16 : 20));
    for (const k of ["lean", "twist", "roll", "sway", "headX", "headY"]) p[k] = lerp(p[k], t[k], a);
    p.hipY = lerp(p.hipY, t.hipY, 1 - Math.exp(-dt * 26));
    for (let i = 0; i < 2; i++) for (const k of ["x", "z", "e"]) p.arm[i][k] = lerp(p.arm[i][k], t.arm[i][k], a);
    p.flipA = t.flipA;

    this._apply();
  }

  // ---------------------------------------------------------------------------------------------
  _groundFeet(dt, g, running) {
    const root = this.root;
    const zC = g.contact;
    const planted = [];
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const u = ((this.phase + (i === 0 ? 0 : 0.5)) % 1 + 1) % 1;
      const inSwing = u >= g.stance;

      if (running && this.mode === "ground") {
        if (f.planted && inSwing) {
          // lift off: swing from where the foot is to the next contact point ahead
          f.planted = false;
          f.swing = { from: f.local.clone(), fromYaw: f.relYaw, phase: true };
        } else if (!f.planted && f.swing && f.swing.phase && !inSwing) {
          this._plant(f);
        } else if (!f.planted && f.swing && !f.swing.phase) {
          f.swing.phase = true; f.swing.from.copy(f.local); f.swing.fromYaw = f.relYaw;
          if (!inSwing) this._plant(f);
        }
      } else if (!f.planted && f.swing && f.swing.phase) {
        // stopped mid-stride: finish the step toward the standing position, by time
        f.swing = { from: f.local.clone(), fromYaw: f.relYaw, to: new THREE.Vector3(f.side * 0.095, 0, 0.02),
          t: 0, dur: 0.13, lift: 0.06, phase: false };
      }

      if (f.planted) {
        this._worldToRoot(f.world, f.local);
        f.local.y = 0;
        f.relYaw = angleWrap(f.yaw - root.rotation.y);
        // late stance: heel peels off, the foot rolls over its ball
        let pitch = 0;
        if (running) {
          const s = u / g.stance;
          pitch = s < 0.12 ? lerp(-0.18, 0, s / 0.12) : s > 0.55 ? lerp(0, 0.75 * g.k + 0.15, smooth((s - 0.55) / 0.45)) : 0;
        }
        f.pitch = pitch;
        planted.push(f);
      } else if (f.swing && f.swing.phase) {
        // phase-driven swing (running)
        const w = clamp((u - g.stance) / (1 - g.stance), 0, 1);
        const to = _w.set(f.side * 0.078, 0, zC);
        const s = smooth(clamp((w - 0.12) / 0.8, 0, 1));
        f.local.lerpVectors(f.swing.from, to, s);
        // heel kicks up behind early in the swing, the knee drives forward late
        const lift = g.lift * Math.pow(Math.sin(Math.PI * clamp(w * 1.08, 0, 1)), 0.85);
        f.local.y = lift + 0.07 * g.k * Math.sin(Math.PI * clamp(w / 0.55, 0, 1));
        f.local.z -= 0.09 * g.k * Math.sin(Math.PI * clamp(w / 0.5, 0, 1));
        f.relYaw = lerp(f.swing.fromYaw, 0, s);
        f.pitch = w < 0.45 ? lerp(0.75 * g.k + 0.2, 0.35, w / 0.45) : lerp(0.35, -0.22, (w - 0.45) / 0.55);
      } else if (f.swing) {
        // time-driven corrective step
        const sw = f.swing;
        sw.t += dt / sw.dur;
        const s = smooth(clamp(sw.t, 0, 1));
        f.local.lerpVectors(sw.from, sw.to, s);
        f.local.y = sw.lift * Math.sin(Math.PI * clamp(sw.t, 0, 1));
        f.relYaw = lerp(sw.fromYaw, 0, s);
        f.pitch = 0.25 * Math.sin(Math.PI * clamp(sw.t, 0, 1));
        if (sw.t >= 1) this._plant(f);
      }
    }

    // standing still: re-step a foot that is too far from its spot or twisted by a turn
    if (!running && this.mode === "ground" && this.feet.every((f) => f.planted)) {
      let worst = null, worstScore = 0;
      for (const f of this.feet) {
        const off = Math.hypot(f.local.x - f.side * 0.095, f.local.z);
        const score = Math.max(off / 0.12, Math.abs(f.relYaw) / 0.38);
        if (score > 1 && score > worstScore) { worst = f; worstScore = score; }
      }
      if (worst) worst.planted = false, worst.swing = { from: worst.local.clone(), fromYaw: worst.relYaw,
        to: new THREE.Vector3(worst.side * 0.095, 0, 0.0), t: 0, dur: 0.15, lift: 0.075, phase: false };
    }
    // crouch / land keep the feet where they are but let them pivot with the body
    if (this.mode === "crouch") for (const f of this.feet) if (f.planted) { f.yaw = this.root.rotation.y; f.relYaw = 0; }
  }

  _plant(f) {
    f.local.y = 0;
    f.planted = true;
    f.swing = null;
    this._rootToWorld(f.local, f.world);
    f.yaw = this.root.rotation.y + f.relYaw;
  }

  _airFeet() {
    const t = this.modeT;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const lead = f.side === this.lead;
      const s = f.side;
      const push = new THREE.Vector3(s * 0.08, 0.05, lead ? -0.04 : -0.22);
      const tuck = this.flip ? new THREE.Vector3(s * 0.085, 0.36, 0.12)
        : lead ? new THREE.Vector3(s * 0.09, 0.3, 0.17) : new THREE.Vector3(s * 0.085, 0.29, -0.2);
      const land = new THREE.Vector3(s * 0.1, 0, lead ? 0.06 : -0.02);
      let pitch;
      if (t < 0.18) {
        const k = smooth(t / 0.18);
        f.local.lerpVectors(this.airFrom[i], push, k);
        pitch = lerp(0, lead ? 0.3 : 0.6, k);
      } else if (t < 0.6) {
        const k = smooth((t - 0.18) / 0.42);
        f.local.lerpVectors(push, tuck, Math.min(1, k * 1.6));
        pitch = lerp(lead ? 0.3 : 0.6, lead ? 0.15 : 0.95, k);
      } else {
        const k = smooth((t - 0.6) / 0.4);
        f.local.lerpVectors(tuck, land, k);
        f.local.y = lerp(tuck.y, 0, Math.pow((t - 0.6) / 0.4, 1.2));
        pitch = lerp(lead ? 0.15 : 0.95, -0.05, k);
      }
      f.pitch = pitch;
      f.relYaw = lerp(f.relYaw, 0, 0.25);
    }
  }

  _fallFeet() {
    const t = this.time * 11;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], ph = t + i * Math.PI;
      f.local.set(f.side * 0.1, 0.3 + 0.12 * Math.sin(ph), 0.12 * Math.cos(ph));
      f.pitch = 0.4 + 0.3 * Math.sin(ph);
      f.relYaw = 0;
    }
  }

  // ---------------------------------------------------------------------------------------------
  _upperTargets(g, running) {
    const T = { hipY: g.hip, lean: g.lean, twist: 0, roll: 0, sway: 0, headX: 0, headY: 0, flipA: 0,
      arm: [{ x: 0, z: 0.12, e: 0.3 }, { x: 0, z: 0.12, e: 0.3 }] };
    const ph = this.phase * TAU;
    if (this.mode === "ground" || this.mode === "land" || this.mode === "crouch") {
      if (running) {
        const k = clamp((this.speed - 0.45) / 1.2, 0, 1);
        T.hipY = g.hip - g.bob * Math.cos(2 * ph - 2 * TAU * 0.5 * g.stance);
        T.twist = g.twist * Math.sin(ph) * k;
        T.roll = 0.035 * Math.sin(ph) * k;
        T.sway = 0.012 * Math.sin(ph) * k;
        for (let i = 0; i < 2; i++) {
          // each arm swings with the opposite leg
          const u = ((this.phase + (i === 0 ? 0.5 : 0)) % 1 + 1) % 1;
          const fwd = u < g.stance ? Math.cos(Math.PI * u / g.stance) : -Math.cos(Math.PI * (u - g.stance) / (1 - g.stance));
          T.arm[i].x = -g.armSwing * fwd * k + 0.1;
          T.arm[i].z = 0.14 + 0.06 * g.k;
          T.arm[i].e = g.elbow + 0.28 * fwd * k;
        }
      } else {
        const br = Math.sin(this.time * 2.2);
        T.hipY = DIM.hipY - 0.028 + 0.004 * br;
        T.lean = 0.04 + 0.01 * br;
        for (let i = 0; i < 2; i++) { T.arm[i].x = 0.06; T.arm[i].z = 0.13 + 0.01 * br; T.arm[i].e = 0.32; }
      }
      // turning: the head leads, the body leans into the turn
      T.headY = clamp(this.turnRate * 0.1, -0.45, 0.45);
      T.roll += clamp(-this.turnRate * this.speed * 0.012, -0.12, 0.12);
    }
    if (this.mode === "crouch") {
      const k = smooth(clamp(this.modeT, 0, 1));
      T.hipY = lerp(T.hipY, DIM.hipY - 0.15, k);
      T.lean = lerp(T.lean, 0.42, k);
      for (let i = 0; i < 2; i++) { T.arm[i].x = lerp(T.arm[i].x, 0.75, k); T.arm[i].z = 0.2; T.arm[i].e = 0.55; }
      T.headX = -0.2 * k;
    } else if (this.mode === "land") {
      const k = Math.sin(Math.PI * clamp(this.modeT, 0, 1));
      T.hipY -= 0.11 * k;
      T.lean += 0.2 * k;
      for (let i = 0; i < 2; i++) { T.arm[i].x = lerp(T.arm[i].x, -0.35, k); T.arm[i].z = lerp(T.arm[i].z, 0.45, k); T.arm[i].e = lerp(T.arm[i].e, 0.8, k); }
      T.headX = -0.15 * k;
    } else if (this.mode === "air") {
      const t = this.modeT;
      T.hipY = DIM.hipY - 0.04;
      T.lean = t < 0.2 ? 0.3 : t < 0.65 ? 0.16 : 0.22;
      const leadArm = this.lead === 1 ? 1 : 0;           // the arm opposite the leading leg swings forward
      for (let i = 0; i < 2; i++) {
        const fwd = i === leadArm;
        if (t < 0.2) { T.arm[i].x = -1.0; T.arm[i].z = 0.35; T.arm[i].e = 0.7; }
        else if (t < 0.65) { T.arm[i].x = fwd ? -1.05 : 0.75; T.arm[i].z = 0.55; T.arm[i].e = fwd ? 1.1 : 0.55; }
        else { T.arm[i].x = -0.55; T.arm[i].z = 0.7; T.arm[i].e = 0.7; }
      }
      T.headX = -0.1;
      if (this.flip) {
        const k = smooth(clamp((t - 0.1) / 0.72, 0, 1));
        T.flipA = k * TAU;
        if (t > 0.12 && t < 0.8) for (let i = 0; i < 2; i++) { T.arm[i].x = -1.25; T.arm[i].z = 0.3; T.arm[i].e = 1.7; }
        T.lean = t > 0.12 && t < 0.8 ? 0.5 : T.lean;
      }
    } else if (this.mode === "fall") {
      const t = this.time * 13;
      T.hipY = DIM.hipY - 0.06;
      T.lean = -0.25;
      for (let i = 0; i < 2; i++) {
        T.arm[i].x = -2.5 + 0.35 * Math.sin(t + i * Math.PI);
        T.arm[i].z = 0.45 + 0.25 * Math.sin(t * 0.7 + i);
        T.arm[i].e = 0.5 + 0.3 * Math.sin(t + i);
      }
      T.headX = 0.35;
    } else if (this.mode === "cheer") {
      const w = Math.sin(this.modeT * 9);
      T.hipY = DIM.hipY - 0.03;
      T.lean = -0.08;
      for (let i = 0; i < 2; i++) { T.arm[i].x = -2.75 + 0.1 * w; T.arm[i].z = 0.45 + 0.12 * w; T.arm[i].e = 0.35; }
      T.headX = -0.2;
    }
    return T;
  }

  // ---------------------------------------------------------------------------------------------
  _apply() {
    const M = this.m, p = this.p;
    // flips turn the whole body around the hips
    M.pivot.position.set(0, DIM.hipY, 0);
    M.body.position.set(0, -DIM.hipY, 0);
    M.pivot.rotation.set(p.flipA, 0, 0);

    // keep planted feet on the ground: drop the hips if a planted foot would be out of reach
    const legMax = (DIM.thigh + DIM.shin) * 0.995;
    let hipY = p.hipY;
    for (const f of this.feet) {
      if (!f.planted && this.mode !== "land") continue;
      const hx = f.side * DIM.hipX - f.local.x, hz = f.local.z;
      const h2 = hx * hx + hz * hz;
      const roll = f.pitch > 0 ? Math.sin(f.pitch) * 0.1 : 0;
      const maxH = Math.sqrt(Math.max(0, legMax * legMax - h2)) + f.local.y + DIM.ankleH + roll + 0.004;
      if (hipY > maxH) hipY = maxH;
    }

    M.pelvis.position.set(p.sway, hipY, 0);
    M.pelvis.rotation.set(p.lean * 0.35, p.twist, p.roll);
    M.chest.rotation.set(p.lean * 0.7, -p.twist * 1.6, -p.roll * 0.6);
    M.head.rotation.set(-(p.lean * 1.05) * 0.8 + p.headX, p.twist * 0.6 + p.headY, p.roll * 0.3);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1, a = p.arm[i];
      M.upperArm[i].rotation.set(a.x - p.lean * 0.5, 0, s * a.z);
      M.foreArm[i].rotation.set(-a.e, 0, 0);
      M.hand[i].rotation.set(-0.15, 0, s * -0.1);
    }
    M.pelvis.updateMatrix();

    // legs: 2-bone IK from each hip joint to its ankle target
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      const hip = _v.set(f.side * DIM.hipX, 0, 0).applyMatrix4(M.pelvis.matrix);
      const ankle = _w.set(f.local.x, f.local.y + DIM.ankleH, f.local.z);
      // the ankle rides up as the foot rolls onto its ball
      if (f.pitch > 0 && (f.planted || this.mode === "land")) ankle.y += Math.sin(f.pitch) * 0.1;
      const hint = new THREE.Vector3(Math.sin(f.relYaw * 0.6) + f.side * 0.12, 0.05, Math.cos(f.relYaw * 0.6));
      this._leg(i, hip, ankle, hint);
      // foot: flat on the ground, pointing the way he faces (plus its own small yaw)
      _e.set(f.pitch, f.relYaw, 0, "YXZ");
      M.foot[i].quaternion.setFromEuler(_e);
    }
  }

  _leg(i, hip, target, hint) {
    const M = this.m, L1 = DIM.thigh, L2 = DIM.shin;
    const d = new THREE.Vector3().subVectors(target, hip);
    let dist = d.length();
    const maxL = (L1 + L2) * 0.9995, minL = 0.12;
    dist = clamp(dist, minL, maxL);
    d.normalize();
    const cosA = clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1);
    const a = Math.acos(cosA);
    const perp = hint.clone().addScaledVector(d, -hint.dot(d));
    if (perp.lengthSq() < 1e-8) perp.set(0, 0, 1);
    perp.normalize();
    const thighDir = d.clone().multiplyScalar(Math.cos(a)).addScaledVector(perp, Math.sin(a));
    const knee = hip.clone().addScaledVector(thighDir, L1);
    const ankle = hip.clone().addScaledVector(d, dist);
    const shinDir = ankle.clone().sub(knee).normalize();
    aimBone(M.thigh[i], hip, thighDir, hint);
    aimBone(M.shin[i], knee, shinDir, hint);
    M.foot[i].position.copy(ankle);
    // for tests: how far the knee's forward axis is from the body's forward
    this.metrics["knee" + i] = new THREE.Vector3(0, 0, 1).applyQuaternion(M.shin[i].quaternion);
  }

  /** World position of the sole centre of foot i (for tests). */
  soleWorld(i, out = new THREE.Vector3()) {
    const f = this.m.foot[i];
    f.updateMatrixWorld(true);
    return out.set(0, -DIM.ankleH, 0.047).applyMatrix4(f.matrixWorld);
  }
}
