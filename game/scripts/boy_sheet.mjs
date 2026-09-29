// Renders contact sheets of the boy's model and animation from the dev lab (dev/lab.html):
// turnaround, run cycle from behind and from the side, a jump, and turning left / right.
// Usage: node scripts/boy_sheet.mjs <out_dir> [sheet ...]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { serve, GL_ARGS } from "./serve_util.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const [outDir = "boy_sheets", ...only] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const { server, port } = serve(root);
const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 300, height: 400 }, deviceScaleFactor: 1 });
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://127.0.0.1:${port}/dev/lab.html`);
await page.waitForSelector("body[data-ready='1']");

// Each sheet: a list of rows; each row a list of frames produced by a function run in the page.
const sheets = {
  turnaround: `(() => {
    const L = window.lab; L.reset(0); L.idle(0.5);
    const row = [];
    for (const y of [0, 45, 90, 135, 180, 225, 270, 315]) { L.cam(y, 10, 2.7); L.render(); row.push(['yaw ' + y, L.renderer.domElement.toDataURL()]); }
    return [row];
  })()`,
  run: `(() => {
    const L = window.lab; const rows = [];
    for (const [label, camYaw, pitch] of [['behind', 0, 16], ['side', 90, 6], ['3/4', 35, 12]]) {
      L.reset(0); L.run(1.2, 5.0, 0);
      const row = [];
      for (let i = 0; i < 8; i++) { L.run(0.045, 5.0, 0); L.cam(camYaw, pitch, 2.9); L.render(); row.push([label + ' ' + i, L.renderer.domElement.toDataURL()]); }
      rows.push(row);
    }
    return rows;
  })()`,
  jump: `(() => {
    const L = window.lab, B = L.boy, T = L.THREE; const rows = [];
    for (const [label, camYaw, flip] of [['jump behind', 0, false], ['jump side', 90, false], ['flip side', 90, true]]) {
      L.reset(0); L.idle(0.3);
      const row = [];
      const start = new T.Vector3(0, 0, 0), end = new T.Vector3(0, 0.3, 2.8), apex = 1.0;
      B.setMode('crouch');
      for (let t = 0; t < 1; t += 0.25) { B.modeT = t; B.update(1/60); }
      B.modeT = 1; B.update(1/60);
      L.cam(camYaw, 8, 3.6, new T.Vector3(0, 1.0, 1.4), 50); L.render(); row.push([label + ' crouch', L.renderer.domElement.toDataURL()]);
      B.setMode('air', { flip, lead: 1 });
      const N = 40;
      for (let k = 1; k <= N; k++) {
        const p = k / N;
        B.root.position.lerpVectors(start, end, p); B.root.position.y += 4 * apex * p * (1 - p);
        B.modeT = p; B.update(1/60);
        if (k % 8 === 0) { L.render(); row.push([label + ' ' + p.toFixed(2), L.renderer.domElement.toDataURL()]); }
      }
      B.setMode('land');
      for (let t = 0; t <= 1; t += 0.1) { B.modeT = t; B.update(1/60); }
      L.render(); row.push([label + ' land', L.renderer.domElement.toDataURL()]);
      B.setMode('ground'); L.idle(0.5); L.render(); row.push([label + ' settle', L.renderer.domElement.toDataURL()]);
      rows.push(row);
    }
    return rows;
  })()`,
  turn: `(() => {
    const L = window.lab, B = L.boy, T = L.THREE; const rows = [];
    for (const [label, dir] of [['swipe LEFT', 1], ['swipe RIGHT', -1], ['swipe UP', 0]]) {
      L.reset(0); L.idle(0.4);
      const row = [];
      const target = dir === 0 ? 0 : dir * 0.8;   // yaw toward the move direction (left = +yaw)
      // turn toward the move and run 2.6 m that way, then turn back to face the course
      let yaw = 0; const rate = 12;
      for (let f = 0; f < 60; f++) {
        const dt = 1/60;
        yaw += Math.sign(target - yaw) * Math.min(Math.abs(target - yaw), rate * dt);
        B.root.rotation.y = yaw;
        const v = f < 4 ? 0 : 5.0;
        B.root.position.x += Math.sin(yaw) * v * dt; B.root.position.z += Math.cos(yaw) * v * dt;
        B.update(dt);
        if (f % 7 === 3) { L.cam(0, 14, 3.4, new T.Vector3(B.root.position.x * 0.5, 0.8, B.root.position.z), 46); L.render(); row.push([label + ' ' + f, L.renderer.domElement.toDataURL()]); }
      }
      rows.push(row);
    }
    return rows;
  })()`,
};

for (const [name, code] of Object.entries(sheets)) {
  if (only.length && !only.includes(name)) continue;
  const rows = await page.evaluate(code);
  const W = 300, H = 400;
  const cols = Math.max(...rows.map((r) => r.length));
  const png = await page.evaluate(async ({ rows, W, H, cols }) => {
    const c = document.createElement("canvas");
    c.width = cols * W; c.height = rows.length * (H + 24);
    const g = c.getContext("2d");
    g.fillStyle = "#101426"; g.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < rows[r].length; i++) {
      const [label, url] = rows[r][i];
      const im = new Image(); im.src = url; await im.decode();
      g.drawImage(im, i * W, r * (H + 24) + 24, W, H);
      g.fillStyle = "#fff"; g.font = "16px sans-serif"; g.fillText(label, i * W + 6, r * (H + 24) + 18);
    }
    return c.toDataURL("image/png");
  }, { rows, W, H, cols });
  fs.writeFileSync(path.join(outDir, name + ".png"), Buffer.from(png.split(",")[1], "base64"));
  console.log("saved", name);
}
await browser.close();
server.close();
