// Scene objects for the course: meshes for every tile, road, pickup and landmark, and their
// per-frame motion (sliding / sinking / rolling / flipping blocks, spinning coins, the gate glow).
import * as THREE from "three";
import { makeBlock, makeIsland, makeRoad, makeCoin, makeRing, makeGem } from "./meshes.js";
import { roadMaterial, glowMaterial, shared } from "./materials.js";
import { loadTexture } from "./textures.js";
import { CUBE } from "./course.js";

const A = "assets/level1/";
const _v = new THREE.Vector3();

function signTexture(text) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 200;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 200);
  grd.addColorStop(0, "#46d86a"); grd.addColorStop(1, "#1f9a45");
  g.fillStyle = grd;
  g.beginPath(); g.roundRect(8, 8, 496, 184, 38); g.fill();
  g.lineWidth = 12; g.strokeStyle = "#e9ffe6"; g.stroke();
  g.font = "bold 118px 'Fira Sans Condensed', 'Arial Narrow', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 16; g.strokeStyle = "#0d5a2a"; g.strokeText(text, 256, 106);
  g.fillStyle = "#fff"; g.fillText(text, 256, 106);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function arrowSpriteTexture(color) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.translate(128, 128);
  g.shadowColor = color; g.shadowBlur = 30;
  g.fillStyle = "#fff";
  g.beginPath();
  g.moveTo(0, -96); g.lineTo(86, -6); g.lineTo(34, -6); g.lineTo(34, 92); g.lineTo(-34, 92); g.lineTo(-34, -6); g.lineTo(-86, -6); g.closePath();
  g.fill();
  g.lineWidth = 12; g.strokeStyle = color; g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Level {
  constructor(scene, course) {
    this.scene = scene;
    this.course = course;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.movers = [];
    for (const t of course.tiles) this._tile(t);
    for (const r of course.rails) this._rail(r);
    this.pickups = course.pickups.map((p) => this._pickup(p));
    this.props = {};
    for (const p of course.props) this._prop(p);
  }

  _tile(t) {
    let g;
    if (t.kind === "island") {
      g = makeIsland(t.radius, t.id + 3, { falls: t.falls, clearCenter: true, tree: !t.start });
      if (t.dark) g.traverse((o) => { if (o.material && o.material.color) o.material.color.setRGB(0.62, 0.52, 0.72); });
    } else if (t.kind === "pad") {
      g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.BoxGeometry(t.size.w, t.size.h, t.size.d), roadMaterial(0, 1));
      m.position.y = -t.size.h / 2;
      g.add(m);
      const glow = new THREE.Sprite(glowMaterial(0xffffff, 0.8));
      glow.scale.set(3.4, 3.4, 1);
      glow.position.y = 0.2;
      g.add(glow);
      g.userData.glow = glow;
    } else {
      const cube = t.kind === "cube";
      g = makeBlock(t.color, t.size, { allFaces: cube, symbol: t.kind === "spring" || t.route ? "arrow" : undefined,
        fallLen: cube ? 6 : 5.5 });
      if (t.fake) g.userData.mat.uniforms.uCrackOn.value = 0.55;
      if (t.kind === "spring") {
        const coil = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7affea, emissiveIntensity: 0.8 }));
        coil.rotation.x = Math.PI / 2;
        coil.position.y = 0.05;
        g.add(coil);
        g.userData.coil = coil;
      }
    }
    g.position.copy(t.base);
    g.rotation.y = t.yaw;
    this.root.add(g);
    t.obj = g;
    if (t.motion) this.movers.push(t);
  }

  _rail(r) {
    const L = r.length;
    const ranges = [];
    let s0 = 0;
    for (const [a, b] of r.gaps) { ranges.push([s0, a]); s0 = b; }
    ranges.push([s0, L]);
    r.obj = makeRoad(r.curve, r.width, r.mode, r.lanes, ranges);
    this.root.add(r.obj);
    // glowing lips at the edges of each gap
    for (const [a, b] of r.gaps) for (const s of [a, b]) {
      const f = r.frame(s);
      const lip = new THREE.Sprite(glowMaterial(0xff9a30, 0.9));
      lip.scale.set(r.width * 1.1, 0.9, 1);
      lip.position.copy(f.p).add(new THREE.Vector3(0, 0.1, 0));
      this.root.add(lip);
    }
  }

  _pickup(p) {
    let o;
    if (p.type === "coin") { o = makeCoin(); o.scale.setScalar(1.05); }
    else if (p.type === "ring") { o = makeRing(); o.rotation.y = p.yaw || 0; }
    else o = makeGem(p.color || "purple", p.big ? 0.95 : 0.55);
    o.position.copy(p.pos);
    this.root.add(o);
    return { ...p, obj: o, taken: false, t: 0, ph: Math.random() * 6 };
  }

  _prop(p) {
    if (p.type === "sign") {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 }));
      post.position.y = 0.8;
      g.add(post);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.5), new THREE.MeshBasicMaterial({ map: signTexture("START"), transparent: true, side: THREE.DoubleSide }));
      board.position.y = 1.55;
      board.rotation.y = Math.PI;
      g.add(board);
      g.position.copy(p.pos);
      g.rotation.y = p.yaw + 0.35;
      this.root.add(g);
    } else if (p.type === "tower") {
      const m = new THREE.SpriteMaterial({ map: loadTexture(A + "3d/tower.webp"), transparent: true, depthWrite: false, fog: true, alphaTest: 0.03 });
      const s = new THREE.Sprite(m);
      s.center.set(0.5, 0.0);
      s.scale.set(28 * 0.539, 28, 1);
      s.position.copy(p.pos);
      this.root.add(s);
    } else if (p.type === "gate") {
      const g = new THREE.Group();
      const m = new THREE.SpriteMaterial({ map: loadTexture(A + "gate.webp"), transparent: true, depthWrite: false, fog: false });
      const s = new THREE.Sprite(m);
      s.center.set(0.5, 0.06);
      const H = 17;
      s.scale.set(H * 856 / 1100, H, 1);
      g.add(s);
      // a glowing portal in the arch, and light pouring out of it
      const portal = new THREE.Sprite(glowMaterial(0xbfe8ff, 0.9));
      portal.scale.set(8, 10, 1);
      portal.position.set(0, 5.2, 0.4);
      g.add(portal);
      const halo = new THREE.Sprite(glowMaterial(0xffe6ff, 0.55));
      halo.scale.set(22, 22, 1);
      halo.position.set(0, 7, -0.5);
      g.add(halo);
      g.position.copy(p.pos).add(new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)).multiplyScalar(1.5));
      g.position.y -= 0.6;
      this.root.add(g);
      this.props.gate = { g, portal, halo, pos: p.pos.clone(), yaw: p.yaw };
    } else if (p.type === "arrowSign") {
      const col = p.color === "ice" ? "#2f9bff" : "#ffb020";
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: arrowSpriteTexture(col), transparent: true, depthWrite: false }));
      s.scale.set(1.5, 1.5, 1);
      s.position.copy(p.pos).add(new THREE.Vector3(0, 1.9, 0));
      this.root.add(s);
      (this.props.arrows || (this.props.arrows = [])).push(s);
    } else if (p.type === "orb") {
      this.props.orbPos = p.pos.clone();
    } else if (p.type === "cloud") {
      this.props.cloudRail = p.rail;
    }
  }

  /** Live pose of a tile at time t (seconds); updates tile.pos / tile.solid / tile.angle. */
  poseTile(tile, t) {
    const m = tile.motion;
    if (!m) return;
    const g = tile.obj;
    const R = _v.set(-Math.cos(tile.yaw), 0, Math.sin(tile.yaw));
    if (m.type === "slide") {
      const x = Math.sin((t / m.period + m.phase) * Math.PI * 2) * m.amp;
      tile.pos.copy(tile.base).addScaledVector(R, x);
      tile.offset = x;
      g.position.copy(tile.pos);
    } else if (m.type === "sink") {
      // up for most of the period, then drops into the clouds and comes back
      const u = ((t / m.period + m.phase) % 1 + 1) % 1;
      const d = u < 0.55 ? 0 : u < 0.72 ? THREE.MathUtils.smoothstep(u, 0.55, 0.72) : u < 0.86 ? 1 : 1 - THREE.MathUtils.smoothstep(u, 0.86, 1.0);
      tile.pos.copy(tile.base).y -= d * m.depth;
      tile.sunk = d;
      g.position.copy(tile.pos);
      g.userData.mat.uniforms.uGlow.value = u > 0.45 && u < 0.55 ? 0.6 * Math.sin((u - 0.45) / 0.1 * Math.PI * 4) ** 2 : 0;
    } else if (m.type === "roll" || m.type === "flip") {
      // rolls a quarter turn (cubes) or flips all the way round (flip blocks), then rests flat
      if (tile.hold > t) { tile.angle = tile.angleRest || 0; return; }
      const u = (((t - (tile.holdShift || 0)) / m.period + m.phase) % 1 + 1) % 1;
      const rest = m.flat / m.period;
      const turn = m.type === "roll" ? Math.PI / 2 : Math.PI * 2;
      const k = u < rest ? 0 : THREE.MathUtils.smootherstep(u, rest, 1);
      const cycles = Math.floor((t - (tile.holdShift || 0)) / m.period + m.phase);
      const a = (m.type === "roll" ? cycles * turn : 0) + k * turn;
      tile.angle = a;
      tile.moving = k > 0.001 && k < 0.999;
      tile.warn = u > rest - 0.55 / m.period && u < rest;
      const mesh = g.userData.mesh;
      if (m.type === "roll") mesh.rotation.z = a; else mesh.rotation.x = a;
      g.userData.mat.uniforms.uGlow.value = tile.warn ? 0.5 + 0.5 * Math.sin(t * 30) : 0;
      if (m.type === "flip") {
        // flip around the block's middle
        mesh.position.set(0, -tile.size.h / 2, 0);
      }
    }
  }

  /** Is the tile safe to stand on right now? */
  solidNow(tile) {
    if (tile.gone) return false;
    const m = tile.motion;
    if (!m) return true;
    if (m.type === "sink") return (tile.sunk || 0) < 0.12;
    if (m.type === "roll" || m.type === "flip") return !tile.moving;
    return true;
  }

  update(dt, t, boyPos) {
    for (const tile of this.movers) this.poseTile(tile, t);
    for (const p of this.pickups) {
      if (p.taken) {
        if (p.t < 1) {
          p.t += dt * 3.2;
          p.obj.scale.setScalar((p.type === "gem" ? (p.big ? 0.95 : 0.55) : 1) * (1 + p.t * 0.8));
          p.obj.position.y += dt * 3;
          p.obj.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = Math.max(0, 1 - p.t); } });
          if (p.t >= 1) p.obj.visible = false;
        }
        continue;
      }
      const o = p.obj;
      if (p.type === "coin") o.rotation.y = t * 3.2 + p.ph;
      else if (p.type === "ring") o.rotation.y = (p.yaw || 0) + Math.sin(t * 0.8 + p.ph) * 0.35;
      else { o.rotation.y = t * 1.3 + p.ph; o.position.y = p.pos.y + Math.sin(t * 2 + p.ph) * 0.12; }
    }
    if (this.props.gate) {
      const G = this.props.gate;
      const k = 0.85 + 0.15 * Math.sin(t * 2.3);
      G.portal.material.opacity = k;
      G.halo.material.opacity = 0.4 + 0.15 * Math.sin(t * 1.3);
    }
    if (this.props.arrows) for (const a of this.props.arrows) a.position.y += Math.sin(t * 3) * 0.004;
    for (const tile of this.course.tiles) {
      if (tile.kind === "pad" && tile.obj.userData.glow) tile.obj.userData.glow.material.opacity = 0.55 + 0.3 * Math.sin(t * 4);
      if (tile.kind === "spring" && tile.obj.userData.coil) tile.obj.userData.coil.position.y = 0.06 + Math.abs(Math.sin(t * 3)) * 0.12;
      if (tile.fake && !tile.gone) {
        // fake blocks flicker out now and then: "they disappear"
        const f = Math.sin(t * 1.7 + tile.id) > 0.93 ? 0.35 : 1;
        tile.obj.userData.mat.uniforms.uOpacity.value = f;
        tile.obj.userData.mat.transparent = f < 1;
      }
    }
    void boyPos;
  }

  resetSection(section) {
    for (const t of this.course.tiles) if (t.section === section && t.gone) {
      t.gone = false;
      t.obj.visible = true;
      t.obj.position.copy(t.base);
      t.obj.rotation.set(0, t.yaw, 0);
      t.obj.userData.mesh.rotation.set(0, 0, 0);
    }
  }
}

export { CUBE };
