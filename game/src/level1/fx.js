// Little effects: sparkle bursts, blocks shattering, screen flashes, the white-out at the gate.
import * as THREE from "three";
import { getGlowTexture, PALETTE } from "./materials.js";
import { sparkleTexture } from "./textures.js";

export class Fx {
  constructor(scene, overlayEl) {
    this.scene = scene;
    this.el = overlayEl;
    this.parts = [];
    this.sparkTex = sparkleTexture();
    this.glowTex = getGlowTexture();
    this.debris = [];
  }

  pop(pos, color = 0xffffff, n = 14) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
      const a = Math.random() * Math.PI * 2, u = Math.random();
      const v = new THREE.Vector3(Math.cos(a) * (1.5 + u * 2), 2.5 + Math.random() * 2.5, Math.sin(a) * (1.5 + u * 2));
      s.scale.setScalar(0.35 + Math.random() * 0.3);
      this.scene.add(s);
      this.parts.push({ o: s, v, t: 0, life: 0.6 + Math.random() * 0.3, g: 6 });
    }
  }

  shatter(obj, colorKey) {
    const P = PALETTE[colorKey] || PALETTE.stone;
    const mat = new THREE.MeshStandardMaterial({ color: P.color, emissive: P.deep, emissiveIntensity: 0.4, roughness: 0.6, transparent: true });
    const origin = obj.position.clone();
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3 + Math.random() * 0.35, 0.3 + Math.random() * 0.35, 0.3 + Math.random() * 0.35), mat.clone());
      m.position.copy(origin).add(new THREE.Vector3((Math.random() - 0.5) * 1.4, -Math.random() * 1.2, (Math.random() - 0.5) * 1.4));
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3);
      this.scene.add(m);
      this.parts.push({ o: m, v, t: 0, life: 1.4, g: 16, spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) });
    }
    this.pop(origin, 0xff9ae8, 10);
  }

  flash(css) {
    const f = document.createElement("div");
    f.className = "flash";
    f.style.background = css;
    this.el.appendChild(f);
    requestAnimationFrame(() => { f.style.opacity = "0"; });
    setTimeout(() => f.remove(), 700);
  }

  whiteout(k) {
    let w = this.el.querySelector(".whiteout");
    if (!w) { w = document.createElement("div"); w.className = "whiteout"; this.el.appendChild(w); }
    w.style.opacity = String(k);
  }

  clearWhiteout() { const w = this.el.querySelector(".whiteout"); if (w) w.remove(); }

  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      p.v.y -= p.g * dt;
      p.o.position.addScaledVector(p.v, dt);
      if (p.spin) { p.o.rotation.x += p.spin.x * dt; p.o.rotation.y += p.spin.y * dt; }
      const k = 1 - p.t / p.life;
      p.o.material.opacity = Math.max(0, Math.min(1, k * 1.5));
      if (p.t >= p.life) { this.scene.remove(p.o); p.o.material.dispose(); if (p.o.geometry && !p.o.isSprite) p.o.geometry.dispose(); p.dead = true; }
    }
    this.parts = this.parts.filter((p) => !p.dead);
  }
}
