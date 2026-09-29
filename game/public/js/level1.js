/*
 * Rainbow Cascades - Level 1 screen, "Jump on the matching colors" (reference panel 2).
 *
 * Everything is positioned in "panel pixels" (P): the pixel grid of the Level 1 gameplay panel in
 * the reference sheet (335 x 557). The world (scenery with the jelly blocks, the gems and the boy)
 * uses one scale, `u`, so the panel fills the phone's width, and sits on the bottom of the screen
 * as in the reference. The HUD uses its own scale, `h`, so it spans the phone's width the way it
 * spans the reference screen; the top row and the colour panel hang from the top safe area and
 * the instruction panel sits on the bottom one. Phones are taller than the reference (about 9:20
 * against 3:5); the extra height shows more sky above the scene (the art was extended for that).
 */
(function () {
  "use strict";

  // World art: bg_level1.webp covers x 0..335, y -240..581 (the panel plus added sky above and
  // a strip below). Sprite boxes [x0, y0, x1, y1] are where they were cut from the panel.
  var BG = { x0: 0, y0: -240, w: 335, h: 821 };
  var VIEW_W = 310;            // panel width shown across the phone (trims the mockup's frame)
  var WORLD_CX = 167.5;
  var WORLD_BOTTOM = 551;      // inner bottom edge of the reference screen
  var SPRITES = {
    boy: [120, 241, 219.75, 382.25],
    gemL: [126, 212.75, 152.75, 253],
    gemR: [246.5, 261, 285, 313]
  };
  // Sparkles on the blocks and around the path (P), with a delay so they twinkle in turn.
  var SPARKS = [[71, 331, 0], [183, 344, 0.6], [247, 392, 1.1], [291, 452, 1.7], [58, 488, 0.3],
    [140, 427, 1.4], [226, 285, 0.9], [99, 385, 2.0], [270, 233, 0.4], [44, 236, 1.8]];

  // HUD boxes in P. Panels are the art with the painted text removed; text is live.
  var HUD_W = 335;
  var HUD_TOP0 = 3;            // reference screen's inner top edge
  var HUD_BOTTOM1 = 551;
  var TOP = {
    btnPause: [8, 6, 48.25, 46.25],
    timer: [103.5, 8.25, 208.75, 35],
    coins: [237, 8.25, 326, 35],
    seq: [26, 46.25, 310, 119.75]
  };
  var BOTTOM = { tip: [15.75, 499, 317.5, 545.75] };
  // Text: centre (P, absolute) and font size (P).
  var TEXT = {
    time: [156.25, 21.6, 22.4],
    coinCount: [291.5, 21.6, 19.6],
    seqTitle: [167.9, 62.3, 17.4],
    seqCount: [272.9, 96.3, 19],
    tipText: [166.6, 521.8, 16.6]
  };
  var ORBS = [[46.5, 81, 76.25, 110.75], [81.25, 81, 111, 110.75], [116, 81, 145.75, 110.75],
    [150.75, 81, 180.5, 110.75], [185.5, 81, 215.25, 110.75], [220.5, 81, 250.25, 110.75]];

  // Demo values shown in the preview; gameplay will drive these.
  var state = { seconds: 28, coins: 2680, step: 1, steps: 7 };

  var screen = document.getElementById("screen");
  var world = document.getElementById("world");

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
    // world: fill the width; on a very wide screen (tablet) cap by height and fill the sides
    var u = Math.min(W / VIEW_W, (H - safe.top - safe.bottom) / 470);
    var h = Math.min(W / HUD_W, u * 1.02);
    var ox = W / 2 - WORLD_CX * u;
    var oy = H - safe.bottom - WORLD_BOTTOM * u;
    document.documentElement.style.setProperty("--u", u + "px");
    document.documentElement.style.setProperty("--h", h + "px");
    screen.classList.toggle("wide", BG.w * u < W - 1);

    var wx = function (p) { return p * u; };
    world.style.transform = "translate(" + ox + "px," + oy + "px)";
    box(document.getElementById("bg"), [BG.x0, BG.y0, BG.x0 + BG.w, BG.y0 + BG.h], wx, wx, u);
    Object.keys(SPRITES).forEach(function (id) { box(document.getElementById(id), SPRITES[id], wx, wx, u); });
    document.querySelectorAll(".spark").forEach(function (s, i) {
      s.style.left = SPARKS[i][0] * u + "px";
      s.style.top = SPARKS[i][1] * u + "px";
    });

    // HUD: same horizontal layout as the reference, centred on the phone
    var hx0 = W / 2 - (HUD_W / 2) * h;
    var sx = function (p) { return hx0 + p * h; };
    var ty = function (p) { return safe.top + (p - HUD_TOP0) * h; };
    var by = function (p) { return H - safe.bottom - (HUD_BOTTOM1 - p) * h; };
    Object.keys(TOP).forEach(function (id) { box(document.getElementById(id), TOP[id], sx, ty, h); });
    Object.keys(BOTTOM).forEach(function (id) { box(document.getElementById(id), BOTTOM[id], sx, by, h); });

    Object.keys(TEXT).forEach(function (id) {
      var el = document.getElementById(id);
      var parent = el.parentElement.id;
      var pb = TOP[parent] || BOTTOM[parent];
      el.style.left = (TEXT[id][0] - pb[0]) * h + "px";
      el.style.top = (TEXT[id][1] - pb[1]) * h + "px";
      el.style.fontSize = TEXT[id][2] * h + "px";
    });
    var seq = TOP.seq;
    document.querySelectorAll("#seq .orb").forEach(function (o, i) {
      box(o, ORBS[i], function (p) { return (p - seq[0]) * h; }, function (p) { return (p - seq[1]) * h; }, h);
    });
  }

  function render() {
    var m = Math.floor(state.seconds / 60), s = state.seconds % 60;
    document.getElementById("time").textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    document.getElementById("coinCount").textContent = num(state.coins);
    document.getElementById("seqCount").textContent = state.step + "/" + state.steps;
    document.querySelectorAll("#seq .orb").forEach(function (o, i) { o.classList.toggle("next", i === state.step - 1); });
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function wire() {
    var p = document.getElementById("btnPause");
    p.addEventListener("pointerdown", function () { p.classList.add("pressed"); });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      p.addEventListener(ev, function () { p.classList.remove("pressed"); });
    });
    p.addEventListener("click", function () {
      if (navigator.vibrate) navigator.vibrate(12);
      var paused = screen.classList.toggle("paused");
      toast(paused ? "Paused. Tap pause again to resume." : "Preview of the Level 1 screen. Gameplay comes after approval.");
    });
  }

  var sp = document.getElementById("sparkles");
  SPARKS.forEach(function (s) {
    var d = document.createElement("div");
    d.className = "spark";
    d.style.animationDelay = -s[2] + "s";
    sp.appendChild(d);
  });

  window.addEventListener("resize", layout);
  window.RainbowCascadesLevel1 = { layout: layout, setState: function (s) { Object.assign(state, s); render(); } };

  layout();
  render();
  wire();
  var imgs = Array.prototype.slice.call(document.images);
  Promise.all([document.fonts.ready].concat(imgs.map(function (im) {
    return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
  }))).then(function () { layout(); screen.classList.add("ready"); document.body.dataset.ready = "1"; });
})();
