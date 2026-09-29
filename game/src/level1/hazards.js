// Hazards: the cloud monster that chases you down the rainbow road (section 3) and the laser orb
// of the dark zone (section 4).
//
// The cloud swoops in over the boy's head when he starts down the road and then keeps ahead of
// him, facing him, as in the reference panel. Every so often it marks a spot on the road just
// ahead (a red ring for about a second) and then strikes it with a lightning breath. Change lanes
// to dodge. If he is on the spot when it strikes he loses a heart.
import * as THREE from "three";
import { glowMaterial, shared } from "./materials.js";
import { loadTexture, targetTexture } from "./textures.js";

const A = "assets/level1/3d/";

function boltGeometry(len, seed) {
  // a jagged ribbon of lightning from (0,0,0) down to (0,-len,0), built as a flat strip
  const pts = [];
  let x = 0, z = 0;
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (i > 0 && i < n) { x += (Math.sin(seed * 13.1 + i * 7.3) * 0.5) * 0.9; z += Math.cos(seed * 5.7 + i * 3.1) * 0.25; }
    pts.push(new THREE.Vector3(i === n ? 0 : x, -len * t, i === n ? 0 : z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 40, 0.09, 5, false);
}

export class CloudMonster {
  constructor(scene, rail) {
    this.rail = rail;
    this.scene = scene;
    const m = new THREE.SpriteMaterial({ map: loadTexture(A + "cloud_monster.webp"), transparent: true, depthWrite: false, fog: false });
    this.sprite = new THREE.Sprite(m);
    this.W = 7.2;
    this.sprite.scale.set(this.W, this.W / 1.214, 1);
    this.glow = new THREE.Sprite(glowMaterial(0xffffff, 0.35));
    this.glow.scale.set(12, 10, 1);
    this.group = new THREE.Group();
    this.group.add(this.glow, this.sprite);
    this.group.visible = false;
    scene.add(this.group);
    this.active = false;
    this.t = 0;
    this.nextStrike = 1.6;
    this.strikes = [];
    this.pos = new THREE.Vector3();
    // pool of strike visuals
    this.tTex = targetTexture();
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  start(fromPos) {
    this.active = true;
    this.leaving = false;
    this.t = 0;
    this.nextStrike = 1.8;
    this.group.visible = true;
    this.enterFrom = fromPos.clone().add(new THREE.Vector3(0, 9, 0));
    this.group.position.copy(this.enterFrom);
  }

  stop() {
    this.leaving = true;
    this.leaveT = 0;
    for (const s of this.strikes) this._dispose(s);
    this.strikes = [];
  }

  _dispose(s) {
    for (const o of [s.ring, s.bolt, s.beam, s.flash]) if (o) { this.scene.remove(o); if (o.geometry && o !== s.ring) o.geometry.dispose(); }
  }

  /**
   * boy: { s, x, lane } position on the rail; returns a strike that hits him this frame, if any.
   */
  update(dt, boy, laneOf) {
    if (!this.group.visible) return null;
    this.t += dt;
    const r = this.rail;
    const f = r.frame(Math.min(r.length, (boy ? boy.s : 0) + 11.5));
    const target = f.p.clone().addScaledVector(f.r, (boy ? boy.x : 0) * 0.45).add(new THREE.Vector3(0, 5.2 + Math.sin(this.t * 1.7) * 0.35, 0));
    if (this.leaving) {
      this.leaveT += dt;
      this.group.position.y += dt * (6 + this.leaveT * 10);
      this.sprite.material.opacity = Math.max(0, 1 - this.leaveT / 1.2);
      this.glow.material.opacity = 0.35 * this.sprite.material.opacity;
      if (this.leaveT > 1.3) { this.group.visible = false; this.active = false; }
      return null;
    }
    if (this.t < 1.2) {
      // swoop in over his head and turn to face him
      const k = THREE.MathUtils.smootherstep(this.t, 0, 1.2);
      this.group.position.lerpVectors(this.enterFrom, target, k);
    } else {
      this.group.position.lerp(target, 1 - Math.exp(-dt * 4));
    }
    // breathing puff
    const b = 1 + 0.04 * Math.sin(this.t * 3.1);
    this.sprite.scale.set(this.W * b, (this.W / 1.214) * (2 - b), 1);
    this.sprite.material.rotation = Math.sin(this.t * 1.3) * 0.04;

    let hit = null;
    if (boy && this.t > 1.2) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0 && boy.s < r.length - 10) {
        this.nextStrike = 1.25 + Math.random() * 0.35;
        const lane = Math.random() < 0.72 ? laneOf(boy) : [-1, 0, 1][Math.floor(Math.random() * 3)];
        const s = boy.s + boy.v * 1.0 + 0.6;
        this._mark(s, lane);
      }
    }
    for (const st of this.strikes) {
      st.t += dt;
      const pulse = 0.55 + 0.45 * Math.sin(st.t * 22);
      if (st.t < st.warn) {
        st.ring.material.opacity = 0.35 + 0.55 * pulse;
        const s = 1.6 + 0.25 * pulse;
        st.ring.scale.set(s, s, 1);
      } else if (!st.fired) {
        st.fired = true;
        this._fire(st);
      } else {
        const k = (st.t - st.warn) / 0.45;
        const o = Math.max(0, 1 - k);
        if (st.bolt) st.bolt.material.opacity = o;
        if (st.beam) st.beam.material.opacity = 0.85 * o;
        if (st.flash) st.flash.material.opacity = o;
        st.ring.material.opacity = 0.9 * o;
        if (k < 0.7 && boy && !st.hitDone && Math.abs(boy.s - st.s) < 1.25 && Math.abs(boy.x - st.x) < 1.05 && !boy.air) {
          st.hitDone = true;
          hit = st;
        }
      }
    }
    for (const st of this.strikes) if (st.t > st.warn + 0.5) { this._dispose(st); st.dead = true; }
    this.strikes = this.strikes.filter((s) => !s.dead);
    return hit;
  }

  _mark(s, lane) {
    const r = this.rail;
    const f = r.frame(s);
    const x = lane * r.laneW;
    const p = f.p.clone().addScaledVector(f.r, x).add(new THREE.Vector3(0, 0.05, 0));
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tTex, color: 0xff3048,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(p);
    this.scene.add(ring);
    this.strikes.push({ s, x, p, ring, t: 0, warn: 0.95, fired: false });
  }

  _fire(st) {
    // the breath: a bright beam from the mouth, and a lightning bolt onto the spot
    const mouth = this.group.position.clone().add(new THREE.Vector3(0, -1.2, 0));
    const d = st.p.clone().sub(mouth);
    const len = d.length();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.55, len, 10, 1, true).translate(0, -len / 2, 0), this.beamMat.clone());
    beam.position.copy(mouth);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.clone().normalize());
    const bolt = new THREE.Mesh(boltGeometry(len, Math.random() * 100), this.boltMat.clone());
    bolt.position.copy(mouth);
    bolt.quaternion.copy(beam.quaternion);
    const flash = new THREE.Sprite(glowMaterial(0xcfe8ff, 1));
    flash.scale.set(4.5, 4.5, 1);
    flash.position.copy(st.p).add(new THREE.Vector3(0, 0.4, 0));
    st.ring.material.color.setHex(0xffffff);
    this.scene.add(beam, bolt, flash);
    st.beam = beam; st.bolt = bolt; st.flash = flash;
    this.onStrike && this.onStrike(st);
  }
}

