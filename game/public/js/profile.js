/*
 * Rainbow Cascades - the player's save (level, XP, wallet), shared by every screen.
 * Kept in localStorage, which the Android WebView keeps between launches.
 */
(function () {
  "use strict";

  var KEY = "rc.profile.v1";
  // Demo profile until the game has a real start: matches the mockup's top bar.
  var DEFAULTS = { level: 16, xp: 0.94, coins: 12450, gems: 320, levels: {} };

  function load() {
    var p = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && typeof saved === "object") Object.assign(p, saved);
    } catch (e) { /* storage blocked or corrupt: play with the defaults */ }
    return p;
  }

  function save(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* not fatal */ }
  }

  function num(v) { return Number(v).toLocaleString("en-US"); }

  window.RCProfile = { load: load, save: save, num: num };
})();
