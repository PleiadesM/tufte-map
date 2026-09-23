const {
  ItemView,
  Keymap,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  setIcon
} = require("obsidian");

/* ==========================================================================
 * Tufte Map — the vault's link graph drawn as a contour sheet.
 *
 * Notes that link to one another lie close together; the land rises where
 * notes are dense; each hill is named after its most connected note.  The
 * whole pipeline is a port of the Python generator that produced the
 * reference sheets, with one part rewritten rather than ported: Python used
 * umap-learn, and a plugin may not ship a library, so the layout engine here
 * is a hand-written affinity + spectral-init + UMAP-SGD stack.
 *
 * The file has four sections, in this order:
 *
 *   1. l10n            the TUFTE-L10N table and tt()
 *   2. TufteMapCore    pure computation: no DOM, no obsidian, no window
 *   3. TufteMapRender  the SVG sheet: standard DOM only, no markup parsing
 *   4. TufteMapPlugin  stage-1 stub; the view, settings and styles are next
 *
 * Coordinate conventions, stated once and obeyed everywhere:
 *   · "layout units" are the free-floating space the SGD works in.
 *   · "map units" are the framed sheet: the frame is `frameW` wide and
 *     exactly 1.0 tall, x to the RIGHT and y UP, origin bottom-left.  Every
 *     coordinate in the model is in map units.  The renderer is the only
 *     place that flips y for SVG.
 *   · "pt" is a typographic point.  1 pt = 1.333 CSS px.  Type is specified
 *     in pt and stays a constant size on screen, which is why label
 *     placement is separate from the map computation.
 * ====================================================================== */

// Keyed by the exact English literal; tt() falls back to its input, so the
// English behaviour is byte-identical by construction.  Placeholders in braces
// are filled by fmt() AFTER translation, so a language may put the number
// wherever its grammar wants it.
//
// This block is hand-written while the plugin is outside the Suite; once it
// joins, it becomes GENERATED from l10n/strings-map.json by build-l10n.js and
// gains the other forty-odd locales.
// TUFTE-L10N:BEGIN map
var TUFTE_L10N = {
  "Tufte Map": { "zh": "Tufte 地图" },
  "Knowledge map": { "zh": "知识地图" },
  "Open knowledge map": { "zh": "打开知识地图" },
  "Redraw knowledge map from scratch": { "zh": "从头重绘知识地图" },
  "notes": { "zh": "篇笔记" },
  "links": { "zh": "条链接" },
  "Notes that link to one another lie close together, and the land rises where notes crowd; a dot's area is its number of links.":
    { "zh": "互相链接的笔记彼此靠近，笔记密集处地势隆起；点的面积即它的链接数量。" },
  "The red dot on each summit is that region's most connected note — hover a dot to see its links, click to open it, {mod}-hover for a preview.":
    { "zh": "每座山峰上的红点是该区域链接最多的笔记——悬停可看它的链接，点击可打开，{mod}+悬停可预览。" },
  "Find a note": { "zh": "查找笔记" },
  "search titles": { "zh": "搜索标题" },
  "Summits": { "zh": "山峰" },
  "Folders": { "zh": "文件夹" },
  "Show": { "zh": "显示" },
  "all links": { "zh": "全部链接" },
  "bridges": { "zh": "山间连线" },
  "reset view": { "zh": "复位视图" },
  "redraw": { "zh": "重绘" },
  "other": { "zh": "其他" },
  "Vault root": { "zh": "仓库根目录" },
  "no matches": { "zh": "没有匹配的笔记" },
  "{k} of {n} notes": { "zh": "{n} 篇中的 {k} 篇" },
  "{k} notes without links are not shown.": { "zh": "{k} 篇没有链接的笔记未在图上显示。" },
  "There are no Markdown files in this vault yet.": { "zh": "本仓库中还没有 Markdown 笔记。" },
  "No links yet — the map draws itself from links between notes.": { "zh": "还没有链接——地图是由笔记之间的链接画出来的。" },
  "Laying out {n} notes…": { "zh": "正在安放 {n} 篇笔记……" },
  "Could not draw the map — see the console for details.": { "zh": "无法绘制地图——详情请查看控制台。" },
  "reading the links": { "zh": "正在读取链接" },
  "placing the notes": { "zh": "正在安放笔记" },
  "setting the islands": { "zh": "正在安置岛屿" },
  "raising the land": { "zh": "正在隆起地形" },
  "drawing the contours": { "zh": "正在绘制等高线" },
  "Excluded folders": { "zh": "排除的文件夹" },
  "One folder path per line. A note in any of them, or in a folder below it, is left off the map. Plain paths, not patterns.":
    { "zh": "每行一个文件夹路径。位于其中（或其下级文件夹）的笔记不会出现在地图上。只支持普通路径，不支持通配符。" },
  "Open the map in": { "zh": "在何处打开地图" },
  "A tab in the main area, or the right sidebar.": { "zh": "主区域的标签页，或右侧边栏。" },
  "Tab": { "zh": "标签页" },
  "Sidebar": { "zh": "侧边栏" },
  "Notes to name": { "zh": "标注的笔记数量" },
  "How many of the most connected notes the map tries to name. Summits are always named, and zooming in names more.":
    { "zh": "地图尝试为多少篇链接最多的笔记加标注。山峰始终有名字，放大后会标注更多。" },
  "Show all links": { "zh": "显示全部链接" },
  "Show links between summits": { "zh": "显示山峰之间的链接" },
  "Draw the links that run from one summit's region to another as faint hairlines, so the mountains read as connected. On by default.":
    { "zh": "以淡色细线绘制从一个山峰区域通往另一个山峰区域的链接，让群山彼此相连。默认开启。" },
  "Draw every link as a faint hairline. Off by default: the terrain already says where the links are.":
    { "zh": "把每条链接都画成极淡的细线。默认关闭：地形本身已经说明了链接的分布。" },
  "Computing the map…": { "zh": "正在计算地图……" },
  "Drawing…": { "zh": "正在绘制……" },
  "Show details": { "zh": "显示详情" },
  "Hide details": { "zh": "隐藏详情" },
  "Toggle details": { "zh": "开关详情" },
  "hover a dot for its links, click to open": { "zh": "悬停圆点可看链接，点击可打开" },
  "Text fade threshold": { "zh": "文字淡入阈值" },
  "Labels appear sooner or later as you zoom, like the graph view's setting.":
    { "zh": "标签随缩放提前或延后显现，与关系图视图的同名设置一致。" }
};
// TUFTE-L10N:END map

/** Fill {placeholders} AFTER translation, so a locale may reorder them. */
function fmt(s, vals) {
  return String(s).replace(/\{(\w+)\}/g, function (m, k) {
    return vals && Object.prototype.hasOwnProperty.call(vals, k) ? String(vals[k]) : m;
  });
}

function tt(s) {
  try {
    var l = String(window.localStorage.getItem("language") || "").toLowerCase();
    if (!l) return s;
    var row = Object.prototype.hasOwnProperty.call(TUFTE_L10N, s) ? TUFTE_L10N[s] : null;
    if (!row) return s;
    // A translation is a STRING or it is nothing.  `language` is a value from
    // localStorage, and a row is an object literal, so a language of
    // `__proto__` or `constructor` otherwise answers with Object.prototype or
    // with the Object constructor and the interface prints "[object Object]".
    if (typeof row[l] === "string") return row[l];
    var base = l.split("-")[0];
    if (base !== l && typeof row[base] === "string") return row[base];
  } catch (e) {}
  return s;
}

/* ==========================================================================
 * 2. TufteMapCore
 *
 * Everything below this banner up to the TufteMapRender banner is pure: it
 * touches no DOM, no Obsidian API and no global object, so `node` can run it
 * and the test harness can check it without a browser.  Text measurement is
 * the one thing it cannot do itself, so it is injected as `measurer`.
 * ====================================================================== */

/* -- the frame ---------------------------------------------------------- */
const FRAME_H = 1.0;               // the frame is always exactly one unit tall
const FRAME_ASPECT_MIN = 1.3;      // no vault may ask for a square...
const FRAME_ASPECT_MAX = 2.0;      // ...nor for a letterbox
const FRAME_MARGIN = 0.07;         // blank fraction kept on every side
const MARGIN_STEP = 0.03;          // ...grown by this much when land hits the edge
const MARGIN_MAX = 0.30;

/* -- terrain ------------------------------------------------------------ */
const GRID_NY = 300;               // terrain rows; columns follow the aspect
const SEA_LEVEL = 0.10;
const TERRAIN_BANDS = 12;          // filled bands between sea level and the top
const INDEX_CONTOUR_EVERY = 4;     // every Nth inland line is an index contour
const BANDWIDTH_FACTOR = 0.45;     // sigma = this * n^(-1/6) * per-axis stddev
const KERNEL_TRUNCATION = 3.0;     // Gaussian truncated at 3 sigma

/* -- peaks -------------------------------------------------------------- */
const PEAK_FILTER_CELLS = 25;      // local-maximum window, in grid cells
const PEAK_FLOOR = 0.15;
const PEAK_MERGE_DIST = 0.14;      // map units
const MAX_PEAKS = 10;
const MIN_SUMMIT_NOTES_FRAC = 0.03; // ...of the placed notes, clamped:
const MIN_SUMMIT_NOTES_LO = 4;
const MIN_SUMMIT_NOTES_HI = 15;

/* -- contours ----------------------------------------------------------- */
const REFERENCE_SHEET_PT = 864.0;  // the Python sheet: 12 in at 72 pt/in
const CONTOUR_SIMPLIFY_PT = 0.25;  // Douglas-Peucker tolerance at that width

/* -- the design scale ---------------------------------------------------
 * Every size on the sheet — a dot's radius, a label's body size, the pads
 * and the ring ladders the placer searches along — was chosen for a sheet
 * 864 pt wide.  A pane 565 pt wide drawn at those sizes is not a smaller map
 * but the same map with the type left large: names collide, a summit name
 * lies across its own hill's dots, and a hub dot reads as a blot.  So ONE
 * number scales the whole drawing, and everything that has a size in points
 * is multiplied by it — together, because a scale applied to the type but
 * not to the ladder the type is placed along is two designs at once.
 *
 * It is clamped at both ends: below about three quarters the type stops
 * being type, and a sheet wider than the design gains nothing from bigger
 * marks.  The floors below are the smallest sizes that still set: a summit
 * name never falls under 8.25 pt and a minor name never under 6.75 pt, so
 * the very narrowest sheet loses names rather than legibility. */
const DESIGN_SHEET_PT = REFERENCE_SHEET_PT;
const SCALE_MIN = 0.72;
const SCALE_MAX = 1.10;
const SUMMIT_MIN_PT = 8.25;
const MINOR_MIN_PT = 6.75;
// Below the old lower clamp the scale used to stop dead, which is how a
// sidebar got a full-sized design squeezed into a third of the paper.  It now
// CONTINUES, on a softer curve: s = SCALE_MIN * (w / knee)^0.6, joined to the
// linear branch exactly at the knee (w = SCALE_MIN * 864 = 622.08 pt) so the
// two halves meet without a step.  The exponent is what makes it a
// generalisation rather than a shrink: at half the knee width the marks are
// two thirds the size, not half, because type and dots have a legibility floor
// the paper does not.
const SCALE_KNEE_PT = SCALE_MIN * DESIGN_SHEET_PT;
const SCALE_KNEE_EXP = 0.6;
const SCALE_FLOOR = 0.40;
// Töpfer & Pillewizer's Radical Law (1966): a map drawn at a smaller scale
// carries N_d = N_s * sqrt(M_s / M_d) of the features the source carried.  We
// read the scale off the EFFECTIVE sheet width (zoom x sheet width in points)
// against the 864 pt design sheet, and thin the label budget, the contour
// count and the label tiers by that same square root.
const TOPFER_REFERENCE_PT = REFERENCE_SHEET_PT;
// Obsidian's Graph View fades its labels in as you zoom, around a threshold
// the reader sets; it never pops them in.  Same here, per tier: a threshold in
// EFFECTIVE sheet points, and a smoothstep ramp over +-15% of it.  The
// thresholds are the widths at which a tier has room to be read at all —
// minor names need a sheet about 380 pt wide, a summit NAME (as opposed to its
// numeral) about 200 pt.
const TIER_THRESHOLD_MINOR_PT = 380.0;
const TIER_THRESHOLD_NAME_PT = 200.0;
const TIER_FADE_SPAN = 0.15;
// A tier this faint is not a tier the reader can read, so nothing is placed
// for it: placing a label at four per cent costs the search and buys a ghost.
const TIER_FADE_MIN = 0.06;
// Flannery (1956) fixed a MINIMUM symbol size for the smallest value in every
// proportional-symbol map, because a disc below it is a speck rather than a
// datum; the practice also caps the largest disc against the sheet.  The area
// law still holds strictly BETWEEN the floor and the ceiling — the ceiling is
// reached by shrinking every disc by one factor, which is a change of scale,
// not of law, and the floor touches only the smallest.
const DOT_MIN_RADIUS_PX = 1.1;
// 1 pt = 1.3333 CSS px; PT_PER_CSS_PX itself is declared with the type sizes
// below, and a const may not be read before it is declared.
const DOT_MIN_RADIUS_PT = DOT_MIN_RADIUS_PX / 1.3333333333333333;
// ...and the largest dot's DIAMETER, as a fraction of the sheet's width, in
// compact mode only.
const COMPACT_DOT_CAP_FRAC = 0.035;
// The legibility floor for type on screen: 10 px.  The design floors above are
// older and a little larger for the summit tier; in compact the sheet is small
// enough that the 10 px floor is the one that matters, for both tiers.
const COMPACT_TYPE_MIN_PT = 7.5;
const COMPACT_SUMMIT_TRACKING_EM = 0.08;
// A compact summit name displaced this far from its dot earns a hairline
// leader — the reader should not have to guess which hill it names.
const COMPACT_SUMMIT_LEADER_PT = 14.0;
// A pane narrower than this, or one in a side split whatever its width, is
// drawn in the compact presentation.
const COMPACT_MAX_WIDTH_PX = 600;
// Hairlines are hairlines: they scale, but never below three quarters of
// their design weight, or the contour web disappears on a narrow sheet.
const HAIRLINE_SCALE_MIN = 0.75;

/** The one scale, from the UNZOOMED sheet width.  Zoom magnifies the map,
 *  not the marks: a dot that grew while zooming would break the dot-area
 *  law the legend states. */
function designScale(sheetWidthPt) {
  const w = sheetWidthPt > 0 ? sheetWidthPt : DESIGN_SHEET_PT;
  if (w >= SCALE_KNEE_PT) return Math.min(w / DESIGN_SHEET_PT, SCALE_MAX);
  // Continuous at the knee by construction, and monotone: the exponent is
  // positive, so a narrower sheet is never given larger marks.
  return Math.max(SCALE_FLOOR, SCALE_MIN * Math.pow(w / SCALE_KNEE_PT, SCALE_KNEE_EXP));
}

/** Which presentation the container asks for.  A side split is compact at any
 *  width: a sidebar is a column the reader keeps open beside their work, not a
 *  sheet they spread out. */
function presentationMode(o) {
  o = o || {};
  if (o.sideSplit) return "compact";
  return (o.widthPx || 0) < COMPACT_MAX_WIDTH_PX ? "compact" : "full";
}

/** Smooth 0 -> 1 between a and b. */
function smoothstep(a, b, x) {
  if (!(b > a)) return x >= b ? 1 : 0;
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
}

/** A tier's threshold in effective sheet points, moved by the reader's
 *  setting exactly as the graph view's slider moves its own: one step of the
 *  slider is a half-octave of zoom. */
function tierThreshold(basePt, t) {
  return basePt * Math.pow(2, -(t || 0) / 2);
}

/** ...and the opacity that threshold gives at this effective width. */
function tierOpacity(effectiveWidthPt, thresholdPt) {
  return smoothstep((1 - TIER_FADE_SPAN) * thresholdPt,
    (1 + TIER_FADE_SPAN) * thresholdPt, effectiveWidthPt);
}

/** Both tiers at once, plus whether each is worth placing at all. */
function labelTiers(effectiveWidthPt, threshold) {
  const minor = tierOpacity(effectiveWidthPt, tierThreshold(TIER_THRESHOLD_MINOR_PT, threshold));
  const name = tierOpacity(effectiveWidthPt, tierThreshold(TIER_THRESHOLD_NAME_PT, threshold));
  return {
    minor: minor, name: name,
    placeMinor: minor >= TIER_FADE_MIN,
    placeName: name >= TIER_FADE_MIN,
    effectiveWidthPt: effectiveWidthPt
  };
}

/** Töpfer & Pillewizer: how many minor names a sheet this wide may carry. */
function topferBudget(namedNotes, effectiveWidthPt) {
  const n = Math.round((namedNotes || 0) * Math.sqrt(Math.max(effectiveWidthPt, 1) / TOPFER_REFERENCE_PT));
  return Math.max(0, n);
}

/** ...and how many terrain bands.  Only counts that DIVIDE the twelve the
 *  model was computed with are offered, because a reduced sheet must draw a
 *  SUBSET of the model's own levels — a band edge that no contour marks is the
 *  shimmer the quantised raster exists to prevent. */
const CONTOUR_BAND_CHOICES = [4, 6, 12];

function contourBands(sheetWidthPt) {
  const raw = TERRAIN_BANDS * Math.sqrt(Math.max(sheetWidthPt, 1) / TOPFER_REFERENCE_PT);
  const even = 2 * Math.floor(raw / 2);
  let best = CONTOUR_BAND_CHOICES[0];
  for (let i = 0; i < CONTOUR_BAND_CHOICES.length; i++) {
    if (CONTOUR_BAND_CHOICES[i] <= even) best = CONTOUR_BAND_CHOICES[i];
  }
  return best;
}

/** The subset of the model's band edges a sheet this wide draws. */
function reduceLevels(levels, bands) {
  const src = levels.length - 1;
  if (!(src > 0) || bands >= src) return levels.slice();
  const stride = Math.max(1, Math.round(src / bands));
  const out = [];
  for (let i = 0; i <= src; i += stride) out.push(levels[i]);
  if (out[out.length - 1] !== levels[src]) out.push(levels[src]);
  return out;
}

/** ...and the contour sets that survive it, re-weighted: the coast is still
 *  the coast, and an index contour is every third line of what is left. */
function reduceContours(contours, levels) {
  const keep = new Set(levels.map(function (v) { return v.toFixed(9); }));
  const out = [];
  let rank = 0;
  for (let i = 0; i < contours.length; i++) {
    const set = contours[i];
    if (!keep.has(set.level.toFixed(9))) continue;
    const kind = rank === 0 ? "coast" : (rank % 3 === 0 ? "index" : "line");
    out.push({ level: set.level, kind: kind, rings: set.rings });
    rank++;
  }
  return out;
}

/** The dot ladder for one sheet: one multiplier that keeps the largest disc
 *  inside its ceiling (a change of scale, so the area law survives it), and
 *  the floor the smallest disc is never drawn below. */
function dotSizing(model, scale, sheetWidthPt, compact) {
  let maxDeg = 0;
  const nodes = (model && model.nodes) || [];
  for (let i = 0; i < nodes.length; i++) if (nodes[i].deg > maxDeg) maxDeg = nodes[i].deg;
  let k = 1;
  if (compact && maxDeg > 0 && sheetWidthPt > 0) {
    const ceilingR = COMPACT_DOT_CAP_FRAC * sheetWidthPt / 2;   // the CAP is a diameter
    const rmax = scale * markerRadiusPt(maxDeg);
    if (rmax > ceilingR) k = ceilingR / rmax;
  }
  return { k: k, floorPt: DOT_MIN_RADIUS_PT, capPt: COMPACT_DOT_CAP_FRAC * sheetWidthPt / 2 };
}

function dotRadiusPt(deg, scale, sizing) {
  const s = sizing || { k: 1, floorPt: 0 };
  return Math.max(s.floorPt || 0, (s.k || 1) * scale * markerRadiusPt(deg));
}

/* -- orientation ---------------------------------------------------------
 * A frame is always wider than it is tall (1.3 to 2.0), and a sidebar is
 * always taller than it is wide.  Drawn unrotated in a sidebar the sheet is a
 * short strip at the top of the pane with the map's distances crushed into a
 * third of the paper that is there.  So the sheet is allowed to turn ninety
 * degrees — x' = y, y' = frameW - x, in map units — whenever that fits the
 * box at a larger scale.  The MODEL is untouched, and so is the warm-start
 * cache; the rotation is a view of it, applied to nodes, peaks, contours, the
 * terrain raster and the label placement together, which is the only way the
 * type can be placed in the space it is drawn in.
 * -------------------------------------------------------------------- */

function rotatePoint(x, y, frameW) { return [y, frameW - x]; }
function unrotatePoint(x, y, frameW) { return [frameW - y, x]; }

// Turning has a cost the scale does not show: type is set HORIZONTALLY, so a
// turned sheet buys map scale with the width its names need.  A near-square
// box makes the two orientations all but equal — at 349 x 383 the turn won by
// two and a half per cent and cost the sheet nearly half its width, which took
// every summit name off the map.  So the turn has to be worth making.
const ROTATE_MIN_GAIN = 1.15;

/** Which orientation fits `boxW x boxH` at the larger scale — by enough. */
function fitSheet(frameW, frameH, boxW, boxH) {
  const w = Math.max(boxW, 1), h = Math.max(boxH, 1);
  const upright = Math.min(w / frameW, h / frameH);
  const turned = Math.min(w / frameH, h / frameW);
  const rotated = turned > upright * ROTATE_MIN_GAIN;
  const s = rotated ? turned : upright;
  return {
    rotated: rotated,
    scale: s,
    scaleUpright: upright,
    scaleRotated: turned,
    gain: upright > 0 ? turned / upright : 1,
    minGain: ROTATE_MIN_GAIN,
    widthPx: (rotated ? frameH : frameW) * s,
    heightPx: (rotated ? frameW : frameH) * s
  };
}

/** The model as the rotated sheet sees it.  The grid is NOT transposed: the
 *  raster samples it through the inverse transform instead, which is one
 *  branch rather than a hundred and forty thousand copies per redraw. */
function rotateModel(model) {
  const F = model.frameW;
  const turn = function (p) { return { x: p.y, y: F - p.x }; };
  const nodes = model.nodes.map(function (n) { return Object.assign({}, n, turn(n)); });
  const peaks = model.peaks.map(function (p) { return Object.assign({}, p, turn(p)); });
  const contours = model.contours.map(function (set) {
    return {
      level: set.level, kind: set.kind,
      rings: set.rings.map(function (pts) {
        const out = new Float32Array(pts.length);
        for (let k = 0; k < pts.length; k += 2) { out[k] = pts[k + 1]; out[k + 1] = F - pts[k]; }
        return out;
      })
    };
  });
  return Object.assign({}, model, {
    nodes: nodes, peaks: peaks, contours: contours,
    frameW: model.frameH, frameH: F,
    rotated: true, uprightFrameW: F
  });
}

/* -- the layout engine -------------------------------------------------- */
const NEIGHBOR_FACTOR = 1.1;       // k = clamp(1.1*sqrt(n), 15, 100)
const NEIGHBOR_K_MIN = 15;
const NEIGHBOR_K_MAX = 100;
const WALK_TRUNCATION = 48;        // largest entries kept per sparse row
// find_ab_params(spread=1.0, min_dist=0.30) — the curve UMAP fits so that the
// low-dimensional similarity kernel matches the target min_dist.  Hard-coded
// because fitting it needs a least-squares solver we are not going to ship.
const UMAP_A = 0.992176;
const UMAP_B = 1.112253;
const SGD_EPOCHS_COLD = 400;       // n < SGD_SMALL_VAULT
const SGD_SMALL_VAULT = 2000;
// Above that size the epoch count is chosen so that the total number of
// edge-samples stays bounded, which is what actually costs time: the work is
// sum over edges of (epochs * w/wmax), so we solve that for `epochs` against a
// fixed budget and clamp.  A 5,000-note vault therefore does fewer, not
// slower, epochs and the whole layout still finishes in a couple of seconds.
const SGD_SAMPLE_BUDGET = 3.0e6;
const SGD_EPOCHS_MIN = 60;
const SGD_NEGATIVE_SAMPLES = 5;
const SGD_GRAD_CLIP = 4.0;
const SGD_LR = 1.0;
const SGD_WARM_EPOCHS = 80;        // a warm start only needs a touch-up...
// ...at a learning rate that barely moves what is already placed.  The whole
// point of a warm start is that the reader's map stays the map they learned:
// a new note has to find its hill, but no existing note may wander while it
// does.  At the cold rate the six hubs drifted about a tenth of the frame
// when ten notes were added and ten removed, which is enough to make the
// sheet feel redrawn rather than updated.
const SGD_WARM_LR = 0.35;
// ...and how much of that step a note that was already on the map is allowed
// to take.  A new note gets the full rate and settles into its hill; an old
// one gets a twentieth of it and effectively stays where the reader last saw
// it.  Without this the six hubs drifted about a tenth of the frame when ten
// notes were added and ten removed, which makes the sheet feel redrawn.
const WARM_KNOWN_MOBILITY = 0.05;
const SPECTRAL_ITERATIONS = 75;    // 2 mat-vecs each, so ~150 in total
const SPECTRAL_SCALE = 10.0;       // initial coordinates are scaled to +-this
const WARM_JITTER = 0.01;          // seeded jitter for a brand-new note

/* -- packing the components -------------------------------------------- */
// A component's notes must clear every note outside it by this much, as a
// fraction of the giant component's height.  What matters is not the gap in
// coordinates but whether the TERRAIN still bridges it: below about a fifth
// of the cloud the contours run a visible isthmus from the islet to the
// mainland, which is exactly the relationship the separation exists to deny.
const COMPONENT_CLEARANCE_FRAC = 0.22;
const COMPONENT_CLEARANCE_MAP = 0.20;  // ...and the floor it must reach in map units
// The floor is measured AFTER the frame fit, and the packer now hugs whatever
// clearance it was given — pulling the islet toward the centre means putting it as
// close to the mainland as the rule allows — so the measured value lands
// within a per cent of the floor on every run.  Tested exactly, a vault that
// gained ten notes trips the retry, the retry asks for more room, and an
// island that was in the right place crosses the sheet.  Two per cent of a
// fifth of the sheet's height is a fortieth of a millimetre on paper: below
// the tolerance, the floor is met.
const COMPONENT_CLEARANCE_TOL = 0.98;
// ...and when it really is not met, ask for exactly what was missing plus a
// twentieth, rather than a quarter more of everything.
const COMPONENT_CLEARANCE_AIM = 1.05;
const COMPONENT_RETRY_MIN = 1.05;
const COMPONENT_RETRY_MAX = 1.60;
const PACK_GRID = [61, 41];
const PACK_SPAN = 2.2;             // search box, in giant-cloud spans
const PACK_STAY_SLACK = 0.9;       // ...and the tolerance of "already clear"
const PACK_REFINE = 4;             // sub-steps per coarse cell in the polish pass
// A returning islet counts as central while it is within this fraction (plus
// one coarse grid step) of the most central feasible distance; see the stay
// rule in packComponents.
const PACK_STAY_CENTRAL = 0.15;
// ...where "most central" is judged for the water the component ALREADY has,
// of which at most this many clearances count.  Tied to the retry loop's
// largest single widening, which is about as much extra water as a freshly
// packed islet can have.
const PACK_STAY_GAP_MAX = COMPONENT_RETRY_MAX;
// When a returning islet must step out of a crowding coast, the nearest legal
// spot is looked for first on a fine grid this many coarse steps around it.
const PACK_LOCAL_REACH = 2;

/* -- dots --------------------------------------------------------------- */
// Marker AREA is strictly proportional to the number of links — the legend
// says so, so there is no ceiling.  The floor is the one degree the law would
// otherwise draw too faint to see.
const DEGREE_AREA_PT2 = 1.95;
const DEGREE_AREA_FLOOR = 3.45;
const DOT_RING_PT = 0.2;           // half the paper ring every dot is stroked with
const DEGREE_RAMP_GAMMA = 2.2;     // rank^gamma along the muted -> ink ramp

/* -- type --------------------------------------------------------------- */
const SUMMIT_PT = 12.0;
const SUMMIT_TRACKING_EM = 0.12;
const MINOR_PT = 8.5;
const PT_PER_CSS_PX = 1 / 1.3333333333333333;

/* -- label placement (ported verbatim from the Python) ------------------ */
const LABEL_ORDER = ["E", "W", "N", "S", "NE", "NW", "SE", "SW"];
const DOT_PAD_PT = 3.0;
const SUMMIT_DOT_PAD_PT = 4.0;
const LABEL_PAD_PT = 3.0;
const SUMMIT_GAP_PT = 8.0;         // between a summit's numeral and its name
const HALO_LW_PT = 2.4;            // the paper stroke every label is drawn with
// The halo is a stroke CENTRED on the glyph outlines, so it erases the paper
// only right at the letters: a contour hairline crossing a word survives as
// short dashes between and above them and reads as diacritics — "Notebooks"
// printed as "Nōtēbooks".  The cure is the cartographer's label mask: the
// contour LINES are cut away inside every label's box.  The terrain tint is
// not masked, so the fill runs on unbroken under the type.
const CONTOUR_MASK_PAD_PT = HALO_LW_PT / 2.0 + 1.0;

// The ladder a summit name is searched along, in design points.  The last two
// rungs exist because the ladder is SCALED with the sheet: at s = 0.72 the old
// top rung reached only 86 pt, which on a crowded hill no longer reaches open
// paper at all, and the name fell back onto its own dots.  They are long
// enough to leave any one hill and cheap to skip — the distance penalty makes
// a shorter rung win whenever a shorter rung is clean.
const SUMMIT_RINGS_PT = [0.0, 12.0, 28.0, 50.0, 80.0, 120.0, 170.0, 230.0];
// How far a compact sheet will move a summit name from its hill, in SHEET
// points: about a fifth of a sidebar sheet.  Past that the name is no longer
// beside its hill but somewhere else on the paper, and a leader long enough to
// say otherwise is a line across the map.  CARTOGRAPHY was placed at 95.8 pt,
// NW, over on the Notebooks-and-Typography side of the sheet, with a leader
// the placer had already found infeasible — the name said the wrong thing
// twice.  Beyond the cap the numeral alone is the honest mark.
const COMPACT_SUMMIT_RING_MAX_PT = 80.0;
// The ambiguity ratio the HARD rule uses, which is not the soft one.  1.6 is a
// margin: the right number for a penalty that merely discourages.  As a
// refusal, on a frame with six hills a third of a sheet apart, it refuses
// almost everything — measured, it took the sidebar from five names to two —
// because a name displaced far enough to clear its own hill is by then within
// 1.6x of a neighbour's anchor whatever it does.  As an invariant the honest
// statement is the weaker one: a name must be nearer the summit it names than
// any other summit, with a fifth to spare.  That still refuses the case the
// rule was written for — CARTOGRAPHY at 95.8 pt sat about a fifth as far from
// two other anchors as from its own — and keeps the names the sheet can carry.
const COMPACT_SUMMIT_AMBIG_HARD_RATIO = 1.2;
// ...and the ladder it is climbed by, in SHEET points rather than design ones.
// The design ladder scaled by s jumps from 33 pt straight to 50, so a cap at
// 48 would in practice have been a cap at 33 and taken names the sheet had
// room for.  Eight rungs, evenly spread, ending exactly on the cap.
const COMPACT_SUMMIT_RINGS_PT = [0.0, 5.0, 10.0, 16.0, 24.0, 32.0, 40.0, 50.0, 60.0, 70.0, 80.0];
// A candidate over open water covers nothing by construction, which is the
// cartographer's ordinary preference; it is a tie-breaker now rather than a
// separate ladder, because the cap above put the sea within the same reach.
const SUMMIT_LAND_PENALTY = 0.5;
// The ladder a loose numeral is searched along, in SHEET points, and the rung
// past which it earns a hairline leader.  A clean numeral three millimetres
// out beats a forced one against the dot.
const NUMERAL_RINGS_PT = [0.0, 4.0, 8.0, 12.0, 16.0, 20.0, 24.0];
const NUMERAL_LEADER_PT = 8.0;
// Two summit names that merely fail to overlap still read as one line ("I
// STATISTICS III CARTOGRAPHY").  They must stand this far apart, in scaled
// points, before either is allowed.
const SUMMIT_CLEAR_PT = 4.0;
// ...and it is SCALED, which on a sidebar sheet took it under two points —
// less than the halo, and two names a hair apart read as one line whatever
// the scale is.  Four points of design or two and a half of paper, whichever
// is the larger.  Where that costs a name, the name becomes a numeral, which
// is the compact sheet's answer to exactly this question.
const SUMMIT_CLEAR_MIN_PT = 2.5;
// A dot this heavy is a note the reader is meant to be able to look at, so a
// summit name that covers its disc has hidden something, not merely crossed
// some ink.
const SUMMIT_COVER_MIN_DEG = 3;
const SUMMIT_DIST_PENALTY = 0.06;
const SUMMIT_DIR_PENALTY = 0.15;
const SUMMIT_AMBIG_RATIO = 1.6;
const SUMMIT_AMBIG_PENALTY = 400.0;
const SUMMIT_TOWARD_PENALTY = 6.0;

const MINOR_RINGS_PT = [0.0, 9.0, 20.0, 34.0, 52.0];
const MINOR_DIST_PENALTY = 0.35;
const MINOR_DIR_PENALTY = 0.15;
const MINOR_LEADER_RING_PT = 20.0; // beyond this the label needs a leader
const MINOR_HEAVY_DEG = 8;
const MINOR_AMBIG_RATIO = 1.0;
const MINOR_AMBIG_PENALTY = 25.0;
const MINOR_MUST_NAME = 14;        // the heaviest non-anchor dots are never left anonymous
const MINOR_SECONDARY_COUNT = 30;
const ISLET_MIN_NOTES = 4;         // a component this big gets a name of its own
const ISLET_MAX_NAMED = 8;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV"];

const VAULT_ROOT_KEY = "Root";

/* ----------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------- */

/** mulberry32 — a tiny, fast, well-distributed seeded PRNG.  Every random
 *  number in the pipeline comes from one of these, so two runs of the same
 *  input produce byte-identical coordinates. */
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

/** FNV-1a over a string, as 8 lowercase hex digits. */
// A separator no path or folder name can contain.  Spelt with fromCharCode so
// the source holds neither a raw control byte nor a backslash escape.
const NUL = String.fromCharCode(0);

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function roman(i) { return i < ROMAN.length ? ROMAN[i] : String(i + 1); }

/** Marker area in pt^2 for a note of this degree — the dot-area law. */
function degreeArea(deg) {
  return Math.max(DEGREE_AREA_PT2 * deg, DEGREE_AREA_FLOOR);
}

/** ...and the radius the reader actually sees, in pt. */
function markerRadiusPt(deg) {
  return Math.sqrt(degreeArea(deg)) / 2.0;
}

