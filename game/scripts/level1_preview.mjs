// Plays Level 1 in a phone-sized Chromium (as the Android WebView renders it) and saves
// screenshots of the key moments. Also checks that a full run works: a wrong block, the right
// blocks, the gate and the Level Complete card.
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
const until = async (fn, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await page.waitForTimeout(50); }
  throw new Error("timed out");
};

await page.goto(`http://127.0.0.1:${port}/level1.html?seed=${seed}&safeTop=${safeTop}&safeBottom=${safeBottom}`);
await page.waitForSelector("body[data-ready='1']", { timeout: 20000 });
await page.evaluate(() => localStorage.clear());
await page.waitForTimeout(2200);                       // hint glow on the first row
await shot("level1_start.png");

// the opening jump, frozen mid-air like the direction image
await page.evaluate(() => { window.RCLevel1.elapsed(28000); window.RCLevel1.pose(0.42); });
await page.waitForTimeout(200);
await shot("level1_jump.png");
await page.reload();
await page.waitForSelector("body[data-ready='1']", { timeout: 20000 });
await page.waitForTimeout(300);

// a wrong block first, then the right ones; tap the screen like a player would
const tapTile = async (lane) => {
  const box = await page.evaluate((lane) => {
    const s = window.RCLevel1.state();
    return window.RCLevel1.tileScreen(s.row + 1, lane);
  }, lane);
  await page.touchscreen.tap(box.x, box.y);
};
let s = await state();
await tapTile(1 - s.correct);
await page.waitForTimeout(700);
await shot("level1_wrong.png");
await until(async () => (await state()).mode === "play");
for (let i = 0; i < 5; i++) {
  s = await state();
  await tapTile(s.correct);
  await until(async () => ["play", "gate"].includes((await state()).mode));
  if (i === 2) await shot("level1_mid.png");
}
await page.waitForTimeout(400);
await shot("level1_gate.png");
await page.touchscreen.tap(200, 300);
await until(async () => (await state()).mode === "done");
await page.waitForTimeout(2600);
await shot("level1_complete.png");
console.log("final state", JSON.stringify(await state()));
if (errors.length) { console.log("PAGE ERRORS:\n" + errors.join("\n")); process.exitCode = 1; }
await browser.close();
server.close();
