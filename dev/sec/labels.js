"use strict";
// Probe E: placeLabels cost when nearly every note is "heavy" (deg >= 8),
// and when every note sits on the same point.
const { Core } = require("../tests/harness.js");
global.window = { setTimeout: setTimeout };

function ring(n, k) {                       // n notes, each linked to k neighbours
  const files = [], links = {};
  for (let i = 0; i < n; i++) files.push({ path: "n" + i + ".md", basename: "n" + i, folder: "" });
  for (let i = 0; i < n; i++) {
    const r = {};
    for (let d = 1; d <= k; d++) r["n" + ((i + d) % n) + ".md"] = 1;
    links["n" + i + ".md"] = r;
  }
  return { files: files, resolvedLinks: links };
}

(async () => {
  for (const n of [1000, 3000, 6000]) {
    const t0 = Date.now();
    const m = await Core.computeMap(ring(n, 5), {}, Core.approximateMeasurer, null, {});
    const tCompute = Date.now() - t0;
    let heavy = 0;
    for (const nd of m.nodes) if (nd.deg >= 8) heavy++;
    const t1 = Date.now();
    const L = Core.placeLabels(m, Core.approximateMeasurer, { sheetWidthPt: 864, maxMinor: 300 });
    console.log("n=" + n + " heavy=" + heavy + "  compute " + tCompute + " ms  placeLabels " +
      (Date.now() - t1) + " ms  labels " + L.labels.length);
  }

  // every note coincident: the spatial index degenerates to one bin
  const m = await Core.computeMap(ring(2000, 5), {}, Core.approximateMeasurer, null, {});
  for (const nd of m.nodes) { nd.x = m.frameW / 2; nd.y = 0.5; }
  const t2 = Date.now();
  try {
    const L = Core.placeLabels(m, Core.approximateMeasurer, { sheetWidthPt: 864, maxMinor: 300 });
    console.log("coincident 2000: " + (Date.now() - t2) + " ms, labels " + L.labels.length);
  } catch (e) { console.log("coincident 2000: THREW after " + (Date.now() - t2) + " ms: " + e.message); }
})();