/** No-op hooks, so the core never has to test for their presence. */
const NO_HOOKS = {
  tick: null,
  cancelled: function () { return false; },
  progress: function () {}
};

function normaliseHooks(hooks) {
  const h = hooks || {};
  return {
    tick: typeof h.tick === "function" ? h.tick : null,
    cancelled: typeof h.cancelled === "function" ? h.cancelled : NO_HOOKS.cancelled,
    progress: typeof h.progress === "function" ? h.progress : NO_HOOKS.progress
  };
}

class MapCancelled extends Error {
  constructor() { super("tufte-map: computation cancelled"); this.name = "MapCancelled"; }
}

// How long a pure-computation phase may hold the thread before it hands the
// host a turn.  Fifty milliseconds is three frames: short enough that a window
// drawing this map still answers the pointer, long enough that the yields
// themselves cost nothing measurable on a vault of any ordinary size.
const BREATH_MS = 50;

/**
 * A "let the window breathe" callback for a hot loop.
 *
 * The SGD already yields between epochs, but the phases before it — the walk
 * profiles above all — used to run as one uninterruptible block, and their
 * cost is set by the LINK GRAPH rather than by the note count: a vault whose
 * notes link to one another densely (an index note per folder, a generated
 * back-link web, a shared vault someone else built) spends ten or twenty
 * seconds there, and for those seconds Obsidian's whole window is frozen and
 * the computation cannot even be cancelled.  A map is never worth that, so
 * every long loop now checks in.  The check is a clock comparison; the actual
 * yield happens at most twenty times a second.
 */
function breather(hooks) {
  let next = Date.now() + BREATH_MS;
  return async function () {
    if (hooks.cancelled()) throw new MapCancelled();
    const now = Date.now();
    if (now < next) return;
    next = now + BREATH_MS;
    if (hooks.tick) await hooks.tick();
  };
}

/**
 * One saved position from `data.json`, or null.
 *
 * `data.json` is synced between devices and editable by hand, so what comes
 * back out of it is INPUT, not state.  A single value that is not a pair of
 * finite numbers — a string, `true`, a `null` from a round-tripped NaN — used
 * to be believed, and NaN spreads: the frame width, the terrain, every contour
 * and every dot came out NaN and the reader got a blank sheet with nothing
 * said.  The own-property test is belt and braces on top: a note path always
 * ends in `.md` and so can never BE `__proto__`, but a map read from a file is
 * not the place to rely on that.
 */
function savedPosition(prev, path) {
  if (!prev || typeof prev !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(prev, path)) return null;
  const p = prev[path];
  if (!Array.isArray(p) || p.length < 2) return null;
  const x = p[0], y = p[1];
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [x, y];
}

/** ...and whether the saved map holds even one position worth warming from. */
function hasSavedPositions(prev) {
  if (!prev || typeof prev !== "object") return false;
  for (const k in prev) {
    if (!Object.prototype.hasOwnProperty.call(prev, k)) continue;
    if (savedPosition(prev, k)) return true;
  }
  return false;
}

/* ----------------------------------------------------------------------
 * 2a. The graph
 * ------------------------------------------------------------------- */

/**
 * Turn `{files, resolvedLinks}` into the node table and the unique directed
 * edge list.  Node order is files sorted by path — fixed, so nothing
 * downstream can depend on the order Obsidian happened to hand them over in.
 *
 * Only `.md` -> `.md` links count (an attachment is not a place on the map),
 * self-links are dropped, and direction is kept so in- and out-degree can be
 * reported separately even though the layout uses the undirected graph.
 */
function buildGraph(input, options) {
  const exclude = (options && options.exclude) || [];
  const isExcluded = function (path) {
    for (let i = 0; i < exclude.length; i++) {
      const p = exclude[i];
      if (!p) continue;
      const pre = p.endsWith("/") ? p : p + "/";
      if (path === p || path.startsWith(pre)) return true;
    }
    return false;
  };

  const files = (input.files || [])
    .filter(function (f) { return f && typeof f.path === "string"; })
    .filter(function (f) { return f.path.toLowerCase().endsWith(".md"); })
    .filter(function (f) { return !isExcluded(f.path); })
    .slice()
    .sort(function (a, b) { return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0); });

  const index = new Map();
  for (let i = 0; i < files.length; i++) index.set(files[i].path, i);

  const n = files.length;
  const degIn = new Int32Array(n);
  const degOut = new Int32Array(n);
  const edges = [];
  const seen = new Set();

  // Iterate the source paths in sorted order, not in object order, so a
  // vault whose metadata cache was filled in a different sequence still
  // produces the same edge list byte for byte.
  const srcs = Object.keys(input.resolvedLinks || {}).sort();
  for (let s = 0; s < srcs.length; s++) {
    const src = srcs[s];
    const a = index.get(src);
    if (a === undefined) continue;
    const row = input.resolvedLinks[src] || {};
    const dsts = Object.keys(row).sort();
    for (let d = 0; d < dsts.length; d++) {
      const b = index.get(dsts[d]);
      if (b === undefined || b === a) continue;
      const key = a * n + b;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b]);
      degOut[a]++;
      degIn[b]++;
    }
  }
  edges.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });

  // The undirected simple graph is what the layout sees.
  const undirSeen = new Set();
  const undirected = [];
  for (let i = 0; i < edges.length; i++) {
    const a = Math.min(edges[i][0], edges[i][1]);
    const b = Math.max(edges[i][0], edges[i][1]);
    const key = a * n + b;
    if (undirSeen.has(key)) continue;
    undirSeen.add(key);
    undirected.push([a, b]);
  }
  undirected.sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });

  return { files: files, index: index, edges: edges, undirected: undirected, degIn: degIn, degOut: degOut };
}

/**
 * The fingerprint of a graph: every path, every edge, and the exclude list.
 *
 * The view needs this WITHOUT computing a map, because the metadata cache
 * fires "resolved" whenever anything is indexed and most of those events
 * leave the link graph exactly as it was — a word typed into a note, a tag
 * added, an attachment renamed.  Comparing fingerprints costs a couple of
 * milliseconds; laying out five thousand notes to discover that nothing
 * changed does not.
 */
function hashGraph(g, exclude) {
  return fnv1a(g.files.map(function (f) { return f.path; }).join(NUL) + "|" +
    g.edges.map(function (e) { return e[0] + ">" + e[1]; }).join(",") + "|" +
    JSON.stringify(exclude || []));
}

/** ...from the raw input, for a caller that has no model yet. */
function graphHash(input, options) {
  const opt = options || {};
  return hashGraph(buildGraph(input, opt), opt.exclude || []);
}

/** Component id per placed node: 0 is the largest, ties by first member. */
function connectedComponents(n, adj) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = function (a) {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < adj[i].length; k++) {
      const ra = find(i), rb = find(adj[i][k]);
      if (ra !== rb) parent[ra] = rb;
    }
  }
  const members = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!members.has(r)) members.set(r, []);
    members.get(r).push(i);
  }
  const groups = Array.from(members.values());
  groups.sort(function (a, b) { return b.length - a.length || a[0] - b[0]; });
  const comp = new Int32Array(n);
  for (let c = 0; c < groups.length; c++) {
    for (let k = 0; k < groups[c].length; k++) comp[groups[c][k]] = c;
  }
  return { comp: comp, groups: groups };
}

/* ----------------------------------------------------------------------
 * 2b. Affinities — the lazy random-walk profile, computed sparsely
 *
 * A = adjacency of the undirected simple graph, A~ = A + I (the lazy step),
 * P = D~^-1 A~ the row-stochastic transition matrix, and
 *
 *     X = P + 1/2 P^2 + 1/4 P^3
 *
 * so a row is "where a short walk from this note lands", each further step
 * discounted.  Two notes are close when they reach the same neighbourhoods,
 * not merely when they link to each other — which is what puts a hub at the
 * centre of its own region and a bridge note between two.
 *
 * The dense version is O(n^2) and a 5,000-note vault would be 200 MB of
 * doubles, so every row is truncated to its ~48 largest entries after each
 * multiplication.  A walk profile's mass is concentrated in a handful of
 * places by construction, so the tail that is dropped is numerically tiny and
 * — more to the point — never reaches the top-k that becomes a neighbour.
 * ------------------------------------------------------------------- */

/** Sparse rows: `idx[i]` / `val[i]` are parallel arrays for row i. */
function sparseRowsFromAdj(adj) {
  const n = adj.length;
  const idx = new Array(n);
  const val = new Array(n);
  for (let i = 0; i < n; i++) {
    const nb = adj[i];
    const m = nb.length + 1;                 // + the lazy self-loop
    const ii = new Int32Array(m);
    const vv = new Float64Array(m);
    const w = 1.0 / m;
    ii[0] = i; vv[0] = w;
    for (let k = 0; k < nb.length; k++) { ii[k + 1] = nb[k]; vv[k + 1] = w; }
    idx[i] = ii; val[i] = vv;
  }
  return { idx: idx, val: val, n: n };
}

/** Keep the `limit` largest entries of one row, ties broken by index. */
function truncateRow(ii, vv, limit) {
  if (ii.length <= limit) return [ii, vv];
  const order = new Array(ii.length);
  for (let k = 0; k < ii.length; k++) order[k] = k;
  order.sort(function (a, b) { return vv[b] - vv[a] || ii[a] - ii[b]; });
  order.length = limit;
  order.sort(function (a, b) { return ii[a] - ii[b]; });
  const oi = new Int32Array(limit);
  const ov = new Float64Array(limit);
  for (let k = 0; k < limit; k++) { oi[k] = ii[order[k]]; ov[k] = vv[order[k]]; }
  return [oi, ov];
}

/** C = A * B, row by row, each result row truncated to `limit` entries.
 *
 *  A row of A times a row of B costs the PRODUCT of their lengths, so the work
 *  here is set by the link graph's density rather than by the note count and a
 *  single heavily-linked index note raises it sharply.  `breathe` is what keeps
 *  that from being the window's problem. */
async function sparseMultiply(A, B, limit, acc, breathe) {
  const n = A.n;
  const idx = new Array(n);
  const val = new Array(n);
  const scratch = new Float64Array(n);
  const touched = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (breathe && (i & 63) === 0) await breathe();
    let t = 0;
    const ai = A.idx[i], av = A.val[i];
    for (let k = 0; k < ai.length; k++) {
      const j = ai[k], w = av[k];
      const bj = B.idx[j], bv = B.val[j];
      for (let m = 0; m < bj.length; m++) {
        const c = bj[m];
        if (scratch[c] === 0) touched[t++] = c;
        scratch[c] += w * bv[m];
      }
    }
    const ii = new Int32Array(t);
    const vv = new Float64Array(t);
    for (let k = 0; k < t; k++) { ii[k] = touched[k]; vv[k] = scratch[touched[k]]; }
    // Index order, so the truncation tie-break is deterministic.
    const order = new Array(t);
    for (let k = 0; k < t; k++) order[k] = k;
    order.sort(function (a, b) { return ii[a] - ii[b]; });
    const si = new Int32Array(t), sv = new Float64Array(t);
    for (let k = 0; k < t; k++) { si[k] = ii[order[k]]; sv[k] = vv[order[k]]; }
    const kept = truncateRow(si, sv, limit);
    idx[i] = kept[0]; val[i] = kept[1];
    if (acc) acc(i, kept[0], kept[1]);
    for (let k = 0; k < t; k++) scratch[touched[k]] = 0;
  }
  return { idx: idx, val: val, n: n };
}

/**
 * Symmetric fuzzy neighbour weights for one component.
 *
 * `adj` is the component's own adjacency (local indices).  Returns
 * `{head, tail, weight}` — one entry per undirected neighbour pair, which is
 * what the SGD samples.
 */
async function affinityGraph(adj, hooks) {
  const breathe = breather(normaliseHooks(hooks));
  const n = adj.length;
  const P = sparseRowsFromAdj(adj);
  const P2 = await sparseMultiply(P, P, WALK_TRUNCATION, null, breathe);
  const P3 = await sparseMultiply(P2, P, WALK_TRUNCATION, null, breathe);

  // X = P + 1/2 P^2 + 1/4 P^3, merged row-wise and kept sparse.
  const k = Math.max(NEIGHBOR_K_MIN,
    Math.min(NEIGHBOR_K_MAX, Math.floor(NEIGHBOR_FACTOR * Math.sqrt(n))));
  const acc = new Map();          // "i,j" -> weight, only above the diagonal
  const buf = new Float64Array(n);
  const touched = new Int32Array(n);

  for (let i = 0; i < n; i++) {
    if ((i & 63) === 0) await breathe();
    let t = 0;
    const add = function (ii, vv, scale) {
      for (let m = 0; m < ii.length; m++) {
        const c = ii[m];
        if (buf[c] === 0) touched[t++] = c;
        buf[c] += scale * vv[m];
      }
    };
    add(P.idx[i], P.val[i], 1.0);
    add(P2.idx[i], P2.val[i], 0.5);
    add(P3.idx[i], P3.val[i], 0.25);

    // Top-k off-diagonal entries are this note's neighbours.
    const cand = [];
    for (let m = 0; m < t; m++) {
      const c = touched[m];
      if (c !== i && buf[c] > 0) cand.push([c, buf[c]]);
    }
    cand.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    if (cand.length > k) cand.length = k;

    // Per-row normalisation to [0, 1]: the nearest neighbour weighs 1.  This
    // stands in for UMAP's exp(-(d - rho)/sigma), which needs a per-row
    // binary search we do not need the precision of.
    const top = cand.length ? cand[0][1] : 1.0;
    for (let m = 0; m < cand.length; m++) {
      const j = cand[m][0];
      const w = top > 0 ? cand[m][1] / top : 0;
      if (w <= 0) continue;
      const key = (i < j ? i : j) + "," + (i < j ? j : i);
      const prev = acc.get(key);
      // Fuzzy union: w = a + b - ab, so a pair either of them calls near is
      // near, without letting two moderate votes exceed one certain one.
      acc.set(key, prev === undefined ? w : prev + w - prev * w);
    }
    for (let m = 0; m < t; m++) buf[touched[m]] = 0;
  }

  const keys = Array.from(acc.keys()).sort();
  const head = new Int32Array(keys.length);
  const tail = new Int32Array(keys.length);
  const weight = new Float64Array(keys.length);
  for (let e = 0; e < keys.length; e++) {
    const parts = keys[e].split(",");
    head[e] = +parts[0]; tail[e] = +parts[1]; weight[e] = acc.get(keys[e]);
  }
  return { head: head, tail: tail, weight: weight, n: n };
}

/* ----------------------------------------------------------------------
 * 2c. Initial positions
 *
 * Global structure has to be right before the SGD starts: UMAP's layout
 * optimiser is a local method and will happily polish a tangle.  Cold starts
 * therefore begin from a spectral embedding — the two leading non-trivial
 * eigenvectors of the normalised affinity operator — and warm starts begin
 * from wherever the notes already were.
 * ------------------------------------------------------------------- */

/**
 * Orthogonal (power) iteration for the 2 leading non-trivial eigenvectors of
 * M = D^-1/2 W D^-1/2.
 *
 * M's largest eigenvalue is 1 with the known eigenvector D^1/2 * 1, so that
 * direction is deflated out at every step.  The iteration is run on
 * (M + I)/2 rather than on M: the shift maps the spectrum into [0, 1] while
 * preserving order, so "largest magnitude" — which is what power iteration
 * finds — and "largest algebraic" — which is what we want — coincide.  On a
 * bipartite-ish graph they otherwise do not, and the layout comes out as two
 * interleaved combs.
 */
async function spectralInit(graph, rng, hooks) {
  const breathe = breather(normaliseHooks(hooks));
  const n = graph.n;
  const head = graph.head, tail = graph.tail, weight = graph.weight;
  const deg = new Float64Array(n);
  for (let e = 0; e < head.length; e++) { deg[head[e]] += weight[e]; deg[tail[e]] += weight[e]; }
  const invSqrt = new Float64Array(n);
  const sqrtD = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d = deg[i] > 1e-12 ? deg[i] : 1e-12;
    sqrtD[i] = Math.sqrt(d);
    invSqrt[i] = 1.0 / sqrtD[i];
  }
  // u0 = D^1/2 * 1, normalised: the trivial eigenvector.
  const u0 = new Float64Array(n);
  let nrm = 0;
  for (let i = 0; i < n; i++) { u0[i] = sqrtD[i]; nrm += u0[i] * u0[i]; }
  nrm = Math.sqrt(nrm) || 1;
  for (let i = 0; i < n; i++) u0[i] /= nrm;

  const apply = function (src, dst) {           // dst = (M + I)/2 * src
    dst.fill(0);
    for (let e = 0; e < head.length; e++) {
      const a = head[e], b = tail[e], w = weight[e] * invSqrt[a] * invSqrt[b];
      dst[a] += w * src[b];
      dst[b] += w * src[a];
    }
    for (let i = 0; i < n; i++) dst[i] = 0.5 * (dst[i] + src[i]);
  };
  const deflate = function (v) {
    let dot = 0;
    for (let i = 0; i < n; i++) dot += v[i] * u0[i];
    for (let i = 0; i < n; i++) v[i] -= dot * u0[i];
  };
  const normalise = function (v) {
    let s = 0;
    for (let i = 0; i < n; i++) s += v[i] * v[i];
    s = Math.sqrt(s);
    if (s < 1e-12) return false;
    for (let i = 0; i < n; i++) v[i] /= s;
    return true;
  };

  const v1 = new Float64Array(n), v2 = new Float64Array(n);
  const t1 = new Float64Array(n), t2 = new Float64Array(n);
  for (let i = 0; i < n; i++) { v1[i] = rng() * 2 - 1; v2[i] = rng() * 2 - 1; }
  deflate(v1); normalise(v1);
  deflate(v2); normalise(v2);

  for (let it = 0; it < SPECTRAL_ITERATIONS; it++) {
    await breathe();
    apply(v1, t1); apply(v2, t2);
    v1.set(t1); v2.set(t2);
    deflate(v1);
    if (!normalise(v1)) for (let i = 0; i < n; i++) v1[i] = (i % 2 ? 1 : -1) / Math.sqrt(n);
    deflate(v2);
    // Gram-Schmidt against v1 keeps the pair from collapsing onto the same
    // dominant direction, which is the whole point of iterating them together.
    let dot = 0;
    for (let i = 0; i < n; i++) dot += v2[i] * v1[i];
    for (let i = 0; i < n; i++) v2[i] -= dot * v1[i];
    if (!normalise(v2)) for (let i = 0; i < n; i++) v2[i] = Math.sin(i + 1) / Math.sqrt(n);
  }

  // Back to the random-walk eigenvectors (y = D^-1/2 u), then scaled so the
  // cloud spans roughly +-SPECTRAL_SCALE, which is the range the SGD's
  // gradient clipping and learning rate were tuned for.
  const out = new Float64Array(n * 2);
  let mx = 1e-12, my = 1e-12;
  for (let i = 0; i < n; i++) {
    const x = v1[i] * invSqrt[i], y = v2[i] * invSqrt[i];
    out[i * 2] = x; out[i * 2 + 1] = y;
    if (Math.abs(x) > mx) mx = Math.abs(x);
    if (Math.abs(y) > my) my = Math.abs(y);
  }
  const s = SPECTRAL_SCALE / Math.max(mx, my);
  for (let i = 0; i < n * 2; i++) out[i] *= s;
  // A pinch of seeded noise breaks exact ties (two notes with identical
  // neighbourhoods land on the same point, and the SGD's repulsion divides
  // by their distance).
  for (let i = 0; i < n * 2; i++) out[i] += (rng() - 0.5) * 1e-3;
  return out;
}

/* ----------------------------------------------------------------------
 * 2d. UMAP's layout SGD (optimize_layout_euclidean)
 * ------------------------------------------------------------------- */

/**
 * Per-edge sampling schedule: an edge of weight w is visited every
 * `wmax / w` epochs, so the strongest affinity is pulled on every epoch and a
 * weak one only occasionally.  This is exactly UMAP's make_epochs_per_sample.
 */
function epochsPerSample(weight, nEpochs) {
  let wmax = 0;
  for (let e = 0; e < weight.length; e++) if (weight[e] > wmax) wmax = weight[e];
  const out = new Float64Array(weight.length);
  for (let e = 0; e < weight.length; e++) {
    const s = nEpochs * (weight[e] / (wmax || 1));
    out[e] = s > 0 ? nEpochs / s : -1;
  }
  return out;
}

function chooseEpochs(graph, warm) {
  if (warm) return SGD_WARM_EPOCHS;
  if (graph.n < SGD_SMALL_VAULT) return SGD_EPOCHS_COLD;
  let wmax = 0, sum = 0;
  for (let e = 0; e < graph.weight.length; e++) if (graph.weight[e] > wmax) wmax = graph.weight[e];
  for (let e = 0; e < graph.weight.length; e++) sum += graph.weight[e] / (wmax || 1);
  const budgeted = Math.floor(SGD_SAMPLE_BUDGET / Math.max(sum, 1));
  return clamp(budgeted, SGD_EPOCHS_MIN, SGD_EPOCHS_COLD);
}

function clipGrad(v) {
  return v > SGD_GRAD_CLIP ? SGD_GRAD_CLIP : (v < -SGD_GRAD_CLIP ? -SGD_GRAD_CLIP : v);
}

/**
 * `mobility` (optional) scales each node's own step.  A warm start uses it to
 * hold what is already on the map nearly still while the notes that arrived
 * since the last run move freely to find their hill: the reader's map has to
 * stay the map they learned, so a new note is allowed to settle into the
 * geography but may not rearrange it.
 */
async function optimizeLayout(pos, graph, nEpochs, rng, lr0, hooks, progressBase, progressSpan, mobility) {
  const n = graph.n;
  const head = graph.head, tail = graph.tail;
  const eps = epochsPerSample(graph.weight, nEpochs);
  const nextSample = Float64Array.from(eps);
  const negEps = new Float64Array(eps.length);
  const nextNeg = new Float64Array(eps.length);
  for (let e = 0; e < eps.length; e++) {
    negEps[e] = eps[e] / SGD_NEGATIVE_SAMPLES;
    nextNeg[e] = negEps[e];
  }
  const a = UMAP_A, b = UMAP_B;
  // One epoch is one pass over the affinity edges, and a densely linked vault
  // has a great many of them: yielding only at the epoch boundary left the
  // window stalled for three seconds at a time on a nine-hundred-thousand-edge
  // graph.  The breather checks a clock rather than a counter, so the cadence
  // is the same whatever the vault's shape.
  const breathe = breather(hooks);

  for (let epoch = 0; epoch < nEpochs; epoch++) {
    const alpha = lr0 * (1.0 - epoch / nEpochs);
    for (let e = 0; e < head.length; e++) {
      if ((e & 8191) === 0) await breathe();
      if (eps[e] <= 0 || nextSample[e] > epoch) continue;
      const j = head[e] * 2, k = tail[e] * 2;
      let dx = pos[j] - pos[k], dy = pos[j + 1] - pos[k + 1];
      let d2 = dx * dx + dy * dy;

      let coeff = 0;
      if (d2 > 0) {
        coeff = (-2.0 * a * b * Math.pow(d2, b - 1.0)) / (a * Math.pow(d2, b) + 1.0);
      }
      const mj = mobility ? mobility[head[e]] : 1;
      const mk = mobility ? mobility[tail[e]] : 1;
      let gx = clipGrad(coeff * dx) * alpha;
      let gy = clipGrad(coeff * dy) * alpha;
      pos[j] += gx * mj; pos[j + 1] += gy * mj;
      pos[k] -= gx * mk; pos[k + 1] -= gy * mk;   // move_other: both ends feel the pull

      nextSample[e] += eps[e];

      const nNeg = Math.floor((epoch - nextNeg[e]) / negEps[e]);
      for (let q = 0; q < nNeg; q++) {
        const r = Math.floor(rng() * n) * 2;
        if (r === j) continue;
        dx = pos[j] - pos[r]; dy = pos[j + 1] - pos[r + 1];
        d2 = dx * dx + dy * dy;
        let rc;
        if (d2 > 0) {
          rc = (2.0 * b) / ((0.001 + d2) * (a * Math.pow(d2, b) + 1.0));
        } else {
          rc = 0;
        }
        if (rc > 0) {
          pos[j] += clipGrad(rc * dx) * alpha * mj;
          pos[j + 1] += clipGrad(rc * dy) * alpha * mj;
        } else {
          // Coincident points: push apart by a fixed step in a fixed
          // direction rather than dividing by zero.
          pos[j] += SGD_GRAD_CLIP * alpha * mj;
        }
      }
      if (nNeg > 0) nextNeg[e] += nNeg * negEps[e];
    }
    if (hooks.cancelled()) throw new MapCancelled();
    if (epoch % 16 === 0) {
      hooks.progress("layout", progressBase + progressSpan * (epoch / nEpochs));
      if (hooks.tick) await hooks.tick();
    }
  }
  return pos;
}

/* ----------------------------------------------------------------------
 * 2e. Orientation and packing
 * ------------------------------------------------------------------- */

/** PCA long axis horizontal, then the canonical mirror.
 *
 *  A 2-D layout is only defined up to rotation and reflection, so two
 *  otherwise identical vaults could come out mirrored and the choice is free;
 *  spending it deterministically is what keeps the sheet recognisable between
 *  runs.  The rule: the most connected note lies in the left half, and of the
 *  next four by degree, the one farthest from the centre line vertically lies
 *  above it.  Mirroring x flips the first clause and mirroring y the second,
 *  and neither clause can see the other's axis, so exactly one state passes.
 */
function orient(pos, degTotal, order) {
  const n = pos.length / 2;
  if (n < 2) return pos;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += pos[i * 2]; my += pos[i * 2 + 1]; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 2] - mx, y = pos[i * 2 + 1] - my;
    sxx += x * x; sxy += x * y; syy += y * y;
  }
  // Leading eigenvector of the 2x2 covariance, in closed form.
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(tr * tr / 4 - det, 0));
  const l1 = tr / 2 + disc;
  let ex, ey;
  if (Math.abs(sxy) > 1e-12) { ex = l1 - syy; ey = sxy; }
  else if (sxx >= syy) { ex = 1; ey = 0; }
  else { ex = 0; ey = 1; }
  const en = Math.hypot(ex, ey) || 1;
  ex /= en; ey /= en;

  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 2] - mx, y = pos[i * 2 + 1] - my;
    out[i * 2] = x * ex + y * ey;          // along the long axis
    out[i * 2 + 1] = -x * ey + y * ex;     // ...and across it
  }

  const canonical = function (fx, fy) {
    if (order.length === 0) return true;
    if (out[order[0] * 2] * fx > 0) return false;
    const rest = order.slice(1, 5);
    if (rest.length) {
      let pick = rest[0];
      for (let k = 1; k < rest.length; k++) {
        if (Math.abs(out[rest[k] * 2 + 1]) > Math.abs(out[pick * 2 + 1])) pick = rest[k];
      }
      if (out[pick * 2 + 1] * fy < 0) return false;
    }
    return true;
  };
  let fx = 1, fy = 1, found = false;
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      if (canonical(sx, sy)) { fx = sx; fy = sy; found = true; break; }
    }
    if (found) break;
  }
  for (let i = 0; i < n; i++) { out[i * 2] *= fx; out[i * 2 + 1] *= fy; }
  return out;
}

/**
 * The area the fitted frame would occupy, in the cloud's own units.
 *
 * `fitFrame` scales the cloud uniformly into a frame whose aspect is chosen by
 * `chooseFrameWidth` — snapped to the ladder and clamped — so the sheet the
 * reader gets is not the bounding box but that box GROWN to the clamped
 * aspect.  The grown box is what an islet either fits inside or enlarges, and
 * its area is the one number that says by how much: minimise it and the
 * mainland is drawn as large as it can be.
 */
function fittedFrameArea(lox, hix, loy, hiy) {
  const W = Math.max(hix - lox, 1e-9), H = Math.max(hiy - loy, 1e-9);
  const a = clamp(Math.round((W / H) / FRAME_ASPECT_STEP) * FRAME_ASPECT_STEP,
    FRAME_ASPECT_MIN, FRAME_ASPECT_MAX);
  return Math.max(W, a * H) * Math.max(H, W / a);
}

/**
 * Pack the non-giant components around the giant one.
 *
 * Largest first, each at the feasible position — every one of its notes
 * clearing every already-placed note by `clearance` — whose centroid lies
 * NEAREST THE GIANT'S CENTROID, ties broken by the fitted frame the position
 * would leave behind and then by a fixed candidate order.  An islet is a part
 * of the vault like any other, and the reader looks for it near the rest of
 * the vault: parked in a far corner it reads as an afterthought, or is missed
 * altogether on a sheet that is mostly mainland.  The price is the frame — an
 * islet pulled in toward the middle usually lands just off the mainland's
 * long side, where the frame has no slack, so the sheet grows by a band — and
 * that price is accepted.  (The previous objective minimised the fitted frame
 * instead, which tucked islets into the slack at a corner of the sheet; it
 * cost the mainland nothing, but it put the islet as far from everything as
 * the sheet allowed.)  The clearance rule is untouched: the islet is as close
 * to the centre as it can be WITHOUT the terrain raising an isthmus to it.
 *
 * That is the rule for a component seen for the first time.  A RETURNING one
 * (`returning[c]`, warm-started from the reader's saved map) makes the
 * smallest move that leaves it clear and central instead — usually none —
 * so that a map the reader has learnt does not rearrange its islands between
 * two runs of a vault that barely changed.
 *
 * The component is translated RIGIDLY — its own shape is data and is preserved
 * — and the candidate positions are a fixed coarse grid, so the result does
 * not depend on iteration order or on floating-point luck.
 */
