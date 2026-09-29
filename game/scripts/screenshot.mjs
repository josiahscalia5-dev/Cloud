// Renders a page of public/ (index.html by default) the way an Android phone's WebView would
// (Chromium, mobile viewport, touch, device pixel ratio) and saves a screenshot.
// Usage: node scripts/screenshot.mjs <out.png> [width height dpr safeTop safeBottom page]
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
const [out = "shot.png", w = 412, h = 915, dpr = 2.625, safeTop = 28, safeBottom = 0, pageName = ""] = process.argv.slice(2);
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
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://127.0.0.1:${port}/${pageName}?safeTop=${safeTop}&safeBottom=${safeBottom}`);
await page.waitForSelector("body[data-ready='1']", { timeout: 15000 });
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
server.close();
console.log("saved", out);
