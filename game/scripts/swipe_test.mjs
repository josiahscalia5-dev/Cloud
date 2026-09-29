// Swipe test: real touch swipes (Chrome DevTools touch events, as a phone sends them) drive the
// boy through the first section. After every frame of every move it measures how the boy's body
// lines up with the direction he is actually moving:
//   - travel direction (from his position frame to frame) vs. the way his body faces
//   - pelvis, chest, head, both knees and both feet vs. the body's facing
//   - knees bend forward (never backward), feet on the block when he stands
// and saves a filmstrip of each move for a visual check.
//
// Usage: node scripts/swipe_test.mjs <out_dir>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { serve, GL_ARGS } from "./serve_util.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
const [outDir = "swipe_test"] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const { server, port } = serve(root);
const browser = await chromium.launch({ args: GL_ARGS });
const W = 412, H = 915;
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/level1.html?test&manual&safeTop=24`);
await page.waitForSelector("body[data-ready='1']", { timeout: 60000 });
const cdp = await page.context().newCDPSession(page);

async function swipe(dir) {
  const cx = W / 2, cy = H * 0.62, d = 130;
  const [dx, dy] = { left: [-d, 6], right: [d, -6], up: [8, -d] }[dir];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + (dx * i) / 6, y: cy + (dy * i) / 6, id: 1 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
const step = (n = 1) => page.evaluate((n) => window.RCLevel1.step(1 / 60, n), n);
const state = () => page.evaluate(() => window.RCLevel1.state());
const align = () => page.evaluate(() => window.RCLevel1.alignment());
const frame = async () => (await page.screenshot({ type: "jpeg", quality: 80 })).toString("base64");

// settle
await step(30);

const report = [];
async function move(label, dir, frames = 60, film = true) {
  const s0 = await state();
  await swipe(dir);
  const shots = [];
  let prev = s0.pos, worst = { travel: 0, parts: 0, knee: 1 }, moved = 0, samples = 0;
  for (let f = 0; f < frames; f++) {
    await step(1);
    const s = await state(), a = await align();
    const dx = s.pos[0] - prev[0], dz = s.pos[2] - prev[2];
    const sp = Math.hypot(dx, dz) * 60;
    // compare travel direction with the body's facing once he is properly under way
    if (sp > 1.2 && f > 6) {
      const travel = Math.atan2(dx, dz) * 180 / Math.PI;
      const diff = Math.abs(((travel - a.yaw + 540) % 360) - 180);
      worst.travel = Math.max(worst.travel, diff);
      moved += sp / 60; samples++;
    }
    const partErr = Math.max(...Object.values(a.parts).map(Math.abs));
    worst.parts = Math.max(worst.parts, partErr);
    worst.knee = Math.min(worst.knee, ...a.kneeForward);
    prev = s.pos;
    if (film && f % 6 === 0) shots.push(await frame());
  }
  const s1 = await state(), a1 = await align();
  const r = { label, dir, from: s0.tile, to: s1.tile, seq: s1.seqStep, section: s1.section, moved: +moved.toFixed(2),
    travelVsFacingMaxDeg: Math.round(worst.travel), bodyPartsMaxDeg: worst.parts, kneeMinForward: worst.knee,
    standingSoles: a1.soleY.map((y) => +(y - a1.rootY).toFixed(3)), yawEnd: a1.yaw };
  report.push(r);
  console.log(JSON.stringify(r));
  if (film) fs.writeFileSync(path.join(outDir, `${report.length}_${label.replace(/\W+/g, "_")}.json`), JSON.stringify(shots));
  return r;
}

await move("start: UP onto red", "up");
await move("UP onto yellow", "up");
await move("LEFT onto blue", "left");
await move("RIGHT onto green", "right");
await move("RIGHT onto purple", "right");
await move("LEFT onto pink", "left");
await move("UP onto red (7/7)", "up");
await move("UP onto island 2", "up", 110);

// build filmstrip sheets in the page (JPEG frames -> one PNG per move)
const files = fs.readdirSync(outDir).filter((f) => f.endsWith(".json")).sort((a, b) => parseInt(a) - parseInt(b));
for (const f of files) {
  const shots = JSON.parse(fs.readFileSync(path.join(outDir, f)));
  const png = await page.evaluate(async ({ shots, W, H }) => {
    const k = 0.5, c = document.createElement("canvas");
    c.width = shots.length * W * k; c.height = H * k;
    const g = c.getContext("2d");
    for (let i = 0; i < shots.length; i++) { const im = new Image(); im.src = "data:image/jpeg;base64," + shots[i]; await im.decode(); g.drawImage(im, i * W * k, 0, W * k, H * k); }
    return c.toDataURL("image/jpeg", 0.85);
  }, { shots, W, H });
  fs.writeFileSync(path.join(outDir, f.replace(".json", ".jpg")), Buffer.from(png.split(",")[1], "base64"));
  fs.unlinkSync(path.join(outDir, f));
}
fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 1));
if (errors.length) console.log("PAGE ERRORS:\n" + errors.join("\n"));
await browser.close();
server.close();