// ---------------------------------------------------------------------------------------------

export class LaserOrb {
  constructor(scene, pos, fakeTiles) {
    this.scene = scene;
    this.fakes = fakeTiles;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: shared.uTime },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main() {
          float fr = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.0);
          float v = n3(vP * 3.0 + vec3(0.0, uTime * 0.6, 0.0));
          float vein = smoothstep(0.47, 0.5, v) * smoothstep(0.53, 0.5, v);
          vec3 col = vec3(0.06, 0.0, 0.08) + vec3(1.0, 0.25, 0.75) * vein * 1.6 + vec3(1.0, 0.35, 0.8) * fr * 1.4;
          float core = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 8.0);
          col += vec3(1.0, 0.6, 0.95) * core * 0.6 * (0.7 + 0.3 * sin(uTime * 5.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(1.7, 32, 20), mat);
    this.orb.position.copy(pos);
    this.glow = new THREE.Sprite(glowMaterial(0xff3fae, 0.85));
    this.glow.scale.set(9, 9, 1);
    this.glow.position.copy(pos);
    scene.add(this.orb, this.glow);
    this.base = pos.clone();
    this.t = 0;
    this.next = 1.5;
    this.beams = [];
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xff3a6a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  update(dt, active) {
    this.t += dt;
    this.orb.position.y = this.base.y + Math.sin(this.t * 1.2) * 0.4;
    this.glow.position.copy(this.orb.position);
    this.glow.material.opacity = 0.65 + 0.25 * Math.sin(this.t * 4);
    this.orb.rotation.y += dt * 0.4;
    if (active) {
      this.next -= dt;
      if (this.next <= 0) {
        this.next = 1.4 + Math.random();
        const live = this.fakes.filter((t) => !t.gone);
        if (live.length) this._zap(live[Math.floor(Math.random() * live.length)]);
      }
    }
    for (const b of this.beams) {
      b.t += dt;
      b.mesh.material.opacity = Math.max(0, 0.9 * (1 - b.t / 0.5));
      if (b.tile && !b.tile.gone) b.tile.obj.userData.mat.uniforms.uFlash.value = Math.max(0, 0.6 * (1 - b.t / 0.5));
    }
    for (const b of this.beams) if (b.t > 0.5) { this.scene.remove(b.mesh); b.mesh.geometry.dispose(); b.dead = true; if (b.tile) b.tile.obj.userData.mat.uniforms.uFlash.value = 0; }
    this.beams = this.beams.filter((b) => !b.dead);
  }

  _zap(tile) {
    const from = this.orb.position.clone(), to = tile.pos.clone();
    const d = to.clone().sub(from);
    const len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6, 1, true).translate(0, len / 2, 0), this.beamMat.clone());
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.scene.add(m);
    tile.obj.userData.mat.uniforms.uFlashColor.value.setHex(0xff4fa8);
    this.beams.push({ mesh: m, t: 0, tile });
  }
}
