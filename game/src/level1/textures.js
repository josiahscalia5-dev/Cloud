// Canvas-drawn textures: block symbols, glows, sparkles, road decals. Drawn at start-up so they
// stay crisp at any screen size and cost nothing to download.
import * as THREE from "three";

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

function tex(c, { srgb = true, repeat = false, mips = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

/** White symbols on transparent, one per block colour, as on the painted blocks. */
export function symbolTexture(kind) {
  const S = 256;
  const [c, g] = canvas(S);
  g.translate(S / 2, S / 2);
  g.fillStyle = "#fff";
  g.shadowColor = "rgba(255,255,255,0.9)";
  g.shadowBlur = 10;
  const r = S * 0.26;
  g.beginPath();
  if (kind === "flower") {                       // four round petals (the clover on the red / green blocks)
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      g.moveTo(Math.cos(a) * r * 0.55 + r * 0.5, Math.sin(a) * r * 0.55);
      g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.5, 0, Math.PI * 2);
    }
    g.moveTo(r * 0.35, 0); g.arc(0, 0, r * 0.35, 0, Math.PI * 2);
  } else if (kind === "circle") {
    g.arc(0, 0, r * 0.95, 0, Math.PI * 2);
  } else if (kind === "triangle") {
    g.moveTo(0, -r * 1.0); g.lineTo(r * 1.05, r * 0.75); g.lineTo(-r * 1.05, r * 0.75); g.closePath();
  } else if (kind === "club") {
    for (const [x, y] of [[0, -0.45], [-0.45, 0.12], [0.45, 0.12]]) { g.moveTo(x * r + r * 0.48, y * r); g.arc(x * r, y * r, r * 0.48, 0, Math.PI * 2); }
    g.moveTo(-r * 0.14, 0); g.lineTo(r * 0.14, 0); g.lineTo(r * 0.3, r * 0.95); g.lineTo(-r * 0.3, r * 0.95); g.closePath();
  } else if (kind === "star" || kind === "star4") {
    const n = kind === "star" ? 5 : 4, ri = kind === "star" ? 0.45 : 0.32;
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * ri : r * 1.05;
      i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  } else if (kind === "heart") {
    g.moveTo(0, r * 0.95);
    g.bezierCurveTo(-r * 1.3, 0, -r * 0.9, -r * 1.05, 0, -r * 0.45);
    g.bezierCurveTo(r * 0.9, -r * 1.05, r * 1.3, 0, 0, r * 0.95);
  } else if (kind === "arrow") {
    g.moveTo(0, -r * 1.1); g.lineTo(r * 0.95, 0); g.lineTo(r * 0.38, 0); g.lineTo(r * 0.38, r); g.lineTo(-r * 0.38, r);
    g.lineTo(-r * 0.38, 0); g.lineTo(-r * 0.95, 0); g.closePath();
  } else if (kind === "cross") {
    const w = r * 0.32;
    g.rect(-w, -r, w * 2, r * 2); g.rect(-r, -w, r * 2, w * 2);
  }
  g.fill("nonzero");
  return tex(c, { srgb: false });
}

/** Soft radial glow (white, alpha falls off), for additive halos. */
export function glowTexture() {
  const S = 128;
  const [c, g] = canvas(S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.14)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return tex(c, { srgb: false });
}

/** Four-point twinkle star for sparkles. */
export function sparkleTexture() {
  const S = 128;
  const [c, g] = canvas(S);
  g.translate(S / 2, S / 2);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.18);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(-S / 2, -S / 2, S, S);
  g.fillStyle = "rgba(255,255,255,0.95)";
  for (let i = 0; i < 4; i++) {
    g.rotate(Math.PI / 2);
    g.beginPath(); g.moveTo(0, -S * 0.46); g.quadraticCurveTo(S * 0.035, -S * 0.04, 0, 0); g.quadraticCurveTo(-S * 0.035, -S * 0.04, 0, -S * 0.46); g.fill();
  }
  return tex(c, { srgb: false });
}

/** Vertical light streaks that fall from the blocks into the clouds. */
export function lightfallTexture() {
  const W = 128, H = 256;
  const [c, g] = canvas(W, H);
  const rnd = mul(3);
  for (let i = 0; i < 22; i++) {
    const x = rnd() * W, w = 2 + rnd() * 9, len = H * (0.35 + rnd() * 0.65);
    const grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(255,255,255,${0.5 + rnd() * 0.5})`);
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(x - w / 2, 0, w, len);
  }
  // fade out at the sides
  const img = g.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = Math.sin(Math.PI * x / W);
    img.data[(y * W + x) * 4 + 3] *= k;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

/** Warning ring painted on the road where a strike will land. */
export function targetTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  g.translate(S / 2, S / 2);
  g.strokeStyle = "rgba(255,255,255,1)";
  g.lineWidth = 14;
  g.beginPath(); g.arc(0, 0, S * 0.4, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 8;
  g.beginPath(); g.arc(0, 0, S * 0.24, 0, Math.PI * 2); g.stroke();
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.45);
  grd.addColorStop(0, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath(); g.arc(0, 0, S * 0.45, 0, Math.PI * 2); g.fill();
  return tex(c, { srgb: false });
}

/** A crack pattern for fake stone blocks. */
export function crackTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  const rnd = mul(11);
  g.strokeStyle = "rgba(255,255,255,1)";
  g.lineCap = "round";
  for (let k = 0; k < 5; k++) {
    let x = S / 2 + (rnd() - 0.5) * 40, y = S / 2 + (rnd() - 0.5) * 40;
    const a0 = rnd() * Math.PI * 2;
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      const a = a0 + (rnd() - 0.5) * 1.2;
      x += Math.cos(a) * 22; y += Math.sin(a) * 22;
      g.lineTo(x, y);
      g.lineWidth = Math.max(1.5, 5 - i * 0.7);
    }
    g.stroke();
  }
  return tex(c, { srgb: false });
}

export function mul(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loads an image file into a texture (sRGB, mipmapped). */
export function loadTexture(url, onLoad) {
  const t = new THREE.TextureLoader().load(url, onLoad);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
