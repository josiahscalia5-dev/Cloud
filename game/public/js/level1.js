/*
 * Rainbow Cascades - Level 1: Follow the Color Sequence.
 *
 * Everything is placed in "art pixels" (A): the pixel grid of the Level 1 direction image
 * (941 x 1672). One A is `u` CSS pixels, chosen so the art's width fits the phone. The top bar
 * and the sequence panel hang from the top safe area; the art (and the path drawn over it)
 * sits on the bottom safe area, so taller phones show more sky, as on the home screen.
 *
 * The path is drawn on a canvas in pseudo-3D: rows of jelly blocks at even depths, seen by a
 * camera that follows the boy. A block at depth d is drawn at scale s = 1/d; its screen place
 * follows the road of the direction image (bottom centre -> up and right to the Rainbow Gate).
 * Each row has the next colour of the sequence and one or two other colours. Tap the right
 * block to hop onto it; a wrong block bounces the boy back. Six colours, then the rainbow step
 * and the gate.
 */
(function () {
  "use strict";

  var A = "assets/level1/";
  var ART_W = 941, ART_H = 1672;
  var BG = { top: -400, rows: 2192 };       // bg_level1.webp: first row (A), height (A)

  // Top group, hangs from the top safe area. Boxes in A: [x0, y0, x1, y1].
  var TOP = {
    lvlBand: [62, 20, 228, 83],
    avatar: [8, 8, 102, 102],
    lvlText: [114, 23, 214, 55],
    xp: [105, 58, 217, 76],
    timePill: [280, 21, 470, 80],
    timeText: [322, 22, 466, 80],
    watchIcon: [257.5, 14.25, 316, 84.5],
    coinPill: [506, 21, 665, 82],
    coinText: [552, 22, 662, 82],
    coinIcon: [489.75, 22.75, 551.5, 84.5],
    gemPill: [700, 21, 838, 80],
    gemText: [744, 22, 834, 80],
    gemIcon: [679.25, 15.25, 747, 93],
    pauseBtn: [852, 14, 932.25, 94.25],
    seqPanel: [146, 110, 795, 256]
  };
  // Pinned to the art (bottom group).
  var ART = { banner: [116, 1523, 826, 1610], fgBush: [0, 1378.75, 230, 1672] };
  // Inside the sequence panel (A, relative to the panel's top-left corner).
  var ORB_X = [59, 155, 248, 341.5, 434, 526.5], ORB_Y = 101.5, ARROW_X = [107, 202, 295, 388, 480];
  var COUNT_XY = [606, 101];

  // --- the level --------------------------------------------------------------------------
  var SEQ = ["red", "yellow", "blue", "green", "purple", "pink"];
  var NAME = { red: "Red", yellow: "Yellow", blue: "Blue", green: "Green", purple: "Purple", pink: "Pink", rainbow: "Rainbow" };
  var TEXT_COL = { red: "#ff5d6c", yellow: "#ffe14a", blue: "#4fc0ff", green: "#5cf07e", purple: "#c07bff", pink: "#ff7ae2" };
  var SPARK = { red: "255,90,110", yellow: "255,225,80", blue: "90,190,255", green: "100,255,140", purple: "200,120,255", pink: "255,120,230", rainbow: "255,255,255" };
  // Lanes of each row (in block widths); row 0 is the start step, rows 7-9 the rainbow steps.
  var ROWS = [[0], [-0.56, 0.56], [-0.56, 0.56], [-1.08, 0, 1.08], [-0.56, 0.56], [-1.08, 0, 1.08], [-1.08, 0, 1.08], [0], [0], [0]];
  var WANDER = [0, 0.12, -0.14, 0, 0.16, -0.1, 0, 0.05, 0.02, 0];
  var PICKUPS = { 1: "coin", 2: "coin", 3: "gem", 4: "coin", 5: "coin", 6: "gem" };
  var GATE_STEP = 7, LAST_ROW = 9, AHEAD = 3;     // rows further than AHEAD rise out of the clouds later
  var HOVER = 112;          // height of coins and gems above their block (A at depth 1)
  var COIN_VALUE = 10, GEM_VALUE = 1, LEVEL_COINS = 100, PERFECT_COINS = 100;

  // --- projection (A) ---------------------------------------------------------------------
  var ROW_D = 0.52;          // depth between rows
  var BOY_D = 1;             // depth of the boy in front of the camera
  var PW = 330;              // top-face width of a block at depth 1
  var LANE = 1.12;           // lane spacing, in block widths
  var GATE_S0 = 0.15;        // gate's scale at the start (its place in the art)
  function yAt(s) { return s >= 0.24 ? 387 + 1013 * s : 598 + 32 * Math.pow(Math.max(0, (s - 0.1) / 0.14), 4.43); }
  function xcAt(s) { return s >= 1 ? 470 - 269.5 * (s - 1) : s <= 0.2 ? 778 : 778 - 308 * Math.pow((s - 0.2) / 0.8, 0.7); }
  function stretch(s) { return 1 + 0.22 * Math.min(1, Math.max(0, (s - 0.25) / 0.75)); }

  // --- state ------------------------------------------------------------------------------
  var screen = document.getElementById("screen");
  var canvas = document.getElementById("world");
  var ctx = canvas.getContext("2d");
  var img = {}, meta = {};
  var L = { u: 1, x0: 0, artTop: 0, safe: { top: 0, bottom: 0 }, W: 0, H: 0, dpr: 1 };
  var profile = window.RCProfile ? RCProfile.load() : { level: 16, xp: 0.94, coins: 12450, gems: 320, best: {} };
  var plats, pickups, particles, flyers, row, cur, cam, boy, jump, st, gateZ, camZ0, camZEnd;
  var orbEls = [], checkEls = [];
  var last = 0, clock = 0, paused = false, running = false, gen = 0;   // gen: bumps on restart

  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t * t * (3 - 2 * t); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v) { return Number(v).toLocaleString("en-US"); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function mmss(t) {
    var s = Math.floor(t), m = Math.floor(s / 60);
    return (m < 10 ? "0" : "") + m + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  // --- level setup ------------------------------------------------------------------------
  function build() {
    gen++;
    plats = []; pickups = []; particles = []; flyers = [];
    for (var r = 0; r < ROWS.length; r++) {
      var lanes = ROWS[r], target = r >= 1 && r <= 6 ? SEQ[r - 1] : "rainbow";
      var right = Math.floor(Math.random() * lanes.length);
      var others = shuffle(SEQ.filter(function (c) { return c !== target; }));
      for (var i = 0; i < lanes.length; i++) {
        var p = {
          row: r, X: lanes[i] + WANDER[r], z: r * ROW_D, color: i === right ? target : others.pop(),
          ok: i === right, state: "idle", sq: 0, sv: 0, alpha: 1, fall: 0, grey: 0, glow: 0,
          rise: r <= AHEAD || r >= GATE_STEP ? 1 : 0, phase: Math.random() * 6.3
        };
        plats.push(p);
        if (p.ok && PICKUPS[r]) pickups.push({ kind: PICKUPS[r], plat: p, phase: Math.random() * 6.3, taken: false });
      }
    }
    row = 0;
    cur = plats[0];
    gateZ = 1 / GATE_S0 - BOY_D;
    boy = { X: cur.X, z: cur.z, h: 0, face: 1, sq: 0, sv: 0, bob: 0, alpha: 1, scale: 1 };
    cam = { z: cur.z - BOY_D, x: 0 };
    camZ0 = cam.z;
    camZEnd = (LAST_ROW * ROW_D) - BOY_D;
    jump = null;
    st = { mode: "ready", step: 1, mistakes: 0, coins: 0, gems: 0, time: 0, timing: false, idle: 0, wait: 0 };
    orbEls.forEach(function (o) { o.className = "orb"; });
    checkEls.forEach(function (c) { c.className = "check"; });
    markNextOrb();
    document.getElementById("step").textContent = "1";
    document.getElementById("seqCount").classList.remove("done");
    document.getElementById("fgBush").style.transform = "";
    document.getElementById("flash").classList.remove("on");
    document.getElementById("complete").hidden = true;
    setBanner("Jump on the matching colors in order!");
    renderHud();
  }

  // --- layout -----------------------------------------------------------------------------
  function readSafeArea() {
    var q = new URLSearchParams(location.search);
    var probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0";
    document.body.appendChild(probe);
    var cs = getComputedStyle(probe);
    var s = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
    probe.remove();
    var injected = window.__RC_SAFE_AREA;              // set by the Android shell
    if (injected) { s.top = injected.top; s.bottom = injected.bottom; }
    if (q.has("safeTop")) s.top = +q.get("safeTop");
    if (q.has("safeBottom")) s.bottom = +q.get("safeBottom");
    return s;
  }

  function box(el, b, x, y, u) {
    el.style.left = x(b[0]) + "px";
    el.style.top = y(b[1]) + "px";
    el.style.width = (b[2] - b[0]) * u + "px";
    el.style.height = (b[3] - b[1]) * u + "px";
  }

  function layout() {
    var W = window.innerWidth, H = window.innerHeight, safe = readSafeArea();
    var u = Math.min(W / ART_W, (H - safe.top - safe.bottom) / 1700);
    var x0 = (W - ART_W * u) / 2;
    var artTop = H - safe.bottom - ART_H * u;
    L = { u: u, x0: x0, artTop: artTop, safe: safe, W: W, H: H, dpr: Math.min(window.devicePixelRatio || 1, 2.5) };
    document.documentElement.style.setProperty("--u", u + "px");
    screen.classList.toggle("wide", ART_W * u < W - 1);

    var sx = function (a) { return x0 + a * u; };
    var ty = function (a) { return safe.top + a * u; };
    var ay = function (a) { return artTop + a * u; };
    Object.keys(TOP).forEach(function (id) { box(document.getElementById(id), TOP[id], sx, ty, u); });
    Object.keys(ART).forEach(function (id) { box(document.getElementById(id), ART[id], sx, ay, u); });

    var bg = document.getElementById("bg");
    box(bg, [0, BG.top, ART_W, BG.top + BG.rows], sx, ay, u);

    orbEls.forEach(function (o, i) { o.style.left = (ORB_X[i] - 34) * u + "px"; o.style.top = (ORB_Y - 34) * u + "px"; });
    checkEls.forEach(function (c, i) { c.style.left = (ORB_X[i] + 8) * u + "px"; c.style.top = (ORB_Y + 4) * u + "px"; });
    document.querySelectorAll(".arrow").forEach(function (a, i) {
      a.style.left = (ARROW_X[i] - 2) * u + "px"; a.style.top = (ORB_Y - 9) * u + "px";
    });
    var cnt = document.getElementById("seqCount");
    cnt.style.left = COUNT_XY[0] * u + "px"; cnt.style.top = COUNT_XY[1] * u + "px";

    fitBanner();
    canvas.width = Math.round(W * L.dpr);
    canvas.height = Math.round(H * L.dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    layoutCard();
  }

  // HUD point (A, top group) -> art coordinates, for things flying into the top bar
  function hudPoint(b) {
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    return { x: cx, y: (L.safe.top + cy * L.u - L.artTop) / L.u };
  }

  // --- sequence panel ---------------------------------------------------------------------
  function buildPanel() {
    var panel = document.getElementById("seqPanel");
    SEQ.forEach(function (c, i) {
      var o = new Image();
      o.src = A + "orb_" + c + ".webp";
      o.alt = NAME[c];
      o.className = "orb";
      o.draggable = false;
      panel.appendChild(o);
      orbEls.push(o);
      var k = document.createElement("div");
      k.className = "check";
      k.innerHTML = '<svg viewBox="0 0 34 34" width="100%" height="100%"><circle cx="17" cy="17" r="15.5" fill="#20c24a" stroke="#fff" stroke-width="3"/>' +
        '<path d="M9.5 17.5l5 5 10-11" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      panel.appendChild(k);
      checkEls.push(k);
      if (i < SEQ.length - 1) {
        var a = document.createElement("div");
        a.className = "arrow";
        panel.appendChild(a);
      }
    });
  }

  function markNextOrb() {
    orbEls.forEach(function (o, i) { o.classList.toggle("next", i === st.step - 1); });
  }

  var bannerTimer = 0;
  function setBanner(html) {
    var t = document.getElementById("bannerText");
    if (t.innerHTML === html) return;
    t.classList.add("swap");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { t.innerHTML = html; fitBanner(); t.classList.remove("swap"); }, 150);
  }
  // one line: shrink the text when a message is longer than the banner
  function fitBanner() {
    var t = document.getElementById("bannerText"), b = document.getElementById("banner");
    t.style.fontSize = "";
    t.style.whiteSpace = "nowrap";
    var room = b.clientWidth * 0.94, need = t.scrollWidth;
    if (need > room) t.style.fontSize = (44 * L.u * room / need) + "px";
  }
  function colourWord(c) {
    return c === "rainbow" ? '<b class="rainbowText">Rainbow</b>' : '<b style="color:' + TEXT_COL[c] + '">' + NAME[c] + "</b>";
  }

  function renderHud() {
    document.getElementById("lvl").textContent = profile.level;
    document.getElementById("xpFill").style.width = Math.round(profile.xp * 100) + "%";
    document.getElementById("coinText").textContent = num(profile.coins + st.coins);
    document.getElementById("gemText").textContent = num(profile.gems + st.gems);
    document.getElementById("timeText").textContent = mmss(st.time);
  }
  function pop(id) {
    var el = document.getElementById(id);
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
  }

  // --- screen positions of world things (A) -------------------------------------------------
  function project(X, z, h) {
    var d = Math.max(0.05, z - cam.z), s = 1 / d;
    return { x: xcAt(s) + (X - cam.x) * PW * LANE * s, y: yAt(s) - (h || 0) * s, s: s, d: d };
  }
  function bobOf(p) { return Math.sin(clock * 1.5 + p.phase) * 5; }
  function nextRow() { return plats.filter(function (p) { return p.row === row + 1 && p.state === "idle"; }); }

  // --- input ------------------------------------------------------------------------------
  function onTap(ev) {
    if (paused || st.mode !== "ready" || jump) return;
    var ax = (ev.clientX - L.x0) / L.u;
    var opts = nextRow();
    if (!opts.length) return;
    var best = null, bd = 1e9;
    opts.forEach(function (p) {
      var q = project(p.X, p.z, 0), dd = Math.abs(q.x - ax);
      if (dd < bd) { bd = dd; best = p; }
    });
    hop(best);
  }

  function onKey(e) {
    if (e.key === "Escape" || e.key === "p") { togglePause(); return; }
    if (paused || st.mode !== "ready" || jump) return;
    var opts = nextRow().sort(function (a, b) { return a.X - b.X; });
    if (!opts.length) return;
    var pick = null;
    if (e.key === "ArrowLeft" || e.key === "a") pick = opts[0];
    else if (e.key === "ArrowRight" || e.key === "d") pick = opts[opts.length - 1];
    else if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") pick = opts[Math.floor(opts.length / 2)];
    if (pick) { e.preventDefault(); hop(pick); }
  }

  function hop(p) {
    st.timing = true;
    st.idle = 0;
    plats.forEach(function (q) { q.glow = 0; });
    startJump(p, "go");
  }

  // --- jumps ------------------------------------------------------------------------------
  function startJump(to, kind) {
    var dx = (to ? to.X : 0) - boy.X;
    if (dx < -0.15) boy.face = -1; else if (dx > 0.15) boy.face = 1;
    jump = {
      kind: kind, t: 0, T: kind === "bounce" ? 0.46 : kind === "gate" ? 0.95 : 0.5,
      fromX: boy.X, toX: kind === "gate" ? 0 : to.X, fromZ: boy.z, toZ: kind === "gate" ? gateZ - 0.25 : to.z,
      camX0: cam.x, camX1: kind === "gate" ? 0 : to.X * 0.5, camZ0: cam.z,
      arc: kind === "bounce" ? 120 : kind === "gate" ? 260 : 175, plat: to
    };
    boy.sv = 1.6;                                    // stretch on take-off
    st.mode = "air";
  }

  function stepJump(dt) {
    var j = jump;
    j.t += dt;
    var p = Math.min(1, j.t / j.T), e = ease(p);
    boy.X = lerp(j.fromX, j.toX, e);
    boy.z = lerp(j.fromZ, j.toZ, e);
    boy.h = j.arc * 4 * p * (1 - p);
    cam.x = lerp(j.camX0, j.camX1, e);
    if (j.kind === "gate") {
      cam.z = j.camZ0 + 0.15 * e;                    // the boy flies away from the camera, into the gate
      boy.scale = 1 - 0.2 * e;
      boy.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      if (p > 0.55 && !j.flashed) { j.flashed = true; flash(); }
    } else {
      cam.z = boy.z - BOY_D;
    }
    if (p >= 1) { jump = null; land(j); }
  }

  function land(j) {
    boy.h = 0;
    var p = j.plat;
    if (j.kind === "gate") { finish(); return; }
    if (j.kind === "bounce") { boy.sv = -1.4; st.mode = "ready"; return; }
    p.sv = -2.6;
    boy.sv = -2.2;
    if (navigator.vibrate) navigator.vibrate(p.ok ? 12 : 45);
    burst(p, p.ok ? 16 : 8);
    if (!p.ok) { wrong(p); return; }

    // right colour
    plats.forEach(function (q) { if (q.row === p.row && q !== p && q.state === "idle") q.state = "sink"; });
    row = p.row;
    cur = p;
    pickups.forEach(function (k) { if (k.plat === p && !k.taken) collect(k); });
    if (row >= 1 && row <= 6) {
      orbEls[row - 1].classList.add("done");
      checkEls[row - 1].classList.add("on");
    }
    if (row === 1) document.getElementById("fgBush").style.transform = "translate(-30%, 45%)";
    if (row < GATE_STEP) {
      st.step = row + 1;
      document.getElementById("step").textContent = st.step;
      pop("seqCount");
      markNextOrb();
      if (row < 6) setBanner(pick(["Nice!", "Great!", "Awesome!", "Perfect!"]) + " Next: " + colourWord(SEQ[row]));
      else setBanner("All six colors! Hop onto the " + colourWord("rainbow") + " step!");
      st.mode = "ready";
    } else if (row === GATE_STEP) {
      document.getElementById("seqCount").classList.add("done");
      pop("seqCount");
      setBanner("Reach the Rainbow Gate!");
      st.mode = "auto";
      st.wait = 0.35;
    } else {
      st.mode = "auto";
      st.wait = 0.08;
    }
  }

  function wrong(p) {
    st.mistakes++;
    p.state = "bad";
    var target = SEQ[row];
    setBanner("Oops, that's " + colourWord(p.color) + "! Find " + colourWord(target));
    var o = orbEls[row];
    o.classList.remove("shake");
    void o.offsetWidth;
    o.classList.add("shake");
    setTimeout(function () { o.classList.remove("shake"); }, 400);
    st.mode = "stunned";
    var g = gen;
    setTimeout(function () {
      if (g !== gen) return;
      startJump(cur, "bounce");
      p.state = "sink";
    }, 230);
  }

  function autoStep() {
    if (row < LAST_ROW) startJump(plats.filter(function (q) { return q.row === row + 1; })[0], "go");
    else startJump(null, "gate");
  }

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // --- pickups & particles ----------------------------------------------------------------
  function collect(k) {
    k.taken = true;
    var q = project(k.plat.X, k.plat.z, HOVER + bobOf(k.plat));
    var target = hudPoint(k.kind === "coin" ? TOP.coinIcon : TOP.gemIcon);
    flyers.push({ kind: k.kind, x0: q.x, y0: q.y, s0: q.s, x1: target.x, y1: target.y, t: 0, T: 0.6 });
  }

  function burst(p, n) {
    var q = project(p.X, p.z, 0);
    var rgb = SPARK[p.ok ? p.color : "rainbow"];
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (80 + Math.random() * 260) * q.s;
      particles.push({
        x: q.x + Math.cos(a) * 60 * q.s, y: q.y + Math.sin(a) * 18 * q.s, vx: Math.cos(a) * v, vy: -Math.abs(Math.sin(a)) * v - 120 * q.s,
        g: 520 * q.s, life: 0, max: 0.5 + Math.random() * 0.4, size: (8 + Math.random() * 12) * q.s, rgb: rgb
      });
    }
  }

  function twinkle() {
    particles.push({ x: Math.random() * ART_W, y: 120 + Math.random() * 1300, vx: 0, vy: -8, g: 0, life: 0,
      max: 0.7 + Math.random() * 0.6, size: 6 + Math.random() * 9, rgb: "255,255,255" });
  }

  function flash() {
    var f = document.getElementById("flash");
    var q = project(0, gateZ, 180);
    f.style.setProperty("--fx", ((L.x0 + q.x * L.u) / L.W * 100) + "%");
    f.style.setProperty("--fy", ((L.artTop + q.y * L.u) / L.H * 100) + "%");
    f.classList.add("on");
  }

  // --- update -----------------------------------------------------------------------------
  function update(dt) {
    clock += dt;
    if (st.timing && st.mode !== "done") {
      var before = Math.floor(st.time);
      st.time += dt;
      if (Math.floor(st.time) !== before) document.getElementById("timeText").textContent = mmss(st.time);
    }
    if (jump) stepJump(dt);
    else if (st.mode === "auto") {
      st.wait -= dt;
      if (st.wait <= 0) autoStep();
    }

    // idle bounce on the jelly, and a hint after a while
    if (!jump && (st.mode === "ready" || st.mode === "stunned")) {
      var ph = (clock * 1.25) % 1;
      boy.h = Math.sin(ph * Math.PI) * 13;
      if (ph < 0.06 && boy.bob > 0.5) { cur.sv -= 0.5; boy.sv = -0.9; }
      boy.bob = ph;
      if (st.mode === "ready") {
        st.idle += dt;
        if (st.idle > 5) plats.forEach(function (p) { if (p.row === row + 1 && p.ok) p.glow = 0.5 + 0.5 * Math.sin(clock * 5); });
        if (st.idle > 5 && st.idle - dt <= 5 && row < 6) setBanner("Tap the " + colourWord(SEQ[row]) + " block to jump!");
      }
    }

    // springs
    boy.sv += (-140 * boy.sq - 11 * boy.sv) * dt;
    boy.sq += boy.sv * dt;
    plats.forEach(function (p) {
      if (p.row <= row + AHEAD && p.rise < 1) p.rise = Math.min(1, p.rise + dt * 2.2);
      p.sv += (-160 * p.sq - 9 * p.sv) * dt;
      p.sq += p.sv * dt;
      if (p.state === "bad") p.grey = Math.min(1, p.grey + dt * 5);
      if (p.state === "sink") {
        p.fall += dt;
        p.alpha = Math.max(0, 1 - p.fall / 0.7);
        if (p.alpha <= 0) p.state = "gone";
      }
    });

    particles.forEach(function (k) { k.life += dt; k.vy += k.g * dt; k.x += k.vx * dt; k.y += k.vy * dt; });
    particles = particles.filter(function (k) { return k.life < k.max; });
    if (Math.random() < dt * 5) twinkle();

    flyers.forEach(function (f) {
      f.t += dt;
      if (f.t >= f.T && !f.done) {
        f.done = true;
        if (f.kind === "coin") { st.coins += COIN_VALUE; pop("coinText"); } else { st.gems += GEM_VALUE; pop("gemText"); }
        renderHud();
      }
    });
    flyers = flyers.filter(function (f) { return !f.done; });

    // the scenery creeps closer as the boy nears the gate
    var prog = clamp((cam.z - camZ0) / (camZEnd - camZ0), 0, 1.2);
    var z = 1 + 0.1 * prog, ox = 778, oy = 520;
    document.getElementById("bg").style.transform = "translate(" + (ox * L.u) + "px," + ((oy - BG.top) * L.u) + "px) scale(" + z + ") translate(" + (-ox * L.u) + "px," + (-(oy - BG.top) * L.u) + "px)";
    L.zoom = { z: z, ox: ox, oy: oy };
  }

  // --- drawing ----------------------------------------------------------------------------
  var DECOR = [
    { im: "gem_blue", b: [93, 1022.25, 189.25, 1165], ph: 0.3 },
    { im: "gem_purple", b: [770, 848, 842, 958], ph: 1.7 },
    { im: "gem_purple", b: [218, 492, 262, 560], ph: 2.9 },
    { im: "gem_purple", b: [60, 452, 102, 516], ph: 4.1 },
    { im: "gem_purple", b: [128, 792, 170, 852], ph: 5.2 }
  ];

  function drawImage(name, x, y, w, h, alpha) {
    var im = img[name];
    if (!im || w <= 0 || h <= 0) return;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.drawImage(im, x, y, w, h);
  }

  function drawPlatform(p) {
    if (p.state === "gone") return;
    var q = project(p.X, p.z, 0);
    if (q.d < 0.32 || q.d > 12) return;
    var m = meta.plat, k = PW * q.s / m.face_width, vk = stretch(q.s);
    var sy = 1 + p.sq * 0.12, sx = 1 - p.sq * 0.06;
    var w = m.size[0] * k * sx, h = m.size[1] * k * vk * sy;
    if (p.rise <= 0) return;
    var up = 1 - ease(p.rise);
    var cx = q.x, cy = q.y + bobOf(p) * q.s + p.fall * p.fall * 900 * q.s + up * 170 * q.s;
    var x = cx - m.face_centre[0] * k * sx, y = cy - m.face_centre[1] * k * vk * sy;
    var a = p.alpha * clamp((q.d - 0.32) / 0.25, 0, 1) * Math.min(1, p.rise * 1.6);
    if (p.grey < 1) drawImage("plat_" + p.color, x, y, w, h, a * (1 - p.grey));
    if (p.grey > 0) drawImage("plat_grey", x, y, w, h, a * p.grey * 0.8);
    if (p.glow > 0) {
      ctx.globalCompositeOperation = "lighter";
      drawImage("plat_" + p.color, x, y, w, h, 0.35 * p.glow);
      ctx.globalCompositeOperation = "source-over";
    }
    p._sx = cx; p._sy = cy; p._s = q.s;
  }

  function drawGate() {
    var q = project(0, gateZ, 0);
    var m = meta.gate, s = q.s / GATE_S0;
    var w = m.w * s, h = m.h * s;
    drawImage("gate", q.x - w / 2, q.y - h + 8 * s, w, h, 1);
    // light pouring out over the threshold (also hides where the gate meets the clouds)
    var gx = q.x + 4 * s, gy = q.y - 18 * s, rx = 150 * s, ry = 52 * s;
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(1, ry / rx);
    var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    var a = 0.82 + 0.12 * Math.sin(clock * 2.1);
    gr.addColorStop(0, "rgba(255,255,255," + a + ")");
    gr.addColorStop(0.45, "rgba(250,246,255," + (a * 0.8) + ")");
    gr.addColorStop(1, "rgba(240,235,255,0)");
    ctx.fillStyle = gr;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPickup(k) {
    if (k.taken || k.plat.rise < 1) return;
    var p = k.plat, q = project(p.X, p.z, HOVER + Math.sin(clock * 2.2 + k.phase) * 10);
    if (q.d < 0.4) return;
    var y = q.y + bobOf(p) * q.s;
    // soft shadow on the block
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#1a0c40";
    ctx.beginPath();
    ctx.ellipse(q.x, project(p.X, p.z, 0).y + bobOf(p) * q.s, 34 * q.s, 9 * q.s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (k.kind === "coin") {
      var turn = 0.72 + 0.28 * Math.cos(clock * 2.6 + k.phase);
      var h = 104 * q.s, w = h * 94 / 133 * turn;
      drawImage("coin", q.x - w / 2, y - h / 2, w, h, 1);
    } else {
      var gh = 118 * q.s, gw = gh * 112 / 172;
      drawImage("gem_purple", q.x - gw / 2, y - gh / 2, gw, gh, 1);
    }
  }

  function drawBoy() {
    var q = project(boy.X, boy.z, 0), m = meta.boy;
    var H = 330 * q.s * boy.scale, W = H * m.w / m.h;
    var sy = 1 + boy.sq * 0.08, sx = 1 - boy.sq * 0.05;
    var baseY = q.y + (st.mode === "air" ? 0 : bobOf(cur) * q.s) - boy.h * q.s;
    // shadow while close to the block
    if (boy.h < 60 && st.mode !== "air") {
      ctx.globalAlpha = 0.28 * (1 - boy.h / 60);
      ctx.fillStyle = "#170a3a";
      ctx.beginPath();
      ctx.ellipse(q.x + 6 * q.s, q.y + bobOf(cur) * q.s + 4 * q.s, 70 * q.s, 18 * q.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = boy.alpha;
    ctx.translate(q.x, baseY);
    ctx.scale(boy.face * sx, sy);
    ctx.drawImage(img.boy_jump, -W * m.ax, -H * m.ay, W, H);
    ctx.restore();
  }

  function drawSpark(x, y, r, a, rgb) {
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(" + rgb + ",1)";
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    var d = L.dpr, u = L.u;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(d * u, 0, 0, d * u, d * L.x0, d * L.artTop);
    ctx.imageSmoothingQuality = "high";

    // floating gems of the scenery (they zoom with the background)
    var zm = L.zoom || { z: 1, ox: 0, oy: 0 };
    DECOR.forEach(function (g) {
      var b = g.b, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2 + Math.sin(clock * 1.6 + g.ph) * 7;
      var x = zm.ox + (cx - zm.ox) * zm.z, y = zm.oy + (cy - zm.oy) * zm.z;
      var w = (b[2] - b[0]) * zm.z, h = (b[3] - b[1]) * zm.z;
      drawImage(g.im, x - w / 2, y - h / 2, w, h, 1);
    });

    // world, far to near
    var items = [{ d: gateZ - cam.z, f: drawGate }];
    plats.forEach(function (p) { items.push({ d: p.z - cam.z, f: function () { drawPlatform(p); } }); });
    pickups.forEach(function (k) { items.push({ d: k.plat.z - cam.z - 0.01, f: function () { drawPickup(k); } }); });
    items.push({ d: boy.z - cam.z - 0.02, f: drawBoy });
    items.sort(function (a, b) { return b.d - a.d; });
    items.forEach(function (it) { it.f(); ctx.globalAlpha = 1; });

    // particles and pickups flying to the top bar
    ctx.globalCompositeOperation = "lighter";
    particles.forEach(function (k) {
      var t = k.life / k.max;
      drawSpark(k.x, k.y, k.size * (t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7 * 0.6), 1 - t * t, k.rgb);
    });
    ctx.globalCompositeOperation = "source-over";
    flyers.forEach(function (f) {
      var t = Math.min(1, f.t / f.T), e = t * t;
      var x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(t * Math.PI) * 120;
      var s = lerp(f.s0, 0.5, t);
      if (f.kind === "coin") drawImage("coin", x - 37 * s, y - 52 * s, 74 * s, 104 * s, 1);
      else drawImage("gem_purple", x - 38 * s, y - 59 * s, 77 * s, 118 * s, 1);
    });
    ctx.globalAlpha = 1;
  }

  function frame(t) {
    if (!running) return;
    var dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    if (!paused) { update(dt); draw(); }
    requestAnimationFrame(frame);
  }

  // --- pause, finish ----------------------------------------------------------------------
  function togglePause(force) {
    if (st.mode === "done") return;
    paused = force == null ? !paused : force;
    document.getElementById("pauseMenu").hidden = !paused;
  }

  function finish() {
    st.mode = "done";
    var perfect = st.mistakes === 0;
    var stars = perfect ? 3 : st.mistakes <= 2 ? 2 : 1;
    var coins = st.coins + LEVEL_COINS + (perfect ? PERFECT_COINS : 0);
    var gems = st.gems;
    profile.coins += coins;
    profile.gems += gems;
    var best = profile.best.level1 || {};
    profile.best.level1 = { stars: Math.max(best.stars || 0, stars), time: best.time ? Math.min(best.time, st.time) : st.time };
    if (window.RCProfile) RCProfile.save(profile);
    st.coins = 0; st.gems = 0;
    renderHud();
    var g = gen;
    setTimeout(function () { if (g === gen) showComplete(stars, coins, gems, perfect); }, 450);
  }

  function showComplete(stars, coins, gems, perfect) {
    var ov = document.getElementById("complete");
    ov.hidden = false;
    layoutCard();
    var slots = document.querySelectorAll(".starSlot");
    slots.forEach(function (s) { s.classList.remove("on"); });
    var rows = [
      ["hud_coin", "Coins", "+" + num(coins)],
      ["hud_gem", "Gems", "+" + num(gems)],
      ["star_m", "Perfect Bonus", perfect ? "+" + PERFECT_COINS : "—"],
      ["hud_stopwatch", "Time", mmss(st.time)]
    ];
    var box = document.getElementById("rewards");
    box.innerHTML = rows.map(function (r, i) {
      return '<div class="rw' + (i === 2 && !perfect ? " muted" : "") + '"><img src="' + A + r[0] + '.webp" alt=""><span class="lbl">' + r[1] +
        '</span><span class="val">' + r[2] + "</span></div>";
    }).join("");
    box.querySelectorAll(".rw").forEach(function (r, i) { setTimeout(function () { r.classList.add("on"); }, 500 + i * 140); });
    for (var i = 0; i < stars; i++) (function (i) { setTimeout(function () { slots[i].classList.add("on"); if (navigator.vibrate) navigator.vibrate(15); }, 380 + i * 260); })(i);
    document.getElementById("flash").classList.remove("on");
  }
  function buildCard() {
    var c = document.getElementById("stars");
    ["star_l", "star_m", "star_r"].forEach(function (n) {
      var s = document.createElement("div");
      s.className = "starSlot";
      s.dataset.name = n;
      s.innerHTML = '<img class="empty" src="' + A + n + '_empty.webp" alt="" draggable="false"><img class="full" src="' + A + n + '.webp" alt="" draggable="false">';
      c.appendChild(s);
    });
  }

  function layoutCard() {
    var m = meta.complete;
    if (!m) return;
    var cw = Math.min(L.W * 0.9, (L.H - L.safe.top - L.safe.bottom) * 0.78 * m.card[0] / m.card[1]);
    var k = cw / m.card[0];
    var card = document.getElementById("card");
    card.style.width = cw + "px";
    card.style.height = m.card[1] * k + "px";
    card.style.setProperty("--k", k + "px");
    var put = function (el, b) {
      el.style.left = b[0] * k + "px"; el.style.top = b[1] * k + "px";
      el.style.width = (b[2] - b[0]) * k + "px"; el.style.height = (b[3] - b[1]) * k + "px";
    };
    document.querySelectorAll(".starSlot").forEach(function (s) { put(s, m[s.dataset.name]); });
    put(document.getElementById("rewards"), m.table);
    put(document.getElementById("btnNext"), m.btn_next);
  }

  // --- buttons ----------------------------------------------------------------------------
  var toastTimer = 0;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  function command(cmd) {
    if (cmd === "resume") togglePause(false);
    else if (cmd === "restart") { togglePause(false); build(); }
    else if (cmd === "home") location.href = "index.html";
    else if (cmd === "next") toast("Level 2 isn't built yet — coming next!");
  }

  function wire() {
    canvas.addEventListener("pointerdown", onTap);
    window.addEventListener("keydown", onKey);
    document.querySelectorAll("button, #btnNext").forEach(function (b) {
      b.addEventListener("pointerdown", function (e) { e.stopPropagation(); b.classList.add("pressed"); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { b.addEventListener(ev, function () { b.classList.remove("pressed"); }); });
    });
    document.getElementById("pauseBtn").addEventListener("click", function () { togglePause(); });
    document.querySelectorAll("[data-cmd]").forEach(function (b) {
      b.addEventListener("click", function () { if (navigator.vibrate) navigator.vibrate(10); command(b.dataset.cmd); });
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && st.mode !== "done") togglePause(true); });
    window.addEventListener("resize", layout);
  }

  // --- start ------------------------------------------------------------------------------
  function loadImage(name) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { img[name] = im; res(); };
      im.onerror = function () { console.warn("missing", name); res(); };
      im.src = A + name + ".webp";
    });
  }
  function loadJson(name) {
    return fetch(A + name + ".json").then(function (r) { return r.json(); });
  }

  var names = ["gate", "boy_jump", "coin", "gem_purple", "gem_blue", "plat_grey", "plat_rainbow"].concat(SEQ.map(function (c) { return "plat_" + c; }));
  buildPanel();
  buildCard();
  Promise.all([
    Promise.all(names.map(loadImage)),
    loadJson("platforms").then(function (j) { meta.plat = j; }),
    loadJson("complete").then(function (j) { meta.complete = j; }),
    document.fonts.ready
  ].concat(Array.prototype.slice.call(document.images).map(function (im) {
    return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
  }))).then(function () {
    var g = img.gate, b = img.boy_jump;
    meta.gate = { w: 288.75, h: 288.75 * g.naturalHeight / g.naturalWidth };
    meta.boy = { w: b.naturalWidth, h: b.naturalHeight, ax: 0.47, ay: 0.95 };
    build();
    layout();
    wire();
    running = true;
    screen.classList.add("ready");
    document.body.dataset.ready = "1";
    requestAnimationFrame(function (t) { last = t; frame(t); });
  });

  // hooks for the screenshot script and the Android shell
  window.RainbowCascadesLevel1 = {
    state: function () { return { mode: st.mode, row: row, step: st.step, mistakes: st.mistakes, time: st.time }; },
    tapBlock: function (correct) {
      var o = nextRow().filter(function (p) { return p.ok === correct; })[0];
      if (o && !paused && st.mode === "ready" && !jump) hop(o);
      return !!o;
    },
    debugNext: function () {
      return nextRow().map(function (p) {
        var q = project(p.X, p.z, 0);
        return { color: p.color, ok: p.ok, x: L.x0 + q.x * L.u, y: L.artTop + q.y * L.u };
      });
    },
    pause: togglePause
  };
})();
