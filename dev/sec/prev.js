"use strict";
// Probe C: a hostile data.json `cache.positions` handed to computeMap as `prev`.
const { Core, fixture } = require("../tests/harness.js");
global.window = { setTimeout: setTimeout };
const vault = fixture("vault-graph.json");

function paths(input) { return input.files.filter(f => /\.md$/i.test(f.path)).map(f => f.path); }

function finiteCount(m) {
  let bad = 0;
  for (const nd of m.nodes) if (!Number.isFinite(nd.x) || !Number.isFinite(nd.y)) bad++;
  return bad;
}

const ps = paths(vault);
const cases = {
  "strings instead of pairs": () => { const p = {}; for (const k of ps) p[k] = "hello"; return p; },
  "NaN via JSON null": () => { const p = {}; for (const k of ps) p[k] = [null, null]; return p; },
  "Infinity": () => { const p = {}; for (const k of ps) p[k] = [Infinity, -Infinity]; return p; },
  "huge magnitudes": () => { const p = {}; for (const k of ps) p[k] = [1e300, -1e300]; return p; },
  "objects": () => { const p = {}; for (const k of ps) p[k] = { 0: 1, 1: 2 }; return p; },
  "nested arrays": () => { const p = {}; for (const k of ps) p[k] = [[1], [2]]; return p; },
  "true": () => { const p = {}; for (const k of ps) p[k] = true; return p; },
  "proto-poison key": () => JSON.parse('{"__proto__":{"polluted":1},"constructor":1}'),
  "one bad, rest good": () => { const p = {}; ps.forEach((k, i) => p[k] = i === 3 ? [NaN, 0] : [i * 0.01, i * 0.02]); return p; }
};

(async () => {
  for (const [name, mk] of Object.entries(cases)) {
    let out;
    try {
      const m = await Core.computeMap(vault, { prevFrameW: 1.7 }, Core.approximateMeasurer, mk(), {});
      let lay = "-";
      try {
        const L = Core.placeLabels(m, Core.approximateMeasurer, { sheetWidthPt: 864 });
        lay = L.labels.length + " labels";
      } catch (e) { lay = "placeLabels THREW: " + e.message; }
      out = "placed=" + m.counts.placed + " nonfinite=" + finiteCount(m) +
        " frameW=" + m.frameW + " peaks=" + m.peaks.length + " contours=" + m.contours.length +
        " margin=" + m.marginUsed + " | " + lay;
    } catch (e) { out = "computeMap THREW: " + e.message; }
    console.log(("  " + name).padEnd(30), out);
  }
  console.log("Object.prototype.polluted =", Object.prototype.polluted);
  console.log("({}).polluted =", ({}).polluted);
})();