function packComponents(coords, groups, clearance, returning) {
  // Bin the already-placed notes so the clearance test is local rather than
  // O(placed) per candidate; with 40 components on a 5,000-note vault the
  // naive version is the slowest thing in the pipeline.
  const cell = Math.max(clearance, 1e-6);
  const bins = new Map();
  const binKey = function (cx, cy) { return cx + "," + cy; };
  const addPoint = function (x, y) {
    const key = binKey(Math.floor(x / cell), Math.floor(y / cell));
    let arr = bins.get(key);
    if (!arr) { arr = []; bins.set(key, arr); }
    arr.push(x, y);
  };
  const clearOf = function (x, y, slack) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    const c = clearance * (slack === undefined ? 1 : slack);
    const c2 = c * c;
    // A slack above one reaches past the neighbouring bins.
    const R = Math.max(1, Math.ceil(c / cell));
    for (let dx = -R; dx <= R; dx++) {
      for (let dy = -R; dy <= R; dy++) {
        const arr = bins.get(binKey(cx + dx, cy + dy));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k += 2) {
          const ex = x - arr[k], ey = y - arr[k + 1];
          if (ex * ex + ey * ey < c2) return false;
        }
      }
    }
    return true;
  };

  const giant = groups[0];
  let gx = 0, gy = 0;
  for (const i of giant) { gx += coords[i * 2]; gy += coords[i * 2 + 1]; }
  gx /= giant.length; gy /= giant.length;
  let glo = Infinity, ghi = -Infinity, gloy = Infinity, ghiy = -Infinity;
  for (const i of giant) {
    glo = Math.min(glo, coords[i * 2]); ghi = Math.max(ghi, coords[i * 2]);
    gloy = Math.min(gloy, coords[i * 2 + 1]); ghiy = Math.max(ghiy, coords[i * 2 + 1]);
  }
  for (const i of giant) addPoint(coords[i * 2], coords[i * 2 + 1]);

  const spanX = Math.max(ghi - glo, 1e-6) * PACK_SPAN;
  const spanY = Math.max(ghiy - gloy, 1e-6) * PACK_SPAN;
  const cand = [];
  for (let cxi = 0; cxi < PACK_GRID[0]; cxi++) {
    for (let cyi = 0; cyi < PACK_GRID[1]; cyi++) {
      const x = gx - spanX + (2 * spanX) * cxi / (PACK_GRID[0] - 1);
      const y = gy - spanY + (2 * spanY) * cyi / (PACK_GRID[1] - 1);
      cand.push([x, y, (x - gx) * (x - gx) + (y - gy) * (y - gy)]);
    }
  }
  cand.sort(function (p, q) { return p[2] - q[2] || p[0] - q[0] || p[1] - q[1]; });

  // The bounding box of everything already on the sheet, kept up to date as
  // components land, because what a candidate costs depends on what is there.
  let bx0 = glo, bx1 = ghi, by0 = gloy, by1 = ghiy;
  const grow = function (g) {
    for (const i of g) {
      if (coords[i * 2] < bx0) bx0 = coords[i * 2];
      if (coords[i * 2] > bx1) bx1 = coords[i * 2];
      if (coords[i * 2 + 1] < by0) by0 = coords[i * 2 + 1];
      if (coords[i * 2 + 1] > by1) by1 = coords[i * 2 + 1];
    }
  };

  // A continuous quantity ties only to within a relative epsilon.  Distance
  // first, then frame area, then the fixed candidate order — the one
  // ordering used by both the coarse ranking and the polish pass, so the
  // packing stays deterministic.
  const near = function (a, b) {
    return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-12);
  };
  const byCentral = function (p, q) {
    if (!near(p[0], q[0])) return p[0] - q[0];
    if (!near(p[1], q[1])) return p[1] - q[1];
    return p[2] - q[2];
  };
  const stepX = 2 * spanX / (PACK_GRID[0] - 1);
  const stepY = 2 * spanY / (PACK_GRID[1] - 1);

  for (let c = 1; c < groups.length; c++) {
    const g = groups[c];

    let cxm = 0, cym = 0;
    let lx0 = Infinity, lx1 = -Infinity, ly0 = Infinity, ly1 = -Infinity;
    for (const i of g) {
      cxm += coords[i * 2]; cym += coords[i * 2 + 1];
      lx0 = Math.min(lx0, coords[i * 2]); lx1 = Math.max(lx1, coords[i * 2]);
      ly0 = Math.min(ly0, coords[i * 2 + 1]); ly1 = Math.max(ly1, coords[i * 2 + 1]);
    }
    cxm /= g.length; cym /= g.length;

    const feasible = function (ox, oy) {
      for (const i of g) {
        if (!clearOf(coords[i * 2] + ox, coords[i * 2 + 1] + oy)) return false;
      }
      return true;
    };
    const cost = function (ox, oy) {
      return fittedFrameArea(
        Math.min(bx0, lx0 + ox), Math.max(bx1, lx1 + ox),
        Math.min(by0, ly0 + oy), Math.max(by1, ly1 + oy));
    };

    // Rank every candidate by how near the giant's centroid it would put the
    // component's centroid — that is p[2], already computed — then by the
    // frame it would leave behind, THEN walk the list in that order and take
    // the first that clears.  Scoring is cheap (four numbers per candidate)
    // and the clearance test is not.
    const ranked = cand.map(function (p, t) {
      return [p[2], cost(p[0] - cxm, p[1] - cym), t];
    });
    ranked.sort(byCentral);

    let placedAt = null;
    for (let r = 0; r < ranked.length; r++) {
      const p = cand[ranked[r][2]];
      const ox = p[0] - cxm, oy = p[1] - cym;
      if (feasible(ox, oy)) { placedAt = [ox, oy]; break; }
    }

    // The coarse grid is sixty-one steps across two and a bit cloud widths, so
    // its best square is only the best to within about a fortieth of the
    // sheet — and the islet should come right up to the clearance line, not
    // stop a fortieth short of it.  So the winner is polished on a grid a
    // quarter of a coarse step fine, over the one cell around it.  Eighty-one
    // more clearance tests per component.
    if (placedAt !== null) {
      const fine = [];
      for (let a = -PACK_REFINE; a <= PACK_REFINE; a++) {
        for (let b = -PACK_REFINE; b <= PACK_REFINE; b++) {
          const ox = placedAt[0] + a * stepX / PACK_REFINE;
          const oy = placedAt[1] + b * stepY / PACK_REFINE;
          const dx = (ox + cxm) - gx, dy = (oy + cym) - gy;
          fine.push([dx * dx + dy * dy, cost(ox, oy), a * (2 * PACK_REFINE + 1) + b, ox, oy]);
        }
      }
      fine.sort(byCentral);
      for (let r = 0; r < fine.length; r++) {
        if (feasible(fine[r][3], fine[r][4])) { placedAt = [fine[r][3], fine[r][4]]; break; }
      }
    }

    // A RETURNING component — one the reader has already seen placed, warm
    // started from its saved position — is not packed afresh.  Re-packing it
    // to the most central free spot on every run is what the objective above
    // would say, but it is the wrong question for a map the reader has
    // already learnt: the best spot is a fact about this run's mainland, and
    // two runs of a vault that barely changed can disagree about it by the
    // width of the sheet — above all with several islets, where whichever
    // lands first takes the bay the next one had.  So a returning component
    // asks two questions of where it stands.
    //
    // Is it CENTRAL?  Within PACK_STAY_CENTRAL (plus one coarse grid step) of
    // the most central position it could take while keeping the water it
    // already has — its current gap to everything placed, counted up to
    // PACK_STAY_GAP_MAX clearances.  Its own water rather than the bare
    // clearance, because the clearance this call was given is not the one
    // the islet was placed with: a cold run's retry loop widens the clearance
    // after the frame fit, so a freshly packed islet sits a third of a
    // clearance further out than this run's bare optimum, and judged against
    // that optimum it was pulled inward a step every few runs until the
    // frame's aspect flipped.  An islet that is NOT central — one an older
    // packer parked in a corner has far more water than the cap lets count —
    // is packed afresh at the most central spot: it comes in once.
    //
    // Is it CLEAR?  Judged with a tenth of slack, because a component sits on
    // the clearance line, which is where the packer puts it, and a comparison
    // made exactly there fails by a rounding difference on the next run.  A
    // central islet that is no longer clear — a coast that has crept toward
    // it over a few runs; with several islets the gaps between them creep
    // too — takes the SMALLEST MOVE that makes it clear and keeps it central:
    // a fine grid around where it stands first, then the coarse grid, ranked
    // by how far it would move.  It steps a fraction of a clearance outward
    // instead of being thrown to whichever bay is best this run.
    //
    // Both are judged afresh each run, so nothing about the rule wears out
    // over a long chain of warm starts: measured over twenty-two chained
    // runs with one to ten unchanging islets, and with islets merging, no
    // islet moved more than 0.05 map units in a run and the frame never
    // changed.  What still moves them, measured the same way: an islet
    // REMOVED frees a more central spot, and a neighbour that is then no
    // longer central comes in to it once (0.86); a vault that keeps growing
    // NEW small components — ten notes a run, some pairing up orphans — every
    // dozen runs re-fits the whole sheet by a tenth of a unit as the cloud
    // changes shape, and can re-seat a pair (up to 1.0); an islet that LOSES
    // a note can likewise be re-seated (0.81, the sheet re-fitted by 0.13);
    // and a CROWD — with forty islets the candidate grid runs out of room, a
    // cold run parks the overflow in a row beyond the mainland, and a score
    // of them reshuffle every few runs.  Why the last three happen is not
    // pinned down.  Every one
    // of them moved less, and none changed the frame, where the frame-area
    // packer before this one moved islets up to 1.6, the mainland up to 0.25
    // and the frame five times.  A brand-new component, and every component
    // of a cold run, is simply packed at the most central spot.
    if (returning && returning[c] && placedAt !== null) {
      // The water it already has, looked for no further than the cap.
      const capD = PACK_STAY_GAP_MAX * clearance;
      const R = Math.max(1, Math.ceil(capD / cell));
      let gap2 = capD * capD;
      for (const i of g) {
        const x = coords[i * 2], y = coords[i * 2 + 1];
        const bx = Math.floor(x / cell), by = Math.floor(y / cell);
        for (let dx = -R; dx <= R; dx++) {
          for (let dy = -R; dy <= R; dy++) {
            const arr = bins.get(binKey(bx + dx, by + dy));
            if (!arr) continue;
            for (let k = 0; k < arr.length; k += 2) {
              const ex = x - arr[k], ey = y - arr[k + 1];
              const d2 = ex * ex + ey * ey;
              if (d2 < gap2) gap2 = d2;
            }
          }
        }
      }
      const own = clamp(Math.sqrt(gap2) / Math.max(clearance, 1e-12), 1, PACK_STAY_GAP_MAX);
      let bestOwn = Infinity;
      for (let r = 0; r < ranked.length; r++) {
        const p = cand[ranked[r][2]];
        const ox = p[0] - cxm, oy = p[1] - cym;
        let ok = true;
        for (const i of g) {
          if (!clearOf(coords[i * 2] + ox, coords[i * 2 + 1] + oy, own)) { ok = false; break; }
        }
        if (ok) { bestOwn = Math.sqrt(ranked[r][0]); break; }
      }
      const reach = bestOwn * (1 + PACK_STAY_CENTRAL) + Math.max(stepX, stepY);
      const central = function (ox, oy) {
        return Math.hypot(ox + cxm - gx, oy + cym - gy) <= reach;
      };
      if (central(0, 0)) {
        let clear = true;
        for (const i of g) {
          if (!clearOf(coords[i * 2], coords[i * 2 + 1], PACK_STAY_SLACK)) { clear = false; break; }
        }
        if (clear) {
          placedAt = [0, 0];
        } else {
          const moves = [];
          const L = PACK_LOCAL_REACH * PACK_REFINE;
          for (let a = -L; a <= L; a++) {
            for (let b = -L; b <= L; b++) {
              const ox = a * stepX / PACK_REFINE, oy = b * stepY / PACK_REFINE;
              const dx = ox + cxm - gx, dy = oy + cym - gy;
              moves.push([ox * ox + oy * oy, dx * dx + dy * dy, moves.length, ox, oy]);
            }
          }
          for (let t = 0; t < cand.length; t++) {
            const ox = cand[t][0] - cxm, oy = cand[t][1] - cym;
            moves.push([ox * ox + oy * oy, cand[t][2], moves.length, ox, oy]);
          }
          moves.sort(byCentral);
          for (let r = 0; r < moves.length; r++) {
            const q = moves[r];
            if (central(q[3], q[4]) && feasible(q[3], q[4])) { placedAt = [q[3], q[4]]; break; }
          }
          // ...and when nothing central is clear, placedAt is still the most
          // central feasible spot found above.
        }
      }
    }

    if (placedAt === null) {
      // Every grid position is taken — park it beyond the right edge of
      // everything placed so far rather than dropping it on the mainland.
      let maxX = -Infinity;
      for (const arr of bins.values()) for (let k = 0; k < arr.length; k += 2) maxX = Math.max(maxX, arr[k]);
      placedAt = [maxX + 2 * clearance - cxm, gy - cym];
    }
    for (const i of g) {
      coords[i * 2] += placedAt[0];
      coords[i * 2 + 1] += placedAt[1];
      addPoint(coords[i * 2], coords[i * 2 + 1]);
    }
    grow(g);
  }
  return coords;
}

/**
 * Median nearest-neighbour distance of a set of points — the "how far apart
 * do notes sit here" of a component.
 */
function medianNearestNeighbour(coords, group) {
  const m = group.length;
  if (m < 2) return 0;
  const d = [];
  // The query points are strided on a big component — a median over 600
  // samples is the same number to three digits and turns an O(m^2) scan of a
  // 5,000-note mainland into an O(600 m) one.
  const stride = Math.max(1, Math.floor(m / 600));
  for (let a = 0; a < m; a += stride) {
    let best = Infinity;
    for (let b = 0; b < m; b++) {
      if (a === b) continue;
      const dx = coords[group[a] * 2] - coords[group[b] * 2];
      const dy = coords[group[a] * 2 + 1] - coords[group[b] * 2 + 1];
      const dd = dx * dx + dy * dy;
      if (dd < best) best = dd;
    }
    d.push(Math.sqrt(best));
  }
  d.sort(function (p, q) { return p - q; });
  return d[Math.floor(d.length / 2)];
}

/**
 * Put every component on the same scale as the mainland.
 *
 * The SGD's equilibrium spacing is set by the a/b curve and by how much
 * repulsion a node feels, and a five-note component feels almost none: it
 * keeps most of the spread its spectral initialisation gave it, and comes out
 * about half the width of a 500-note continent.  Drawn that way the sheet
 * claims the islet is a continent with four notes in it.  Each non-giant
 * component is therefore scaled uniformly — its SHAPE is data and is
 * preserved — so that its notes sit as far apart as mainland notes do.
 */
function normaliseComponentScales(coords, groups) {
  const target = medianNearestNeighbour(coords, groups[0]);
  if (!(target > 0)) return;
  for (let c = 1; c < groups.length; c++) {
    const g = groups[c];
    if (g.length < 2) continue;
    const own = medianNearestNeighbour(coords, g);
    if (!(own > 0)) continue;
    const s = clamp(target / own, 0.02, 50);
    let cx = 0, cy = 0;
    for (const i of g) { cx += coords[i * 2]; cy += coords[i * 2 + 1]; }
    cx /= g.length; cy /= g.length;
    for (const i of g) {
      coords[i * 2] = cx + (coords[i * 2] - cx) * s;
      coords[i * 2 + 1] = cy + (coords[i * 2 + 1] - cy) * s;
    }
  }
}

/** Scale uniformly (equal aspect) and centre inside the map frame. */
function fitFrame(coords, frameW, margin) {
  const n = coords.length / 2;
  let lox = Infinity, hix = -Infinity, loy = Infinity, hiy = -Infinity;
  for (let i = 0; i < n; i++) {
    lox = Math.min(lox, coords[i * 2]); hix = Math.max(hix, coords[i * 2]);
    loy = Math.min(loy, coords[i * 2 + 1]); hiy = Math.max(hiy, coords[i * 2 + 1]);
  }
  const spanX = Math.max(hix - lox, 1e-9), spanY = Math.max(hiy - loy, 1e-9);
  const scale = Math.min(frameW * (1 - 2 * margin) / spanX, FRAME_H * (1 - 2 * margin) / spanY);
  const out = new Float64Array(n * 2);
  const cx = (lox + hix) / 2, cy = (loy + hiy) / 2;
  for (let i = 0; i < n; i++) {
    out[i * 2] = (coords[i * 2] - cx) * scale + frameW / 2;
    out[i * 2 + 1] = (coords[i * 2 + 1] - cy) * scale + FRAME_H / 2;
  }
  return { coords: out, scale: scale };
}

// The aspect is chosen on a ladder of this step rather than taken raw.  It is
// derived from the cloud's bounding box, which two added notes can nudge in
// the second decimal — and a frame that changes width by a per cent rescales
// and re-centres every note on the sheet, so a map the reader knows is
// redrawn rather than updated for no visible gain.
//
// A snapped value is stable against small changes UNLESS the cloud happens to
// sit on a rung boundary, and one does: with the islets packed into the
// frame's own corners the fixture asks for 1.666, which is a hundredth from
// the 1.65 that separates 1.6 from 1.7.  Ten notes added and ten removed flip
// it, the whole cloud is re-fitted to a frame a rung narrower, and every note
// on the sheet moves — the exact "redrawn rather than updated" failure the
// ladder exists to prevent, arrived at by a different road.  So the ladder is
// sticky: a run that knows the previous frame keeps it unless the cloud has
// asked to move by more than three quarters of a rung.
const FRAME_ASPECT_STEP = 0.1;
const FRAME_ASPECT_HYSTERESIS = 0.75;

/** The frame aspect the cloud itself asks for, snapped to the ladder and
 *  clamped so no vault can ask for a square or a letterbox. */
function chooseFrameWidth(coords, prevFrameW) {
  const n = coords.length / 2;
  let lox = Infinity, hix = -Infinity, loy = Infinity, hiy = -Infinity;
  for (let i = 0; i < n; i++) {
    lox = Math.min(lox, coords[i * 2]); hix = Math.max(hix, coords[i * 2]);
    loy = Math.min(loy, coords[i * 2 + 1]); hiy = Math.max(hiy, coords[i * 2 + 1]);
  }
  const aspect = (hix - lox) / Math.max(hiy - loy, 1e-9);
  if (prevFrameW > 0) {
    const held = clamp(prevFrameW / FRAME_H, FRAME_ASPECT_MIN, FRAME_ASPECT_MAX);
    if (Math.abs(aspect - held) <= FRAME_ASPECT_STEP * FRAME_ASPECT_HYSTERESIS) {
      return +(held * FRAME_H).toFixed(6);
    }
  }
  const snapped = Math.round(aspect / FRAME_ASPECT_STEP) * FRAME_ASPECT_STEP;
  return +(clamp(snapped, FRAME_ASPECT_MIN, FRAME_ASPECT_MAX) * FRAME_H).toFixed(6);
}

/* ----------------------------------------------------------------------
 * 2f. Terrain
 *
 * NOT a kernel density estimate evaluated cell by cell: that is
 * O(notes * cells) and a 5,000-note vault on a 300-row grid is 650 million
 * kernel evaluations.  The same surface, to the precision a contour band can
 * show, comes from binning the notes into the grid with a bilinear splat and
 * blurring separably with a truncated Gaussian — O(cells * sigma), and the
 * bandwidth is Scott's rule exactly as the reference used it.
 * ------------------------------------------------------------------- */

function gridNx(frameW) { return Math.max(2, Math.round(GRID_NY * frameW / FRAME_H)); }

function gaussianKernel(sigmaCells) {
  const radius = Math.max(1, Math.ceil(KERNEL_TRUNCATION * sigmaCells));
  const k = new Float64Array(radius * 2 + 1);
  let sum = 0;
  const inv = 1.0 / (2 * sigmaCells * sigmaCells);
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-i * i * inv);
    k[i + radius] = v; sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return { k: k, radius: radius };
}

function blurSeparable(z, nx, ny, sigmaX, sigmaY) {
  const kx = gaussianKernel(sigmaX), ky = gaussianKernel(sigmaY);
  const tmp = new Float32Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    const base = r * nx;
    for (let c = 0; c < nx; c++) {
      let acc = 0;
      for (let t = -kx.radius; t <= kx.radius; t++) {
        const cc = c + t;
        if (cc < 0 || cc >= nx) continue;      // zero outside: the sheet's edge
        acc += z[base + cc] * kx.k[t + kx.radius];
      }
      tmp[base + c] = acc;
    }
  }
  const out = new Float32Array(nx * ny);
  for (let c = 0; c < nx; c++) {
    for (let r = 0; r < ny; r++) {
      let acc = 0;
      for (let t = -ky.radius; t <= ky.radius; t++) {
        const rr = r + t;
        if (rr < 0 || rr >= ny) continue;
        acc += tmp[rr * nx + c] * ky.k[t + ky.radius];
      }
      out[r * nx + c] = acc;
    }
  }
  return out;
}

/** Density grid over the frame, normalised to [0, 1].  Row 0 is y = 0, so y
 *  runs UP the array exactly as it runs up the map. */
function terrain(coords, frameW, bandwidthFactor) {
  const n = coords.length / 2;
  const nx = gridNx(frameW), ny = GRID_NY;
  const z = new Float32Array(nx * ny);
  if (n === 0) return { nx: nx, ny: ny, z: z };

  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += coords[i * 2]; my += coords[i * 2 + 1]; }
  mx /= n; my /= n;
  let vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    vx += (coords[i * 2] - mx) ** 2;
    vy += (coords[i * 2 + 1] - my) ** 2;
  }
  const sdx = Math.sqrt(vx / Math.max(n - 1, 1)), sdy = Math.sqrt(vy / Math.max(n - 1, 1));
  const scott = Math.pow(n, -1 / 6);         // d = 2  ->  n^(-1/(d+4))
  const sigX = Math.max(bandwidthFactor * scott * sdx, 1e-6);
  const sigY = Math.max(bandwidthFactor * scott * sdy, 1e-6);

  const dx = frameW / (nx - 1), dy = FRAME_H / (ny - 1);
  for (let i = 0; i < n; i++) {
    const fx = clamp(coords[i * 2] / dx, 0, nx - 1.0000001);
    const fy = clamp(coords[i * 2 + 1] / dy, 0, ny - 1.0000001);
    const c0 = Math.floor(fx), r0 = Math.floor(fy);
    const tx = fx - c0, ty = fy - r0;
    const c1 = Math.min(c0 + 1, nx - 1), r1 = Math.min(r0 + 1, ny - 1);
    z[r0 * nx + c0] += (1 - tx) * (1 - ty);
    z[r0 * nx + c1] += tx * (1 - ty);
    z[r1 * nx + c0] += (1 - tx) * ty;
    z[r1 * nx + c1] += tx * ty;
  }
  const blurred = blurSeparable(z, nx, ny, sigX / dx, sigY / dy);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < blurred.length; i++) {
    if (blurred[i] < lo) lo = blurred[i];
    if (blurred[i] > hi) hi = blurred[i];
  }
  const span = Math.max(hi - lo, 1e-12);
  for (let i = 0; i < blurred.length; i++) blurred[i] = (blurred[i] - lo) / span;
  return { nx: nx, ny: ny, z: blurred };
}

function landTouchesBorder(grid, seaLevel) {
  const { nx, ny, z } = grid;
  for (let c = 0; c < nx; c++) {
    if (z[c] >= seaLevel || z[(ny - 1) * nx + c] >= seaLevel) return true;
  }
  for (let r = 0; r < ny; r++) {
    if (z[r * nx] >= seaLevel || z[r * nx + nx - 1] >= seaLevel) return true;
  }
  return false;
}

/** Filled band edges from sea level to the highest summit — equal steps in
 *  density, which for a roughly Gaussian hill turns into nearly equal
 *  spacing on the paper, because a ring's radius goes as sqrt(-log z). */
function terrainLevels(seaLevel, bands) {
  const out = [];
  for (let i = 0; i <= bands; i++) out.push(seaLevel + (1 - seaLevel) * (i / bands));
  return out;
}

/* -- peaks -------------------------------------------------------------- */

/** Sliding-window maximum along one axis; two passes make the 2-D filter. */
function maxFilter2D(z, nx, ny, size) {
  const half = Math.floor(size / 2);
  const tmp = new Float32Array(nx * ny);
  const idxDeque = new Int32Array(Math.max(nx, ny));
  const run = function (get, set, len, outer) {
    for (let o = 0; o < outer; o++) {
      let headI = 0, tailI = 0;
      for (let i = 0; i < len + half; i++) {
        if (i < len) {
          const v = get(o, i);
          while (tailI > headI && get(o, idxDeque[tailI - 1]) <= v) tailI--;
          idxDeque[tailI++] = i;
        }
        const outPos = i - half;
        if (outPos >= 0) {
          while (idxDeque[headI] < outPos - half) headI++;
          set(o, outPos, get(o, idxDeque[headI]));
        }
      }
    }
  };
  run(function (r, c) { return z[r * nx + c]; },
      function (r, c, v) { tmp[r * nx + c] = v; }, nx, ny);
  const out = new Float32Array(nx * ny);
  run(function (c, r) { return tmp[r * nx + c]; },
      function (c, r, v) { out[r * nx + c] = v; }, ny, nx);
  return out;
}

/**
 * Local maxima of the density, greedily merged, tallest first.
 *
 * A maximum also has to be a PLACE: at least `minNotes` notes on its own
 * hill.  A handful of notes packed very tightly raises a real but meaningless
 * bump, and naming it would put a summit on the sheet with the authority of a
 * region and the evidence of five notes.
 */
function findPeaks(grid, coords, frameW, minNotes) {
  const { nx, ny, z } = grid;
  const filtered = maxFilter2D(z, nx, ny, PEAK_FILTER_CELLS);
  const dx = frameW / (nx - 1), dy = FRAME_H / (ny - 1);
  const cands = [];
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const v = z[r * nx + c];
      if (v !== filtered[r * nx + c] || v <= PEAK_FLOOR) continue;
      cands.push({ val: v, x: c * dx, y: r * dy });
    }
  }
  cands.sort(function (a, b) { return b.val - a.val || a.x - b.x || a.y - b.y; });

  const n = coords.length / 2;
  const merged = [];
  for (let i = 0; i < cands.length && merged.length < MAX_PEAKS; i++) {
    const p = cands[i];
    let near = false;
    for (let m = 0; m < merged.length; m++) {
      if (Math.hypot(p.x - merged[m].x, p.y - merged[m].y) < PEAK_MERGE_DIST) { near = true; break; }
    }
    if (near) continue;
    let onHill = 0;
    for (let k = 0; k < n; k++) {
      if (Math.hypot(coords[k * 2] - p.x, coords[k * 2 + 1] - p.y) <= PEAK_MERGE_DIST) onHill++;
    }
    if (onHill < minNotes) continue;
    merged.push(p);
  }
  return merged;
}

/**
 * Give every peak an anchor note and name it after that note.
 *
 * A density maximum is a place on a grid, not a thing in the vault.  The
 * summit is therefore IDENTIFIED WITH a note — the best-connected one on its
 * own hill — and takes that note's title, so the biggest dot on each hill is
 * never left unlabelled.  Two peaks cannot share an anchor: the lower one
 * takes its next-best note.
 */
function anchorPeaks(peaks, coords, nodes) {
  const n = coords.length / 2;
  const used = new Set();
  for (let pi = 0; pi < peaks.length; pi++) {
    const p = peaks[pi];
    const hill = [];
    let nearest = -1, nearestD = Infinity;
    for (let k = 0; k < n; k++) {
      const d = Math.hypot(coords[k * 2] - p.x, coords[k * 2 + 1] - p.y);
      if (d <= PEAK_MERGE_DIST) hill.push(k);
      if (d < nearestD) { nearestD = d; nearest = k; }
    }
    const pool = hill.length ? hill : (nearest >= 0 ? [nearest] : []);
    pool.sort(function (a, b) {
      return nodes[b].deg - nodes[a].deg ||
        (nodes[a].path < nodes[b].path ? -1 : nodes[a].path > nodes[b].path ? 1 : 0);
    });
    let anchor = null;
    for (let k = 0; k < pool.length; k++) {
      if (!used.has(pool[k])) { anchor = pool[k]; break; }
    }
    if (anchor === null && pool.length) anchor = pool[0];
    if (anchor !== null) used.add(anchor);
    p.anchor = anchor;
    p.name = anchor === null ? "Region " + roman(pi) : nodes[anchor].title;
    p.numeral = roman(pi);
    p.count = 0;
  }
  // `count` is how many notes call this summit's ANCHOR their nearest — the
  // honest answer to "how big is this region", and it partitions the placed
  // notes exactly, so the counts sum to the number of notes on the map.  The
  // same partition is written back onto the notes as `region`, which is what
  // the view's Summits list isolates when the reader hovers a row.
  const anchors = [];
  for (let p = 0; p < peaks.length; p++) if (peaks[p].anchor !== null) anchors.push(p);
  for (let k = 0; k < n; k++) nodes[k].region = null;
  if (anchors.length) {
    for (let k = 0; k < n; k++) {
      let best = 0, bestD = Infinity;
      for (let a = 0; a < anchors.length; a++) {
        const ai = peaks[anchors[a]].anchor;
        const d = Math.hypot(coords[k * 2] - coords[ai * 2], coords[k * 2 + 1] - coords[ai * 2 + 1]);
        if (d < bestD) { bestD = d; best = a; }
      }
      peaks[anchors[best]].count++;
      nodes[k].region = anchors[best];
    }
  }
  return peaks;
}

/* -- contours ----------------------------------------------------------- */

/** Marching squares at one level, linked into rings and polylines.
 *
 *  Edge crossings are interpolated with one formula per grid EDGE, not per
 *  cell, so the two cells that share an edge produce bit-identical endpoints
 *  and the linking step can match them by value. */
function marchingSquares(grid, frameW, level) {
  const { nx, ny, z } = grid;
  const dx = frameW / (nx - 1), dy = FRAME_H / (ny - 1);
  const segs = [];
  const interpX = function (r, c) {           // between (r,c) and (r,c+1)
    const v0 = z[r * nx + c], v1 = z[r * nx + c + 1];
    const t = (level - v0) / (v1 - v0);
    return [(c + t) * dx, r * dy];
  };
  const interpY = function (r, c) {           // between (r,c) and (r+1,c)
    const v0 = z[r * nx + c], v1 = z[(r + 1) * nx + c];
    const t = (level - v0) / (v1 - v0);
    return [c * dx, (r + t) * dy];
  };
  for (let r = 0; r < ny - 1; r++) {
    for (let c = 0; c < nx - 1; c++) {
      const v00 = z[r * nx + c], v10 = z[r * nx + c + 1];
      const v01 = z[(r + 1) * nx + c], v11 = z[(r + 1) * nx + c + 1];
      let code = 0;
      if (v00 >= level) code |= 1;
      if (v10 >= level) code |= 2;
      if (v11 >= level) code |= 4;
      if (v01 >= level) code |= 8;
      if (code === 0 || code === 15) continue;
      const B = function () { return interpX(r, c); };          // bottom edge
      const T = function () { return interpX(r + 1, c); };      // top edge
      const L = function () { return interpY(r, c); };          // left edge
      const R = function () { return interpY(r, c + 1); };      // right edge
      const push = function (p, q) { segs.push([p[0], p[1], q[0], q[1]]); };
      switch (code) {
        case 1: case 14: push(L(), B()); break;
        case 2: case 13: push(B(), R()); break;
        case 3: case 12: push(L(), R()); break;
        case 4: case 11: push(R(), T()); break;
        case 6: case 9: push(B(), T()); break;
        case 7: case 8: push(L(), T()); break;
        case 5: case 10: {
          // Saddle: the cell centre decides which pair of corners joins.
          const centre = (v00 + v10 + v01 + v11) / 4;
          const high = centre >= level;
          if ((code === 5) === high) { push(L(), T()); push(B(), R()); }
          else { push(L(), B()); push(R(), T()); }
          break;
        }
      }
    }
  }
  return linkSegments(segs);
}

/** Join segments end-to-end into rings (closed) and polylines (open). */
function linkSegments(segs) {
  const key = function (x, y) { return x.toFixed(9) + "," + y.toFixed(9); };
  const ends = new Map();
  const used = new Uint8Array(segs.length);
  for (let i = 0; i < segs.length; i++) {
    for (const [x, y] of [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]]) {
      const k = key(x, y);
      let arr = ends.get(k);
      if (!arr) { arr = []; ends.set(k, arr); }
      arr.push(i);
    }
  }
  const takeNext = function (k, exclude) {
    const arr = ends.get(k);
    if (!arr) return -1;
    for (let t = 0; t < arr.length; t++) {
      const s = arr[t];
      if (s !== exclude && !used[s]) return s;
    }
    return -1;
  };
  const rings = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const pts = [segs[i][0], segs[i][1], segs[i][2], segs[i][3]];
    // Walk forward...
    let cur = i;
    for (;;) {
      const k = key(pts[pts.length - 2], pts[pts.length - 1]);
      const nxt = takeNext(k, cur);
      if (nxt < 0) break;
      used[nxt] = 1;
      const s = segs[nxt];
      if (key(s[0], s[1]) === k) pts.push(s[2], s[3]); else pts.push(s[0], s[1]);
      cur = nxt;
    }
    // ...then backward from the original start.
    cur = i;
    for (;;) {
      const k = key(pts[0], pts[1]);
      const nxt = takeNext(k, cur);
      if (nxt < 0) break;
      used[nxt] = 1;
      const s = segs[nxt];
      if (key(s[0], s[1]) === k) pts.unshift(s[2], s[3]); else pts.unshift(s[0], s[1]);
      cur = nxt;
    }
    rings.push(pts);
  }
  return rings;
}

/** Douglas-Peucker, iterative, on a flat [x,y,x,y,...] polyline. */
function simplifyPolyline(pts, tol) {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = pts[a * 2], ay = pts[a * 2 + 1];
    const bx = pts[b * 2], by = pts[b * 2 + 1];
    const vx = bx - ax, vy = by - ay;
    const span = vx * vx + vy * vy;
    let worst = -1, worstD = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i * 2] - ax, py = pts[i * 2 + 1] - ay;
      let t = span > 0 ? (px * vx + py * vy) / span : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const ex = px - t * vx, ey = py - t * vy;
      const d = ex * ex + ey * ey;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worstD > tol2) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

function buildContours(grid, frameW, levels) {
  const tol = CONTOUR_SIMPLIFY_PT * frameW / REFERENCE_SHEET_PT;
  const out = [];
  for (let li = 0; li < levels.length; li++) {
    const kind = li === 0 ? "coast" : (li % INDEX_CONTOUR_EVERY === 0 ? "index" : "line");
    const rings = marchingSquares(grid, frameW, levels[li]);
    const kept = [];
    for (let r = 0; r < rings.length; r++) {
      const simp = simplifyPolyline(rings[r], tol);
      if (simp.length >= 6) kept.push(Float32Array.from(simp));
    }
    if (kept.length) out.push({ level: levels[li], kind: kind, rings: kept });
  }
  return out;
}

/* ----------------------------------------------------------------------
 * 2g. computeMap — the whole pipeline
 * ------------------------------------------------------------------- */

/**
 * `model` — every field, once:
 *
 *   counts        {files, placed, isolates, links}
 *   frameW/frameH the map frame in map units; frameH is always 1
 *   marginUsed    blank fraction on every side after the coast fit
 *   nodes[]       {path, title, folder, x, y, degIn, degOut, deg, component,
 *                  summit}  — x/y in map units, y UP, origin bottom-left;
 *                  `summit` is the peak index this note anchors, or null
 *   edges         [[i, j], ...] unique directed index pairs into nodes
 *   isolates[]    {path, title, folder} for notes with no resolved link
 *   grid          {nx, ny, z}  terrain, z normalised to [0, 1], row 0 at y = 0
 *   seaLevel      the density at which the coastline is drawn
 *   levels[]      the 13 band edges from seaLevel to 1
 *   contours[]    {level, kind: coast|line|index, rings: [Float32Array xy]}
 *   peaks[]       {x, y, val, anchor, name, numeral, count}
 *   folders[]     {name, count} over the placed notes, largest first
 *   layoutPositions  {path: [x, y]} in LAYOUT units — pass back as `prev`
 *   hash          of the graph, for cache invalidation
 *   params        every constant the run actually used
 */
