// Visual lock for the approved Level 1 screen ("Jump on the matching colors").
//
//   node scripts/check_level1.mjs            (from game/; exit code 1 on failure)
//
// 1. At rest, the phone screen must match reference panel 2 (art-source/rainbow_cascades_reference.png):
//    the reference screen region is compared with the panel at the panel's own 1x size.
// 2. The swipe controls must work (left / right turn the boy and step him sideways, up hops) and
//    must not change anything else: after swiping, every pixel outside the boy is compared with
//    the screen at rest.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../public");
const REF = path.resolve(here, "../../art-source/rainbow_cascades_reference.png");
const PANEL_SCREEN = [391, 7, 328.5, 551];   // panel 2's screen in the sheet: x, y, w, h
const MAX_REF_DIFF = 10;                     // mean |difference| (0-255) against the reference, at 1x
const MAX_SWIPE_DIFF = 0.5;                  // mean |difference| outside the boy after swiping

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp",
  ".png": "image/png", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x").pathname;
  const f = url === "/__ref.png" ? REF : path.join(root, decodeURIComponent(url));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/level1.html?safeTop=28`);
await page.waitForSelector("body[data-ready='1']");

const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height }; }, sel);
const clip = await rect("#world");
const shot = async () => (await page.screenshot({ clip, animations: "disabled" })).toString("base64");
const boyState = () => page.evaluate(() => ({
  lane: document.getElementById("boyRig").style.translate,
  faceRight: document.getElementById("boy").classList.contains("faceRight") }));

const rest = await shot();
const boyRest = await rect("#boyRig");

async function swipe(x0, y0, x1, y1) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(500);
}
const cx = clip.x + clip.width / 2, cy = clip.y + clip.height * 0.6;
await swipe(cx + 80, cy, cx - 80, cy);
const afterLeft = await boyState();
await swipe(cx - 80, cy, cx + 80, cy);
await swipe(cx - 80, cy, cx + 80, cy);
const afterRight = await boyState();
await swipe(cx, cy + 90, cx, cy - 90);
const afterUp = await boyState();
const moved = await shot();
const boyMoved = await rect("#boyRig");

// Pixel comparisons run in the browser (canvas), so the check needs nothing beyond Playwright.
const cmp = await browser.newPage();
await cmp.goto(`${base}/__ref.png`);
const result = await cmp.evaluate(async ({ rest, moved, panel, clip, boxes }) => {
  const load = (src) => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = src; });
  const pixels = (im, sx, sy, sw, sh, w, h) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(im, sx, sy, sw, sh, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  };
  const [ref, a, b] = await Promise.all([load("/__ref.png"), load("data:image/png;base64," + rest), load("data:image/png;base64," + moved)]);
  // 1. rest vs reference, at the reference's own size
  const w = Math.round(panel[2]), h = Math.round(panel[3]);
  const r = pixels(ref, panel[0], panel[1], panel[2], panel[3], w, h);
  const s = pixels(a, 0, 0, a.width, a.height, w, h);
  let sum = 0;
  for (let i = 0; i < r.length; i += 4) sum += Math.abs(r[i] - s[i]) + Math.abs(r[i + 1] - s[i + 1]) + Math.abs(r[i + 2] - s[i + 2]);
  const refDiff = sum / (w * h * 3);
  // 2. after swiping vs rest, outside the boy (both positions, with a margin)
  const k = a.width / clip.width, m = 6;
  const out = boxes.map((q) => [(q.x - clip.x - m) * k, (q.y - clip.y - m - 20) * k, (q.x - clip.x + q.width + m) * k, (q.y - clip.y + q.height + m) * k]);
  const pa = pixels(a, 0, 0, a.width, a.height, a.width, a.height), pb = pixels(b, 0, 0, b.width, b.height, a.width, a.height);
  let s2 = 0, n = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    if (out.some((q) => x >= q[0] && x <= q[2] && y >= q[1] && y <= q[3])) continue;
    const i = (y * a.width + x) * 4;
    s2 += Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]); n += 3;
  }
  return { refDiff, swipeDiff: s2 / n };
}, { rest, moved, panel: PANEL_SCREEN, clip, boxes: [boyRest, boyMoved] });
await browser.close();
server.close();

const checks = [
  ["no page errors", errors.length === 0, errors.join("; ") || "none"],
  ["screen at rest matches reference panel 2", result.refDiff <= MAX_REF_DIFF, `mean difference ${result.refDiff.toFixed(2)} (limit ${MAX_REF_DIFF})`],
  ["swipe left: boy faces left, steps left", afterLeft.lane.startsWith("calc(-10") && !afterLeft.faceRight, JSON.stringify(afterLeft)],
  ["swipe right x2: boy faces right, steps right", afterRight.lane.startsWith("calc(10") && afterRight.faceRight, JSON.stringify(afterRight)],
  ["swipe up: boy hops, stays in lane", afterUp.lane === afterRight.lane, JSON.stringify(afterUp)],
  ["swipes change nothing but the boy", result.swipeDiff <= MAX_SWIPE_DIFF, `mean difference outside the boy ${result.swipeDiff.toFixed(3)} (limit ${MAX_SWIPE_DIFF})`],
];
let ok = true;
for (const [name, pass, info] of checks) { console.log(`${pass ? "PASS" : "FAIL"}  ${name}: ${info}`); ok = ok && pass; }
process.exit(ok ? 0 : 1);
