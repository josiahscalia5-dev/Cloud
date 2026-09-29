// Opens a page of the game in a phone-sized Chromium (WebGL, touch) and saves a screenshot.
// Usage: node scripts/shot.mjs <page?query> <out.png> [width height dpr] [--wait ms] [--js "code"]
import { chromium } from "playwright";
import path from "node:path";
import { serve, GL_ARGS } from "./serve_util.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public");
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const wait = +opt("--wait", 800);
const js = opt("--js", null);
const [pageUrl = "level1.html", out = "shot.png", w = 412, h = 915, dpr = 2] = args;
const { server, port } = serve(root);
const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, isMobile: true, hasTouch: true });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[page]", m.text()); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
await page.goto(`http://127.0.0.1:${port}/${pageUrl}`);
await page.waitForSelector("body[data-ready='1']", { timeout: 60000 });
if (js) console.log(await page.evaluate(js));
await page.waitForTimeout(wait);
await page.screenshot({ path: out });
await browser.close();
server.close();
console.log("saved", out);
