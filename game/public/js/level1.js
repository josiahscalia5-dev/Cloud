/*
 * Rainbow Cascades - Level 1: the whole course, from the first red block to the Rainbow Gate.
 *
 * Seven stages in a row (the counter in the top panel), each a stretch of jelly blocks:
 *   1 Follow the Color Sequence   hop onto the next colour (red, yellow, blue, green, purple, pink)
 *   2 Platforms Rotate            blocks flip over; jump while they are flat. Golden rings give tokens.
 *                                 A hidden rainbow block off to the left starts the secret route.
 *   3 Moving Platforms            blocks slide from side to side; jump as they slow down
 *   4 Watch for Fake Platforms    a dark zone; the cracked twin of each pair crumbles
 *   5 Dodge the Cloud             the cloud monster chases you and strikes a flashing block
 *   6 Choose Your Path            a safe blue route or a gold route with more rewards and traps
 *   7 Reach the Rainbow Gate      rainbow road, then leap into the gate
 * Falling or being struck costs a heart; with none left the stage starts over.
 *
 * Screen layout uses "D" pixels: the pixel grid of the Level 1 direction image (941 x 1672).
 * One D is `u` CSS pixels. The play field is real 3D (CSS perspective): a pinhole camera whose
 * principal point is at VP, F D-pixels of focal length, CAM_Y world units above the block tops,
 * looking down the path. World units: a block is 0.8 wide; +X right, +Y up, +Z into the screen.
 */
