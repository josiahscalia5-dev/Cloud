/*
 * Rainbow Cascades - Level 1: "Follow the Color Sequence!"
 *
 * The boy stands on a red jelly block. Each row ahead has two blocks; he must hop onto the one
 * whose colour comes next in the sequence (red, yellow, blue, green, purple, pink), then leap
 * into the Rainbow Gate. A wrong block wobbles, throws him back and drops into the clouds.
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
    seq: [147, 111, 795, 254]
  };
  var TEXT_X = { time: 130, coins: 112, gems: 96 };   // centre of the number inside its pill
  var ART = { banner: [115, 1524, 827, 1610], fgBush: [0, 1378.75, 230, 1672] };   // sit on the art
  var ORB_X = [171.25, 267.25, 360.25, 453.75, 546.25, 638.75], ORB_Y = 177.25, ORB_W = 67.75;

  // ---- camera and world --------------------------------------------------------------------
  var F = 1560, VX = 800, VY = 380, CAM_Y = 1.85;
  var Z_REST = 3.2;                // the boy's block sits this far in front of the camera
  var X_BASE = 0.95, FOLLOW = 0.8; // camera x = X_BASE + FOLLOW * boy x (keeps both lanes in view)
  var CAM_LAG = 110;               // ms: the camera eases after the boy, so his jumps read on screen
  var BLOCK = { w: 0.8, d: 0.62 };
  var LANE = 0.46, ROW_DZ = 1.3;
  var BOY_H = 0.88, BOY_W = BOY_H * 462 / 655;
  var STAND = -0.1;                // he lands a little in front of a block's centre
  var GATE = { x: 0.35, z: 8.9, h: 2.75, w: 2.75 * 866 / 1100 };
  var SEQ = ["red", "yellow", "blue", "green", "purple", "pink"];
  var NAMES = { red: "RED", yellow: "YELLOW", blue: "BLUE", green: "GREEN", purple: "PURPLE", pink: "PINK" };
  var HEX = { red: "#ff3a55", yellow: "#ffd21a", blue: "#27a8ff", green: "#3ee04f", purple: "#b058ff", pink: "#ff5fd2" };
  var STEPS = SEQ.length + 1;      // six colours, then the gate
  var COIN_VALUE = 25, GEM_VALUE = 5, CLEAR_BONUS = 50, PERFECT_BONUS = 100;

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

  // ---- level -------------------------------------------------------------------------------
  var rows = [], picks = [], boy, gateEl, gateImg, shadowEl, marker;
  var laneX = function (lane) { return lane ? LANE : -LANE; };

  function makeTile(row, lane, color) {
    var t = { row: row, lane: lane, color: color, x: laneX(lane), z: row * ROW_DZ, dy: 0, dx: 0, fade: 1, gone: false, glow: 0, ring: 0 };
    t.el = el("div", "tile");
    var faces = [["top", "top_" + color], ["front", "front_" + color], ["side r", "side_" + color], ["side l", "side_" + color]];
    faces.forEach(function (f) {
      var e = el("div", "face " + f[0], t.el);
      e.style.backgroundImage = "url(" + A + f[1] + ".webp)";
    });
    t.glowEl = el("div", "face glow", t.el);
    t.ringEl = el("div", "face ring", t.el);
    t.faces = t.el.querySelectorAll(".face");
    return t;
  }

  function buildLevel() {
    world.innerHTML = "";
    rows = []; picks = [];
    // row 0: the red start block (left lane), with a spare block beside it
    var spare = SEQ.slice(1)[Math.floor(rand() * 5)];
    rows.push({ correct: 0, tiles: [makeTile(0, 0, "red"), makeTile(0, 1, spare)] });
    for (var i = 1; i < SEQ.length; i++) {
      var correct = rand() < 0.5 ? 0 : 1;
      var near = [SEQ[i + 1], SEQ[i - 1]].filter(Boolean);
      var others = SEQ.filter(function (c) { return c !== SEQ[i]; });
      var decoy = rand() < 0.6 ? near[Math.floor(rand() * near.length)] : others[Math.floor(rand() * others.length)];
      var r = { correct: correct, tiles: [] };
      r.tiles[correct] = makeTile(i, correct, SEQ[i]);
      r.tiles[1 - correct] = makeTile(i, 1 - correct, decoy);
      rows.push(r);
    }
    // pickups: over the right block on the first rows, then anywhere (a gem can be a trap)
    [["coin", 1, rows[1].correct], ["coin", 2, rows[2].correct], ["gem_purple", 3, rand() < 0.5 ? 0 : 1],
     ["coin", 4, rand() < 0.5 ? 0 : 1], ["gem_blue", 5, rows[5].correct]].forEach(function (p) {
      addPick(p[0], laneX(p[2]), 0.62, p[1] * ROW_DZ);
    });
    // coins along the leap into the gate
    var x0 = laneX(rows[5].correct), z0 = 5 * ROW_DZ, x1 = GATE.x, z1 = GATE.z - 0.15;
    [0.32, 0.52, 0.72].forEach(function (f) {
      var k = f < 0.5 ? Math.sqrt(f / 2) : 1 - Math.sqrt((1 - f) / 2);
      addPick("coin", x0 + (x1 - x0) * f, 1.35 * 4 * k * (1 - k) + 0.4, z0 + (z1 - z0) * f);
    });

    gateEl = el("div", "gate");
    gateImg = el("img", "", gateEl);
    gateImg.src = A + "gate.webp";
    gateImg.style.width = "100%"; gateImg.style.height = "100%";

    shadowEl = el("div", "shadow");
    marker = el("div", "marker");
    el("div", "arrowShape", marker);
    boy = { x: laneX(0), y: 0, z: STAND, row: 0, lane: 0, air: false, flip: false, landT: -1e9, squash: 0 };
    boy.el = el("div", "boy");
    var img = el("img", "", boy.el);
    img.src = A + "boy_jump.webp";
    img.style.width = "100%"; img.style.height = "100%";
  }

  function addPick(kind, x, y, z) {
    var size = kind === "coin" ? 0.3 : 0.36;
    var src = kind === "coin" ? "coin" : kind;
    var aspect = { coin: 94 / 133, gem_purple: 112 / 172, gem_blue: 144 / 214 }[src];
    var p = { kind: kind, x: x, y: y, z: z, h: size, w: size * aspect, got: false, phase: rand() * 6.28 };
    p.el = el("div", "pick");
    p.img = el("img", "", p.el);
    p.img.src = A + src + ".webp";
    p.img.style.width = "100%"; p.img.style.height = "100%";
    picks.push(p);
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
  var mode = "play";               // play | busy | gate | done
  var mistakes = 0, coinsGot = 0, gemsGot = 0;
  var hintAt = 0, bannerTimer = null;

  function currentTile() { return rows[boy.row].tiles[boy.lane]; }
  function targetTile() { var r = rows[boy.row + 1]; return r && r.tiles[r.correct]; }

  function jumpTo(X, Z, peak, dur, done) {
    var x0 = boy.x, z0 = boy.z, y0 = boy.y;
    if (X < x0 - 0.2) boy.flip = true; else if (X > x0 + 0.2) boy.flip = false;
    boy.air = true;
    tween(dur, function (k) {
      var e = easeIO(k);
      boy.x = x0 + (X - x0) * e;
      boy.z = z0 + (Z - z0) * e;
      boy.y = y0 * (1 - k) + peak * 4 * k * (1 - k);
    }, function () { boy.air = false; boy.y = 0; boy.landT = clock; if (done) done(); });
  }

  function choose(t) {
    if (mode !== "play" || !t || t.gone) return;
    mode = "busy";
    hintAt = Infinity;
    var from = currentTile();
    jumpTo(t.x, t.z + STAND, 0.8, 560, function () {
      if (t.color === SEQ[boy.row + 1]) land(t);
      else wrong(t, from);
    });
  }

  function land(t) {
    boy.row = t.row; boy.lane = t.lane;
    burst(t.x, 0.05, t.z, HEX[t.color], 16);
    t.ring = 1;
    vibrate(15);
    updateSeq();
    if (boy.row === SEQ.length - 1) {
      mode = "gate";
      say("Now leap into the <b>Rainbow Gate!</b>", "win");
      screen.classList.add("gateOpen");
      hintAt = clock + 2500;
    } else {
      mode = "play";
      hintAt = clock + 6000;
      if (!bannerTimer) say("Jump on the matching colors in order!");
    }
  }

  function wrong(t, back) {
    mistakes++;
    vibrate([35, 50, 35]);
    var want = SEQ[boy.row + 1];
    say("That's " + chip(t.color) + "! Find " + chip(want) + ".", "warn", 2600);
    var p = project(t.x, 0.9, t.z);
    pop(p.x, p.y, "✖", "bad");
    tween(420, function (k) { t.dx = Math.sin(k * Math.PI * 6) * 0.05 * (1 - k); t.red = 1 - k * 0.3; });
    wait(380, function () {
      jumpTo(back.x, back.z + STAND, 0.6, 460, function () {
        mode = "play";
        hintAt = clock + 900;
      });
      tween(900, function (k) { t.dy = -3.2 * k * k; t.fade = 1 - k; }, function () { t.gone = true; t.el.remove(); });
    });
  }

  function leapIntoGate() {
    if (mode !== "gate") return;
    mode = "busy";
    hintAt = Infinity;
    vibrate(20);
    jumpTo(GATE.x, GATE.z - 0.15, 1.35, 1100, function () {});
    wait(650, function () {
      burst(GATE.x, 0.8, GATE.z - 0.3, "#ffffff", 30);
      var f = $("flash");
      tween(520, function (k) { f.style.opacity = easeOut(k); }, function () {
        showComplete();
        tween(700, function (k) { f.style.opacity = 1 - k; });
      });
    });
  }

  // ---- pickups -------------------------------------------------------------------------------
  function checkPicks() {
    picks.forEach(function (p) {
      if (p.got) return;
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

  function say(html, cls, ms) {
    var b = $("banner");
    $("bannerText").innerHTML = html;
    b.classList.remove("warn", "win");
    if (cls) b.classList.add(cls);
    clearTimeout(bannerTimer);
    bannerTimer = null;
    if (ms) bannerTimer = setTimeout(function () {
      bannerTimer = null;
      if (mode === "play" || mode === "busy") say("Jump on the matching colors in order!");
    }, ms);
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1900);
  }

  // ---- HUD -----------------------------------------------------------------------------------
  function buildSeq() {
    var box = $("seqOrbs");
    box.innerHTML = "";
    SEQ.forEach(function (c, i) {
      var o = el("div", "orb", box);
      var im = el("img", "", o);
      im.src = A + "orb_" + c + ".webp";
      im.alt = NAMES[c];
      if (i < SEQ.length - 1) el("div", "arrow", box);
    });
    $("steps").textContent = STEPS;
  }

  function updateSeq() {
    var orbs = document.querySelectorAll("#seqOrbs .orb");
    Array.prototype.forEach.call(orbs, function (o, i) {
      o.classList.toggle("done", i <= boy.row);
      o.classList.toggle("next", i === boy.row + 1);
    });
    $("step").textContent = Math.min(STEPS, boy.row + 1 + (mode === "done" ? 1 : 0));
  }

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
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
    var zb = 1 + 0.018 * boy.z, sx = -(cam.x - X_BASE) * 22 * u;
    var ox = VX * u, oy = (EXT_T + VY) * u;
    $("bg").style.transform = "translate(" + (ox * (1 - zb) + sx) + "px," + (oy * (1 - zb)) + "px) scale(" + zb + ")";

    var onTile = !boy.air ? currentTile() : null;
    var hintOn = clock > hintAt && (mode === "play" || mode === "gate");
    var tgt = targetTile();
    rows.forEach(function (r) {
      r.tiles.forEach(function (t) {
        if (t.gone) return;
        var zc = t.z - cam.z;
        var vis = zc > 0.9 && zc < 40;
        t.el.style.display = vis ? "" : "none";
        if (!vis) return;
        var dip = t === onTile ? -0.025 * squash : 0;
        var hint = hintOn && t === tgt && mode === "play";
        if (hint) dip += 0.035 * (1 + Math.sin(clock / 150));
        t.el.style.transform = t3(t.x + t.dx, dip + t.dy, t.z);
        var glow = t.red ? t.red : (hint ? 0.6 + 0.4 * Math.sin(clock / 150) : 0);
        t.glowEl.style.opacity = glow;
        t.glowEl.style.filter = t.red ? "sepia(1) saturate(9) hue-rotate(-50deg)" : "";
        if (t.ring > 0) {
          t.ring = Math.max(0, t.ring - 0.03);
          t.ringEl.style.opacity = t.ring;
          t.ringEl.style.transform = "translate3d(" + (-0.49375 * k) + "px," + (-0.006 * k) + "px," + (-0.40375 * k) + "px) rotateX(90deg) scale(" + (1 + (1 - t.ring) * 0.5) + ")";
        }
        if (t.fade < 1) for (var i = 0; i < t.faces.length; i++) if (!t.faces[i].classList.contains("glow")) t.faces[i].style.opacity = t.fade;
      });
    });

    // pickups: hover and spin
    picks.forEach(function (p) {
      if (p.got) return;
      var zc = p.z - cam.z, vis = Math.min(1, (zc - (Z_REST - 0.9)) / 0.5);   // passed ones fade out
      p.el.style.display = vis > 0 ? "" : "none";
      p.img.style.opacity = vis;
      var bob = Math.sin(clock / 380 + p.phase) * 0.04;
      p.el.style.transform = t3(p.x - p.w / 2, p.y + p.h + bob, p.z);
      p.el.style.width = p.w * k + "px";
      p.el.style.height = p.h * k + "px";
      p.img.style.transform = p.kind === "coin" ? "rotateY(" + ((clock / 6 + p.phase * 57) % 360) + "deg)" : "rotateY(" + Math.sin(clock / 700 + p.phase) * 25 + "deg)";
    });

    // the gate: glows once the last colour is done
    gateEl.style.width = GATE.w * k + "px";
    gateEl.style.height = GATE.h * k + "px";
    gateEl.style.transform = t3(GATE.x - GATE.w / 2, GATE.h, GATE.z);
    gateImg.style.filter = mode === "gate" ? "brightness(" + (1.08 + 0.12 * Math.sin(clock / 220)) + ") saturate(1.15)" : "";

    // the boy (a billboard) and his shadow on the block under him
    var sy = 1 - 0.1 * squash, sxx = (1 + 0.07 * squash) * (boy.flip ? -1 : 1);
    boy.el.style.width = BOY_W * k + "px";
    boy.el.style.height = BOY_H * k + "px";
    boy.el.style.transform = t3(boy.x - BOY_W / 2, boy.y + BOY_H, boy.z) + " scale(" + sxx + "," + sy + ")";
    var under = null;
    rows.forEach(function (r) {
      r.tiles.forEach(function (t) {
          if (!t.gone && Math.abs(t.x - boy.x) < BLOCK.w / 2 && Math.abs(t.z - boy.z) < BLOCK.d / 2) under = t;
      });
    });
    shadowEl.style.display = under ? "" : "none";
    if (under) {
      var hs = Math.max(0.35, 1 - boy.y * 0.6);
      shadowEl.style.transform = t3(boy.x - 0.24 * hs, 0.012 + under.dy, boy.z + 0.12 * hs) + " rotateX(90deg) scale(" + hs + ")";
      shadowEl.style.opacity = hs;
    }

    // hint arrow bobbing over the block to jump on
    var mt = hintOn && mode === "play" ? tgt : null;
    marker.style.display = mt ? "" : "none";
    if (mt) {
      marker.style.setProperty("--c", HEX[mt.color]);
      marker.style.transform = t3(mt.x - 0.1, 0.3 + mt.dy + 0.06 * Math.abs(Math.sin(clock / 260)), mt.z);
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
      checkPicks();
      var a = 1 - Math.exp(-dt / CAM_LAG);
      cam.x += (X_BASE + FOLLOW * boy.x - cam.x) * a;
      cam.z += (boy.z - Z_REST - cam.z) * a;
      if (mode === "gate" && clock > hintAt) {
        hintAt = Infinity;
        say("Tap anywhere to <b>leap into the gate!</b>", "win");
      }
    }
    render();
    if (running) requestAnimationFrame(tick);
  }

  // ---- input ---------------------------------------------------------------------------------
  function tileHit(t, cx, cy) {
    var pts = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(function (c) {
      return project(t.x + c[0] * BLOCK.w / 2, 0, t.z + c[1] * BLOCK.d / 2);
    });
    pts.push(project(t.x - BLOCK.w / 2, -0.3, t.z - BLOCK.d / 2), project(t.x + BLOCK.w / 2, -0.3, t.z - BLOCK.d / 2));
    var x0 = Math.min.apply(null, pts.map(function (p) { return p.x; })), x1 = Math.max.apply(null, pts.map(function (p) { return p.x; }));
    var y0 = Math.min.apply(null, pts.map(function (p) { return p.y; })), y1 = Math.max.apply(null, pts.map(function (p) { return p.y; }));
    var dx = Math.max(x0 - cx, 0, cx - x1), dy = Math.max(y0 - cy - 60 * L.u, 0, cy - y1);   // a little extra above
    return Math.hypot(dx, dy);
  }

  function onTap(e) {
    if (paused) return;
    if (!timing && mode !== "done") timing = true;
    if (mode === "gate") { leapIntoGate(); return; }
    if (mode !== "play") return;
    var r = rows[boy.row + 1];
    if (!r) return;
    var best = null, bestD = Infinity;
    r.tiles.forEach(function (t) {
      if (t.gone) return;
      var d = tileHit(t, e.clientX, e.clientY);
      if (d < bestD) { bestD = d; best = t; }
    });
    if (best && bestD < 140 * L.u) choose(best);
  }

  function onKey(e) {
    if (e.key === "Escape" || e.key === "p") { setPaused(!paused); return; }
    if (paused) return;
    if (!timing && mode !== "done") timing = true;
    if (mode === "gate" && (e.key === " " || e.key === "Enter" || e.key === "ArrowUp")) { leapIntoGate(); return; }
    var r = rows[boy.row + 1];
    if (!r || mode !== "play") return;
    if (e.key === "ArrowLeft") choose(r.tiles[0]);
    if (e.key === "ArrowRight") choose(r.tiles[1]);
  }

  function setPaused(p) {
    if (mode === "done") return;
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
      if (cmd === "home") goHome();
    });
    $("btnNext").addEventListener("click", function () { vibrate(12); toast("Level 2 is on its way! This preview has Level 1 only."); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && mode !== "done") setPaused(true); });
  }

  // ---- level complete ------------------------------------------------------------------------
  function showComplete() {
    mode = "done";
    timing = false;
    boy.el.style.visibility = "hidden";
    updateSeq();
    var stars = mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1;
    var perfect = mistakes === 0;
    var bonus = CLEAR_BONUS + (perfect ? PERFECT_BONUS : 0);
    profile.coins += bonus;
    var prev = profile.levels["1"] || {};
    profile.levels["1"] = {
      stars: Math.max(stars, prev.stars || 0),
      bestMs: prev.bestMs ? Math.min(prev.bestMs, elapsed) : elapsed
    };
    window.RCProfile.save(profile);
    bump("coins", profile.coins);

    var rowsEl = $("rows");
    rowsEl.innerHTML = "";
    [[A + "hud_coin.webp", "Coins", "+" + window.RCProfile.num(coinsGot * COIN_VALUE + CLEAR_BONUS)],
     [A + "hud_gem.webp", "Gems", "+" + gemsGot * GEM_VALUE],
     [A + "star_2.webp", "Perfect Bonus", perfect ? "+" + PERFECT_BONUS : "—"],
     [A + "hud_stopwatch.webp", "Time", fmtTime(elapsed)]].forEach(function (r) {
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
    say("Level complete!", "win");
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
    var files = ["boy_jump", "gate", "coin", "gem_purple", "gem_blue", "top_glow", "complete_card", "star_1", "star_2", "star_3", "btn_next"];
    SEQ.forEach(function (c) { files.push("top_" + c, "front_" + c, "side_" + c, "orb_" + c); });
    return Promise.all(files.map(function (f) {
      return new Promise(function (res) { var i = new Image(); i.onload = i.onerror = res; i.src = A + f + ".webp"; });
    }));
  }

  function start() {
    $("lvl").textContent = profile.level;
    $("xpFill").style.width = Math.round(profile.xp * 100) + "%";
    buildSeq();
    buildLevel();
    updateSeq();
    hintAt = 1600;                                   // first row: show which block to jump on
    cam.x = X_BASE + FOLLOW * boy.x;
    cam.z = boy.z - Z_REST;
    layout();
    wireButtons();
    window.addEventListener("resize", layout);
    running = true;
    requestAnimationFrame(tick);
  }

  // Test / preview hooks (used by scripts/level1_preview.mjs).
  window.RCLevel1 = {
    state: function () { return { mode: mode, row: boy.row, mistakes: mistakes, coins: coinsGot, gems: gemsGot, elapsed: elapsed, correct: rows[boy.row + 1] && rows[boy.row + 1].correct }; },
    choose: function (lane) { var r = rows[boy.row + 1]; if (r) choose(r.tiles[lane]); },
    tileScreen: function (row, lane) { var t = rows[row].tiles[lane]; return project(t.x, 0, t.z); },
    gate: leapIntoGate,
    // freeze a moment of the opening jump (like the direction image) for screenshots
    pose: function (k) {
      var t = rows[1].tiles[rows[1].correct];
      boy.air = true;
      var e = easeIO(k);
      boy.x = laneX(0) + (t.x - laneX(0)) * e; boy.z = STAND + t.z * e; boy.y = 0.8 * 4 * k * (1 - k);
      boy.flip = t.x < laneX(0) - 0.2;
      cam.x = X_BASE + FOLLOW * laneX(0); cam.z = -Z_REST;
      paused = true;
      render();
    },
    elapsed: function (ms) { elapsed = ms; render(); }
  };

  start();
  Promise.all([document.fonts.ready, preload()]).then(function () {
    layout();
    screen.classList.add("ready");
    document.body.dataset.ready = "1";
  });
})();
