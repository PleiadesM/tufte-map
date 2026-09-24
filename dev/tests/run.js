"use strict";
/* Tufte Map — stage-1 test suite.   node tests/run.js
 *
 * Nine groups, in the order of the brief.  Everything runs against
 * `plugin/main.js` itself (obsidian stubbed through Module._load), and the
 * label audits in group 6 are INDEPENDENT of the placer's own self-check:
 * they recompute the discs and the boxes from the model, because a search
 * and its self-check that share a helper can agree on the same bug. */

const assert = require("assert");
const fs = require("fs");
const H = require("./harness.js");
const { Core, PLUGIN, fixture, group, groupAsync, note, check, report } = H;

const M = Core.approximateMeasurer;
const HUBS = { Typography: 102, Cartography: 84, Rhetoric: 68, Statistics: 63, Color: 55, Notebooks: 45 };
const TOPICS = Object.keys(HUBS);

const fx = fixture("vault-graph.json");
const INPUT = { files: fx.files, resolvedLinks: fx.resolvedLinks };

function nodeByTitle(model, title) {
  return model.nodes.find(function (n) { return n.title === title; });
}

/* -- a document small enough to be obviously honest ---------------------
 * Enough of the DOM for TufteMapRender.draw to run under plain node: nodes
 * that remember their name, their attributes, their inline styles and their
 * text, and nothing else.  There is deliberately no markup parser in here, so
 * a renderer that reached for one would fail rather than be indulged. */
function makeDocStub() {
  const doc = {};
  const mk = function (name) {
    const el = {
      name: name, attrs: {}, styles: {}, children: [], text: "", ownerDocument: doc,
      setAttribute: function (k, v) { this.attrs[k] = String(v); },
      setAttributeNS: function (ns, k, v) { this.attrs[k] = String(v); },
      getAttribute: function (k) { return k in this.attrs ? this.attrs[k] : null; },
      appendChild: function (c) { this.children.push(c); return c; },
      removeChild: function (c) {
        const i = this.children.indexOf(c);
        if (i >= 0) this.children.splice(i, 1);
        return c;
      },
      style: null
    };
    el.style = { setProperty: function (k, v) { el.styles[k] = String(v); } };
    Object.defineProperty(el, "firstChild", {
      get: function () { return this.children.length ? this.children[0] : null; }
    });
    Object.defineProperty(el, "textContent", {
      get: function () { return this.text; },
      set: function (v) { this.text = String(v); }
    });
    return el;
  };
  doc.createElement = function (n) { return mk(n); };
  doc.createElementNS = function (ns, n) { return mk(n); };
  return doc;
}

/** Every node under `host`, in document order, that `pred` accepts. */
function findAll(host, pred) {
  const out = [];
  const walk = function (e) {
    if (pred(e)) out.push(e);
    for (const c of e.children) walk(c);
  };
  for (const c of host.children) walk(c);
  return out;
}

/** The six colours draw() asks a theme for, with none of the probing. */
function fakeTheme() {
  return {
    bg: "#fffff8", ink: "#111111", muted: "#555555", faint: "#999999",
    accent: "#a00000", rule: "#cccccc", fontFamily: "serif", dark: false,
    hasTufteTokens: true, ramp: [[255, 255, 248, 1], [247, 247, 239, 1], [245, 245, 220, 1], [227, 218, 176, 1]],
    contourAlpha: 0.16, indexContourAlpha: 0.38, coastAlpha: 0.4, leaderAlpha: 0.8
  };
}

function hashModel(model) {
  const parts = [];
  for (const n of model.nodes) parts.push(n.path + ":" + n.x.toFixed(9) + "," + n.y.toFixed(9));
  parts.push("|grid:" + model.grid.nx + "x" + model.grid.ny);
  let acc = 0;
  for (let i = 0; i < model.grid.z.length; i++) acc = (acc * 31 + Math.round(model.grid.z[i] * 1e6)) % 2147483647;
  parts.push(String(acc));
  for (const c of model.contours) {
    parts.push(c.kind + "@" + c.level.toFixed(6) + ":" + c.rings.length);
    for (const r of c.rings) {
      let ra = 0;
      for (let i = 0; i < r.length; i++) ra = (ra * 31 + Math.round(r[i] * 1e6)) % 2147483647;
      parts.push(String(ra));
    }
  }
  return require("crypto").createHash("sha256").update(parts.join("|")).digest("hex");
}

