/*
 * Rainbow Cascades - home screen layout.
 *
 * Every piece is positioned in "panel pixels" (P): the pixel grid of the home screen in the
 * reference mockup (369 x 557). One P is `u` CSS pixels, chosen so the reference width fits
 * the phone. The top bar and title hang from the top safe area; the side menu, PLAY and the
 * bottom navigation sit on the bottom safe area, exactly where they are over the artwork in
 * the mockup. Taller phones reveal more sky between the two groups (the background art was
 * extended for that).
 */
(function () {
  "use strict";

  // Boxes in P: [x0, y0, x1, y1]. Cut-out pieces use the boxes they were cut from.
  var TOP = {
    lvlBand: [30, 7, 128, 40],
    avatar: [10.75, 4.5, 52.75, 47],
    lvlText: [61, 8.6, 110, 26],
    xp: [57, 23.2, 118.5, 35.2],
    walletGems: [234, 6, 326, 41.5],
    walletCoins: [138.5, 6, 243, 41.5],
    coinIcon: [146, 7, 173.75, 34.75],
    gemIcon: [243, 6.5, 275.5, 38],
    gear: [328, 7.75, 364, 41.5],
    title: [35.25, 47.25, 344.75, 124.5]
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
  // Text inside the wallet pills, relative to the pill's left/top edge (P).
  var TEXT = { coins: [39, 5.6], gems: [45.5, 5.6] };

  var PANEL_X0 = 5, PANEL_W = 360;       // horizontal span covered by the art
  var TOP_P0 = 3, BOTTOM_P1 = 553;       // reference panel's inner top / bottom edge
  var BG = { p0: 7 - 320, rows: 320 + 543 + 30 }; // bg_home.webp: first row's P, height in P

  // Level, XP and wallet, shared with the levels (js/profile.js).
  var profile = window.RCProfile ? RCProfile.load() : { level: 16, xp: 0.94, coins: 12450, gems: 320 };

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
    var u = Math.min(W / PANEL_W, (H - safe.top - safe.bottom) / 610);
    var x0 = (W - PANEL_W * u) / 2;
    var sx = function (p) { return x0 + (p - PANEL_X0) * u; };
    var ty = function (p) { return safe.top + (p - TOP_P0) * u; };
    var by = function (p) { return H - safe.bottom - (BOTTOM_P1 - p) * u; };

    document.documentElement.style.setProperty("--u", u + "px");
    screen.classList.toggle("wide", PANEL_W * u < W - 1);

    var bg = document.getElementById("bg");
    bg.style.left = x0 + "px";
    bg.style.top = by(BG.p0) + "px";
    bg.style.width = PANEL_W * u + "px";
    bg.style.height = BG.rows * u + "px";

    Object.keys(TOP).forEach(function (id) { place(id, TOP[id], sx, ty, u); });
    Object.keys(BOTTOM).forEach(function (id) { place(id, BOTTOM[id], sx, by, u); });

    var c = document.getElementById("coins"), g = document.getElementById("gems");
    c.style.left = TEXT.coins[0] * u + "px"; c.style.top = TEXT.coins[1] * u + "px";
    g.style.left = TEXT.gems[0] * u + "px"; g.style.top = TEXT.gems[1] * u + "px";
    document.getElementById("walletCoins").style.zIndex = 2;
    document.getElementById("coinIcon").style.zIndex = 3;
    document.getElementById("gemIcon").style.zIndex = 3;
    document.querySelectorAll("#nav .tab").forEach(function (t, i) { t.style.left = (1.5 + i * 19.4) + "%"; });
  }

  function render() {
    document.getElementById("lvl").textContent = profile.level;
    document.getElementById("coins").textContent = num(profile.coins);
    document.getElementById("gems").textContent = num(profile.gems);
    document.getElementById("xpFill").style.width = Math.round(profile.xp * 100) + "%";
    document.getElementById("xp").setAttribute("aria-valuenow", Math.round(profile.xp * 100));
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
        if (el.dataset.action === "Play") { location.href = "level1.html"; return; }
        toast("Preview only — “" + el.dataset.action + "” isn't built yet");
      });
    });
  }

  window.addEventListener("resize", layout);
  // coming back from a level (also from the back-forward cache): show the new wallet
  window.addEventListener("pageshow", function () {
    if (window.RCProfile) { Object.assign(profile, RCProfile.load()); render(); }
  });
  window.RainbowCascadesHome = { layout: layout, setProfile: function (p) { Object.assign(profile, p); render(); } };

  layout();
  render();
  wireButtons();
  var imgs = Array.prototype.slice.call(document.images);
  Promise.all([document.fonts.ready].concat(imgs.map(function (im) {
    return im.complete ? Promise.resolve() : new Promise(function (r) { im.onload = im.onerror = r; });
  }))).then(function () { layout(); screen.classList.add("ready"); document.body.dataset.ready = "1"; });
})();
