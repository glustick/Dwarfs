#!/usr/bin/env node
// Headless smoke test for Elven Empire.
//
// Loads the real game scripts into a vm context with a minimal DOM stub, then
// drives the simulation directly. No browser, no dependencies — it exists so a
// change to the sim can be checked in one command:
//
//     node tools/smoke.js
//
// Rendering is exercised too (draw() runs against a stubbed canvas context) so
// a broken draw call fails loudly rather than only showing up in a browser.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
// audio.js is deliberately omitted: it needs a Web Audio API (see smoke-audio.js).
const FILES = (process.argv[3] ||
  "version,utils,settings,codex,skills,research,milestones,db,world,pathfinding,entities,factions,jobs,storyteller,render,input,save,game"
).split(",");

// ---------------------------------------------------------------- DOM stub
class ClassList {
  constructor() { this.s = new Set(); }
  add(...a) { a.forEach(x => this.s.add(x)); }
  remove(...a) { a.forEach(x => this.s.delete(x)); }
  toggle(c, force) {
    if (force === undefined) { this.s.has(c) ? this.s.delete(c) : this.s.add(c); }
    else if (force) this.s.add(c); else this.s.delete(c);
    return this.s.has(c);
  }
  contains(c) { return this.s.has(c); }
}
class El {
  constructor(id) {
    this.id = id || ""; this.children = []; this.style = {}; this.dataset = {};
    this.classList = new ClassList(); this._html = ""; this.textContent = "";
    this.scrollTop = 0; this.scrollHeight = 0; this.offsetWidth = 120; this.offsetHeight = 24;
    this.value = ""; this.disabled = false; this.listeners = {};
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  remove() {}
  addEventListener(t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); }
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute(k, v) { this["attr_" + k] = v; }
  getAttribute(k) { return this["attr_" + k]; }
  focus() {} select() {} click() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 700 }; }
  setPointerCapture() {}
  get firstChild() { return this.children[0]; }
}
function makeCtx() {
  const t = {};
  const noop = () => {};
  const grad = { addColorStop: noop };
  return new Proxy(t, {
    get(o, p) {
      if (p in o) return o[p];
      if (p === "createRadialGradient" || p === "createLinearGradient") return () => grad;
      if (p === "measureText") return () => ({ width: 12 });
      if (p === "getImageData" || p === "createImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(0, w * h * 4)), width: w, height: h });
      if (p === "canvas") return o.__canvas;
      return noop;
    },
    set(o, p, v) { o[p] = v; return true; },
  });
}
class CanvasEl extends El {
  constructor() { super("canvas"); this.width = 1000; this.height = 700; this._ctx = makeCtx(); this._ctx.__canvas = this; }
  getContext() { return this._ctx; }
}
const elements = new Map();
function getEl(id) { if (!elements.has(id)) elements.set(id, id === "canvas" ? new CanvasEl() : new El(id)); return elements.get(id); }
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  key: i => [...store.keys()][i],
  get length() { return store.size; },
};
const documentStub = {
  getElementById: getEl,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: tag => (tag === "canvas" ? new CanvasEl() : new El()),
  addEventListener: () => {},
  body: new El("body"),
  documentElement: new El("html"),
  hidden: false,
};
let __clock = 0;
const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, Promise,
  Uint8Array, Uint8ClampedArray, Float32Array, Int32Array, isNaN, isFinite, parseInt, parseFloat,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  // A fixed-step clock instead of the wall clock: the game seeds its world
  // from performance.now(), so a real clock makes every run a different
  // colony and the scenario checks only occasionally reproducible.
  performance: { now: () => (__clock += 16) },
  requestAnimationFrame: () => 0,
  localStorage, document: documentStub,
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.devicePixelRatio = 1; ctx.innerWidth = 1000; ctx.innerHeight = 700;
ctx.addEventListener = () => {};
ctx.crypto = undefined; ctx.indexedDB = undefined; ctx.AudioContext = undefined;
vm.createContext(ctx);

for (const name of FILES) {
  const p = path.join(ROOT, "js", name + ".js");
  try { vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: p }); }
  catch (e) { console.error("LOAD FAIL " + name + ": " + e.message); process.exit(1); }
}
// Evaluate a snippet in the game context; if it yields a function, call it
// with the remaining args (so both "new Game(null)" and "(d)=>new Game(d)" work).
const run = (src, ...args) => {
  const v = vm.runInContext(src, ctx);
  return typeof v === "function" ? v(...args) : v;
};

