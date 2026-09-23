/* The harness: the REAL plugin, the REAL view, against a stubbed `app`.
 *
 * Nothing in plugin/main.js is reimplemented here and nothing is patched.  The
 * page builds an `app` object with the handful of Obsidian surfaces the view
 * actually touches — a vault of TFiles, a metadata cache that can be made to
 * fire "resolved", a workspace with leaves that log what they were asked to
 * open — hands it to `new TufteMapPlugin(app, manifest)`, and calls the same
 * command the ribbon calls.
 *
 * What this proves and what it cannot: it exercises every line of the view's
 * own logic, including the interactions, because those are ordinary DOM.  It
 * cannot prove anything about Obsidian's page-preview popover, about real leaf
 * reuse, or about a touch device, because all three live on the other side of
 * the stub.  Those are for the live-Obsidian stage.
 */
(function () {
  "use strict";

  const Stub = window.TufteObsidianStub;
  const PluginClass = window.module.exports;
  const Core = window.module.exports.__core;
  const VIEW = window.module.exports.__view;

  const log = [];
  const logEl = document.getElementById("log");
  function say(line) {
    log.push(line);
    const row = document.createElement("div");
    row.textContent = line;
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  /* -- the vault --------------------------------------------------------- */

  function buildVault(fixture) {
    const folders = new Map();
    const folderOf = function (dir) {
      if (!dir) return null;
      if (!folders.has(dir)) folders.set(dir, new Stub.TFolder(dir));
      return folders.get(dir);
    };
    const byPath = new Map();
    const files = [];
    const add = function (path) {
      const i = path.lastIndexOf("/");
      const f = new Stub.TFile(path, folderOf(i < 0 ? "" : path.slice(0, i)));
      files.push(f);
      byPath.set(path, f);
      return f;
    };
    for (let i = 0; i < fixture.files.length; i++) add(fixture.files[i].path);
    return {
      files: files, byPath: byPath, add: add,
      name: fixture.vault || "Vault"
    };
  }

  /* -- leaves ------------------------------------------------------------ */

  let leafSeq = 0;

  class Leaf {
    constructor(app, kind) {
      this.app = app;
      this.kind = kind;
      this.id = "leaf-" + (++leafSeq);
      this.view = null;
      this.pinned = false;
      this.containerEl = document.createElement("div");
      this.containerEl.className = "harness-leaf";
    }
    getRoot() {
      // A sidebar leaf answers with the side split, exactly as a real one
      // does; the harness checkbox can force any leaf into one.
      return (this.kind === "sidebar" || this.app.__forceSideSplit)
        ? this.app.workspace.__sideSplit : this.app.workspace.rootSplit;
    }
    getViewState() {
      return {
        type: this.view ? this.view.getViewType() : "empty",
        pinned: this.pinned
      };
    }
    async setViewState(state) {
      const factory = this.app.__views && this.app.__views[state.type];
      if (!factory) return;
      this.view = factory(this);
      this.containerEl.appendChild(this.view.containerEl);
      document.getElementById("pane").appendChild(this.containerEl);
      await this.view.onOpen();
      this.app.__mapView = this.view;
    }
    async openFile(file) {
      this.lastFile = file;
      say("openFile(" + file.path + ")  →  " + this.id + " [" + this.kind + "]");
      this.app.__opened.push({ path: file.path, leaf: this.id, kind: this.kind });
      this.app.workspace.trigger("file-open", file);
    }
    detach() {
      const i = this.app.__leaves.indexOf(this);
      if (i >= 0) this.app.__leaves.splice(i, 1);
      if (this.containerEl.parentNode) this.containerEl.parentNode.removeChild(this.containerEl);
    }
  }

  /* -- the app ----------------------------------------------------------- */

  function buildApp(fixture) {
    const vault = buildVault(fixture);
    const app = {};
    app.__leaves = [];
    app.__opened = [];
    app.__data = null;

    const resolved = JSON.parse(JSON.stringify(fixture.resolvedLinks));

    const metaEvents = new Stub.Events();
    app.metadataCache = {
      resolvedLinks: resolved,
      on: function (n, f, c) { return metaEvents.on(n, f, c); },
      off: function (n, f) { return metaEvents.off(n, f); },
      trigger: function () { return metaEvents.trigger.apply(metaEvents, arguments); }
    };

    app.vault = {
      getName: function () { return vault.name; },
      getMarkdownFiles: function () { return vault.files.slice(); },
      getAbstractFileByPath: function (p) { return vault.byPath.get(p) || null; },
      __add: vault.add
    };

    const wsEvents = new Stub.Events();
    const rootSplit = { __root: true };
    const sideSplit = { __side: true };
    app.workspace = {
      rootSplit: rootSplit,
      __sideSplit: sideSplit,
      on: function (n, f, c) { return wsEvents.on(n, f, c); },
      off: function (n, f) { return wsEvents.off(n, f); },
      trigger: function () { return wsEvents.trigger.apply(wsEvents, arguments); },
      getLeaf: function (kind) {
        const l = new Leaf(app, kind === true ? "tab" : (kind || "current"));
        app.__leaves.push(l);
        return l;
      },
      getRightLeaf: function () {
        const l = new Leaf(app, "sidebar");
        app.__leaves.push(l);
        return l;
      },
      getLeavesOfType: function (type) {
        return app.__leaves.filter(function (l) {
          return l.view && l.view.getViewType() === type;
        });
      },
      getMostRecentLeaf: function () {
        // The most recently opened non-map leaf, which is what Obsidian's own
        // rootSplit answer amounts to for our purposes.
        for (let i = app.__leaves.length - 1; i >= 0; i--) {
          const l = app.__leaves[i];
          if (l.view && l.view.getViewType() === VIEW.VIEW_TYPE) continue;
          return l;
        }
        return null;
      },
      iterateAllLeaves: function (fn) { app.__leaves.slice().forEach(fn); },
      revealLeaf: function () {},
      getActiveFile: function () { return app.__activeFile || null; }
    };

    wsEvents.on("file-open", function (f) { app.__activeFile = f; });

    app.__fixture = fixture;
    app.__resolved = resolved;
    return app;
  }

  /* -- boot -------------------------------------------------------------- */

  const state = { app: null, plugin: null, view: null, added: 0 };
  window.TufteMapHarness = state;

  async function boot() {
    say("loading the fixture…");
    const fixture = await (await fetch("../fixtures/vault-graph.json")).json();
    const app = buildApp(fixture);
    state.app = app;

    const manifest = await (await fetch(window.__TUFTE_PLUGIN + "manifest.json")).json();
    const plugin = new PluginClass(app, manifest);
    state.plugin = plugin;
    plugin.load();
    await plugin.onload();
    say("plugin loaded — commands: " + Object.keys(app.__commands || {}).join(", "));
    say("hover-link sources: " + Object.keys(app.__hoverSources || {}).join(", "));

    const t0 = performance.now();
    app.__commands["open-knowledge-map"].callback();
    await settled();
    state.coldMs = Math.round(performance.now() - t0);
    say("cold open: " + state.coldMs + " ms");
    report();
    wireControls();

    if (/[?&]selftest=1/.test(location.search)) {
      const run = window.TufteMapSelftest;
      if (run) run(state, say);
    }
  }

  /* The command's callback is fire-and-forget, exactly as Obsidian's are, so
   * "the map is open" is something to wait for rather than to be handed. */
  function settled() {
    return new Promise(function (r) {
      const tick = function () {
        const v = state.app && state.app.__mapView;
        if (v) state.view = v;
        if (v && v.svg && !v.busy) { r(v); return; }
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  function report() {
    const v = state.view;
    const m = v && v.model;
    const el = document.getElementById("facts");
    el.textContent = m
      ? [m.counts.placed + " placed", m.counts.links + " links",
        m.peaks.length + " summits", "frame " + m.frameW,
        (v.layout ? v.layout.labels.length + " labels" : ""),
        "folder depth " + (v.folders ? v.folders.depth : "?")].filter(Boolean).join(" · ")
      : "no model";
  }

  /* -- the page's own controls ------------------------------------------ */

  function wireControls() {
    document.getElementById("mode").addEventListener("change", function (e) {
      document.documentElement.setAttribute("data-theme", e.target.value);
      document.body.classList.toggle("theme-dark", e.target.value === "dark");
      document.body.classList.toggle("theme-light", e.target.value !== "dark");
      state.app.workspace.trigger("css-change");
      say("theme → " + e.target.value);
    });

    document.getElementById("width").addEventListener("change", function (e) {
      const v = e.target.value;
      if (v === "sidebar-real") setPane(349, 383, true, 19);
      else if (v === "sidebar") setPane(436, 470, true, 19);
      else if (v === "sidebar-tall") setPane(300, 760, true, 19);
      else setPane(+v, 0, false);
    });

    document.getElementById("side").addEventListener("change", function (e) {
      state.app.__forceSideSplit = !!e.target.checked;
      say("side split → " + (e.target.checked ? "yes" : "no"));
      if (state.view) { state.view.applyPresentation(); state.view.renderSheet(); }
    });

    document.getElementById("basefont").addEventListener("change", function (e) {
      setBaseFont(+e.target.value);
    });

    document.getElementById("grow").addEventListener("click", function () {
      addNotes(10);
    });

    document.getElementById("settings").addEventListener("click", function () {
      const host = document.getElementById("settings-host");
      host.textContent = "";
      const tab = state.app.__settingTab;
      if (!tab) { say("no settings tab registered"); return; }
      tab.display();
      host.appendChild(tab.containerEl);
      say("settings tab rendered");
    });
  }

  /* Obsidian sets the reader's text size as a custom property AND as the
   * body's own font-size, and every view inherits both.  The harness does the
   * same thing on the pane, because a plugin tested at one size only is a
   * plugin tested on one machine only. */
  function setBaseFont(px) {
    const pane = document.getElementById("pane");
    pane.style.setProperty("--font-text-size", px + "px");
    pane.style.fontSize = px + "px";
    document.getElementById("basefont").value = String(px);
    say("base font → " + px + " px");
    return px;
  }

  function setWidth(px) {
    return setPane(px, 0, false);
  }

  /** The pane as a LEAF: a width, optionally a height, and whether the
   *  workspace should answer "side split" for it. */
  function setPane(px, hpx, side, basefont) {
    const pane = document.getElementById("pane");
    pane.style.width = px + "px";
    if (hpx > 0) { pane.style.height = hpx + "px"; pane.classList.add("sized"); }
    else { pane.style.height = ""; pane.classList.remove("sized"); }
    if (state.app) state.app.__forceSideSplit = !!side;
    const box = document.getElementById("side");
    if (box) box.checked = !!side;
    if (basefont) setBaseFont(basefont);
    say("pane → " + px + " x " + (hpx > 0 ? hpx : "auto") + (side ? " (side split)" : ""));
    return px;
  }
  state.setBaseFont = setBaseFont;
  state.setWidth = setWidth;
  state.setPane = setPane;

  function addNotes(k) {
    const app = state.app;
    const hub = app.__fixture.files.find(function (f) { return f.basename === "Typography"; });
    const base = state.added;
    for (let i = 0; i < k; i++) {
      const p = "Knowledge Map Samples/Typography/Harness note " + (base + i) + ".md";
      app.vault.__add(p);
      app.__resolved[p] = {};
      app.__resolved[p][hub.path] = 1;
    }
    state.added += k;
    say("added " + k + " notes linking to Typography; firing 'resolved'");
    app.metadataCache.trigger("resolved");
  }
  state.addNotes = addNotes;
  state.settled = settled;
  state.report = report;
  state.log = log;

  boot().catch(function (e) {
    say("BOOT FAILED: " + (e && e.message));
    console.error(e);
  });
})();
