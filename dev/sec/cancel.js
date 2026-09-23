"use strict";
// Probe H: can a dense-graph compute be cancelled while it is in the affinity
// phase — the phase that used to be one uninterruptible block?
const { Core } = require("../tests/harness.js");
global.window = { setTimeout: setTimeout };

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
  const afterMs = +process.argv[4] || 1500;
  let stop = false;
  setTimeout(() => { stop = true; }, afterMs);
  const hooks = {
    tick: () => new Promise((r) => setTimeout(r, 0)),
    cancelled: () => stop,
    progress: () => {}
  };
  const t0 = Date.now();
  try {
    await Core.computeMap(bipartite(+process.argv[2], +process.argv[3]), {},
      Core.approximateMeasurer, null, hooks);
    console.log("NOT cancelled; finished in " + (Date.now() - t0) + " ms");
  } catch (e) {
    console.log(e.name + " after " + (Date.now() - t0) + " ms (asked at " + afterMs + " ms)");
  }
})();
