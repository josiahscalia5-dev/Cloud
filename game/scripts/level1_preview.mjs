// Plays the whole of Level 1 in a phone-sized Chromium (as the Android WebView renders it) and
// saves screenshots of every stage. A small bot taps like a careful player: it makes one wrong
// colour on purpose, takes the secret rainbow route and the gold path, and waits for flat,
// slow or safe blocks. A second run checks "out of hearts" on the fake platforms.
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
const open = async () => {
  await page.goto(`http://127.0.0.1:${port}/level1.html?seed=${seed}&safeTop=${safeTop}&safeBottom=${safeBottom}`);
  await page.waitForSelector("body[data-ready='1']", { timeout: 20000 });
};

await open();
await page.evaluate(() => localStorage.clear());
await page.waitForTimeout(2200);                       // the hint glow on the first row
await shot("level1_start.png");

// the opening jump, frozen mid-air like the direction image
await page.evaluate(() => { window.RCLevel1.elapsed(28000); window.RCLevel1.pose(0.42); });
await page.waitForTimeout(200);
await shot("level1_jump.png");
await open();
await page.waitForTimeout(300);

// one wrong colour first
const wrong = await page.evaluate(() => window.RCLevel1.wrongColor());
await page.touchscreen.tap(wrong.x, wrong.y);
await page.waitForTimeout(700);
await shot("level1_wrong.png");
await until(async () => (await state()).mode === "play");

// then the bot plays to the end, photographing each stage
const names = ["color", "rotate", "move", "fake", "cloud", "path", "gate"];
let seen = 0, mid = new Set(), secretShot = false, t0 = Date.now();
for (;;) {
  const s = await state();
  if (s.mode === "done") break;
  if (Date.now() - t0 > 300000) throw new Error("bot stuck at " + JSON.stringify(s));
  if (s.stage > seen) {
    seen = s.stage;
    await page.waitForTimeout(500);
    await shot(`level1_stage${seen + 1}_${names[seen]}.png`);          // with the stage card
    if (seen === 5) { await page.waitForTimeout(1500); await shot("level1_stage6_fork.png"); }
  }
  if (s.stage === 1 && s.step === 7 && !mid.has("flip")) {              // the next block mid-flip
    mid.add("flip");
    await until(async () => { const r = await page.evaluate(() => window.RCLevel1.nextRoll()); return r > 70 && r < 150; }, 6000).catch(() => {});
    await shot("level1_stage2_play.png");
  }
  if (s.secret && !secretShot) { secretShot = true; await page.waitForTimeout(250); await shot("level1_secret.png"); }
  const stepIn = s.step - [0, 6, 12, 18, 24, 31, 37][s.stage];
  if (stepIn === 2 && !mid.has(s.stage) && s.mode === "play") {
    mid.add(s.stage);
    if (s.stage === 4) await until(async () => await page.evaluate(() => !!document.querySelector(".warnMark") &&
      document.querySelector(".warnMark").style.display !== "none"), 6000).catch(() => {});
    await shot(`level1_stage${s.stage + 1}_play.png`);
  }
  const tap = await page.evaluate((st) => window.RCLevel1.bot(st === 1 ? "secret" : "gold"), s.stage);
  if (tap) { await page.touchscreen.tap(tap.x, tap.y); await page.waitForTimeout(120); }
  else await page.waitForTimeout(50);
}
await page.waitForTimeout(2700);
await shot("level1_complete.png");
const fin = await state();
console.log("final state", JSON.stringify(fin));

// out of hearts: jump onto fake blocks until the hearts run out, then try again
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
console.log("after retry", JSON.stringify(after));
if (after.hearts !== 3 || after.stage !== 3) { errors.push("retry did not restore the checkpoint"); }

if (errors.length) { console.log("PAGE ERRORS:\n" + errors.join("\n")); process.exitCode = 1; }
await browser.close();
server.close();
