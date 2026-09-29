// Small synthesized sound effects (Web Audio), so the game has feedback without sound files.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }
  _ctx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }
  unlock() { this._ctx(); }
  tone(f0, f1, dur, type = "sine", vol = 0.12, delay = 0) {
    const c = this._ctx();
    if (!c || !this.on) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  play(name) {
    switch (name) {
      case "jump": this.tone(320, 620, 0.16, "triangle", 0.09); break;
      case "spring": this.tone(220, 900, 0.35, "triangle", 0.1); break;
      case "land": this.tone(180, 90, 0.08, "sine", 0.08); break;
      case "coin": this.tone(1320, 1320, 0.07, "square", 0.04); this.tone(1760, 1760, 0.12, "square", 0.04, 0.06); break;
      case "gem": this.tone(880, 1760, 0.18, "sine", 0.08); break;
      case "ring": this.tone(660, 1320, 0.22, "triangle", 0.08); break;
      case "ding": this.tone(988, 988, 0.1, "sine", 0.09); this.tone(1319, 1319, 0.18, "sine", 0.08, 0.08); break;
      case "wrong": this.tone(200, 140, 0.25, "sawtooth", 0.06); break;
      case "nope": this.tone(160, 150, 0.1, "square", 0.03); break;
      case "crack": this.tone(300, 60, 0.3, "sawtooth", 0.07); break;
      case "fall": this.tone(700, 120, 0.7, "sine", 0.08); break;
      case "hit": this.tone(140, 60, 0.35, "sawtooth", 0.1); break;
      case "swish": this.tone(500, 900, 0.1, "sine", 0.04); break;
      case "secret": [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, f, 0.16, "triangle", 0.07, i * 0.09)); break;
      case "gate": this.tone(400, 1600, 1.0, "sine", 0.08); break;
      case "win": [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.25, "triangle", 0.08, i * 0.12)); break;
    }
  }
}
