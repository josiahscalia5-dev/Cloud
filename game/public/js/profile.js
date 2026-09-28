/*
 * Rainbow Cascades - the player's profile (level, XP, wallet, best results), shared by every
 * screen. Kept in localStorage for now; the Android shell can swap this for its save file.
 */
(function () {
  "use strict";

  var KEY = "rc.profile.v1";
  var DEFAULTS = { level: 16, xp: 0.94, coins: 12450, gems: 320, best: {} };

  function load() {
    var p = {};
    try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { p = {}; }
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = k in p ? p[k] : DEFAULTS[k]; });
    out.best = Object.assign({}, out.best);
    return out;
  }

  function save(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode: keep going */ }
  }

  window.RCProfile = { load: load, save: save };
})();
