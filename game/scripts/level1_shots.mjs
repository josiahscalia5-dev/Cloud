// Plays Level 1 in a phone-sized Chromium (like the Android WebView) and saves screenshots of
// the key moments: start, a right jump, a wrong jump, the rainbow step, the gate and the
// Level Complete card. Fails if the level cannot be finished.
// Usage: node scripts/level1_shots.mjs <out_dir> [width height dpr safeTop safeBottom]
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
const [outDir = "shots", w = 412, h = 915, dpr = 2.625, safeTop = 28, safeBottom = 0] = process.argv.slice(2);
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
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, isMobile: true, hasTouch: true });
const errors = [];
page.on("console", (m) => { if (m.type() !== "log") console.log("[page]", m.type(), m.text()); });
page.on("pageerror", (e) => { errors.push(e.message); console.log("[pageerror]", e.message); });
await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* ignore */ } });
await page.goto(`http://127.0.0.1:${port}/level1.html?safeTop=${safeTop}&safeBottom=${safeBottom}`);
await page.waitForSelector("body[data-ready='1']", { timeout: 20000 });

const state = () => page.evaluate(() => window.RainbowCascadesLevel1.state());
const shot = async (name) => { await page.screenshot({ path: path.join(outDir, name + ".png") }); console.log("saved", name); };
const waitMode = async (mode, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await state()).mode === mode) return; await page.waitForTimeout(40); }
  throw new Error("timed out waiting for " + mode + ", state " + JSON.stringify(await state()));
};
const tap = (ok) => page.evaluate((ok) => window.RainbowCascadesLevel1.tapBlock(ok), ok);

await page.waitForTimeout(500);
await shot("01_start");

// a real tap on the right block, through the canvas
const target = await page.evaluate(() => {
  const s = window.RainbowCascadesLevel1.debugNext();
  return s.filter((p) => p.ok)[0];
});
await page.touchscreen.tap(target.x, target.y);
await page.waitForTimeout(260);
await shot("02_jump");
await waitMode("ready");
await page.waitForTimeout(250);
await shot("03_landed_red");

if (!(await tap(false))) throw new Error("no wrong block to tap");
await page.waitForTimeout(700);
await shot("04_wrong_block");
await waitMode("ready");

for (let i = 0; i < 5; i++) { await tap(true); await waitMode("ready"); }
await page.waitForTimeout(300);
await shot("05_all_colours");
await tap(true);
await page.waitForTimeout(900);
await shot("06_rainbow_steps");
await page.waitForTimeout(1200);
await shot("07_gate");
await waitMode("done", 10000);
await page.waitForTimeout(2600);
await shot("08_complete");
const final = await state();
console.log("final", JSON.stringify(final));
await browser.close();
server.close();
if (errors.length) { console.error("page errors:", errors); process.exit(1); }