async function computeMap(input, options, measurer, prev, hooks) {
  const opt = options || {};
  const h = normaliseHooks(hooks);
  const seed = opt.seed === undefined ? 42 : opt.seed | 0;
  const bandwidth = opt.bandwidth === undefined ? BANDWIDTH_FACTOR : opt.bandwidth;
  const seaLevel = opt.seaLevel === undefined ? SEA_LEVEL : opt.seaLevel;

  h.progress("graph", 0);
  const g = buildGraph(input, opt);
  const nAll = g.files.length;

  const adjAll = new Array(nAll);
  for (let i = 0; i < nAll; i++) adjAll[i] = [];
  for (let e = 0; e < g.undirected.length; e++) {
    adjAll[g.undirected[e][0]].push(g.undirected[e][1]);
    adjAll[g.undirected[e][1]].push(g.undirected[e][0]);
  }
  const placedIdx = [];
  const isolates = [];
  for (let i = 0; i < nAll; i++) {
    if (adjAll[i].length) placedIdx.push(i); else isolates.push(i);
  }
  const n = placedIdx.length;
  const local = new Map();
  for (let i = 0; i < n; i++) local.set(placedIdx[i], i);

  const nodes = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = g.files[placedIdx[i]];
    nodes[i] = {
      path: f.path,
      title: f.basename || f.path.replace(/\.md$/i, ""),
      folder: f.folder || VAULT_ROOT_KEY,
      x: 0, y: 0,
      degIn: g.degIn[placedIdx[i]],
      degOut: g.degOut[placedIdx[i]],
      deg: g.degIn[placedIdx[i]] + g.degOut[placedIdx[i]],
      component: 0,
      summit: null,
      region: null
    };
  }
  const adj = new Array(n);
  for (let i = 0; i < n; i++) {
    adj[i] = adjAll[placedIdx[i]].map(function (j) { return local.get(j); })
      .filter(function (j) { return j !== undefined; })
      .sort(function (a, b) { return a - b; });
  }

  const hash = hashGraph(g, opt.exclude || []);

  const cc = connectedComponents(n, adj);
  for (let i = 0; i < n; i++) nodes[i].component = cc.comp[i];

  /* -- the layout -------------------------------------------------------- */
  // Warm only on positions that survive validation: a saved map made entirely
  // of junk is a cold start, not a warm one made of NaN.
  const warm = hasSavedPositions(prev);
  const coords = new Float64Array(n * 2);
  // Which components were warm-started from where the reader last saw them;
  // the packer moves those as little as it can, and packs the rest afresh.
  const returning = new Array(cc.groups.length).fill(false);

  for (let c = 0; c < cc.groups.length; c++) {
    if (h.cancelled()) throw new MapCancelled();
    const group = cc.groups[c];
    const m = group.length;
    const toLocal = new Map();
    for (let k = 0; k < m; k++) toLocal.set(group[k], k);
    const sub = new Array(m);
    for (let k = 0; k < m; k++) {
      sub[k] = adj[group[k]].map(function (j) { return toLocal.get(j); })
        .filter(function (j) { return j !== undefined; });
    }
    let pos;
    if (m <= 2) {
      pos = m === 1 ? new Float64Array([0, 0]) : new Float64Array([-0.5, 0, 0.5, 0]);
    } else {
      const rng = mulberry32(seed + c * 7919);
      const graph = await affinityGraph(sub, h);
      let warmHere = false;
      const saved = new Array(m);
      if (warm) {
        let known = 0;
        for (let k = 0; k < m; k++) {
          saved[k] = savedPosition(prev, nodes[group[k]].path);
          if (saved[k]) known++;
        }
        if (known >= Math.max(3, m * 0.5)) warmHere = true;
      }
      if (warmHere) {
        pos = new Float64Array(m * 2);
        const has = new Uint8Array(m);
        for (let k = 0; k < m; k++) {
          const p = saved[k];
          if (p) { pos[k * 2] = p[0]; pos[k * 2 + 1] = p[1]; has[k] = 1; }
        }
        // A brand-new note starts at the mean of whichever of its neighbours
        // already have a place, so it appears where it belongs rather than
        // barging in from the origin and dragging its hill with it.
        for (let k = 0; k < m; k++) {
          if (has[k]) continue;
          let sx = 0, sy = 0, cnt = 0;
          for (const j of sub[k]) if (has[j]) { sx += pos[j * 2]; sy += pos[j * 2 + 1]; cnt++; }
          if (cnt) { pos[k * 2] = sx / cnt; pos[k * 2 + 1] = sy / cnt; }
          pos[k * 2] += (rng() - 0.5) * WARM_JITTER;
          pos[k * 2 + 1] += (rng() - 0.5) * WARM_JITTER;
        }
        const mobility = new Float64Array(m);
        for (let k = 0; k < m; k++) mobility[k] = has[k] ? WARM_KNOWN_MOBILITY : 1;
        // Where the KNOWN notes stood before the refinement: their centroid and
        // RMS radius, the frame of reference the reader's map was drawn in.
        const knownFrame = function () {
          let cnt = 0, sx = 0, sy = 0;
          for (let k = 0; k < m; k++) if (has[k]) { sx += pos[k * 2]; sy += pos[k * 2 + 1]; cnt++; }
          if (!cnt) return null;
          sx /= cnt; sy /= cnt;
          let r2 = 0;
          for (let k = 0; k < m; k++) {
            if (!has[k]) continue;
            const dx = pos[k * 2] - sx, dy = pos[k * 2 + 1] - sy;
            r2 += dx * dx + dy * dy;
          }
          return { cx: sx, cy: sy, rms: Math.sqrt(r2 / cnt), n: cnt };
        };
        const before = knownFrame();
        await optimizeLayout(pos, graph, SGD_WARM_EPOCHS, rng, SGD_WARM_LR, h,
          0.05 + 0.5 * (c / cc.groups.length), 0.5 / cc.groups.length, mobility);
        // Take the refinement's net translation and scale back out, and keep
        // only what it did to the component's SHAPE.  The warm SGD is seeded,
        // so a component meets the same sequence of negative samples on every
        // run, and on a small component that sequence does not average out: it
        // leaves a net push, the same push each time.  Nothing noticed while
        // the map was redrawn from scratch, but a warm start feeds each run's
        // output to the next, so the push accumulates — measured on the
        // reader's own vault, a five-note islet climbed a quarter of a unit a
        // run until the packer's stay rule gave up on it and threw it across
        // the sheet, taking the frame and every mainland note with it.  A
        // similarity correction on the known notes (the ones the reader has
        // already seen placed) is translation- and scale-invariant, so it
        // removes the component's OWN drift however small or large it is,
        // instead of hoping a threshold is wide enough to outlast it.  (What
        // it cannot remove is the mainland's coast slowly reshaping around an
        // islet; the packer answers that with the smallest move that keeps
        // the islet clear — see packComponents.)  Rotation is not
        // pinned, deliberately: known notes move at a twentieth of the rate,
        // so the SGD cannot turn a component appreciably, and the giant's
        // orientation is already held on warm starts.  With one known note
        // there is no radius to measure, so only the translation is undone.
        const after = before ? knownFrame() : null;
        if (before && after && isFinite(after.cx) && isFinite(after.cy)) {
          let s = 1;
          if (before.n >= 2 && before.rms > 1e-12 && after.rms > 1e-12 &&
            isFinite(before.rms) && isFinite(after.rms)) s = before.rms / after.rms;
          for (let k = 0; k < m; k++) {
            pos[k * 2] = before.cx + (pos[k * 2] - after.cx) * s;
            pos[k * 2 + 1] = before.cy + (pos[k * 2 + 1] - after.cy) * s;
          }
        }
      } else {
        pos = await spectralInit(graph, rng, h);
        await optimizeLayout(pos, graph, chooseEpochs(graph, false), rng, SGD_LR, h,
          0.05 + 0.5 * (c / cc.groups.length), 0.5 / cc.groups.length);
        // A cold component is centred on its own centroid; the packer then
        // decides where it sits relative to the mainland.
        let mx = 0, my = 0;
        for (let k = 0; k < m; k++) { mx += pos[k * 2]; my += pos[k * 2 + 1]; }
        mx /= m; my /= m;
        for (let k = 0; k < m; k++) { pos[k * 2] -= mx; pos[k * 2 + 1] -= my; }
      }
    }
    // A component any of whose notes the reader has already seen placed is
    // RETURNING, whatever the layout above did with it: the packer then moves
    // it as little as it can instead of packing it afresh.  That is decided
    // here and not by `warmHere`, because a warm LAYOUT needs three known notes
    // and half the component, and a two-note islet — or a three-note one that
    // has just gained a note — never qualifies; packed afresh on every run,
    // such a component went to whichever bay was most central that run and
    // bounced half the sheet between runs.  A component laid out cold is first
    // put back where its known notes stood: translated so their centroid is
    // their saved centroid.
    if (warm && c > 0) {
      let sx = 0, sy = 0, qx = 0, qy = 0, cnt = 0;
      for (let k = 0; k < m; k++) {
        const p = savedPosition(prev, nodes[group[k]].path);
        if (!p) continue;
        sx += p[0]; sy += p[1]; qx += pos[k * 2]; qy += pos[k * 2 + 1]; cnt++;
      }
      if (cnt) {
        returning[c] = true;
        const tx = (sx - qx) / cnt, ty = (sy - qy) / cnt;
        for (let k = 0; k < m; k++) { pos[k * 2] += tx; pos[k * 2 + 1] += ty; }
      }
    }
    // Orientation is applied to the GIANT component only, and only on a cold
    // start: a warm start must keep the previous orientation or the whole
    // sheet flips under the reader between two runs.
    if (c === 0 && !warm && m > 2) {
      const order = [];
      for (let k = 0; k < m; k++) order.push(k);
      order.sort(function (a, b) {
        return nodes[group[b]].deg - nodes[group[a]].deg ||
          (nodes[group[a]].path < nodes[group[b]].path ? -1 : 1);
      });
      pos = orient(pos, null, order);
    }
    for (let k = 0; k < m; k++) {
      coords[group[k] * 2] = pos[k * 2];
      coords[group[k] * 2 + 1] = pos[k * 2 + 1];
    }
  }
  h.progress("pack", 0.6);
  if (h.tick) await h.tick();

  /* -- pack, then frame -------------------------------------------------- */
  if (cc.groups.length > 1) normaliseComponentScales(coords, cc.groups);
  const giant = cc.groups[0] || [];
  let gH = 1;
  if (giant.length) {
    let lo = Infinity, hi = -Infinity;
    for (const i of giant) { lo = Math.min(lo, coords[i * 2 + 1]); hi = Math.max(hi, coords[i * 2 + 1]); }
    gH = Math.max(hi - lo, 1e-6);
  }
  const base = Float64Array.from(coords);
  let layout = coords, frameW = FRAME_ASPECT_MIN;
  let clearFrac = COMPONENT_CLEARANCE_FRAC;
  for (let attempt = 0; attempt < 4; attempt++) {
    layout = Float64Array.from(base);
    if (cc.groups.length > 1) packComponents(layout, cc.groups, clearFrac * gH, returning);
    frameW = chooseFrameWidth(layout, warm ? opt.prevFrameW : 0);
    if (cc.groups.length <= 1) break;
    // The clearance that matters is the one on the SHEET, and the frame fit
    // scales the whole cloud by an amount the packer cannot know in advance,
    // so it is measured afterwards and the packing retried if the gap came
    // out too narrow for open water to appear between the coasts.
    const fitted = fitFrame(layout, frameW, FRAME_MARGIN).coords;
    // A warm start is held to a looser floor, and on purpose.  A component
    // that is kept where the reader last saw it is measured against a mainland
    // that has changed shape since, so its clearance drifts by a few per cent
    // in either direction with no one having moved; insisting on the exact
    // floor makes the packer take the island away from the reader to buy back
    // a fortieth of a millimetre of open water.  The reader's map wins.  A
    // cold start — which is what "Redraw from scratch" asks for — still gets
    // the strict floor, so the strict geometry is never more than one command
    // away.
    const got = minCrossComponentDistance(fitted, cc.comp, COMPONENT_CLEARANCE_MAP);
    if (got >= COMPONENT_CLEARANCE_MAP * (warm ? PACK_STAY_SLACK : COMPONENT_CLEARANCE_TOL)) break;
    clearFrac *= clamp(COMPONENT_CLEARANCE_MAP * COMPONENT_CLEARANCE_AIM / Math.max(got, 1e-6),
      COMPONENT_RETRY_MIN, COMPONENT_RETRY_MAX);
  }

  // Grow the margin until the coastline closes inside the sheet.  The margin
  // is a promise about the LAND, not about the dots: the kernel is wide
  // relative to a small vault's cloud, so a cloud that sits politely inside
  // 7 % can still raise density above sea level out at the border, where the
  // contours are sliced off flat and the coast never closes.
  let margin = FRAME_MARGIN, fit = null, grid = null;
  for (;;) {
    fit = fitFrame(layout, frameW, margin);
    grid = terrain(fit.coords, frameW, bandwidth);
    if (!landTouchesBorder(grid, seaLevel)) break;
    if (margin + MARGIN_STEP > MARGIN_MAX + 1e-9) break;
    margin = +(margin + MARGIN_STEP).toFixed(6);
    if (h.cancelled()) throw new MapCancelled();
    if (h.tick) await h.tick();
  }
  const mapped = fit.coords;
  for (let i = 0; i < n; i++) { nodes[i].x = mapped[i * 2]; nodes[i].y = mapped[i * 2 + 1]; }

  h.progress("terrain", 0.75);
  if (h.tick) await h.tick();

  /* -- peaks, contours --------------------------------------------------- */
  const minNotes = clamp(Math.round(MIN_SUMMIT_NOTES_FRAC * n), MIN_SUMMIT_NOTES_LO, MIN_SUMMIT_NOTES_HI);
  let peaks = n ? findPeaks(grid, mapped, frameW, minNotes) : [];
  peaks = anchorPeaks(peaks, mapped, nodes);
  for (let p = 0; p < peaks.length; p++) {
    if (peaks[p].anchor !== null) nodes[peaks[p].anchor].summit = p;
  }

  h.progress("contours", 0.85);
  if (h.tick) await h.tick();
  const levels = terrainLevels(seaLevel, TERRAIN_BANDS);
  const contours = n ? buildContours(grid, frameW, levels) : [];

  /* -- bookkeeping ------------------------------------------------------- */
  const tally = new Map();
  for (let i = 0; i < n; i++) tally.set(nodes[i].folder, (tally.get(nodes[i].folder) || 0) + 1);
  const folders = Array.from(tally.entries())
    .map(function (kv) { return { name: kv[0], count: kv[1] }; })
    .sort(function (a, b) { return b.count - a.count || (a.name < b.name ? -1 : 1); });

  const layoutPositions = {};
  for (let i = 0; i < n; i++) layoutPositions[nodes[i].path] = [layout[i * 2], layout[i * 2 + 1]];

  h.progress("done", 1);
  return {
    counts: {
      files: nAll,
      placed: n,
      isolates: isolates.length,
      links: g.edges.length
    },
    frameW: frameW,
    frameH: FRAME_H,
    marginUsed: margin,
    nodes: nodes,
    edges: g.edges.map(function (e) { return [local.get(e[0]), local.get(e[1])]; })
      .filter(function (e) { return e[0] !== undefined && e[1] !== undefined; }),
    isolates: isolates.map(function (i) {
      const f = g.files[i];
      return { path: f.path, title: f.basename || f.path, folder: f.folder || VAULT_ROOT_KEY };
    }),
    grid: grid,
    seaLevel: seaLevel,
    levels: levels,
    contours: contours,
    peaks: peaks.map(function (p) {
      return {
        x: p.x, y: p.y, val: p.val, anchor: p.anchor,
        name: p.name, numeral: p.numeral, count: p.count
      };
    }),
    folders: folders,
    layoutPositions: layoutPositions,
    hash: hash,
    params: {
      seed: seed,
      bandwidth: bandwidth,
      seaLevel: seaLevel,
      bands: TERRAIN_BANDS,
      minSummitNotes: minNotes,
      mergeDist: PEAK_MERGE_DIST,
      peakFloor: PEAK_FLOOR,
      componentClearance: COMPONENT_CLEARANCE_MAP,
      componentClearanceFrac: clearFrac,
      umap: { a: UMAP_A, b: UMAP_B, minDist: 0.30, spread: 1.0 },
      neighbors: Math.max(NEIGHBOR_K_MIN, Math.min(NEIGHBOR_K_MAX, Math.floor(NEIGHBOR_FACTOR * Math.sqrt(Math.max(n, 1))))),
      warmStart: !!warm,
      exclude: (opt.exclude || []).slice()
    }
  };
}

/** Smallest distance between two notes of different components, in map units.
 *  `cellHint` sets the bin size only — the answer is exact, because the retry
 *  above divides by it and an early-exit estimate would ask for the wrong
 *  correction. */
