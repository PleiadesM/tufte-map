/* A stand-in for the `obsidian` module, so `plugin/main.js` — the very file
 * the plugin ships, not a copy of it — can be loaded by a <script> tag.
 *
 * Only what main.js imports is defined, and each class is only as real as the
 * plugin needs it to be: `Component` really does keep and run its cleanups,
 * because the view's promise that `onClose` disconnects everything is exactly
 * the kind of promise a lenient stub lets you break without noticing.
 *
 * The harness page (app.html) builds the fake `app` on top of this; the static
 * preview (index.html) uses none of it beyond the two exports at the bottom of
 * main.js.
 */
(function (global) {
  class Events {
    constructor() { this._ev = new Map(); }
    on(name, fn, ctx) {
      if (!this._ev.has(name)) this._ev.set(name, []);
      const ref = { name: name, fn: fn, ctx: ctx, _events: this };
      this._ev.get(name).push(ref);
      return ref;
    }
    off(name, fn) {
      const arr = this._ev.get(name);
      if (!arr) return;
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].fn === fn) arr.splice(i, 1);
    }
    offref(ref) {
      if (!ref) return;
      const arr = this._ev.get(ref.name);
      if (!arr) return;
      const i = arr.indexOf(ref);
      if (i >= 0) arr.splice(i, 1);
    }
    trigger(name) {
      const arr = (this._ev.get(name) || []).slice();
      const args = Array.prototype.slice.call(arguments, 1);
      for (let i = 0; i < arr.length; i++) {
        try { arr[i].fn.apply(arr[i].ctx, args); }
        catch (e) { console.error("stub: handler for '" + name + "' threw", e); }
      }
    }
  }

  class Component {
    constructor() { this._cleanups = []; this._loaded = false; }
    load() { this._loaded = true; this.onload && this.onload(); }
    unload() {
      this._loaded = false;
      while (this._cleanups.length) {
        const fn = this._cleanups.pop();
        try { fn(); } catch (e) { console.error("stub: cleanup threw", e); }
      }
      this.onunload && this.onunload();
    }
    register(fn) { this._cleanups.push(fn); }
    registerEvent(ref) {
      this._cleanups.push(function () { if (ref && ref._events) ref._events.offref(ref); });
    }
    registerDomEvent(el, type, fn, opts) {
      el.addEventListener(type, fn, opts);
      this._cleanups.push(function () { el.removeEventListener(type, fn, opts); });
    }
    registerInterval(id) { this._cleanups.push(function () { clearInterval(id); }); }
    addChild(c) { c.load && c.load(); return c; }
  }

  class View extends Component {
    constructor(leaf) {
      super();
      this.leaf = leaf;
      this.app = leaf && leaf.app;
      this.containerEl = document.createElement("div");
      this.containerEl.className = "workspace-leaf-content";
      this.contentEl = document.createElement("div");
      this.contentEl.className = "view-content";
      this.containerEl.appendChild(this.contentEl);
    }
    /* The header action a real ItemView offers.  The header is hidden in
     * sidebars by default, which is why the view also puts the control in its
     * own content — the harness keeps both so both can be exercised. */
    addAction(icon, title, cb) {
      const el = document.createElement("button");
      el.className = "view-action";
      el.setAttribute("aria-label", title);
      el.setAttribute("data-icon", icon);
      el.addEventListener("click", cb);
      (this.__actions || (this.__actions = [])).push({ icon: icon, title: title, el: el, cb: cb });
      return el;
    }
    getViewType() { return "view"; }
    getDisplayText() { return ""; }
    getIcon() { return "document"; }
    onOpen() { return Promise.resolve(); }
    onClose() { return Promise.resolve(); }
  }

  class ItemView extends View {}

  class Plugin extends Component {
    constructor(app, manifest) { super(); this.app = app; this.manifest = manifest || {}; }
    registerView(type, factory) { (this.app.__views || (this.app.__views = {}))[type] = factory; }
    registerHoverLinkSource(id, info) { (this.app.__hoverSources || (this.app.__hoverSources = {}))[id] = info; }
    addRibbonIcon(icon, title, cb) {
      const el = document.createElement("button");
      el.setAttribute("aria-label", title);
      el.addEventListener("click", cb);
      (this.app.__ribbon || (this.app.__ribbon = [])).push({ icon: icon, title: title, el: el, cb: cb });
      return el;
    }
    addCommand(cmd) { (this.app.__commands || (this.app.__commands = {}))[cmd.id] = cmd; return cmd; }
    addSettingTab(tab) { this.app.__settingTab = tab; }
    loadData() { return Promise.resolve(this.app.__data ? JSON.parse(JSON.stringify(this.app.__data)) : null); }
    saveData(d) { this.app.__data = JSON.parse(JSON.stringify(d)); return Promise.resolve(); }
  }

  class PluginSettingTab {
    constructor(app, plugin) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = document.createElement("div");
      this.containerEl.empty = function () {
        while (this.firstChild) this.removeChild(this.firstChild);
      };
    }
  }

  /* A Setting close enough to the real one that the tab's chain runs and the
   * controls are real DOM the harness can click. */
  class Setting {
    constructor(containerEl) {
      const doc = containerEl.ownerDocument || document;
      this.settingEl = doc.createElement("div");
      this.settingEl.className = "setting-item";
      this.infoEl = doc.createElement("div");
      this.infoEl.className = "setting-item-info";
      this.nameEl = doc.createElement("div");
      this.nameEl.className = "setting-item-name";
      this.descEl = doc.createElement("div");
      this.descEl.className = "setting-item-description";
      this.controlEl = doc.createElement("div");
      this.controlEl.className = "setting-item-control";
      this.infoEl.appendChild(this.nameEl);
      this.infoEl.appendChild(this.descEl);
      this.settingEl.appendChild(this.infoEl);
      this.settingEl.appendChild(this.controlEl);
      containerEl.appendChild(this.settingEl);
      this._doc = doc;
    }
    setName(v) { this.nameEl.textContent = v; return this; }
    setDesc(v) { this.descEl.textContent = v; return this; }
    _input(type) {
      const el = this._doc.createElement(type === "textarea" ? "textarea" : "input");
      if (type !== "textarea") el.setAttribute("type", type);
      this.controlEl.appendChild(el);
      return el;
    }
    addText(cb) { cb(wrapText(this._input("text"))); return this; }
    addTextArea(cb) { cb(wrapText(this._input("textarea"))); return this; }
    addToggle(cb) {
      const el = this._input("checkbox");
      cb({
        inputEl: el,
        setValue: function (v) { el.checked = !!v; return this; },
        onChange: function (fn) { el.addEventListener("change", function () { fn(el.checked); }); return this; }
      });
      return this;
    }
    addSlider(cb) {
      const el = this._input("range");
      cb({
        sliderEl: el,
        setLimits: function (lo, hi, step) {
          el.min = String(lo); el.max = String(hi); el.step = String(step); return this;
        },
        setValue: function (v) { el.value = String(v); return this; },
        setDynamicTooltip: function () { return this; },
        onChange: function (fn) { el.addEventListener("input", function () { fn(+el.value); }); return this; }
      });
      return this;
    }
    addDropdown(cb) {
      const el = this._doc.createElement("select");
      this.controlEl.appendChild(el);
      cb({
        selectEl: el,
        addOption: function (value, label) {
          const o = document.createElement("option");
          o.value = value; o.textContent = label;
          el.appendChild(o);
          return this;
        },
        setValue: function (v) { el.value = v; return this; },
        onChange: function (fn) { el.addEventListener("change", function () { fn(el.value); }); return this; }
      });
      return this;
    }
    addButton(cb) {
      const el = this._doc.createElement("button");
      this.controlEl.appendChild(el);
      cb({
        buttonEl: el,
        setButtonText: function (v) { el.textContent = v; return this; },
        setCta: function () { return this; },
        onClick: function (fn) { el.addEventListener("click", fn); return this; }
      });
      return this;
    }
  }

  function wrapText(el) {
    return {
      inputEl: el,
      setPlaceholder: function (v) { el.setAttribute("placeholder", v); return this; },
      setValue: function (v) { el.value = v == null ? "" : String(v); return this; },
      onChange: function (fn) { el.addEventListener("input", function () { fn(el.value); }); return this; }
    };
  }

  class TFile {
    constructor(path, parent) {
      this.path = path;
      const i = path.lastIndexOf("/");
      const base = i < 0 ? path : path.slice(i + 1);
      this.basename = base.replace(/\.md$/i, "");
      this.extension = "md";
      this.name = base;
      this.parent = parent || null;
    }
  }
  class TFolder {
    constructor(path) { this.path = path; this.children = []; }
  }

  const Keymap = {
    isModEvent: function (evt) {
      if (!evt) return false;
      const mod = evt.metaKey || evt.ctrlKey;
      if (evt.altKey && mod) return "split";
      if (evt.shiftKey && mod) return "split";
      return mod ? "tab" : false;
    }
  };

  const Platform = {
    isMacOS: /Mac/.test((global.navigator && global.navigator.platform) || ""),
    isMobile: false,
    isDesktop: true
  };

  class Notice {
    constructor(message) { this.message = message; (global.__notices || (global.__notices = [])).push(message); }
    hide() {}
  }

  const api = {
    Component: Component,
    Events: Events,
    ItemView: ItemView,
    Keymap: Keymap,
    Notice: Notice,
    Platform: Platform,
    Plugin: Plugin,
    PluginSettingTab: PluginSettingTab,
    Setting: Setting,
    TFile: TFile,
    TFolder: TFolder,
    View: View,
    /* The real setIcon injects a Lucide <svg>.  The harness has no icon set, so
     * it draws three rules — enough that a screenshot shows a control where
     * the app will show one, and that a click test has something to hit. */
    setIcon: function (el, name) {
      el.setAttribute("data-icon", name);
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      for (const y of [4, 8, 12]) {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", "2"); line.setAttribute("x2", "14");
        line.setAttribute("y1", String(y)); line.setAttribute("y2", String(y));
        line.setAttribute("stroke", "currentColor");
        line.setAttribute("stroke-width", "1.2");
        svg.appendChild(line);
      }
      while (el.firstChild) el.removeChild(el.firstChild);
      el.appendChild(svg);
    }
  };

  global.TufteObsidianStub = api;
  global.require = function (name) {
    if (name === "obsidian") return api;
    throw new Error("preview: no module '" + name + "'");
  };
  global.module = { exports: {} };
})(window);
