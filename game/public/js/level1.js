/*
 * Rainbow Cascades - Level 1 screen, "Jump on the matching colors" (reference panel 2).
 *
 * The screen is the reference screen, reproduced as drawn: its artwork, framing, proportions and
 * HUD positions are kept exactly. Everything is positioned in "panel pixels" (P), the pixel grid
 * of the panel in the reference sheet (335 x 557); one P is `u` CSS pixels, chosen so the whole
 * reference screen fits the phone. Phones are taller than the reference (about 9:20 against
 * 3:5), so the reference screen is centred and the phone shows the sheet's navy above and below
 * it; nothing is added to the artwork.
 */
(function () {
  "use strict";

  // The reference screen inside the mockup frame (P); bg_level1.webp covers exactly this.
  var SCREEN = [3, 2, 331.5, 553];
  // Sprites cut from the panel, at the boxes they were cut from.
  var SPRITES = {
    gemL: [126, 212.75, 152.75, 253],
    gemR: [246.5, 261, 285, 313],
    boyRig: [120, 241, 219.75, 382.25]
  };
  // HUD pieces (P). The panels are the painted ones; the timer, coins and step count are live.
  var HUD = {
    btnPause: [8, 6, 48.25, 46.25],
    timer: [103.5, 8.25, 208.75, 35],
    coins: [237, 8.25, 326, 35],
    seq: [26, 46.25, 310, 119.75],
    tip: [15.75, 499, 317.5, 545.75]
  };
  // Live text: centre (P) and font size (P), matched to the painted lettering.
  var TEXT = {
    time: [156.25, 21.6, 22.4],
    coinCount: [291.5, 21.6, 19.6],
    seqCount: [272.9, 96.3, 19]
  };
  var ORBS = [[46.5, 81, 76.25, 110.75], [81.25, 81, 111, 110.75], [116, 81, 145.75, 110.75],
    [150.75, 81, 180.5, 110.75], [185.5, 81, 215.25, 110.75], [220.5, 81, 250.25, 110.75]];
  var LANE_P = 10;             // sideways step of one swipe (P)

  // Demo values shown in the preview; gameplay will drive these.
  var state = { seconds: 28, coins: 2680, step: 1, steps: 7, lane: 0, faceRight: false };

  var screen = document.getElementById("screen");
  var world = document.getElementById("world");
  var rig = document.getElementById("boyRig");
  var boy = document.getElementById("boy");

  function num(v) { return Number(v).toLocaleString("en-US"); }

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

  function box(el, b, x, y, k) {
    el.style.left = x(b[0]) + "px";
    el.style.top = y(b[1]) + "px";
    el.style.width = (b[2] - b[0]) * k + "px";
    el.style.height = (b[3] - b[1]) * k + "px";
  }

  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    var safe = readSafeArea();
    var sw = SCREEN[2] - SCREEN[0], sh = SCREEN[3] - SCREEN[1];
    var availH = H - safe.top - safe.bottom;
    var u = Math.min(W / sw, availH / sh);
    var rx = (W - sw * u) / 2, ry = safe.top + (availH - sh * u) / 2;
    document.documentElement.style.setProperty("--u", u + "px");

    // world box = the reference screen; its children use coordinates relative to it
    world.style.left = rx + "px";
    world.style.top = ry + "px";
    world.style.width = sw * u + "px";
    world.style.height = sh * u + "px";
    var wx = function (p) { return (p - SCREEN[0]) * u; };
    var wy = function (p) { return (p - SCREEN[1]) * u; };
    box(document.getElementById("bg"), SCREEN, wx, wy, u);
    Object.keys(SPRITES).forEach(function (id) { box(document.getElementById(id), SPRITES[id], wx, wy, u); });

    // HUD in screen coordinates, on the reference screen where the reference has it
    var sx = function (p) { return rx + (p - SCREEN[0]) * u; };
    var sy = function (p) { return ry + (p - SCREEN[1]) * u; };
    Object.keys(HUD).forEach(function (id) { box(document.getElementById(id), HUD[id], sx, sy, u); });
    Object.keys(TEXT).forEach(function (id) {
      var el = document.getElementById(id);
      var pb = HUD[el.parentElement.id];
      el.style.left = (TEXT[id][0] - pb[0]) * u + "px";
      el.style.top = (TEXT[id][1] - pb[1]) * u + "px";
      el.style.fontSize = TEXT[id][2] * u + "px";
    });
    var seq = HUD.seq;
    document.querySelectorAll("#seq .orb").forEach(function (o, i) {
      box(o, ORBS[i], function (p) { return (p - seq[0]) * u; }, function (p) { return (p - seq[1]) * u; }, u);
    });
    placeBoy();
  }

  function render() {
    var m = Math.floor(state.seconds / 60), s = state.seconds % 60;
    document.getElementById("time").textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    document.getElementById("coinCount").textContent = num(state.coins);
    document.getElementById("seqCount").textContent = state.step + "/" + state.steps;
  }

  // ---- swipe controls (preview: the boy turns, steps and hops; gameplay comes next) ----
  function placeBoy() {
    rig.style.translate = "calc(" + state.lane * LANE_P + " * var(--u)) 0";
    boy.classList.toggle("faceRight", state.faceRight);
  }

  function replay(cls) {
    rig.classList.remove("hop", "step");
    void rig.offsetWidth;                                 // restart the animation
    rig.classList.add(cls);
  }

  function move(dir) {
    if (screen.classList.contains("paused")) return;
    if (dir === "left" || dir === "right") {
      state.faceRight = dir === "right";
      state.lane = Math.max(-1, Math.min(1, state.lane + (dir === "right" ? 1 : -1)));
      placeBoy();
      replay("step");
    } else if (dir === "up") {
      replay("hop");
    }
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function wireSwipes() {
    var start = null;
    screen.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".btn")) return;
      start = { x: e.clientX, y: e.clientY };
    });
    screen.addEventListener("pointerup", function (e) {
      if (!start) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      var min = Math.max(24, window.innerWidth * 0.06);
      start = null;
      if (Math.abs(dx) < min && Math.abs(dy) < min) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? "left" : "right");
      else if (dy < 0) move("up");
    });
    screen.addEventListener("pointercancel", function () { start = null; });
    window.addEventListener("keydown", function (e) {
      var k = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up" }[e.key];
      if (k) { e.preventDefault(); move(k); }
    });
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function wirePause() {
    var p = document.getElementById("btnPause");
    p.addEventListener("pointerdown", function () { p.classList.add("pressed"); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      p.addEventListener(ev, function () { p.classList.remove("pressed"); });
    });
    p.addEventListener("click", function () {
      if (navigator.vibrate) navigator.vibrate(12);
      var paused = screen.classList.toggle("paused");
      toast(paused ? "Paused. Tap pause again to resume." : "Swipe left, right or up to move the boy.");
    });
  }

  window.addEventListener("resize", layout);
  window.RainbowCascadesLevel1 = {
    layout: layout,
    move: move,
    setState: function (s) { Object.assign(state, s); render(); placeBoy(); }
  };

  layout();
  render();
  wireSwipes();
  wirePause();
  var imgs = Array.prototype.slice.call(document.images);
  Promise.all([document.fonts.ready].concat(imgs.map(function (im) {
    return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
  }))).then(function () { layout(); screen.classList.add("ready"); document.body.dataset.ready = "1"; });
})();