function minCrossComponentDistance(coords, comp, cellHint) {
  const n = coords.length / 2;
  const cell = Math.max(cellHint, 1e-6);
  const bins = new Map();
  for (let i = 0; i < n; i++) {
    const k = Math.floor(coords[i * 2] / cell) + "," + Math.floor(coords[i * 2 + 1] / cell);
    let arr = bins.get(k);
    if (!arr) { arr = []; bins.set(k, arr); }
    arr.push(i);
  }
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(coords[i * 2] / cell), cy = Math.floor(coords[i * 2 + 1] / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = bins.get((cx + dx) + "," + (cy + dy));
        if (!arr) continue;
        for (let t = 0; t < arr.length; t++) {
          const j = arr[t];
          if (j <= i || comp[j] === comp[i]) continue;
          const d = Math.hypot(coords[i * 2] - coords[j * 2], coords[i * 2 + 1] - coords[j * 2 + 1]);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
}

/* ----------------------------------------------------------------------
 * 2h. Label placement
 *
 * Separate from computeMap because type stays a CONSTANT SIZE on screen:
 * the map scales with the pane, the labels do not, so every resize and every
 * zoom is a different placement problem over the same geography.  Zooming in
 * also shrinks the viewport, which means more points per map unit, which
 * means more notes can be named — so the view simply re-runs this.
 *
 * Two tiers, in this order:
 *
 *  1. SUMMITS, by score rather than by first fit.  Eight directions at each
 *     of six absolute ring distances beyond the anchor's own marker.  Hard:
 *     inside the visible area, and clear of the summit labels already placed.
 *     Scored on the dot ink buried, on how ambiguously the box sits between
 *     its own hill and the nearest other summit, and on distance and
 *     direction.  A summit name is never dropped.
 *  2. MINOR labels, italic.  Must-name (one per islet, plus the heaviest
 *     non-anchor dots) are placed first and always printed; may-name are
 *     dropped when nothing on their ladder is clean.  Three things are HARD:
 *     inside the area, clear of every other label, and touching no dot but
 *     their own.  A label that had to reach far gets a hairline leader back
 *     to its dot, which may itself cross neither a label nor a heavy dot.
 *
 * The hard no-touch rule is the lesson of an earlier round: scored rather
 * than forbidden, twenty of thirty-one italic labels had a dot drawn over
 * them and "Marginalia" printed as "Margiñalia".  A dot on a letter is not a
 * small loss, it is a misspelling.
 * ------------------------------------------------------------------- */

function boxesOverlap(a, b, pad) {
  pad = pad || 0;
  return !(a[2] + pad < b[0] || b[2] + pad < a[0] || a[3] + pad < b[1] || b[3] + pad < a[1]);
}

function growBox(b, m) { return [b[0] - m, b[1] - m, b[2] + m, b[3] + m]; }

/** Liang-Barsky: does the segment meet the axis-aligned box? */
function segBoxHit(seg, box) {
  const x0 = seg[0], y0 = seg[1];
  const dx = seg[2] - x0, dy = seg[3] - y0;
  let t0 = 0, t1 = 1;
  const clip = [[-dx, x0 - box[0]], [dx, box[2] - x0], [-dy, y0 - box[1]], [dy, box[3] - y0]];
  for (let i = 0; i < 4; i++) {
    const p = clip[i][0], q = clip[i][1];
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 <= t1;
}

function segPointDist2(seg, px, py) {
  const dx = seg[2] - seg[0], dy = seg[3] - seg[1];
  const span = dx * dx + dy * dy;
  let t = span > 0 ? ((px - seg[0]) * dx + (py - seg[1]) * dy) / span : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const ex = px - (seg[0] + t * dx), ey = py - (seg[1] + t * dy);
  return ex * ex + ey * ey;
}

function boxDistance(box, px, py) {
  const dx = px - clamp(px, box[0], box[2]);
  const dy = py - clamp(py, box[1], box[3]);
  return Math.hypot(dx, dy);
}

/** Candidate boxes for a label of size (w, h) around the dot at (x0, y0).
 *  N and S are centred over the dot, E and W set flush against it, and the
 *  diagonals offset on both axes at 0.8 of the radial distance, which lands
 *  their inner corner about where a cardinal box's inner edge would be. */
function labelBoxes(x0, y0, off, w, h) {
  const d = off * 0.8;
  const centres = {
    E: [x0 + off + w / 2, y0],
    W: [x0 - off - w / 2, y0],
    N: [x0, y0 + off + h / 2],
    S: [x0, y0 - off - h / 2],
    NE: [x0 + d + w / 2, y0 + d + h / 2],
    NW: [x0 - d - w / 2, y0 + d + h / 2],
    SE: [x0 + d + w / 2, y0 - d - h / 2],
    SW: [x0 - d - w / 2, y0 - d - h / 2]
  };
  return LABEL_ORDER.map(function (name) {
    const c = centres[name];
    return [name, [c[0] - w / 2, c[1] - h / 2, c[0] + w / 2, c[1] + h / 2]];
  });
}

/**
 * How much a candidate box risks being read as naming something else.
 *
 * `own` is the point the label names, `others` the rivals it must not be
 * mistaken for.  If the nearest rival is not at least `ratio` times as far
 * away as the label's own point, the penalty ramps up to `nearPenalty`; a
 * smaller term adds up to `towardPenalty` for an offset that simply points at
 * that rival.  `edge` measures from the nearest point of the box rather than
 * from its centre: a summit name is read as a whole, but an italic minor name
 * is read as attached to whatever dot it nearly touches, and its box is many
 * times longer than the gap between neighbouring dots.
 */
function ambiguity(box, own, others, ratio, nearPenalty, towardPenalty, edge) {
  const cx = 0.5 * (box[0] + box[2]), cy = 0.5 * (box[1] + box[3]);
  const dOwn = edge ? boxDistance(box, own[0], own[1]) : Math.hypot(cx - own[0], cy - own[1]);
  if (!others || others.length === 0) return [0, dOwn, Infinity];
  let j = 0, dOther = Infinity;
  for (let k = 0; k < others.length; k++) {
    const d = edge ? boxDistance(box, others[k][0], others[k][1])
      : Math.hypot(others[k][0] - cx, others[k][1] - cy);
    if (d < dOther) { dOther = d; j = k; }
  }
  let penalty = 0;
  if (dOther < ratio * dOwn && ratio * dOwn > 0) {
    penalty += nearPenalty * (ratio * dOwn - dOther) / (ratio * dOwn);
  }
  const ox = cx - own[0], oy = cy - own[1];
  const rx = others[j][0] - own[0], ry = others[j][1] - own[1];
  const span = Math.hypot(ox, oy) * Math.hypot(rx, ry);
  if (towardPenalty && span > 0) {
    const cos = (ox * rx + oy * ry) / span;
    if (cos > 0) penalty += towardPenalty * cos;
  }
  return [penalty, dOwn, dOther];
}

/** Uniform-grid index over the dots, so a box/disc query costs a handful of
 *  cells instead of a sweep of every note on the map. */
function buildDotIndex(xs, ys, maxRad) {
  const cell = Math.max(maxRad * 2, 1e-4);
  const bins = new Map();
  for (let i = 0; i < xs.length; i++) {
    const k = Math.floor(xs[i] / cell) + "," + Math.floor(ys[i] / cell);
    let arr = bins.get(k);
    if (!arr) { arr = []; bins.set(k, arr); }
    arr.push(i);
  }
  return function (x0, y0, x1, y1) {
    const c0 = Math.floor((x0 - maxRad) / cell), c1 = Math.floor((x1 + maxRad) / cell);
    const r0 = Math.floor((y0 - maxRad) / cell), r1 = Math.floor((y1 + maxRad) / cell);
    const out = [];
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) {
        const arr = bins.get(c + "," + r);
        if (arr) for (let t = 0; t < arr.length; t++) out.push(arr[t]);
      }
    }
    return out;
  };
}

function placeLabels(model, measurer, opts) {
  opts = opts || {};
  const sheetWidthPt = opts.sheetWidthPt || REFERENCE_SHEET_PT;
  const vp = opts.viewport || { x: 0, y: 0, w: model.frameW, h: model.frameH };
  const maxMinor = opts.maxMinor === undefined ? MINOR_SECONDARY_COUNT : opts.maxMinor;
  const M = vp.w / sheetWidthPt;             // map units per point
  const P = function (pt) { return pt * M; };
  // One scale for the whole drawing.  `opts.scale` exists so a caller that has
  // already decided (the view, which draws the marks itself) cannot disagree
  // with the placer about how big the sheet's marks are.
  const s = opts.scale > 0 ? opts.scale
    : designScale(opts.designWidthPt > 0 ? opts.designWidthPt : sheetWidthPt);
  const D = function (pt) { return pt * s * M; };   // design points -> map units
  // The compact presentation is a smaller-scale map, not a smaller window on
  // the same one: its type has its own floor, its summits are set name-only in
  // small capitals, and its tiers fade rather than being drawn illegibly.
  const compact = !!opts.compact;
  const zoom = opts.zoom > 0 ? opts.zoom : (model.frameW / Math.max(vp.w, 1e-9));
  // The sheet's SCALE, as opposed to its horizontal extent.  Turning the sheet
  // does not make the map smaller, so the design decisions that follow from
  // the scale — the type size, the tier thresholds, the label budget, the
  // number of bands — are taken from the drawn length of the frame's long
  // axis, which is the same number whichever way round the paper is.  Only the
  // GEOMETRY uses the true width.
  const designWidthPt = opts.designWidthPt > 0 ? opts.designWidthPt : sheetWidthPt;
  const tiers = opts.tiers || labelTiers(designWidthPt * zoom, opts.textFadeThreshold || 0);
  const dots = opts.dots || dotSizing(model, s, designWidthPt, compact);
  const summitPt = compact ? Math.max(SUMMIT_PT * s, COMPACT_TYPE_MIN_PT)
    : Math.max(SUMMIT_PT * s, SUMMIT_MIN_PT);
  const minorPt = compact ? Math.max(MINOR_PT * s, COMPACT_TYPE_MIN_PT)
    : Math.max(MINOR_PT * s, MINOR_MIN_PT);
  const summitTracking = compact ? COMPACT_SUMMIT_TRACKING_EM : SUMMIT_TRACKING_EM;
  const summitRings = compact ? COMPACT_SUMMIT_RINGS_PT.slice()
    : SUMMIT_RINGS_PT.map(function (r) { return r * s; });
  const minorRings = MINOR_RINGS_PT.map(function (r) { return r * s; });
  const minorLeaderRing = MINOR_LEADER_RING_PT * s;

  const nodes = model.nodes;
  const n = nodes.length;
  const xs = new Float64Array(n), ys = new Float64Array(n), deg = new Int32Array(n);
  const areas = new Float64Array(n), rad = new Float64Array(n), radRing = new Float64Array(n);
  let maxRadRing = 0;
  for (let i = 0; i < n; i++) {
    xs[i] = nodes[i].x; ys[i] = nodes[i].y; deg[i] = nodes[i].deg;
    // Area is proportional to the degree and to s^2 together, which is the
    // same statement as "the radius is scaled": the dot-area law survives.
    areas[i] = degreeArea(deg[i]) * s * s;
    // Flannery's floor and ceiling: the drawn radius, not the law's radius.
    // The placer has to keep clear of the disc the reader sees.
    rad[i] = P(dotRadiusPt(deg[i], s, dots));
    radRing[i] = rad[i] + D(DOT_RING_PT);
    if (radRing[i] > maxRadRing) maxRadRing = radRing[i];
  }
  const query = buildDotIndex(xs, ys, maxRadRing);

  const halo = D(HALO_LW_PT / 2);
  const pad = D(LABEL_PAD_PT);
  const dotPad = D(DOT_PAD_PT);
  const summitPad = D(SUMMIT_DOT_PAD_PT);
  const gap = D(SUMMIT_GAP_PT);
  const summitClear = Math.max(pad, P(Math.max(SUMMIT_CLEAR_PT * s, SUMMIT_CLEAR_MIN_PT)));
  const inset = 0.02 * (vp.h / FRAME_H);
  const area = [vp.x + inset, vp.y + inset, vp.x + vp.w - inset, vp.y + vp.h - inset];

  const inArea = function (box) {
    return box[0] >= area[0] && box[2] <= area[2] && box[1] >= area[1] && box[3] <= area[3];
  };
  const fitsPad = function (box, obstacles, padV) {
    if (!inArea(box)) return false;
    for (let k = 0; k < obstacles.length; k++) if (boxesOverlap(box, obstacles[k], padV)) return false;
    return true;
  };
  const fits = function (box, obstacles) { return fitsPad(box, obstacles, pad); };
  /** What the halo'd box draws over, counting the bare markers. */
  const buried = function (box, exclude) {
    const b = [box[0] - halo, box[1] - halo, box[2] + halo, box[3] + halo];
    const cand = query(b[0], b[1], b[2], b[3]);
    let count = 0, ink = 0;
    for (let t = 0; t < cand.length; t++) {
      const i = cand[t];
      if (i === exclude) continue;
      const dx = xs[i] - clamp(xs[i], b[0], b[2]), dy = ys[i] - clamp(ys[i], b[1], b[3]);
      if (dx * dx + dy * dy <= rad[i] * rad[i]) { count++; ink += areas[i]; }
    }
    return [count, ink];
  };
  /** ...and which dot DISCS, paper ring included, it meets. */
  const touched = function (box, exclude) {
    const b = [box[0] - halo, box[1] - halo, box[2] + halo, box[3] + halo];
    const cand = query(b[0], b[1], b[2], b[3]);
    const hits = [];
    for (let t = 0; t < cand.length; t++) {
      const i = cand[t];
      if (i === exclude) continue;
      const dx = xs[i] - clamp(xs[i], b[0], b[2]), dy = ys[i] - clamp(ys[i], b[1], b[3]);
      if (dx * dx + dy * dy <= radRing[i] * radRing[i]) hits.push(i);
    }
    return hits;
  };

  const measure = function (text, sizePt, italic, trackingEm) {
    const m = measurer(text, { sizePt: sizePt, italic: !!italic, trackingEm: trackingEm || 0 });
    // CSS letter-spacing puts its space after EVERY character, the last one
    // included, and the renderer sets the tracking that way — so a tracked
    // summit name is drawn one tracking unit wider than any measurer reports.
    // The placer has to plan for the word that will be drawn, not the word it
    // measured: without this a summit name ran a fifth of a millimetre into
    // whatever stood to its right, which the DOM audit sees and the placer's
    // own self-check never could.
    const trail = (trackingEm || 0) * sizePt;
    return { w: P(m.width + trail), asc: P(m.ascent), desc: P(m.descent) };
  };
  const baselineOf = function (box, desc) { return box[1] - desc; };

  const labels = [];
  const occupied = [];
  const summitBoxes = [];
  const forced = new Set();
  const dropped = [];

  /** Is this point at sea?  A summit name with nowhere on its own hill to
   *  stand may go out over the water, on a leader — open paper is the one
   *  place a name is certain to cover nothing.  The grid belongs to the
   *  UPRIGHT model, so a rotated sheet asks it through the inverse turn. */
  const gridFrameW = model.rotated ? model.uprightFrameW : model.frameW;
  const heightAt = function (mx, my) {
    const g = model.grid;
    if (!g || !g.z || !g.z.length) return 1;
    let ux = mx, uy = my;
    if (model.rotated) { const p = unrotatePoint(mx, my, gridFrameW); ux = p[0]; uy = p[1]; }
    const gx = Math.round(clamp(ux / gridFrameW * (g.nx - 1), 0, g.nx - 1));
    const gy = Math.round(clamp(uy / FRAME_H * (g.ny - 1), 0, g.ny - 1));
    return g.z[gy * g.nx + gx];
  };
  const atSea = function (box) {
    return heightAt(0.5 * (box[0] + box[2]), 0.5 * (box[1] + box[3])) < model.seaLevel;
  };

  /* -- leaders, shared by both tiers -------------------------------------- *
   * A leader is a hairline from a dot's edge to the word that names it.  Both
   * tiers draw them in compact mode — a summit name out over the water is
   * only a name if the line says whose it is — so the geometry and its cost
   * live above the first tier that needs them. */
  const placedLeaders = [];

  const leaderSeg = function (cx, cy, r, box, direction, baseline) {
    let tx, ty;
    if (direction === "N" || direction === "S") {
      tx = 0.5 * (box[0] + box[2]);
      ty = direction === "N" ? box[1] : box[3];
    } else {
      tx = cx <= 0.5 * (box[0] + box[2]) ? box[0] : box[2];
      ty = baseline;
    }
    const vx = tx - cx, vy = ty - cy;
    const span = Math.hypot(vx, vy);
    if (span <= r) return null;
    return [cx + vx / span * r, cy + vy / span * r, tx, ty];
  };
  const leaderFor = function (i, box, direction, baseline) {
    return leaderSeg(xs[i], ys[i], radRing[i], box, direction, baseline);
  };
  /** null when the leader is not allowed, else the speck-ink it crosses.
   *  Passing through another label's HALO-inclusive box, or through a dot
   *  heavy enough to be looked at in its own right, would make the line the
   *  clutter it exists to prevent. */
  const leaderCost = function (i, seg, boxes) {
    for (let k = 0; k < boxes.length; k++) if (segBoxHit(seg, growBox(boxes[k], halo))) return null;
    const x0 = Math.min(seg[0], seg[2]), x1 = Math.max(seg[0], seg[2]);
    const y0 = Math.min(seg[1], seg[3]), y1 = Math.max(seg[1], seg[3]);
    const cand = query(x0, y0, x1, y1);
    let ink = 0;
    for (let t = 0; t < cand.length; t++) {
      const j = cand[t];
      if (j === i) continue;
      if (segPointDist2(seg, xs[j], ys[j]) <= radRing[j] * radRing[j]) {
        if (deg[j] >= MINOR_HEAVY_DEG) return null;
        ink += areas[j];
      }
    }
    return ink;
  };

  /* -- tier one: summits -------------------------------------------------- */
  const visiblePeaks = [];
  for (let p = 0; p < model.peaks.length; p++) {
    const pk = model.peaks[p];
    const ax = pk.anchor === null ? pk.x : xs[pk.anchor];
    const ay = pk.anchor === null ? pk.y : ys[pk.anchor];
    if (ax < vp.x || ax > vp.x + vp.w || ay < vp.y || ay > vp.y + vp.h) continue;
    visiblePeaks.push({
      index: p, peak: pk, x: ax, y: ay,
      baseOff: (pk.anchor === null ? D(4.0) : rad[pk.anchor]) + summitPad
    });
  }

  // The tiny numerals a compact sheet sets beside a dot whose name had to move
  // away, or was too small to set at all.  They are placed AFTER every summit
  // name, so a numeral can never be the reason a name falls back.
  const numeralQueue = [];
  // A ring is recorded in SHEET points (the design ladder times the scale), and
  // the threshold is a sheet measure too: fourteen points of paper is the gap
  // at which the eye stops reading a word as attached to the dot beside it.
  // Comparing it against a map-unit distance made every name "displaced" and
  // gave the sheet six numerals it did not need.
  const summitLeaderMin = COMPACT_SUMMIT_LEADER_PT;

  for (let si = 0; si < visiblePeaks.length; si++) {
    const sp = visiblePeaks[si];
    const rivals = visiblePeaks.filter(function (o, k) { return k !== si; })
      .map(function (o) { return [o.x, o.y]; });
    const num = sp.peak.numeral;
    const text = String(sp.peak.name || "").toUpperCase();
    const mLab = measure(text, summitPt, false, summitTracking);
    const mNum = measure(num, summitPt, false, summitTracking);
    // In compact the summit is its NAME, in small capitals, and nothing else:
    // the numeral doubles the block's width for a token the details list
    // already spells out, and a block twice as wide is a block that has to
    // stand twice as far from the hill it names.
    const height = compact ? (mLab.asc - mLab.desc)
      : Math.max(mLab.asc, mNum.asc) - Math.min(mLab.desc, mNum.desc);
    const desc = compact ? mLab.desc : Math.min(mLab.desc, mNum.desc);
    const block = compact ? mLab.w : mNum.w + gap + mLab.w;
    const nameOffset = compact ? 0 : mNum.w + gap;

    if (compact && !tiers.placeName) {
      // Below the name threshold a summit is its numeral alone — the mark the
      // reader can still resolve, with the details list to spell it out.
      numeralQueue.push({ sp: sp, why: "faded" });
      continue;
    }

    /** How many discs a summit name would cover that the reader is meant to
     *  be able to look at.  Zero is a hard requirement whenever any candidate
     *  reaches zero; when none does, the least-bad one is printed and said to
     *  be a fallback, because a summit is never nameless. */
    const heavyCovered = function (box) {
      const hits = touched(box, null);
      let k = 0;
      for (let t = 0; t < hits.length; t++) if (deg[hits[t]] >= SUMMIT_COVER_MIN_DEG) k++;
      return k;
    };

    let best = null;        // cheapest candidate covering no meaningful dot
    let leastBad = null;    // ...and the cleanest of the rest
    const anchorIdx = sp.peak.anchor === null ? -1 : sp.peak.anchor;
    for (let ri = 0; ri < summitRings.length; ri++) {
      // Compact: the name stays beside its hill or it is not a name.
      if (compact && summitRings[ri] > COMPACT_SUMMIT_RING_MAX_PT) break;
      const off = sp.baseOff + P(summitRings[ri]);
      const cands = labelBoxes(sp.x, sp.y, off, block, height);
      for (let di = 0; di < cands.length; di++) {
        const box = cands[di][1];
        if (!fitsPad(box, summitBoxes, summitClear)) continue;
        const bu = buried(box, null);
        const amb = ambiguity(box, [sp.x, sp.y], rivals, SUMMIT_AMBIG_RATIO,
          SUMMIT_AMBIG_PENALTY, SUMMIT_TOWARD_PENALTY, false);
        // Compact: ambiguity is HARD once the name has left its dot.  A far
        // rung's penalty is a few hundred against a score the distance term
        // never catches up with, so the soft rule let a name walk to another
        // summit's hill and sit there.  A name still TOUCHING its own dot is
        // not ambiguous whatever the arithmetic says — it is attached, and on
        // a crowded frame the neighbouring hill is always within a ratio of
        // something — so the hard rule starts where the attachment ends, at
        // the same fourteen points that call for a leader.
        // Compact: a displaced name MUST carry a feasible leader.  A candidate
        // whose leader would cross a label or a heavy dot is not a candidate
        // that merely loses its leader — it is not a candidate.
        let seg = null;
        if (compact && summitRings[ri] >= COMPACT_SUMMIT_LEADER_PT) {
          if (amb[2] < COMPACT_SUMMIT_AMBIG_HARD_RATIO * amb[1]) continue;
          seg = leaderSeg(sp.x, sp.y, sp.baseOff, box, cands[di][0], baselineOf(box, desc));
          if (seg === null) continue;
          if (leaderCost(anchorIdx, seg, occupied) === null) continue;
        }
        const score = bu[1] + amb[0] + SUMMIT_DIST_PENALTY * summitRings[ri] +
          SUMMIT_DIR_PENALTY * di + (compact && !atSea(box) ? SUMMIT_LAND_PENALTY : 0);
        const covered = heavyCovered(box);
        const rec = { key: [score, ri, di], box: box, direction: cands[di][0],
          ring: summitRings[ri], count: bu[0], ink: bu[1], covered: covered,
          leader: seg, dOwn: amb[1], dOther: amb[2] };
        const badKey = [covered, score, ri, di];
        if (leastBad === null || lexLess(badKey, leastBad.badKey)) {
          leastBad = Object.assign({ badKey: badKey }, rec);
        }
        if (covered > 0) continue;            // HARD: no meaningful dot is hidden
        if (best === null || lexLess(rec.key, best.key)) best = rec;
      }
    }
    // (The separate sea ladder is gone: its rungs all stood beyond the cap
    // above, so a name that reached the water reached it by leaving its hill.
    // Open water is now a tie-breaker inside the ladder instead — a candidate
    // over the sea covers nothing, and the score says so.)
    const seaLeader = best === null ? null : best.leader;

    let summitFallback = false;
    if (compact && best === null) {
      // Nothing on the hill and nothing at sea.  A name that must cross its
      // own dots says less than the numeral beside them does, so the compact
      // sheet prints the numeral alone and the details list carries the name.
      // This is the one place the "a summit is never nameless" rule is
      // traded, and it is traded for the rule it was protecting.
      numeralQueue.push({ sp: sp, why: "no clean candidate" });
      dropped.push({ note: sp.peak.anchor, peak: sp.index, deg: 0,
        why: "summit name: no candidate clears the dots; numeral only" });
      continue;
    }
    if (best === null && leastBad !== null) {
      // Every candidate on the ladder hides a dot worth looking at.  The name
      // is printed on the least-bad one and declared, because a silently
      // broken invariant is how the invariant rots.
      best = leastBad;
      summitFallback = true;
    }
    if (best === null) {
      // Nowhere inside the sheet clears the summits already placed.  A summit
      // name is never dropped, so it takes its first candidate and the
      // self-check is told to excuse it.
      const first = labelBoxes(sp.x, sp.y, sp.baseOff, block, height)[0];
      const bu = buried(first[1], null);
      best = { key: null, box: first[1], direction: first[0], ring: 0, count: bu[0],
        ink: bu[1], covered: heavyCovered(first[1]) };
      summitFallback = true;
      forced.add(labels.length);
    }
    const rec = {
      tier: "summit",
      text: text,
      numeral: compact ? null : num,
      note: sp.peak.anchor,
      peak: sp.index,
      anchor: [sp.x, sp.y],
      x: best.box[0] + nameOffset,
      numeralX: compact ? null : best.box[0],
      y: baselineOf(best.box, desc),
      sizePt: summitPt,
      trackingEm: summitTracking,
      italic: false,
      bbox: best.box,
      direction: best.direction,
      ringPt: best.ring,
      dotsCovered: best.count,
      dotAreaCovered: best.ink,
      heavyCovered: best.covered,
      forced: best.key === null,
      fallback: summitFallback || undefined
    };
    // A compact name that had to move off its dot carries the leader the
    // search already proved feasible — the candidate would have been refused
    // without it — and a numeral beside the dot, so the hill is never left
    // saying nothing.  `seaLeader` is that proven segment.
    if (compact && best.ring >= summitLeaderMin) {
      if (seaLeader !== null) { rec.leader = seaLeader; placedLeaders.push(seaLeader); }
      numeralQueue.push({ sp: sp, why: "displaced" });
    }
    rec.dOwn = best.dOwn;
    rec.dOther = best.dOther;
    labels.push(rec);
    occupied.push(best.box);
    summitBoxes.push(best.box);
  }

  /* -- the compact sheet's tiny numerals ---------------------------------- *
   * Lowest priority inside the summit tier and higher than every minor name:
   * a numeral may never move a name, and a name may never be dropped for a
   * numeral. */
  const numeralPt = Math.max(summitPt * 0.8, COMPACT_TYPE_MIN_PT);
  // The placer measures INK — canvas ascent and descent — but the browser
  // reserves the font's em box, which for two roman capitals with no
  // descender stands about a third of the body proud below the letters.  A
  // numeral is short enough that the difference is most of it, and a speck
  // sitting in that overhang reads as touching the mark.  So the dot test is
  // run against the box the font will reserve, not the box we measured.
  const numeralSlack = P(numeralPt * 0.3);
  for (let q = 0; q < numeralQueue.length; q++) {
    const sp = numeralQueue[q].sp;
    const mN = measure(sp.peak.numeral, numeralPt, false, 0);
    const h = mN.asc - mN.desc;
    let put = null, putLeastBad = null;
    const numAnchor = sp.peak.anchor === null ? -1 : sp.peak.anchor;
    for (let ri = 0; ri < NUMERAL_RINGS_PT.length && put === null; ri++) {
      const ringPt = NUMERAL_RINGS_PT[ri];
      const off = sp.baseOff + P(ringPt);
      const cands = labelBoxes(sp.x, sp.y, off, mN.w, h);
      for (let di = 0; di < cands.length; di++) {
        const box = cands[di][1];
        if (!fits(box, occupied)) continue;
        // A numeral sits where its own summit's leader leaves the dot, so the
        // leaders are an obstacle to it exactly as the labels are — including
        // the leader of the very name this numeral belongs to.  This is a HARD
        // rule, so it is tested before the least-bad candidate is remembered:
        // a mark with a hairline through it is worse than no mark.
        let crossed = false;
        for (let k = 0; k < placedLeaders.length; k++) {
          if (segBoxHit(placedLeaders[k], growBox(box, halo))) { crossed = true; break; }
        }
        if (crossed) continue;
        // Past a few points from the dot the numeral needs a hairline of its
        // own, and a numeral whose hairline is infeasible is not a numeral
        // that merely loses it.
        let nSeg = null;
        if (ringPt >= NUMERAL_LEADER_PT) {
          nSeg = leaderSeg(sp.x, sp.y, sp.baseOff, box, cands[di][0], baselineOf(box, mN.desc));
          if (nSeg === null) continue;
          if (leaderCost(numAnchor, nSeg, occupied) === null) continue;
        }
        const over = touched(growBox(box, numeralSlack), sp.peak.anchor);
        if (over.length) {
          // Remember the least bad, in case nothing on any rung is clean: a
          // numeral over one speck beats a numeral over five.
          let ink = 0;
          for (let t = 0; t < over.length; t++) ink += areas[over[t]];
          const key = [over.length, ink, ri, di];
          if (putLeastBad === null || lexLess(key, putLeastBad.key)) {
            putLeastBad = { key: key, box: box, direction: cands[di][0],
              ring: ringPt, leader: nSeg, forced: true };
          }
          continue;
        }
        put = { box: box, direction: cands[di][0], ring: ringPt, leader: nSeg };
        break;
      }
    }
    if (put === null) {
      // On the narrowest sheets even a two-glyph mark has nowhere clean to
      // stand.  A numeral is the LAST thing the map says about a hill — drop
      // it and the summit is anonymous and the details list points at
      // nothing — so it is set at the dot's edge and the self-check is told,
      // exactly as a forced summit name is.
      if (putLeastBad !== null) {
        put = putLeastBad;
      } else {
        const first = labelBoxes(sp.x, sp.y, sp.baseOff, mN.w, h)[0];
        put = { box: first[1], direction: first[0], ring: 0, forced: true };
      }
      forced.add(labels.length);
    }
    labels.push({
      tier: "numeral",
      text: sp.peak.numeral,
      numeral: sp.peak.numeral,
      note: sp.peak.anchor,
      peak: sp.index,
      anchor: [sp.x, sp.y],
      x: put.box[0],
      numeralX: put.box[0],
      y: baselineOf(put.box, mN.desc),
      sizePt: numeralPt,
      trackingEm: 0,
      italic: false,
      bbox: put.box,
      direction: put.direction,
      ringPt: put.ring,
      dotsCovered: 0,
      dotAreaCovered: 0,
      forced: !!put.forced,
      leader: put.leader || undefined,
      numeralOnly: numeralQueue[q].why !== "displaced"
    });
    if (put.leader) placedLeaders.push(put.leader);
    occupied.push(put.box);
  }

  /* -- tier two: islets, then the most connected notes -------------------- */
  const anchorNotes = new Set();
  for (let p = 0; p < model.peaks.length; p++) {
    if (model.peaks[p].anchor !== null) anchorNotes.add(model.peaks[p].anchor);
  }
  const summitTitles = new Set(model.peaks.map(function (p) { return String(p.name || "").trim().toLowerCase(); }));

  const visible = function (i) {
    return xs[i] >= vp.x && xs[i] <= vp.x + vp.w && ys[i] >= vp.y && ys[i] <= vp.y + vp.h;
  };
  const ranked = [];
  for (let i = 0; i < n; i++) ranked.push(i);
  ranked.sort(function (a, b) {
    return deg[b] - deg[a] || (nodes[a].path < nodes[b].path ? -1 : nodes[a].path > nodes[b].path ? 1 : 0);
  });
  const tail = ranked.filter(function (i) {
    return !anchorNotes.has(i) && !summitTitles.has(nodes[i].title.trim().toLowerCase()) && visible(i);
  });

  // An unnamed island is the one thing on a map that cannot be looked up, so
  // every islet big enough to draw its own closed coast gets a name.
  const byComponent = new Map();
  for (let i = 0; i < n; i++) {
    const c = nodes[i].component;
    if (c === 0) continue;
    if (!byComponent.has(c)) byComponent.set(c, []);
    byComponent.get(c).push(i);
  }
  const islets = Array.from(byComponent.entries())
    .filter(function (kv) { return kv[1].length >= ISLET_MIN_NOTES; })
    .sort(function (a, b) { return b[1].length - a[1].length || a[0] - b[0]; })
    .slice(0, ISLET_MAX_NAMED)
    .map(function (kv) {
      const g = kv[1].slice().sort(function (a, b) {
        return deg[b] - deg[a] || (nodes[a].path < nodes[b].path ? -1 : 1);
      });
      return g[0];
    })
    .filter(function (i) { return !anchorNotes.has(i) && visible(i); });

  const must = [];
  for (const i of islets) if (!must.includes(i)) must.push(i);
  for (const i of tail.slice(0, MINOR_MUST_NAME)) if (!must.includes(i)) must.push(i);
  const neverDrop = new Set(must);

  const candidates = [];
  for (const i of must) if (!candidates.includes(i)) candidates.push(i);
  for (const i of tail.slice(0, maxMinor)) if (!candidates.includes(i)) candidates.push(i);

  const heavy = [];
  for (let i = 0; i < n; i++) if (deg[i] >= MINOR_HEAVY_DEG) heavy.push(i);

  const fallbacks = [];
  // Töpfer's law decides how many minor names this sheet may carry; the fade
  // decides whether it may carry any at all.  An unzoomed sidebar places none
  // — and a pinch that widens the effective sheet brings them in, which is
  // exactly the graph view's behaviour the reader already knows.
  const minorCount = tiers.placeMinor ? candidates.length : 0;
  for (let ci = 0; ci < minorCount; ci++) {
    const i = candidates[ci];
    const title = String(nodes[i].title || "").trim();
    if (!title) { dropped.push({ note: i, deg: deg[i], why: "no drawable characters" }); continue; }
    const m = measure(title, minorPt, true, 0);
    const height = m.asc - m.desc;
    const baseOff = rad[i] + dotPad;
    const rivals = [];
    for (let k = 0; k < heavy.length; k++) if (heavy[k] !== i) rivals.push([xs[heavy[k]], ys[heavy[k]]]);

    let best = null;      // cheapest candidate that touches no foreign dot
    let dirtiest = null;  // ...and the cleanest of the rest, for a fallback
    for (let ri = 0; ri < minorRings.length; ri++) {
      const off = baseOff + P(minorRings[ri]);
      const cands = labelBoxes(xs[i], ys[i], off, m.w, height);
      for (let di = 0; di < cands.length; di++) {
        const box = cands[di][1];
        if (!fits(box, occupied)) continue;
        // Leaders are placed in the same order as labels, so the constraint
        // is enforced from both ends: an earlier leader may not be crossed by
        // a later label's box either.
        let blocked = false;
        for (let k = 0; k < placedLeaders.length; k++) {
          if (segBoxHit(placedLeaders[k], growBox(box, halo))) { blocked = true; break; }
        }
        if (blocked) continue;
        const hits = touched(box, i);
        let ink = 0;
        for (let k = 0; k < hits.length; k++) ink += areas[hits[k]];
        const baseline = baselineOf(box, m.desc);
        const seg = minorRings[ri] >= minorLeaderRing
          ? leaderFor(i, box, cands[di][0], baseline) : null;

        const fkey = [ink, hits.length, ri, di];
        if (dirtiest === null || lexLess(fkey, dirtiest.key)) {
          dirtiest = { key: fkey, box: box, direction: cands[di][0], ring: minorRings[ri],
            count: hits.length, ink: ink, seg: seg, baseline: baseline };
        }
        if (hits.length) continue;             // HARD: no dot may touch a label
        let crossed = 0;
        if (seg !== null) {
          crossed = leaderCost(i, seg, occupied);
          if (crossed === null) continue;      // the leader would be the mess
        }
        const amb = ambiguity(box, [xs[i], ys[i]], rivals, MINOR_AMBIG_RATIO,
          MINOR_AMBIG_PENALTY, 0, true);
        const score = amb[0] + crossed + MINOR_DIST_PENALTY * minorRings[ri] + MINOR_DIR_PENALTY * di;
        const key = [score, ri, di];
        if (best === null || lexLess(key, best.key)) {
          best = { key: key, box: box, direction: cands[di][0], ring: minorRings[ri],
            count: 0, ink: 0, seg: seg, baseline: baseline };
        }
      }
    }

    let fallback = false;
    if (best === null) {
      if (!neverDrop.has(i) || dirtiest === null) {
        dropped.push({ note: i, deg: deg[i], why: "no candidate clears every dot" });
        continue;
      }
      // Must-name, and nowhere on the ladder is clean.  Legible type over a
      // dot beats a heavy dot with no name at all, so the least dirty
      // candidate is printed and declared as a fallback.
      best = dirtiest;
      fallback = true;
      fallbacks.push(i);
    }
    let seg = best.seg;
    if (fallback && seg !== null && leaderCost(i, seg, occupied) === null) seg = null;
    const rec = {
      tier: "minor",
      text: title,
      numeral: null,
      note: i,
      peak: null,
      anchor: [xs[i], ys[i]],
      x: best.box[0],
      numeralX: null,
      y: best.baseline,
      sizePt: minorPt,
      trackingEm: 0,
      italic: true,
      bbox: best.box,
      direction: best.direction,
      ringPt: best.ring,
      dotsCovered: best.count,
      dotAreaCovered: best.ink,
      mustName: neverDrop.has(i)
    };
    if (seg !== null) { rec.leader = seg; placedLeaders.push(seg); }
    if (fallback) rec.fallback = true;
    labels.push(rec);
    occupied.push(best.box);
  }

  const leaders = labels.filter(function (l) { return l.leader; })
    .map(function (l) { return { note: l.note, seg: l.leader }; });
  const maskPad = D(CONTOUR_MASK_PAD_PT);
  const masks = labels.map(function (l) { return growBox(l.bbox, maskPad); });

  checkPlacement(labels, touched, halo, forced, deg, summitClear);
  return { labels: labels, leaders: leaders, masks: masks, dropped: dropped, fallbacks: fallbacks,
    sheetWidthPt: sheetWidthPt, viewport: vp, mapPerPt: M, scale: s,
    summitPt: summitPt, minorPt: minorPt, summitClear: summitClear,
    compact: compact, tiers: tiers, dots: dots, zoom: zoom, designWidthPt: designWidthPt,
    names: labels.filter(function (l) { return l.tier === "summit"; }).length,
    numeralsOnly: labels.filter(function (l) { return l.tier === "numeral" && l.numeralOnly; }).length };
}

function lexLess(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

/**
 * Assert the invariants the sheet's legibility rests on.  Cheap — a few
 * hundred boxes — and always on, because the bug this guards against was
 * invisible in every number the placer printed: the layout recorded
 * `dotsCovered: 2` and the run reported success.  A violation is a bug in the
 * search, not a bad map, so it is thrown rather than warned about.
 */
function checkPlacement(labels, touched, halo, forced, deg, summitClear) {
  for (let a = 0; a < labels.length; a++) {
    const la = labels[a];
    for (let b = a + 1; b < labels.length; b++) {
      if (forced.has(a) || forced.has(b)) continue;
      const lb = labels[b];
      if (boxesOverlap(la.bbox, lb.bbox, 0)) {
        throw new Error("tufte-map: label boxes overlap: '" + la.text + "' and '" + lb.text + "'");
      }
      // Two summit names that merely miss each other still read as one line.
      if (la.tier === "summit" && lb.tier === "summit" &&
          boxesOverlap(la.bbox, lb.bbox, summitClear)) {
        throw new Error("tufte-map: summit names '" + la.text + "' and '" + lb.text +
          "' are closer than the mutual clearance");
      }
    }
    // A summit name may not cover the disc of a note the reader is meant to
    // look at — unless the placer already said it had nowhere clean to stand.
    if (la.tier === "summit" && !la.fallback && deg) {
      const hits = touched(la.bbox, null);
      for (let k = 0; k < hits.length; k++) {
        if (deg[hits[k]] >= SUMMIT_COVER_MIN_DEG) {
          throw new Error("tufte-map: summit name '" + la.text + "' covers dot " + hits[k] +
            " (" + deg[hits[k]] + " links)");
        }
      }
    }
    if (la.tier !== "minor" || la.fallback) continue;
    const hits = touched(la.bbox, la.note);
    if (hits.length) {
      throw new Error("tufte-map: label '" + la.text + "' touches dot(s) " + hits.join(", "));
    }
  }
  for (let a = 0; a < labels.length; a++) {
    const seg = labels[a].leader;
    if (!seg) continue;
    for (let b = 0; b < labels.length; b++) {
      if (b === a) continue;
      if (segBoxHit(seg, growBox(labels[b].bbox, halo))) {
        throw new Error("tufte-map: leader of '" + labels[a].text + "' crosses '" + labels[b].text + "'");
      }
    }
  }
}

/* ----------------------------------------------------------------------
 * 2i. A measurer for headless use
 *
 * The browser backs `measurer` with canvas measureText in the pane's own
 * font, which is the only way the theme's CJK companions and its
 * italic-to-Kaiti rule can be honoured.  Node has no canvas, so the tests use
 * this table of average advances instead: wrong in the third digit, right in
 * the first two, and — more importantly — deterministic.
 * ------------------------------------------------------------------- */
function approximateMeasurer(text, spec) {
  const size = spec.sizePt;
  const italic = !!spec.italic;
  const tracking = spec.trackingEm || 0;
  let em = 0, cjk = false;
  for (const ch of String(text)) {
    const c = ch.codePointAt(0);
    if (ch === " ") { em += 0.25; continue; }
    if (c >= 0x2e80 && c <= 0x9fff || c >= 0xf900 && c <= 0xfaff ||
        c >= 0xff00 && c <= 0xff65 || c >= 0x3000 && c <= 0x303f) { em += 1.0; cjk = true; continue; }
    if (ch >= "0" && ch <= "9") { em += 0.5; continue; }
    if (ch >= "A" && ch <= "Z") { em += 0.66; continue; }
    em += italic ? 0.42 : 0.46;
  }
  const count = Array.from(String(text)).length;
  return {
    width: em * size + tracking * size * Math.max(count - 1, 0),
    ascent: (cjk ? 0.88 : 0.72) * size,
    descent: (cjk ? -0.14 : -0.22) * size
  };
}

/* ----------------------------------------------------------------------
 * 2j. The arithmetic the view is made of
 *
 * Panning, zooming, hit-testing, filtering, folder grouping and the choice of
 * which leaf a click opens a note in are all decisions, and a decision written
 * inside an event handler is a decision no test can reach.  Each one is a
 * function of its inputs here, and the view below is the thin layer that hands
 * them the browser's numbers and does what they say.
 * ------------------------------------------------------------------- */

const ZOOM_MIN = 1.0;
const ZOOM_MAX = 16.0;
const ZOOM_STEP = 1.8;             // one double-click
const HIT_RADIUS_PX = 24;
const FOLDER_MAX_DEPTH = 3;
const FOLDER_MAX_SHARE = 0.60;     // ...at which a depth is still too coarse
const FOLDER_MAX_ROWS = 12;

/**
 * Put a viewport back inside the frame.
 *
 * The viewport always has the frame's own aspect — a sheet that could be
 * letterboxed independently of its frame would need two aspect decisions and
 * the reader would have to hold both — so one number, the zoom, fixes its
 * size, and the position is clamped so no part of the sheet shows blank
 * beyond the frame.
 */
function clampViewport(vp, frameW, frameH, minZoom, maxZoom) {
  const lo = minZoom === undefined ? ZOOM_MIN : minZoom;
  const hi = maxZoom === undefined ? ZOOM_MAX : maxZoom;
  const want = frameW / Math.max(vp && vp.w > 0 ? vp.w : frameW, 1e-9);
  const zoom = clamp(want, lo, hi);
  const w = frameW / zoom, h = frameH / zoom;
  return {
    x: clamp(vp ? vp.x : 0, 0, Math.max(frameW - w, 0)),
    y: clamp(vp ? vp.y : 0, 0, Math.max(frameH - h, 0)),
    w: w, h: h, zoom: zoom
  };
}

/** Zoom by `factor` about a point in map units, which is what makes a wheel
 *  gesture feel attached to the paper under the pointer rather than to the
 *  middle of the pane. */
function zoomViewportAbout(vp, frameW, frameH, factor, ax, ay, minZoom, maxZoom) {
  const cur = clampViewport(vp, frameW, frameH, minZoom, maxZoom);
  const lo = minZoom === undefined ? ZOOM_MIN : minZoom;
  const hi = maxZoom === undefined ? ZOOM_MAX : maxZoom;
  const zoom = clamp(cur.zoom * factor, lo, hi);
  const w = frameW / zoom, h = frameH / zoom;
  const fx = cur.w > 0 ? (ax - cur.x) / cur.w : 0.5;
  const fy = cur.h > 0 ? (ay - cur.y) / cur.h : 0.5;
  return clampViewport({ x: ax - fx * w, y: ay - fy * h, w: w, h: h },
    frameW, frameH, lo, hi);
}

/** Pan by a delta in map units. */
function panViewport(vp, frameW, frameH, dx, dy) {
  const cur = clampViewport(vp, frameW, frameH);
  return clampViewport({ x: cur.x + dx, y: cur.y + dy, w: cur.w, h: cur.h }, frameW, frameH);
}

/**
 * Uniform-grid nearest-point index, in whatever units it is handed — the view
 * hands it SCREEN pixels, because "the nearest note within 24 px" is a
 * statement about the reader's hand, not about the map.  Cells are the search
 * radius wide, so a query touches nine of them whatever the zoom.
 */
function buildScreenIndex(xs, ys, cell) {
  const size = Math.max(cell || HIT_RADIUS_PX, 1);
  const bins = new Map();
  for (let i = 0; i < xs.length; i++) {
    const k = Math.floor(xs[i] / size) + "," + Math.floor(ys[i] / size);
    let arr = bins.get(k);
    if (!arr) { arr = []; bins.set(k, arr); }
    arr.push(i);
  }
  return {
    cell: size,
    /** Nearest index within `maxDist`, or -1.  `allow` may veto a candidate,
     *  which is how a filtered-out note stays unhoverable. */
    nearest: function (x, y, maxDist, allow) {
      const r = Math.max(1, Math.ceil(maxDist / size));
      const cx = Math.floor(x / size), cy = Math.floor(y / size);
      let best = -1, bestD = maxDist * maxDist;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const arr = bins.get((cx + dx) + "," + (cy + dy));
          if (!arr) continue;
          for (let t = 0; t < arr.length; t++) {
            const i = arr[t];
            if (allow && !allow(i)) continue;
            const ex = xs[i] - x, ey = ys[i] - y;
            const d = ex * ex + ey * ey;
            // Ties go to the smaller index, so the same pixel always answers
            // with the same note however the bins happened to fill.
            if (d < bestD || (d === bestD && best >= 0 && i < best)) { bestD = d; best = i; }
          }
        }
      }
      return best;
    }
  };
}

/** The folder a note lives in, from its path.  The vault root is "". */
function dirOfPath(path) {
  const s = String(path || "");
  const i = s.lastIndexOf("/");
  return i < 0 ? "" : s.slice(0, i);
}

/** The first `depth` segments of a folder path. */
function folderKeyOf(folder, depth) {
  const s = String(folder || "");
  if (!s) return "";
  const parts = s.split("/");
  const out = [];
  for (let i = 0; i < parts.length && out.length < depth; i++) {
    if (parts[i]) out.push(parts[i]);
  }
  return out.join("/");
}

/**
 * The shallowest depth at which the folders actually divide the vault.
 *
 * A vault that keeps everything under one top folder — which is most vaults
 * with a samples or an archive directory — groups at depth 1 into a single row
 * saying "all of it", which tells the reader nothing.  So the depth climbs
 * until the largest group is a minority, and stops at three because a path
 * four deep is no longer a place anyone thinks in.
 */
function adaptiveFolderDepth(folders, share, maxDepth) {
  const lim = share === undefined ? FOLDER_MAX_SHARE : share;
  const deepest = maxDepth === undefined ? FOLDER_MAX_DEPTH : maxDepth;
  const n = folders.length;
  if (!n) return 1;
  for (let d = 1; d <= deepest; d++) {
    const tally = new Map();
    let biggest = 0;
    for (let i = 0; i < n; i++) {
      const k = folderKeyOf(folders[i], d);
      const v = (tally.get(k) || 0) + 1;
      tally.set(k, v);
      if (v > biggest) biggest = v;
    }
    if (biggest < lim * n) return d;
  }
  return deepest;
}

/**
 * The Folders list: one row per group, largest first, the tail collected into
 * a single row rather than scrolled.  `rootLabel` and `otherLabel` are handed
 * in already localised, because this file's translation table is not this
 * function's business.
 */
function folderRows(folders, opts) {
  opts = opts || {};
  const maxRows = opts.maxRows === undefined ? FOLDER_MAX_ROWS : opts.maxRows;
  const depth = opts.depth === undefined ? adaptiveFolderDepth(folders, opts.share) : opts.depth;
  const tally = new Map();
  for (let i = 0; i < folders.length; i++) {
    const k = folderKeyOf(folders[i], depth);
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  const all = Array.from(tally.entries())
    .map(function (kv) { return { key: kv[0], count: kv[1] }; })
    .sort(function (a, b) { return b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0); });

  const label = function (key) {
    if (!key) return opts.rootLabel || "Vault root";
    const parts = key.split("/");
    return parts[parts.length - 1];
  };
  const rows = [];
  const head = all.length > maxRows ? all.slice(0, maxRows) : all;
  for (let i = 0; i < head.length; i++) {
    rows.push({ key: head[i].key, keys: [head[i].key], label: label(head[i].key),
      title: head[i].key || (opts.rootLabel || "Vault root"), count: head[i].count, other: false });
  }
  if (all.length > maxRows) {
    const rest = all.slice(maxRows);
    let count = 0;
    const keys = [];
    for (let i = 0; i < rest.length; i++) { count += rest[i].count; keys.push(rest[i].key); }
    rows.push({ key: NUL + "other", keys: keys, label: opts.otherLabel || "other",
      title: keys.map(function (k) { return k || (opts.rootLabel || "Vault root"); }).join(", "),
      count: count, other: true });
  }
  return { depth: depth, rows: rows, groups: all.length };
}

/**
 * How central each non-summit note is, as a number in [0, 1] — what the
 * stylesheet turns into the dot's opacity.
 *
 * Centrality is degree, ranked as a TIE-AWARE percentile among the non-anchor
 * notes: c = (#{deg < d} + (#{deg == d} - 1) / 2) / (N - 1).  A percentile
 * rather than degree over the maximum, because a vault's degrees are heavily
 * skewed — one hub at a hundred links would leave every other note pinned at
 * the faint end — and tie-aware so that two notes with the same number of
 * links are never drawn at different strengths; order in the file is not a
 * fact about the notes.  The summit anchors are left out of the ranking (and
 * out of the result) because they are drawn at full strength regardless, and
 * letting the six largest hubs occupy the top of the scale would only
 * compress everyone else.  One non-anchor note, or none, is simply central.
 */
function dotCentrality(nodes) {
  const out = new Array(nodes.length);
  const degs = [];
  for (let i = 0; i < nodes.length; i++) if (nodes[i].summit === null) degs.push(nodes[i].deg);
  const N = degs.length;
  degs.sort(function (a, b) { return a - b; });
  // below[d] and equal[d] from one pass over the sorted degrees.
  const below = new Map(), equal = new Map();
  for (let k = 0; k < N; k++) {
    if (!below.has(degs[k])) below.set(degs[k], k);
    equal.set(degs[k], (equal.get(degs[k]) || 0) + 1);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].summit !== null) continue;
    const d = nodes[i].deg;
    out[i] = N <= 1 ? 1 : (below.get(d) + (equal.get(d) - 1) / 2) / (N - 1);
  }
  return out;
}

/**
 * The links that cross from one summit's region to another's: the "bridges"
 * drawn as faint hairlines over the water between the mountains.
 *
 * Region is the nearest-summit partition `anchorPeaks` writes onto every
 * note (restricted to the summit's own landmass, below), so a link whose
 * ends lie in two different regions is exactly a link between two
 * mountains — and on a vault whose summits sit on separate
 * landmasses, those are the links that the terrain, which only knows density,
 * cannot show.  `model.edges` is DIRECTED, so a mutual link appears twice;
 * drawn twice it would be twice as dark as a one-way link, which would be
 * a claim the map does not mean to make.  The pairs are deduplicated as
 * unordered, lower index first, in the edges' own order.
 */