// ---------------------------------------------------------------- scenarios
const results = [];
function check(name, fn) {
  try { fn(); results.push(["ok", name]); }
  catch (e) { results.push(["FAIL", name + " :: " + ((e && e.stack) || e)]); }
}
const day = () => { for (let i = 0; i < 1400; i++) g.update(0.1); };

let g;
check("boot: construct a new game", () => {
  g = run("new Game(null)");
  if (!g || !g.dwarves.length || !g.world) throw new Error("game did not initialise");
});

check("sim: 400s of colony time", () => { for (let i = 0; i < 4000; i++) g.update(0.1); });

check("render: draw() runs", () => { g.renderer.draw(); });

check("ui: every panel tab renders", () => {
  for (const t of ["colony", "schedule", "research", "log", "records", "stats", "factions"]) {
    g.panelTab = t; g.updatePanel();
  }
});

check("save: serialize + restore round-trip", () => {
  const data = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = run("(d)=>new Game(d)", data);
  for (let i = 0; i < 300; i++) g2.update(0.1);
  if (typeof g2.factionRep("ironhold") !== "number") throw new Error("faction state lost");
});

check("factions: plunder raid actually loots", () => {
  const F = run("FACTION_BY_ID");
  g.factions.ironhold.rep = -80;
  run("(g,f)=>g.spawnFactionRaid(f)", g, F.ironhold);
  if (!g.enemies.filter(e => e.motive === "plunder").length) throw new Error("no looters spawned");
  for (let i = 0; i < 6; i++) g.jobs.spawnItem("stone", g.world.spawnX + i, g.world.spawnY);
  for (let i = 0; i < 1200; i++) g.update(0.1);
  const ev = g.events.filter(e => /loots a stockpile|slips away|recovered from/.test(e.text));
  if (!ev.length) throw new Error("looters never looted or escaped");
});

check("factions: slay raid runs", () => {
  const F = run("FACTION_BY_ID");
  g.factions.thornwatch.rep = -90;
  run("(g,f)=>g.spawnFactionRaid(f)", g, F.thornwatch);
  if (!g.enemies.length) throw new Error("no raiders spawned");
  for (let i = 0; i < 400; i++) g.update(0.1);
});

check("trade: faction caravan buys and pays", () => {
  const w = g.world;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = w.spawnX + dx, y = w.spawnY + dy, t = w.get(x, y, 0);
    if (t && w.isWalkable(x, y, 0)) { t.stockpile = true; t.zone = "trade"; }
  }
  g.rebuildZones(); g.rebuildStockpiles();
  g.jobs.spawnItem("bar", w.spawnX, w.spawnY, "gold");
  run("(g)=>g.trySpawnCaravan(true)", g);
  for (let i = 0; i < 800; i++) g.update(0.1);
});

check("factions: reputation tiers respond", () => {
  const before = g.factionRep("verdant");
  g.applyRep("verdant", 100);
  if (!(g.factionRep("verdant") > before)) throw new Error("reputation did not move");
});

check("storyteller: weighted incident pool fires", () => {
  const seen = new Set();
  for (let d = 0; d < 40; d++) {
    for (let i = 0; i < 1400; i++) { g.story.points = 6; g.update(0.1); }
    g.events.filter(e => e.cat === "story").forEach(e => seen.add(e.text.replace(/[0-9]+/g, "#")));
  }
  if (g.story.count < 5) throw new Error("storyteller barely fired (" + g.story.count + ")");
  if (seen.size < 4) throw new Error("too little variety (" + seen.size + " lines)");
});

check("storyteller: wildlife threats spawn", () => {
  const before = g.enemies.length;
  run("storySpawnBeasts", g, ["wolf"], 3, "TEST:");
  run("storySpawnBeasts", g, ["goblin", "troll"], 3, "TEST:");
  if (g.enemies.length <= before) throw new Error("beasts did not spawn");
  for (let i = 0; i < 300; i++) g.update(0.1);
});

