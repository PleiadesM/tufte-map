"use strict";
// Probe F: hostile data.json through loadState().
const { plugin } = require("../tests/harness.js");
const Plugin = plugin;

function mk(data) {
  const p = Object.create(Plugin.prototype);
  p.loadData = () => Promise.resolve(data);
  p.saveData = () => Promise.resolve();
  return p;
}

const cases = {
  "null": null,
  "array": [1, 2, 3],
  "string": "nope",
  "proto own key": JSON.parse('{"settings":{"__proto__":{"pwned":1}}}'),
  "proto own key on root": JSON.parse('{"__proto__":{"pwned2":1},"settings":{}}'),
  "constructor key": JSON.parse('{"settings":{"constructor":{"prototype":{"pwned3":1}}}}'),
  "wrong types": { settings: { excludeFolders: 42, openIn: { x: 1 }, namedNotes: "1e9", showAllLinks: "yes" } },
  "nan-ish": { settings: { namedNotes: null }, cache: { hash: 1, frameW: "abc", positions: "nope" } },
  "positions array": { cache: { hash: "x", frameW: 1.7, positions: [[1, 2]] } },
  "excludeFolders object": { settings: { excludeFolders: { toString() { throw new Error("boom"); } } } }
};

(async () => {
  for (const [name, data] of Object.entries(cases)) {
    const p = mk(data);
    let out;
    try {
      await p.loadState();
      out = "settings=" + JSON.stringify(p.settings) +
        " protoOfSettings=" + (Object.getPrototypeOf(p.settings) === Object.prototype ? "Object.prototype" : "CHANGED") +
        " cache=" + JSON.stringify({ hash: p.cache.hash, frameW: p.cache.frameW, nPos: Object.keys(p.cache.positions).length });
      try {
        out += " excludes=" + JSON.stringify(plugin.__view.parseExcludes(p.settings.excludeFolders));
      } catch (e) { out += " parseExcludes THREW: " + e.message; }
    } catch (e) { out = "THREW: " + e.message; }
    console.log(("  " + name).padEnd(26), out);
  }
  console.log("Object.prototype.pwned =", Object.prototype.pwned,
    " pwned2 =", Object.prototype.pwned2, " pwned3 =", Object.prototype.pwned3);
})();
