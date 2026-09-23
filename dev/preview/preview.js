/* The preview driver: load the fixture, compute, place, draw.
 *
 * It deliberately does exactly what the stage-2 view will do and in the same
 * order — read the theme from the pane, build a canvas measurer over the
 * pane's own font, compute once, place labels per pane width, draw — so that
 * anything that looks wrong here will look wrong in Obsidian too. */
(function () {
  const Core = window.module.exports.__core;
  const Render = window.module.exports.__render;
  const pane = document.getElementById("pane");
  const sheet = document.getElementById("sheet");
  const timing = document.getElementById("timing");

  let model = null;
  let fixture = null;

  function paneWidthPx() { return +document.getElementById("width").value; }
  function sheetWidthPt() { return paneWidthPx() * Core.constants.PT_PER_CSS_PX; }

  function drawOnce() {
    pane.style.width = paneWidthPx() + "px";
    const t0 = performance.now();
    const theme = Render.readTheme(pane);
    const measurer = Render.makeMeasurer(pane);
    const layout = Core.placeLabels(model, measurer, {
      sheetWidthPt: sheetWidthPt(),
      maxMinor: +document.getElementById("minor").value
    });
    const t1 = performance.now();
    Render.draw(sheet, model, layout, theme, { sheetWidthPt: sheetWidthPt() });
    const t2 = performance.now();

    const minor = layout.labels.filter(function (l) { return l.tier === "minor"; }).length;
    timing.textContent =
      "compute " + Math.round(model.__ms) + " ms · place " + Math.round(t1 - t0) +
      " ms · draw " + Math.round(t2 - t1) + " ms · " +
      layout.labels.length + " labels (" + minor + " minor, " +
      layout.leaders.length + " leaders, " + layout.dropped.length + " dropped)";

    document.getElementById("subtitle").textContent =
      fixture.vault + " · " + model.counts.placed.toLocaleString() + " notes · " +
      model.counts.links.toLocaleString() + " links — elevation: density of notes; " +
      "dot area: number of links";
    document.getElementById("footer").textContent =
      model.counts.isolates + " notes without links are not shown.";
  }

  async function boot() {
    timing.textContent = "loading…";
    fixture = await (await fetch("../fixtures/vault-graph.json")).json();
    const t0 = performance.now();
    model = await Core.computeMap(
      { files: fixture.files, resolvedLinks: fixture.resolvedLinks },
      {},
      Render.makeMeasurer(pane),
      null,
      // The view will pass a tick that yields to the event loop on a timer,
      // exactly like this, so the pane stays alive while a big vault computes.
      { tick: function () { return new Promise(function (r) { setTimeout(r, 0); }); } }
    );
    model.__ms = performance.now() - t0;
    drawOnce();
  }

  document.getElementById("mode").addEventListener("change", function (e) {
    document.documentElement.setAttribute("data-theme", e.target.value);
    drawOnce();
  });
  document.getElementById("width").addEventListener("change", drawOnce);
  document.getElementById("minor").addEventListener("change", drawOnce);
  document.getElementById("redraw").addEventListener("click", drawOnce);

  boot().catch(function (e) {
    timing.textContent = "error: " + e.message;
    console.error(e);
  });
})();
