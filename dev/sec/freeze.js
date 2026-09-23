"use strict";
// Probe G: does the affinity phase still hold the thread?  A 10 ms heartbeat
// timer measures the longest gap the event loop was denied.
const { Core } = require("../tests/harness.js");
global.window = { setTimeout: setTimeout };

let last = Date.now(), worst = 0, beats = 0;
const beat = setInterval(() => {
  const now = Date.now();
  worst = Math.max(worst, now - last);
  last = now; beats++;
}, 10);

function bipartite(h, n) {
  const files = [], links = {};
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
  const input = bipartite(+process.argv[2], +process.argv[3]);
  const hooks = { tick: () => new Promise((r) => setTimeout(r, 0)), cancelled: () => false, progress: () => {} };
  last = Date.now();
  const t0 = Date.now();
  const m = await Core.computeMap(input, {}, Core.approximateMeasurer, null, hooks);
  clearInterval(beat);
  console.log("placed " + m.counts.placed + " links " + m.counts.links +
    "  total " + (Date.now() - t0) + " ms  longest event-loop stall " + worst +
    " ms  (" + beats + " heartbeats)  RSS " + Math.round(process.memoryUsage().rss / 1e6) + " MB");
})();

// ...and the same run cancelled after 400 ms.