function spearman(a, b) {
  const rank = function (v) {
    const s = v.map(function (x, i) { return [x, i]; }).sort(function (p, q) { return p[0] - q[0]; });
    const r = new Array(v.length);
    let i = 0;
    while (i < s.length) {
      let j = i;
      while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[s[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b);
  const mean = function (v) { return v.reduce(function (x, y) { return x + y; }, 0) / v.length; };
  const ma = mean(ra), mb = mean(rb);
  let num = 0, d1 = 0, d2 = 0;
  for (let i = 0; i < ra.length; i++) { num += (ra[i] - ma) * (rb[i] - mb); d1 += (ra[i] - ma) ** 2; d2 += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(d1 * d2);
}

/** Recompute, from scratch, everything the placer claims about a layout. */
function auditLabels(model, layout) {
  const P = layout.mapPerPt;
  const halo = P(Core.constants.HALO_LW_PT / 2) || (Core.constants.HALO_LW_PT / 2) * layout.mapPerPt;
  return auditWith(model, layout, layout.mapPerPt);
}
function auditWith(model, layout, mapPerPt) {
  // The audit recomputes the geometry from the model, and it has to do it at
  // the sheet's OWN scale: a narrow sheet draws smaller dots and smaller type,
  // and an audit that measured design-sized discs against scaled boxes would
  // report a mess that is not on the paper.
  const scale = layout.scale > 0 ? layout.scale : 1;
  const pt = function (v) { return v * scale * mapPerPt; };
  const halo = pt(Core.constants.HALO_LW_PT / 2);
  const clear = pt(Core.constants.SUMMIT_CLEAR_PT);
  const discs = model.nodes.map(function (n) {
    return [n.x, n.y, pt(Core.markerRadiusPt(n.importance)) + pt(Core.constants.DOT_RING_LW_PT / 2)];
  });
  const L = layout.labels;
  let overlaps = 0, touches = 0, leaderHits = 0, summitCovers = 0, summitCrowd = 0;
  for (let a = 0; a < L.length; a++) {
    for (let b = a + 1; b < L.length; b++) {
      if (L[a].forced || L[b].forced) continue;
      const x = L[a].bbox, y = L[b].bbox;
      if (!(x[2] < y[0] || y[2] < x[0] || x[3] < y[1] || y[3] < x[1])) overlaps++;
      if (L[a].tier === "summit" && L[b].tier === "summit" &&
          !(x[2] + clear < y[0] || y[2] + clear < x[0] ||
            x[3] + clear < y[1] || y[3] + clear < x[1])) summitCrowd++;
    }
    // A summit name may not hide a dot the reader is meant to look at.
    if (L[a].tier === "summit" && !L[a].fallback && !L[a].forced) {
      const g = [L[a].bbox[0] - halo, L[a].bbox[1] - halo, L[a].bbox[2] + halo, L[a].bbox[3] + halo];
      for (let i = 0; i < discs.length; i++) {
        if (model.nodes[i].deg < Core.constants.SUMMIT_COVER_MIN_DEG) continue;
        const dx = discs[i][0] - Math.max(g[0], Math.min(discs[i][0], g[2]));
        const dy = discs[i][1] - Math.max(g[1], Math.min(discs[i][1], g[3]));
        if (dx * dx + dy * dy <= discs[i][2] * discs[i][2]) summitCovers++;
      }
    }
    if (L[a].tier === "minor" && !L[a].fallback) {
      const g = [L[a].bbox[0] - halo, L[a].bbox[1] - halo, L[a].bbox[2] + halo, L[a].bbox[3] + halo];
      for (let i = 0; i < discs.length; i++) {
        if (i === L[a].note) continue;
        const dx = discs[i][0] - Math.max(g[0], Math.min(discs[i][0], g[2]));
        const dy = discs[i][1] - Math.max(g[1], Math.min(discs[i][1], g[3]));
        if (dx * dx + dy * dy <= discs[i][2] * discs[i][2]) touches++;
      }
    }
  }
  for (let a = 0; a < L.length; a++) {
    const s = L[a].leader;
    if (!s) continue;
    for (let b = 0; b < L.length; b++) {
      if (b === a) continue;
      const g = [L[b].bbox[0] - halo, L[b].bbox[1] - halo, L[b].bbox[2] + halo, L[b].bbox[3] + halo];
      if (segBox(s, g)) leaderHits++;
    }
    for (let i = 0; i < discs.length; i++) {
      if (i === L[a].note) continue;
      if (model.nodes[i].deg < 8) continue;
      if (segDist2(s, discs[i][0], discs[i][1]) <= discs[i][2] * discs[i][2]) leaderHits++;
    }
  }
  return { overlaps: overlaps, touches: touches, leaderHits: leaderHits,
    summitCovers: summitCovers, summitCrowd: summitCrowd };
}
function segBox(s, box) {
  const dx = s[2] - s[0], dy = s[3] - s[1];
  let t0 = 0, t1 = 1;
  const c = [[-dx, s[0] - box[0]], [dx, box[2] - s[0]], [-dy, s[1] - box[1]], [dy, box[3] - s[1]]];
  for (const [p, q] of c) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}
function segDist2(s, px, py) {
  const dx = s[2] - s[0], dy = s[3] - s[1];
  const sp = dx * dx + dy * dy;
  let t = sp > 0 ? ((px - s[0]) * dx + (py - s[1]) * dy) / sp : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const ex = px - (s[0] + t * dx), ey = py - (s[1] + t * dy);
  return ex * ex + ey * ey;
}

/* -- a seeded synthetic vault, for scale and for the warm-start test ----- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function syntheticVault(n, targetLinks, seed) {
  const rng = mulberry32(seed);
  const files = [];
  const groupsN = 25;
  for (let i = 0; i < n; i++) {
    const g = i % groupsN;
    files.push({ path: "G" + String(g).padStart(2, "0") + "/n" + String(i).padStart(5, "0") + ".md",
      basename: "Note " + i, folder: "G" + String(g).padStart(2, "0") });
  }
  const resolvedLinks = {};
  const hubOf = function (g) { return g; };            // note index g is its group's hub
  let made = 0;
  while (made < targetLinks) {
    const a = Math.floor(rng() * n);
    const g = a % groupsN;
    let b;
    const r = rng();
    if (r < 0.35) b = hubOf(g);
    else if (r < 0.9) { b = Math.floor(rng() * Math.floor(n / groupsN)) * groupsN + g; }
    else b = Math.floor(rng() * n);
    if (b >= n || b === a) continue;
    const src = files[a].path, dst = files[b].path;
    if (!resolvedLinks[src]) resolvedLinks[src] = {};
    if (resolvedLinks[src][dst]) continue;
    resolvedLinks[src][dst] = 1;
    made++;
  }
  return { files: files, resolvedLinks: resolvedLinks };
}

/* ====================================================================== */
async function main() {
  console.log("\nTufte Map — stage-1 tests\n");

  let model = null, modelB = null;

  /* 1 -------------------------------------------------------------- */
  await groupAsync("1. graph", async function () {
    const t0 = Date.now();
    model = await Core.computeMap(INPUT, {}, M, null, null);
    note("computeMap on 518 files: " + (Date.now() - t0) + " ms");
    assert.strictEqual(model.counts.files, 518, "files");
    assert.strictEqual(model.counts.placed, 505, "placed");
    assert.strictEqual(model.counts.isolates, 13, "isolates");
    assert.strictEqual(model.counts.links, 1865, "directed links");
    for (const t of TOPICS) {
      const n = nodeByTitle(model, t);
      assert.ok(n, t + " missing");
      assert.strictEqual(n.deg, HUBS[t], t + " degree " + n.deg + " != " + HUBS[t]);
    }
    note("degrees " + TOPICS.map(function (t) { return t + " " + HUBS[t]; }).join(", "));
    // Excludes really exclude.
    const ex = await Core.computeMap(INPUT, { exclude: ["Knowledge Map Samples/Color"] }, M, null, null);
    check(ex.counts.files < model.counts.files, "exclude did nothing");
    note("exclude ['Color'] -> " + ex.counts.files + " files, " + ex.counts.placed + " placed");
  });

  /* 2 -------------------------------------------------------------- */
  await groupAsync("2. determinism", async function () {
    modelB = await Core.computeMap(INPUT, {}, M, null, null);
    const a = hashModel(model), b = hashModel(modelB);
    assert.strictEqual(a, b, "two runs differ");
    assert.strictEqual(model.hash, modelB.hash, "graph hash differs");
    note("coords+grid+contours sha256 " + a.slice(0, 16) + "…  graph hash " + model.hash);
  });

  /* 3 -------------------------------------------------------------- */
  group("3. summits", function () {
    // Every one of the six hubs anchors a summit.  Stage 1 asserted the
    // converse too — that there were exactly six — and stage 2's packing
    // change made that false honestly: tucking the islet into a corner the
    // frame already had stopped the sheet being padded out to aspect 1.4, the
    // mainland is drawn about a fifth larger, and at that scale Typography's
    // 120 notes separate into two hills instead of one.  A seventh summit on a
    // 505-note vault is a finding, not a fault; what would be a fault is a hub
    // losing its name, so that is what is checked.
    const names = model.peaks.map(function (p) { return p.name; });
    for (const t of TOPICS) {
      assert.ok(names.indexOf(t) !== -1, t + " no longer anchors a summit; peaks: " + names.join(", "));
    }
    assert.ok(model.peaks.length <= 10, model.peaks.length + " peaks exceeds MAX_PEAKS");
    note("peaks (" + model.peaks.length + "): " + names.join(", "));
    for (const p of model.peaks) {
      const n = model.nodes[p.anchor];
      assert.strictEqual(n.title, p.name, "peak name != anchor title");
      assert.strictEqual(n.summit, model.peaks.indexOf(p), "summit back-reference wrong");
    }
    const sum = model.peaks.reduce(function (s, p) { return s + p.count; }, 0);
    assert.strictEqual(sum, 505, "peak counts sum to " + sum);
    note("summits " + model.peaks.map(function (p) { return p.numeral + " " + p.name + " (" + p.count + ")"; }).join(", "));

    // `region` must partition the notes exactly the way `count` says it does:
    // the Summits list in the margin isolates by region and would otherwise
    // light a different set of notes than the number beside it claims.
    const tally = new Array(model.peaks.length).fill(0);
    let unassigned = 0;
    for (const n of model.nodes) {
      if (n.region === null) unassigned++;
      else tally[n.region]++;
    }
    assert.strictEqual(unassigned, 0, unassigned + " notes have no region");
    for (let p = 0; p < model.peaks.length; p++) {
      assert.strictEqual(tally[p], model.peaks[p].count,
        "region " + p + " holds " + tally[p] + " notes but claims " + model.peaks[p].count);
    }
    note("regions partition the 505 placed notes and match every summit's count");

    const islet = model.nodes.filter(function (n) { return n.component !== 0; });
    assert.strictEqual(islet.length, 5, "expected one 5-note component, got " + islet.length);
    let best = Infinity;
    for (const a of islet) {
      for (const b of model.nodes) {
        if (b.component === a.component) continue;
        best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    assert.ok(best >= model.params.componentClearance,
      "islet clearance " + best.toFixed(4) + " < " + model.params.componentClearance);
    note("islet clearance " + best.toFixed(4) + " map units (configured " + model.params.componentClearance + ")");
    const layout = Core.placeLabels(model, M, { sheetWidthPt: 900 });
    const named = layout.labels.some(function (l) { return l.text === "Tufte for Obsidian"; });
    assert.ok(named, "the islet is not named 'Tufte for Obsidian'");
    note("islet named: Tufte for Obsidian");
  });

  /* 4 -------------------------------------------------------------- */
  group("4. geography", function () {
    const sel = model.nodes.filter(function (n) { return TOPICS.includes(n.folder); });
    let tot = 0;
    for (const a of sel) {
      const d = {}, c = {};
      for (const b of sel) {
        if (b === a) continue;
        const dd = Math.hypot(a.x - b.x, a.y - b.y);
        d[b.folder] = (d[b.folder] || 0) + dd; c[b.folder] = (c[b.folder] || 0) + 1;
      }
      const own = d[a.folder] / c[a.folder];
      let bestOther = Infinity;
      for (const f of TOPICS) if (f !== a.folder && c[f]) bestOther = Math.min(bestOther, d[f] / c[f]);
      tot += (bestOther - own) / Math.max(bestOther, own);
    }
    const sil = tot / sel.length;
    note("mean silhouette over the six topics: " + sil.toFixed(4) + "  (n = " + sel.length + ")");
    assert.ok(sil >= 0.45, "silhouette " + sil.toFixed(4) + " < 0.45");

    const fold = model.nodes.map(function (n) { return n.folder; });
    const cross = {};
    for (const [a, b] of model.edges) {
      const fa = fold[a], fb = fold[b];
      if (fa === fb || !TOPICS.includes(fa) || !TOPICS.includes(fb)) continue;
      const k = [fa, fb].sort().join("|");
      cross[k] = (cross[k] || 0) + 1;
    }
    const hub = {};
    for (const t of TOPICS) hub[t] = nodeByTitle(model, t);
    const dist = [], links = [];
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        dist.push(Math.hypot(hub[TOPICS[i]].x - hub[TOPICS[j]].x, hub[TOPICS[i]].y - hub[TOPICS[j]].y));
        links.push(cross[[TOPICS[i], TOPICS[j]].sort().join("|")] || 0);
      }
    }
    const rho = spearman(dist, links);
    note("Spearman(hub distance, cross-topic links) over 15 pairs: " + rho.toFixed(4));
    assert.ok(rho <= -0.4, "spearman " + rho.toFixed(4) + " > -0.4");
  });

  /* 5 -------------------------------------------------------------- */
  group("5. terrain", function () {
    const { nx, ny, z } = model.grid;
    let worst = 0;
    for (let c = 0; c < nx; c++) { worst = Math.max(worst, z[c], z[(ny - 1) * nx + c]); }
    for (let r = 0; r < ny; r++) { worst = Math.max(worst, z[r * nx], z[r * nx + nx - 1]); }
    assert.ok(worst < model.seaLevel, "border cell at " + worst.toFixed(4) + " >= sea level");
    note("highest border cell " + worst.toFixed(5) + " < sea level " + model.seaLevel +
      " (margin used " + model.marginUsed + ")");

    const sample = function (x, y) {
      const gx = x / model.frameW * (nx - 1), gy = y / model.frameH * (ny - 1);
      const c0 = Math.floor(gx), r0 = Math.floor(gy);
      return z[Math.min(r0, ny - 1) * nx + Math.min(c0, nx - 1)];
    };
    for (const p of model.peaks) {
      const n = model.nodes[p.anchor];
      const v = sample(n.x, n.y);
      assert.ok(v >= model.seaLevel, p.name + " anchor is at sea (" + v.toFixed(3) + ")");
    }
    note("all six anchors on land; lowest " +
      Math.min.apply(null, model.peaks.map(function (p) { return sample(model.nodes[p.anchor].x, model.nodes[p.anchor].y); })).toFixed(3));

    const coast = model.contours[0];
    assert.strictEqual(coast.kind, "coast");
    let open = 0;
    for (const r of coast.rings) {
      const n2 = r.length;
      if (Math.abs(r[0] - r[n2 - 2]) > 1e-6 || Math.abs(r[1] - r[n2 - 1]) > 1e-6) open++;
    }
    assert.strictEqual(open, 0, open + " coast ring(s) not closed");
    note(coast.rings.length + " coast rings, all closed; " +
      model.contours.filter(function (c) { return c.kind === "index"; }).length + " index levels");
  });

  /* 6 -------------------------------------------------------------- */
  group("6. labels", function () {
    for (const w of [480, 565, 600, 864, 900, 1300]) {
      const layout = Core.placeLabels(model, M, { sheetWidthPt: w });   // throws on any violation
      const a = auditWith(model, layout, layout.mapPerPt);
      assert.strictEqual(a.overlaps, 0, w + "pt: " + a.overlaps + " label/label overlaps");
      assert.strictEqual(a.touches, 0, w + "pt: " + a.touches + " label/dot touches");
      assert.strictEqual(a.leaderHits, 0, w + "pt: " + a.leaderHits + " leader violations");
      // The summit rule: a name may cover a dot of three links or more only
      // when the placer said it had nowhere clean to stand, and two summit
      // names are never closer than the mutual clearance.
      assert.strictEqual(a.summitCovers, 0,
        w + "pt: " + a.summitCovers + " summit-over-(>=3-link dot) overlaps with no fallback flag");
      assert.strictEqual(a.summitCrowd, 0,
        w + "pt: " + a.summitCrowd + " pairs of summit names closer than " +
        Core.constants.SUMMIT_CLEAR_PT + "·s pt");
      const minor = layout.labels.filter(function (l) { return l.tier === "minor"; });
      const summitFb = layout.labels.filter(function (l) { return l.tier === "summit" && l.fallback; });
      note(w + " pt: scale " + layout.scale.toFixed(3) + ", summit " + layout.summitPt.toFixed(2) +
        " pt, minor " + layout.minorPt.toFixed(2) + " pt — " + layout.labels.length + " labels (" +
        minor.length + " minor, " + layout.leaders.length + " leaders, " +
        layout.dropped.length + " dropped, " + layout.fallbacks.length + " minor fallback, " +
        summitFb.length + " summit fallback) — audit clean");
      if (w === 900) {
        assert.ok(minor.length >= 25 && minor.length <= 35, "900pt minor count " + minor.length + " outside 25..35");
        const mustNamed = minor.filter(function (l) { return l.mustName; }).length;
        const ranked = model.nodes.map(function (n, i) { return i; })
          .filter(function (i) { return model.nodes[i].summit === null; })
          .sort(function (x, y) {
            const a = model.nodes[x], b = model.nodes[y];
            return b.importance - a.importance || b.deg - a.deg || (a.path < b.path ? -1 : 1);
          })
          .slice(0, 14);
        const printed = new Set(minor.map(function (l) { return l.note; }));
        const missing = ranked.filter(function (i) { return !printed.has(i); });
        assert.strictEqual(missing.length, 0, "must-name notes left unnamed: " +
          missing.map(function (i) { return model.nodes[i].title; }).join(", "));
        note("900 pt: all 14 must-name notes named (" + mustNamed + " must-name labels in total)");
      }
      // Zooming in must name more, not fewer: the same sheet width over half
      // the frame is twice the points per map unit.
      if (w === 900) {
        const vp = { x: model.frameW * 0.25, y: 0.25, w: model.frameW * 0.5, h: 0.5 };
        const z = Core.placeLabels(model, M, { sheetWidthPt: w, viewport: vp, maxMinor: 60 });
        note("zoomed to the middle quarter: " + z.labels.length + " labels");
        const za = auditWith(model, z, z.mapPerPt);
        assert.strictEqual(za.overlaps + za.touches + za.leaderHits, 0, "zoomed layout audit dirty");
      }
    }
  });

  /* 7 -------------------------------------------------------------- */
  await groupAsync("7. warm start", async function () {
    const hubPath = fx.files.find(function (f) { return f.basename === "Typography"; }).path;
    const ordinary = fx.files
      .filter(function (f) { return f.folder === "Statistics" || f.folder === "Color"; })
      .filter(function (f) { return !/(^|\/)(Statistics|Color)\.md$/.test(f.path); })
      .slice(-10);
    const gone = new Set(ordinary.map(function (f) { return f.path; }));
    const files2 = fx.files.filter(function (f) { return !gone.has(f.path); });
    const links2 = {};
    for (const s of Object.keys(fx.resolvedLinks)) {
      if (gone.has(s)) continue;
      const row = {};
      for (const d of Object.keys(fx.resolvedLinks[s])) if (!gone.has(d)) row[d] = 1;
      links2[s] = row;
    }
    for (let i = 0; i < 10; i++) {
      const p = "Typography/New note " + i + ".md";
      files2.push({ path: p, basename: "New note " + i, folder: "Typography" });
      links2[p] = { [hubPath]: 1 };
    }
    // The view passes the previous frame width back in, and so does this: the
    // aspect ladder is sticky across runs precisely so that ten notes cannot
    // rescale the sheet, and a warm start that forgets the old frame is not
    // the warm start the plugin performs.
    const warm = await Core.computeMap({ files: files2, resolvedLinks: links2 },
      { prevFrameW: model.frameW }, M, model.layoutPositions, null);
    check(warm.params.warmStart, "warm start not taken");
    assert.strictEqual(warm.frameW, model.frameW,
      "the frame changed width on a warm start: " + model.frameW + " -> " + warm.frameW);
    let worst = 0;
    const moves = [];
    for (const t of TOPICS) {
      const a = nodeByTitle(model, t), b = nodeByTitle(warm, t);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      moves.push(t + " " + d.toFixed(4));
      worst = Math.max(worst, d);
    }
    // Measured against the frame's own width rather than as an absolute
    // number.  Stage 1's limit was 0.06 on a frame 1.4 wide; stage 2's packing
    // change made the frame 1.7 wide, and carrying the absolute number over
    // would have quietly loosened the gate by a fifth.  The tolerance below is
    // stage 1's, restated in the units the reader actually sees: the same
    // fraction of the sheet, whatever the sheet turns out to measure.
    const limit = (0.06 / 1.4) * model.frameW;
    note("hub movement (map units, frame " + model.frameW + " wide): " + moves.join(", "));
    note("worst " + worst.toFixed(4) + " = " + (worst / model.frameW * 100).toFixed(2) + "% of the frame");
    assert.ok(worst < limit, "a hub moved " + worst.toFixed(4) + " >= " + limit.toFixed(4));

    // ...and the islet must not have crossed the sheet.  This is the failure
    // the stay-put slack exists to prevent, and it is invisible in the hub
    // numbers above: the mainland can be perfectly still while the island
    // teleports from one corner to the other.
    const islands = model.nodes.filter(function (n) { return n.component !== 0; });
    let isletWorst = 0;
    for (const a of islands) {
      const b = warm.nodes.find(function (n) { return n.path === a.path; });
      if (!b) continue;
      isletWorst = Math.max(isletWorst, Math.hypot(a.x - b.x, a.y - b.y));
    }
    assert.ok(isletWorst < limit,
      "the islet moved " + isletWorst.toFixed(4) + " >= " + limit.toFixed(4) + " — it was repacked");
    note("islet stayed put: worst member moved " + isletWorst.toFixed(4));

    // Orientation unchanged, tested the two ways it can change: a MIRROR
    // shows up as a flipped signed area of a hub triangle, and a ROTATION as
    // a non-zero Procrustes angle between the two hub configurations.  (A
    // per-pair sign test is no good here: two hubs that sit nearly level
    // swap sign under a movement of a hundredth, which is not a reorientation
    // of anything.)
    const tri = function (m2, a, b, c) {
      const p = nodeByTitle(m2, a), q = nodeByTitle(m2, b), r = nodeByTitle(m2, c);
      return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    };
    for (const t of [["Typography", "Cartography", "Statistics"], ["Rhetoric", "Color", "Notebooks"]]) {
      assert.ok(Math.sign(tri(model, t[0], t[1], t[2])) === Math.sign(tri(warm, t[0], t[1], t[2])),
        "the sheet is mirrored (" + t.join("/") + ")");
    }
    let sxx = 0, sxy = 0, cx1 = 0, cy1 = 0, cx2 = 0, cy2 = 0;
    for (const t of TOPICS) {
      cx1 += nodeByTitle(model, t).x; cy1 += nodeByTitle(model, t).y;
      cx2 += nodeByTitle(warm, t).x; cy2 += nodeByTitle(warm, t).y;
    }
    cx1 /= 6; cy1 /= 6; cx2 /= 6; cy2 /= 6;
    for (const t of TOPICS) {
      const a = nodeByTitle(model, t), b = nodeByTitle(warm, t);
      const ax = a.x - cx1, ay = a.y - cy1, bx = b.x - cx2, by = b.y - cy2;
      sxx += ax * bx + ay * by;
      sxy += ax * by - ay * bx;
    }
    const angle = Math.abs(Math.atan2(sxy, sxx) * 180 / Math.PI);
    assert.ok(angle < 5, "the sheet rotated by " + angle.toFixed(2) + " degrees");
    note("orientation unchanged: no mirror, Procrustes rotation " + angle.toFixed(2) + " degrees");
  });

  /* 8 -------------------------------------------------------------- */
  await groupAsync("8. scale and edge cases", async function () {
    const big = syntheticVault(5000, 25000, 7);
    const stages = [];
    const t0 = Date.now();
    const bigModel = await Core.computeMap(big, {}, M, null, {
      progress: function (s, f) { stages.push([s, Date.now() - t0]); }
    });
    const ms = Date.now() - t0;
    const rss = process.memoryUsage().rss / 1048576;
    const seen = new Map();
    for (const [s, t] of stages) if (!seen.has(s)) seen.set(s, t);
    note("5,000 notes / " + bigModel.counts.links + " links: " + ms + " ms, RSS " + rss.toFixed(0) + " MB");
    note("stage first-seen (ms): " + Array.from(seen.entries()).map(function (kv) { return kv[0] + " " + kv[1]; }).join(", "));
    const lt0 = Date.now();
    Core.placeLabels(bigModel, M, { sheetWidthPt: 900 });
    note("placeLabels on it: " + (Date.now() - lt0) + " ms; " + bigModel.peaks.length + " peaks, " +
      bigModel.contours.length + " contour levels");
    assert.ok(ms < 10000, "5,000-note computeMap took " + ms + " ms");
    assert.ok(rss < 600, "RSS " + rss.toFixed(0) + " MB");

    // Edge cases: nothing throws, and every model is drawable.
    const mk = function (n, linked) {
      const files = [];
      for (let i = 0; i < n; i++) files.push({ path: "n" + i + ".md", basename: "N" + i, folder: "Root" });
      const rl = {};
      if (linked) for (let i = 1; i < n; i++) rl["n" + i + ".md"] = { ["n" + (i - 1) + ".md"]: 1 };
      return { files: files, resolvedLinks: rl };
    };
    for (const n of [0, 1, 2, 12]) {
      const m2 = await Core.computeMap(mk(n, true), {}, M, null, null);
      const l2 = Core.placeLabels(m2, M, { sheetWidthPt: 900 });
      note("n=" + n + ": placed " + m2.counts.placed + ", isolates " + m2.counts.isolates +
        ", peaks " + m2.peaks.length + ", contours " + m2.contours.length + ", labels " + l2.labels.length);
      assert.ok(m2.frameW >= 1.3 && m2.frameW <= 2.0, "frame aspect out of range at n=" + n);
    }
    const none = await Core.computeMap(mk(40, false), {}, M, null, null);
    assert.strictEqual(none.counts.placed, 0);
    assert.strictEqual(none.counts.isolates, 40);
    assert.strictEqual(none.contours.length, 0);
    assert.strictEqual(none.peaks.length, 0);
    note("no links at all: 0 placed, 40 isolates, no terrain — the view shows the " +
      "empty-map line ('no note in this vault links to another') and the isolate count");

    // Forty tiny components.
    const files = [], rl = {};
    for (let c = 0; c < 40; c++) {
      for (let k = 0; k < 4; k++) files.push({ path: "c" + c + "/n" + k + ".md", basename: "c" + c + "n" + k, folder: "c" + c });
      for (let k = 1; k < 4; k++) rl["c" + c + "/n" + k + ".md"] = { ["c" + c + "/n0.md"]: 1 };
    }
    const many = await Core.computeMap({ files: files, resolvedLinks: rl }, {}, M, null, null);
    const lm = Core.placeLabels(many, M, { sheetWidthPt: 900 });
    note("40 four-note components: " + many.counts.placed + " placed, " +
      new Set(many.nodes.map(function (n) { return n.component; })).size + " components, " +
      many.peaks.length + " peaks, " + lm.labels.length + " labels");
    assert.strictEqual(new Set(many.nodes.map(function (n) { return n.component; })).size, 40);
  });

  /* 9 -------------------------------------------------------------- */
  group("9. file hygiene", function () {
    const src = fs.readFileSync(PLUGIN, "utf8");
    require("child_process").execFileSync(process.execPath, ["--check", PLUGIN]);
    for (const bad of ["innerHTML", "insertAdjacentHTML", "outerHTML", "eval(", "new Function",
      'require("fs")', "require('fs')", 'require("path")', 'require("electron")', "TUFTE-SUITE:"]) {
      assert.ok(src.indexOf(bad) === -1, "main.js contains '" + bad + "'");
    }
    // Exactly one require, and it is obsidian's.
    const requires = src.match(/require\(\s*["'][^"']+["']\s*\)/g) || [];
    assert.deepStrictEqual(Array.from(new Set(requires)), ['require("obsidian")'],
      "main.js requires something other than obsidian: " + requires.join(", "));
    assert.ok(/^const \{\n(?:  \w+,\n)*  \w+\n\} = require\("obsidian"\);/.test(src),
      "the file does not open with the obsidian import");
    assert.ok(src.indexOf("// TUFTE-L10N:BEGIN map") !== -1 && src.indexOf("// TUFTE-L10N:END map") !== -1,
      "l10n markers missing");
    assert.ok(src.indexOf("module.exports.__core = TufteMapCore;") !== -1, "__core not exported");

    const manifest = JSON.parse(fs.readFileSync(require("path").join(require("./harness").PLUGIN_DIR, "manifest.json"), "utf8"));
    assert.deepStrictEqual(Object.keys(manifest).sort(),
      ["author", "authorUrl", "description", "id", "isDesktopOnly", "minAppVersion", "name", "version"]);
    assert.strictEqual(manifest.id, "tufte-map");
    assert.strictEqual(manifest.isDesktopOnly, false);

    // Every class the stylesheet is asked to style must be prefixed, and the
    // stylesheet must not reach for !important without saying which Obsidian
    // rule it is beating.
    const rawCss = fs.readFileSync(require("path").join(require("./harness").PLUGIN_DIR, "styles.css"), "utf8");
    const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");   // the prose is not a rule
    const classes = Array.from(new Set((css.match(/\.[A-Za-z][\w-]*/g) || [])
      .map(function (c) { return c.slice(1); })))
      .filter(function (c) { return c.indexOf("tufte-map-") !== 0; })
      .filter(function (c) { return ["theme-dark", "theme-light"].indexOf(c) === -1; });
    assert.deepStrictEqual(classes, [], "styles.css styles unprefixed classes: " + classes.join(", "));
    assert.strictEqual(css.indexOf("!important"), -1, "styles.css uses !important");
    note("node --check clean; one require, obsidian's; no markup setters, no eval, no Node APIs");
    note("styles.css: " + rawCss.split("\n").length + " lines, every class prefixed, no !important");
    note("main.js: " + src.split("\n").length + " lines");
  });

  /* 10 ------------------------------------------------------------- */
  group("10. the packing objective", function () {
    const mainland = [], all = [];
    for (const n of model.nodes) {
      const p = model.layoutPositions[n.path];
      all.push(p);
      if (n.component === 0) mainland.push(p);
    }
    const box = function (pts) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) {
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
        y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      }
      return [x0, x1, y0, y1];
    };
    const bm = box(mainland), ba = box(all);
    const areaMain = Core.fittedFrameArea(bm[0], bm[1], bm[2], bm[3]);
    const areaAll = Core.fittedFrameArea(ba[0], ba[1], ba[2], ba[3]);
    const growth = areaAll / areaMain - 1;
    note("fitted frame: mainland alone " + areaMain.toFixed(3) +
      ", with the islet " + areaAll.toFixed(3) +
      "  (+" + (growth * 100).toFixed(2) + "%)");

    // The objective is now CENTRALITY: the islet sits at the feasible spot
    // nearest the mainland's centroid.  Re-derived here independently of the
    // packer — a finer grid of its own, over the same search box, in layout
    // units — with "feasible" meaning the islet clears every mainland note by
    // the gap it actually achieved (the packer hugs its clearance, so that is
    // the clearance it was given, to within the polish step).  No feasible
    // spot may be nearer the centre than the packer's by more than one of the
    // packer's own coarse steps: the coarse grid picks the cell, the polish
    // only searches around it.
    const centroid = function (pts) {
      let x = 0, y = 0;
      for (const p of pts) { x += p[0]; y += p[1]; }
      return [x / pts.length, y / pts.length];
    };
    const isletPts = [];
    for (const n of model.nodes) if (n.component !== 0) isletPts.push(model.layoutPositions[n.path]);
    const gc = centroid(mainland), ic = centroid(isletPts);
    const hereD = Math.hypot(ic[0] - gc[0], ic[1] - gc[1]);
    let achieved = Infinity;
    for (const a of isletPts) {
      for (const b of mainland) achieved = Math.min(achieved, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
    const spanX = (bm[1] - bm[0]) * 2.2, spanY = (bm[3] - bm[2]) * 2.2;
    const coarse = Math.max(2 * spanX / 60, 2 * spanY / 40);
    const NX = 181, NY = 121;
    let bestD = Infinity;
    for (let a = 0; a < NX; a++) {
      for (let b = 0; b < NY; b++) {
        const tx = gc[0] - spanX + 2 * spanX * a / (NX - 1);
        const ty = gc[1] - spanY + 2 * spanY * b / (NY - 1);
        const d = Math.hypot(tx - gc[0], ty - gc[1]);
        if (d >= bestD) continue;
        const ox = tx - ic[0], oy = ty - ic[1];
        let ok = true;
        for (const p of isletPts) {
          for (const q of mainland) {
            if (Math.hypot(p[0] + ox - q[0], p[1] + oy - q[1]) < achieved * 0.999) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (ok) bestD = d;
      }
    }
    note("islet centroid " + hereD.toFixed(4) + " from the mainland's (layout units); best feasible on an independent " +
      NX + "x" + NY + " grid " + bestD.toFixed(4) + "; tolerance one coarse step " + coarse.toFixed(4));
    assert.ok(hereD <= bestD + coarse,
      "a feasible spot " + bestD.toFixed(4) + " is nearer the centre than the islet's " + hereD.toFixed(4));
    const mapMain = [], mapIslet = [];
    for (const n of model.nodes) (n.component === 0 ? mapMain : mapIslet).push([n.x, n.y]);
    const mgc = centroid(mapMain), mic = centroid(mapIslet);
    note("in map units: islet centroid " + Math.hypot(mic[0] - mgc[0], mic[1] - mgc[1]).toFixed(3) +
      " from the mainland's, on a frame " + model.frameW + " wide");

    // ...and it did so without crowding: the clearance floor still holds.
    const islet = model.nodes.filter(function (n) { return n.component !== 0; });
    let gap = Infinity;
    for (const a of islet) {
      for (const b of model.nodes) {
        if (b.component === a.component) continue;
        gap = Math.min(gap, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    assert.ok(gap >= Core.constants.COMPONENT_CLEARANCE_MAP_FLOOR,
      "clearance " + gap.toFixed(4) + " < " + Core.constants.COMPONENT_CLEARANCE_MAP_FLOOR);
    note("clearance " + gap.toFixed(4) + " map units (floor " +
      Core.constants.COMPONENT_CLEARANCE_MAP_FLOOR + ")");

    // The fitted-frame area is the thing being minimised, so it had better be
    // the area the frame fit actually produces.
    const aspect = (ba[1] - ba[0]) / (ba[3] - ba[2]);
    note("cloud aspect " + aspect.toFixed(3) + " -> frame " + model.frameW +
      " (mainland alone would ask for " +
      ((bm[1] - bm[0]) / (bm[3] - bm[2])).toFixed(3) + ")");
    assert.ok(model.frameW >= 1.3 && model.frameW <= 2.0, "frame aspect out of range");
  });

  /* 11 ------------------------------------------------------------- */
  group("11. adaptive folder depth", function () {
    const dirs = model.nodes.map(function (n) { return Core.dirOfPath(n.path); });
    const depth = Core.adaptiveFolderDepth(dirs);
    assert.strictEqual(depth, 2,
      "this vault should group at depth 2, got " + depth);
    const rows = Core.folderRows(dirs, { rootLabel: "Vault root", otherLabel: "other" });
    assert.strictEqual(rows.depth, 2);
    const keys = rows.rows.map(function (r) { return r.key; });
    for (const t of TOPICS) {
      assert.ok(keys.indexOf("Knowledge Map Samples/" + t) !== -1,
        "no row for " + t + "; rows: " + keys.join(", "));
    }
    assert.ok(keys.indexOf("") !== -1, "no Vault root row");
    assert.strictEqual(rows.rows.find(function (r) { return r.key === ""; }).label, "Vault root");
    const total = rows.rows.reduce(function (s, r) { return s + r.count; }, 0);
    assert.strictEqual(total, model.counts.placed, "folder rows count " + total);
    note("depth 2 -> " + rows.rows.length + " rows: " +
      rows.rows.map(function (r) { return r.label + " " + r.count; }).join(", "));

    // Depth 1 would be useless here and the function must know it.
    const d1 = new Map();
    for (const d of dirs) {
      const k = Core.folderKeyOf(d, 1);
      d1.set(k, (d1.get(k) || 0) + 1);
    }
    const biggest = Math.max.apply(null, Array.from(d1.values()));
    note("at depth 1 the biggest group would hold " +
      (biggest / dirs.length * 100).toFixed(1) + "% of the notes");
    assert.ok(biggest >= 0.6 * dirs.length, "depth 1 was not actually too coarse");

    // A flat vault groups at depth 1, which is the common case.
    const flat = [];
    for (let i = 0; i < 60; i++) flat.push(["Inbox", "Projects", "Reference", "Journal"][i % 4]);
    assert.strictEqual(Core.adaptiveFolderDepth(flat), 1, "a flat vault should group at depth 1");
    const flatRows = Core.folderRows(flat, { rootLabel: "Vault root", otherLabel: "other" });
    assert.strictEqual(flatRows.rows.length, 4);
    note("a flat vault: depth 1 -> " + flatRows.rows.map(function (r) { return r.label; }).join(", "));

    // Twelve rows then `other`, never a thirteenth row.
    const many = [];
    for (let i = 0; i < 40; i++) for (let k = 0; k <= i % 7; k++) many.push("F" + String(i).padStart(2, "0"));
    const cap = Core.folderRows(many, { rootLabel: "Vault root", otherLabel: "other" });
    assert.strictEqual(cap.rows.length, Core.constants.FOLDER_MAX_ROWS + 1);
    const last = cap.rows[cap.rows.length - 1];
    assert.ok(last.other, "the last row is not the 'other' row");
    assert.strictEqual(cap.rows.reduce(function (s, r) { return s + r.count; }, 0), many.length,
      "the rows plus 'other' do not add up");
    note("40 folders -> 12 rows + 'other' (" + last.count + " notes across " + last.keys.length + " folders)");

    // An empty vault, and a vault of nothing but root notes.
    assert.strictEqual(Core.adaptiveFolderDepth([]), 1);
    const rootOnly = Core.folderRows(["", "", ""], { rootLabel: "Vault root", otherLabel: "other" });
    assert.strictEqual(rootOnly.rows.length, 1);
    assert.strictEqual(rootOnly.rows[0].count, 3);
  });

  /* 12 ------------------------------------------------------------- */
  group("12. the view's arithmetic", function () {
    const F = 1.7, H = 1.0;

    /* -- viewport clamp ------------------------------------------------ */
    const whole = Core.clampViewport({ x: 0, y: 0, w: F, h: H }, F, H);
    assert.strictEqual(whole.zoom, 1);
    assert.ok(Math.abs(whole.w - F) < 1e-12 && Math.abs(whole.h - H) < 1e-12);

    const tooFar = Core.clampViewport({ x: 99, y: -99, w: F / 4, h: H / 4 }, F, H);
    assert.ok(tooFar.x <= F - tooFar.w + 1e-12 && tooFar.x >= 0, "x not clamped: " + tooFar.x);
    assert.ok(tooFar.y >= 0 && tooFar.y <= H - tooFar.h + 1e-12, "y not clamped: " + tooFar.y);
    assert.strictEqual(+tooFar.zoom.toFixed(6), 4);

    const tooDeep = Core.clampViewport({ x: 0.5, y: 0.5, w: F / 500, h: H / 500 }, F, H);
    assert.strictEqual(tooDeep.zoom, Core.constants.ZOOM_MAX);
    const tooShallow = Core.clampViewport({ x: 0, y: 0, w: F * 10, h: H * 10 }, F, H);
    assert.strictEqual(tooShallow.zoom, Core.constants.ZOOM_MIN);
    note("clamp: zoom held in [" + Core.constants.ZOOM_MIN + ", " + Core.constants.ZOOM_MAX +
      "], the frame never leaves the sheet");

    /* -- zoom about a point -------------------------------------------- */
    const ax = 1.2, ay = 0.3;
    const zoomed = Core.zoomViewportAbout(whole, F, H, 4, ax, ay);
    assert.strictEqual(+zoomed.zoom.toFixed(6), 4);
    // The anchor keeps its place in the viewport, which is the whole promise
    // of "zoom about the pointer" — as long as the clamp did not have to
    // intervene, which at this anchor it does not.
    const before = [(ax - whole.x) / whole.w, (ay - whole.y) / whole.h];
    const after = [(ax - zoomed.x) / zoomed.w, (ay - zoomed.y) / zoomed.h];
    assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9,
      "the anchor drifted: " + before + " -> " + after);
    // Zooming back out returns the whole frame exactly.
    const out = Core.zoomViewportAbout(zoomed, F, H, 0.25, ax, ay);
    assert.strictEqual(out.zoom, 1);
    assert.ok(Math.abs(out.x) < 1e-12 && Math.abs(out.y) < 1e-12, "zooming out did not recentre");
    note("zoom about (1.2, 0.3) x4 then /4: anchor fixed to 1e-9, back to the whole frame");

    /* -- pan ------------------------------------------------------------ */
    const panned = Core.panViewport(zoomed, F, H, -99, 99);
    assert.ok(panned.x === 0 && Math.abs(panned.y - (H - panned.h)) < 1e-12,
      "a pan past the corner did not stop at it");
    assert.strictEqual(panned.zoom, zoomed.zoom);
    note("pan past the corner stops at the corner and keeps the zoom");

    /* -- the spatial index --------------------------------------------- */
    const xs = [], ys = [];
    for (let i = 0; i < 400; i++) { xs.push((i % 20) * 30 + 5); ys.push(Math.floor(i / 20) * 30 + 5); }
    const idx = Core.buildScreenIndex(xs, ys, 24);
    assert.strictEqual(idx.nearest(5, 5, 24), 0);
    assert.strictEqual(idx.nearest(35, 5, 24), 1);
    assert.strictEqual(idx.nearest(20, 20, 24), 0, "the nearest of four corners is not the first");
    assert.strictEqual(idx.nearest(5, 5, 1), 0);
    assert.strictEqual(idx.nearest(200, 900, 24), -1, "found a note where there is none");
    // A veto keeps a filtered-out note unhoverable: with the point under the
    // pointer refused, the answer is the next one in range, and a tie between
    // two at thirty pixels goes to the lower index.
    assert.strictEqual(idx.nearest(5, 5, 24, function (i) { return i !== 0; }), -1,
      "the veto let something through at 24 px, where only point 0 lies");
    assert.strictEqual(idx.nearest(5, 5, 31, function (i) { return i !== 0; }), 1,
      "the veto did not fall through to the next point");
    // Brute force agrees, at a thousand random probes.
    const rng = mulberry32(99);
    let disagreed = 0;
    for (let t = 0; t < 1000; t++) {
      const px = rng() * 640, py = rng() * 640;
      let best = -1, bd = 24 * 24;
      for (let i = 0; i < xs.length; i++) {
        const d = (xs[i] - px) ** 2 + (ys[i] - py) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (idx.nearest(px, py, 24) !== best) disagreed++;
    }
    assert.strictEqual(disagreed, 0, disagreed + " of 1000 probes disagreed with brute force");
    note("spatial index: 1,000 random probes agree with an exhaustive scan; the veto is honoured");

    /* -- filter composition --------------------------------------------- */
    const nodes = [
      { title: "Alpha", path: "a.md", deg: 3, region: 0 },
      { title: "alphabet", path: "b.md", deg: 9, region: 1 },
      { title: "Beta", path: "c.md", deg: 5, region: 0 },
      { title: "Gamma", path: "d.md", deg: 1, region: 1 }
    ];
    const keys = ["one", "one", "two", "two"];
    const none = Core.filterNotes(nodes, {});
    assert.strictEqual(none.count, 4);
    assert.strictEqual(none.active, false);

    const q = Core.filterNotes(nodes, { query: "ALPHA" });
    assert.strictEqual(q.matches, 2, "the search is not case-insensitive on substrings");
    assert.strictEqual(q.best, 1, "the best match is not the highest-degree one");
    assert.strictEqual(q.searching, true);

    const s = Core.filterNotes(nodes, { summits: [0] });
    assert.deepStrictEqual(Array.from(s.visible), [1, 0, 1, 0]);

    const f = Core.filterNotes(nodes, { folders: ["two"], folderKeys: keys });
    assert.deepStrictEqual(Array.from(f.visible), [0, 0, 1, 1]);

    // ...and they compose: find AND summit AND folder, all three at once.
    const both = Core.filterNotes(nodes, {
      query: "a", summits: [0], folders: ["one"], folderKeys: keys
    });
    assert.deepStrictEqual(Array.from(both.visible), [1, 0, 0, 0],
      "the three filters did not intersect");
    assert.strictEqual(both.count, 1);
    // `best` follows the SEARCH, not the pins: Enter means "the note I typed".
    assert.strictEqual(both.best, 1, "best drifted to a pinned note");
    note("filters compose as an intersection; `best` follows the search alone");

    /* -- which leaf a click opens in ------------------------------------ */
    const C = Core.chooseCompanionLeaf;
    assert.strictEqual(C({ mod: "tab" }).action, "mod");
    assert.strictEqual(C({ mod: "split", companion: { exists: true } }).mod, "split");
    assert.strictEqual(C({ companion: { exists: true, pinned: false, isMap: false } }).action, "companion");
    assert.strictEqual(C({ companion: { exists: false } , recent: { exists: true } }).action, "recent");
    assert.strictEqual(C({ companion: { exists: true, pinned: true },
      recent: { exists: true, pinned: false, isMap: false } }).action, "recent",
      "a pinned companion was reused");
    assert.strictEqual(C({ companion: { exists: true, isMap: true },
      recent: { exists: true, isMap: false } }).action, "recent",
      "the map itself was chosen as a companion");
    assert.strictEqual(C({ recent: { exists: true, isMap: true } }).action, "new",
      "the map itself was chosen as the recent leaf");
    assert.strictEqual(C({ recent: { exists: true, pinned: true } }).action, "new");
    assert.strictEqual(C({}).action, "new");
    note("leaf choice: modifier > companion > most recent non-map, unpinned > a new tab");

    /* -- odds and ends --------------------------------------------------- */
    assert.strictEqual(Core.dirOfPath("A/B/c.md"), "A/B");
    assert.strictEqual(Core.dirOfPath("c.md"), "");
    assert.strictEqual(Core.folderKeyOf("A/B/C", 2), "A/B");
    assert.strictEqual(Core.folderKeyOf("", 2), "");
    assert.strictEqual(Core.modLabel(true), "⌘");
    assert.strictEqual(Core.modLabel(false), "Ctrl");
  });

  /* 13 ------------------------------------------------------------- */
  group("13. every string is translatable", function () {
    const src = fs.readFileSync(PLUGIN, "utf8");
    const begin = src.indexOf("// TUFTE-L10N:BEGIN map");
    const end = src.indexOf("// TUFTE-L10N:END map");
    assert.ok(begin >= 0 && end > begin, "l10n markers missing");
    const block = src.slice(begin, end);

    const used = new Set();
    const re = /\btt\(\s*("(?:[^"\\]|\\.)*")\s*\)/g;
    let m;
    while ((m = re.exec(src)) !== null) used.add(JSON.parse(m[1]));
    // Stage names reach tt() through a table rather than as literals; they are
    // strings the reader sees just the same.
    const table = /const PROGRESS_STAGE = \{([\s\S]*?)\};/.exec(src);
    assert.ok(table, "the progress-stage table went missing");
    const stageRe = /:\s*"((?:[^"\\]|\\.)*)"/g;
    while ((m = stageRe.exec(table[1])) !== null) used.add(m[1]);

    assert.ok(used.size >= 30, "only " + used.size + " strings go through tt()");
    const missing = [];
    for (const s of used) {
      const key = JSON.stringify(s) + ":";
      const at = block.indexOf(key);
      if (at < 0) { missing.push(s); continue; }
      // The KEY may itself contain braces — "{k} of {n} notes" does — so the
      // row's value object starts at the first brace AFTER the key, not at the
      // first brace after the key's start.
      const open = block.indexOf("{", at + key.length);
      const close = block.indexOf("}", open);
      const row = open < 0 || close < 0 ? "" : block.slice(open, close + 1);
      if (row.indexOf('"zh"') < 0) missing.push(s + "  (no zh)");
    }
    assert.deepStrictEqual(missing, [], missing.length + " string(s) have no zh entry:\n  " +
      missing.join("\n  "));
    note(used.size + " strings go through tt(); every one has a zh entry");

    // A placeholder that survives translation into a language that moves it.
    const V = H.plugin.__view;
    assert.strictEqual(V.fmt("Laying out {n} notes…", { n: 12 }), "Laying out 12 notes…");
    assert.strictEqual(V.fmt("{k} of {n}", { k: 1, n: 2 }), "1 of 2");
    assert.strictEqual(V.fmt("{missing}", {}), "{missing}", "an unfilled placeholder was eaten");

    // ...and the exclude parser, which is the one setting the user types a
    // list into.
    assert.deepStrictEqual(V.parseExcludes("  Archive/ \n\n Templates \n"), ["Archive", "Templates"]);
    assert.deepStrictEqual(V.parseExcludes(""), []);
    assert.deepStrictEqual(V.parseExcludes("A/B//"), ["A/B"]);
    note("fmt() and parseExcludes() behave");

    // The view and the settings tab exist and say who they are.
    assert.strictEqual(V.VIEW_TYPE, "tufte-map-view");
    assert.deepStrictEqual(Object.keys(V.DEFAULT_SETTINGS).sort(),
      ["detailsCompact", "detailsFull", "dotSize", "excludeFolders", "importanceInbound",
        "importanceLength", "importanceOutbound", "importanceRecency", "namedNotes", "openIn",
        "showAllLinks", "showBridges", "textFadeThreshold"]);
    assert.strictEqual(typeof V.TufteMapView, "function");
    assert.strictEqual(typeof V.TufteMapSettingTab, "function");
    note("view type '" + V.VIEW_TYPE + "'; settings " +
      JSON.stringify(V.DEFAULT_SETTINGS));
  });

  /* 14 ------------------------------------------------------------- *
   * `data.json` is the one input that does not come from Obsidian: it syncs
   * between devices, it can be edited by hand, and a half-written one is a
   * normal accident.  Every shape below used to be believed. */
  await groupAsync("14. a hostile data.json", async function () {
    const V = H.plugin.__view;
    const paths = model.nodes.map(function (n) { return n.path; });
    const spread = function (v) {
      const p = {};
      for (const k of paths) p[k] = v;
      return p;
    };
    // Every shape a hand-edited or half-synced file can take, against the
    // validator itself — cheap, so the list can be long.
    const refused = ["hello", true, false, null, undefined, 0, [1], [], {},
      [null, null], [NaN, 0], [0, NaN], [Infinity, -Infinity], [1e400, 0],
      { 0: 1, 1: 2 }, [[1], [2]], ["1", "2"], [1, "2"]];
    for (const v of refused) {
      assert.strictEqual(Core.savedPosition({ "a.md": v }, "a.md"), null,
        "a position of " + JSON.stringify(v) + " was believed");
    }
    assert.deepStrictEqual(Core.savedPosition({ "a.md": [1.5, -2.5, 9] }, "a.md"), [1.5, -2.5]);
    assert.deepStrictEqual(Core.savedPosition({ "a.md": [0, 0] }, "a.md"), [0, 0]);
    // ...and an inherited key is not an entry.
    assert.strictEqual(Core.savedPosition({}, "__proto__"), null, "Object.prototype answered as a position");
    assert.strictEqual(Core.savedPosition({}, "constructor"), null, "the constructor answered as a position");
    note(refused.length + " corrupt position shapes refused; a real pair, and only own keys, accepted");

    // Three of them through the whole pipeline, because the failure being
    // guarded against was NaN spreading rather than NaN arriving.
    const junk = {
      "a string where a pair belonged": spread("hello"),
      "a pair of JSON nulls (a round-tripped NaN)": spread([null, null]),
      "a JSON __proto__ key": JSON.parse('{"__proto__":{"polluted":1},"constructor":1}')
    };
    for (const [name, prev] of Object.entries(junk)) {
      const m = await Core.computeMap(INPUT, { prevFrameW: 1.7 }, M, prev, null);
      let bad = 0;
      for (const nd of m.nodes) if (!Number.isFinite(nd.x) || !Number.isFinite(nd.y)) bad++;
      assert.strictEqual(bad, 0, name + ": " + bad + " notes came out non-finite");
      assert.ok(Number.isFinite(m.frameW) && m.frameW > 0, name + ": frame width " + m.frameW);
      assert.ok(m.contours.length > 0, name + ": the sheet came out with no contours");
      assert.ok(m.peaks.length > 0, name + ": the sheet came out with no summits");
      assert.strictEqual(m.params.warmStart, false, name + ": warmed from a map with nothing in it");
    }
    assert.strictEqual(Object.prototype.polluted, undefined, "Object.prototype was written to");
    note(Object.keys(junk).length + " corrupt position maps drawn end to end, every one as a cold " +
      "start: finite coordinates, a real frame, contours and summits");

    // ...and a GOOD saved map still warms, which is the whole point of keeping it.
    const warmPrev = {};
    for (const n of model.nodes) warmPrev[n.path] = model.layoutPositions[n.path];
    const warmed = await Core.computeMap(INPUT, { prevFrameW: model.frameW }, M, warmPrev, null);
    assert.strictEqual(warmed.params.warmStart, true, "a valid saved map did not warm-start");
    // One poisoned entry among good ones is dropped, not believed.
    const mostly = Object.assign({}, warmPrev);
    mostly[model.nodes[0].path] = ["x", null];
    const m2 = await Core.computeMap(INPUT, { prevFrameW: model.frameW }, M, mostly, null);
    assert.strictEqual(m2.params.warmStart, true, "one bad entry threw the warm start away");
    for (const nd of m2.nodes) {
      assert.ok(Number.isFinite(nd.x) && Number.isFinite(nd.y), "one bad entry poisoned the map");
    }
    note("a valid saved map still warm-starts; one poisoned entry among 505 is dropped, not believed");

    // The settings merge copies by KNOWN KEY, so nothing in the file can
    // reparent the settings object or smuggle a key in beside them.
    const hostile = [
      JSON.parse('{"settings":{"__proto__":{"pwned":1}}}'),
      JSON.parse('{"settings":{"constructor":{"prototype":{"pwned":1}}}}'),
      { settings: { showAllLinks: true, somethingElse: 1 } },
      [1, 2, 3], "nope", null
    ];
    for (const data of hostile) {
      const p = Object.create(H.plugin.prototype);
      p.loadData = function () { return Promise.resolve(data); };
      p.saveData = function () { return Promise.resolve(); };
      await p.loadState();
      assert.strictEqual(Object.getPrototypeOf(p.settings), Object.prototype,
        "the settings object was reparented by " + JSON.stringify(data));
      assert.deepStrictEqual(Object.keys(p.settings).sort(),
        Object.keys(V.DEFAULT_SETTINGS).sort(),
        "a key the plugin has no setting for survived the merge");
      assert.ok(p.cache && typeof p.cache.positions === "object", "no cache was built");
    }
    assert.strictEqual(Object.prototype.pwned, undefined, "Object.prototype was written to");
    // The bridges switch is on the whitelist: a saved "off" survives the
    // merge, and a file that never heard of it gets the default, on.
    {
      const p = Object.create(H.plugin.prototype);
      p.loadData = function () { return Promise.resolve({ settings: { showBridges: false, x: 1 } }); };
      p.saveData = function () { return Promise.resolve(); };
      await p.loadState();
      assert.strictEqual(p.settings.showBridges, false, "a saved showBridges: false was not carried");
      const q = Object.create(H.plugin.prototype);
      q.loadData = function () { return Promise.resolve({ settings: {} }); };
      q.saveData = function () { return Promise.resolve(); };
      await q.loadState();
      assert.strictEqual(q.settings.showBridges, true, "showBridges does not default to on");
    }
    // The slider settings take finite numbers only, clamped to the slider's
    // range; a word, a NaN, a numeric STRING all fall back to the default.
    {
      const p = Object.create(H.plugin.prototype);
      p.loadData = function () {
        return Promise.resolve({ settings: { dotSize: "huge", importanceInbound: NaN,
          importanceOutbound: 1e9, importanceLength: -3, importanceRecency: "2" } });
      };
      p.saveData = function () { return Promise.resolve(); };
      await p.loadState();
      const s = p.settings;
      assert.deepStrictEqual(
        [s.dotSize, s.importanceInbound, s.importanceOutbound, s.importanceLength, s.importanceRecency],
        [1, 5, 10, 0, 0], "the slider settings were not sanitised");
      assert.deepStrictEqual(p.importanceWeights(), { inbound: 5, outbound: 10, length: 0, recency: 0 });
    }
    note("loadState() copies the known settings (showBridges among them) and nothing else; no prototype is moved");
  });

  /* 15 ------------------------------------------------------------- *
   * The cost of the walk profiles is set by the LINK graph, not by the note
   * count, so a vault that links densely can spend ten seconds there — and it
   * used to spend them with the window frozen and the run uncancellable. */
  await groupAsync("15. a dense vault stays interruptible", async function () {
    const HUBS_N = 25, LEAVES = 600;
    const files = [], links = {};
    for (let i = 0; i < HUBS_N; i++) files.push({ path: "H" + i + ".md", basename: "H" + i, folder: "" });
    for (let i = 0; i < LEAVES; i++) files.push({ path: "n" + i + ".md", basename: "n" + i, folder: "" });
    for (let i = 0; i < HUBS_N; i++) {
      const row = {};
      for (let k = 0; k < LEAVES; k++) row["n" + k + ".md"] = 1;
      links["H" + i + ".md"] = row;
    }
    const input = { files: files, resolvedLinks: links };

    // The event loop must get turns throughout, not only between epochs.
    let last = Date.now(), worst = 0, beats = 0;
    const beat = setInterval(function () {
      const now = Date.now();
      if (now - last > worst) worst = now - last;
      last = now; beats++;
    }, 10);
    const tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
    last = Date.now();
    const t0 = Date.now();
    const m = await Core.computeMap(input, {}, M, null,
      { tick: tick, cancelled: function () { return false; }, progress: function () {} });
    clearInterval(beat);
    const total = Date.now() - t0;
    assert.strictEqual(m.counts.placed, HUBS_N + LEAVES, "the dense vault did not lay out");
    assert.ok(beats > 20, "the heartbeat only fired " + beats + " times in " + total + " ms");
    assert.ok(worst < Math.max(1500, total / 3),
      "the thread was held for " + worst + " ms of a " + total + " ms run");
    note(m.counts.placed + " notes / " + m.counts.links + " links in " + total +
      " ms; longest stretch without a turn " + worst + " ms (" + beats + " heartbeats)");

    // ...and a cancel asked for during the affinity phase is honoured there,
    // rather than at the first SGD epoch a long way later.
    let stop = false;
    const askAt = 120;
    setTimeout(function () { stop = true; }, askAt);
    const t1 = Date.now();
    let name = "(not cancelled)";
    try {
      await Core.computeMap(input, {}, M, null,
        { tick: tick, cancelled: function () { return stop; }, progress: function () {} });
    } catch (e) { name = e.name; }
    const took = Date.now() - t1;
    assert.strictEqual(name, "MapCancelled", "a cancelled dense run ran to completion");
    assert.ok(took < askAt + Math.max(400, total / 4),
      "the cancel was noticed " + (took - askAt) + " ms after it was asked for");
    note("cancelled " + (took - askAt) + " ms after the ask, " + took +
      " ms into a run that otherwise takes " + total + " ms");
  });

  /* 16 ------------------------------------------------------------- *
   * The renderer, against a document stub small enough to be obviously
   * honest.  Two things are checked: an id is a name and two sheets in one
   * document may not share one, and no vault string reaches an attribute. */
  group("16. the sheet's ids and its strings", function () {
    const doc = makeDocStub();
    const hostile = "<img src=x onerror=alert(1)>\"'</text>";
    // A model with no terrain, so the stub needs no canvas; the mask comes
    // from the LABELS, which is what is under test.
    const bare = Object.assign({}, model, {
      grid: { nx: 0, ny: 0, z: new Float32Array(0) },
      peaks: model.peaks.map(function (p, i) {
        return i === 0 ? Object.assign({}, p, { name: hostile }) : p;
      })
    });
    const layout = Core.placeLabels(bare, M, { sheetWidthPt: 900 });
    assert.ok(layout.masks.length > 0, "no label masks to test with");

    const a = doc.createElement("div"), b = doc.createElement("div");
    H.plugin.__render.draw(a, bare, layout, fakeTheme());
    H.plugin.__render.draw(b, bare, layout, fakeTheme());
    const idOf = function (host) {
      const masks = findAll(host, function (e) { return e.name === "mask"; });
      assert.strictEqual(masks.length, 1, "expected exactly one mask per sheet");
      return masks[0].attrs.id;
    };
    const refOf = function (host) {
      const g = findAll(host, function (e) {
        return e.name === "g" && e.attrs["class"] === "tufte-map-contours";
      });
      assert.strictEqual(g.length, 1, "expected exactly one contour group");
      return g[0].attrs.mask;
    };
    assert.notStrictEqual(idOf(a), idOf(b), "two sheets in one document share a mask id");
    assert.strictEqual(refOf(a), "url(#" + idOf(a) + ")", "a sheet points at the wrong mask");
    assert.strictEqual(refOf(b), "url(#" + idOf(b) + ")", "a sheet points at the wrong mask");
    note("two draws: " + idOf(a) + " and " + idOf(b) + ", each pointed at by its own sheet");

    // The hostile summit name must appear ONLY as text, never in an attribute
    // and never in path data.
    const texts = [], attrs = [];
    for (const e of findAll(a, function () { return true; })) {
      if (e.text) texts.push(e.text);
      for (const k in e.attrs) attrs.push(k + "=" + String(e.attrs[k]));
      for (const k in e.styles) attrs.push("style:" + k + "=" + String(e.styles[k]));
    }
    assert.ok(texts.some(function (t) { return t.indexOf("<IMG SRC=X") !== -1; }),
      "the summit name never reached the sheet at all");
    for (const v of attrs) {
      assert.ok(v.indexOf("<img") === -1 && v.indexOf("<IMG") === -1 && v.indexOf("onerror") === -1,
        "a vault string reached an attribute: " + v.slice(0, 80));
    }
    for (const e of findAll(a, function (x) { return x.name === "path"; })) {
      assert.ok(/^[ML0-9 .\-]*$/.test(e.attrs.d || ""),
        "path data holds something that is not a number: " + String(e.attrs.d).slice(0, 60));
    }
    note(texts.length + " text nodes, " + attrs.length +
      " attributes and styles: the hostile title is in the text and nowhere else");
  });

  /* 17 ------------------------------------------------------------- *
   * One design scale.  The sheet was drawn for 864 pt; every size on it —
   * dots, type, pads, ladders, hairlines — follows the pane, together, and
   * the renderer draws at the scale the placer measured at. */
  group("17. one design scale", function () {
    const C = Core.constants;
    assert.strictEqual(Core.designScale(C.DESIGN_SHEET_PT), 1, "the design width is not scale 1");
    assert.strictEqual(Core.designScale(100), C.SCALE_FLOOR, "the scale is not floored below");
    assert.strictEqual(+Core.designScale(C.SCALE_KNEE_PT).toFixed(12), +C.SCALE_MIN.toFixed(12),
      "the two branches do not meet at the knee");
    assert.strictEqual(Core.designScale(4000), C.SCALE_MAX, "the scale is not clamped above");
    assert.ok(Math.abs(Core.designScale(663) - 663 / 864) < 1e-12,
      "the scale is not linear between the clamps");

    // Type: scaled, with a floor, and the floor is the only thing that may
    // break the proportion.
    const widths = [480, 565, 663, 864, 1300];
    const seen = [];
    for (const w of widths) {
      const s = Core.designScale(w);
      const L = Core.placeLabels(model, M, { sheetWidthPt: w });
      assert.strictEqual(+L.scale.toFixed(12), +s.toFixed(12), w + "pt: layout scale disagrees");
      assert.strictEqual(L.summitPt, Math.max(C.SUMMIT_PT * s, C.SUMMIT_MIN_PT),
        w + "pt: summit size is not the scaled size");
      assert.strictEqual(L.minorPt, Math.max(C.MINOR_PT * s, C.MINOR_MIN_PT),
        w + "pt: minor size is not the scaled size");
      assert.ok(L.summitPt >= C.SUMMIT_MIN_PT && L.minorPt >= C.MINOR_MIN_PT,
        w + "pt: type below the legibility floor");
      for (const lb of L.labels) {
        assert.strictEqual(lb.sizePt, lb.tier === "summit" ? L.summitPt : L.minorPt,
          w + "pt: a label carries a size the layout did not choose");
      }
      seen.push(w + "pt s=" + s.toFixed(3) + " (" + L.labels.length + " labels)");
    }
    note("scale by sheet width: " + seen.join(", "));

    // Zoom magnifies the map, not the marks: the same pane at four times the
    // magnification keeps the same scale and the same type size.
    const wide = Core.placeLabels(model, M, { sheetWidthPt: 663 });
    const zoomed = Core.placeLabels(model, M, { sheetWidthPt: 663, maxMinor: 60,
      viewport: { x: model.frameW * 0.375, y: 0.375, w: model.frameW * 0.25, h: 0.25 } });
    assert.strictEqual(zoomed.scale, wide.scale, "zooming changed the design scale");
    assert.strictEqual(zoomed.summitPt, wide.summitPt, "zooming changed the summit size");
    note("zoom x4 at one pane width: scale " + zoomed.scale.toFixed(3) +
      " unchanged, " + zoomed.labels.length + " labels vs " + wide.labels.length);

    // The renderer draws at the layout's scale, says so on the sheet, and
    // keeps the hairlines hairlines.
    const bare = Object.assign({}, model, { grid: { nx: 0, ny: 0, z: new Float32Array(0) } });
    for (const w of [480, 864, 1300]) {
      const s = Core.designScale(w);
      const L = Core.placeLabels(bare, M, { sheetWidthPt: w });
      const host = makeDocStub().createElement("div");
      H.plugin.__render.draw(host, bare, L, fakeTheme(), { sheetWidthPt: w });
      const svg = host.children[0];
      assert.strictEqual(svg.attrs["data-scale"], s.toFixed(4), w + "pt: data-scale not exposed");
      const dots = findAll(host, function (e) {
        return e.name === "circle" && /tufte-map-dot/.test(e.attrs["class"] || "");
      });
      const biggest = model.nodes.reduce(function (a, b) { return b.importance > a.importance ? b : a; });
      const want = +(Core.markerRadiusPt(biggest.importance) * s).toFixed(3);
      assert.ok(dots.some(function (d) { return +d.attrs.r === want; }),
        w + "pt: no dot is drawn at the scaled radius " + want);
      const coast = findAll(host, function (e) {
        return e.name === "g" && (e.attrs["class"] || "").indexOf("tufte-map-contour-coast") !== -1;
      })[0];
      const hair = Math.max(s, C.HAIRLINE_SCALE_MIN);
      assert.strictEqual(coast.attrs["stroke-width"],
        (C.COAST_LW_PT * hair / C.PT_PER_CSS_PX).toFixed(3),
        w + "pt: the coast hairline is not clamp-scaled");
      assert.ok(+coast.attrs["stroke-width"] >=
        C.COAST_LW_PT * C.HAIRLINE_SCALE_MIN / C.PT_PER_CSS_PX - 1e-9,
        w + "pt: the coast fell below three quarters of its design weight");
    }
    note("renderer: data-scale on the sheet, dot radii x s, hairlines clamped at " +
      C.HAIRLINE_SCALE_MIN + " of their design weight");
  });

  /* 18 -------------------------------------------------------------- *
   * The compact presentation: the arithmetic a sidebar runs on.  Every rule
   * here is someone else's — Töpfer and Pillewizer's radical law, the graph
   * view's fade threshold, Flannery's floor and ceiling — and the point of
   * the group is that the code obeys the rule rather than something near it. */
  group("18. the compact presentation", function () {
    const C = Core.constants;

    /* -- the scale curve ------------------------------------------------ */
    assert.ok(Math.abs(Core.designScale(C.SCALE_KNEE_PT) - C.SCALE_MIN) < 1e-12,
      "the two branches do not meet at the knee");
    assert.ok(Math.abs(Core.designScale(C.SCALE_KNEE_PT - 1e-6) -
      Core.designScale(C.SCALE_KNEE_PT + 1e-6)) < 1e-6, "the scale steps at the knee");
    assert.strictEqual(Core.designScale(1e-3), C.SCALE_FLOOR, "the scale is not floored");
    let prev = 0;
    for (let w = 60; w <= 1400; w += 7) {
      const s = Core.designScale(w);
      assert.ok(s >= prev - 1e-12, w + "pt: the scale is not monotone");
      assert.ok(s >= C.SCALE_FLOOR - 1e-12 && s <= C.SCALE_MAX + 1e-12, w + "pt: out of range");
      prev = s;
    }
    note("scale: " + [300, 436 * C.PT_PER_CSS_PX, 565, 622.08, 864].map(function (w) {
      return Math.round(w) + "pt→" + Core.designScale(w).toFixed(3);
    }).join(", ") + "; floor " + C.SCALE_FLOOR);

    /* -- Töpfer & Pillewizer -------------------------------------------- */
    assert.strictEqual(Core.topferBudget(30, C.REFERENCE_SHEET_PT), 30,
      "the design width does not carry the whole budget");
    assert.strictEqual(Core.topferBudget(40, C.REFERENCE_SHEET_PT / 4), 20,
      "a quarter of the width does not carry half the names");
    assert.ok(Core.topferBudget(30, 312) < Core.topferBudget(30, 663),
      "the budget does not grow with the sheet");
    note("Töpfer: 30 names at 864 pt → " + Core.topferBudget(30, 312) + " at 312 pt, " +
      Core.topferBudget(30, 663) + " at 663 pt, " + Core.topferBudget(30, 1728) + " at 1728 pt");

    /* -- the fade ------------------------------------------------------- */
    const T = Core.tierThreshold(C.TIER_THRESHOLD_MINOR_PT, 0);
    assert.strictEqual(T, C.TIER_THRESHOLD_MINOR_PT, "a zero setting moved the threshold");
    assert.ok(Math.abs(Core.tierThreshold(400, 2) - 200) < 1e-9,
      "two steps of the slider are not an octave");
    assert.ok(Core.tierThreshold(400, -2) === 800, "the slider does not run both ways");
    assert.strictEqual(Core.tierOpacity(0.85 * T, T), 0, "the ramp does not start at 0.85 T");
    assert.strictEqual(Core.tierOpacity(0.84 * T, T), 0, "something is drawn below the ramp");
    assert.strictEqual(Core.tierOpacity(1.15 * T, T), 1, "the ramp does not reach 1 at 1.15 T");
    assert.ok(Math.abs(Core.tierOpacity(T, T) - 0.5) < 1e-9, "the ramp is not centred");
    let last = -1;
    for (let w = 0; w <= 2 * T; w += T / 200) {
      const o = Core.tierOpacity(w, T);
      assert.ok(o >= last - 1e-12, "the fade is not monotone at " + w.toFixed(1));
      assert.ok(o >= 0 && o <= 1, "the fade left [0, 1]");
      last = o;
    }
    const sidebarPt = 312;
    const tiers = Core.labelTiers(sidebarPt, 0);
    assert.strictEqual(tiers.placeMinor, false, "a sidebar would place minor names unzoomed");
    assert.strictEqual(tiers.placeName, true, "a sidebar would drop its summit names");
    assert.ok(Core.labelTiers(sidebarPt * 2.5, 0).placeMinor,
      "a pinch to 2.5x does not bring the minor tier in");
    note("fade at 312 pt: minor " + tiers.minor.toFixed(3) + ", names " + tiers.name.toFixed(3) +
      "; at 2.5x: minor " + Core.labelTiers(sidebarPt * 2.5, 0).minor.toFixed(3));

    /* -- the contour web ------------------------------------------------ */
    assert.strictEqual(Core.contourBands(C.REFERENCE_SHEET_PT), C.TERRAIN_BANDS,
      "the design sheet lost bands");
    assert.strictEqual(Core.contourBands(300), 6, "a 300 pt sheet does not draw six bands");
    assert.ok(Core.contourBands(60) >= 4, "the band count fell below its floor");
    const full = Core.terrainLevels(C.SEA_LEVEL, C.TERRAIN_BANDS);
    const six = Core.reduceLevels(full, 6);
    assert.strictEqual(six.length, 7, "six bands are not seven edges");
    for (const v of six) {
      assert.ok(full.some(function (u) { return Math.abs(u - v) < 1e-12; }),
        "a reduced level is not one of the model's own");
    }
    const sets = full.map(function (lv, i) {
      return { level: lv, kind: i === 0 ? "coast" : "line", rings: [] };
    });
    const cut = Core.reduceContours(sets, six);
    assert.strictEqual(cut.length, 7, "the contour sets do not follow the levels");
    assert.strictEqual(cut[0].kind, "coast", "the coast stopped being the coast");
    assert.strictEqual(cut[3].kind, "index", "an index contour is not every third line");
    note("bands: 864pt→" + Core.contourBands(864) + ", 400pt→" + Core.contourBands(400) +
      ", 312pt→" + Core.contourBands(312) + ", 200pt→" + Core.contourBands(200));

    /* -- the orientation ------------------------------------------------ */
    const F = model.frameW;
    for (const p of [[0, 0], [F, 1], [0.3, 0.8], [F / 2, 0.5]]) {
      const r = Core.rotatePoint(p[0], p[1], F);
      const back = Core.unrotatePoint(r[0], r[1], F);
      assert.ok(Math.abs(back[0] - p[0]) < 1e-12 && Math.abs(back[1] - p[1]) < 1e-12,
        "the rotation does not round-trip at " + p);
    }
    // Turning wins in a tall box and loses in a wide one, and the rule is the
    // one the view uses: whichever fits at the larger scale.
    assert.strictEqual(Core.fitSheet(F, 1, 1000, 300).rotated, false, "a wide box turned");
    assert.strictEqual(Core.fitSheet(F, 1, 280, 700).rotated, true, "a tall box did not turn");
    const tall = Core.fitSheet(F, 1, 280, 700);
    // The gain is bounded by the frame's own aspect (turning a 1.3-wide sheet
    // can win at most 1.3x), so it is checked against the arithmetic rather
    // than a fixed number: the islet packing moved the fixture's frame from
    // 1.7 to 1.3 and a fixed "half again" stopped being reachable.
    const expectGain = Math.min(280, 700 / F) / Math.min(280 / F, 700);
    assert.ok(Math.abs(tall.gain - expectGain) < 1e-9 && tall.gain > 1.2,
      "the tall box gained " + tall.gain + ", expected " + expectGain);
    assert.ok(Math.abs(tall.widthPx - 280) < 1e-9 && tall.heightPx <= 700 + 1e-9,
      "the fitted sheet does not fit its box");
    const rot = Core.rotateModel(model);
    assert.strictEqual(rot.frameW, model.frameH, "the rotated frame is not the old height");
    assert.strictEqual(rot.frameH, model.frameW, "the rotated frame is not the old width");
    assert.strictEqual(rot.nodes.length, model.nodes.length, "a node was lost in the turn");
    assert.strictEqual(rot.uprightFrameW, model.frameW, "the upright frame was not remembered");
    for (let i = 0; i < rot.nodes.length; i += 37) {
      const back = Core.unrotatePoint(rot.nodes[i].x, rot.nodes[i].y, model.frameW);
      assert.ok(Math.abs(back[0] - model.nodes[i].x) < 1e-9 &&
        Math.abs(back[1] - model.nodes[i].y) < 1e-9, "node " + i + " did not come back");
      assert.ok(rot.nodes[i].x >= -1e-9 && rot.nodes[i].x <= rot.frameW + 1e-9,
        "node " + i + " left the rotated frame");
      assert.strictEqual(rot.nodes[i].path, model.nodes[i].path, "the turn reordered the notes");
    }
    assert.notStrictEqual(rot.nodes[0], model.nodes[0], "the turn mutated the model's own nodes");
    assert.strictEqual(model.nodes[0].x, model.nodes[0].x, "the model was touched");
    note("turn: frame " + model.frameW.toFixed(2) + "x1 → 1x" + model.frameW.toFixed(2) +
      "; a 280x700 box gains " + tall.gain.toFixed(2) + "x");

    /* -- the presentation ----------------------------------------------- */
    assert.strictEqual(Core.presentationMode({ widthPx: 436, sideSplit: false }), "compact");
    assert.strictEqual(Core.presentationMode({ widthPx: 1300, sideSplit: true }), "compact",
      "a side split is not compact at width");
    assert.strictEqual(Core.presentationMode({ widthPx: 884, sideSplit: false }), "full");

    /* -- the placer, compact -------------------------------------------- */
    const seen = [];
    for (const w of [150, 220, 312, 420, 560]) {
      const L = Core.placeLabels(model, M, { sheetWidthPt: w, compact: true, maxMinor: 30 });
      const summits = L.labels.filter(function (l) { return l.tier === "summit"; });
      const numerals = L.labels.filter(function (l) { return l.tier === "numeral"; });
      assert.strictEqual(summits.filter(function (l) { return l.fallback; }).length, 0,
        w + "pt: a compact summit name was printed over its own dots");
      assert.strictEqual(L.names + L.numeralsOnly, model.peaks.length,
        w + "pt: a summit is neither named nor numbered");
      for (const l of summits) {
        assert.strictEqual(l.numeral, null, w + "pt: a compact summit set its numeral inline");
        assert.ok(l.sizePt >= C.COMPACT_TYPE_MIN_PT - 1e-9,
          w + "pt: summit type below the 10 px floor");
      }
      for (const l of L.labels.filter(function (x) { return x.tier === "minor"; })) {
        assert.ok(l.sizePt >= C.COMPACT_TYPE_MIN_PT - 1e-9,
          w + "pt: minor type below the 10 px floor");
      }
      // Flannery: the floor on the smallest, the ceiling on the largest, and
      // the flat ladder — a tenth from least to most important — between them.
      const sz = Core.dotSizing(model, L.scale, w, true);
      const imps = model.nodes.map(function (n) { return n.importance; });
      const rs = imps.map(function (v) { return Core.dotRadiusPt(v, L.scale, sz); });
      assert.ok(Math.min.apply(null, rs) >= C.DOT_MIN_RADIUS_PT - 1e-12,
        w + "pt: a dot fell below the 1.1 px floor");
      assert.ok(2 * Math.max.apply(null, rs) <= C.COMPACT_DOT_CAP_FRAC * w + 1e-9,
        w + "pt: the largest dot is over the ceiling");
      assert.ok(Math.max.apply(null, rs) / Math.min.apply(null, rs) <= 1 + C.DOT_SPREAD + 1e-9,
        w + "pt: the most important dot is more than a tenth larger than the least");
      for (let i = 0; i < imps.length; i++) {
        const law = C.DOT_RADIUS_PT * (1 + C.DOT_SPREAD * imps[i]) * L.scale * sz.k;
        if (law <= C.DOT_MIN_RADIUS_PT) continue;
        assert.ok(Math.abs(rs[i] - law) < 1e-9, w + "pt: the flat ladder broke between the floor and the ceiling");
      }
      seen.push(w + "pt s=" + L.scale.toFixed(3) + " " + L.names + " names/" +
        L.numeralsOnly + " numerals/" + numerals.length + " marks");
    }
    note("compact placement: " + seen.join(", "));

    /* -- priority -------------------------------------------------------- */
    // Summits first, then their numerals, then islets, then minor by degree.
    // A lower tier may never be the reason a higher one moves.
    for (const w of [312, 560, 864]) {
      const bare = Core.placeLabels(model, M, { sheetWidthPt: w, compact: w < 600, maxMinor: 0 });
      const full2 = Core.placeLabels(model, M, { sheetWidthPt: w, compact: w < 600, maxMinor: 300 });
      const box = function (L) {
        return L.labels.filter(function (l) { return l.tier === "summit"; })
          .map(function (l) { return l.text + "@" + l.bbox.map(function (v) { return v.toFixed(6); }).join(","); });
      };
      assert.deepStrictEqual(box(full2), box(bare),
        w + "pt: a minor label moved a summit name");
      const tiersOrder = full2.labels.map(function (l) { return l.tier; });
      const firstMinor = tiersOrder.indexOf("minor");
      const lastSummit = tiersOrder.lastIndexOf("summit");
      assert.ok(firstMinor < 0 || firstMinor > lastSummit,
        w + "pt: a minor label was placed before a summit");
      const lastNumeral = tiersOrder.lastIndexOf("numeral");
      assert.ok(lastNumeral < 0 || lastNumeral > lastSummit,
        w + "pt: a numeral was placed before a summit name");
      assert.ok(firstMinor < 0 || lastNumeral < 0 || lastNumeral < firstMinor,
        w + "pt: a minor label was placed before a numeral");
    }
    note("priority: summit boxes are identical with 0 and with 300 minor names asked for, " +
      "at 312, 560 and 864 pt");
  });

  /* 19 ------------------------------------------------------------- *
   * An islet an older packer parked in a corner comes in to the centre on
   * the next warm run — once — and the saved layout does not keep it there. */
  await groupAsync("19. an islet in a corner comes in", async function () {
    const centroid = function (pts) {
      let x = 0, y = 0;
      for (const p of pts) { x += p[0]; y += p[1]; }
      return [x / pts.length, y / pts.length];
    };
    const isletDist = function (m) {
      const main = [], isl = [];
      for (const n of m.nodes) (n.component === 0 ? main : isl).push(m.layoutPositions[n.path]);
      const a = centroid(main), b = centroid(isl);
      return { d: Math.hypot(a[0] - b[0], a[1] - b[1]), main: main, isl: isl };
    };
    const cold = isletDist(model);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of cold.main) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    const W = x1 - x0, Ht = y1 - y0;
    const coarse = Math.max(2 * W * 2.2 / 60, 2 * Ht * 2.2 / 40);
    // Move the islet, rigidly, well off the mainland's top-right corner:
    // clear by any measure, and far from the centre.
    const ic = centroid(cold.isl);
    const ox = x1 + 0.35 * W - ic[0], oy = y1 + 0.35 * Ht - ic[1];
    const prev = {};
    for (const n of model.nodes) {
      const p = model.layoutPositions[n.path];
      prev[n.path] = n.component === 0 ? [p[0], p[1]] : [p[0] + ox, p[1] + oy];
    }
    const mc = centroid(cold.main);
    const cornerD = Math.hypot(ic[0] + ox - mc[0], ic[1] + oy - mc[1]);
    const warm = await Core.computeMap(INPUT, { prevFrameW: model.frameW }, M, prev, null);
    check(warm.params.warmStart, "warm start not taken");
    const after = isletDist(warm);
    note("islet centroid from the mainland's (layout units): cold " + cold.d.toFixed(3) +
      ", parked in the corner " + cornerD.toFixed(3) + ", after one warm run " + after.d.toFixed(3) +
      " (tolerance " + (cold.d * 0.15 + coarse).toFixed(3) + ")");
    assert.ok(Math.abs(after.d - cold.d) <= cold.d * 0.15 + coarse,
      "the islet did not come back in: " + after.d.toFixed(3) + " vs " + cold.d.toFixed(3));
    // ...and a second warm run from there leaves it where it is.
    const again = await Core.computeMap(INPUT, { prevFrameW: warm.frameW }, M, warm.layoutPositions, null);
    let worst = 0;
    for (const n of warm.nodes) {
      if (n.component === 0) continue;
      const b = again.nodes.find(function (m) { return m.path === n.path; });
      worst = Math.max(worst, Math.hypot(n.x - b.x, n.y - b.y));
    }
    const limit = (0.06 / 1.4) * warm.frameW;
    assert.ok(worst < limit, "the islet moved again on the next run: " + worst.toFixed(4));
    note("second warm run: islet worst member moved " + worst.toFixed(4) + " map units (limit " + limit.toFixed(4) + ")");

    // Chained warm runs, each fed the last one's layout and frame — what the
    // plugin does every time the vault changes.  Before the warm SGD's net
    // translation was taken back out, the islet climbed a quarter of a layout
    // unit a run until the stay rule threw it across the sheet (frame 1.3 ->
    // 1.7, the mainland shifted a fifth of a unit) every four to six runs.
    // Bounds: 0.06 map units per run for both, the old code's own worst
    // mainland mean move over twelve runs being 0.055; measured now, the
    // worst is 0.027 (islet) and 0.029 (mainland), both on the first run off
    // a cold layout.
    const mapDist = function (m) {
      const A = [], B = [];
      for (const n of m.nodes) (n.component === 0 ? A : B).push([n.x, n.y]);
      const a = centroid(A), b = centroid(B);
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    };
    let prevRun = model, d1 = null, isletMax = 0, mainMax = 0, fwSteps = 0;
    const dists = [], frames = [model.frameW];
    for (let r = 1; r <= 8; r++) {
      const w = await Core.computeMap(INPUT, { prevFrameW: prevRun.frameW }, M, prevRun.layoutPositions, null);
      const by = {};
      for (const n of prevRun.nodes) by[n.path] = n;
      let iw = 0, mm = 0, mc = 0;
      for (const n of w.nodes) {
        const o = by[n.path];
        const d = Math.hypot(n.x - o.x, n.y - o.y);
        if (n.component !== 0) iw = Math.max(iw, d); else { mm += d; mc++; }
      }
      mm /= mc;
      isletMax = Math.max(isletMax, iw); mainMax = Math.max(mainMax, mm);
      assert.ok(iw <= 0.06, "run " + r + ": the islet's worst member moved " + iw.toFixed(4));
      assert.ok(mm <= 0.06, "run " + r + ": the mainland's mean note moved " + mm.toFixed(4));
      assert.ok(Math.abs(w.frameW - prevRun.frameW) <= 0.1 + 1e-9,
        "run " + r + ": the frame jumped " + prevRun.frameW + " -> " + w.frameW);
      if (w.frameW !== prevRun.frameW) fwSteps++;
      const d = mapDist(w);
      if (d1 === null) d1 = d;
      assert.ok(Math.abs(d - d1) <= 0.15 * d1,
        "run " + r + ": the islet sits " + d.toFixed(3) + " from the mainland, run 1 had " + d1.toFixed(3));
      dists.push(d.toFixed(3)); frames.push(w.frameW);
      prevRun = w;
    }
    note("8 chained warm runs: islet-mainland " + dists.join(" ") + "; worst islet move " +
      isletMax.toFixed(4) + ", worst mainland mean move " + mainMax.toFixed(4) +
      "; frame " + frames.join(" ") + " (" + fwSteps + " changes)");

    // ...and with SEVERAL islets.  The fixture has one, which hid the case:
    // with three more three-note islets the gaps between them and the coast
    // creep by a few per cent a run, and a rule that re-packed a crowded
    // islet at the most central free spot threw one across the sheet (0.8 to
    // 0.95 map units) every five to ten runs with the vault unchanged.  A
    // returning islet now takes the smallest move that keeps it clear and
    // central, so every run's moves stay small.
    const files = fx.files.slice();
    const links = JSON.parse(JSON.stringify(fx.resolvedLinks));
    for (let k = 0; k < 3; k++) {
      const p = function (s) { return "zz/islet" + k + s + ".md"; };
      for (const s of ["a", "b", "c"]) {
        files.push(Object.assign({}, fx.files[0], { path: p(s), basename: "islet" + k + s }));
      }
      links[p("a")] = {}; links[p("a")][p("b")] = 1; links[p("a")][p("c")] = 1;
      links[p("b")] = {}; links[p("b")][p("c")] = 1;
    }
    const MANY = { files: files, resolvedLinks: links };
    let prevMany = await Core.computeMap(MANY, {}, M, null, null);
    const islets = new Set(prevMany.nodes.map(function (n) { return n.component; })).size - 1;
    assert.strictEqual(islets, 4, "expected four islets, got " + islets);
    let manyIslet = 0, manyMain = 0;
    const manyFrames = [prevMany.frameW];
    for (let r = 1; r <= 10; r++) {
      const w = await Core.computeMap(MANY, { prevFrameW: prevMany.frameW }, M, prevMany.layoutPositions, null);
      const by = {};
      for (const n of prevMany.nodes) by[n.path] = n;
      let iw = 0, mm = 0, mc = 0;
      for (const n of w.nodes) {
        const o = by[n.path];
        const d = Math.hypot(n.x - o.x, n.y - o.y);
        if (n.component !== 0) iw = Math.max(iw, d); else { mm += d; mc++; }
      }
      mm /= mc;
      manyIslet = Math.max(manyIslet, iw); manyMain = Math.max(manyMain, mm);
      assert.ok(iw <= 0.06, "four islets, run " + r + ": an islet member moved " + iw.toFixed(4));
      assert.ok(mm <= 0.06, "four islets, run " + r + ": the mainland's mean note moved " + mm.toFixed(4));
      assert.ok(Math.abs(w.frameW - prevMany.frameW) <= 0.1 + 1e-9,
        "four islets, run " + r + ": the frame jumped " + prevMany.frameW + " -> " + w.frameW);
      manyFrames.push(w.frameW);
      prevMany = w;
    }
    note("four islets, 10 chained warm runs: worst islet move " + manyIslet.toFixed(4) +
      ", worst mainland mean move " + manyMain.toFixed(4) + "; frame " + manyFrames.join(" "));

    // A TWO-note islet is laid out cold on every run (a warm layout needs
    // three known notes), and until it was marked as returning by its saved
    // notes it was also packed afresh on every run — to whichever bay was
    // most central that run.  Nudged a little outward from where the packer
    // put it, still clear and still central, it must now stay where the
    // reader last saw it rather than be pulled back to the optimum.
    const PAIR = { files: fx.files.concat([
      Object.assign({}, fx.files[0], { path: "zz/pair-a.md", basename: "pair-a" }),
      Object.assign({}, fx.files[0], { path: "zz/pair-b.md", basename: "pair-b" })
    ]), resolvedLinks: Object.assign({}, fx.resolvedLinks, { "zz/pair-a.md": { "zz/pair-b.md": 1 } }) };
    const pairCold = await Core.computeMap(PAIR, {}, M, null, null);
    const lp = pairCold.layoutPositions;
    const mainPts = [];
    for (const n of pairCold.nodes) if (n.component === 0) mainPts.push(lp[n.path]);
    const gc = centroid(mainPts);
    const pa = lp["zz/pair-a.md"], pb = lp["zz/pair-b.md"];
    const pc = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    const out = Math.hypot(pc[0] - gc[0], pc[1] - gc[1]);
    const push = 0.06;   // six per cent further out: clear, and inside the 15 % of "central"
    const nx = (pc[0] - gc[0]) / out * out * push, ny = (pc[1] - gc[1]) / out * out * push;
    const nudged = {};
    for (const p in lp) nudged[p] = lp[p].slice();
    nudged["zz/pair-a.md"] = [pa[0] + nx, pa[1] + ny];
    nudged["zz/pair-b.md"] = [pb[0] + nx, pb[1] + ny];
    const pairWarm = await Core.computeMap(PAIR, { prevFrameW: pairCold.frameW }, M, nudged, null);
    const qa = pairWarm.layoutPositions["zz/pair-a.md"], qb = pairWarm.layoutPositions["zz/pair-b.md"];
    const qc = [(qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2];
    const kept = Math.hypot(qc[0] - (pc[0] + nx), qc[1] - (pc[1] + ny));
    const pulled = Math.hypot(qc[0] - pc[0], qc[1] - pc[1]);
    note("a two-note islet nudged " + Math.hypot(nx, ny).toFixed(3) + " layout units outward: after a warm run it is " +
      kept.toFixed(3) + " from where it was left and " + pulled.toFixed(3) + " from the packer's optimum");
    assert.ok(kept < 0.25 * Math.hypot(nx, ny),
      "the two-note islet was re-packed instead of staying: " + kept.toFixed(3) + " from where it was left");
  });

  /* 20 ------------------------------------------------------------- */
  group("20. dot centrality", function () {
    const c = Core.dotCentrality(model.nodes);
    let lo = Infinity, hi = -Infinity, anchors = 0;
    const byImp = new Map();
    for (let i = 0; i < model.nodes.length; i++) {
      const n = model.nodes[i];
      if (n.summit !== null) {
        anchors++;
        assert.strictEqual(c[i], undefined, "an anchor has a centrality");
        continue;
      }
      assert.strictEqual(c[i], n.importance, "centrality is not the note's importance");
      assert.ok(c[i] >= 0 && c[i] <= 1, "centrality out of [0, 1]: " + c[i]);
      lo = Math.min(lo, c[i]); hi = Math.max(hi, c[i]);
      if (byImp.has(n.importance)) assert.strictEqual(byImp.get(n.importance), c[i], "equal importance, unequal centrality");
      else byImp.set(n.importance, c[i]);
    }
    // Hand-checked toy, default weights (5, 5, 0, 0).  Link totals
    // 5·in + 5·out = 5, 10, 45, 5, 25; ranked among ALL five (the anchor
    // too), N − 1 = 4: the two 5s tie at (0 + 1/2)/4 = .125, 10 is 2/4 = .5,
    // 25 is 3/4 = .75, 45 is 4/4 = 1.  One part, so the second ranking
    // changes nothing; the anchor (index 2) gets no centrality.
    const TOY = [
      { degIn: 1, degOut: 0, deg: 1, size: 100, path: "a", summit: null },
      { degIn: 1, degOut: 1, deg: 2, size: 300, path: "b", summit: null },
      { degIn: 6, degOut: 3, deg: 9, size: 200, path: "c", summit: 0 },
      { degIn: 0, degOut: 1, deg: 1, size: 400, path: "d", summit: null },
      { degIn: 2, degOut: 3, deg: 5, size: 0, path: "e", summit: null }];
    const toy = Core.dotCentrality(TOY);
    assert.deepStrictEqual(Array.from(toy, function (v) { return v === undefined ? null : +v.toFixed(6); }),
      [0.125, 0.5, null, 0.125, 0.75]);
    // Inbound 10, outbound 5: totals 10, 15, 75, 5, 35 — a backlink now
    // outranks an outgoing link, so a (one in) passes d (one out): d 0,
    // a 1/4, b 2/4, e 3/4, c 1.
    const tw = Core.noteImportance(TOY, { inbound: 10, outbound: 5, length: 0, recency: 0 });
    assert.deepStrictEqual(Array.from(tw), [0.25, 0.5, 1, 0, 0.75]);
    // Links 10 + length 10: link percentiles .125, .5, 1, .125, .75; size
    // percentiles (100, 300, 200, 400, 0) .25, .75, .5, 1, 0; averaged
    // .1875, .625, .75, .5625, .375; ranked again a 0, e 1/4, d 2/4, b 3/4,
    // c 1.
    const tm = Core.noteImportance(TOY, { inbound: 5, outbound: 5, length: 10, recency: 0 });
    assert.deepStrictEqual(Array.from(tm), [0, 0.75, 1, 0.5, 0.25]);
    assert.strictEqual(Core.dotCentrality([{ deg: 3, degIn: 3, degOut: 0, summit: null }])[0], 1,
      "a lone note is not central");
    note("toy: defaults " + JSON.stringify(Array.from(toy, function (v) { return v === undefined ? null : v; })) +
      "; in 10 / out 5 " + JSON.stringify(Array.from(tw)) + "; links + length " + JSON.stringify(Array.from(tm)));
    note(anchors + " anchors left out; " + (model.nodes.length - anchors) + " dots, centrality " +
      lo.toFixed(3) + "–" + hi.toFixed(3) + " over " + byImp.size + " distinct importances; opacity " +
      (0.66 + 0.14 * lo).toFixed(3) + "–" + (0.66 + 0.14 * hi).toFixed(3));

    // The renderer carries it as --c on non-anchor circles only.
    const doc = makeDocStub();
    const bare = Object.assign({}, model, { grid: { nx: 0, ny: 0, z: new Float32Array(0) } });
    const layout = Core.placeLabels(bare, M, { sheetWidthPt: 900 });
    const host = doc.createElement("div");
    H.plugin.__render.draw(host, bare, layout, fakeTheme());
    const circles = findAll(host, function (e) {
      return e.name === "circle" && /(^| )tufte-map-dot( |$)/.test(e.attrs["class"] || "");
    });
    assert.strictEqual(circles.length, model.nodes.length, "not one circle per note");
    for (const el of circles) {
      const i = +el.attrs["data-i"];
      if (model.nodes[i].summit !== null) {
        assert.ok(!("--c" in el.styles), "an anchor carries --c");
      } else {
        assert.strictEqual(el.styles["--c"], model.nodes[i].importance.toFixed(4), "circle " + i + " has the wrong --c");
      }
      assert.strictEqual(el.styles["--k"],
        Math.pow(model.nodes[i].importance, Core.constants.IMPORTANCE_RAMP_GAMMA).toFixed(4), "circle " + i + " has the wrong --k");
    }
    const css = fs.readFileSync(require("path").join(H.PLUGIN_DIR, "styles.css"), "utf8");
    assert.ok(/--tufte-map-dot-alpha-lo:\s*0\.66;/.test(css) && /--tufte-map-dot-alpha-hi:\s*0\.80;/.test(css),
      "styles.css does not carry the 0.66 / 0.80 tokens");
    assert.ok(/\.tufte-map-dot:not\(\.tufte-map-dot-anchor\)\s*\{\s*opacity:/.test(css),
      "no opacity rule for the non-anchor dots");
    const light = /\.tufte-map-view\s*\{[\s\S]*?--tufte-map-dot-hi:\s*([^;]+);/.exec(css);
    const dark = /\.theme-dark \.tufte-map-view\s*\{[\s\S]*?--tufte-map-dot-hi:\s*([^;]+);/.exec(css);
    assert.ok(light && light[1].trim() === "var(--tufte-map-accent)", "light --tufte-map-dot-hi is not the accent");
    assert.ok(dark && dark[1].trim() === "var(--tufte-map-accent)", "dark --tufte-map-dot-hi is not the accent");
    note("--c on " + (circles.length - anchors) + " circles, none on the " + anchors +
      " anchors; --k = importance^" + Core.constants.IMPORTANCE_RAMP_GAMMA + " on all; tokens 0.66 / 0.80; dot-hi is the accent in both modes");
  });

  /* 21 ------------------------------------------------------------- */
  group("21. bridges between the summits", function () {
    const br = Core.bridgeEdges(model);
    const seen = new Set();
    for (const e of br) {
      const a = model.nodes[e[0]], b = model.nodes[e[1]];
      assert.ok(e[0] < e[1], "a pair is not ordered");
      assert.ok(a.region !== null && b.region !== null, "a bridge touches a note with no region");
      assert.notStrictEqual(a.region, b.region, "a bridge inside one region");
      assert.ok(a.component === 0 && b.component === 0, "a bridge touches the islet");
      const k = e[0] + "," + e[1];
      assert.ok(!seen.has(k), "a pair appears twice");
      seen.add(k);
    }
    // Every cross-region link is represented exactly once.
    let directed = 0;
    const want = new Set();
    for (const e of model.edges) {
      const a = model.nodes[e[0]], b = model.nodes[e[1]];
      // Only the mainland carries summits on this fixture, and an islet
      // note's nearest summit is not its territory (see bridgeEdges).
      if (a.component !== 0 || b.component !== 0) continue;
      if (a.region === null || b.region === null || a.region === b.region) continue;
      directed++;
      want.add(Math.min(e[0], e[1]) + "," + Math.max(e[0], e[1]));
    }
    assert.strictEqual(seen.size, want.size, "the bridges are not the cross-region pairs");
    assert.ok(br.length > 100, "suspiciously few bridges: " + br.length);
    const src = fs.readFileSync(require("path").join(H.PLUGIN_DIR, "main.js"), "utf8");
    assert.ok(/const BRIDGE_LINK_ALPHA = 0\.\d+;/.test(src), "no BRIDGE_LINK_ALPHA");
    const regions = new Set(model.nodes.map(function (n) { return n.region; }));
    note(br.length + " bridges (unordered) from " + directed + " directed cross-region links, across " +
      regions.size + " regions; none touches the islet");

    // The land/water clips: every coast ring in the land clip, the water clip
    // its complement in the sheet, and ids that never repeat between draws.
    const V = H.plugin.__view;
    const S = 864 / model.frameW;
    const toSheet = function (x, y) { return [x * S, (1 - y) * S]; };
    const doc = makeDocStub();
    const c1 = V.coastClipPaths(doc, model.contours, toSheet, 864, S, model.hash);
    const c2 = V.coastClipPaths(doc, model.contours, toSheet, 864, S, model.hash);
    assert.ok(c1 && c2, "no clips from a model with a coast");
    const ids = [c1.land, c1.water, c2.land, c2.water];
    assert.strictEqual(new Set(ids).size, 4, "a clip id repeats: " + ids.join(", "));
    assert.strictEqual(c1.landEl.attrs.id, c1.land);
    const landD = c1.landEl.children[0].attrs.d, waterD = c1.waterEl.children[0].attrs.d;
    assert.strictEqual(c1.landEl.children[0].attrs["clip-rule"], "evenodd");
    assert.strictEqual(c1.waterEl.children[0].attrs["clip-rule"], "evenodd");
    let ringCount = 0;
    for (const set of model.contours) {
      if (set.kind !== "coast") continue;
      for (const pts of set.rings) {
        if (pts.length < 6) continue;
        ringCount++;
        const p = toSheet(pts[0], pts[1]);
        const q = toSheet(pts[pts.length - 2], pts[pts.length - 1]);
        const head = "M" + p[0].toFixed(1) + " " + p[1].toFixed(1);
        const tail = "L" + q[0].toFixed(1) + " " + q[1].toFixed(1) + "Z";
        assert.ok(landD.indexOf(head) !== -1 && landD.indexOf(tail) !== -1, "a coast ring is missing from the land clip");
      }
    }
    assert.strictEqual((landD.match(/M/g) || []).length, ringCount, "the land clip is not the coast rings");
    assert.ok(waterD === "M0 0H864.0V" + S.toFixed(1) + "H0Z" + landD, "the water clip is not sheet + coast");
    assert.strictEqual(V.coastClipPaths(doc, [], toSheet, 864, S, model.hash), null, "a coastless sheet was clipped");
    note("coast clips: " + ringCount + " rings in the land clip, water = sheet + rings (even-odd); ids unique across two draws");
  });

  /* 22 ------------------------------------------------------------- */
  await groupAsync("22. importance", async function () {
    const C = Core.constants;
    // Non-decreasing in `key`, and equal keys give equal importance.
    const monotone = function (nodes, key, what) {
      const idx = nodes.map(function (_, i) { return i; })
        .sort(function (a, b) { return nodes[a][key] - nodes[b][key]; });
      for (let k = 1; k < idx.length; k++) {
        const a = nodes[idx[k - 1]], b = nodes[idx[k]];
        if (a[key] === b[key]) assert.strictEqual(a.importance, b.importance, what + ": equal " + key + ", unequal importance");
        else assert.ok(b.importance >= a.importance, what + ": importance falls as " + key + " rises");
      }
    };

    // The defaults reproduce the ranking by degree, ties included.
    monotone(model.nodes, "deg", "defaults");
    assert.deepStrictEqual(model.importance, Core.DEFAULT_IMPORTANCE, "the model does not record its weights");
    // The six hubs are the six anchors, and each is the most important note
    // of its own region.  (Not simply the six most important notes of the
    // vault: Notebooks, at 45 links, is outranked by three 49-link notes that
    // live on Cartography's and Typography's hills, not on a hill of their own.)
    const anchorTitles = model.peaks.map(function (p) { return model.nodes[p.anchor].title; }).sort();
    assert.deepStrictEqual(anchorTitles, TOPICS.slice().sort(), "the six hubs are not the six anchors");
    for (let p = 0; p < model.peaks.length; p++) {
      const a = model.nodes[model.peaks[p].anchor];
      for (const n of model.nodes) {
        if (n.region === p) assert.ok(n.importance <= a.importance, n.title + " outranks its summit " + a.title);
      }
    }
    note("defaults: importance follows degree; the six hubs anchor the six summits and top their regions");

    // Synthetic stats, deterministic in the path.
    const hashNum = function (s, salt) {
      let h = 0x811c9dc5 ^ salt;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return (h >>> 0) % 50000;
    };
    const statted = {
      files: fx.files.map(function (f) {
        return Object.assign({}, f, { size: hashNum(f.path, 1), mtime: 1.7e12 + hashNum(f.path, 2) * 1000 });
      }),
      resolvedLinks: fx.resolvedLinks
    };
    const byLen = await Core.computeMap(statted, { importance: { inbound: 0, outbound: 0, length: 10, recency: 0 } },
      M, model.layoutPositions, null);
    assert.strictEqual(byLen.hash, model.hash, "file stats reached the graph fingerprint");
    assert.deepStrictEqual(byLen.importance, { inbound: 0, outbound: 0, length: 10, recency: 0 });
    monotone(byLen.nodes, "size", "length only");
    const nodes = byLen.nodes;
    const apply = function (w) {
      const v = Core.noteImportance(nodes, w);
      return nodes.map(function (n, i) { return Object.assign({}, n, { importance: v[i] }); });
    };
    monotone(apply({ inbound: 0, outbound: 0, length: 0, recency: 10 }), "mtime", "recency only");
    const zero = Core.noteImportance(nodes, { inbound: 0, outbound: 0, length: 0, recency: 0 });
    assert.ok(Array.from(zero).every(function (v) { return v === 0.5; }), "all-zero weights do not give 0.5 everywhere");
    const mixed = Core.noteImportance(nodes, { inbound: 7, outbound: 2, length: 4, recency: 9 });
    assert.ok(Array.from(mixed).every(function (v) { return v >= 0 && v <= 1; }), "mixed weights left [0, 1]");
    assert.deepStrictEqual(Core.noteImportance(nodes, { inbound: -1, outbound: NaN, length: "3", recency: 0 })[0], 0.5,
      "hostile weights were not read as zero");
    note("length only: monotone in size; recency only: monotone in mtime; all zero: 0.5 each; mixed in [0, 1]");

    // rescoreModel re-anchors a summit without a relayout.
    const m = Object.assign({}, model, {
      nodes: model.nodes.map(function (n) { return Object.assign({}, n); }),
      peaks: model.peaks.map(function (p) { return Object.assign({}, p); })
    });
    const tp = m.peaks.findIndex(function (p) { return p.name === "Typography"; });
    assert.ok(tp >= 0, "no Typography summit");
    const peakXY = m.peaks.map(function (p) { return [p.x, p.y]; });
    const hill = m.nodes.map(function (_, i) { return i; })
      .filter(function (i) { return m.nodes[i].region === tp && m.nodes[i].summit === null; });
    // The note nearest the peak, so it is on the hill anchorPeaks searches,
    // not merely in the region.
    const P = m.peaks[tp];
    const pick = hill.sort(function (a, b) {
      return Math.hypot(m.nodes[a].x - P.x, m.nodes[a].y - P.y) - Math.hypot(m.nodes[b].x - P.x, m.nodes[b].y - P.y);
    })[0];
    for (let i = 0; i < m.nodes.length; i++) m.nodes[i].size = i === pick ? 1e6 : i;
    Core.rescoreModel(m, { inbound: 0, outbound: 0, length: 10, recency: 0 });
    assert.strictEqual(m.peaks[tp].anchor, pick, "the largest note did not become Typography's anchor");
    assert.strictEqual(m.peaks[tp].name, m.nodes[pick].title, "the summit was not renamed after its new anchor");
    assert.deepStrictEqual(m.peaks.map(function (p) { return [p.x, p.y]; }), peakXY, "a peak moved");
    assert.strictEqual(m.peaks.reduce(function (s, p) { return s + p.count; }, 0), 505, "counts do not sum to 505");
    const summitRefs = function () {
      for (let i = 0; i < m.nodes.length; i++) {
        const s = m.nodes[i].summit;
        if (s !== null) assert.strictEqual(m.peaks[s].anchor, i, "a stale summit back-reference");
      }
      for (let p = 0; p < m.peaks.length; p++) {
        if (m.peaks[p].anchor !== null) assert.strictEqual(m.nodes[m.peaks[p].anchor].summit, p, "an anchor without its summit");
      }
    };
    summitRefs();
    assert.deepStrictEqual(m.importance, { inbound: 0, outbound: 0, length: 10, recency: 0 });
    const renamed = m.peaks[tp].name;
    Core.rescoreModel(m, Core.DEFAULT_IMPORTANCE);
    summitRefs();
    assert.deepStrictEqual(m.peaks.map(function (p) { return p.name; }).sort(), TOPICS.slice().sort(),
      "the defaults did not restore the six hub anchors");
    note("rescore by length: Typography's summit -> '" + renamed + "', peaks unmoved, counts sum 505; defaults restore " +
      m.peaks.map(function (p) { return p.name; }).join(", "));

    // The flat ladder, and the reader's multiplier on it.
    assert.ok(Math.abs(Core.markerRadiusPt(1) / Core.markerRadiusPt(0) - 1.1) < 1e-12, "the spread is not a tenth");
    const r2 = Core.dotRadiusPt(0.5, 1, Core.dotSizing(model, 1, 864, false, 2));
    const r1 = Core.dotRadiusPt(0.5, 1, Core.dotSizing(model, 1, 864, false, 1));
    assert.ok(Math.abs(r2 - 2 * r1) < 1e-12, "dot size 2 does not double the radius");
    assert.strictEqual(Core.dotSizing(model, 1, 864, false, 1).k, 1, "dot size 1 is not k = 1");
    assert.strictEqual(Core.dotSizing(model, 1, 864, false, "huge").k, 1, "a non-number dot size was not read as 1");
    note("radius " + Core.markerRadiusPt(0).toFixed(3) + "–" + Core.markerRadiusPt(1).toFixed(3) +
      " pt; dot size 2 doubles it (" + r1.toFixed(3) + " -> " + r2.toFixed(3) + ")");

    // Enter's best match: importance before degree.
    const f = Core.filterNotes([
      { title: "alpha low", path: "a.md", deg: 9, importance: 0.2, region: null },
      { title: "alpha high", path: "b.md", deg: 2, importance: 0.9, region: null }], { query: "alpha" });
    assert.strictEqual(f.best, 1, "the higher-degree note beat the more important one");

    const D = H.plugin.__view.DEFAULT_SETTINGS;
    assert.deepStrictEqual([D.dotSize, D.importanceInbound, D.importanceOutbound, D.importanceLength, D.importanceRecency],
      [1, 5, 5, 0, 0], "the settings defaults moved");
    note("filterNotes prefers importance; DEFAULT_SETTINGS carries dotSize 1 and weights 5 / 5 / 0 / 0");

    // One debounce timer serves every setting, so the kinds asked for inside
    // its window are COLLECTED: a weight slider followed by the dot-size
    // slider must still rescore (a rescore re-places the labels too), and
    // "links" is done beside whichever of them won.  Under Node there is no
    // window; the plugin reaches its timers through one, so lend it ours.
    const hadWindow = global.window;
    global.window = { setTimeout: setTimeout, clearTimeout: clearTimeout };
    try {
      const p = Object.create(H.plugin.prototype);
      const calls = [];
      p.eachView = function (fn) { fn({ refreshFromSettings: function (w) { calls.push(w); } }); };
      const settle = function () { return new Promise(function (r) { setTimeout(r, 550); }); };
      p.debounceViews("importance"); p.debounceViews("names"); p.debounceViews("links");
      await settle();
      assert.deepStrictEqual(calls, ["importance", "links"], "the collected kinds came out as " + JSON.stringify(calls));
      calls.length = 0;
      p.debounceViews("names"); p.debounceViews("recompute"); p.debounceViews("importance");
      await settle();
      assert.deepStrictEqual(calls, ["recompute"], "a recompute did not absorb the rest: " + JSON.stringify(calls));
      calls.length = 0;
      p.debounceViews("names");
      await settle();
      assert.deepStrictEqual(calls, ["names"], "names alone came out as " + JSON.stringify(calls));
      note("debounceViews collects: importance + names + links -> importance, links; names + recompute + importance -> recompute; names alone -> names");
    } finally {
      if (hadWindow === undefined) delete global.window; else global.window = hadWindow;
    }
  });

  process.exit(report() === 0 ? 0 : 1);
}

main().catch(function (e) { console.error(e); process.exit(1); });
