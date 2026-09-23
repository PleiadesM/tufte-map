"use strict";
// Probe B: a vault that is nothing but linked PAIRS -> one component each.
const { Core } = require("../tests/harness.js");
global.window = { setTimeout: setTimeout };

function pairs(k) {
  const files = [], links = {};
  for (let i = 0; i < k; i++) {
    files.push({ path: "a" + i + ".md", basename: "a" + i, folder: "" });
    files.push({ path: "b" + i + ".md", basename: "b" + i, folder: "" });
    links["a" + i + ".md"] = { ["b" + i + ".md"]: 1 };
  }
  // one giant so groups[0] is not a pair
  for (let i = 0; i < 200; i++) files.push({ path: "g" + i + ".md", basename: "g" + i, folder: "" });
  const g = {};
  for (let i = 0; i < 200; i++) { const r = {}; for (let j = 0; j < 200; j++) if (j !== i) r["g" + j + ".md"] = 1; g["g" + i + ".md"] = r; }
  Object.assign(links, g);
  return { files: files, resolvedLinks: links };
}

(async () => {
  const k = +process.argv[2];
  const t0 = Date.now();
  const m = await Core.computeMap(pairs(k), {}, Core.approximateMeasurer, null, {});
  console.log("pairs=" + k + " placed=" + m.counts.placed + "  " + (Date.now() - t0) +
    " ms  RSS " + Math.round(process.memoryUsage().rss / 1e6) + " MB");
})();