function bridgeEdges(model) {
  const nodes = model.nodes, edges = model.edges || [], peaks = model.peaks || [];
  // A note's region counts only if the summit it is nearest stands on the
  // note's OWN landmass.  The partition is by distance alone, so an islet
  // packed in between two mountains has its notes split between them — and
  // the islet's own internal links would then be drawn as "bridges" between
  // two mountains they have nothing to do with.  An islet is not a summit's
  // territory; it is its own.
  const regionOf = function (n) {
    if (!n || n.region === null || n.region === undefined) return null;
    const p = peaks[n.region];
    const anchor = p && p.anchor !== null && p.anchor !== undefined ? nodes[p.anchor] : null;
    if (anchor && anchor.component !== undefined && anchor.component !== n.component) return null;
    return n.region;
  };
  const seen = new Set(), out = [];
  for (let e = 0; e < edges.length; e++) {
    const a = Math.min(edges[e][0], edges[e][1]), b = Math.max(edges[e][0], edges[e][1]);
    const ra = regionOf(nodes[a]), rb = regionOf(nodes[b]);
    if (ra === null || rb === null || ra === rb) continue;
    const key = a + "," + b;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

/**
 * Compose the three filters.  A note is on the map when it passes ALL of them,
 * and each is inactive when it is empty, so the default — nothing typed,
 * nothing pinned — lights every note without a special case.
 *
 * `best` is the highest-degree note matching the SEARCH, whatever the pins say
 * about it: Enter in the search box means "the note I am typing", and a pinned
 * folder the reader forgot about must not send them somewhere else.
 */
function filterNotes(nodes, opts) {
  opts = opts || {};
  const q = String(opts.query === undefined ? "" : opts.query).trim().toLowerCase();
  const summits = opts.summits && opts.summits.length ? new Set(opts.summits) : null;
  const folders = opts.folders && opts.folders.length ? new Set(opts.folders) : null;
  const keys = opts.folderKeys || null;
  const n = nodes.length;
  const visible = new Uint8Array(n);
  let count = 0, matches = 0, best = -1, bestDeg = -1;
  for (let i = 0; i < n; i++) {
    const hit = !q || String(nodes[i].title || "").toLowerCase().indexOf(q) !== -1;
    if (hit) {
      matches++;
      if (nodes[i].deg > bestDeg ||
        (nodes[i].deg === bestDeg && best >= 0 && nodes[i].path < nodes[best].path)) {
        bestDeg = nodes[i].deg; best = i;
      }
    }
    let ok = hit;
    if (ok && summits) ok = summits.has(nodes[i].region);
    if (ok && folders) ok = keys ? folders.has(keys[i]) : false;
    if (ok) { visible[i] = 1; count++; }
  }
  return {
    visible: visible, count: count, matches: matches, best: best,
    searching: !!q,
    active: !!(q || summits || folders)
  };
}

/**
 * Which leaf a click opens a note in.
 *
 * The rule the reader feels is: exploring the map does not bury the map, and
 * ten notes do not make ten tabs.  So a modifier is obeyed literally; failing
 * that the map reuses the leaf it opened the last note in; failing that the
 * most recent leaf of the main area, as long as it is neither a map nor
 * pinned; and only when all of those are gone does a new tab appear.
 *
 * `state` describes the workspace rather than being it, so the rule can be
 * read, argued with and tested without a running Obsidian.
 */
function chooseCompanionLeaf(state) {
  const s = state || {};
  if (s.mod) return { action: "mod", mod: s.mod };
  const c = s.companion;
  if (c && c.exists && !c.pinned && !c.isMap) return { action: "companion" };
  const r = s.recent;
  if (r && r.exists !== false && !r.pinned && !r.isMap) return { action: "recent" };
  return { action: "new" };
}

/** The modifier this platform calls the modifier. */
function modLabel(isMac) { return isMac ? "⌘" : "Ctrl"; }

const TufteMapCore = {
  computeMap: computeMap,
  graphHash: graphHash,
  placeLabels: placeLabels,
  approximateMeasurer: approximateMeasurer,
  fittedFrameArea: fittedFrameArea,
  clampViewport: clampViewport,
  zoomViewportAbout: zoomViewportAbout,
  panViewport: panViewport,
  buildScreenIndex: buildScreenIndex,
  dirOfPath: dirOfPath,
  folderKeyOf: folderKeyOf,
  adaptiveFolderDepth: adaptiveFolderDepth,
  folderRows: folderRows,
  filterNotes: filterNotes,
  dotCentrality: dotCentrality,
  bridgeEdges: bridgeEdges,
  chooseCompanionLeaf: chooseCompanionLeaf,
  savedPosition: savedPosition,
  modLabel: modLabel,
  degreeArea: degreeArea,
  markerRadiusPt: markerRadiusPt,
  designScale: designScale,
  presentationMode: presentationMode,
  labelTiers: labelTiers,
  tierThreshold: tierThreshold,
  tierOpacity: tierOpacity,
  topferBudget: topferBudget,
  contourBands: contourBands,
  reduceLevels: reduceLevels,
  reduceContours: reduceContours,
  dotSizing: dotSizing,
  dotRadiusPt: dotRadiusPt,
  fitSheet: fitSheet,
  rotateModel: rotateModel,
  rotatePoint: rotatePoint,
  unrotatePoint: unrotatePoint,
  terrainLevels: terrainLevels,
  roman: roman,
  MapCancelled: MapCancelled,
  constants: {
    FRAME_H: FRAME_H,
    SEA_LEVEL: SEA_LEVEL,
    TERRAIN_BANDS: TERRAIN_BANDS,
    GRID_NY: GRID_NY,
    SUMMIT_PT: SUMMIT_PT,
    SUMMIT_TRACKING_EM: SUMMIT_TRACKING_EM,
    MINOR_PT: MINOR_PT,
    MINOR_MUST_NAME: MINOR_MUST_NAME,
    MINOR_SECONDARY_COUNT: MINOR_SECONDARY_COUNT,
    COMPONENT_CLEARANCE_MAP: COMPONENT_CLEARANCE_MAP,
    COAST_LW_PT: 0.6,
    CONTOUR_LW_PT: 0.3,
    INDEX_CONTOUR_LW_PT: 0.8,
    LEADER_LW_PT: 0.35,
    HALO_LW_PT: HALO_LW_PT,
    DOT_RING_LW_PT: 0.4,
    DEGREE_RAMP_GAMMA: DEGREE_RAMP_GAMMA,
    PT_PER_CSS_PX: PT_PER_CSS_PX,
    REFERENCE_SHEET_PT: REFERENCE_SHEET_PT,
    DESIGN_SHEET_PT: DESIGN_SHEET_PT,
    SCALE_MIN: SCALE_MIN,
    SCALE_MAX: SCALE_MAX,
    SCALE_KNEE_PT: SCALE_KNEE_PT,
    SCALE_KNEE_EXP: SCALE_KNEE_EXP,
    SCALE_FLOOR: SCALE_FLOOR,
    COMPACT_MAX_WIDTH_PX: COMPACT_MAX_WIDTH_PX,
    COMPACT_TYPE_MIN_PT: COMPACT_TYPE_MIN_PT,
    COMPACT_SUMMIT_RING_MAX_PT: COMPACT_SUMMIT_RING_MAX_PT,
    COMPACT_SUMMIT_AMBIG_HARD_RATIO: COMPACT_SUMMIT_AMBIG_HARD_RATIO,
    COMPACT_DOT_CAP_FRAC: COMPACT_DOT_CAP_FRAC,
    DOT_MIN_RADIUS_PX: DOT_MIN_RADIUS_PX,
    DOT_MIN_RADIUS_PT: DOT_MIN_RADIUS_PT,
    TIER_THRESHOLD_MINOR_PT: TIER_THRESHOLD_MINOR_PT,
    TIER_THRESHOLD_NAME_PT: TIER_THRESHOLD_NAME_PT,
    TIER_FADE_SPAN: TIER_FADE_SPAN,
    TIER_FADE_MIN: TIER_FADE_MIN,
    SUMMIT_MIN_PT: SUMMIT_MIN_PT,
    MINOR_MIN_PT: MINOR_MIN_PT,
    HAIRLINE_SCALE_MIN: HAIRLINE_SCALE_MIN,
    SUMMIT_CLEAR_PT: SUMMIT_CLEAR_PT,
    SUMMIT_CLEAR_MIN_PT: SUMMIT_CLEAR_MIN_PT,
    SUMMIT_COVER_MIN_DEG: SUMMIT_COVER_MIN_DEG,
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    ZOOM_STEP: ZOOM_STEP,
    HIT_RADIUS_PX: HIT_RADIUS_PX,
    FOLDER_MAX_ROWS: FOLDER_MAX_ROWS,
    COMPONENT_CLEARANCE_MAP_FLOOR: COMPONENT_CLEARANCE_MAP
  }
};

/* ==========================================================================
 * 3. TufteMapRender
 *
 * One <svg> per sheet, built with createElementNS and textContent only —
 * never the two markup-parsing DOM setters, because every string on the sheet
 * is a note title the user wrote, and a plugin that pastes those into markup
 * is one strangely-named note away from an injection.
 *
 * Layers, bottom to top:
 *   terrain tint   an <image> holding a canvas raster, quantised into the
 *                  same 12 bands the contour lines mark, so a band edge and
 *                  its line coincide instead of shimmering against it
 *   contours       three weights, cut away under every label by an SVG mask
 *   leaders        above the tint so they are not lost in a contour, below
 *                  the dots and the type so they can never touch a letter
 *   dots           area proportional to links, degree ramp, paper ring
 *   labels         summit (red numeral + tracked capitals) and minor (italic)
 *
 * The viewBox is in POINTS, so every size in the model — line weights, type
 * sizes, marker radii — is written out as the number it already is.
 * ====================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const TERRAIN_RAMP_LIGHT = ["#fffff8", "#f7f7ef", "#f5f5dc", "#e3dab0"];
const TERRAIN_RAMP_DARK = ["#151515", "#1c1c1c", "#26251f", "#3f3c31"];
// Used only when the Tufte theme is not installed: the same climb, measured
// as fractions of the way from the paper toward the ink, so any theme gets a
// pale one-hue terrain instead of a colour we invented for it.
const DERIVED_RAMP_STOPS = [0.0, 0.035, 0.09, 0.20];
const RASTER_MAX_PX = 2048;
const DEVICE_PX_PER_CSS_PX = 2;

function parseColour(css) {
  const s = String(css || "").trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1];
  }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? p[3] : 1];
  }
  return [0, 0, 0, 1];
}

function toHex(rgb) {
  const h = function (v) { return clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"); };
  return "#" + h(rgb[0]) + h(rgb[1]) + h(rgb[2]);
}

function mixColour(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];
}

function relativeLuminance(rgb) {
  const f = function (v) {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

/** Sample a 4-stop ramp linearly in sRGB, as matplotlib's
 *  LinearSegmentedColormap does, so the two sheets match band for band. */
function sampleRamp(stops, t) {
  const u = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(Math.floor(u), stops.length - 2);
  return mixColour(stops[i], stops[i + 1], u - i);
}

/**
 * Resolve the theme tokens against a real element, so the map is drawn in
 * whatever the user's theme actually computes to — including a Style
 * Settings override, which is why this probes rather than reads a table.
 */
function readTheme(el) {
  const doc = el.ownerDocument;
  const probe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
  probe.style.position = "absolute";
  probe.style.left = "-9999px";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.overflow = "hidden";
  el.appendChild(probe);
  const token = function (expr) {
    probe.style.color = "";
    probe.style.color = expr;
    return doc.defaultView.getComputedStyle(probe).color;
  };
  const theme = {
    bg: token("var(--tufte-bg, var(--background-primary))"),
    ink: token("var(--tufte-ink, var(--text-normal))"),
    muted: token("var(--tufte-muted, var(--text-muted))"),
    faint: token("var(--tufte-faint, var(--text-faint))"),
    accent: token("var(--tufte-accent, var(--text-accent))"),
    rule: token("var(--tufte-rule, var(--background-modifier-border))")
  };
  const cs = doc.defaultView.getComputedStyle(el);
  theme.fontFamily = cs.fontFamily;
  const hasTufte = String(cs.getPropertyValue("--tufte-ink") || "").trim() !== "";
  probe.remove();

  const bg = parseColour(theme.bg), ink = parseColour(theme.ink);
  theme.dark = relativeLuminance(bg) < 0.5;
  theme.hasTufteTokens = hasTufte;
  if (hasTufte) {
    theme.ramp = (theme.dark ? TERRAIN_RAMP_DARK : TERRAIN_RAMP_LIGHT).map(parseColour);
  } else {
    theme.ramp = DERIVED_RAMP_STOPS.map(function (f) { return mixColour(bg, ink, f); });
  }
  // Alphas are tuned per paper so the contour web reads the same on both: the
  // terrain is a FILL, not ink, and a dark sheet needs it lifted, not dimmed.
  theme.contourAlpha = theme.dark ? 0.20 : 0.16;
  theme.indexContourAlpha = theme.dark ? 0.40 : 0.38;
  theme.coastAlpha = theme.dark ? 0.42 : 0.40;
  theme.leaderAlpha = 0.8;
  return theme;
}

/** The 12 band colours: one per band, sampled at the band's midpoint on a
 *  0..1 ramp, which is what matplotlib's contourf did with vmin/vmax 0..1. */
function bandColours(model, theme) {
  const out = [];
  for (let i = 0; i < model.levels.length - 1; i++) {
    const mid = (model.levels[i] + model.levels[i + 1]) / 2;
    out.push(sampleRamp(theme.ramp, mid));
  }
  return out;
}

/** The terrain tint as a canvas raster: bilinear-upsampled from the grid and
 *  then quantised, so every pixel lands exactly in one of the 12 bands. */
function terrainRaster(doc, model, theme, opts) {
  const vp = opts.viewport;
  const aspect = vp.h / vp.w;
  const w = Math.min(RASTER_MAX_PX,
    Math.max(64, Math.round(opts.sheetWidthPt * (1 / PT_PER_CSS_PX) * DEVICE_PX_PER_CSS_PX)));
  const h = Math.max(32, Math.round(w * aspect));
  const canvas = doc.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const data = img.data;

  const bands = bandColours(model, theme).map(function (c) { return [c[0] | 0, c[1] | 0, c[2] | 0]; });
  const paper = parseColour(theme.bg);
  const { nx, ny, z } = model.grid;
  const sea = model.seaLevel;
  const span = 1 - sea;
  const nBands = bands.length;
  // The grid is always the UPRIGHT model's.  A rotated sheet does not transpose
  // a hundred and forty thousand cells per redraw; it samples them through the
  // inverse turn, which is the same picture and one branch.
  const turned = !!model.rotated;
  const gridW = turned ? model.uprightFrameW : model.frameW;

  for (let py = 0; py < h; py++) {
    // Screen y runs DOWN, map y runs UP.
    const my = vp.y + vp.h * (1 - (py + 0.5) / h);
    const gyUp = clamp(my / FRAME_H * (ny - 1), 0, ny - 1);
    const r0u = Math.floor(gyUp), r1u = Math.min(r0u + 1, ny - 1), tyu = gyUp - r0u;
    for (let px = 0; px < w; px++) {
      const mx = vp.x + vp.w * ((px + 0.5) / w);
      let gx, r0, r1, ty;
      if (turned) {
        // x = frameW - y', y = x'
        const ux = gridW - my, uy = mx;
        gx = clamp(ux / gridW * (nx - 1), 0, nx - 1);
        const gyv = clamp(uy / FRAME_H * (ny - 1), 0, ny - 1);
        r0 = Math.floor(gyv); r1 = Math.min(r0 + 1, ny - 1); ty = gyv - r0;
      } else {
        gx = clamp(mx / model.frameW * (nx - 1), 0, nx - 1);
        r0 = r0u; r1 = r1u; ty = tyu;
      }
      const c0 = Math.floor(gx), c1 = Math.min(c0 + 1, nx - 1), tx = gx - c0;
      const v = (z[r0 * nx + c0] * (1 - tx) + z[r0 * nx + c1] * tx) * (1 - ty) +
                (z[r1 * nx + c0] * (1 - tx) + z[r1 * nx + c1] * tx) * ty;
      let col;
      if (v < sea) {
        col = paper;
      } else {
        const b = clamp(Math.floor((v - sea) / span * nBands), 0, nBands - 1);
        col = bands[b];
      }
      const o = (py * w + px) * 4;
      data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/* -- where the sheet's own rules live -----------------------------------
 * They used to travel with the sheet, in an <style> element inside the
 * <svg>.  Every one of them is static — a dot's fill is a MIX of two theme
 * colours chosen by its rank on the degree ramp, and the mix has to happen
 * in CSS because an SVG `fill` attribute containing var() is ignored
 * outright, but the RULE is the same for every sheet; only the rank (the
 * custom property --k on each circle) and the six colour tokens (set on the
 * <svg> element itself) vary.  So the rules now live in styles.css with the
 * rest of the view's, which is one stylesheet for the reader to override
 * instead of two, and one of them unreachable inside a shadowless SVG.
 * ------------------------------------------------------------------- */

// Every sheet drawn in this window gets its own number.  The label mask used
// to be identified by the graph's hash alone, which is the same string in
// every view of the same vault — so two map panes open at once put two masks
// with one id into one document, `url(#id)` found the first of them whatever
// the second was doing, and the pane that was zoomed in had its contours cut
// where the OTHER pane's labels are.  An id is a name, and two things in a
// document may not share one.
let drawSerial = 0;

function svgEl(doc, name, attrs) {
  const el = doc.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  return el;
}

/**
 * Draw the sheet into `container`, replacing whatever was there.
 *
 * `opts` = {sheetWidthPt, viewport}; both default to the values the label
 * layout was computed with, because type placed for one sheet width drawn at
 * another is exactly the overlapping mess the placer exists to prevent.
 */
function draw(container, model, labelLayout, theme, opts) {
  opts = opts || {};
  const doc = container.ownerDocument;
  const sheetWidthPt = opts.sheetWidthPt || (labelLayout && labelLayout.sheetWidthPt) || REFERENCE_SHEET_PT;
  const vp = opts.viewport || (labelLayout && labelLayout.viewport) ||
    { x: 0, y: 0, w: model.frameW, h: model.frameH };
  const sheetHeightPt = sheetWidthPt * vp.h / vp.w;
  const S = sheetWidthPt / vp.w;                    // points per map unit
  const X = function (x) { return (x - vp.x) * S; };
  const Y = function (y) { return (vp.y + vp.h - y) * S; };
  const C = TufteMapCore.constants;
  // The sheet's one scale.  It comes from the LAYOUT whenever there is one, so
  // the type the placer measured and the marks the renderer draws cannot
  // disagree about how big this sheet's furniture is.
  const scale = opts.scale > 0 ? opts.scale
    : (labelLayout && labelLayout.scale > 0 ? labelLayout.scale : designScale(sheetWidthPt));
  // Hairlines scale too, but never below three quarters of their design
  // weight: a contour web thinned in proportion to a narrow sheet disappears.
  const hair = Math.max(scale, HAIRLINE_SCALE_MIN);
  // Flannery's floor and ceiling, taken from the LAYOUT whenever there is one:
  // the disc the placer kept clear of and the disc the reader sees must be the
  // same disc.
  const compact = opts.compact !== undefined ? !!opts.compact
    : !!(labelLayout && labelLayout.compact);
  const sizing = opts.dots || (labelLayout && labelLayout.dots) ||
    dotSizing(model, scale, sheetWidthPt, compact);
  // The tier fades: one number per tier, multiplied into the group that holds
  // it, so the hover and filter rules keep the per-label opacity to themselves.
  const tiers = opts.tiers || (labelLayout && labelLayout.tiers) ||
    { minor: 1, name: 1 };
  const px = function (lwPt) { return lwPt * (1 / PT_PER_CSS_PX); };  // non-scaling-stroke is in CSS px

  while (container.firstChild) container.removeChild(container.firstChild);

  const svg = svgEl(doc, "svg", {
    "class": "tufte-map-paper",
    viewBox: "0 0 " + sheetWidthPt.toFixed(3) + " " + sheetHeightPt.toFixed(3),
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "data-scale": scale.toFixed(4)
  });
  svg.style.setProperty("--tufte-map-ink", theme.ink);
  svg.style.setProperty("--tufte-map-muted", theme.muted);
  svg.style.setProperty("--tufte-map-faint", theme.faint);
  svg.style.setProperty("--tufte-map-accent", theme.accent);
  svg.style.setProperty("--tufte-map-bg", theme.bg);
  svg.style.setProperty("background-color", theme.bg);
  // The sheet INHERITS its face from the root rather than carrying a copy:
  // a copy taken before the stylesheet has landed (a view restored on a
  // plugin reload sees exactly that) would pin the leaf's interface sans
  // onto the map for good.

  const defs = svgEl(doc, "defs");
  svg.appendChild(defs);

  /* -- terrain tint ----------------------------------------------------- */
  if (model.grid && model.grid.z.length && model.counts.placed > 0) {
    const href = terrainRaster(doc, model, theme, { viewport: vp, sheetWidthPt: sheetWidthPt });
    const image = svgEl(doc, "image", {
      x: 0, y: 0, width: sheetWidthPt, height: sheetHeightPt,
      preserveAspectRatio: "none", "class": "tufte-map-terrain"
    });
    image.setAttribute("href", href);
    image.setAttributeNS(XLINK_NS, "xlink:href", href);   // older renderers
    svg.appendChild(image);
  }

  /* -- contour lines, cut away under every label ------------------------ */
  const masks = (labelLayout && labelLayout.masks) || [];
  let maskId = null;
  if (masks.length) {
    maskId = "tufte-map-labelmask-" + model.hash + "-" + (++drawSerial).toString(36);
    const mask = svgEl(doc, "mask", { id: maskId, maskUnits: "userSpaceOnUse",
      x: 0, y: 0, width: sheetWidthPt, height: sheetHeightPt });
    mask.appendChild(svgEl(doc, "rect", { x: 0, y: 0, width: sheetWidthPt, height: sheetHeightPt, fill: "#fff" }));
    for (let i = 0; i < masks.length; i++) {
      const b = masks[i];
      mask.appendChild(svgEl(doc, "rect", {
        x: X(b[0]), y: Y(b[3]), width: (b[2] - b[0]) * S, height: (b[3] - b[1]) * S, fill: "#000"
      }));
    }
    defs.appendChild(mask);
  }
  const contourGroup = svgEl(doc, "g", { "class": "tufte-map-contours" });
  if (maskId) contourGroup.setAttribute("mask", "url(#" + maskId + ")");
  const weights = {
    coast: [C.COAST_LW_PT * hair, theme.coastAlpha],
    line: [C.CONTOUR_LW_PT * hair, theme.contourAlpha],
    index: [C.INDEX_CONTOUR_LW_PT * hair, theme.indexContourAlpha]
  };
  for (let ci = 0; ci < model.contours.length; ci++) {
    const set = model.contours[ci];
    const w = weights[set.kind];
    const g = svgEl(doc, "g", {
      "class": "tufte-map-contour tufte-map-contour-" + set.kind,
      stroke: theme.ink, "stroke-width": px(w[0]).toFixed(3), "stroke-opacity": w[1], fill: "none"
    });
    for (let r = 0; r < set.rings.length; r++) {
      const pts = set.rings[r];
      let d = "";
      for (let k = 0; k < pts.length; k += 2) {
        d += (k === 0 ? "M" : "L") + X(pts[k]).toFixed(2) + " " + Y(pts[k + 1]).toFixed(2);
        if (k + 2 < pts.length) d += " ";
      }
      g.appendChild(svgEl(doc, "path", { d: d, "class": "tufte-map-contour" }));
    }
    contourGroup.appendChild(g);
  }
  svg.appendChild(contourGroup);

  /* -- leaders ---------------------------------------------------------- */
  const leaders = (labelLayout && labelLayout.leaders) || [];
  if (leaders.length) {
    const g = svgEl(doc, "g", {
      "class": "tufte-map-leaders", stroke: theme.faint,
      "stroke-width": px(C.LEADER_LW_PT * hair).toFixed(3),
      "stroke-opacity": theme.leaderAlpha, fill: "none"
    });
    for (let i = 0; i < leaders.length; i++) {
      const s = leaders[i].seg;
      g.appendChild(svgEl(doc, "line", {
        "class": "tufte-map-leader",
        "data-i": leaders[i].note === null || leaders[i].note === undefined ? "" : String(leaders[i].note),
        x1: X(s[0]).toFixed(2), y1: Y(s[1]).toFixed(2),
        x2: X(s[2]).toFixed(2), y2: Y(s[3]).toFixed(2)
      }));
    }
    svg.appendChild(g);
  }

  /* -- dots ------------------------------------------------------------- */
  // Small dots first, hubs last, so a hub's paper ring separates it from the
  // specks crowding it rather than the other way round.
  const nodes = model.nodes;
  const order = nodes.map(function (_, i) { return i; })
    .sort(function (a, b) { return nodes[a].deg - nodes[b].deg || a - b; });
  const ranks = new Float64Array(nodes.length);
  for (let k = 0; k < order.length; k++) {
    ranks[order[k]] = order.length > 1 ? k / (order.length - 1) : 0;
  }
  const centrality = dotCentrality(nodes);
  const dotGroup = svgEl(doc, "g", {
    "class": "tufte-map-dots", "stroke-width": px(C.DOT_RING_LW_PT * hair).toFixed(3)
  });
  const anchorGroup = svgEl(doc, "g", {
    "class": "tufte-map-dots tufte-map-anchors", "stroke-width": px(C.DOT_RING_LW_PT * hair).toFixed(3)
  });
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const isAnchor = nodes[i].summit !== null;
    // `data-i` is the node's index in `model.nodes`, and it is the whole of
    // the contract between the renderer and the view: the view needs to light
    // one dot and its neighbours on a hover without walking the sheet, and an
    // index attribute is the cheapest honest way to say which circle is which.
    const circle = svgEl(doc, "circle", {
      "class": "tufte-map-dot" + (isAnchor ? " tufte-map-dot-anchor" : ""),
      "data-i": i,
      cx: X(nodes[i].x).toFixed(2), cy: Y(nodes[i].y).toFixed(2),
      r: dotRadiusPt(nodes[i].deg, scale, sizing).toFixed(3)
    });
    circle.style.setProperty("--k", Math.pow(ranks[i], C.DEGREE_RAMP_GAMMA).toFixed(4));
    // ...and --c, the note's centrality among the non-summit notes, which the
    // stylesheet maps onto the dot's opacity.  Set as a custom property for
    // the same reason as --k: the numbers live in the stylesheet's tokens,
    // and var() is not allowed in a presentation attribute.  Anchors get none
    // — they are drawn at full strength.
    if (!isAnchor) circle.style.setProperty("--c", centrality[i].toFixed(4));
    (isAnchor ? anchorGroup : dotGroup).appendChild(circle);
  }
  svg.appendChild(dotGroup);
  svg.appendChild(anchorGroup);

  /* -- labels ----------------------------------------------------------- */
  const labelGroup = svgEl(doc, "g", { "class": "tufte-map-labels" });
  // Three tier groups, because opacity NESTS: the tier's fade is on the group
  // and the hover/filter dimming stays on the label, and the two multiply
  // instead of one overwriting the other.  Numerals never fade — below the
  // name threshold they are the whole of what a summit says.
  const nameGroup = svgEl(doc, "g", { "class": "tufte-map-tier tufte-map-tier-name" });
  const minorGroup = svgEl(doc, "g", { "class": "tufte-map-tier tufte-map-tier-minor" });
  nameGroup.style.setProperty("opacity", String(+(tiers.name === undefined ? 1 : tiers.name).toFixed(3)));
  minorGroup.style.setProperty("opacity", String(+(tiers.minor === undefined ? 1 : tiers.minor).toFixed(3)));
  const labels = (labelLayout && labelLayout.labels) || [];
  for (let i = 0; i < labels.length; i++) {
    const lb = labels[i];
    const own = lb.note === null || lb.note === undefined ? "" : String(lb.note);
    if (lb.tier === "numeral") {
      const num = svgEl(doc, "text", {
        "class": "tufte-map-label tufte-map-label-numeral tufte-map-label-numeral-loose" +
          (lb.forced ? " tufte-map-label-forced" : ""),
        "data-i": own,
        x: X(lb.x).toFixed(2), y: Y(lb.y).toFixed(2),
        "font-size": lb.sizePt,
        "stroke-width": (C.HALO_LW_PT * scale).toFixed(3)
      });
      num.textContent = lb.numeral;
      labelGroup.appendChild(num);
    } else if (lb.tier === "summit") {
      if (lb.numeral !== null && lb.numeralX !== null) {
        const num = svgEl(doc, "text", {
          "class": "tufte-map-label tufte-map-label-numeral",
          "data-i": own,
          x: X(lb.numeralX).toFixed(2), y: Y(lb.y).toFixed(2),
          "font-size": lb.sizePt, "letter-spacing": (lb.trackingEm * lb.sizePt).toFixed(3),
          "stroke-width": (C.HALO_LW_PT * scale).toFixed(3)
        });
        num.textContent = lb.numeral;
        labelGroup.appendChild(num);
      }
      const name = svgEl(doc, "text", {
        "class": "tufte-map-label tufte-map-label-summit",
        "data-i": own,
        x: X(lb.x).toFixed(2), y: Y(lb.y).toFixed(2),
        "font-size": lb.sizePt, "letter-spacing": (lb.trackingEm * lb.sizePt).toFixed(3),
        "stroke-width": (C.HALO_LW_PT * scale).toFixed(3)
      });
      name.textContent = lb.text;
      nameGroup.appendChild(name);
    } else {
      const t = svgEl(doc, "text", {
        "class": "tufte-map-label tufte-map-label-minor",
        "data-i": own,
        x: X(lb.x).toFixed(2), y: Y(lb.y).toFixed(2),
        "font-size": lb.sizePt, "stroke-width": (C.HALO_LW_PT * scale).toFixed(3)
      });
      t.textContent = lb.text;
      minorGroup.appendChild(t);
    }
  }
  labelGroup.appendChild(nameGroup);
  labelGroup.appendChild(minorGroup);
  svg.appendChild(labelGroup);

  container.appendChild(svg);
  return svg;
}

/**
 * A canvas-backed measurer over the pane's own font.  This is the whole
 * reason the sheet sets real <text> rather than paths: the theme's CJK
 * companion faces and its italic-to-Kaiti rule apply by themselves, and the
 * placer measures exactly what the browser will draw.
 */
function makeMeasurer(el) {
  const doc = el.ownerDocument;
  // The face is captured while the root is attached and styled; a computed
  // style read mid-render (the sheet host is briefly detached) comes back
  // empty and would measure in a generic serif.  The view remakes the
  // measurer on css-change, which is also when a late stylesheet lands.
  const cs = doc.defaultView.getComputedStyle(el);
  const family = cs.fontFamily || "serif";
  const canvas = doc.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const cache = new Map();
  return function (text, spec) {
    const key = family + "|" + spec.sizePt + "|" + (spec.italic ? "i" : "r") + "|" + (spec.trackingEm || 0) + "|" + text;
    const hit = cache.get(key);
    if (hit) return hit;
    // Measure at a large nominal size and scale down: sub-pixel hinting makes
    // a direct measurement at 8.5 px noticeably coarser than the type will be
    // when the sheet is scaled up to the pane.
    const nominal = 100;
    ctx.font = (spec.italic ? "italic " : "") + nominal + "px " + family;
    const m = ctx.measureText(String(text));
    const chars = Array.from(String(text)).length;
    const width = (m.width / nominal) * spec.sizePt +
      (spec.trackingEm || 0) * spec.sizePt * Math.max(chars - 1, 0);
    const asc = m.actualBoundingBoxAscent || m.fontBoundingBoxAscent || nominal * 0.72;
    const desc = m.actualBoundingBoxDescent || m.fontBoundingBoxDescent || nominal * 0.22;
    const out = {
      width: width,
      ascent: (asc / nominal) * spec.sizePt,
      descent: -(desc / nominal) * spec.sizePt
    };
    cache.set(key, out);
    return out;
  };
}

const TufteMapRender = {
  draw: draw,
  readTheme: readTheme,
  makeMeasurer: makeMeasurer
};

/* ==========================================================================
 * 4. The view, the plugin and the settings tab
 *
 * The sheet is a handout, not a control panel: a map on the left and a margin
 * column on the right, set in the pane's own reading voice, whose controls are
 * TEXT — an underlined input, words that toggle — because a boxed button on a
 * Tufte page is a piece of furniture standing in front of the argument.
 *
 * Three rules run through everything below.
 *
 *   · Vault strings reach the DOM through textContent and setAttribute and
 *     nowhere else.  Every title on this page was written by the user, and a
 *     plugin that pastes those into markup is one strangely-named note away
 *     from an injection.
 *   · Hovering must cost O(degree), not O(n).  Fading is done with two
 *     classes on the ROOT and two on the handful of elements that change, so
 *     the browser's selector engine does the sweep a loop would otherwise do
 *     five hundred times a second.
 *   · Every compute is cancellable and nothing is assumed to survive an
 *     await.  A view can be closed, a setting changed, or the vault reindexed
 *     while a layout is running.
 * ====================================================================== */

const VIEW_TYPE = "tufte-map-view";

/**
 * The two clipPaths that split a bridge into its stretches over land and over
 * water, built from the COAST rings of the drawn model and mapped onto the
 * sheet by `toSheet`.
 *
 * Land is every coast ring in one path under the even-odd rule, so a lake —
 * a ring inside a ring — counts as water, which it is.  Water is the sheet's
 * rectangle plus the same rings, even-odd again: exactly the complement.  The
 * ids carry the graph hash and a serial shared with the renderer's label
 * masks, because ids are document-global and two panes open on one vault once
 * cut each other's contours through a shared mask id; a clip is no different.
 * Null when there is no coast.
 */
function coastClipPaths(doc, contours, toSheet, W, H, hash) {
  let rings = "";
  for (const set of contours || []) {
    if (set.kind !== "coast") continue;
    for (const pts of set.rings) {
      if (!pts || pts.length < 6) continue;
      for (let k = 0; k < pts.length; k += 2) {
        const p = toSheet(pts[k], pts[k + 1]);
        rings += (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
      }
      rings += "Z";
    }
  }
  if (!rings) return null;
  const serial = (++drawSerial).toString(36);
  const make = function (id, d) {
    const cp = doc.createElementNS(SVG_NS, "clipPath");
    cp.setAttribute("id", id);
    cp.setAttribute("clipPathUnits", "userSpaceOnUse");
    const p = doc.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("clip-rule", "evenodd");
    cp.appendChild(p);
    return cp;
  };
  const land = "tufte-map-land-" + hash + "-" + serial;
  const water = "tufte-map-water-" + hash + "-" + serial;
  const rect = "M0 0H" + W.toFixed(1) + "V" + H.toFixed(1) + "H0Z";
  return { land: land, water: water, landEl: make(land, rings), waterEl: make(water, rect + rings) };
}

const DEFAULT_SETTINGS = {
  excludeFolders: "",
  openIn: "tab",
  namedNotes: 30,
  showAllLinks: false,
  // The links between summit regions, drawn over the water between the
  // mountains.  On by default, unlike all links: there are a few hundred of
  // them rather than a few thousand, and they say something the terrain
  // cannot — which of the separate mountains are joined, and how strongly.
  showBridges: true,
  // Obsidian's graph view calls this the text fade threshold and gives it a
  // slider from -3 to 3; so do we, and it means the same thing: labels come in
  // sooner or later as the sheet's effective width grows.
  textFadeThreshold: 0,
  // The details band / margin column, remembered per presentation: a sidebar
  // opens as a map and a wide tab opens as a handout.
  detailsCompact: false,
  detailsFull: true
};

const RESOLVED_DEBOUNCE_MS = 1500;   // the house trailing debounce
const RESIZE_DEBOUNCE_MS = 150;
const GESTURE_SETTLE_MS = 180;
const SAVE_DEBOUNCE_MS = 800;
const CACHE_DECIMALS = 4;
const HOT_LINK_ALPHA = 0.35;
const ALL_LINK_ALPHA = 0.10;
// The bridges are drawn a shade stronger than the all-links layer because
// they are fewer and they cross open water — there is no terrain under them
// for a hairline to compete with, so a hairline at a tenth is gone the moment
// the sheet is printed.  Still well under the hover's 0.35: they are a wash
// of connection, not a figure to be read link by link.
const BRIDGE_LINK_ALPHA = 0.12;
// ...and lighter where a bridge crosses LAND.  The bridges exist to join the
// mountains across the water; over land they run across hills whose own dots
// and contours already say where the links are, and there they only compete
// with them.  So the stretch over land is drawn at a little over half the
// strength of the stretch over water.
const BRIDGE_LAND_ALPHA = 0.07;
const HOT_RING_PAD_PT = 1.6;
const HOVER_NAME_GAP_PT = 2.4;     // hover name to the drawn disc, x scale
const HERE_RING_PAD_PT = 2.6;
const NAMED_ZOOM_CAP = 300;        // the may-name budget, however far one zooms
// Below this the band has no room to be scrolled in and the whole view scrolls.
const BAND_MIN_PX = 80;

const PROGRESS_STAGE = {
  graph: "reading the links",
  layout: "placing the notes",
  pack: "setting the islands",
  terrain: "raising the land",
  contours: "drawing the contours"
};

/** One folder path per line, tolerant of a stray trailing slash. */
function parseExcludes(text) {
  const out = [];
  const lines = String(text || "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    let s = lines[i].trim();
    while (s.length > 1 && s.charAt(s.length - 1) === "/") s = s.slice(0, -1);
    if (s) out.push(s);
  }
  return out;
}

function isMacPlatform() {
  try {
    if (Platform && typeof Platform.isMacOS === "boolean") return Platform.isMacOS;
  } catch (e) {}
  try {
    const nav = window.navigator || {};
    return /Mac|iPhone|iPad|iPod/.test(String(nav.platform || nav.userAgent || ""));
  } catch (e) {}
  return false;
}

function round4(v) {
  const p = Math.pow(10, CACHE_DECIMALS);
  return Math.round(v * p) / p;
}

/* ----------------------------------------------------------------------
 * 4a. TufteMapView
 * ------------------------------------------------------------------- */

class TufteMapView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    // Obsidian writes the page-preview popover here; it must exist and be
    // null before the first hover-link event or the popover has nowhere to go.
    this.hoverPopover = null;

    this.model = null;
    this.layout = null;
    this.theme = null;
    this.viewport = null;
    this.drawnViewport = null;

    this.svg = null;
    this.dotEls = [];
    this.labelEls = [];
    this.leaderEls = [];
    this.linkLayer = null;
    this.bridgeLayer = null;
    this.bridges = null;          // bridgeEdges() of this.bridgeModel
    this.bridgeModel = null;
    this.bridgeFilter = null;     // the filter the bridge layer was drawn for
    this.bridgeClipEls = [];      // the land/water clipPaths in the sheet's <defs>
    this.hotLinkLayer = null;
    this.markLayer = null;

    this.adj = null;
    this.pathIndex = null;
    this.folderKeys = null;
    this.folders = null;
    this.index = null;
    this.screen = null;

    this.hot = -1;
    this.litSet = [];
    this.hotModel = null;         // the model the hot note was lit against
    this.keptApplied = false;
    this.tapPinned = false;
    this.pointerType = "mouse";

    this.query = "";
    this.pinnedSummits = new Set();
    this.pinnedFolders = new Set();
    this.isolate = null;          // {kind: "summit"|"folder", keys: [...]}
    this.filter = null;

    this.activePath = null;
    this.companion = null;

    this.computeToken = 0;
    this.closed = false;
    this.dirty = false;
    this.graphHash = null;
    this.busy = false;

    this.timers = { resolved: 0, resize: 0, gesture: 0 };
    this.observer = null;
    this.drag = null;
    this.measure = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return tt("Knowledge map"); }
  getIcon() { return "map"; }

  /* -- life ------------------------------------------------------------- */

  async onOpen() {
    this.closed = false;
    this.buildDom();
    this.registerListeners();
    // The same control again in the view header, for the tab case: the header
    // is hidden in sidebars by default, which is why the in-content corner
    // toggle exists, but a reader who has headers on should find it there.
    try {
      if (typeof this.addAction === "function") {
        this.addAction("list", tt("Toggle details"), () => this.toggleDetails());
      }
    } catch (e) { /* an action that will not register is not worth a dead view */ }
    this.applyPresentation();
    this.theme = TufteMapRender.readTheme(this.rootEl);
    this.measure = TufteMapRender.makeMeasurer(this.rootEl);
    await this.recompute({ reason: "open" });
  }

  /* -- the two presentations -------------------------------------------- */

  /** Is this leaf in a side split?  A sidebar is compact whatever its width. */
  inSideSplit() {
    try {
      const ws = this.app.workspace;
      if (this.leaf && typeof this.leaf.getRoot === "function" && ws) {
        return this.leaf.getRoot() !== ws.rootSplit;
      }
    } catch (e) {}
    return false;
  }

  /** The mode, and the classes and attributes that say so. */
  applyPresentation() {
    const w = (this.contentEl && this.contentEl.clientWidth) ||
      (this.rootEl && this.rootEl.clientWidth) || 0;
    const mode = TufteMapCore.presentationMode({ widthPx: w, sideSplit: this.inSideSplit() });
    this.mode = mode;
    const compact = mode === "compact";
    this.rootEl.classList.toggle("tufte-map-compact", compact);
    this.rootEl.classList.toggle("tufte-map-full", !compact);
    this.rootEl.setAttribute("data-mode", mode);
    // The class goes on the element Obsidian gives its 12 px of padding to —
    // the view content — because that is the element the padding has to come
    // off, and it is also the box the compact column fills.
    this.contentEl.classList.toggle("tufte-map-view-compact", compact);
    this.applyDetails();
    return mode;
  }

  detailsShown() {
    return this.mode === "compact"
      ? !!this.plugin.settings.detailsCompact : !!this.plugin.settings.detailsFull;
  }

  applyDetails() {
    const on = this.detailsShown();
    this.rootEl.classList.toggle("tufte-map-details-on", on);
    this.detailsEl.setAttribute("aria-expanded", on ? "true" : "false");
    this.detailsEl.setAttribute("aria-label", on ? tt("Hide details") : tt("Show details"));
    this.detailsEl.classList.toggle("tufte-map-on", on);
  }

  toggleDetails() {
    if (this.mode === "compact") {
      this.plugin.settings.detailsCompact = !this.plugin.settings.detailsCompact;
    } else {
      this.plugin.settings.detailsFull = !this.plugin.settings.detailsFull;
    }
    this.plugin.saveState().catch((e) => console.error("tufte-map:", e));
    this.applyDetails();
    // The sheet's box changed — in compact because the band took or gave back
    // the height, in full because the margin column took or gave back the
    // width — so it is re-placed at its new size rather than stretched.
    if (this.model) this.renderSheet();
  }

  async onClose() {
    this.closed = true;
    this.computeToken++;                       // cancels anything in flight
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    for (const k in this.timers) {
      if (this.timers[k]) { window.clearTimeout(this.timers[k]); this.timers[k] = 0; }
    }
    this.contentEl.empty ? this.contentEl.empty() : (this.contentEl.textContent = "");
  }

  /* -- the page --------------------------------------------------------- */

  buildDom() {
    const host = this.contentEl;
    while (host.firstChild) host.removeChild(host.firstChild);
    host.classList.add("tufte-map-view");
    // A second class on the same element, so the compact rules can carry three
    // of our own and beat app.css's `.view-content` padding without naming a
    // class this plugin does not own.
    host.classList.add("tufte-map-pane");
    const doc = host.ownerDocument;
    const el = function (tag, cls, parent) {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (parent) parent.appendChild(e);
      return e;
    };

    this.rootEl = el("div", "tufte-map-root", host);
    // Focusable, because "0 resets the view" has to have somewhere to arrive,
    // and because a pane the keyboard cannot reach is a pane half the readers
    // cannot use.
    this.rootEl.setAttribute("tabindex", "0");

    /* The strip ---------------------------------------------------------- *
     * One row above the sheet in BOTH presentations, so the reader learns one
     * arrangement: the search on the left, the details toggle in the corner.
     * The view header — where an action would ordinarily live — is hidden in
     * a sidebar by default, which is exactly where this plugin is meant to
     * be used, so the control has to be in the content. */
    this.stripEl = el("div", "tufte-map-strip", this.rootEl);
    const findRow = el("div", "tufte-map-strip-find", this.stripEl);
    this.findEl = el("input", "tufte-map-find", findRow);
    this.findEl.setAttribute("type", "text");
    this.findEl.setAttribute("placeholder", tt("search titles"));
    this.findEl.setAttribute("spellcheck", "false");
    this.findEl.setAttribute("aria-label", tt("Find a note"));
    this.findCountEl = el("span", "tufte-map-count", findRow);
    this.detailsEl = el("button", "tufte-map-corner-toggle", this.stripEl);
    this.detailsEl.setAttribute("type", "button");
    try { setIcon(this.detailsEl, "list"); } catch (e) { this.detailsEl.textContent = "≡"; }

    this.sheetEl = el("div", "tufte-map-sheet", this.rootEl);
    this.canvasEl = el("div", "tufte-map-canvas", this.sheetEl);
    this.statusEl = el("div", "tufte-map-status", this.sheetEl);

    this.marginEl = el("aside", "tufte-map-margin", this.rootEl);
    this.buildMargin(el);
  }

  buildMargin(el) {
    const m = this.marginEl;
    const mod = modLabelHere();

    this.summaryEl = el("p", "tufte-map-summary", m);
    // The compact band's one line, in place of the reading guide: a sidebar
    // has room for the map or for the essay about it, not for both.
    this.hintEl = el("p", "tufte-map-hint", m);
    this.hintEl.textContent = tt("hover a dot for its links, click to open");
    const guide = el("p", "tufte-map-guide", m);
    guide.textContent =
      tt("Notes that link to one another lie close together, and the land rises where notes crowd; a dot's area is its number of links.") +
      " " +
      fmt(tt("The red dot on each summit is that region's most connected note — hover a dot to see its links, click to open it, {mod}-hover for a preview."), { mod: mod });

    /* Find is no longer here: it moved to the strip above the sheet, where the
       toggle is, so the two controls are one arrangement in both
       presentations and the column starts with what it is for. */

    /* Summits ---------------------------------------------------------- */
    const peaks = el("section", "tufte-map-section tufte-map-section-summits", m);
    this.summitsHeadingEl = el("h3", "tufte-map-heading", peaks);
    this.summitsHeadingEl.textContent = tt("Summits");
    this.summitsEl = el("ul", "tufte-map-list tufte-map-summits", peaks);

    /* Folders ---------------------------------------------------------- */
    const folders = el("section", "tufte-map-section tufte-map-section-folders", m);
    this.foldersHeadingEl = el("h3", "tufte-map-heading", folders);
    this.foldersHeadingEl.textContent = tt("Folders");
    this.foldersEl = el("ul", "tufte-map-list tufte-map-folders", folders);

    /* Show ------------------------------------------------------------- */
    const show = el("section", "tufte-map-section tufte-map-section-show", m);
    el("h3", "tufte-map-heading", show).textContent = tt("Show");
    const row = el("p", "tufte-map-controls", show);
    this.bridgesEl = el("button", "tufte-map-text-control tufte-map-toggle", row);
    this.bridgesEl.setAttribute("type", "button");
    this.bridgesEl.textContent = tt("bridges");
    el("span", "tufte-map-sep", row).textContent = "·";
    this.allLinksEl = el("button", "tufte-map-text-control tufte-map-toggle", row);
    this.allLinksEl.setAttribute("type", "button");
    this.allLinksEl.textContent = tt("all links");
    el("span", "tufte-map-sep", row).textContent = "·";
    this.resetEl = el("button", "tufte-map-text-control", row);
    this.resetEl.setAttribute("type", "button");
    this.resetEl.textContent = tt("reset view");
    el("span", "tufte-map-sep", row).textContent = "·";
    this.redrawEl = el("button", "tufte-map-text-control", row);
    this.redrawEl.setAttribute("type", "button");
    this.redrawEl.textContent = tt("redraw");

    this.linklessEl = el("p", "tufte-map-linkless", m);
  }

  /* -- listeners -------------------------------------------------------- */

  registerListeners() {
    const sheet = this.sheetEl;
    this.registerDomEvent(sheet, "pointermove", (e) => this.onPointerMove(e));
    this.registerDomEvent(sheet, "pointerdown", (e) => this.onPointerDown(e));
    this.registerDomEvent(sheet, "pointerup", (e) => this.onPointerUp(e));
    this.registerDomEvent(sheet, "pointercancel", () => this.endDrag());
    this.registerDomEvent(sheet, "pointerleave", () => {
      if (!this.tapPinned) this.setHot(-1, null);
    });
    this.registerDomEvent(sheet, "dblclick", (e) => this.onDoubleClick(e));
    // Not passive: a ctrl-wheel that is allowed through zooms the whole app.
    this.registerDomEvent(sheet, "wheel", (e) => this.onWheel(e), { passive: false });
    this.registerDomEvent(this.rootEl, "keydown", (e) => this.onKeyDown(e));

    this.registerDomEvent(this.findEl, "input", () => {
      this.query = this.findEl.value;
      this.applyFilter();
    });
    this.registerDomEvent(this.findEl, "keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.findEl.value = "";
        this.query = "";
        this.applyFilter();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (this.filter && this.filter.best >= 0) {
          this.openNote(this.model.nodes[this.filter.best].path, e);
        }
      }
    });

    this.registerDomEvent(this.detailsEl, "click", () => this.toggleDetails());

    this.registerDomEvent(this.bridgesEl, "click", () => {
      this.plugin.settings.showBridges = !this.plugin.settings.showBridges;
      this.plugin.saveState();
      this.plugin.eachView((v) => v.refreshFromSettings("links"));
    });
    this.registerDomEvent(this.allLinksEl, "click", () => {
      this.plugin.settings.showAllLinks = !this.plugin.settings.showAllLinks;
      this.plugin.saveState();
      this.plugin.eachView((v) => v.refreshFromSettings("links"));
    });
    this.registerDomEvent(this.resetEl, "click", () => this.resetView());
    this.registerDomEvent(this.redrawEl, "click", () => this.recompute({ cold: true, reason: "redraw" }));

    this.registerEvent(this.app.metadataCache.on("resolved", () => this.onResolved()));
    this.registerEvent(this.app.workspace.on("css-change", () => this.onThemeChange()));
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      this.activePath = file && file.path ? file.path : null;
      this.markHere();
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.onMaybeShown()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.onMaybeShown()));

    if (typeof window.ResizeObserver === "function") {
      this.observer = new window.ResizeObserver(() => {
        if (this.timers.resize) window.clearTimeout(this.timers.resize);
        this.timers.resize = window.setTimeout(() => {
          this.timers.resize = 0;
          if (!this.closed && this.model) this.renderSheet();
        }, RESIZE_DEBOUNCE_MS);
      });
      // The CONTENT box, not the sheet: in a sidebar it is the pane's HEIGHT
      // that decides the sheet's size and its orientation, and the sheet's own
      // box is downstream of that.
      this.observer.observe(this.contentEl);
      this.observer.observe(this.sheetEl);
      this.register(() => { if (this.observer) this.observer.disconnect(); });
    }

    const f = this.app.workspace.getActiveFile && this.app.workspace.getActiveFile();
    this.activePath = f && f.path ? f.path : null;
  }

  isVisible() {
    try {
      if (this.containerEl && typeof this.containerEl.isShown === "function") {
        return this.containerEl.isShown();
      }
    } catch (e) {}
    return !!(this.sheetEl && this.sheetEl.clientWidth > 0);
  }

  onMaybeShown() {
    if (this.dirty && this.isVisible() && !this.busy) {
      this.dirty = false;
      this.recompute({ reason: "shown" }).catch((e) => console.error("tufte-map:", e));
    }
  }

  onResolved() {
    if (this.timers.resolved) window.clearTimeout(this.timers.resolved);
    this.timers.resolved = window.setTimeout(() => {
      this.timers.resolved = 0;
      if (this.closed) return;
      let h;
      try {
        h = TufteMapCore.graphHash(this.collectInput(),
          { exclude: parseExcludes(this.plugin.settings.excludeFolders) });
      } catch (e) { console.error("tufte-map: could not fingerprint the graph", e); return; }
      if (h === this.graphHash) return;
      if (!this.isVisible()) { this.dirty = true; return; }
      this.recompute({ reason: "resolved" }).catch((e) => console.error("tufte-map:", e));
    }, RESOLVED_DEBOUNCE_MS);
  }

  onThemeChange() {
    if (this.closed || !this.rootEl) return;
    this.theme = TufteMapRender.readTheme(this.rootEl);
    this.measure = TufteMapRender.makeMeasurer(this.rootEl);
    if (this.model) this.renderSheet();
  }

  /* -- computing -------------------------------------------------------- */

  collectInput() {
    const files = [];
    const list = this.app.vault.getMarkdownFiles() || [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const parent = f.parent;
      const dir = parent && parent.path && parent.path !== "/" ? parent.path : "";
      files.push({ path: f.path, basename: f.basename, folder: dir });
    }
    return { files: files, resolvedLinks: this.app.metadataCache.resolvedLinks || {} };
  }

  async recompute(opts) {
    opts = opts || {};
    const token = ++this.computeToken;
    this.busy = true;
    // Labels are measured on a canvas in the pane's face; measuring before an
    // embedded face has finished loading places them with fallback metrics
    // and draws them in the real ones, a box a hair off its text.
    try {
      const fonts = this.contentEl.ownerDocument.fonts;
      if (fonts && fonts.ready) await fonts.ready;
    } catch (e) { /* no Font Loading API: measure with what is there */ }
    if (token !== this.computeToken || this.closed) return;
    const input = this.collectInput();
    const exclude = parseExcludes(this.plugin.settings.excludeFolders);

    if (!input.files.length) {
      this.model = null;
      this.clearSheet();
      this.setStatus(tt("There are no Markdown files in this vault yet."));
      this.refreshMargin();
      this.busy = false;
      return;
    }

    const cache = this.plugin.cache;
    const warm = !opts.cold && cache && cache.positions && Object.keys(cache.positions).length > 0;
    this.setStatus(fmt(tt("Laying out {n} notes…"), { n: input.files.length }));

    const cancelled = () => this.closed || this.computeToken !== token;
    const hooks = {
      cancelled: cancelled,
      progress: (stage) => {
        if (cancelled()) return;
        const word = PROGRESS_STAGE[stage];
        this.setStatus(fmt(tt("Laying out {n} notes…"), { n: input.files.length }) +
          (word ? " " + tt(word) : ""));
      },
      // Yielding to the event loop is what keeps the pane alive — and, on a
      // slow vault, what lets a second request cancel the first at all.
      tick: () => new Promise((r) => window.setTimeout(r, 0))
    };

    let model;
    try {
      model = await TufteMapCore.computeMap(input, {
        exclude: exclude,
        prevFrameW: warm ? (cache.frameW || 0) : 0
      }, this.measure || TufteMapCore.approximateMeasurer,
        warm ? cache.positions : null, hooks);
    } catch (e) {
      this.busy = false;
      if (e && e.name === "MapCancelled") return;
      console.error("tufte-map: the map could not be computed", e);
      if (!cancelled()) this.setStatus(tt("Could not draw the map — see the console for details."));
      return;
    }
    this.busy = false;
    if (cancelled()) return;

    this.model = model;
    this.graphHash = model.hash;
    this.prepare();
    this.plugin.rememberLayout(model);
    // A recompute keeps the reader's zoom when it still fits the new frame;
    // the map is allowed to change, but not to jump back to the whole sheet
    // under someone who was looking at one hill.
    // A new model invalidates its rotated view; the viewport is kept only
    // when it still means something, which is when the sheet is upright.
    this.rotModel = null;
    this.drawModel = null;
    this.viewport = this.rotated ? null : (this.viewport
      ? TufteMapCore.clampViewport(this.viewport, model.frameW, model.frameH)
      : null);
    this.renderAll();
  }

  /** Everything derived from a model that the interactions need. */
  prepare() {
    const nodes = this.model.nodes;
    const n = nodes.length;
    const adj = new Array(n);
    for (let i = 0; i < n; i++) adj[i] = [];
    const edges = this.model.edges;
    const seen = new Set();
    for (let e = 0; e < edges.length; e++) {
      const a = edges[e][0], b = edges[e][1];
      const k = a < b ? a + "," + b : b + "," + a;
      if (seen.has(k)) continue;
      seen.add(k);
      adj[a].push(b); adj[b].push(a);
    }
    this.adj = adj;

    this.pathIndex = new Map();
    for (let i = 0; i < n; i++) this.pathIndex.set(nodes[i].path, i);

    const dirs = new Array(n);
    for (let i = 0; i < n; i++) dirs[i] = TufteMapCore.dirOfPath(nodes[i].path);
    this.folders = TufteMapCore.folderRows(dirs, {
      rootLabel: tt("Vault root"), otherLabel: tt("other")
    });
    this.folderKeys = new Array(n);
    for (let i = 0; i < n; i++) this.folderKeys[i] = TufteMapCore.folderKeyOf(dirs[i], this.folders.depth);

    // Pins that name something the new model does not have are dropped rather
    // than left to filter everything away invisibly.
    const liveFolders = new Set();
    for (const r of this.folders.rows) for (const k of r.keys) liveFolders.add(k);
    for (const k of Array.from(this.pinnedFolders)) if (!liveFolders.has(k)) this.pinnedFolders.delete(k);
    for (const p of Array.from(this.pinnedSummits)) if (p >= this.model.peaks.length) this.pinnedSummits.delete(p);
    this.isolate = null;
    this.hot = -1;
    this.tapPinned = false;
  }

  /* -- drawing ---------------------------------------------------------- */

  renderAll() {
    this.refreshMargin();
    this.computeFilter();
    this.renderSheet();
  }

  clearSheet() {
    while (this.canvasEl.firstChild) this.canvasEl.removeChild(this.canvasEl.firstChild);
    this.svg = null;
    this.index = null;
  }

  sheetWidthPt() {
    const px = Math.max(this.canvasEl.clientWidth || this.sheetEl.clientWidth || 0, 240);
    return px * TufteMapCore.constants.PT_PER_CSS_PX;
  }

  /** The model the SHEET is drawn from: the vault's model, possibly turned on
   *  its side and possibly with its contour bands thinned.  Every coordinate
   *  the interactions use — the hit index, the viewport, the leaders the view
   *  draws itself — is in this model's space. */
  geo() { return this.drawModel || this.model; }

  currentViewport() {
    const m = this.geo();
    return this.viewport || { x: 0, y: 0, w: m.frameW, h: m.frameH, zoom: 1 };
  }

  /** The box the sheet has to live in, in CSS pixels.  In a sidebar the pane's
   *  HEIGHT is the scarce dimension and the sheet may not ask for a scrollbar,
   *  so the height available — the pane less the strip, the band and the
   *  padding — is measured rather than assumed. */
  sheetBox() {
    const host = this.contentEl;
    const width = Math.max(this.sheetEl.clientWidth || host.clientWidth || 0, 120);
    const win = host.ownerDocument.defaultView;
    let height = 0;
    try {
      const cs = win.getComputedStyle(this.rootEl);
      const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const gap = parseFloat(cs.rowGap || cs.gap) || 0;
      // The box is the pane less its padding and the control strip, and it is
      // the SAME box whether the details are shown or not.  The band was
      // allowed to take its height out of the map once: at 436 x 470 the sheet
      // fell to about 150 pt and two summit names stacked on one another.  A
      // band has somewhere to go — the view content scrolls — and a map does
      // not.  Keeping the box fixed also means toggling the details, or
      // re-mounting the view, cannot move a single label.
      height = (host.clientHeight || 0) - padV - (this.stripEl.offsetHeight || 0) - gap;
    } catch (e) { height = 0; }
    // A pane with no height of its own (the harness, a hidden tab) keeps
    // today's behaviour: as tall as the frame makes it.
    if (!(height > 0)) height = width * (this.model ? this.model.frameH / this.model.frameW : 0.6);
    return { w: width, h: Math.max(height, 140) };
  }

  renderSheet() {
    const m = this.model;
    if (!m || this.closed) return;
    if (!m.counts.placed) {
      this.clearSheet();
      this.setStatus(tt("No links yet — the map draws itself from links between notes."));
      return;
    }
    const doc = this.contentEl.ownerDocument;
    const C = TufteMapCore.constants;
    const mode = this.applyPresentation();
    const compact = mode === "compact";

    /* -- the sheet's box and its orientation ----------------------------- */
    const box = this.sheetBox();
    const fit = TufteMapCore.fitSheet(m.frameW, m.frameH, box.w, box.h);
    // Only the compact sheet is allowed to turn: a wide pane has the width the
    // frame was designed for, and a reader who is happy with their map should
    // not find it rotated because they dragged a divider.
    const rotated = compact && fit.rotated;
    if (rotated !== this.rotated) {
      this.rotated = rotated;
      this.rotModel = null;
      this.viewport = null;        // the viewport is in the drawn model's space
    }
    const oriented = rotated
      ? (this.rotModel || (this.rotModel = TufteMapCore.rotateModel(m))) : m;

    let widthPx;
    if (compact) {
      // Fitted, centred, and never wider than the pane: a sheet that needs a
      // sideways scrollbar is a sheet that has misread its container.
      widthPx = Math.max(120, Math.min(box.w, Math.round(fit.widthPx)));
      this.canvasEl.style.width = widthPx + "px";
      this.canvasEl.style.marginInline = "auto";
    } else {
      this.canvasEl.style.width = "";
      this.canvasEl.style.marginInline = "";
      widthPx = Math.max(this.canvasEl.clientWidth || this.sheetEl.clientWidth || 0, 240);
    }
    const widthPt = widthPx * C.PT_PER_CSS_PX;
    // ...and the sheet's SCALE, which the orientation may not change: the
    // drawn length of the frame's long axis.  Upright that is the width;
    // turned it is the height, and it is the same number.
    const drawnHeightPx = widthPx * oriented.frameH / oriented.frameW;
    const designPt = Math.max(widthPx, drawnHeightPx) * C.PT_PER_CSS_PX;

    /* -- Töpfer: what a sheet this size may carry ------------------------ */
    const vp = this.currentViewport();
    const zoom = vp.zoom || (oriented.frameW / Math.max(vp.w, 1e-9));
    // The effective sheet width is the scale of the drawing: zooming in shows
    // less map on the same paper, which is the same thing as a wider sheet.
    const effPt = designPt * zoom;
    const tiers = TufteMapCore.labelTiers(effPt, this.plugin.settings.textFadeThreshold || 0);

    // Thin the contour web with the same square root.  The bands are a SUBSET
    // of the model's own twelve, so the quantised terrain raster and the lines
    // agree on where a band edge is.
    let drawModel = oriented;
    const bands = compact ? TufteMapCore.contourBands(designPt) : C.TERRAIN_BANDS;
    if (bands < C.TERRAIN_BANDS) {
      const levels = TufteMapCore.reduceLevels(oriented.levels, bands);
      drawModel = Object.assign({}, oriented, {
        levels: levels,
        contours: TufteMapCore.reduceContours(oriented.contours, levels)
      });
    }
    this.drawModel = drawModel;
    this.bands = bands;

    // The scale follows the pane, not the zoom: zooming magnifies the map and
    // leaves the marks the size they were designed to be at this pane width.
    const scale = TufteMapCore.designScale(designPt);
    const dots = TufteMapCore.dotSizing(drawModel, scale, designPt, compact);

    // The budget.  In the full presentation it is the rule the reader already
    // has: the setting counts names for the WHOLE sheet, so the number of
    // notes ELIGIBLE to be named grows with the area shown or zooming in would
    // name fewer notes, not more.  In compact it is Töpfer's: the number of
    // features a smaller-scale sheet may carry falls with the square root of
    // the scale, and below the minor tier's fade threshold it is none at all.
    const budget = compact
      ? TufteMapCore.topferBudget(this.plugin.settings.namedNotes, effPt)
      : Math.max(1, Math.min(
        Math.round(this.plugin.settings.namedNotes * zoom * zoom), NAMED_ZOOM_CAP));

    let layout;
    try {
      layout = TufteMapCore.placeLabels(drawModel, this.measure || TufteMapCore.approximateMeasurer, {
        sheetWidthPt: widthPt,
        designWidthPt: designPt,
        viewport: { x: vp.x, y: vp.y, w: vp.w, h: vp.h },
        maxMinor: budget,
        scale: scale,
        compact: compact,
        zoom: zoom,
        tiers: tiers,
        dots: dots
      });
    } catch (e) {
      // The placer throws when one of its own invariants breaks.  A sheet with
      // no names is a poor map; a sheet that does not appear is no map at all.
      console.error("tufte-map: label placement failed; drawing the sheet unlabelled", e);
      layout = { labels: [], leaders: [], masks: [], dropped: [], fallbacks: [],
        sheetWidthPt: widthPt, viewport: vp, mapPerPt: vp.w / widthPt, scale: scale,
        compact: compact, tiers: tiers, dots: dots };
    }

    // Built detached and swapped in one move, so the reader never sees the
    // sheet blank between two drawings of it.
    const holder = doc.createElement("div");
    TufteMapRender.draw(holder, drawModel, layout, this.theme, {
      sheetWidthPt: widthPt, viewport: { x: vp.x, y: vp.y, w: vp.w, h: vp.h }, scale: scale,
      compact: compact, tiers: tiers, dots: dots
    });
    const svg = holder.firstElementChild;
    this.clearSheet();
    this.canvasEl.appendChild(svg);
    this.svg = svg;
    this.svg.style.transform = "";
    this.layout = layout;
    this.drawnViewport = { x: vp.x, y: vp.y, w: vp.w, h: vp.h };

    if (compact) this.fitBand(drawnHeightPx);
    this.indexSheet();
    this.buildLayers();
    this.applyClasses();
    this.markHere();
    this.relightHot();
    this.setStatus("");
  }

  /** How the band is read.  Ordinarily it takes the height the sheet left and
   *  scrolls inside itself, so opening it moves neither the strip nor the
   *  sheet.  When what is left is too short to scroll — a pane barely taller
   *  than its map — the column grows and the VIEW scrolls instead, which is
   *  the one case where a scrollbar may touch the sheet's width. */
  fitBand(sheetHeightPx) {
    let left = 0;
    try {
      const cs = this.contentEl.ownerDocument.defaultView.getComputedStyle(this.rootEl);
      const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const gap = parseFloat(cs.rowGap || cs.gap) || 0;
      left = (this.contentEl.clientHeight || 0) - padV - (this.stripEl.offsetHeight || 0) -
        gap - sheetHeightPx - gap;
    } catch (e) { left = 0; }
    const tight = this.detailsShown() && left < BAND_MIN_PX;
    this.rootEl.classList.toggle("tufte-map-band-tight", tight);
    this.contentEl.classList.toggle("tufte-map-view-tight", tight);
    this.bandHeightPx = Math.max(0, Math.round(left));
    return tight;
  }

  /** Element references by node index, and the screen positions the hit test
   *  needs.  Both are rebuilt with the sheet and nowhere else. */
  indexSheet() {
    // Elements are indexed by NODE index, which the rotation does not change;
    // the coordinates are read from the drawn model, which it does.
    const m = this.geo();
    const n = m.nodes.length;
    this.dotEls = new Array(n);
    this.labelEls = new Array(n);
    this.leaderEls = new Array(n);
    const take = (sel, into) => {
      const list = this.svg.querySelectorAll(sel);
      for (let k = 0; k < list.length; k++) {
        const raw = list[k].getAttribute("data-i");
        if (raw === null || raw === "") continue;
        const i = +raw;
        if (!(i >= 0 && i < n)) continue;
        if (into === this.labelEls) {
          if (!this.labelEls[i]) this.labelEls[i] = [];
          this.labelEls[i].push(list[k]);
        } else {
          into[i] = list[k];
        }
      }
    };
    take(".tufte-map-dot", this.dotEls);
    take(".tufte-map-label", this.labelEls);
    take(".tufte-map-leader", this.leaderEls);

    const vp = this.drawnViewport;
    const w = this.canvasEl.clientWidth || 1;
    const h = w * vp.h / vp.w;
    const xs = new Float64Array(n), ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = (m.nodes[i].x - vp.x) / vp.w * w;
      ys[i] = (vp.y + vp.h - m.nodes[i].y) / vp.h * h;
    }
    this.screen = { xs: xs, ys: ys, w: w, h: h };
    this.index = TufteMapCore.buildScreenIndex(xs, ys, TufteMapCore.constants.HIT_RADIUS_PX);
  }

  /** The three groups the view owns inside the renderer's sheet. */
  buildLayers() {
    const doc = this.svg.ownerDocument;
    const dots = this.svg.querySelector(".tufte-map-dots");
    const mk = (cls, before) => {
      const g = doc.createElementNS(SVG_NS, "g");
      g.setAttribute("class", cls);
      if (before) this.svg.insertBefore(g, before); else this.svg.appendChild(g);
      return g;
    };
    this.bridgeLayer = mk("tufte-map-bridges", dots);
    this.linkLayer = mk("tufte-map-links", dots);
    this.hotLinkLayer = mk("tufte-map-hotlinks", dots);
    this.markLayer = mk("tufte-map-marks", null);
    this.drawAllLinks();
  }

  /** Map units to sheet points, for anything the view draws itself. */
  toSheet(x, y) {
    const vp = this.drawnViewport;
    const S = this.layout.sheetWidthPt / vp.w;
    return [(x - vp.x) * S, (vp.y + vp.h - y) * S];
  }

  drawAllLinks() {
    const g = this.linkLayer;
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    // The bridges share this layer's geometry and its switch, so they are
    // redrawn whenever it is.
    this.drawBridges();
    if (!this.plugin.settings.showAllLinks) return;
    const m = this.geo();
    const doc = this.svg.ownerDocument;
    // One path for the whole edge set.  Eighteen hundred <line> elements is a
    // slow sheet and a slow hover; eighteen hundred subpaths is one element.
    let d = "";
    for (let e = 0; e < m.edges.length; e++) {
      const a = this.toSheet(m.nodes[m.edges[e][0]].x, m.nodes[m.edges[e][0]].y);
      const b = this.toSheet(m.nodes[m.edges[e][1]].x, m.nodes[m.edges[e][1]].y);
      d += "M" + a[0].toFixed(1) + " " + a[1].toFixed(1) +
        "L" + b[0].toFixed(1) + " " + b[1].toFixed(1);
    }
    const p = doc.createElementNS(SVG_NS, "path");
    p.setAttribute("class", "tufte-map-alllink");
    p.setAttribute("d", d);
    p.setAttribute("stroke", this.theme.ink);
    p.setAttribute("stroke-opacity", String(ALL_LINK_ALPHA));
    p.setAttribute("fill", "none");
    p.setAttribute("stroke-width",
      (TufteMapCore.constants.CONTOUR_LW_PT / TufteMapCore.constants.PT_PER_CSS_PX).toFixed(3));
    g.appendChild(p);
  }

  /**
   * The bridges: the links between two summit regions, as one faint path —
   * or two while a filter is on.
   *
   * Redrawn with the all-links layer (the geometry changed: zoom, pan,
   * rotation, a new model) and when the filter changes, and at no other time.
   * Under a filter the set is split in two: a bridge with at least one end
   * still on the map stays at full bridge strength, so isolating a summit
   * shows where it reaches the other mountains, and the rest are dimmed with
   * everything else the filter took away.  The split has to be two elements,
   * because the dimming is an opacity and an opacity belongs to an element,
   * not to a subpath.
   *
   * Not drawn at all while "all links" is on: every bridge is already among
   * all the links, and drawing it twice would make the bridges the darkest
   * lines on the sheet for no reason the reader could see.
   */
  drawBridges() {
    const g = this.bridgeLayer;
    this.bridgeFilter = this.filter;
    if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    if (!this.plugin.settings.showBridges || this.plugin.settings.showAllLinks || !this.model) return;
    if (this.bridgeModel !== this.model) {
      this.bridges = TufteMapCore.bridgeEdges(this.model);
      this.bridgeModel = this.model;
    }
    const m = this.geo();
    const doc = this.svg.ownerDocument;
    const f = this.filter && this.filter.active ? this.filter : null;
    let kept = "", dimmed = "";
    for (let e = 0; e < this.bridges.length; e++) {
      const i = this.bridges[e][0], j = this.bridges[e][1];
      const a = this.toSheet(m.nodes[i].x, m.nodes[i].y);
      const b = this.toSheet(m.nodes[j].x, m.nodes[j].y);
      const seg = "M" + a[0].toFixed(1) + " " + a[1].toFixed(1) +
        "L" + b[0].toFixed(1) + " " + b[1].toFixed(1);
      if (!f || f.visible[i] || f.visible[j]) kept += seg; else dimmed += seg;
    }
    // Each set is drawn twice: once clipped to the water at the full bridge
    // strength, once clipped to the land at the lighter one.  Both copies
    // carry the same classes, so the hover and filter rules dim them alike.
    // With no coast on the sheet everything is water and the land copy is
    // not drawn at all.
    const clips = this.buildBridgeClips();
    const add = (d, keep, clipId, alpha) => {
      if (!d) return;
      const p = doc.createElementNS(SVG_NS, "path");
      p.setAttribute("class", "tufte-map-bridge" + (keep ? " tufte-map-keep" : ""));
      p.setAttribute("d", d);
      p.setAttribute("stroke", this.theme.ink);
      p.setAttribute("stroke-opacity", String(alpha));
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-width",
        (TufteMapCore.constants.CONTOUR_LW_PT / TufteMapCore.constants.PT_PER_CSS_PX).toFixed(3));
      if (clipId) p.setAttribute("clip-path", "url(#" + clipId + ")");
      g.appendChild(p);
    };
    for (const [d, keep] of [[kept, true], [dimmed, false]]) {
      add(d, keep, clips ? clips.water : null, BRIDGE_LINK_ALPHA);
      if (clips) add(d, keep, clips.land, BRIDGE_LAND_ALPHA);
    }
  }

  /** Replace the bridges' land and water clipPaths in the sheet's <defs>;
   *  null when the sheet has no coast (all water, nothing to clip). */
  buildBridgeClips() {
    for (const el of this.bridgeClipEls) if (el.parentNode) el.parentNode.removeChild(el);
    this.bridgeClipEls = [];
    const defs = this.svg && this.svg.querySelector("defs");
    const vp = this.drawnViewport;
    if (!defs || !vp || !this.layout) return null;
    const W = this.layout.sheetWidthPt, H = W * vp.h / vp.w;
    const made = coastClipPaths(this.svg.ownerDocument, this.geo().contours, (x, y) => this.toSheet(x, y),
      W, H, this.model.hash);
    if (!made) return null;
    defs.appendChild(made.landEl);
    defs.appendChild(made.waterEl);
    this.bridgeClipEls = [made.landEl, made.waterEl];
    return { land: made.land, water: made.water };
  }

  /* -- filters ---------------------------------------------------------- */

  /** Hover on a margin row ISOLATES: it replaces the pins rather than joining
   *  them, because "show me this one" is what the gesture means. */
  activeGroups() {
    if (this.isolate) {
      return this.isolate.kind === "summit"
        ? { summits: this.isolate.keys, folders: null }
        : { summits: null, folders: this.isolate.keys };
    }
    return {
      summits: this.pinnedSummits.size ? Array.from(this.pinnedSummits) : null,
      folders: this.pinnedFolders.size ? Array.from(this.pinnedFolders) : null
    };
  }

  computeFilter() {
    if (!this.model) { this.filter = null; return; }
    const g = this.activeGroups();
    this.filter = TufteMapCore.filterNotes(this.model.nodes, {
      query: this.query,
      summits: g.summits,
      folders: g.folders,
      folderKeys: this.folderKeys
    });
  }

  applyFilter() {
    this.computeFilter();
    this.applyClasses();
    this.refreshCounts();
    if (this.hot >= 0 && this.filter && !this.filter.visible[this.hot]) this.setHot(-1, null);
  }

  /** The O(n) pass, run only when a filter actually changes. */
  applyClasses() {
    if (!this.svg || !this.filter) return;
    const root = this.rootEl;
    const active = this.filter.active;
    root.classList.toggle("tufte-map-has-filter", active);
    const vis = this.filter.visible;
    for (let i = 0; i < this.dotEls.length; i++) {
      const on = !active || !!vis[i];
      const d = this.dotEls[i];
      if (d) d.classList.toggle("tufte-map-keep", on);
      const ls = this.labelEls[i];
      if (ls) for (let k = 0; k < ls.length; k++) ls[k].classList.toggle("tufte-map-keep", on);
      const le = this.leaderEls[i];
      if (le) le.classList.toggle("tufte-map-keep", on);
    }
    for (const row of this.summitRows || []) {
      row.el.classList.toggle("tufte-map-pinned", this.pinnedSummits.has(row.peak));
    }
    for (const row of this.folderRowEls || []) {
      row.el.classList.toggle("tufte-map-pinned", row.keys.every((k) => this.pinnedFolders.has(k)));
    }
    this.allLinksEl.classList.toggle("tufte-map-on", !!this.plugin.settings.showAllLinks);
    this.bridgesEl.classList.toggle("tufte-map-on", !!this.plugin.settings.showBridges);
    // A new filter object means the filter changed; the bridges are split by
    // it, so they are rebuilt then and only then.
    if (this.bridgeFilter !== this.filter) this.drawBridges();
  }

  /* -- the hot note ----------------------------------------------------- */

  setHot(i, evt) {
    if (i === this.hot) return;
    for (const k of this.litSet) {
      const d = this.dotEls[k];
      if (d) d.classList.remove("tufte-map-lit");
      const ls = this.labelEls[k];
      if (ls) for (let t = 0; t < ls.length; t++) ls[t].classList.remove("tufte-map-lit");
      const le = this.leaderEls[k];
      if (le) le.classList.remove("tufte-map-lit");
    }
    this.litSet = [];
    if (this.hotLinkLayer) {
      while (this.hotLinkLayer.firstChild) this.hotLinkLayer.removeChild(this.hotLinkLayer.firstChild);
    }
    this.hot = i;
    if (i < 0) {
      this.rootEl.classList.remove("tufte-map-has-hot");
      this.drawMarks();
      return;
    }
    this.rootEl.classList.add("tufte-map-has-hot");
    // O(degree): the note, its neighbours, and nothing else is touched.  The
    // rest of the sheet is dimmed by one class on the root.
    const lit = [i];
    const nb = this.adj[i] || [];
    for (let k = 0; k < nb.length; k++) lit.push(nb[k]);
    for (const k of lit) {
      const d = this.dotEls[k];
      if (d) d.classList.add("tufte-map-lit");
      const ls = this.labelEls[k];
      if (ls) for (let t = 0; t < ls.length; t++) ls[t].classList.add("tufte-map-lit");
      const le = this.leaderEls[k];
      if (le) le.classList.add("tufte-map-lit");
    }
    this.litSet = lit;
    this.hotModel = this.model;
    this.drawHotLinks(i, nb);
    this.drawMarks();
    if (evt) this.triggerHoverLink(i, evt);
  }

  /**
   * Light the hot note again on a sheet that has just been redrawn.
   *
   * A redraw — the settle after a zoom, a resize, a recompute — replaces every
   * dot, label and leader, and the lit classes leave with the old elements
   * while the root still carries `tufte-map-has-hot`.  Left alone, the whole
   * sheet sat dimmed with nothing lit, and it stayed that way while the
   * pointer rested on the same note, because setHot() treats the note it
   * already has as a no-op.  So the same indices are lit on the new elements
   * — or, when a new model has arrived and an index no longer means the same
   * note, the hover is let go.
   */
  relightHot() {
    if (this.hot < 0) return;
    if (this.hotModel !== this.model) { this.setHot(-1, null); return; }
    for (const k of this.litSet) {
      const d = this.dotEls[k];
      if (d) d.classList.add("tufte-map-lit");
      const ls = this.labelEls[k];
      if (ls) for (let t = 0; t < ls.length; t++) ls[t].classList.add("tufte-map-lit");
      const le = this.leaderEls[k];
      if (le) le.classList.add("tufte-map-lit");
    }
    this.drawHotLinks(this.hot, this.adj[this.hot] || []);
    this.drawMarks();
  }

  drawHotLinks(i, nb) {
    const g = this.hotLinkLayer;
    if (!g) return;
    const doc = this.svg.ownerDocument;
    const m = this.geo();
    const a = this.toSheet(m.nodes[i].x, m.nodes[i].y);
    let d = "";
    for (let k = 0; k < nb.length; k++) {
      const b = this.toSheet(m.nodes[nb[k]].x, m.nodes[nb[k]].y);
      d += "M" + a[0].toFixed(1) + " " + a[1].toFixed(1) +
        "L" + b[0].toFixed(1) + " " + b[1].toFixed(1);
    }
    if (!d) return;
    const p = doc.createElementNS(SVG_NS, "path");
    p.setAttribute("class", "tufte-map-hotlink");
    p.setAttribute("d", d);
    p.setAttribute("stroke", this.theme.ink);
    p.setAttribute("stroke-opacity", String(HOT_LINK_ALPHA));
    p.setAttribute("fill", "none");
    p.setAttribute("stroke-width",
      (TufteMapCore.constants.CONTOUR_LW_PT / TufteMapCore.constants.PT_PER_CSS_PX).toFixed(3));
    g.appendChild(p);
  }

  /** The hot ring and the you-are-here ring, both drawn in points so they
   *  keep their size on screen at every zoom. */
  drawMarks() {
    const g = this.markLayer;
    if (!g || !this.model) return;
    const doc = this.svg.ownerDocument;
    while (g.firstChild) g.removeChild(g.firstChild);
    // The marks the view draws itself must use the sheet's own scale, or a
    // narrow pane rings a scaled-down dot with a full-sized halo.
    const scale = (this.layout && this.layout.scale > 0) ? this.layout.scale : 1;
    const geo = this.geo();
    const ring = (i, cls, pad) => {
      const nd = geo.nodes[i];
      const p = this.toSheet(nd.x, nd.y);
      const c = doc.createElementNS(SVG_NS, "circle");
      c.setAttribute("class", cls);
      c.setAttribute("cx", p[0].toFixed(2));
      c.setAttribute("cy", p[1].toFixed(2));
      // The ring hugs the DRAWN disc, floor and ceiling included.
      const dots = (this.layout && this.layout.dots) || null;
      c.setAttribute("r",
        (TufteMapCore.dotRadiusPt(nd.deg, scale, dots) + pad * scale).toFixed(2));
      c.setAttribute("fill", "none");
      g.appendChild(c);
    };
    if (this.hot >= 0) {
      ring(this.hot, "tufte-map-hot-ring", HOT_RING_PAD_PT);
      this.drawHoverName(this.hot, g, scale, geo);
    }
    const here = this.activePath !== null && this.pathIndex
      ? this.pathIndex.get(this.activePath) : undefined;
    if (here !== undefined && here !== this.hot) ring(here, "tufte-map-here-ring", HERE_RING_PAD_PT);
  }

  /**
   * The hot note's title, set on the sheet beside its dot — what the pop-up
   * used to say, minus everything the reader did not need while pointing.
   *
   * Drawn in the marks layer, above everything, and from drawMarks(), so a
   * redraw, a zoom or relightHot() puts it back with the ring.  It is set like
   * a minor label — the sheet's italic tier, at that tier's size for this
   * scale and presentation, with the same paper halo — but in ink rather than
   * muted, since it is the note in focus.  To the right of the drawn disc,
   * centred on it; to the left when it would run off the sheet.  A note whose
   * own name is already showing (a summit name, or a minor label at least
   * half faded in) gets none: its label is lit already, and a second copy
   * beside it is a stutter.  A summit shown only as its numeral is named.
   */
  drawHoverName(i, g, scale, geo) {
    const L = this.layout;
    if (!L) return;
    const tiers = L.tiers || {};
    for (const lb of L.labels || []) {
      if (lb.note !== i) continue;
      if (lb.tier === "summit" && (tiers.name === undefined ? 1 : tiers.name) >= 0.5) return;
      if (lb.tier === "minor" && (tiers.minor === undefined ? 1 : tiers.minor) >= 0.5) return;
    }
    const nd = geo.nodes[i];
    const title = String(nd.title || "").trim();
    if (!title) return;
    const sizePt = L.minorPt > 0 ? L.minorPt : TufteMapCore.constants.MINOR_PT * scale;
    const measure = this.measure || TufteMapCore.approximateMeasurer;
    let m;
    try { m = measure(title, { sizePt: sizePt, italic: true, trackingEm: 0 }); } catch (e) { m = null; }
    if (!m) m = TufteMapCore.approximateMeasurer(title, { sizePt: sizePt, italic: true, trackingEm: 0 });
    const p = this.toSheet(nd.x, nd.y);
    const off = TufteMapCore.dotRadiusPt(nd.deg, scale, L.dots || null) + HOVER_NAME_GAP_PT * scale;
    let x = p[0] + off, anchor = "start";
    if (x + m.width > L.sheetWidthPt) { x = p[0] - off; anchor = "end"; }
    // A long title on a narrow sheet can overrun both edges; then it starts
    // at the left edge rather than losing its first letters off the sheet.
    if (anchor === "end" && x - m.width < 0) { x = 0; anchor = "start"; }
    // `descent` is negative, so the glyph box's middle sits (ascent + descent)
    // / 2 above the baseline; put that middle on the dot.
    const y = p[1] + (m.ascent + m.descent) / 2;
    const doc = this.svg.ownerDocument;
    const t = doc.createElementNS(SVG_NS, "text");
    t.setAttribute("class", "tufte-map-hover-name");
    t.setAttribute("x", x.toFixed(2));
    t.setAttribute("y", y.toFixed(2));
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("font-size", sizePt.toFixed(3));
    t.setAttribute("stroke-width", (TufteMapCore.constants.HALO_LW_PT * scale).toFixed(3));
    t.textContent = title;                              // textContent, always
    g.appendChild(t);
  }

  markHere() {
    if (this.svg && this.model) this.drawMarks();
  }

  triggerHoverLink(i, evt) {
    const el = this.dotEls[i];
    if (!el) return;
    try {
      this.app.workspace.trigger("hover-link", {
        event: evt,
        source: VIEW_TYPE,
        hoverParent: this,
        targetEl: el,
        linktext: this.model.nodes[i].path,
        sourcePath: ""
      });
    } catch (e) { /* a preview that does not appear is not worth a broken hover */ }
  }

  /* -- pointer ---------------------------------------------------------- */

  localPoint(evt) {
    const box = this.canvasEl.getBoundingClientRect();
    return { x: evt.clientX - box.left, y: evt.clientY - box.top, box: box };
  }

  mapPoint(evt) {
    const p = this.localPoint(evt);
    const vp = this.drawnViewport || this.currentViewport();
    const w = p.box.width || 1, h = p.box.height || 1;
    return { x: vp.x + (p.x / w) * vp.w, y: vp.y + vp.h - (p.y / h) * vp.h };
  }

  hitTest(evt) {
    if (!this.index) return -1;
    const p = this.localPoint(evt);
    const vis = this.filter && this.filter.active ? this.filter.visible : null;
    return this.index.nearest(p.x, p.y, TufteMapCore.constants.HIT_RADIUS_PX,
      vis ? (i) => !!vis[i] : null);
  }

  onPointerMove(evt) {
    this.pointerType = evt.pointerType || "mouse";
    if (this.drag) { this.dragTo(evt); return; }
    if (this.tapPinned) return;
    if (evt.pointerType === "touch") return;
    this.setHot(this.hitTest(evt), evt);
  }

  onPointerDown(evt) {
    this.pointerType = evt.pointerType || "mouse";
    if (evt.button !== undefined && evt.button !== 0) return;
    const vp = this.currentViewport();
    if (vp.zoom > 1.0001) {
      this.drag = { x: evt.clientX, y: evt.clientY, from: vp, moved: false };
      try { this.sheetEl.setPointerCapture(evt.pointerId); } catch (e) {}
    }
  }

  dragTo(evt) {
    const box = this.canvasEl.getBoundingClientRect();
    const w = box.width || 1, h = box.height || 1;
    const vp = this.drag.from;
    const dx = -(evt.clientX - this.drag.x) / w * vp.w;
    const dy = (evt.clientY - this.drag.y) / h * vp.h;
    if (Math.abs(evt.clientX - this.drag.x) > 2 || Math.abs(evt.clientY - this.drag.y) > 2) {
      this.drag.moved = true;
      this.setHot(-1, null);
    }
    const geo = this.geo();
    this.setViewport(TufteMapCore.panViewport(vp, geo.frameW, geo.frameH, dx, dy), true);
  }

  endDrag() {
    if (!this.drag) return;
    const moved = this.drag.moved;
    this.drag = null;
    if (moved) this.settle();
    return moved;
  }

  onPointerUp(evt) {
    const dragged = this.endDrag();
    if (dragged) return;
    if (!this.model) return;
    const i = this.hitTest(evt);
    if (evt.pointerType === "touch") {
      // First tap picks the note up — lights it and its neighbours and names
      // it on the sheet; a second tap on the SAME note opens it; a tap
      // anywhere else puts it down.  A touch that opened on the first tap
      // would open a note every time a finger brushed the sheet, and with the
      // pop-up gone (and its Open button with it) the second tap is the one
      // way a finger has of opening a note.
      if (i < 0) { this.tapPinned = false; this.setHot(-1, null); return; }
      if (this.tapPinned && i === this.hot) { this.openNote(this.model.nodes[i].path, evt); return; }
      this.tapPinned = true;
      this.hot = -1;
      this.setHot(i, evt);
      return;
    }
    if (i < 0) return;
    this.openNote(this.model.nodes[i].path, evt);
  }

  onDoubleClick(evt) {
    if (!this.model) return;
    evt.preventDefault();
    const p = this.mapPoint(evt);
    const geo = this.geo();
    this.setViewport(TufteMapCore.zoomViewportAbout(this.currentViewport(),
      geo.frameW, geo.frameH, TufteMapCore.constants.ZOOM_STEP, p.x, p.y), false);
  }

  onWheel(evt) {
    if (!this.model) return;
    // A trackpad pinch arrives as a wheel with ctrlKey set; a plain wheel is
    // left alone so the pane scrolls as every other pane does.
    if (!evt.ctrlKey && !evt.metaKey) return;
    evt.preventDefault();
    const p = this.mapPoint(evt);
    const factor = Math.exp(-evt.deltaY * 0.01);
    const geo = this.geo();
    this.setViewport(TufteMapCore.zoomViewportAbout(this.currentViewport(),
      geo.frameW, geo.frameH, factor, p.x, p.y), true);
  }

  onKeyDown(evt) {
    if (evt.key === "0" && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
      evt.preventDefault();
      this.resetView();
    } else if (evt.key === "Escape") {
      if (this.tapPinned) { this.tapPinned = false; this.setHot(-1, null); }
    }
  }

  resetView() {
    this.viewport = null;
    if (this.timers.gesture) { window.clearTimeout(this.timers.gesture); this.timers.gesture = 0; }
    this.renderSheet();
  }

  /**
   * Move the viewport.
   *
   * A gesture gets an immediate CSS transform of the whole sheet and a redraw
   * when it settles.  Redrawing on every wheel tick would mean re-placing the
   * labels and re-rastering the terrain sixty times a second, which no vault
   * can do; transforming is one composited paint.  The cost is that during
   * those hundred and eighty milliseconds the dots and the type scale with the
   * paper instead of holding their size — and the moment the gesture stops,
   * the redraw puts every one of them back at its true size, re-rasters the
   * terrain for the new viewport so the band edges are crisp again, and
   * re-places the labels, which is what makes zooming in NAME MORE NOTES.
   */
  setViewport(vp, gesture) {
    this.viewport = vp;
    if (!gesture) {
      if (this.timers.gesture) { window.clearTimeout(this.timers.gesture); this.timers.gesture = 0; }
      this.renderSheet();
      return;
    }
    this.previewTransform();
    if (this.timers.gesture) window.clearTimeout(this.timers.gesture);
    this.timers.gesture = window.setTimeout(() => {
      this.timers.gesture = 0;
      this.settle();
    }, GESTURE_SETTLE_MS);
  }

  settle() {
    if (this.timers.gesture) { window.clearTimeout(this.timers.gesture); this.timers.gesture = 0; }
    if (!this.closed && this.model) this.renderSheet();
  }

  previewTransform() {
    if (!this.svg || !this.drawnViewport) return;
    const a = this.drawnViewport, b = this.currentViewport();
    const k = a.w / b.w;
    const w = this.canvasEl.clientWidth || 1;
    const h = w * a.h / a.w;
    const tx = w * (a.x - b.x) / b.w;
    const ty = h * ((b.y + b.h) - (a.y + a.h)) / b.h;
    this.svg.style.transformOrigin = "0 0";
    this.svg.style.transform =
      "translate(" + tx.toFixed(2) + "px," + ty.toFixed(2) + "px) scale(" + k.toFixed(5) + ")";
  }

  /* -- opening a note --------------------------------------------------- */

  leafIsMap(leaf) {
    try {
      return !!(leaf && leaf.view && typeof leaf.view.getViewType === "function" &&
        leaf.view.getViewType() === VIEW_TYPE);
    } catch (e) { return false; }
  }

  leafPinned(leaf) {
    try {
      if (leaf && typeof leaf.getViewState === "function") {
        const st = leaf.getViewState();
        if (st && typeof st.pinned === "boolean") return st.pinned;
      }
      return !!(leaf && leaf.pinned);
    } catch (e) { return false; }
  }

  /** The companion leaf, if it is still attached to the workspace. */
  liveCompanion() {
    if (!this.companion) return null;
    let found = null;
    try {
      this.app.workspace.iterateAllLeaves((l) => { if (l === this.companion) found = l; });
    } catch (e) { return null; }
    if (!found) this.companion = null;
    return found;
  }

  openNote(path, evt) {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    const ws = this.app.workspace;
    let mod = false;
    try { if (Keymap && typeof Keymap.isModEvent === "function") mod = Keymap.isModEvent(evt); }
    catch (e) { mod = false; }

    const companion = this.liveCompanion();
    let recent = null;
    try { recent = ws.getMostRecentLeaf(ws.rootSplit); } catch (e) { recent = null; }

    const choice = TufteMapCore.chooseCompanionLeaf({
      mod: mod,
      companion: companion
        ? { exists: true, pinned: this.leafPinned(companion), isMap: this.leafIsMap(companion) }
        : null,
      recent: recent
        ? { exists: true, pinned: this.leafPinned(recent), isMap: this.leafIsMap(recent) }
        : { exists: false }
    });

    let leaf = null;
    if (choice.action === "mod") leaf = ws.getLeaf(choice.mod);
    else if (choice.action === "companion") leaf = companion;
    else if (choice.action === "recent") leaf = recent;
    else leaf = ws.getLeaf("tab");
    if (!leaf) leaf = ws.getLeaf("tab");
    // Never the map itself, whatever the workspace just said.
    if (this.leafIsMap(leaf)) leaf = ws.getLeaf("tab");

    this.companion = leaf;
    const done = leaf.openFile(file);
    if (done && typeof done.catch === "function") {
      done.catch((e) => console.error("tufte-map: could not open " + path, e));
    }
  }

  /* -- the margin column ------------------------------------------------ */

  refreshMargin() {
    const doc = this.marginEl.ownerDocument;
    const m = this.model;
    const vault = (this.app.vault.getName && this.app.vault.getName()) || "";

    this.summaryEl.textContent = m
      ? [vault, m.counts.placed.toLocaleString() + " " + tt("notes"),
        m.counts.links.toLocaleString() + " " + tt("links")].filter(Boolean).join(" · ")
      : vault;

    /* Summits ---------------------------------------------------------- */
    while (this.summitsEl.firstChild) this.summitsEl.removeChild(this.summitsEl.firstChild);
    this.summitRows = [];
    const peaks = m ? m.peaks : [];
    for (let p = 0; p < peaks.length; p++) {
      const li = doc.createElement("li");
      li.className = "tufte-map-row";
      const num = doc.createElement("span");
      num.className = "tufte-map-row-numeral";
      num.textContent = peaks[p].numeral;
      const name = doc.createElement("span");
      name.className = "tufte-map-row-name";
      name.textContent = String(peaks[p].name || "").toUpperCase();
      const count = doc.createElement("span");
      count.className = "tufte-map-row-count";
      count.textContent = String(peaks[p].count);
      li.appendChild(num); li.appendChild(name); li.appendChild(count);
      li.setAttribute("title", String(peaks[p].name || ""));
      this.bindRow(li, { kind: "summit", keys: [p], peak: p });
      this.summitsEl.appendChild(li);
      this.summitRows.push({ el: li, peak: p });
    }
    this.summitsHeadingEl.classList.toggle("tufte-map-empty-heading", peaks.length === 0);

    /* Folders ---------------------------------------------------------- */
    while (this.foldersEl.firstChild) this.foldersEl.removeChild(this.foldersEl.firstChild);
    this.folderRowEls = [];
    const rows = this.folders ? this.folders.rows : [];
    for (let r = 0; r < rows.length; r++) {
      const li = doc.createElement("li");
      li.className = "tufte-map-row";
      const name = doc.createElement("span");
      name.className = "tufte-map-row-name tufte-map-row-folder";
      name.textContent = rows[r].label;
      const count = doc.createElement("span");
      count.className = "tufte-map-row-count";
      count.textContent = String(rows[r].count);
      li.appendChild(name); li.appendChild(count);
      li.setAttribute("title", rows[r].title);
      this.bindRow(li, { kind: "folder", keys: rows[r].keys });
      this.foldersEl.appendChild(li);
      this.folderRowEls.push({ el: li, keys: rows[r].keys });
    }

    /* the linkless footnote -------------------------------------------- */
    const k = m ? m.counts.isolates : 0;
    this.linklessEl.textContent = k
      ? fmt(tt("{k} notes without links are not shown."), { k: k }) : "";

    this.refreshCounts();
    this.applyClasses();
  }

  bindRow(li, spec) {
    const enter = () => {
      this.isolate = { kind: spec.kind, keys: spec.keys };
      this.applyFilter();
    };
    const leave = () => {
      if (this.isolate) { this.isolate = null; this.applyFilter(); }
    };
    this.registerDomEvent(li, "pointerenter", enter);
    this.registerDomEvent(li, "pointerleave", leave);
    this.registerDomEvent(li, "click", () => {
      this.isolate = null;
      if (spec.kind === "summit") {
        if (this.pinnedSummits.has(spec.peak)) this.pinnedSummits.delete(spec.peak);
        else this.pinnedSummits.add(spec.peak);
      } else {
        const all = spec.keys.every((key) => this.pinnedFolders.has(key));
        for (const key of spec.keys) {
          if (all) this.pinnedFolders.delete(key); else this.pinnedFolders.add(key);
        }
      }
      this.applyFilter();
    });
  }

  refreshCounts() {
    if (!this.model || !this.filter) { this.findCountEl.textContent = ""; return; }
    if (!this.filter.searching) {
      this.findCountEl.textContent = this.filter.active
        ? fmt(tt("{k} of {n} notes"), { k: this.filter.count, n: this.model.counts.placed })
        : "";
      return;
    }
    this.findCountEl.textContent = this.filter.matches
      ? fmt(tt("{k} of {n} notes"), { k: this.filter.count, n: this.model.counts.placed })
      : tt("no matches");
  }

  /* -- settings changed ------------------------------------------------- */

  refreshFromSettings(what) {
    if (this.closed) return;
    if (what === "links") { this.drawAllLinks(); this.applyClasses(); return; }
    if (what === "names") { if (this.model) this.renderSheet(); return; }
    this.recompute({ reason: "settings" }).catch((e) => console.error("tufte-map:", e));
  }

  setStatus(text) {
    this.statusEl.textContent = text || "";
    this.statusEl.classList.toggle("tufte-map-status-on", !!text);
  }
}

