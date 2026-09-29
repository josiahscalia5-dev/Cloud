/*
 * Rainbow Cascades - home screen layout.
 *
 * The screen is the reference home screen (panel 1), reproduced as drawn: bg_home.webp is the
 * painted panel itself, and every piece the game makes tappable or live sits exactly over its
 * painted twin. Positions are in "panel pixels" (P): the pixel grid of the home screen in the
 * reference (369 x 557). One P is `u` CSS pixels, chosen so the whole reference screen fits the
 * phone; it is centred, and the phone shows the reference sheet's navy above and below it.
 */
(function () {
  "use strict";

  // Boxes in P: [x0, y0, x1, y1]. Cut-out pieces use the boxes they were cut from.
  var TOP = {
    avatar: [10.75, 4.5, 52.75, 47],
    numLvl: [79.5, 9.5, 99, 23],
    numCoins: [176, 11, 232, 31.5],
    numGems: [277, 11, 311, 31.5],
    gear: [328, 7.75, 364, 41.5]
  };
  var BOTTOM = {
    btnMissions: [309.75, 132.5, 365, 190],
    btnMap: [310.25, 192, 365, 247.75],
    btnShop: [310.5, 250.75, 365, 307.5],
    btnDaily: [310, 310.5, 365, 365.75],
    btnRewards: [310.25, 370, 364, 427.25],
    btnPlay: [89.5, 425.5, 282.75, 484.75],
    nav: [10, 486, 363.75, 551.75]
  };
  // Live numbers: left edge and vertical centre of the painted digits (P), font size (P).
  var TEXT = { lvl: [81.25, 16.3, 15.4], coins: [178.75, 21.3, 19.2], gems: [280, 21.3, 19.2] };

  var SCREEN = [3.5, 2, 364, 554];      // the reference screen inside the mockup frame (P)

  // Demo profile shown in the preview; the game will read this from the save file.
  var profile = { level: 16, coins: 12450, gems: 320 };

  var screen = document.getElementById("screen");

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

  function place(id, box, x, y, u) {
    var el = document.getElementById(id);
    el.style.left = x(box[0]) + "px";
    el.style.top = y(box[1]) + "px";
    el.style.width = (box[2] - box[0]) * u + "px";
    el.style.height = (box[3] - box[1]) * u + "px";
    return el;
  }

  function layout() {
    var W = window.innerWidth, H = window.innerHeight;
    var safe = readSafeArea();
    var sw = SCREEN[2] - SCREEN[0], sh = SCREEN[3] - SCREEN[1];
    var availH = H - safe.top - safe.bottom;
    var u = Math.min(W / sw, availH / sh);
    var rx = (W - sw * u) / 2, ry = safe.top + (availH - sh * u) / 2;
    var sx = function (p) { return rx + (p - SCREEN[0]) * u; };
    var sy = function (p) { return ry + (p - SCREEN[1]) * u; };

    document.documentElement.style.setProperty("--u", u + "px");
    var frame = document.getElementById("frame");
    frame.style.left = rx + "px";
    frame.style.top = ry + "px";
    frame.style.width = sw * u + "px";
    frame.style.height = sh * u + "px";

    Object.keys(TOP).forEach(function (id) { place(id, TOP[id], sx, sy, u); });
    Object.keys(BOTTOM).forEach(function (id) { place(id, BOTTOM[id], sx, sy, u); });

    Object.keys(TEXT).forEach(function (id) {
      var el = document.getElementById(id);
      el.style.left = sx(TEXT[id][0]) + "px";
      el.style.top = sy(TEXT[id][1]) + "px";
      el.style.fontSize = TEXT[id][2] * u + "px";
    });
    document.querySelectorAll("#nav .tab").forEach(function (t, i) { t.style.left = (1.5 + i * 19.4) + "%"; });
  }

  function render() {
    document.getElementById("lvl").textContent = profile.level;
    document.getElementById("coins").textContent = num(profile.coins);
    document.getElementById("gems").textContent = num(profile.gems);
  }

  var toastTimer = 0;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  function wireButtons() {
    document.querySelectorAll("[data-action]").forEach(function (el) {
      var target = el.classList.contains("tab") ? el : el;
      target.addEventListener("pointerdown", function () { target.classList.add("pressed"); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
        target.addEventListener(ev, function () { target.classList.remove("pressed"); });
      });
      target.addEventListener("click", function () {
        if (navigator.vibrate) navigator.vibrate(12);
        if (el.dataset.action === "Play") { location.href = "level1.html" + location.search; return; }
        toast("Preview only — “" + el.dataset.action + "” isn't built yet");
      });
    });
  }

  window.addEventListener("resize", layout);
  window.RainbowCascadesHome = { layout: layout, setProfile: function (p) { Object.assign(profile, p); render(); } };

  layout();
  render();
  wireButtons();
  var imgs = Array.prototype.slice.call(document.images);
  Promise.all([document.fonts.ready].concat(imgs.map(function (im) {
    return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
  }))).then(function () { layout(); screen.classList.add("ready"); document.body.dataset.ready = "1"; });
})();