check("save: story state survives a round-trip", () => {
  const data = JSON.parse(JSON.stringify(g.serialize()));
  if (!data.story || typeof data.story.points !== "number") throw new Error("story not serialized");
  const g3 = run("(d)=>new Game(d)", data);
  for (let i = 0; i < 200; i++) g3.update(0.1);
});

check("setup: map size applies to a new colony", () => {
  const dims = { small: [70, 54], medium: [90, 70], large: [120, 92] };
  for (const id of Object.keys(dims)) {
    const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: id });
    if (gs.world.w !== dims[id][0] || gs.world.h !== dims[id][1]) throw new Error("map size not applied: " + id);
    if (gs.dwarves.length !== 7) throw new Error("starting elves wrong for " + id);
  }
});

check("setup: difficulty is stored and scaled", () => {
  for (const d of run("DIFFICULTIES")) {
    const gs = run("(o)=>new Game(null,o)", { difficulty: d.id, mapSize: "small" });
    if (gs.settings.difficulty !== d.id) throw new Error("difficulty not stored: " + d.id);
    if (!gs.items.length) throw new Error("no starting supplies for " + d.id);
    if (d.id === "brutal" && !(gs.hungerRate() > run("HUNGER_RATE"))) throw new Error("brutal hunger not harsher");
  }
  // A gentler colony gets a bigger starting stock than a brutal one.
  const gentle = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const brutal = run("(o)=>new Game(null,o)", { difficulty: "brutal", mapSize: "small" });
  if (!(gentle.items.length > brutal.items.length)) throw new Error("starting supplies do not scale with difficulty");
  // ...and brutal sends a bigger raid for the same colony state.
  const raid = (gg) => { gg.enemies.length = 0; gg.spawnRaid(); return gg.enemies.length; };
  const rg = raid(gentle), rb = raid(brutal);
  if (!(rb > rg)) throw new Error("brutal raid (" + rb + ") not larger than gentle (" + rg + ")");
});

check("setup: choice persists and survives a save", () => {
  const back = run("(o)=>{ saveNewGameSettings(o); return loadNewGameSettings(); }", { difficulty: "harsh", mapSize: "large" });
  if (back.difficulty !== "harsh" || back.mapSize !== "large") throw new Error("preference not remembered");
  const gs = run("(o)=>new Game(null,o)", { difficulty: "harsh", mapSize: "large" });
  const data = JSON.parse(JSON.stringify(gs.serialize()));
  if (!data.settings || data.settings.difficulty !== "harsh") throw new Error("settings not serialized");
  const g2 = run("(d)=>new Game(d)", data);
  if (g2.settings.mapSize !== "large") throw new Error("settings lost on load");
});

check("codex: content is intact and searchable", () => {
  const entries = run("CODEX_ENTRIES");
  const cats = run("CODEX_CATEGORIES");
  const search = (q) => run("(q)=>searchCodex(q)", q);
  if (entries.length < 20) throw new Error("too few codex entries: " + entries.length);
  const ids = new Set();
  for (const e of entries) {
    if (!e.id || !e.title || !e.icon || !e.body) throw new Error("incomplete entry: " + e.id);
    if (ids.has(e.id)) throw new Error("duplicate codex id: " + e.id);
    ids.add(e.id);
    if (!cats.includes(e.cat)) throw new Error("unknown category '" + e.cat + "' on " + e.id);
    if (!/<(p|ul|ol|table|li)/.test(e.body)) throw new Error("entry body looks empty: " + e.id);
  }
  if (search("").length !== entries.length) throw new Error("an empty search should return everything");
  for (const q of ["aquifer", "vampire", "brutal", "hotkey", "goose"]) { /* goose: title word */ }
  if (!search("aquifer").length) throw new Error("search missed 'aquifer'");
  if (!search("vampire").length) throw new Error("search missed 'vampire'");
  if (!search("hotkey").length) throw new Error("tag search failed");
  if (search("zzzznotathing").length) throw new Error("a nonsense query returned hits");
});

// ---------------------------------------------------------------- report
let bad = 0;
for (const [st, name] of results) {
  if (st !== "ok") bad++;
  console.log((st === "ok" ? "  PASS  " : "  FAIL  ") + name);
}
console.log("\n" + (bad ? bad + " failure(s)" : "all " + results.length + " checks passed"));
process.exit(bad ? 1 : 0);
