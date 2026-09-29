// The HUD over the 3D view, laid out like the reference screens: pause button, timer and coin
// counter along the top (plus gems and hearts), the colour-sequence panel during section 1, and
// the instruction banner at the bottom that tells you what each section is about.
import { SECTIONS, SEQ } from "./course.js";

const A = "assets/level1/";
const $ = (id) => document.getElementById(id);
const num = (v) => Number(v).toLocaleString("en-US");
const fmt = (s) => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };

export class Hud {
  constructor(handlers) {
    this.h = handlers;
    this.section = -1;
    this.sayUntil = 0;
    this.last = {};
    // colour orbs
    const orbs = $("seqOrbs");
    SEQ.slice(0, 6).forEach((c, i) => {
      if (i) { const a = document.createElement("i"); a.className = "arrow"; orbs.appendChild(a); }
      const o = document.createElement("img");
      o.src = A + "orb_" + c + ".webp";
      o.alt = c;
      o.className = "orb";
      orbs.appendChild(o);
    });
    this.orbs = Array.from(orbs.querySelectorAll(".orb"));
    for (const [id, cmd] of [["btnPause", "pause"]]) $(id).addEventListener("click", () => this.h[cmd]());
    document.querySelectorAll("[data-cmd]").forEach((b) => b.addEventListener("click", () => this.h[b.dataset.cmd] && this.h[b.dataset.cmd]()));
    document.querySelectorAll(".btn, .mbtn").forEach((b) => {
      b.addEventListener("pointerdown", () => b.classList.add("pressed"));
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, () => b.classList.remove("pressed"));
    });
    this.setSection(0, true);
  }

  _banner(lines, icon, icon2) {
    const b = $("banner");
    $("bannerIcon").hidden = !icon;
    if (icon) $("bannerIcon").src = A + icon + ".webp";
    $("bannerIcon2").hidden = !icon2;
    if (icon2) $("bannerIcon2").src = A + icon2 + ".webp";
    $("bannerL1").textContent = lines[0];
    $("bannerL2").textContent = lines[1] || "";
    $("bannerL2").hidden = !lines[1];
    b.classList.toggle("two", !!lines[1]);
    b.classList.remove("pop");
    void b.offsetWidth;
    b.classList.add("pop");
  }

  setSection(s, first) {
    this.section = s;
    const S = SECTIONS[s];
    this._banner(S.say, S.icon, S.icon2);
    $("seq").classList.toggle("show", s === 0);
    document.body.dataset.section = S.key;
    if (first && s > 0) {
      const c = $("sectionCard");
      $("sectionNum").textContent = `${s + 1} / 8`;
      $("sectionTitle").textContent = S.title;
      c.classList.remove("show");
      void c.offsetWidth;
      c.classList.add("show");
    }
  }

  say(lines, icon, sec) {
    this._banner(lines, icon);
    this.sayUntil = sec ? performance.now() + sec * 1000 : 0;
    this.saying = !!sec;
  }

  toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove("show"), 1800);
  }

  bump(type) {
    const el = type === "coin" ? $("pillCoins") : type === "gem" ? $("pillGems") : $("pillTokens");
    if (!el) return;
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  update(g) {
    if (this.saying && performance.now() > this.sayUntil) { this.saying = false; this.setSection(this.section, false); }
    const set = (id, v) => { if (this.last[id] !== v) { this.last[id] = v; $(id).textContent = v; } };
    set("time", fmt(g.elapsed));
    set("coins", num(g.coins * 10));
    set("gems", num(g.gems));
    set("tokens", num(g.tokens));
    if (this.last.hearts !== g.hearts) {
      this.last.hearts = g.hearts;
      $("hearts").querySelectorAll("i").forEach((h, i) => h.classList.toggle("off", i >= g.hearts));
    }
    if (g.section === 0) {
      const step = g.seqStep;
      set("seqCount", `${Math.min(step, 7)}/7`);
      if (this.last.step !== step) {
        this.last.step = step;
        // red, yellow, blue, green, purple, pink, then red once more
        this.orbs.forEach((o, i) => {
          o.classList.toggle("next", step < 7 && (step < 6 ? i === step : i === 0));
          o.classList.toggle("done", step >= 7 || (step < 6 ? i < step : i > 0));
        });
      }
    }
  }

  showPause(on) { $("pause").hidden = !on; }
  showOver(on) { $("over").hidden = !on; }

  showComplete(r) {
    const rows = $("rows");
    rows.innerHTML = "";
    [[A + "hud_coin.webp", "Coins", "+" + num(r.coins)],
     [A + "hud_gem.webp", "Gems", "+" + num(r.gems * 5)],
     [A + "ring.webp", "Tokens", "+" + num(r.tokens * 5)],
     [A + "star_2.webp", "Perfect Bonus", r.perfect ? "+" + r.perfect : "—"],
     [A + "gem_purple.webp", "Secret Discovery", r.secret ? "+1" : "0"]].forEach(([src, label, v]) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<img src="${src}" alt=""><span></span><span class="v"></span>`;
      row.children[1].textContent = label;
      row.children[2].textContent = v;
      rows.appendChild(row);
    });
    $("doneTime").textContent = "Time " + fmt(r.time);
    const d = $("done");
    d.hidden = false;
    requestAnimationFrame(() => d.classList.add("show"));
    [1, 2, 3].forEach((i) => setTimeout(() => $("star" + i).classList.add(i <= r.stars ? "on" : "dim"), 450 + i * 280));
    Array.from(rows.children).forEach((row, i) => setTimeout(() => row.classList.add("on"), 1300 + i * 160));
    $("hud").classList.add("fade");
  }
}