/** The modifier key, named the way this platform names it. */
function modLabelHere() { return TufteMapCore.modLabel(isMacPlatform()); }

/* ----------------------------------------------------------------------
 * 4b. The settings tab
 * ------------------------------------------------------------------- */

class TufteMapSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(tt("Excluded folders"))
      .setDesc(tt("One folder path per line. A note in any of them, or in a folder below it, is left off the map. Plain paths, not patterns."))
      .addTextArea((t) =>
        t
          .setPlaceholder("Archive\nTemplates")
          .setValue(this.plugin.settings.excludeFolders)
          .onChange(async (v) => {
            this.plugin.settings.excludeFolders = v;
            await this.plugin.saveState();
            this.plugin.debounceViews("recompute");
          })
      );

    new Setting(containerEl)
      .setName(tt("Open the map in"))
      .setDesc(tt("A tab in the main area, or the right sidebar."))
      .addDropdown((d) =>
        d
          .addOption("tab", tt("Tab"))
          .addOption("sidebar", tt("Sidebar"))
          .setValue(this.plugin.settings.openIn)
          .onChange(async (v) => {
            this.plugin.settings.openIn = v === "sidebar" ? "sidebar" : "tab";
            await this.plugin.saveState();
          })
      );

    new Setting(containerEl)
      .setName(tt("Notes to name"))
      .setDesc(tt("How many of the most connected notes the map tries to name. Summits are always named, and zooming in names more."))
      .addSlider((s) =>
        s
          .setLimits(10, 60, 1)
          .setValue(this.plugin.settings.namedNotes)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.namedNotes = v;
            await this.plugin.saveState();
            this.plugin.debounceViews("names");
          })
      );

    // Obsidian's own graph view has this slider, with this name and this
    // range, and it does the same thing there: a reader who has learned it
    // once should not have to learn it twice.
    new Setting(containerEl)
      .setName(tt("Text fade threshold"))
      .setDesc(tt("Labels appear sooner or later as you zoom, like the graph view's setting."))
      .addSlider((s) =>
        s
          .setLimits(-3, 3, 0.5)
          .setValue(this.plugin.settings.textFadeThreshold)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.textFadeThreshold = +v;
            await this.plugin.saveState();
            this.plugin.debounceViews("names");
          })
      );

    new Setting(containerEl)
      .setName(tt("Show links between summits"))
      .setDesc(tt("Draw the links that run from one summit's region to another as faint hairlines, so the mountains read as connected. On by default."))
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showBridges).onChange(async (v) => {
          this.plugin.settings.showBridges = v;
          await this.plugin.saveState();
          this.plugin.eachView((view) => view.refreshFromSettings("links"));
        })
      );

    new Setting(containerEl)
      .setName(tt("Show all links"))
      .setDesc(tt("Draw every link as a faint hairline. Off by default: the terrain already says where the links are."))
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showAllLinks).onChange(async (v) => {
          this.plugin.settings.showAllLinks = v;
          await this.plugin.saveState();
          this.plugin.eachView((view) => view.refreshFromSettings("links"));
        })
      );
  }
}

