// Plays the whole of Level 1 in a phone-sized Chromium (as the Android WebView renders it), checks
// that every section comes up in order and the level can be finished, and saves screenshots.
//
// Run A takes the secret rainbow route and the gold path (screenshots of every section);
// run B stays on the main path and takes the safe route; run C checks "out of hearts".
// A small bot taps like a careful player: it makes one wrong colour on purpose in run A, then waits
// for flat, level or slow blocks and keeps off the block the cloud is about to strike.
//
// Usage: node scripts/level1_preview.mjs <out_dir> [width height dpr safeTop safeBottom seed]
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
const [outDir = "shots", w = 412, h = 915, dpr = 2.625, safeTop = 28, safeBottom = 0, seed = 7] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp",
  ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, "index.html") : p;
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, isMobile: true, hasTouch: true });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name) => { await page.screenshot({ path: path.join(outDir, name) }); console.log("saved", name); };
const state = () => page.evaluate(() => window.RCLevel1.state());
const until = async (fn, ms = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await page.waitForTimeout(40); }
  throw new Error("timed out");
};
const open = async (s = seed) => {
  await page.goto(`http://127.0.0.1:${port}/level1.html?seed=${s}&safeTop=${safeTop}&safeBottom=${safeBottom}`);
  await page.waitForSelector("body[data-ready='1']", { timeout: 20000 });
};
const names = ["color", "rotate", "cloud", "fake", "secret", "move", "path", "gate"];

// Plays to Level Complete. Returns the sections in the order they came up and the routes used.
async function playThrough({ secret, fork, shots }) {
  const order = [0], routes = new Set();
  const mid = new Set();
  let secretShot = false;
  const t0 = Date.now();
  for (;;) {
    const s = await state();
    if (s.route) routes.add(s.route);
    if (s.mode === "done") break;
    if (s.mode === "over") throw new Error("the bot ran out of hearts at section " + (s.stage + 1));
    if (Date.now() - t0 > 360000) throw new Error("bot stuck at " + JSON.stringify(s));
    if (s.stage !== order[order.length - 1]) {
      order.push(s.stage);
      if (shots) {
        await page.waitForTimeout(500);
        await shot(`level1_s${s.stage + 1}_${names[s.stage]}_card.png`);           // with the section card
        if (s.stage === 6) { await page.waitForTimeout(1500); await shot("level1_s7_path_fork.png"); }
        if (s.stage === 2) {                                                          // the cloud swooping in
          await page.waitForTimeout(700);
          await shot("level1_s3_cloud_swoop.png");
        }
      }
    }
    if (shots) {
      const stepIn = s.step - s.stageStart[s.stage];
      if (s.stage === 1 && stepIn === 1 && !mid.has("flip")) {                        // the next block mid-flip
        mid.add("flip");
        await until(async () => { const r = await page.evaluate(() => window.RCLevel1.nextRoll()); return r > 70 && r < 150; }, 6000).catch(() => {});
        await shot("level1_s2_rotate_play.png");
      }
      if (s.stage === 2 && stepIn === 3 && !mid.has("chase")) {                       // the cloud closing in on him
        mid.add("chase");
        await until(async () => { const d = (await state()).cloudD; return d !== null && d < 2.2; }, 5000).catch(() => {});
        await shot("level1_s3_cloud_play.png");
      }
      if (s.secret && !secretShot && s.stage === 4) { secretShot = true; await page.waitForTimeout(300); await shot("level1_s5_secret_play.png"); }
      if (stepIn === 2 && [0, 3, 5, 6, 7].includes(s.stage) && !mid.has(s.stage) && s.mode === "play") {
        mid.add(s.stage);
        await shot(`level1_s${s.stage + 1}_${names[s.stage]}_play.png`);
      }
    }
    const route = s.stage === 4 ? (secret ? "secret" : null) : s.stage === 6 ? fork : null;
    const tap = await page.evaluate((r) => window.RCLevel1.bot(r), route);
    if (tap) { await page.touchscreen.tap(tap.x, tap.y); await page.waitForTimeout(120); }
    else await page.waitForTimeout(40);
  }
  return { order, routes: [...routes], final: await state() };
}

const expectOrder = JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7]);
function check(name, r, want) {
  const ok = JSON.stringify(r.order) === expectOrder && r.final.mode === "done" && want.every((x) => r.routes.includes(x));
  console.log(`${name}: sections ${r.order.map((i) => i + 1).join(" > ")}, routes ${r.routes.join(",")}, ` +
    `hearts lost ${r.final.heartsLost}, coins ${r.final.coins}, gems ${r.final.gems}, tokens ${r.final.tokens}, ` +
    `secret ${r.final.secret}, time ${(r.final.elapsed / 1000).toFixed(1)} s -> ${ok ? "OK" : "FAILED"}`);
  if (!ok) errors.push(name + " did not play through every section in order");
}

// --- run A: screenshots, secret route, gold path ---
await open();
await page.evaluate(() => localStorage.clear());
console.log("sections:", (await page.evaluate(() => window.RCLevel1.sections)).join(" | "));
await page.waitForTimeout(2200);                       // the hint on the first row
await shot("level1_start.png");
await page.evaluate(() => { window.RCLevel1.elapsed(28000); window.RCLevel1.pose(0.42); });
await page.waitForTimeout(200);
await shot("level1_jump.png");
await open();
await page.waitForTimeout(300);
const wrong = await page.evaluate(() => window.RCLevel1.wrongColor());    // one wrong colour first
await page.touchscreen.tap(wrong.x, wrong.y);
await page.waitForTimeout(700);
await shot("level1_wrong.png");
await until(async () => (await state()).mode === "play");
const a = await playThrough({ secret: true, fork: "gold", shots: true });
await page.waitForTimeout(2700);
await shot("level1_complete.png");
check("run A (secret route, gold path)", a, ["secret", "gold"]);

// --- run B: main path, safe route ---
await open(11);
await page.waitForTimeout(300);
const b = await playThrough({ secret: false, fork: "safe", shots: false });
check("run B (main path, safe route)", b, ["safe"]);
if (b.final.secret) errors.push("run B should not have found the secret route");

// --- run C: out of hearts on the fake platforms, then try again ---
await open();
await page.evaluate(() => window.RCLevel1.goto(3));
await page.waitForTimeout(1900);
for (let i = 0; i < 12 && (await state()).mode !== "over"; i++) {
  await until(async () => ["play", "over"].includes((await state()).mode));
  if ((await state()).mode === "over") break;
  const tap = await page.evaluate(() => {         // a fake block if the next row still has one
    const s = window.RCLevel1.state();
    for (let k = 0; k < 2; k++) if (window.RCLevel1.isFake(s.step + 1, k)) return window.RCLevel1.tapFor(s.step + 1, k);
    return window.RCLevel1.bot();
  });
  if (tap) await page.touchscreen.tap(tap.x, tap.y);
  await page.waitForTimeout(400);
}
await until(async () => (await state()).mode === "over");
await page.waitForTimeout(300);
await shot("level1_out_of_hearts.png");
await page.click("#nohearts [data-cmd=retry]");
await until(async () => (await state()).mode === "play");
const after = await state();
console.log("run C (out of hearts): back at section", after.stage + 1, "with", after.hearts, "hearts");
if (after.hearts !== 3 || after.stage !== 3) errors.push("retry did not restore the checkpoint");

if (errors.length) { console.log("PROBLEMS:\n" + errors.join("\n")); process.exitCode = 1; }
else console.log("all checks passed");
await browser.close();
server.close();
