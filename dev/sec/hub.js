"use strict";
// Probe A: one note that links to N others (a star).  How does the cost grow?
const { Core } = require("../tests/harness.js");
global.window = { setTimeout: setTimeout };

function star(n) {
  const files = [{ path: "Hub.md", basename: "Hub", folder: "" }];
  const row = {};
  for (let i = 0; i < n; i++) {
    files.push({ path: "n" + i + ".md", basename: "n" + i, folder: "" });
    row["n" + i + ".md"] = 1;
  }
  return { files: files, resolvedLinks: { "Hub.md": row } };
}

(async () => {
  const N = +process.argv[2] || 2000;
  const input = star(N);
  const t0 = Date.now();
  const m = await Core.computeMap(input, {}, Core.approximateMeasurer, null, {});
  const ms = Date.now() - t0;
  console.log("N=" + N + "  placed=" + m.counts.placed + "  " + ms + " ms  RSS " +
    Math.round(process.memoryUsage().rss / 1e6) + " MB");
})();