/* ----------------------------------------------------------------------
 * 4c. The plugin
 * ------------------------------------------------------------------- */

module.exports = class TufteMapPlugin extends Plugin {
  async onload() {
    await this.loadState();

    this.registerView(VIEW_TYPE, (leaf) => new TufteMapView(leaf, this));
    this.registerHoverLinkSource(VIEW_TYPE, {
      display: tt("Knowledge map"),
      defaultMod: true
    });

    this.addRibbonIcon("map", tt("Open knowledge map"), () => { this.openMap().catch((e) => console.error("tufte-map:", e)); });

    this.addCommand({
      id: "open-knowledge-map",
      name: tt("Open knowledge map"),
      callback: () => { this.openMap().catch((e) => console.error("tufte-map:", e)); }
    });
    this.addCommand({
      id: "redraw-knowledge-map",
      name: tt("Redraw knowledge map from scratch"),
      callback: () => { this.redrawFromScratch().catch((e) => console.error("tufte-map:", e)); }
    });

    this.addSettingTab(new TufteMapSettingTab(this.app, this));
  }

  onunload() {
    // Leaves are the user's, not ours: detaching them here is what makes a
    // plugin update close the reader's pane behind their back.
    if (this.saveTimer) { window.clearTimeout(this.saveTimer); this.saveTimer = 0; }
    if (this.viewTimer) { window.clearTimeout(this.viewTimer); this.viewTimer = 0; }
  }

  async loadState() {
    const data = (await this.loadData()) || {};
    // Copy by KNOWN KEY rather than merging wholesale.  `data.json` syncs
    // between devices and can be edited by hand, and `Object.assign` obeys a
    // `__proto__` key by reparenting the object it is filling — the settings
    // object then answers questions out of whatever the file said, which is
    // not what a settings object is for.  Anything the file holds that this
    // plugin has no setting for is not ours to carry.
    const saved = data.settings && typeof data.settings === "object" ? data.settings : {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    for (const k in DEFAULT_SETTINGS) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, k) &&
        Object.prototype.hasOwnProperty.call(saved, k)) {
        this.settings[k] = saved[k];
      }
    }
    const c = data.cache;
    this.cache = c && c.positions && typeof c.positions === "object"
      ? { hash: String(c.hash || ""), frameW: +c.frameW || 0, positions: c.positions }
      : { hash: "", frameW: 0, positions: {} };
  }

  async saveState() {
    await this.saveData({ settings: this.settings, cache: this.cache });
  }

  /** Remember where the notes ended up, so the next open is a warm start and
   *  the reader's map is the map they left. */
  rememberLayout(model) {
    const positions = {};
    const src = model.layoutPositions;
    for (const k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      positions[k] = [round4(src[k][0]), round4(src[k][1])];
    }
    this.cache = { hash: model.hash, frameW: model.frameW, positions: positions };
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = 0;
      this.saveState().catch((e) => console.error("tufte-map: could not save the layout", e));
    }, SAVE_DEBOUNCE_MS);
  }

  eachView(fn) {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE) || [];
    for (let i = 0; i < leaves.length; i++) {
      const v = leaves[i].view;
      if (v instanceof TufteMapView) fn(v);
    }
  }

  /** Settings move under a dragging finger; recomputing on every pixel of a
   *  slider is how a plugin earns a reputation. */
  debounceViews(what) {
    if (this.viewTimer) window.clearTimeout(this.viewTimer);
    this.viewTimer = window.setTimeout(() => {
      this.viewTimer = 0;
      this.eachView((v) => v.refreshFromSettings(what));
    }, 400);
  }

  async openMap() {
    const ws = this.app.workspace;
    let leaf = (ws.getLeavesOfType(VIEW_TYPE) || [])[0];
    if (!leaf) {
      leaf = this.settings.openIn === "sidebar" ? ws.getRightLeaf(false) : ws.getLeaf("tab");
      if (!leaf) leaf = ws.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    ws.revealLeaf(leaf);
    return leaf;
  }

  async redrawFromScratch() {
    this.cache = { hash: "", frameW: 0, positions: {} };
    await this.saveState();
    const leaf = await this.openMap();
    this.eachView((v) => { v.recompute({ cold: true, reason: "command" }).catch((e) => console.error("tufte-map:", e)); });
    return leaf;
  }
};

// The test harness runs the core under plain Node, with `obsidian` stubbed;
// the renderer is exported beside it so a browser preview can drive exactly
// the code the plugin ships rather than a copy of it.
module.exports.__core = TufteMapCore;
module.exports.__view = {
  VIEW_TYPE: VIEW_TYPE,
  TufteMapView: TufteMapView,
  TufteMapSettingTab: TufteMapSettingTab,
  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  parseExcludes: parseExcludes,
  coastClipPaths: coastClipPaths,
  fmt: fmt,
  tt: tt,
  L10N: TUFTE_L10N
};
module.exports.__render = TufteMapRender;
