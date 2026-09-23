"use strict";
/* Shared test scaffolding.
 *
 * `obsidian` is stubbed by hooking Module._load, which is the only way to
 * require the real main.js — the file the plugin ships — rather than a copy
 * of its core with the import stripped out. */

const Module = require("module");
const path = require("path");
const fs = require("fs");

/* Only what main.js imports.  Node has no DOM, so the view and the settings
 * tab are never instantiated here — the browser harness (preview/app.html)
 * does that against the real thing.  These classes exist so the file loads and
 * so `instanceof TFile` has something to mean. */
class StubComponent {
  register() {} registerEvent() {} registerDomEvent() {} registerInterval() {}
}
const stub = {
  Component: StubComponent,
  Plugin: class Plugin extends StubComponent {
    addCommand() {} addRibbonIcon() {} addSettingTab() {}
    registerView() {} registerHoverLinkSource() {}
    loadData() { return Promise.resolve(null); }
    saveData() { return Promise.resolve(); }
  },
  ItemView: class ItemView extends StubComponent {
    constructor(leaf) { super(); this.leaf = leaf; }
  },
  PluginSettingTab: class PluginSettingTab {
    constructor(app, plugin) { this.app = app; this.plugin = plugin; }
  },
  Setting: class Setting {},
  Notice: class Notice {},
  Keymap: { isModEvent: function () { return false; } },
  Platform: { isMacOS: process.platform === "darwin", isMobile: false },
  TFile: class TFile { constructor(path) { this.path = path; } },
  TFolder: class TFolder { constructor(path) { this.path = path; } },
  setIcon: function () {}
};

const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return stub;
  return realLoad.apply(this, arguments);
};

// Two homes, one script: in the development tree the plugin sits in ../plugin;
// installed in a vault, this folder is <plugin>/dev/tests and the plugin files
// are two levels up.
const PLUGIN_DIR = fs.existsSync(path.resolve(__dirname, "..", "plugin", "main.js"))
  ? path.resolve(__dirname, "..", "plugin")
  : path.resolve(__dirname, "..", "..");
const PLUGIN = path.join(PLUGIN_DIR, "main.js");
const plugin = require(PLUGIN);
const Core = plugin.__core;

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "fixtures", name), "utf8"));
}

/* -- a tiny test runner ------------------------------------------------- */
const results = [];
let current = null;

function group(name, fn) {
  current = { name: name, notes: [], failures: [] };
  results.push(current);
  const t0 = Date.now();
  try {
    fn();
  } catch (e) {
    current.failures.push(String((e && e.stack) || e));
  }
  current.ms = Date.now() - t0;
  current = null;
}

async function groupAsync(name, fn) {
  current = { name: name, notes: [], failures: [] };
  results.push(current);
  const t0 = Date.now();
  try {
    await fn();
  } catch (e) {
    current.failures.push(String((e && e.stack) || e));
  }
  current.ms = Date.now() - t0;
  current = null;
}

function note(msg) {
  if (current) current.notes.push(msg);
  else console.log("   " + msg);
}

function fail(msg) {
  if (current) current.failures.push(msg);
  else throw new Error(msg);
}

function check(cond, msg) {
  if (!cond) fail(msg);
}

function report() {
  let bad = 0;
  for (const r of results) {
    const ok = r.failures.length === 0;
    if (!ok) bad++;
    console.log((ok ? "  ok  " : "  FAIL") + "  " + r.name + "  (" + r.ms + " ms)");
    for (const n of r.notes) console.log("          " + n);
    for (const f of r.failures) console.log("          ! " + f);
  }
  console.log("");
  console.log(bad === 0 ? "All " + results.length + " groups passed." : bad + " of " + results.length + " groups FAILED.");
  return bad;
}

module.exports = { Core, plugin, PLUGIN, PLUGIN_DIR, fixture, group, groupAsync, note, check, fail, report };