(function () {
  "use strict";

  // ---- screen (D pixels) -------------------------------------------------------------------
  var ART_W = 941, ART_H = 1672, EXT_T = 400, EXT_B = 120;   // bg_level1.webp adds sky / foliage
  var TOP = {                    // hangs from the top safe area
    lvlBand: [60, 22, 228, 82],
    avatar: [2.75, 7.75, 94.75, 99.75],
    lvlText: [113, 25, 200, 58],
    xp: [105, 57, 216, 78],
    pillTime: [262, 22, 470, 82],
    pillCoins: [494, 22, 666, 82],
    pillGems: [690, 22, 838, 82],
    iconTime: [257.5, 14.25, 316, 84.5],
    iconCoin: [489.75, 22.75, 551.5, 84.5],
    iconGem: [679.25, 15.25, 747, 93],
    btnPause: [852, 14, 932.25, 94.25],
    hearts: [8, 118, 140, 166],
    seq: [147, 111, 795, 254],
    journey: [180, 266, 762, 292]
  };
  var TEXT_X = { time: 130, coins: 112, gems: 96 };   // centre of the number inside its pill
  var ART = { banner: [100, 1498, 842, 1616], fgBush: [0, 1378.75, 230, 1672] };   // sit on the art
  var ORB_X = [171.25, 267.25, 360.25, 453.75, 546.25, 638.75], ORB_Y = 177.25, ORB_W = 67.75;

  // ---- camera and world --------------------------------------------------------------------
  var F = 1560, VX = 800, VY = 380, CAM_Y = 1.85;
  var Z_REST = 3.2;                // the boy's block sits this far in front of the camera
  var X_BASE = 0.95, FOLLOW = 0.8; // camera x = X_BASE + FOLLOW * boy x (keeps both lanes in view)
  var CAM_LAG = 110;               // ms: the camera eases after the boy, so his jumps read on screen
  var BLOCK = { w: 0.8, d: 0.62, h: 0.26 };
  var LANE = 0.46, ROW_DZ = 1.3;
  var BOY_H = 0.88, BOY_AR = { jump: 462 / 655, run: 364 / 402 };
  var STAND = -0.1;                // he lands a little in front of a block's centre
  var JUMP_MS = 540, JUMP_PEAK = 0.8;
  var WARN_MS = 850, STRIKE_MS = 320;
  var SEQ = ["red", "yellow", "blue", "green", "purple", "pink"];
  var NAMES = { red: "RED", yellow: "YELLOW", blue: "BLUE", green: "GREEN", purple: "PURPLE", pink: "PINK" };
  var HEX = { red: "#ff3a55", yellow: "#ffd21a", blue: "#27a8ff", green: "#3ee04f", purple: "#b058ff", pink: "#ff5fd2",
    rainbow: "#ffffff", stone: "#ff78e0", stonefake: "#ff78e0", gold: "#ffc53a", goldfake: "#ffc53a", ice: "#6cc8ff" };
  var COIN_VALUE = 10, GEM_VALUE = 5, CLEAR_BONUS = 50, PERFECT_BONUS = 100;
  var ISLANDS = [0.785, 0.767, 0.723, 0.889, 0.772];   // width / height of island_1..5

  var STAGES = [
    { title: "Follow the Color Sequence!", say: "Jump on the matching colors in order!" },
    { title: "Platforms Rotate!", say: ["Platforms Rotate!", "Time your jumps!"], icon: "icon_rotate", tip: "Jump while a block is flat" },
    { title: "Moving Platforms!", say: ["Moving Platforms!", "Jump, slide and flip!"], icon: "icon_up", tip: "Jump when a block slows down" },
    { title: "Watch for Fake Platforms!", say: ["Watch for Fake Platforms!", "They disappear!"], icon: "icon_fake", tip: "Cracked blocks crumble", dark: true },
    { title: "Dodge the Cloud!", say: ["Dodge the Cloud!", "It chases you!"], icon: "icon_warning", tip: "Keep off the flashing block" },
    { title: "Choose Your Path!", say: ["Choose Your Path!", "Safer Route or Bigger Rewards?"], icon: "icon_left", icon2: "icon_right", tip: "Blue is safe, gold pays more" },
    { title: "Reach the Rainbow Gate!", say: ["Reach the Rainbow Gate!", "Complete the level!"], tip: "Almost there!" }
  ];
  var SECRET = { say: "Take the secret rainbow route!" };

  var A = "assets/level1/";
  var q = new URLSearchParams(location.search);
  var profile = window.RCProfile.load();

  var $ = function (id) { return document.getElementById(id); };
  var screen = $("screen"), scene = $("scene"), world = $("world"), fx = $("fx");

  // ---- random (seedable so previews are repeatable) ------------------------------------------
  var seed = q.has("seed") ? +q.get("seed") : (Date.now() & 0xffffff);
  function rand() {
    seed = (seed + 0x6d2b79f5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ---- layout ------------------------------------------------------------------------------
  var L = { u: 1, ax: 0, ay: 0, k: 300, safe: { top: 0, bottom: 0 }, W: 0, H: 0 };

  function readSafeArea() {
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

  function box(el, b, x, y) {
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = (b[2] - b[0]) * L.u + "px";
    el.style.height = (b[3] - b[1]) * L.u + "px";
  }

  function layout() {
    var W = window.innerWidth, H = window.innerHeight, safe = readSafeArea();
    var u = Math.min(W / ART_W, (H - safe.top - safe.bottom) / 1560);
    L.u = u; L.W = W; L.H = H; L.safe = safe;
    L.ax = (W - ART_W * u) / 2;
    L.ay = H - safe.bottom - ART_H * u;                 // the art's bottom edge sits on the bottom safe area
    L.k = F * u / Z_REST;                               // CSS px per world unit at the boy's distance
    document.documentElement.style.setProperty("--u", u + "px");
    document.documentElement.style.setProperty("--k", L.k + "px");
    screen.classList.toggle("wide", ART_W * u < W - 1);

    var bg = $("bg");
    bg.style.left = L.ax + "px";
    bg.style.top = L.ay - EXT_T * u + "px";
    bg.style.width = ART_W * u + "px";
    bg.style.height = (EXT_T + ART_H + EXT_B) * u + "px";

    scene.style.perspective = F * u + "px";
    scene.style.perspectiveOrigin = (L.ax + VX * u) + "px " + (L.ay + VY * u) + "px";

    Object.keys(TOP).forEach(function (id) {
      var b = TOP[id];
      box($(id), b, L.ax + b[0] * u, safe.top + (b[1] - 6) * u);
    });
    Object.keys(ART).forEach(function (id) {
      var b = ART[id];
      box($(id), b, L.ax + b[0] * u, L.ay + b[1] * u);
    });
    $("time").style.left = TEXT_X.time * u + "px";
    $("coins").style.left = TEXT_X.coins * u + "px";
    $("gems").style.left = TEXT_X.gems * u + "px";
    Array.prototype.forEach.call(document.querySelectorAll("#seqOrbs .orb"), function (o, i) {
      o.style.left = (ORB_X[i] - TOP.seq[0]) * u + "px";
      o.style.top = (ORB_Y - TOP.seq[1]) * u + "px";
    });
    Array.prototype.forEach.call(document.querySelectorAll("#seqOrbs .arrow"), function (a, i) {
      var x = (ORB_X[i] + ORB_W + ORB_X[i + 1]) / 2;
      a.style.left = (x - 7.5 - TOP.seq[0]) * u + "px";
      a.style.top = (211 - 8 - TOP.seq[1]) * u + "px";
    });
    var cu = Math.min(W * 0.86 / 574, (H - safe.top - safe.bottom) * 0.74 / 890);
    $("card").style.setProperty("--cu", cu + "px");
    setNum("coins", window.RCProfile.num(profile.coins));
    setNum("gems", window.RCProfile.num(profile.gems));
    render();
  }

  // ---- projection (same camera as the CSS 3D scene) ----------------------------------------------
  var cam = { x: 0, z: 0 };
  function project(X, Y, Z) {
    var zc = Math.max(0.05, Z - cam.z), s = F / zc;
    return { x: L.ax + (VX + s * (X - cam.x)) * L.u, y: L.ay + (VY + s * (CAM_Y - Y)) * L.u, s: s * L.u };
  }
  function t3(X, Y, Z) { return "translate3d(" + (L.k * X) + "px," + (-L.k * Y) + "px," + (-L.k * Z) + "px)"; }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    (parent || world).appendChild(e);
    return e;
  }

  // A picture standing upright in the world, always facing the camera (islands, coins, the boy...).
  function billboard(src, w, h, cls) {
    var b = { el: el("div", "bb" + (cls ? " " + cls : "")), w: w, h: h };
    b.img = el("img", "", b.el);
    b.img.src = A + src + ".webp";
    b.img.alt = "";
    return b;
  }
  function placeBB(b, x, y, z, extra) {                 // (x, z) = bottom centre, y = height of the bottom
    b.el.style.width = b.w * L.k + "px";
    b.el.style.height = b.h * L.k + "px";
    b.el.style.transform = t3(x - b.w / 2, y + b.h, z) + (extra || "");
  }

  // ---- the course --------------------------------------------------------------------------
  var steps = [], plats = [], picks = [], rings = [], scenery = [], stageStart = [];
  var gate, cloud, orb, boy, shadowEl, marker, warnMark;

  function buildLevel() {
    world.innerHTML = "";
    steps = []; plats = []; picks = []; rings = []; scenery = []; stageStart = [];
    var z = 0;
    function step(stage, defs) {
      var s = { i: steps.length, stage: stage, z: z, plats: [] };
      defs.forEach(function (d) {
        var p = Object.assign({ x: 0, style: "rainbow", kind: "plain", route: "main", entry: false }, d);
        Object.assign(p, { id: plats.length, step: s.i, stage: stage, z: z, bx: p.x, dx: 0, dy: 0, roll: 0, fade: 1,
          gone: false, next: [], el: null, t: p.t || 0, flash: 0, red: 0 });
        plats.push(p);
        s.plats.push(p);
      });
      steps.push(s);
      z += ROW_DZ;
      return s;
    }
    function coin(p, y) { addPick("coin", p.x, y || 0.62, p.z, p); }
    function gem(p, kind) { addPick(kind || "gem_purple", p.x, 0.62, p.z, p); }
    function either() { return rand() < 0.5 ? 0 : 1; }
    function ringBetween(a, b, y) { addRing((a.x + b.x) / 2, y || 1.2, (a.z + b.z) / 2); }

    // 1 - follow the colour sequence: two blocks a row, one of them the next colour
    stageStart.push(steps.length);
    var spare = SEQ[1 + Math.floor(rand() * 5)];
    step(0, [{ x: -LANE, style: "red", kind: "color", color: "red" }, { x: LANE, style: spare, kind: "color", color: spare }]);
    for (var i = 1; i < SEQ.length; i++) {
      var c = either();
      var near = [SEQ[i + 1], SEQ[i - 1]].filter(Boolean);
      var others = SEQ.filter(function (x) { return x !== SEQ[i]; });
      var decoy = rand() < 0.6 ? near[Math.floor(rand() * near.length)] : others[Math.floor(rand() * others.length)];
      var defs = [];
      defs[c] = { x: c ? LANE : -LANE, style: SEQ[i], kind: "color", color: SEQ[i] };
      defs[1 - c] = { x: c ? -LANE : LANE, style: decoy, kind: "color", color: decoy };
      var s = step(0, defs);
      if (i <= 2) coin(s.plats[c]);
      if (i === 3) gem(s.plats[either()], "gem_purple");
      if (i === 5) gem(s.plats[c], "gem_blue");
    }

    // 2 - platforms rotate (flip over), golden rings between them, and the secret route's entrance
    stageStart.push(steps.length);
    var pad = step(1, [{ style: "rainbow" }]);
    var rot = [[-0.3], [0.3, -1.1], [0.3, -1.25], [-0.1, -1.25], [0.3, -1.25]];
    var prev = pad.plats[0], prevSecret = null;
    rot.forEach(function (r, j) {
      var defs = [{ x: r[0], style: SEQ[(j + 1) % 6], kind: "rotate", period: 2600 - j * 100, flip: 900, t: 400 + j * 650 }];
      if (r[1] !== undefined) defs.push({ x: r[1], style: "rainbow", kind: "secret", route: "secret", entry: j === 1, last: j === 4 });
      var s = step(1, defs);
      if (j > 0) ringBetween(prev, s.plats[0]);
      prev = s.plats[0];
      var sec = s.plats[1];
      if (sec) {
        if (prevSecret) ringBetween(prevSecret, sec, 1.15);
        if (j === 2) gem(sec, "gem_blue");
        if (j === 3) gem(sec, "gem_purple");
        if (j === 4) coin(sec);
        prevSecret = sec;
      }
    });

    // 3 - moving platforms slide from side to side
    stageStart.push(steps.length);
    step(2, [{ style: "rainbow" }]);
    for (var m = 0; m < 5; m++) {
      var ms = step(2, [{ x: 0, style: SEQ[(m + 2) % 6], kind: "move", amp: 0.85, period: 2600 + m * 160, phase: rand() * 6.28 }]);
      if (m % 2 === 0) coin(ms.plats[0]);
    }

    // 4 - fake platforms in the dark: each pair has a cracked twin that crumbles
    stageStart.push(steps.length);
    step(3, [{ style: "stone" }]);
    for (var f = 0; f < 5; f++) {
      var fk = either(), fd = [];
      fd[fk] = { x: fk ? LANE : -LANE, style: "stonefake", kind: "fake" };
      fd[1 - fk] = { x: fk ? -LANE : LANE, style: "stone" };
      var fs = step(3, fd);
      if (f === 0) coin(fs.plats[1 - fk]);
      if (f === 1 || f === 3) gem(fs.plats[1 - fk], f === 1 ? "gem_purple" : "gem_blue");
      if (f === 4) coin(fs.plats[1 - fk]);
    }
    var fakeEnd = z;

    // 5 - dodge the cloud on the rainbow road
    stageStart.push(steps.length);
    step(4, [{ style: "rainbow" }]);
    for (var r2 = 0; r2 < 6; r2++) {
      var rs = step(4, [{ x: -LANE, style: "rainbow", kind: "road" }, { x: LANE, style: "rainbow", kind: "road" }]);
      if (r2 % 2 === 0) coin(rs.plats[either()]);
    }

    // 6 - choose your path: safe ice blocks on the left, gold with more rewards (and traps) on the right
    stageStart.push(steps.length);
    step(5, [{ style: "rainbow" }]);
    var e1 = step(5, [{ x: -1.0, style: "ice", route: "safe", entry: true }, { x: 1.0, style: "gold", route: "gold", entry: true }]);
    var e2 = step(5, [{ x: -1.05, style: "ice", route: "safe" }, { x: 1.0, style: "gold", route: "gold", kind: "move", amp: 0.42, period: 2300, phase: 0 }]);
    var gf = either();
    var e3 = step(5, [{ x: -1.0, style: "ice", route: "safe" },
      { x: 0.55, style: gf ? "gold" : "goldfake", kind: gf ? "plain" : "fake", route: "gold" },
      { x: 1.45, style: gf ? "goldfake" : "gold", kind: gf ? "fake" : "plain", route: "gold" }]);
    var e4 = step(5, [{ x: -1.0, style: "ice", route: "safe" }, { x: 1.0, style: "gold", route: "gold" }]);
    [e1, e2, e3, e4].forEach(function (s) { coin(s.plats[0]); });
    gem(e1.plats[1], "gem_purple");
    coin(e2.plats[1]);
    gem(e3.plats[gf ? 1 : 2], "gem_blue");
    gem(e4.plats[1], "gem_purple");
    addPick("coin", 1.0, 1.1, (e1.z + e2.z) / 2);
    addPick("coin", 1.0, 1.1, (e2.z + e3.z) / 2);
    addPick("coin", 1.0, 1.1, (e3.z + e4.z) / 2);
    step(5, [{ style: "rainbow" }]);

    // 7 - the rainbow road to the gate
    stageStart.push(steps.length);
    step(6, [{ style: "rainbow" }]);
    coin(step(6, [{ x: 0.25, style: "rainbow" }]).plats[0]);
    coin(step(6, [{ x: -0.2, style: "rainbow" }]).plats[0]);
    var endStep = step(6, [{ x: 0, style: "rainbow", kind: "end" }]);
    stageStart.push(steps.length);                      // sentinel: one past the last stage
    var endP = endStep.plats[0];
    gate = billboard("gate", 2.75 * 866 / 1100, 2.75, "gate");
    gate.x = 0; gate.z = endP.z + 2.4;
    [0.32, 0.52, 0.72].forEach(function (fr) {           // coins along the leap into the gate
      var k = fr < 0.5 ? Math.sqrt(fr / 2) : 1 - Math.sqrt((1 - fr) / 2);
      addPick("coin", endP.x + (gate.x - endP.x) * fr, 1.35 * 4 * k * (1 - k) + 0.4, endP.z + (gate.z - 0.15 - endP.z) * fr);
    });

    // who can jump to whom: same route, the main path, or into a branch at its entrance
    steps.forEach(function (s, si) {
      var nx = steps[si + 1];
      if (!nx) return;
      s.plats.forEach(function (p) {
        var sameRoute = nx.plats.some(function (q2) { return q2.route === p.route; });
        p.next = nx.plats.filter(function (q2) {
          return q2.route === p.route || (q2.route === "main" && !sameRoute) || (p.route === "main" && q2.entry);
        });
      });
    });

    // scenery: floating islands drifting past on both sides
    for (var sz = -4, side = 1; sz < gate.z + 8; sz += 2.6 + rand() * 1.4, side = -side) {
      var n = Math.floor(rand() * ISLANDS.length), h = 1.3 + rand() * 1.7;
      var isl = billboard("island_" + (n + 1), h * ISLANDS[n], h, "island");
      isl.x = side * (2.5 + rand() * 2.6) + (side > 0 ? 0.6 : 0);
      isl.y = -2.1 + rand() * 2.6;
      isl.z = sz;
      isl.phase = rand() * 6.28;
      scenery.push(isl);
    }

    orb = billboard("laser_orb", 1.1, 1.1, "orb");
    orb.x = 1.7; orb.z = fakeEnd + 2.5;
    cloud = billboard("cloud_monster", 1.9, 1.9 / 1.181, "monster");
    Object.assign(cloud, { alpha: 0, x: 0.4, y: 1.6, z: 0, target: null, struck: false, tWarn: 0, tStrike: 0, next: 0 });
    warnMark = billboard("icon_warning", 0.32, 0.32 / 1.127, "warnMark");
    shadowEl = el("div", "shadow");
    marker = el("div", "marker");
    el("div", "arrowShape", marker);
    var start = steps[0].plats[0];
    boy = { x: start.x, y: 0, z: start.z + STAND, on: start, air: false, flip: false, landT: -1e9, alpha: 1, sprite: "jump" };
    boy.bb = billboard("boy_jump", BOY_H * BOY_AR.jump, BOY_H, "boy");
  }

  function addPick(kind, x, y, z, plat) {
    var size = kind === "coin" ? 0.3 : 0.36;
    var aspect = { coin: 94 / 133, gem_purple: 112 / 172, gem_blue: 144 / 214 }[kind];
    var p = billboard(kind, size * aspect, size, "pick");
    Object.assign(p, { kind: kind, x: x, y: y, z: z, plat: plat || null, ox: plat ? x - plat.x : 0, got: false, phase: rand() * 6.28 });
    picks.push(p);
  }

  function addRing(x, y, z) {
    var r = billboard("ring", 0.42 * 0.836, 0.42, "ringBB");
    Object.assign(r, { x: x, y: y, z: z, got: false, phase: rand() * 6.28 });
    rings.push(r);
  }

  function ensureTile(p) {
    if (p.el) return;
    p.el = el("div", "tile");
    var faces = [["top", "top_" + p.style], ["front", "front_" + p.style], ["side r", "side_" + p.style], ["side l", "side_" + p.style]];
    if (p.kind === "rotate") faces.push(["bottom", "bottom_" + p.style]);
    faces.forEach(function (f) {
      var e = el("div", "face " + f[0], p.el);
      e.style.backgroundImage = "url(" + A + f[1] + ".webp)";
    });
    p.faces = Array.prototype.slice.call(p.el.children);
    p.glowEl = el("div", "face glow", p.el);
  }

  // ---- clock and tweens (game time stops while paused) -----------------------------------------
  var clock = 0, last = 0, paused = false, running = false, elapsed = 0, timing = false;
  var tweens = [];
  function tween(dur, fn, done) { var t = { t0: clock, dur: dur, fn: fn, done: done }; tweens.push(t); fn(0); return t; }
  function wait(ms, fn) { return tween(ms, function () {}, fn); }
  function runTweens() {
    for (var i = 0; i < tweens.length; i++) {
      var t = tweens[i], k = Math.min(1, (clock - t.t0) / t.dur);
      t.fn(k);
      if (k >= 1) { tweens.splice(i--, 1); if (t.done) t.done(); }
    }
  }
  var easeIO = function (k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; };
  var easeOut = function (k) { return 1 - Math.pow(1 - k, 3); };

  // ---- game state ----------------------------------------------------------------------------
  var mode = "play";               // play | busy | gate | over | done
  var stage = 0, hearts = 3, heartsLost = 0, mistakes = 0;
  var coinsGot = 0, gemsGot = 0, tokens = 0, secretFound = false;
  var hintAt = 0, bannerTimer = null, checkpoint = null;

  // rotating blocks: flat for most of the cycle, then a full roll
  function rollAt(p, t) {
    var u = ((t % p.period) + p.period) % p.period, flat = p.period - p.flip;
    return u < flat ? 0 : (u - flat) / p.flip * 360;
  }
  function flatAt(p, t) { var r = rollAt(p, t); return r < 24 || r > 336; }
  function moveX(p, t) { return p.bx + p.amp * Math.sin(t / p.period * 6.2832 + p.phase); }

  function updateWorld(dt) {
    plats.forEach(function (p) {
      if (p.kind === "rotate") {
        if (p !== boy.on) p.t += dt;
        p.roll = rollAt(p, p.t);
      } else if (p.kind === "move") {
        p.x = moveX(p, clock);
      }
    });
    if (boy.on && !boy.air && boy.on.kind === "move") boy.x = boy.on.x;      // he rides it
    picks.forEach(function (pk) { if (pk.plat) pk.x = pk.plat.x + pk.ox; });
    updateCloud();
  }

  function jumpTo(X, Z, peak, dur, done) {
    var x0 = boy.x, z0 = boy.z, y0 = boy.y;
    if (X < x0 - 0.2) boy.flip = true; else if (X > x0 + 0.2) boy.flip = false;
    boy.air = true;
    boy.on = null;
    tween(dur, function (k) {
      var e = easeIO(k);
      boy.x = x0 + (X - x0) * e;
      boy.z = z0 + (Z - z0) * e;
      boy.y = y0 * (1 - k) + peak * 4 * k * (1 - k);
    }, function () { boy.air = false; boy.y = 0; boy.landT = clock; if (done) done(); });
  }

  function choose(p) {
    if (mode !== "play" || !p || p.gone || !boy.on || boy.on.next.indexOf(p) < 0) return;
    mode = "busy";
    hintAt = Infinity;
    var from = boy.on;
    // aim a moving block halfway between where it is and where it will be when he lands
    var tx = p.kind === "move" ? (p.x + moveX(p, clock + JUMP_MS)) / 2 : p.x;
    jumpTo(tx, p.z + STAND, JUMP_PEAK, JUMP_MS, function () { resolve(p, from); });
  }

  function resolve(p, from) {
    if (p.kind === "color" && p.color !== SEQ[p.step]) return wrongColor(p, from);
    if (p.kind === "fake") { crumble(p); return fall(from, "It was a fake!"); }
    if (p.kind === "rotate" && !flatAt(p, p.t)) return fall(from, "It flipped over!");
    if (p.kind === "move" && Math.abs(p.x - boy.x) > 0.44) return fall(from, "Missed it!");
    land(p);
    if (cloud.struck && cloud.target === p) zap();
  }

  function land(p) {
    boy.on = p;
    boy.x = p.kind === "move" ? p.x : boy.x;
    if (p.kind === "rotate") p.t = 0;                   // it waits, flat, while he stands on it
    burst(p.x, 0.05, p.z, HEX[p.style] || "#fff", 14);
    p.flash = 1;
    vibrate(15);
    if (p.step === stageStart[p.stage] && p.route === "main") checkpoint = p;
    if (p.stage !== stage) enterStage(p.stage);
    if (p.kind === "secret") {
      setSprite("run");
      if (p.entry && !secretFound) {
        secretFound = true;
        pop(project(p.x, 1.2, p.z).x, project(p.x, 1.2, p.z).y, "Secret route!");
        say(SECRET.say, "win");
        vibrate([20, 40, 20]);
      }
      mode = "busy";
      var nx = p.next.filter(function (x) { return x.route === "secret"; })[0] || p.next[0];
      wait(220, function () {
        jumpTo(nx.x, nx.z + STAND, 0.75, 460, function () { if (nx.kind !== "secret") { setSprite("jump"); stageSay(); } resolve(nx, p); });
      });
      updateHud();
      return;
    }
    setSprite("jump");
    updateHud();
    if (p.kind === "end") {
      mode = "gate";
      say("Tap to leap into the <b>Rainbow Gate!</b>", "win");
      hintAt = Infinity;
      return;
    }
    mode = "play";
    hintAt = clock + (p.step === 0 ? 1600 : 6000);
  }

  function wrongColor(p, back) {
    mistakes++;
    vibrate([35, 50, 35]);
    say("That's " + chip(p.color) + "! Find " + chip(SEQ[p.step]) + ".", "warn", 2600);
    var s = project(p.x, 0.9, p.z);
    pop(s.x, s.y, "✖", "bad");
    tween(420, function (k) { p.dx = Math.sin(k * Math.PI * 6) * 0.05 * (1 - k); p.red = 1 - k * 0.3; });
    wait(380, function () {
      jumpTo(back.x, back.z + STAND, 0.6, 460, function () { land(back); hintAt = clock + 900; });
      dropTile(p);
    });
  }

  function dropTile(p) {
    tween(900, function (k) { p.dy = -3.2 * k * k; p.fade = 1 - k; }, function () { p.gone = true; if (p.el) p.el.remove(); p.el = null; });
  }

  function crumble(p) {
    p.red = 0.8;
    tween(160, function (k) { p.dx = Math.sin(k * Math.PI * 4) * 0.04; }, function () { dropTile(p); });
  }

  // He slips off (or the block vanishes): down into the clouds, a heart lost, back where he jumped from.
  function fall(from, why) {
    mode = "busy";
    vibrate([40, 60, 40]);
    say(why + " <small>You lost a heart.</small>", "warn", 2400);
    var y0 = boy.y;
    boy.on = null;
    boy.air = true;
    tween(700, function (k) { boy.y = y0 - 3.4 * k * k; boy.alpha = 1 - k; }, function () {
      loseHeart();
      if (hearts <= 0) return outOfHearts();
      respawn(from);
    });
  }

  function respawn(p) {
    boy.x = p.x; boy.z = p.z + STAND; boy.y = 0; boy.air = false; boy.on = p; boy.landT = clock;
    if (p.kind === "rotate") p.t = 0;
    tween(700, function (k) { boy.alpha = Math.round(k * 6) % 2 ? 0.35 : 1; }, function () { boy.alpha = 1; });
    mode = "play";
    hintAt = clock + 2500;
  }

  function loseHeart() {
    hearts = Math.max(0, hearts - 1);
    heartsLost++;
    updateHearts(true);
  }

  function zap() {
    vibrate([60, 40, 60]);
    loseHeart();
    say("Zapped! <small>Keep off the flashing block.</small>", "warn", 2200);
    var s = project(boy.x, 1, boy.z);
    pop(s.x, s.y, "⚡", "bad");
    tween(500, function (k) { boy.alpha = Math.round(k * 8) % 2 ? 0.4 : 1; }, function () { boy.alpha = 1; });
    if (hearts <= 0) { mode = "busy"; wait(500, outOfHearts); }
  }

  function outOfHearts() {
    mode = "over";
    boy.alpha = 0;
    $("nohearts").hidden = false;
  }

  function retry() {
    $("nohearts").hidden = true;
    hearts = 3;
    updateHearts(false);
    var p = checkpoint || steps[0].plats[0];
    respawn(p);
    cloud.target = null; cloud.struck = false; cloud.next = clock + 1500;
    stageSay();
  }

  function leapIntoGate() {
    if (mode !== "gate") return;
    mode = "busy";
    hintAt = Infinity;
    vibrate(20);
    jumpTo(gate.x, gate.z - 0.15, 1.35, 1100, function () {});
    wait(650, function () {
      burst(gate.x, 0.8, gate.z - 0.3, "#ffffff", 30);
      var f = $("flash");
      tween(520, function (k) { f.style.opacity = easeOut(k); }, function () {
        showComplete();
        tween(700, function (k) { f.style.opacity = 1 - k; });
      });
    });
  }

  // ---- the cloud monster (stage 5) --------------------------------------------------------------
  function inCloudStage() { return boy.on ? boy.on.stage === 4 : stage === 4; }

  function updateCloud() {
    var active = stage === 4 && mode !== "done" && mode !== "over";
    cloud.alpha += ((active ? 1 : 0) - cloud.alpha) * 0.05;
    cloud.x = cam.x * 0.35 + 0.1 + Math.sin(clock / 900) * 0.25;
    cloud.y = 0.95 + Math.sin(clock / 500) * 0.08 + (1 - cloud.alpha) * 1.5;
    cloud.z = boy.z + 3.5;
    if (!active) { cloud.target = null; cloud.struck = false; return; }
    if (!cloud.target && clock > cloud.next && boy.on && inCloudStage()) {
      var here = boy.on;
      var cands = here.next.filter(function (p) { return !p.gone && p.kind === "road"; });
      if (clock - boy.landT > 2000 && here.kind === "road") cloud.target = here;     // it chases you
      else if (cands.length) cloud.target = cands[Math.floor(rand() * cands.length)];
      if (cloud.target) cloud.tWarn = clock;
    }
    if (cloud.target && !cloud.struck && clock - cloud.tWarn > WARN_MS) {
      cloud.struck = true;
      cloud.tStrike = clock;
      bolt(cloud.target);
      if (boy.on === cloud.target && !boy.air && mode === "play") zap();
    }
    if (cloud.struck && clock - cloud.tStrike > STRIKE_MS) {
      cloud.target = null;
      cloud.struck = false;
      cloud.next = clock + 500 + rand() * 600;
    }
  }

  function bolt(p) {
    var a = project(cloud.x, cloud.y + 0.2, cloud.z), b = project(p.x, 0.05, p.z);
    var svg = $("bolts"), pts = [];
    for (var i = 0; i <= 8; i++) {
      var k = i / 8, j = i === 0 || i === 8 ? 0 : (rand() - 0.5) * 70 * L.u;
      pts.push((a.x + (b.x - a.x) * k + j) + "," + (a.y + (b.y - a.y) * k));
    }
    var lines = [["#7fd8ff", 22, 0.35], ["#bff0ff", 10, 0.8], ["#ffffff", 4, 1]].map(function (s) {
      var l = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      l.setAttribute("points", pts.join(" "));
      l.setAttribute("stroke", s[0]);
      l.setAttribute("stroke-width", s[1] * L.u);
      l.setAttribute("opacity", s[2]);
      svg.appendChild(l);
      return l;
    });
    var f = $("flash");
    tween(STRIKE_MS, function (k) { f.style.opacity = 0.35 * (1 - k); lines.forEach(function (l) { l.style.opacity = 1 - k * k; }); },
      function () { lines.forEach(function (l) { l.remove(); }); f.style.opacity = 0; });
    burst(p.x, 0.1, p.z, "#9fe6ff", 10);
    vibrate(20);
  }

  // ---- pickups and rings -----------------------------------------------------------------------
  function checkPicks() {
    var cy = boy.y + BOY_H / 2;
    picks.forEach(function (p) {
      if (p.got || boy.alpha < 0.5) return;
      if (Math.abs(p.x - boy.x) < 0.42 && Math.abs(p.z - boy.z) < 0.4 && p.y > boy.y - 0.1 && p.y < boy.y + BOY_H + 0.15) {
        p.got = true;
        var s = project(p.x, p.y + p.h / 2, p.z);
        p.el.remove();
        var isCoin = p.kind === "coin";
        if (isCoin) { coinsGot++; profile.coins += COIN_VALUE; } else { gemsGot++; profile.gems += GEM_VALUE; }
        flyToHud(isCoin ? A + "hud_coin.webp" : A + "hud_gem.webp", s, isCoin ? "iconCoin" : "iconGem", function () {
          bump(isCoin ? "coins" : "gems", isCoin ? profile.coins : profile.gems);
        });
        pop(s.x, s.y - 30 * L.u, isCoin ? "+" + COIN_VALUE : "+" + GEM_VALUE);
        burst(p.x, p.y, p.z, isCoin ? "#ffd84a" : "#e27bff", 8);
      }
    });
    rings.forEach(function (r) {
      if (r.got || boy.alpha < 0.5) return;
      if (Math.abs(r.x - boy.x) < 0.45 && Math.abs(r.z - boy.z) < 0.4 && Math.abs(r.y - cy) < 0.55) {
        r.got = true;
        tokens++;
        var s = project(r.x, r.y, r.z);
        r.el.remove();
        pop(s.x, s.y, "+1 token");
        burst(r.x, r.y, r.z, "#ffd84a", 12);
        vibrate(10);
      }
    });
  }

  // ---- effects -------------------------------------------------------------------------------
  function burst(X, Y, Z, color, n) {
    var p = project(X, Y, Z);
    for (var i = 0; i < n; i++) {
      (function () {
        var s = el("div", "spark", fx);
        s.style.setProperty("--c", color);
        var a = rand() * Math.PI * 2, d = (60 + rand() * 140) * L.u, sc = 0.6 + rand() * 0.9, up = 40 * L.u;
        tween(520 + rand() * 300, function (k) {
          var e = easeOut(k);
          s.style.transform = "translate(" + (p.x + Math.cos(a) * d * e) + "px," + (p.y + Math.sin(a) * d * 0.6 * e - up * e) + "px) scale(" + sc * (1 - k * 0.6) + ")";
          s.style.opacity = 1 - k * k;
        }, function () { s.remove(); });
      })();
    }
  }

  function pop(x, y, text, cls) {
    var e = el("div", "pop" + (cls ? " " + cls : ""), fx);
    e.textContent = text;
    tween(900, function (k) {
      e.style.transform = "translate(" + x + "px," + (y - 70 * L.u * easeOut(k)) + "px) translate(-50%,-50%) scale(" + (0.6 + 0.5 * Math.min(1, k * 4)) + ")";
      e.style.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
    }, function () { e.remove(); });
  }

  function flyToHud(src, from, iconId, done) {
    var r = $(iconId).getBoundingClientRect();
    var e = el("img", "flyer", fx);
    e.src = src;
    var size = r.width;
    e.style.width = size + "px";
    var tx = r.left, ty = r.top;
    tween(620, function (k) {
      var e2 = k * k, x = from.x - size / 2 + (tx - from.x + size / 2) * e2, y = from.y - size / 2 + (ty - from.y + size / 2) * e2 - Math.sin(k * Math.PI) * 60 * L.u;
      e.style.transform = "translate(" + x + "px," + y + "px) scale(" + (1.3 - 0.3 * k) + ")";
    }, function () { e.remove(); if (done) done(); });
  }

  // Keep a number inside its pill (a 6-digit wallet is wider than the mockup's "2,680").
  var FIT = { time: 150, coins: 104, gems: 80 };
  function setNum(id, text) {
    var n = $(id);
    n.textContent = text;
    n.style.fontSize = "";
    var max = FIT[id] * L.u, w = n.offsetWidth;
    if (w > max) n.style.fontSize = 42 * L.u * max / w + "px";
  }

  function bump(id, v) {
    var n = $(id);
    setNum(id, window.RCProfile.num(v));
    n.classList.remove("bump");
    void n.offsetWidth;
    n.classList.add("bump");
  }

  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } }

  function chip(color) { return '<span class="c" style="background:' + HEX[color] + '">' + NAMES[color] + "</span>"; }

  function setSprite(kind) {
    if (boy.sprite === kind) return;
    boy.sprite = kind;
    boy.bb.img.src = A + (kind === "run" ? "boy_run" : "boy_jump") + ".webp";
    boy.bb.w = BOY_H * BOY_AR[kind];
  }

  // ---- banner, stage panel, hearts, journey --------------------------------------------------------
  function say(text, cls, ms) {
    var b = $("banner");
    $("bannerText").innerHTML = Array.isArray(text) ? text[0] + "<small>" + text[1] + "</small>" : text;
    b.classList.remove("warn", "win");
    if (cls) b.classList.add(cls);
    clearTimeout(bannerTimer);
    bannerTimer = null;
    if (ms) bannerTimer = setTimeout(function () { bannerTimer = null; if (mode !== "done" && mode !== "gate") stageSay(); }, ms);
  }

  function stageSay() {
    var st = STAGES[stage];
    var i1 = $("bannerIcon"), i2 = $("bannerIcon2");
    i1.hidden = !st.icon;
    if (st.icon) i1.src = A + st.icon + ".webp";
    i2.hidden = !st.icon2;
    if (st.icon2) i2.src = A + st.icon2 + ".webp";
    $("banner").classList.toggle("icon2", !!st.icon2);
    say(st.say);
  }

  function enterStage(i) {
    stage = i;
    var st = STAGES[i];
    screen.classList.toggle("dark", !!st.dark);
    if (i === 4) cloud.next = clock + 1800;          // the cloud swoops in before its first strike
    $("seqTitle").textContent = st.title;
    $("seqOrbs").hidden = i !== 0;
    $("pips").hidden = i === 0;
    stageSay();
    if (i > 0) {
      var pop2 = $("stagePop"), ic = $("stagePopIcon");
      ic.hidden = !st.icon;
      if (st.icon) ic.src = A + st.icon + ".webp";
      $("stagePopTitle").innerHTML = '<div class="stageNo">STAGE ' + (i + 1) + " OF " + STAGES.length + "</div>" + st.title;
      $("stagePopTip").textContent = st.tip;
      pop2.classList.add("show");
      setTimeout(function () { pop2.classList.remove("show"); }, 1700);
    }
    var pips = $("pips");
    pips.innerHTML = "";
    for (var n = stageStart[i]; n < stageStart[i + 1]; n++) el("i", "", pips);
  }

  function buildSeq() {
    var b = $("seqOrbs");
    b.innerHTML = "";
    SEQ.forEach(function (c, i) {
      var o = el("div", "orb", b);
      var im = el("img", "", o);
      im.src = A + "orb_" + c + ".webp";
      im.alt = NAMES[c];
      if (i < SEQ.length - 1) el("div", "arrow", b);
    });
    $("steps").textContent = STAGES.length;
    var j = $("journey");
    stageStart.slice(1, -1).forEach(function (s) {
      var t = el("div", "tick", j);
      t.style.left = (s / (steps.length - 1)) * 100 + "%";
    });
  }

  function updateHud() {
    var at = boy.on ? boy.on.step : 0;
    Array.prototype.forEach.call(document.querySelectorAll("#seqOrbs .orb"), function (o, i) {
      o.classList.toggle("done", stage > 0 || i <= at);
      o.classList.toggle("next", stage === 0 && i === at + 1);
    });
    Array.prototype.forEach.call($("pips").children, function (p, i) {
      var n = stageStart[stage] + i;
      p.className = n < at ? "done" : n === at ? "now" : "";
    });
    $("step").textContent = stage + 1;
    var f = Math.min(1, at / (steps.length - 1));
    $("journeyFill").style.width = "calc(" + (f * 100) + "% - " + (10 * f) * L.u + "px)";
    $("journeyDot").style.left = f * 100 + "%";
  }

  function updateHearts(hit) {
    Array.prototype.forEach.call($("hearts").children, function (h, i) { h.classList.toggle("lost", i >= hearts); });
    $("hearts").setAttribute("aria-label", hearts + (hearts === 1 ? " heart" : " hearts") + " left");
    if (hit) {
      var hs = $("hearts");
      hs.classList.remove("hit");
      void hs.offsetWidth;
      hs.classList.add("hit");
    }
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1900);
  }

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  // The block the hint points at: the right colour, the real one of a fake pair, the one the cloud
  // isn't about to strike. None at a fork (that choice is the player's).
  function bestNext() {
    if (!boy.on) return null;
    var c = boy.on.next.filter(function (p) { return !p.gone && p.route !== "secret"; });
    if (c.length > 1 && c.some(function (p) { return p.entry; })) return null;
    var ok = c.filter(function (p) {
      if (p.kind === "color") return p.color === SEQ[p.step];
      if (p.kind === "fake") return false;
      if (cloud.target === p) return false;
      return true;
    });
    return ok[0] || null;
  }

  // ---- per-frame render ------------------------------------------------------------------------
  function render() {
    if (!boy) return;
    var u = L.u, k = L.k;

    // idle bounce on the jelly (the boy never quite stands still)
    var contact = 0;
    if (!boy.air && mode !== "done") {
      var ph = ((clock - boy.landT) / 640) % 1;
      boy.y = 0.055 * 4 * ph * (1 - ph);
      contact = Math.max(0, 1 - Math.min(ph, 1 - ph) / 0.12);
    }
    var sinceLand = clock - boy.landT;
    var squash = Math.max(contact * 0.5, sinceLand < 260 ? Math.exp(-sinceLand / 90) : 0);

    world.style.transform = "translate3d(" + (L.ax + VX * u - k * cam.x) + "px," + (L.ay + VY * u + k * CAM_Y) + "px," + (F * u + k * cam.z) + "px)";

    // backdrop: slow zoom toward the vanishing point as the boy advances, slight side parallax
    var zb = 1 + 0.004 * Math.max(0, boy.z), sx = -(cam.x - X_BASE) * 22 * u;
    var ox = VX * u, oy = (EXT_T + VY) * u;
    $("bg").style.transform = "translate(" + (ox * (1 - zb) + sx) + "px," + (oy * (1 - zb)) + "px) scale(" + zb + ")";

    var hintOn = clock > hintAt && mode === "play";
    var tgt = hintOn ? bestNext() : null;
    plats.forEach(function (p) {
      if (p.gone) return;
      var zc = p.z - cam.z;
      var vis = zc > 0.9 && zc < 34;
      if (!vis) { if (p.el) p.el.style.display = "none"; return; }
      ensureTile(p);
      p.el.style.display = "";
      var dip = p === boy.on ? -0.025 * squash : 0;
      if (p === tgt) dip += 0.035 * (1 + Math.sin(clock / 150));
      var tf = t3(p.x + p.dx, dip + p.dy, p.z);
      if (p.roll) tf += " translate3d(0," + (BLOCK.h / 2 * k) + "px,0) rotateZ(" + p.roll + "deg) translate3d(0," + (-BLOCK.h / 2 * k) + "px,0)";
      p.el.style.transform = tf;
      var warned = cloud.target === p;
      var glow = p.red || (warned ? 0.55 + 0.45 * Math.sin(clock / 60) : 0) || (p === tgt ? 0.6 + 0.4 * Math.sin(clock / 150) : 0) ||
        (p.entry && p.route === "secret" && !secretFound ? 0.3 + 0.3 * Math.sin(clock / 240) : 0) || p.flash;
      if (p.flash > 0) p.flash = Math.max(0, p.flash - 0.04);
      p.glowEl.style.opacity = glow;
      p.glowEl.classList.toggle("red", !!p.red || warned);
      if (p.fade < 1) p.faces.forEach(function (f) { f.style.opacity = p.fade; });
      if (p.kind === "fake" && !p.red) p.faces[0].style.opacity = 0.82 + 0.18 * Math.sin(clock / 170 + p.id);   // it flickers
    });

    // pickups hover and spin; passed ones fade out
    picks.forEach(function (p) {
      if (p.got) return;
      var zc = p.z - cam.z, vis = Math.min(1, (zc - (Z_REST - 0.9)) / 0.5, (34 - zc) / 4);
      p.el.style.display = vis > 0 ? "" : "none";
      if (vis <= 0) return;
      p.img.style.opacity = vis;
      placeBB(p, p.x, p.y + Math.sin(clock / 380 + p.phase) * 0.04, p.z);
      p.img.style.transform = p.kind === "coin" ? "rotateY(" + ((clock / 6 + p.phase * 57) % 360) + "deg)" : "rotateY(" + Math.sin(clock / 700 + p.phase) * 25 + "deg)";
    });
    rings.forEach(function (r) {
      if (r.got) return;
      var zc = r.z - cam.z, vis = Math.min(1, (zc - (Z_REST - 1.2)) / 0.5, (34 - zc) / 4);
      r.el.style.display = vis > 0 ? "" : "none";
      if (vis <= 0) return;
      r.img.style.opacity = vis;
      placeBB(r, r.x, r.y - r.h / 2 + Math.sin(clock / 420 + r.phase) * 0.05, r.z);
      r.img.style.transform = "rotateY(" + Math.sin(clock / 600 + r.phase) * 35 + "deg)";
    });
    scenery.forEach(function (s) {
      var zc = s.z - cam.z, vis = Math.min(1, (zc - 1.5) / 1.5, (38 - zc) / 6);
      s.el.style.display = vis > 0 ? "" : "none";
      if (vis <= 0) return;
      s.img.style.opacity = vis;
      placeBB(s, s.x, s.y + Math.sin(clock / 1500 + s.phase) * 0.08, s.z);
    });

    // the gate: far away all level long, glowing once he reaches the last block
    placeBB(gate, gate.x, 0, gate.z);
    gate.img.style.filter = mode === "gate" ? "brightness(" + (1.08 + 0.12 * Math.sin(clock / 220)) + ") saturate(1.15)" : "";
    // laser orb over the dark zone, cloud monster over the rainbow road
    var oz = orb.z - cam.z;
    orb.el.style.display = oz > 1 && oz < 34 && stage >= 2 && stage <= 4 ? "" : "none";
    placeBB(orb, orb.x, 1.9 + Math.sin(clock / 700) * 0.1, orb.z, " scale(" + (1 + 0.05 * Math.sin(clock / 180)) + ")");
    cloud.el.style.display = cloud.alpha > 0.02 ? "" : "none";
    cloud.img.style.opacity = cloud.alpha;
    placeBB(cloud, cloud.x, cloud.y, cloud.z);
    var wt = cloud.target && !cloud.struck ? cloud.target : null;
    warnMark.el.style.display = wt ? "" : "none";
    if (wt) placeBB(warnMark, wt.x, 0.3 + 0.05 * Math.sin(clock / 90), wt.z);

    // the boy (a billboard) and his shadow on the block under him
    var sy = 1 - 0.1 * squash, sxx = (1 + 0.07 * squash) * (boy.flip ? -1 : 1);
    boy.bb.img.style.opacity = boy.alpha;
    placeBB(boy.bb, boy.x, boy.y, boy.z, " scale(" + sxx + "," + sy + ")");
    boy.bb.el.style.transformOrigin = "50% 100%";
    var under = null;
    if (boy.alpha > 0.5) plats.forEach(function (p) {
      if (!p.gone && Math.abs(p.x - boy.x) < BLOCK.w / 2 && Math.abs(p.z - boy.z) < BLOCK.d / 2 && !p.roll) under = p;
    });
    shadowEl.style.display = under ? "" : "none";
    if (under) {
      var hs = Math.max(0.35, 1 - boy.y * 0.6);
      shadowEl.style.transform = t3(boy.x - 0.24 * hs, 0.012 + under.dy, boy.z + 0.12 * hs) + " rotateX(90deg) scale(" + hs + ")";
      shadowEl.style.opacity = hs;
    }

    // hint arrow bobbing over the block to jump on
    marker.style.display = tgt ? "" : "none";
    if (tgt) {
      marker.style.setProperty("--c", HEX[tgt.style] || "#fff");
      marker.style.transform = t3(tgt.x - 0.1, 0.3 + tgt.dy + 0.06 * Math.abs(Math.sin(clock / 260)), tgt.z);
    }

    var ts = fmtTime(elapsed);
    if ($("time").textContent !== ts) $("time").textContent = ts;
  }

  function tick(now) {
    var dt = Math.min(50, now - (last || now));
    last = now;
    if (!paused) {
      clock += dt;
      if (timing) elapsed += dt;
      runTweens();
      updateWorld(dt);
      checkPicks();
      var a = 1 - Math.exp(-dt / CAM_LAG);
      cam.x += (X_BASE + FOLLOW * boy.x - cam.x) * a;
      cam.z += (boy.z - Z_REST - cam.z) * a;
    }
    render();
    if (running) requestAnimationFrame(tick);
  }

  // ---- input ---------------------------------------------------------------------------------
  function tileHit(p, cx, cy) {
    var pts = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(function (c) {
      return project(p.x + c[0] * BLOCK.w / 2, 0, p.z + c[1] * BLOCK.d / 2);
    });
    pts.push(project(p.x - BLOCK.w / 2, -0.3, p.z - BLOCK.d / 2), project(p.x + BLOCK.w / 2, -0.3, p.z - BLOCK.d / 2));
    var x0 = Math.min.apply(null, pts.map(function (v) { return v.x; })), x1 = Math.max.apply(null, pts.map(function (v) { return v.x; }));
    var y0 = Math.min.apply(null, pts.map(function (v) { return v.y; })), y1 = Math.max.apply(null, pts.map(function (v) { return v.y; }));
    var dx = Math.max(x0 - cx, 0, cx - x1), dy = Math.max(y0 - cy - 60 * L.u, 0, cy - y1);   // a little extra above
    return Math.hypot(dx, dy);
  }

  function onTap(e) {
    if (paused) return;
    if (!timing && mode !== "done") timing = true;
    if (mode === "gate") { leapIntoGate(); return; }
    if (mode !== "play" || !boy.on) return;
    var best = null, bestD = Infinity;
    boy.on.next.forEach(function (p) {
      if (p.gone) return;
      var d = tileHit(p, e.clientX, e.clientY);
      if (d < bestD) { bestD = d; best = p; }
    });
    if (best && bestD < 140 * L.u) choose(best);
  }

  function onKey(e) {
    if (e.key === "Escape" || e.key === "p") { setPaused(!paused); return; }
    if (paused) return;
    if (!timing && mode !== "done") timing = true;
    if (mode === "gate" && (e.key === " " || e.key === "Enter" || e.key === "ArrowUp")) { leapIntoGate(); return; }
    if (mode !== "play" || !boy.on) return;
    var c = boy.on.next.filter(function (p) { return !p.gone; }).sort(function (a, b) { return a.x - b.x; });
    if (!c.length) return;
    if (e.key === "ArrowLeft") choose(c[0]);
    if (e.key === "ArrowRight") choose(c[c.length - 1]);
    if (e.key === "ArrowUp" || e.key === " ") choose(bestNext() || c[0]);
  }

  function setPaused(p) {
    if (mode === "done" || mode === "over") return;
    paused = p;
    $("pause").hidden = !p;
  }

  function goHome() { location.href = "index.html"; }
  function restart() { location.reload(); }

  function wireButtons() {
    scene.addEventListener("pointerdown", onTap);
    window.addEventListener("keydown", onKey);
    document.querySelectorAll(".btn, .mbtn").forEach(function (b) {
      b.addEventListener("pointerdown", function (e) { e.stopPropagation(); b.classList.add("pressed"); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { b.addEventListener(ev, function () { b.classList.remove("pressed"); }); });
    });
    $("btnPause").addEventListener("click", function () { vibrate(10); setPaused(true); });
    document.addEventListener("click", function (e) {
      var c = e.target.closest && e.target.closest("[data-cmd]");
      if (!c) return;
      vibrate(10);
      var cmd = c.dataset.cmd;
      if (cmd === "resume") setPaused(false);
      if (cmd === "restart") restart();
      if (cmd === "retry") retry();
      if (cmd === "home") goHome();
    });
    $("btnNext").addEventListener("click", function () { vibrate(12); toast("Level 2 is on its way! This preview has Level 1 only."); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && mode !== "done") setPaused(true); });
  }

  // ---- level complete ------------------------------------------------------------------------
  function showComplete() {
    mode = "done";
    timing = false;
    boy.bb.el.style.visibility = "hidden";
    stage = STAGES.length - 1;
    updateHud();
    var faults = heartsLost + mistakes;
    var stars = faults === 0 ? 3 : faults <= 2 ? 2 : 1;
    var perfect = faults === 0;
    profile.coins += CLEAR_BONUS + (perfect ? PERFECT_BONUS : 0);
    profile.tokens = (profile.tokens || 0) + tokens;
    var prev = profile.levels["1"] || {};
    profile.levels["1"] = {
      stars: Math.max(stars, prev.stars || 0),
      bestMs: prev.bestMs ? Math.min(prev.bestMs, elapsed) : elapsed,
      secret: !!(prev.secret || secretFound)
    };
    window.RCProfile.save(profile);
    bump("coins", profile.coins);

    var rowsEl = $("rows");
    rowsEl.innerHTML = "";
    [[A + "hud_coin.webp", "Coins", "+" + window.RCProfile.num(coinsGot * COIN_VALUE + CLEAR_BONUS)],
     [A + "hud_gem.webp", "Gems", "+" + gemsGot * GEM_VALUE],
     [A + "ring.webp", "Tokens", "+" + tokens],
     [A + "star_2.webp", "Perfect Bonus", perfect ? "+" + PERFECT_BONUS : "—"],
     [A + "gem_purple.webp", "Secret Discovery", secretFound ? "+1" : "0"]].forEach(function (r) {
      var row = el("div", "row", rowsEl);
      var im = el("img", "", row);
      im.src = r[0];
      im.alt = "";
      el("span", "", row).textContent = r[1];
      el("span", "v", row).textContent = r[2];
    });
    // star boxes on the card (panel pixels x 2)
    [[68, 88, 208, 252], [212, 76, 364, 232], [368, 112, 508, 256]].forEach(function (b, i) {
      var s = $("star" + (i + 1));
      s.style.left = "calc(" + b[0] + " * var(--cu))";
      s.style.top = "calc(" + b[1] + " * var(--cu))";
      s.style.width = "calc(" + (b[2] - b[0]) + " * var(--cu))";
      s.style.height = "calc(" + (b[3] - b[1]) + " * var(--cu))";
    });
    var d = $("done");
    d.hidden = false;
    requestAnimationFrame(function () { d.classList.add("show"); });
    $("bannerIcon").hidden = true;
    $("bannerIcon2").hidden = true;
    say("Level complete in " + fmtTime(elapsed) + "!", "win");
    [1, 2, 3].forEach(function (i) {
      setTimeout(function () {
        $("star" + i).classList.add(i <= stars ? "on" : "dim");
        if (i <= stars) vibrate(12);
      }, 450 + i * 280);
    });
    Array.prototype.forEach.call(rowsEl.children, function (r, i) {
      setTimeout(function () { r.classList.add("on"); }, 1400 + i * 160);
    });
  }

  // ---- start ---------------------------------------------------------------------------------
  function preload() {
    var files = ["boy_jump", "boy_run", "gate", "coin", "gem_purple", "gem_blue", "ring", "top_glow", "complete_card",
      "star_1", "star_2", "star_3", "btn_next", "cloud_monster", "laser_orb", "icon_warning", "icon_rotate", "icon_up",
      "icon_fake", "icon_left", "icon_right", "island_1", "island_2", "island_3", "island_4", "island_5"];
    SEQ.forEach(function (c) { files.push("top_" + c, "front_" + c, "side_" + c, "orb_" + c); });
    ["rainbow", "stone", "stonefake", "gold", "goldfake", "ice"].forEach(function (c) { files.push("top_" + c, "front_" + c, "side_" + c); });
    return Promise.all(files.map(function (f) {
      return new Promise(function (res) { var i = new Image(); i.onload = i.onerror = res; i.src = A + f + ".webp"; });
    }));
  }

  function start() {
    $("lvl").textContent = profile.level;
    $("xpFill").style.width = Math.round(profile.xp * 100) + "%";
    buildLevel();
    buildSeq();
    checkpoint = steps[0].plats[0];
    enterStage(0);
    updateHud();
    updateHearts(false);
    hintAt = 1600;                                   // first row: show which block to jump on
    cam.x = X_BASE + FOLLOW * boy.x;
    cam.z = boy.z - Z_REST;
    layout();
    wireButtons();
    window.addEventListener("resize", layout);
    running = true;
    requestAnimationFrame(tick);
  }

  function screenOf(p) { return project(p.x, 0, p.z); }

  // Test / preview hooks (used by scripts/level1_preview.mjs).
  window.RCLevel1 = {
    state: function () {
      return { mode: mode, stage: stage, step: boy.on ? boy.on.step : -1, steps: steps.length, hearts: hearts, heartsLost: heartsLost,
        mistakes: mistakes, coins: coinsGot, gems: gemsGot, tokens: tokens, secret: secretFound, elapsed: elapsed };
    },
    // What a careful player would tap right now ({x, y} on screen), or null to wait.
    // route: "safe" | "gold" at the fork, "secret" to take the secret route.
    bot: function (route) {
      if (mode === "gate") return { x: L.W / 2, y: L.H * 0.45 };
      if (mode !== "play" || !boy.on) return null;
      var c = boy.on.next.filter(function (p) { return !p.gone; });
      var t = null;
      if (route) t = c.filter(function (p) { return p.entry && p.route === route; })[0] || null;
      if (!t && c.some(function (p) { return p.entry && p.route !== "secret"; })) t = c.filter(function (p) { return p.route === (route === "gold" ? "gold" : "safe"); })[0];
      if (!t) t = bestNext();
      if (!t) return null;
      if (t.kind === "rotate" && !(flatAt(t, t.t + JUMP_MS) && flatAt(t, t.t + JUMP_MS + 150))) return null;
      if (t.kind === "move" && Math.abs(moveX(t, clock + JUMP_MS) - (t.x + moveX(t, clock + JUMP_MS)) / 2) > 0.3) return null;
      if (cloud.target === t || (stage === 4 && !cloud.target && clock > cloud.next - JUMP_MS - 100)) return null;
      return screenOf(t);
    },
    tapFor: function (row, i) { return screenOf(steps[row].plats[i]); },
    isFake: function (row, i) { var p = steps[row].plats[i]; return p.kind === "fake" && !p.gone; },
    wrongColor: function () {
      if (!boy.on) return null;
      var w = boy.on.next.filter(function (p) { return p.kind === "color" && p.color !== SEQ[p.step]; })[0];
      return w ? screenOf(w) : null;
    },
    // jump straight to the start of a stage (for screenshots)
    goto: function (i) {
      var p = steps[stageStart[i]].plats[0];
      boy.x = p.x; boy.z = p.z + STAND; boy.y = 0; boy.air = false; boy.on = p; boy.alpha = 1;
      cam.x = X_BASE + FOLLOW * boy.x; cam.z = boy.z - Z_REST;
      checkpoint = p;
      picks.forEach(function (pk) { if (pk.z < p.z - 0.5 && !pk.got) { pk.got = true; pk.el.remove(); } });
      rings.forEach(function (r) { if (r.z < p.z - 0.5 && !r.got) { r.got = true; r.el.remove(); } });
      mode = "play";
      enterStage(i);
      updateHud();
      hintAt = clock + 6000;
    },
    // freeze a moment of the opening jump (like the direction image) for screenshots
    pose: function (k) {
      var s1 = steps[1].plats.filter(function (p) { return p.color === SEQ[1]; })[0], s0 = steps[0].plats[0];
      boy.air = true; boy.on = null;
      var e = easeIO(k);
      boy.x = s0.x + (s1.x - s0.x) * e; boy.z = STAND + s1.z * e; boy.y = 0.8 * 4 * k * (1 - k);
      boy.flip = s1.x < s0.x - 0.2;
      cam.x = X_BASE + FOLLOW * s0.x; cam.z = -Z_REST;
      paused = true;
      render();
    },
    pause: function (p) { paused = p; },
    elapsed: function (ms) { elapsed = ms; render(); }
  };

  start();
  Promise.all([document.fonts.ready, preload()]).then(function () {
    layout();
    screen.classList.add("ready");
    document.body.dataset.ready = "1";
  });
})();
