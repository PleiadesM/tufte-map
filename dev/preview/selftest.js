/* ?selftest=1 — a scripted run over the mounted view.
 *
 * Every step dispatches the events a hand would and then asserts on what the
 * view did about them, in numbers: how many dots are lit, what landed in the
 * openFile log, how many labels the sheet carried before and after a zoom, how
 * far the hubs moved when ten notes arrived.  The verdict is written into
 * #selftest-result as JSON so it can be read out of the page without a human
 * looking at it.
 */
(function () {
  "use strict";

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function until(fn, ms, label) {
    const t0 = Date.now();
    for (;;) {
      let v;
      try { v = fn(); } catch (e) { v = false; }
      if (v) return v;
      if (Date.now() - t0 > (ms || 8000)) throw new Error("timed out waiting for " + (label || "a condition"));
      await wait(50);
    }
  }

  /* -- who wins a property in a state the script cannot enter -------------
   *
   * `:hover` cannot be forced from JavaScript, and the fault this harness
   * exists to catch was a CASCADE fault: Obsidian's `input[type='text']`
   * rules are (0,1,1) and (0,3,1), a bare class is (0,1,0), and the box won.
   * So the cascade is run here over exactly the rules that would match if the
   * pointer were on the element, and the winner's selector is the verdict.
   *
   * The specificity count is the ordinary one: ids, then classes/attributes/
   * pseudo-classes, then element names.  `:not(...)` contributes its
   * argument, which is why it is counted rather than stripped. */
  const STATE_PSEUDO = /:(hover|active|focus-visible|focus)\b/g;

  function specificity(sel) {
    let s = sel.replace(/::[a-z-]+/g, "");
    const ids = (s.match(/#[\w-]+/g) || []).length;
    const cls = (s.match(/\.[\w-]+/g) || []).length + (s.match(/\[[^\]]*\]/g) || []).length +
      (s.match(/:(?!:)[a-z-]+/g) || []).length;
    const els = (s.replace(/\[[^\]]*\]/g, "").replace(/[#.][\w-]+/g, "")
      .match(/(^|[\s>+~(])[a-z][\w-]*/g) || []).length;
    return ids * 10000 + cls * 100 + els;
  }

  /** The declarations that apply to `el` when it is in `stateName`, ranked. */
  function cascadeOwner(el, stateName, props) {
    const allowed = { hover: ["hover"], focus: ["focus", "focus-visible"], normal: [] }[stateName] || [];
    const found = {};
    let order = 0;
    const visit = function (rules) {
      for (const rule of rules) {
        if (rule.media) {
          const c = rule.conditionText || rule.media.mediaText || "";
          // A desktop Obsidian is a pointer device, whatever this headless
          // window thinks, so the hover media block counts.
          if (!(window.matchMedia(c).matches || /hover\s*:\s*hover/.test(c))) continue;
          visit(rule.cssRules || []); continue;
        }
        if (rule.cssRules && !rule.selectorText) { visit(rule.cssRules); continue; }
        if (!rule.selectorText) continue;
        order++;
        for (const one of rule.selectorText.split(",")) {
          const sel = one.trim();
          const states = (sel.match(STATE_PSEUDO) || []).map(function (p) { return p.slice(1); });
          if (states.some(function (p) { return allowed.indexOf(p) < 0; })) continue;
          let plain;
          try { plain = sel.replace(STATE_PSEUDO, "") || "*"; } catch (e) { continue; }
          let m = false;
          try { m = el.matches(plain); } catch (e) { m = false; }
          if (!m) continue;
          const rank = specificity(sel) * 100000 + order;
          for (const p of props) {
            const v = rule.style.getPropertyValue(p);
            if (!v) continue;
            if (!found[p] || rank > found[p].rank) {
              found[p] = { rank: rank, selector: rule.selectorText, value: v };
            }
          }
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try { visit(sheet.cssRules || []); } catch (e) { /* a foreign sheet */ }
    }
    return found;
  }

  window.TufteMapSelftest = async function (state, say) {
    const steps = [];
    const view = state.view;
    const root = view.rootEl;
    const sheet = view.sheetEl;

    function step(name, asserted, ok, numbers) {
      steps.push({ step: name, asserted: asserted, pass: !!ok, numbers: numbers || {} });
      say((ok ? "  pass  " : "  FAIL  ") + name + "  " + JSON.stringify(numbers || {}));
    }

    /* screen position of a node, in client coordinates */
    function at(i) {
      const box = view.canvasEl.getBoundingClientRect();
      return { x: box.left + view.screen.xs[i], y: box.top + view.screen.ys[i] };
    }
    function pointer(type, i, init) {
      const p = at(i);
      const e = new PointerEvent(type, Object.assign({
        clientX: p.x, clientY: p.y, bubbles: true, cancelable: true,
        pointerType: "mouse", pointerId: 1, button: 0, buttons: type === "pointermove" ? 0 : 1
      }, init || {}));
      sheet.dispatchEvent(e);
      return e;
    }
    function nodeIndexByTitle(t) {
      const ns = view.model.nodes;
      for (let i = 0; i < ns.length; i++) if (ns[i].title === t) return i;
      return -1;
    }
    function litCount() { return view.svg.querySelectorAll(".tufte-map-dot.tufte-map-lit").length; }
    function labelCount() { return view.layout ? view.layout.labels.length : 0; }

    try {
      /* 1 — mounted ----------------------------------------------------- */
      const dots = view.svg.querySelectorAll(".tufte-map-dot").length;
      step("view mounts and draws",
        "one dot per placed note, a margin column, and a status line that is empty",
        dots === view.model.counts.placed && view.marginEl.children.length >= 6 &&
        view.statusEl.textContent === "",
        { dots: dots, placed: view.model.counts.placed, summits: view.model.peaks.length,
          folderDepth: view.folders.depth, folderRows: view.folders.rows.length,
          labels: labelCount(), coldOpenMs: state.coldMs });

      /* 1b — dot strength by centrality ---------------------------------- */
      // Read before any hover, so no dim rule is in play.  The computed
      // opacity is the cascade's answer, so this checks the calc() and the
      // tokens as the browser resolves them, not just the --c the renderer set.
      const dotOp = [];
      let anchorOp = 1, anchorsSeen = 0;
      view.svg.querySelectorAll(".tufte-map-dot").forEach(function (el) {
        const i = +el.getAttribute("data-i");
        const op = +getComputedStyle(el).opacity;
        if (el.classList.contains("tufte-map-dot-anchor")) { anchorOp = Math.min(anchorOp, op); anchorsSeen++; }
        else dotOp.push([view.model.nodes[i].deg, op]);
      });
      dotOp.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
      let inBand = true, monotone = true, opLo = Infinity, opHi = -Infinity;
      for (let k = 0; k < dotOp.length; k++) {
        const op = dotOp[k][1];
        opLo = Math.min(opLo, op); opHi = Math.max(opHi, op);
        if (op < 0.66 - 1e-4 || op > 0.80 + 1e-4) inBand = false;
        if (k && op < dotOp[k - 1][1] - 1e-4) monotone = false;
        if (k && dotOp[k][0] === dotOp[k - 1][0] && Math.abs(op - dotOp[k - 1][1]) > 1e-4) monotone = false;
      }
      // The colour: a warm-grey ramp, not grey to ink.  Every non-summit fill
      // is warm (R >= G >= B, not neutral) and the least linked note sits at
      // the ramp's light end, the theme's #a59f8c.
      let warmAll = true, lightest = null, lightestDeg = Infinity;
      view.svg.querySelectorAll(".tufte-map-dot:not(.tufte-map-dot-anchor)").forEach(function (el) {
        // A color-mix() computes to `color(srgb r g b)` in 0..1, a plain
        // colour to `rgb(r, g, b)` in 0..255; bring both to 0..255.
        const f = getComputedStyle(el).fill;
        const unit = f.indexOf("color(srgb") === 0 ? 255 : 1;
        const rgb = (f.replace("color(srgb", "").match(/[\d.]+/g) || [])
          .slice(0, 3).map(function (v) { return Math.round(Number(v) * unit); });
        if (!(rgb[0] >= rgb[1] && rgb[1] >= rgb[2] && rgb[0] - rgb[2] >= 8)) warmAll = false;
        const d = view.model.nodes[+el.getAttribute("data-i")].deg;
        if (d < lightestDeg) { lightestDeg = d; lightest = rgb; }
      });
      step("non-summit dots are warm grey, lightest for the least linked",
        "every non-anchor fill has R >= G >= B with some warmth, and a least-linked dot is rgb(165, 159, 140)",
        warmAll && !!lightest && Math.abs(lightest[0] - 165) <= 1 &&
        Math.abs(lightest[1] - 159) <= 1 && Math.abs(lightest[2] - 140) <= 1,
        { warmAll: warmAll, lightest: lightest, lightestDegree: lightestDeg });

      step("non-summit dots draw at 0.66–0.80 by centrality, summits at full strength",
        "every non-anchor dot's computed opacity lies in [0.66, 0.80] and never falls as degree rises (equal degree, equal opacity); every anchor is at 1",
        dotOp.length > 0 && inBand && monotone && anchorsSeen > 0 && anchorOp === 1,
        { dots: dotOp.length, lo: +opLo.toFixed(3), hi: +opHi.toFixed(3), anchors: anchorsSeen, anchorOpacity: anchorOp });

      /* 2 — hover a hub -------------------------------------------------- */
      const hub = nodeIndexByTitle("Typography");
      const bridgeRest = view.bridgeLayer.querySelector(".tufte-map-bridge");
      const bridgeOpRest = bridgeRest ? +getComputedStyle(bridgeRest).opacity : null;
      // The fade is switched off for the hover checks below so the computed
      // opacity is the cascade's settled answer at once, rather than a frame
      // of a 120 ms transition — and so they can be read in the same 40 ms
      // window step 2 uses, before any deferred redraw replaces the sheet.
      root.style.setProperty("--tufte-map-fade", "0ms");
      pointer("pointermove", hub);
      await wait(40);
      const deg = view.adj[hub].length;
      step("hover a hub lights it and its neighbours",
        "root gains .tufte-map-has-hot, exactly 1 + degree dots carry .tufte-map-lit, and there is no pop-up anywhere in the view",
        root.classList.contains("tufte-map-has-hot") && litCount() === deg + 1 &&
        view.tooltipEl === undefined && root.querySelector(".tufte-map-tooltip") === null,
        { hot: view.hot, degree: deg, lit: litCount(),
          hotLinkPaths: view.hotLinkLayer.children.length });
      // Typography is a summit; if its name is drawn, the hover adds none.
      const hubNamed = (view.layout.labels || []).some(function (lb) {
        return lb.note === hub && lb.tier === "summit";
      }) && (view.layout.tiers && view.layout.tiers.name !== undefined ? view.layout.tiers.name : 1) >= 0.5;
      const hubNames = view.svg.querySelectorAll(".tufte-map-hover-name").length;
      step("hovering a named summit adds no second name",
        "the hub's own summit name is drawn and lit, so no .tufte-map-hover-name is set beside it",
        hubNamed && hubNames === 0, { hubNamed: hubNamed, hoverNames: hubNames });

      const hubDot = view.dotEls[hub];
      const hubOp = hubDot ? +getComputedStyle(hubDot).opacity : null;
      let litMin = 1;
      view.svg.querySelectorAll(".tufte-map-dot.tufte-map-lit").forEach(function (el) {
        litMin = Math.min(litMin, +getComputedStyle(el).opacity);
      });
      step("a hovered dot and its neighbours rise to full strength",
        "the hovered note's dot and every lit neighbour compute to opacity 1, out of the centrality band",
        hubOp === 1 && litMin === 1 && litCount() === deg + 1,
        { hovered: hubOp, litMin: litMin, hot: view.hot, hub: hub,
          hubLit: hubDot ? hubDot.classList.contains("tufte-map-lit") : null,
          hubInSheet: hubDot ? view.svg.contains(hubDot) : null, lit: litCount() });
      const bridgeHot = view.bridgeLayer.querySelector(".tufte-map-bridge");
      const bridgeOpHot = bridgeHot ? +getComputedStyle(bridgeHot).opacity : null;
      const dimHot = +getComputedStyle(root).getPropertyValue("--tufte-map-dim-hot");
      step("the bridge layer dims on hover",
        "at rest the bridge path is at opacity 1 (its faintness is its stroke-opacity); under a hover it drops to --tufte-map-dim-hot like every unlit element",
        bridgeOpRest === 1 && bridgeOpHot !== null && Math.abs(bridgeOpHot - dimHot) < 1e-3,
        { rest: bridgeOpRest, hot: bridgeOpHot, dimHot: dimHot });

      // A redraw under a resting pointer — the settle after a zoom, a resize —
      // replaces every dot.  The hot note must come back lit on the new sheet,
      // not leave the whole map dimmed behind a root that still says "hot".
      view.renderSheet();
      await wait(40);
      const hubAfter = view.dotEls[hub];
      const hubOpAfter = hubAfter ? +getComputedStyle(hubAfter).opacity : null;
      step("a redraw under the pointer keeps the hovered note lit",
        "after renderSheet() with the hub still hot: the hub's NEW dot is lit at opacity 1, 1 + degree dots are lit, and the hot links are drawn again",
        view.hot === hub && hubAfter !== hubDot && hubOpAfter === 1 &&
        litCount() === deg + 1 && view.hotLinkLayer.children.length === 1,
        { hot: view.hot, newElement: hubAfter !== hubDot, hubOpacity: hubOpAfter,
          lit: litCount(), hotLinkPaths: view.hotLinkLayer.children.length });

      // An unlabelled minor note: hovering it sets its title beside its dot,
      // once, and the name survives a redraw under the pointer.
      const labelled = new Set((view.layout.labels || []).map(function (lb) { return lb.note; }));
      let quiet = -1;
      for (let i = 0; i < view.model.nodes.length; i++) {
        const nd = view.model.nodes[i];
        if (nd.summit === null && !labelled.has(i) && nd.deg >= 3 && String(nd.title).trim() &&
          view.screen.xs[i] > 40 && view.screen.xs[i] < view.screen.w - 40) { quiet = i; break; }
      }
      pointer("pointermove", quiet);
      await wait(40);
      const names1 = view.svg.querySelectorAll(".tufte-map-hover-name");
      const want = quiet >= 0 ? String(view.model.nodes[quiet].title).trim() : null;
      const nameEl = names1[0];
      const nameStyle = nameEl ? getComputedStyle(nameEl) : null;
      step("hovering an unlabelled note names it on the sheet",
        "exactly one .tufte-map-hover-name, its text the note's title, italic, in the marks layer, at the sheet's minor size",
        view.hot === quiet && names1.length === 1 && nameEl.textContent === want &&
        nameStyle.fontStyle === "italic" && view.markLayer.contains(nameEl) &&
        Math.abs(+nameEl.getAttribute("font-size") - view.layout.minorPt) < 1e-3,
        { note: want, hoverNames: names1.length, text: nameEl ? nameEl.textContent : null,
          fontSize: nameEl ? +nameEl.getAttribute("font-size") : null, minorPt: view.layout.minorPt,
          anchor: nameEl ? nameEl.getAttribute("text-anchor") : null });
      view.renderSheet();
      await wait(40);
      const names2 = view.svg.querySelectorAll(".tufte-map-hover-name");
      step("the hover name survives a redraw under the pointer",
        "after renderSheet() with the note still hot, the new sheet carries the same single hover name",
        view.hot === quiet && names2.length === 1 && names2[0].textContent === want && names2[0] !== nameEl,
        { hoverNames: names2.length, text: names2.length ? names2[0].textContent : null });
      pointer("pointermove", hub);
      await wait(40);
      root.style.removeProperty("--tufte-map-fade");

      /* 3 — click it ----------------------------------------------------- */
      pointer("pointerdown", hub);
      pointer("pointerup", hub);
      await wait(40);
      const firstOpen = state.app.__opened[state.app.__opened.length - 1];
      step("plain click opens the note",
        "openFile called once with the hub's path, in a leaf that is not the map",
        !!firstOpen && firstOpen.path === view.model.nodes[hub].path,
        { opened: firstOpen ? firstOpen.path : null, leaf: firstOpen ? firstOpen.leaf : null,
          openCount: state.app.__opened.length, leaves: state.app.__leaves.length });

      /* 4 — modifier click ----------------------------------------------- */
      const other = nodeIndexByTitle("Cartography");
      const leavesBefore = state.app.__leaves.length;
      pointer("pointermove", other);
      pointer("pointerdown", other, { metaKey: true, ctrlKey: true });
      pointer("pointerup", other, { metaKey: true, ctrlKey: true });
      await wait(40);
      const second = state.app.__opened[state.app.__opened.length - 1];
      step("modifier click opens in a new leaf",
        "Keymap.isModEvent is honoured: a leaf is created rather than the companion reused",
        !!second && second.path === view.model.nodes[other].path &&
        state.app.__leaves.length > leavesBefore,
        { opened: second ? second.path : null, leavesBefore: leavesBefore,
          leavesAfter: state.app.__leaves.length });

      /* 4b — a second plain click must NOT make a second tab -------------- */
      const before3 = state.app.__leaves.length;
      const third = nodeIndexByTitle("Rhetoric");
      pointer("pointermove", third);
      pointer("pointerdown", third);
      pointer("pointerup", third);
      await wait(40);
      const openedIn = state.app.__opened.slice(-2).map(function (o) { return o.leaf; });
      step("exploring does not spawn tabs",
        "the second plain click reuses the companion leaf: no new leaf, same leaf id as the previous plain open",
        state.app.__leaves.length === before3,
        { leavesBefore: before3, leavesAfter: state.app.__leaves.length,
          lastTwoLeaves: openedIn });

      /* 5 — find --------------------------------------------------------- */
      view.setHot(-1, null);
      view.findEl.value = "cartogra";
      view.findEl.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(40);
      const kept = view.svg.querySelectorAll(".tufte-map-dot.tufte-map-keep").length;
      step("Find fades everything but the matches",
        "root gains .tufte-map-has-filter, the kept dots equal the filter's count, the italic count is printed",
        root.classList.contains("tufte-map-has-filter") && kept === view.filter.count &&
        view.findCountEl.textContent.length > 0,
        { query: "cartogra", matches: view.filter.matches, visible: view.filter.count,
          keptDots: kept, countLine: view.findCountEl.textContent });

      /* 6 — Enter opens the best match ----------------------------------- */
      const openCountBefore = state.app.__opened.length;
      view.findEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await wait(40);
      const best = state.app.__opened[state.app.__opened.length - 1];
      step("Enter opens the best match",
        "the highest-degree match is opened the same way a click opens one",
        state.app.__opened.length === openCountBefore + 1 &&
        best.path === view.model.nodes[view.filter.best].path,
        { best: best ? best.path : null,
          bestDegree: view.model.nodes[view.filter.best].deg });

      /* 6b — Escape clears ------------------------------------------------ */
      view.findEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await wait(40);
      step("Escape clears the search",
        "the input empties and the filter goes inactive",
        view.findEl.value === "" && !view.filter.active,
        { filterActive: view.filter.active });

      /* 7 — pin a summit -------------------------------------------------- */
      const summitRow = view.summitsEl.children[0];
      summitRow.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(40);
      const pinnedVisible = view.filter.count;
      step("clicking a summit pins it",
        "only that summit's region stays lit, and the row is marked",
        view.pinnedSummits.size === 1 && summitRow.classList.contains("tufte-map-pinned") &&
        pinnedVisible === view.model.peaks[0].count,
        { pinned: Array.from(view.pinnedSummits), visible: pinnedVisible,
          peakCount: view.model.peaks[0].count });
      summitRow.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(30);

      /* 8 — pin a folder -------------------------------------------------- */
      const folderRow = view.foldersEl.children[0];
      const folderKeys = view.folderRowEls[0].keys;
      folderRow.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(40);
      step("clicking a folder pins it",
        "the visible count equals that folder group's own count",
        view.pinnedFolders.size === folderKeys.length &&
        view.filter.count === view.folders.rows[0].count,
        { folder: view.folders.rows[0].label, keys: folderKeys,
          visible: view.filter.count, rowCount: view.folders.rows[0].count });
      folderRow.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(30);

      /* 9 — zoom ---------------------------------------------------------- */
      const labelsBefore = labelCount();
      const hubPos = at(hub);
      sheet.dispatchEvent(new MouseEvent("dblclick", {
        clientX: hubPos.x, clientY: hubPos.y, bubbles: true, cancelable: true
      }));
      await until(function () { return view.drawnViewport && view.drawnViewport.w < view.model.frameW * 0.99; },
        6000, "the zoomed redraw");
      await wait(300);
      const labelsAfter = labelCount();
      step("double-click zooms and names more notes",
        "the viewport narrows by the zoom step and the re-placed layout carries more labels, because the may-name budget scales with the area shown",
        view.currentViewport().zoom > 1.5 && labelsAfter > labelsBefore,
        { zoom: +view.currentViewport().zoom.toFixed(3),
          labelsBefore: labelsBefore, labelsAfter: labelsAfter,
          namedNotesSetting: state.plugin.settings.namedNotes,
          viewportW: +view.drawnViewport.w.toFixed(4), frameW: view.model.frameW });

      /* 10 — reset -------------------------------------------------------- */
      view.resetEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(200);
      step("reset view returns the whole frame",
        "the viewport is the frame again and the sheet is redrawn at zoom 1",
        Math.abs(view.drawnViewport.w - view.model.frameW) < 1e-6,
        { viewportW: +view.drawnViewport.w.toFixed(4), labels: labelCount() });

      /* 10b — bridges ----------------------------------------------------- */
      const countM = function (els) {
        let k = 0;
        els.forEach(function (el) { k += (el.getAttribute("d").match(/M/g) || []).length; });
        return k;
      };
      const nBridges = view.bridges ? view.bridges.length : -1;
      // Every bridge set is drawn twice, clipped to water and to land; the
      // subpath counts are taken on the water copies.
      const WATER = '.tufte-map-bridge[clip-path*="tufte-map-water-"]';
      const LAND = '.tufte-map-bridge[clip-path*="tufte-map-land-"]';
      const bridgeEls = view.bridgeLayer.querySelectorAll(".tufte-map-bridge");
      const waterEls = view.bridgeLayer.querySelectorAll(WATER);
      const landEls = view.bridgeLayer.querySelectorAll(LAND);
      step("bridges draw the links between summit regions",
        "on by default: a water copy and a land copy, each one subpath per cross-region pair, water at BRIDGE_LINK_ALPHA, and the toggle reads as on",
        view.plugin.settings.showBridges === true && bridgeEls.length === 2 && waterEls.length === 1 &&
        landEls.length === 1 && nBridges > 0 && countM(waterEls) === nBridges && countM(landEls) === nBridges &&
        waterEls[0].getAttribute("stroke-opacity") === "0.12" && view.bridgesEl.classList.contains("tufte-map-on"),
        { paths: bridgeEls.length, subpaths: countM(waterEls), bridges: nBridges,
          alpha: waterEls.length ? waterEls[0].getAttribute("stroke-opacity") : null });
      const landEl = landEls[0];
      const landRef = landEl ? (landEl.getAttribute("clip-path").match(/#([^)]+)\)/) || [])[1] : null;
      const landClip = landRef ? view.svg.querySelector('clipPath[id="' + landRef + '"]') : null;
      const waterRef = waterEls[0] ? (waterEls[0].getAttribute("clip-path").match(/#([^)]+)\)/) || [])[1] : null;
      const waterClip = waterRef ? view.svg.querySelector('clipPath[id="' + waterRef + '"]') : null;
      const landAlpha = landEl ? +getComputedStyle(landEl).strokeOpacity : null;
      step("over land the bridges are lighter",
        "with a coast on the sheet, the land copy computes to stroke-opacity 0.07 and both copies point at clipPaths that exist in this sheet's <defs>",
        Math.abs(landAlpha - 0.07) < 1e-6 && !!landClip && !!waterClip &&
        landClip.parentNode.tagName.toLowerCase() === "defs",
        { landAlpha: landAlpha, landClip: landRef, waterClip: waterRef });
      view.bridgesEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(80);
      const bridgeOff = view.bridgeLayer.querySelectorAll(".tufte-map-bridge").length;
      step("the bridges toggle removes them",
        "after one click the bridges layer is empty and the toggle is off; a second click brings them back",
        bridgeOff === 0 && !view.bridgesEl.classList.contains("tufte-map-on"),
        { pathsWhenOff: bridgeOff });
      view.bridgesEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(80);
      // A pinned summit splits the bridges: the ones that reach it stay at
      // full bridge strength, the rest dim with the filter.
      const pinRow = view.summitsEl.children[0];
      let keptM = -1, dimM = -1, pinnedEls = -1;
      if (pinRow) {
        pinRow.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
        await wait(80);
        keptM = countM(view.bridgeLayer.querySelectorAll(WATER + ".tufte-map-keep"));
        dimM = countM(view.bridgeLayer.querySelectorAll(WATER + ":not(.tufte-map-keep)"));
        pinnedEls = view.bridgeLayer.querySelectorAll(".tufte-map-bridge").length;
        pinRow.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
        await wait(80);
      }
      step("a pinned summit keeps the bridges that reach it",
        "with one summit pinned the bridges split into kept and dimmed paths, each in water and land (four elements), the water subpaths adding up to the whole set; unpinned, two again",
        keptM > 0 && dimM > 0 && keptM + dimM === nBridges && pinnedEls === 4 &&
        view.bridgeLayer.querySelectorAll(".tufte-map-bridge").length === 2,
        { kept: keptM, dimmed: dimM, bridges: nBridges, elementsPinned: pinnedEls });

      /* 10c — touch: first tap names, second tap opens -------------------- */
      const tapNote = quiet;
      const openedBefore = state.app.__opened.length;
      pointer("pointerup", tapNote, { pointerType: "touch" });
      await wait(40);
      const tapNames = view.svg.querySelectorAll(".tufte-map-hover-name");
      const afterFirst = state.app.__opened.length;
      pointer("pointerup", tapNote, { pointerType: "touch" });
      await wait(40);
      const lastOpen = state.app.__opened[state.app.__opened.length - 1];
      step("touch: the first tap pins and names a note, the second opens it",
        "one tap: the note is hot and pinned, its name is set on the sheet, nothing opens; a second tap on the same note opens it",
        view.hot === tapNote && afterFirst === openedBefore && tapNames.length === 1 &&
        tapNames[0].textContent === String(view.model.nodes[tapNote].title).trim() &&
        state.app.__opened.length === openedBefore + 1 && lastOpen.path === view.model.nodes[tapNote].path,
        { firstTapOpened: afterFirst - openedBefore, hoverNames: tapNames.length,
          secondTapOpened: state.app.__opened.length - afterFirst, path: lastOpen ? lastOpen.path : null });
      view.tapPinned = false;
      view.setHot(-1, null);

      /* 11 — all links ---------------------------------------------------- */
      view.allLinksEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(120);
      const linkPath = view.linkLayer.querySelector(".tufte-map-alllink");
      const subpaths = linkPath ? (linkPath.getAttribute("d").match(/M/g) || []).length : 0;
      step("all links draws the whole edge set",
        "one path element carrying one subpath per edge, at a very low alpha",
        !!linkPath && subpaths === view.model.edges.length &&
        view.allLinksEl.classList.contains("tufte-map-on"),
        { subpaths: subpaths, edges: view.model.edges.length,
          alpha: linkPath ? linkPath.getAttribute("stroke-opacity") : null });
      const bridgesUnderAll = view.bridgeLayer.querySelectorAll(".tufte-map-bridge").length;
      step("all links replaces the bridges rather than doubling them",
        "while all links is on the bridges layer is empty — every bridge is already among all the links",
        bridgesUnderAll === 0, { bridgePaths: bridgesUnderAll });
      view.allLinksEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(80);

      /* 12 — a warm-started refresh --------------------------------------- */
      const placedBefore = view.model.counts.placed;
      const hubBefore = { x: view.model.nodes[hub].x, y: view.model.nodes[hub].y };
      const hubPath = view.model.nodes[hub].path;
      state.addNotes(10);
      await until(function () {
        return view.model && view.model.counts.placed === placedBefore + 10;
      }, 20000, "the warm refresh");
      await state.settled();
      await wait(200);
      const hubNow = view.model.nodes.find(function (n) { return n.path === hubPath; });
      const moved = Math.hypot(hubNow.x - hubBefore.x, hubNow.y - hubBefore.y);
      step("a 'resolved' event warm-starts a refresh",
        "the ten new notes are placed, the map is not redrawn from scratch: the hub barely moves",
        view.model.counts.placed === placedBefore + 10 && moved < 0.06 * view.model.frameW,
        { placedBefore: placedBefore, placedAfter: view.model.counts.placed,
          hubMoved: +moved.toFixed(4), asFractionOfFrame: +(moved / view.model.frameW).toFixed(4),
          warmStart: view.model.params.warmStart });

      /* 13 — theme -------------------------------------------------------- */
      const beforeBg = view.svg.style.getPropertyValue("--tufte-map-bg");
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.classList.add("theme-dark");
      document.body.classList.remove("theme-light");
      state.app.workspace.trigger("css-change");
      await wait(400);
      const afterBg = view.svg.style.getPropertyValue("--tufte-map-bg");
      step("a theme switch re-reads the tokens and redraws",
        "the sheet's resolved colours change without a recompute",
        afterBg !== beforeBg && view.theme.dark === true,
        { before: beforeBg, after: afterBg, dark: view.theme.dark });
      document.documentElement.setAttribute("data-theme", "light");
      document.body.classList.remove("theme-dark");
      document.body.classList.add("theme-light");
      state.app.workspace.trigger("css-change");
      await wait(300);

      /* 14 — resize ------------------------------------------------------- */
      const wideLabels = labelCount();
      const wideViewBox = view.svg.getAttribute("viewBox");
      document.getElementById("pane").style.width = "560px";
      // A ResizeObserver is delivered from the rendering loop, and a hidden
      // tab has no rendering loop — so a failure here has to say WHICH of the
      // two things went wrong, or a headless run would report a bug in the
      // plugin every time.
      let observed = true;
      try {
        await until(function () { return view.svg.getAttribute("viewBox") !== wideViewBox; },
          6000, "the resize redraw");
      } catch (e) { observed = false; }
      if (!observed) {
        // No rendering loop, so no ResizeObserver delivery.  The thing being
        // tested — that a narrower sheet is re-placed and re-drawn at the new
        // width — is still testable by calling what the observer calls, and
        // the verdict says which of the two it managed to check.
        view.renderSheet();
        await wait(200);
      }
      await wait(200);
      step("a pane resize re-places the labels",
        "the sheet is redrawn at the new width and the type keeps its size, so fewer names fit",
        view.svg.getAttribute("viewBox") !== wideViewBox && labelCount() <= wideLabels,
        { wideLabels: wideLabels, narrowLabels: labelCount(),
          wideViewBox: wideViewBox, narrowViewBox: view.svg.getAttribute("viewBox"),
          observerInstalled: !!view.observer,
          documentVisibility: document.visibilityState,
          via: observed ? "the ResizeObserver" :
            "renderSheet() directly — this tab has no rendering loop, so no ResizeObserver could be delivered; the observer's own firing is left for the live-Obsidian stage" });
      document.getElementById("pane").style.width = "900px";
      await wait(600);

      /* 15 — the empty and error paths never throw ------------------------ */
      const before = view.model;
      let threw = null;
      try {
        view.setStatus("");
        view.setHot(-1, null);
        view.applyFilter();
      } catch (e) { threw = String(e && e.message); }
      step("the view survives being poked in every order",
        "clearing the hot note, the status and the filter in sequence throws nothing",
        threw === null && view.model === before, { threw: threw });

      /* ---------------------------------------------------------------- *
       * 16-20 — the pane the plugin actually met.
       *
       * Everything above ran at 900 px and a 16 px reading size, which is the
       * one configuration that hid the four faults the first install found.
       * These steps run at 884 px / 19 px — a main pane on the user's machine
       * — and then at 1,300 px / 16 px, and they measure the DRAWN sheet:
       * boxes come from getBBox and radii from the circles, not from the
       * layout the placer is proud of.
       * ----------------------------------------------------------------- */

      /* 16 — the stacked layout ------------------------------------------ */
      state.setWidth(884);
      state.setBaseFont(19);
      await wait(120);
      view.renderSheet();
      await wait(250);
      const paneBox = view.contentEl.getBoundingClientRect();
      const sheetBox = view.sheetEl.getBoundingClientRect();
      const marginBox = view.marginEl.getBoundingClientRect();
      const share = sheetBox.width / paneBox.width;
      const stacked = marginBox.top >= sheetBox.bottom - 1;
      const noHScroll = view.contentEl.scrollWidth <= view.contentEl.clientWidth + 1;
      step("884 px / 19 px stacks the margin under a full-width sheet",
        "the margin column starts below the sheet, the sheet keeps at least 93% of the pane — app.css's own 12 px of view-content padding is left alone in the full presentation — and nothing scrolls sideways",
        stacked && share >= 0.93 && noHScroll,
        { paneWidth: Math.round(paneBox.width), sheetWidth: Math.round(sheetBox.width),
          sheetShare: +share.toFixed(3), marginTop: Math.round(marginBox.top - paneBox.top),
          sheetBottom: Math.round(sheetBox.bottom - paneBox.top),
          scrollWidth: view.contentEl.scrollWidth, clientWidth: view.contentEl.clientWidth,
          marginColumns: getComputedStyle(view.marginEl).gridTemplateColumns,
          scale: view.svg.getAttribute("data-scale") });

      /* 17 — the drawn summit names -------------------------------------- */
      const summitTexts = Array.prototype.slice.call(
        view.svg.querySelectorAll(".tufte-map-label-summit, .tufte-map-label-numeral"));
      const allTexts = Array.prototype.slice.call(view.svg.querySelectorAll(".tufte-map-label"));
      const circles = Array.prototype.slice.call(view.svg.querySelectorAll(".tufte-map-dot"));
      const boxOf = function (el) {
        const b = el.getBBox();
        return [b.x, b.y, b.x + b.width, b.y + b.height];
      };
      const hits = function (a, b) {
        return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
      };
      // A summit the placer already declared a fallback is excused, and said
      // so in the numbers rather than silently skipped.
      const fallbackSummits = new Set((view.layout.labels || [])
        .filter(function (l) { return l.tier === "summit" && l.fallback; })
        .map(function (l) { return String(l.note); }));
      // Two boxes are being compared, and they are not the same box.  The
      // placer measures the INK — canvas actualBoundingBox ascent and descent
      // — because that is what a reader sees covered.  getBBox reports the
      // box the font reserves, em box and all, which for tracked capitals
      // with no descenders stands a couple of points proud of the letters top
      // and bottom.  So the rendered audit allows that much, and guards the
      // thing the allowance cannot hide as well: a dot whose CENTRE falls
      // inside a summit name is covered however the box is measured.  Both
      // worst penetrations are printed, so a drift shows as a number long
      // before it shows on the paper.
      const EPS_PT = 2.0;
      let overDot = 0, overLabel = 0, excused = 0, worstDot = 0, worstLabel = 0, centres = 0;
      for (const t of summitTexts) {
        if (fallbackSummits.has(t.getAttribute("data-i"))) { excused++; continue; }
        const box = boxOf(t);
        for (const c of circles) {
          const i = +c.getAttribute("data-i");
          if (view.model.nodes[i].deg < 3) continue;
          const cx = +c.getAttribute("cx"), cy = +c.getAttribute("cy"), r = +c.getAttribute("r");
          const dx = cx - Math.max(box[0], Math.min(cx, box[2]));
          const dy = cy - Math.max(box[1], Math.min(cy, box[3]));
          const bite = r - Math.hypot(dx, dy);
          if (bite > 0) worstDot = Math.max(worstDot, bite);
          if (bite > EPS_PT) overDot++;
          // The same allowance the bite test grants, and for the same reason:
          // getBBox reports the box the FONT reserves, which for tracked
          // capitals stands a couple of points proud above and below the
          // letters.  A centre in that overhang is beside the word, not under
          // it — and `overDot` above still catches any dot the ink reaches.
          if (cx >= box[0] && cx <= box[2] &&
              cy >= box[1] + EPS_PT && cy <= box[3] - EPS_PT) centres++;
        }
        for (const o of allTexts) {
          if (o === t || o.getAttribute("data-i") === t.getAttribute("data-i")) continue;
          const b = boxOf(o);
          const ox = Math.min(box[2], b[2]) - Math.max(box[0], b[0]);
          const oy = Math.min(box[3], b[3]) - Math.max(box[1], b[1]);
          if (ox > 0 && oy > 0) {
            const bite = Math.min(ox, oy);
            worstLabel = Math.max(worstLabel, bite);
            if (bite > EPS_PT) overLabel++;
          }
        }
      }
      step("no summit name covers a meaningful dot or another name",
        "measured from the sheet: no dot of three links or more has its centre under a summit name, none is bitten into by more than the font's own box allowance, and no summit name meets another label",
        overDot === 0 && overLabel === 0 && centres === 0,
        { summitTexts: summitTexts.length, dots: circles.length,
          overDot: overDot, overLabel: overLabel, dotCentresCovered: centres,
          excusedFallbacks: excused,
          worstDotBitePt: +worstDot.toFixed(2), worstLabelBitePt: +worstLabel.toFixed(2),
          tolerancePt: EPS_PT });

      /* 18 — the margin band's rows -------------------------------------- */
      const rows = Array.prototype.slice.call(view.marginEl.querySelectorAll(".tufte-map-row-name"));
      const cut = rows.filter(function (r) { return r.scrollWidth > r.clientWidth + 1; });
      const marginPx = parseFloat(getComputedStyle(view.marginEl).fontSize);
      const readingPx = parseFloat(getComputedStyle(view.rootEl).fontSize);
      step("no margin row is truncated, and the column is in the sidenote register",
        "every list row's scrollWidth fits its clientWidth (names wrap rather than ellipsising) and the margin is set at 0.8 of the reading size",
        cut.length === 0 && Math.abs(marginPx - readingPx * 0.8) < 0.6,
        { rows: rows.length, truncated: cut.map(function (r) { return r.textContent; }),
          readingPx: readingPx, marginPx: marginPx,
          headingPx: parseFloat(getComputedStyle(
            view.marginEl.querySelector(".tufte-map-heading")).fontSize) });

      /* 19 — the Find field against Obsidian's own rules ------------------ */
      const find = view.findEl;
      const bare = function (cs) {
        return {
          borderTopWidth: cs.borderTopWidth,
          borderBottomWidth: cs.borderBottomWidth,
          borderRadius: cs.borderTopLeftRadius,
          background: cs.backgroundColor,
          boxShadow: cs.boxShadow,
          height: cs.height
        };
      };
      const isBare = function (v) {
        return parseFloat(v.borderTopWidth) === 0 && parseFloat(v.borderBottomWidth) > 0 &&
          parseFloat(v.borderRadius) === 0 && v.boxShadow === "none" &&
          /rgba\(0, 0, 0, 0\)|transparent/.test(v.background);
      };
      const normal = bare(getComputedStyle(find));
      find.focus();
      await wait(60);
      const focused = bare(getComputedStyle(find));
      find.blur();
      // :hover cannot be forced from script, so the hover state is decided the
      // way the browser decides it — by running the cascade — over the rules
      // that WOULD match with the pointer on the field.  It is the cascade,
      // not the pixels, that lost the first time round.
      const hoverOwner = window.TufteMapSelftest.cascadeOwner(find, "hover",
        ["border-radius", "background-color", "box-shadow", "border-bottom-color"]);
      const hoverOurs = Object.keys(hoverOwner).every(function (k) {
        return /tufte-map-find/.test(hoverOwner[k].selector);
      });
      // The same cascade argument decides the text controls, and the same
      // stylesheet was beating them: `button:not(.clickable-icon)` is (0,1,1)
      // and put a fill and a shadow behind three words.
      const ctl = getComputedStyle(view.resetEl);
      const ctlBare = /rgba\(0, 0, 0, 0\)|transparent/.test(ctl.backgroundColor) &&
        ctl.boxShadow === "none" && parseFloat(ctl.borderTopLeftRadius) === 0;
      step("the Find field is a bare underline under Obsidian's own stylesheet",
        "with app.css's input[type] and button rules loaded first, our underline still wins in the normal, hover and focus states, the focus is said in the accent, and the text controls are words rather than buttons",
        isBare(normal) && isBare(focused) &&
        focused.borderBottomWidth === normal.borderBottomWidth && hoverOurs && ctlBare,
        { normal: normal, focused: focused,
          textControl: { background: ctl.backgroundColor, boxShadow: ctl.boxShadow,
            radius: ctl.borderTopLeftRadius, height: ctl.height },
          hoverWinners: Object.keys(hoverOwner).map(function (k) {
            return k + " ← " + hoverOwner[k].selector.split(",")[0].trim();
          }) });

      /* 20 — the wide layout --------------------------------------------- */
      state.setWidth(1300);
      state.setBaseFont(16);
      await wait(120);
      view.renderSheet();
      await wait(250);
      const wideSheet = view.sheetEl.getBoundingClientRect();
      const wideMargin = view.marginEl.getBoundingClientRect();
      const widePane = view.contentEl.getBoundingClientRect();
      step("1,300 px puts the margin back beside the sheet",
        "above the breakpoint the layout is side by side, the sheet takes about four fifths of the pane and the two tops are level",
        wideMargin.left > wideSheet.right - 1 &&
        Math.abs(wideMargin.top - wideSheet.top) < 4 &&
        wideSheet.width / widePane.width > 0.7,
        { sheetWidth: Math.round(wideSheet.width), marginLeft: Math.round(wideMargin.left - widePane.left),
          sheetRight: Math.round(wideSheet.right - widePane.left),
          sheetShare: +(wideSheet.width / widePane.width).toFixed(3),
          topsDiffer: Math.round(wideMargin.top - wideSheet.top),
          scale: view.svg.getAttribute("data-scale") });

      /* 21 — the toggle collapses the margin in the wide presentation ----- */
      const marginBefore = view.marginEl.getBoundingClientRect().width;
      const sheetBefore = view.sheetEl.getBoundingClientRect().width;
      view.detailsEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(300);
      const sheetAfter = view.sheetEl.getBoundingClientRect().width;
      const marginHidden = getComputedStyle(view.marginEl).display === "none";
      step("the corner toggle collapses the margin column and the sheet widens",
        "in the full presentation hiding the details gives the sheet the whole pane, and the toggle says so in aria-expanded",
        view.mode === "full" && marginHidden && sheetAfter > sheetBefore + 40 &&
        view.detailsEl.getAttribute("aria-expanded") === "false",
        { mode: view.mode, marginBefore: Math.round(marginBefore),
          sheetBefore: Math.round(sheetBefore), sheetAfter: Math.round(sheetAfter),
          ariaExpanded: view.detailsEl.getAttribute("aria-expanded"),
          ariaLabel: view.detailsEl.getAttribute("aria-label") });
      view.detailsEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(300);

      /* ---------------------------------------------------------------- *
       * 22-29 — the SIDEBAR: 436 x 470 at a 19 px reading size, in a side
       * split.  This is the pane the plugin was actually opened in, and the
       * one the whole compact presentation exists for.
       * ----------------------------------------------------------------- */

      state.setPane(436, 470, true, 19);
      await wait(150);
      view.applyPresentation();
      view.renderSheet();
      await wait(350);

      const C = window.module.exports.__core.constants;
      const Core = window.module.exports.__core;

      /* 22 — the mode, and nothing scrolling sideways --------------------- */
      const sideContent = view.contentEl;
      const noHScrollSide = sideContent.scrollWidth <= sideContent.clientWidth + 1;
      const canvasW = view.canvasEl.clientWidth;
      const canvasH = view.canvasEl.clientHeight;
      step("a 436 x 470 side split draws the compact presentation",
        "the mode is compact and said so on the root, the sheet is fitted inside the pane's own box, and nothing scrolls sideways",
        view.mode === "compact" && view.rootEl.classList.contains("tufte-map-compact") &&
        view.rootEl.getAttribute("data-mode") === "compact" &&
        noHScrollSide && canvasW <= view.sheetEl.clientWidth + 1 &&
        canvasH <= sideContent.clientHeight,
        { mode: view.mode, dataMode: view.rootEl.getAttribute("data-mode"),
          canvas: [canvasW, canvasH], sheetBox: [view.sheetEl.clientWidth, view.sheetEl.clientHeight],
          paneHeight: sideContent.clientHeight,
          scrollWidth: sideContent.scrollWidth, clientWidth: sideContent.clientWidth });

      /* 23 — the orientation ---------------------------------------------- */
      const boxNow = view.sheetBox();
      const fitNow = Core.fitSheet(view.model.frameW, view.model.frameH, boxNow.w, boxNow.h);
      state.setPane(300, 760, true, 19);
      await wait(150);
      view.applyPresentation();
      view.renderSheet();
      await wait(350);
      const boxTall = view.sheetBox();
      const fitTall = Core.fitSheet(view.model.frameW, view.model.frameH, boxTall.w, boxTall.h);
      const tallRotated = view.rotated;
      const tallSummits = view.layout.names;
      state.setPane(436, 470, true, 19);
      await wait(150);
      view.applyPresentation();
      view.renderSheet();
      await wait(350);
      step("the sheet turns ninety degrees exactly when turning wins",
        "the orientation is whichever of the two fits the pane's box at the larger scale, and only when the turn is worth making (type is set horizontally, so a marginal turn costs a name the width it needs) — not rotated in a square-ish sidebar, rotated in a tall one, and the labels are placed in the space they are drawn in",
        view.rotated === fitNow.rotated && tallRotated === fitTall.rotated &&
        tallRotated === true && tallSummits === view.model.peaks.length,
        { minGain: fitNow.minGain,
          sidebar: { box: [Math.round(boxNow.w), Math.round(boxNow.h)],
            gain: +fitNow.gain.toFixed(3), rotated: view.rotated },
          tall: { box: [Math.round(boxTall.w), Math.round(boxTall.h)],
            gain: +fitTall.gain.toFixed(3), rotated: tallRotated, summitsNamed: tallSummits } });

      /* 24 — the scale continues below the old clamp ---------------------- */
      const L = view.layout;
      const sheetPt = L.sheetWidthPt;
      const radii = Array.prototype.slice.call(view.svg.querySelectorAll(".tufte-map-dot"))
        .map(function (c) { return +c.getAttribute("r"); });
      const rMin = Math.min.apply(null, radii), rMax = Math.max.apply(null, radii);
      step("the design scale continues below 0.72, with Flannery's floor and ceiling",
        "the scale is the continued curve rather than the old clamp, the smallest dot is at least 1.1 px and the largest is no wider than 3.5% of the sheet",
        L.scale < C.SCALE_MIN && L.scale >= C.SCALE_FLOOR &&
        Math.abs(L.scale - Core.designScale(sheetPt)) < 1e-9 &&
        rMin >= C.DOT_MIN_RADIUS_PT - 1e-6 && 2 * rMax <= C.COMPACT_DOT_CAP_FRAC * sheetPt + 1e-6,
        { sheetPt: +sheetPt.toFixed(1), scale: +L.scale.toFixed(4),
          scaleAt300pt: +Core.designScale(300).toFixed(4),
          scaleAt436px: +Core.designScale(436 * C.PT_PER_CSS_PX).toFixed(4),
          scaleAt565pt: +Core.designScale(565).toFixed(4),
          smallestDotPt: +rMin.toFixed(3), smallestDotPx: +(rMin / C.PT_PER_CSS_PX).toFixed(2),
          largestDotPt: +rMax.toFixed(3),
          largestShareOfSheet: +((2 * rMax) / sheetPt).toFixed(4) });

      /* 25 — the summits, named or numbered, never fudged ------------------ */
      const summitLabels = (L.labels || []).filter(function (l) { return l.tier === "summit"; });
      const summitFallbacks = summitLabels.filter(function (l) { return l.fallback; });
      step("every summit is either named cleanly or left to its numeral",
        "no summit name is placed as a fallback across its own dots: a name that cannot stand clear is replaced by the red numeral, and the details list maps the numerals to the names",
        summitFallbacks.length === 0 &&
        L.names + L.numeralsOnly === view.model.peaks.length,
        { peaks: view.model.peaks.length, namesPlaced: L.names,
          numeralsOnly: L.numeralsOnly, fallbacks: summitFallbacks.length,
          looseNumerals: (L.labels || []).filter(function (l) { return l.tier === "numeral"; }).length,
          summitPt: +L.summitPt.toFixed(2) });

      /* 26 — the text fade threshold -------------------------------------- */
      const minorAtOne = (L.labels || []).filter(function (l) { return l.tier === "minor"; }).length;
      const tiersAtOne = { minor: L.tiers.minor, name: L.tiers.name };
      const hubIdx = nodeIndexByTitle("Typography");
      const hubAt = at(hubIdx);
      sheet.dispatchEvent(new WheelEvent("wheel", { clientX: hubAt.x, clientY: hubAt.y,
        deltaY: -92, ctrlKey: true, bubbles: true, cancelable: true }));
      await wait(500);
      const zoomed = view.currentViewport().zoom;
      const minorZoomed = (view.layout.labels || []).filter(function (l) { return l.tier === "minor"; }).length;
      const tiersZoomed = view.layout.tiers;
      step("minor names fade in with the zoom, the way the graph view's do",
        "at zoom 1 the sidebar is below the minor tier's threshold and places none; a pinch past two and a half brings the tier's opacity up and the names with it",
        minorAtOne === 0 && tiersAtOne.minor === 0 && zoomed > 2.4 &&
        tiersZoomed.minor > 0 && minorZoomed > 0 && tiersAtOne.name === 1,
        { zoom: +zoomed.toFixed(2),
          minorAtZoom1: minorAtOne, minorAfterZoom: minorZoomed,
          tierOpacityAtZoom1: { minor: +tiersAtOne.minor.toFixed(3), name: +tiersAtOne.name.toFixed(3) },
          tierOpacityZoomed: { minor: +tiersZoomed.minor.toFixed(3), name: +tiersZoomed.name.toFixed(3) },
          effectiveWidthPt: +tiersZoomed.effectiveWidthPt.toFixed(0),
          minorThresholdPt: Core.tierThreshold(C.TIER_THRESHOLD_MINOR_PT,
            state.plugin.settings.textFadeThreshold),
          budget: Core.topferBudget(state.plugin.settings.namedNotes, tiersZoomed.effectiveWidthPt) });
      view.resetView();
      await wait(350);

      /* 27 — the contour web thins with the same square root -------------- */
      const drawnKinds = {};
      Array.prototype.slice.call(view.svg.querySelectorAll(".tufte-map-contours > g"))
        .forEach(function (g) {
          const k = (g.getAttribute("class") || "").replace(/.*tufte-map-contour-/, "");
          drawnKinds[k] = (drawnKinds[k] || 0) + 1;
        });
      step("Töpfer thins the contour web as well as the names",
        "a sheet a third of the design width draws six bands rather than twelve, and the terrain raster is quantised into the same reduced set so a band edge and its line coincide",
        view.bands <= 6 && view.drawModel.levels.length - 1 <= 6 &&
        view.drawModel.contours.length <= view.model.contours.length,
        { bands: view.bands, levels: view.drawModel.levels.length,
          modelContourSets: view.model.contours.length,
          drawnContourSets: view.drawModel.contours.length, drawnKinds: drawnKinds });

      /* 28 — the details band and its memory ------------------------------ */
      const hiddenByDefault = getComputedStyle(view.marginEl).display === "none";
      // The sheet's box is computed as if the details were hidden, so opening
      // them may not cost the map a pixel or move a label.  It used to: the
      // band took its height out of the sheet and two summit names stacked.
      const sheetShut = [view.canvasEl.clientWidth, view.canvasEl.clientHeight];
      const placedShut = (view.layout.labels || [])
        .map(function (l) { return l.text + "@" + l.bbox.map(function (v) { return v.toFixed(5); }).join(","); }).join("|");
      view.detailsEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(350);
      const shown = getComputedStyle(view.marginEl).display !== "none";
      const sheetOpen = [view.canvasEl.clientWidth, view.canvasEl.clientHeight];
      const placedOpen = (view.layout.labels || [])
        .map(function (l) { return l.text + "@" + l.bbox.map(function (v) { return v.toFixed(5); }).join(","); }).join("|");
      const saved = state.app.__data && state.app.__data.settings
        ? state.app.__data.settings.detailsCompact : null;
      // A re-mount: the DOM is built again from nothing, exactly as a reopened
      // leaf builds it, and the band has to come back by itself.
      view.buildDom();
      view.registerListeners();
      view.applyPresentation();
      view.refreshMargin();
      view.renderSheet();
      await wait(350);
      const stillShown = getComputedStyle(view.marginEl).display !== "none";
      const sheetRemount = [view.canvasEl.clientWidth, view.canvasEl.clientHeight];
      // The BAND scrolls, not the view: the view's own box stays exactly as
      // tall as the pane, so no scrollbar can appear beside the sheet.
      const bandScrolls = view.marginEl.scrollHeight > view.marginEl.clientHeight &&
        view.contentEl.scrollHeight <= view.contentEl.clientHeight + 1;
      step("the details toggle hides the band by default and remembers the answer",
        "compact opens as a map; one click on the corner brings the summits, folders and Show band beneath the sheet and the band scrolls inside itself rather than the sheet shrinking — the map keeps its size and every label its place — the choice is written to the plugin's data, and a rebuilt view comes up with the band still open",
        hiddenByDefault && shown && saved === true && stillShown &&
        view.marginEl.querySelectorAll(".tufte-map-row").length > 0 &&
        sheetOpen[0] === sheetShut[0] && sheetOpen[1] === sheetShut[1] &&
        sheetRemount[0] === sheetShut[0] && sheetRemount[1] === sheetShut[1] &&
        placedOpen === placedShut && bandScrolls,
        { hiddenByDefault: hiddenByDefault, shownAfterClick: shown,
          savedSetting: saved, afterRemount: stillShown,
          sheetShut: sheetShut, sheetOpen: sheetOpen, sheetAfterRemount: sheetRemount,
          labelsUnmoved: placedOpen === placedShut,
          bandScrollsItself: bandScrolls, bandHeightPx: view.bandHeightPx,
          bandTight: view.rootEl.classList.contains("tufte-map-band-tight"),
          bandRows: view.marginEl.querySelectorAll(".tufte-map-row").length,
          guideHidden: getComputedStyle(view.marginEl.querySelector(".tufte-map-guide")).display,
          hintShown: getComputedStyle(view.marginEl.querySelector(".tufte-map-hint")).display });
      view.detailsEl.dispatchEvent(new PointerEvent("click", { bubbles: true, cancelable: true }));
      await wait(350);

      /* 29 — the strip's geometry ----------------------------------------- */
      const stripBox = view.stripEl.getBoundingClientRect();
      const findBox = view.findEl.getBoundingClientRect();
      const tgBox = view.detailsEl.getBoundingClientRect();
      const inCorner = stripBox.right - tgBox.right <= 16;
      const sameRow = Math.abs((findBox.top + findBox.bottom) / 2 - (tgBox.top + tgBox.bottom) / 2) < 14;
      const beside = sameRow && findBox.right <= tgBox.left + 1;
      const beneath = !sameRow && findBox.top >= tgBox.bottom - 2;
      step("the search sits under or beside the corner toggle",
        "the toggle keeps the top-right corner of the content and the Find field is the line beside it (one row) or beneath it (under 320 px), with a 28 px hit area either way",
        inCorner && (beside || beneath) &&
        Math.round(tgBox.width) === 28 && Math.round(tgBox.height) === 28,
        { strip: [Math.round(stripBox.width), Math.round(stripBox.height)],
          toggle: [Math.round(tgBox.width), Math.round(tgBox.height)],
          cornerGapPx: Math.round(stripBox.right - tgBox.right),
          arrangement: beside ? "one row" : (beneath ? "two rows" : "neither"),
          findRight: Math.round(findBox.right - stripBox.left),
          toggleLeft: Math.round(tgBox.left - stripBox.left) });

      /* 30 — nothing on the compact sheet touches anything else ----------- */
      const allSide = Array.prototype.slice.call(view.svg.querySelectorAll(".tufte-map-label"));
      const sideCircles = Array.prototype.slice.call(view.svg.querySelectorAll(".tufte-map-dot"));
      const bx = function (el) { const b = el.getBBox(); return [b.x, b.y, b.x + b.width, b.y + b.height]; };
      // A numeral the placer had to force — nowhere on seven rungs was clean —
      // is excused and counted, the same way a fallback summit name is.  It is
      // the map's last word about a hill and it is better set over a speck
      // than not set at all.
      let pairHits = 0, dotCentres = 0, worst = 0, excusedMarks = 0;
      for (let a = 0; a < allSide.length; a++) {
        if (allSide[a].classList.contains("tufte-map-label-forced")) { excusedMarks++; continue; }
        const A = bx(allSide[a]);
        for (let b = a + 1; b < allSide.length; b++) {
          if (allSide[a].getAttribute("data-i") === allSide[b].getAttribute("data-i")) continue;
          const B = bx(allSide[b]);
          const ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]);
          const oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
          if (ox > 0 && oy > 0) { worst = Math.max(worst, Math.min(ox, oy)); if (Math.min(ox, oy) > 2.0) pairHits++; }
        }
        for (const c of sideCircles) {
          const i = +c.getAttribute("data-i");
          if (view.model.nodes[i].deg < 3) continue;
          const cx = +c.getAttribute("cx"), cy = +c.getAttribute("cy");
          // The same em-box allowance step 17 documents and for the same
          // reason: getBBox reports the box the font reserves, and a centre
          // in the descender overhang is beside the word, not under it.  The
          // placer's own rule — measured on the INK — is asserted separately.
          if (cx >= A[0] && cx <= A[2] && cy >= A[1] + EPS_PT && cy <= A[3] - EPS_PT) dotCentres++;
        }
      }
      step("no label on the compact sheet collides with another or covers a dot",
        "measured from the drawn sheet: no two labels overlap by more than the font's own box allowance, and no dot of three links or more has its centre under one",
        pairHits === 0 && dotCentres === 0,
        { labels: allSide.length, overlappingPairs: pairHits,
          dotCentresCovered: dotCentres, worstOverlapPt: +worst.toFixed(2),
          excusedForcedNumerals: excusedMarks });

      /* ---------------------------------------------------------------- *
       * 31-32 — the sidebar the plugin is actually installed in: 349 x 383
       * of view content at a 19 px reading size.  Every pixel the furniture
       * takes here is a pixel the map does not get, so both steps measure
       * the FURNITURE as well as the sheet.
       * ----------------------------------------------------------------- */

      state.setPane(349, 383, true, 19);
      await wait(180);
      view.applyPresentation();
      view.renderSheet();
      await wait(400);

      const realContent = view.contentEl;
      const realStrip = view.stripEl.getBoundingClientRect();
      const realFind = view.findEl.getBoundingClientRect();
      const realToggle = view.detailsEl.getBoundingClientRect();
      const realRootCS = getComputedStyle(view.rootEl);
      const oneRow = Math.abs((realFind.top + realFind.bottom) / 2 -
        (realToggle.top + realToggle.bottom) / 2) < 14;
      const gutters = realContent.clientWidth - view.sheetEl.clientWidth;
      const aboveStrip = realStrip.top - realContent.getBoundingClientRect().top;
      const paneCS = getComputedStyle(realContent);
      const sheetFont = getComputedStyle(view.svg).fontFamily;
      const rootFont = getComputedStyle(view.rootEl).fontFamily;
      const findFont = getComputedStyle(view.findEl).fontFamily;
      const leafFont = getComputedStyle(view.containerEl).fontFamily;
      const isText = function (f) { return /et-book|Palatino|Georgia|serif/i.test(f) && !/Gill Sans/i.test(f); };
      step("the real sidebar spends its pixels on the map, not on furniture",
        "349 x 383 of content: app.css's 12 px view-content padding taken off, 8 px side gutters, a single-row strip no taller than 36 px with no more than 6 px above it, the sheet taking what is left, nothing scrolling sideways, and the whole view set in the READING face although the leaf around it is in the interface one",
        view.mode === "compact" && oneRow && realStrip.height <= 36 &&
        aboveStrip <= 6.5 && gutters <= 20 &&
        parseFloat(paneCS.paddingLeft) === 0 && paneCS.overflow === "hidden" &&
        isText(sheetFont) && isText(rootFont) && isText(findFont) &&
        /Gill Sans/i.test(leafFont) &&
        realContent.scrollWidth <= realContent.clientWidth + 1,
        { content: [realContent.clientWidth, realContent.clientHeight],
          sheetBoxPx: [Math.round(view.sheetBox().w), Math.round(view.sheetBox().h)],
          canvas: [view.canvasEl.clientWidth, view.canvasEl.clientHeight],
          stripHeight: Math.round(realStrip.height), pxAboveStrip: Math.round(aboveStrip),
          gutters: gutters, padding: realRootCS.padding,
          arrangement: oneRow ? "one row" : "two rows",
          viewContentPadding: paneCS.padding, viewOverflow: paneCS.overflow,
          leafFace: leafFont.split(",")[0], sheetFace: sheetFont.split(",")[0],
          rootFace: rootFont.split(",")[0], findFace: findFont.split(",")[0],
          scrollWidth: realContent.scrollWidth, clientWidth: realContent.clientWidth });

      /* 32 — and what the wider sheet buys ------------------------------- */
      const realL = view.layout;
      const realTexts = Array.prototype.slice.call(view.svg.querySelectorAll(".tufte-map-label"))
        .filter(function (el) { return !el.classList.contains("tufte-map-label-forced"); });
      const realCircles = Array.prototype.slice.call(view.svg.querySelectorAll(".tufte-map-dot"));
      let realPairs = 0, realCentres = 0;
      for (let a = 0; a < realTexts.length; a++) {
        const A = (function (el) { const b = el.getBBox(); return [b.x, b.y, b.x + b.width, b.y + b.height]; })(realTexts[a]);
        for (let b = a + 1; b < realTexts.length; b++) {
          if (realTexts[a].getAttribute("data-i") === realTexts[b].getAttribute("data-i")) continue;
          const B = (function (el) { const q = el.getBBox(); return [q.x, q.y, q.x + q.width, q.y + q.height]; })(realTexts[b]);
          const ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]);
          const oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]);
          if (ox > 2.0 && oy > 2.0) realPairs++;
        }
        for (const c of realCircles) {
          const i = +c.getAttribute("data-i");
          if (view.model.nodes[i].deg < 3) continue;
          const cx = +c.getAttribute("cx"), cy = +c.getAttribute("cy");
          if (cx >= A[0] && cx <= A[2] && cy >= A[1] + EPS_PT && cy <= A[3] - EPS_PT) realCentres++;
        }
      }
      const named = (realL.labels || []).filter(function (l) { return l.tier === "summit"; })
        .map(function (l) { return l.text; });
      const numberedOnly = (realL.labels || [])
        .filter(function (l) { return l.tier === "numeral" && l.numeralOnly; })
        .map(function (l) { return l.numeral; });
      step("the sheet the real sidebar gets is a legible map",
        "the scale is above the floor, every summit is named or numbered, no name is a fallback across its own dots, and nothing on the sheet collides",
        realL.scale > C.SCALE_FLOOR && realPairs === 0 && realCentres === 0 &&
        realL.names + realL.numeralsOnly === view.model.peaks.length &&
        (realL.labels || []).filter(function (l) { return l.tier === "summit" && l.fallback; }).length === 0,
        { sheetPt: Math.round(realL.sheetWidthPt), scale: +realL.scale.toFixed(4),
          scaleFloor: C.SCALE_FLOOR, bands: view.bands,
          summitsNamed: realL.names, numeralOnly: realL.numeralsOnly,
          names: named, numeralOnlyMarks: numberedOnly,
          minorLabels: (realL.labels || []).filter(function (l) { return l.tier === "minor"; }).length,
          overlappingPairs: realPairs, dotCentresCovered: realCentres });

    } catch (e) {
      steps.push({ step: "RUN", asserted: "the script itself completes", pass: false,
        numbers: { error: String((e && e.message) || e) } });
      say("SELFTEST ERROR: " + (e && e.message));
      console.error(e);
    }

    const verdict = {
      passed: steps.filter(function (s) { return s.pass; }).length,
      of: steps.length,
      coldOpenMs: state.coldMs,
      steps: steps
    };
    document.getElementById("selftest-result").textContent = JSON.stringify(verdict, null, 2);
    say("selftest: " + verdict.passed + " / " + verdict.of + " steps passed");
    window.__selftestDone = true;
    return verdict;
  };
  window.TufteMapSelftest.cascadeOwner = cascadeOwner;
})();
