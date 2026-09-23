"use strict";
// Probe A2: many high-degree hubs — the "auto-generated index" shape.
const { Core } = require("../tests/harness.js");
global.window = { setTimeout: setTimeout };

function bipartite(h, n) {
  const files = [];
  const links = {};
  for (let i = 0; i < h; i++) files.push({ path: "H" + i + ".md", basename: "H" + i, folder: "" });
  for (let i = 0; i < n; i++) files.push({ path: "n" + i + ".md", basename: "n" + i, folder: "" });
  for (let i = 0; i < h; i++) {
    const row = {};
    for (let k = 0; k < n; k++) row["n" + k + ".md"] = 1;
    links["H" + i + ".md"] = row;
  }
  return { files: files, resolvedLinks: links };
}

(async () => {
  const h = +process.argv[2], n = +process.argv[3];
  const input = bipartite(h, n);
  const stamps = [];
  const t0 = Date.now();
  const m = await Core.computeMap(input, {}, Core.approximateMeasurer, null, {
    progress: (s) => stamps.push(s + "@" + (Date.now() - t0))
  });
  console.log("hubs=" + h + " leaves=" + n + " links=" + m.counts.links + "  " +
    (Date.now() - t0) + " ms  RSS " + Math.round(process.memoryUsage().rss / 1e6) + " MB");
  console.log("   " + stamps.join(" "));
})();
