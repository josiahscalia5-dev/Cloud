// Bundles the Level 1 game (src/level1, three.js included) into one classic script,
// public/js/level1.bundle.js. The Android WebView loads the pages from the APK's assets, so the
// game ships as a plain <script> with no ES-module imports.
//
//   node scripts/build.mjs            minified build (what the app ships)
//   node scripts/build.mjs --dev      readable build
//   node scripts/build.mjs --lab      the dev lab only (dev/lab.bundle.js, not shipped)
import * as esbuild from "esbuild";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "..");
const dev = process.argv.includes("--dev") || process.argv.includes("--lab");

const common = {
  bundle: true,
  format: "iife",
  target: ["chrome80"],
  minify: !dev,
  legalComments: "none",
  logLevel: "warning",
  absWorkingDir: root,
};

if (process.argv.includes("--lab")) {
  await esbuild.build({ ...common, entryPoints: ["src/dev/lab.js"], outfile: "dev/lab.bundle.js" });
} else {
  await esbuild.build({ ...common, entryPoints: ["src/level1/main.js"], outfile: "public/js/level1.bundle.js" });
}
console.log("built");
