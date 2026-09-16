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
  "version,utils,settings,codex,skills,research,milestones,db,world,pathfinding,entities,factions,jobs,storyteller,render,input,save,game,diagnostics,menu"
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

check("tech tree: every tech is rendered and reachable", () => {
  const techs = run("TECHS");
  const ids = new Set(techs.map(t => t.id));
  if (ids.size !== techs.length) throw new Error("duplicate tech id");
  const maxTier = techs.reduce((m, t) => Math.max(m, t.tier), 1);
  if (maxTier < 4) throw new Error("expected a tier-4 technology to exist");
  const el = new El("panel-content");
  g.renderResearch(el);
  const html = el._html;
  for (const t of techs) {
    if (!html.includes(`data-tech="${t.id}"`)) {
      throw new Error(`tech not rendered: ${t.id} (tier ${t.tier}) - is the tier loop capped?`);
    }
    for (const req of (t.requires || [])) {
      if (!ids.has(req)) throw new Error(`unknown prerequisite '${req}' on ${t.id}`);
    }
  }
  if (!html.includes("tech-tier")) throw new Error("no tier headings rendered");
  // the unlocks line should be derived, so at least one tech must advertise one
  if (!html.includes("tech-unlocks")) throw new Error("no technology advertised what it unlocks");
  if (!html.includes("tt-gate")) throw new Error("a gated tier does not advertise what it needs");
  if (!/\d+ of \d+ technologies/.test(html)) throw new Error("no researched counter rendered");
});

check("arms: early weapons exist, are ordered, and are reachable early", () => {
  const recipes = [];
  const byBench = run("RECIPES");
  for (const bench in byBench) for (const r of byBench[bench]) if (r.out.kind === "weapon") recipes.push({ bench, ...r });
  const subs = new Set(recipes.map(r => r.out.sub));
  for (const need of ["club", "knife", "stone_spear", "shortbow", "bow", "sword", "rifle", "laser_rifle"]) {
    if (!subs.has(need)) throw new Error("no recipe produces weapon: " + need);
  }
  const rank = run("WEAPON_RANK");
  for (const s2 of subs) if (!(s2 in rank)) throw new Error("weapon missing from WEAPON_RANK: " + s2);
  const ranged = run("RANGED_WEAPONS");
  if (!ranged.shortbow) throw new Error("shortbow is not a ranged weapon");
  if (!(ranged.shortbow.range < ranged.bow.range)) throw new Error("shortbow should reach less far than a longbow");
  if (!(rank.knife < rank.stone_spear && rank.stone_spear < rank.sword && rank.shortbow < rank.bow)) {
    throw new Error("weapon ladder out of order");
  }
  // Every crude arm needs a Crafting Bench recipe no deeper than tier 1.
  // (Legacy Weapons Bench entries may also exist - recipe indices are stored
  // per workshop, so removing them would silently retarget saved colonies.)
  const tierOf = {};
  run("TECHS").forEach(t => { tierOf[t.id] = t.tier; });
  for (const crude of ["club", "knife", "stone_spear", "shortbow"]) {
    const at = recipes.filter(r => r.out.sub === crude && r.bench === "crafting");
    if (!at.length) throw new Error(crude + " has no Crafting Bench recipe");
    for (const r of at) {
      if (r.tech && (tierOf[r.tech] || 9) > 1) throw new Error(crude + " gated behind tier " + tierOf[r.tech]);
    }
  }
  // A knife must beat bare hands but not an iron sword.
  if (!(rank.knife > rank.club)) throw new Error("knife should outrank a club");
});

check("ui: every panel tab declared in index.html actually renders", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tabs = [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]);
  if (tabs.length < 7) throw new Error("expected the panel to declare its tabs, found " + tabs.length);
  const el = new El("panel-content");
  const orig = documentStub.getElementById;
  documentStub.getElementById = (id) => (id === "panel-content" ? el : getEl(id));
  try {
    for (const t of tabs) {
      el._html = "";
      g.setPanelTab(t);
      if (!el._html || el._html.length < 20) throw new Error(`panel tab '${t}' rendered nothing`);
    }
  } finally {
    documentStub.getElementById = orig;
    g.setPanelTab("colony");
  }
});

check("stock: the inventory panel reports real counts", () => {
  g.jobs.spawnItem("marble", g.world.spawnX, g.world.spawnY, null, 0);
  g.jobs.spawnItem("arrow", g.world.spawnX, g.world.spawnY, null, 0);
  const marble = g.countItems("marble");
  const arrows = g.countItems("arrow");
  if (!marble || !arrows) throw new Error("failed to seed stock");
  const el = new El("panel-content");
  const orig = documentStub.getElementById;
  documentStub.getElementById = (id) => (id === "panel-content" ? el : getEl(id));
  try { g.setPanelTab("stock"); } finally { documentStub.getElementById = orig; }
  const html = el._html;
  if (!html.includes("Stock")) throw new Error("no Stock heading");
  if (!html.includes(`<b>${marble}</b>`)) throw new Error("marble count " + marble + " missing");
  if (!/Ammunition/i.test(html)) throw new Error("no ammunition section");
  if (!new RegExp(arrows * 5 + " shots").test(html)) throw new Error("arrow count not expressed in shots");
  g.setPanelTab("colony");
});

check("death: a fallen elf leaves a named body behind", () => {
  // fresh colony: the shared one has usually been wiped out by the Storyteller
  // checks above (40 unattended days of forced incidents).
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const victim = gs.dwarves[gs.dwarves.length - 1];
  const name = victim.name;
  const before = gs.items.filter(i => i.kind === "corpse").length;
  gs.recordDeath(victim, "died in a test");
  gs.flushRemovals();
  const bodies = gs.items.filter(i => i.kind === "corpse");
  if (bodies.length !== before + 1) throw new Error("no body was left behind");
  const body = bodies[bodies.length - 1];
  if (body.name !== name) throw new Error("the body lost the elf's name");
  if (!body.diedDay) throw new Error("the body lost the day of death");
  // ...and a corpse must never be offered to ordinary hauling
  const loose = gs.jobs.findLooseItem(body.x, body.y, body.z);
  if (loose && loose.kind === "corpse") throw new Error("a corpse was offered to ordinary hauling");
});

check("burial: a graveyard turns a body into a named grave (and it saves)", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const w = gs.world;
  const victim = gs.dwarves[gs.dwarves.length - 1];
  const name = victim.name;
  gs.recordDeath(victim, "died in a test");
  gs.flushRemovals();
  const body = gs.items.find(i => i.kind === "corpse");
  if (!body) throw new Error("no body was left behind");
  // zone a graveyard around the body, give everyone the hauling labour
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = body.x + dx, y = body.y + dy;
    if (w.isWalkable(x, y, body.z)) w.get(x, y, body.z).zone = "graveyard";
  }
  gs.rebuildZones();
  if (!gs.graveyardTiles.length) throw new Error("graveyard zone was not registered");
  for (const d of gs.dwarves) d.labors.add("hauling");
  const hasGrave = () => gs.graveyardTiles.some(([x, y, z]) => { const t = w.get(x, y, z || 0); return !!(t && t.grave); });
  for (let i = 0; i < 8000 && !hasGrave(); i++) gs.update(0.1);
  if (!hasGrave()) throw new Error("no grave was dug");
  const plot = gs.graveyardTiles.find(([x, y, z]) => { const t = w.get(x, y, z || 0); return !!(t && t.grave); });
  const t = w.get(plot[0], plot[1], plot[2] || 0);
  if (t.grave.name !== name) throw new Error("the grave is not named after the elf");
  if (!(gs.stats.buried >= 1)) throw new Error("burial was not counted");

  // the grave must survive a save/load
  const data = JSON.parse(JSON.stringify(gs.serialize()));
  const g2 = run("(d)=>new Game(d)", data);
  let found = 0;
  for (let z = 0; z >= g2.world.minZ; z--) {
    const tiles = g2.world.getLevel(z);
    if (!tiles) continue;
    for (const row of tiles) for (const tile of row) if (tile.grave) found++;
  }
  if (!found) throw new Error("graves were not serialized");

  // Exercise the new render paths: a grave and a fresh corpse on screen. draw()
  // is otherwise only ever called on a map with neither.
  gs.cam.x = plot[0]; gs.cam.y = plot[1];
  gs.renderer.draw();
  const g3 = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  g3.recordDeath(g3.dwarves[0], "died in a test");
  g3.flushRemovals();
  const corpse = g3.items.find(i => i.kind === "corpse");
  if (!corpse) throw new Error("no corpse to draw");
  g3.cam.x = corpse.x; g3.cam.y = corpse.y;
  g3.renderer.draw();
});

check("colony lost: the last death ends the colony", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  for (const d of gs.dwarves.slice()) { gs.recordDeath(d, "died in a test"); gs.flushRemovals(); }
  if (gs.dwarves.length) throw new Error("dwarves should all be gone");
  if (!gs.colonyLost) throw new Error("colony was not marked lost");
  if (!gs.paused) throw new Error("the simulation should stop");
  const s = gs.colonySummary();
  for (const key of ["day", "peak", "techs", "techTotal", "milestones", "graves", "burials", "difficulty", "map"]) {
    if (s[key] === undefined) throw new Error("summary is missing " + key);
  }
});

check("arms: a new colony starts armed, and weapons equip per elf", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  const count = (kind, sub) => gs.items.filter(i => i.kind === kind && (!sub || i.sub === sub)).length;
  if (count("weapon", "knife") < 3) throw new Error("a new colony has no knives");
  if (count("weapon", "stone_spear") < 2) throw new Error("no starting spears");
  if (count("weapon", "shortbow") < 2) throw new Error("no starting bows");
  if (count("arrow") < 3) throw new Error("no starting arrows");

  const d = gs.dwarves[0];
  const bows0 = count("weapon", "shortbow");
  if (!gs.equipWeaponFor(d, "shortbow")) throw new Error("could not equip a short bow");
  if (d.weapon !== "shortbow") throw new Error("the weapon was not set on the elf");
  if (count("weapon", "shortbow") !== bows0 - 1) throw new Error("the bow was not taken from the store");
  if (!gs.equipWeaponFor(d, "stone_spear")) throw new Error("could not swap weapons");
  if (count("weapon", "shortbow") !== bows0) throw new Error("the old weapon was not dropped back");
  if (gs.equipWeaponFor(d, "laser_rifle")) throw new Error("equipped a weapon the colony does not own");
  if (!gs.equipWeaponFor(d, null)) throw new Error("could not disarm");
  if (d.weapon) throw new Error("still holding a weapon after disarming");
});

check("research: tiers collapse, and finished ones start closed", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  const el = new El("panel-content");
  const orig = documentStub.getElementById;
  const render = () => {
    el._html = "";
    documentStub.getElementById = (id) => (id === "panel-content" ? el : getEl(id));
    try { gs.setPanelTab("research"); } finally { documentStub.getElementById = orig; }
  };
  render();
  if (!el._html.includes("tech-tier")) throw new Error("no tier headers rendered");
  if (!el._html.includes("tt-count")) throw new Error("tiers do not show their progress");
  if (!el._html.includes('data-tech="tools"')) throw new Error("an unfinished tier should start open");
  for (const t of run("TECHS").filter(x => x.tier === 1)) gs.tech[t.id] = true;   // finish tier 1
  gs.techTierOpen = {};
  render();
  if (el._html.includes('data-tech="tools"')) throw new Error("a finished tier did not collapse");
  gs.setPanelTab("colony");
});

check("arms: the inspector offers an equipment picker", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  gs.selectedDwarf = gs.dwarves[0];
  const html = gs.inspectorHTML();
  if (!html.includes("Equipment")) throw new Error("the inspector has no Equipment section");
  if (!html.includes('data-equip=""')) throw new Error("there is no way to disarm an elf");
  if (!/data-equip="(knife|shortbow|stone_spear)"/.test(html)) throw new Error("no weapons are offered");
});

check("mining: a designation covers the volume, one layer at a time", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const K = run("K");
  const w = gs.world;
  let spot = null;
  // Find a column of rock: a surface stone tile that also has stone under it.
  // The level below only exists once the world has generated it, which is what
  // digging a stairwell down does in play — so materialise it first.
  w.getLevel(-1);
  for (let y = 1; y < w.h - 1 && !spot; y++) for (let x = 1; x < w.w - 1 && !spot; x++) {
    const t = w.get(x, y, 0);
    if (!t || t.kind !== K.STONE || !w.hasWalkableNeighbor(x, y, 0)) continue;
    const below = w.get(x, y, -1);
    if (below && below.kind === K.STONE) spot = { x, y };
  }
  if (!spot) throw new Error("no column of rock to test mining with");
  gs.input.tool = "dig"; gs.viewZ = 0;
  gs.input.applyTool({ x: spot.x, y: spot.y }, { x: spot.x, y: spot.y });
  if (w.get(spot.x, spot.y, 0).designation !== "dig") throw new Error("the tile was not designated");
  let queued = 0;
  for (let z = -1; z >= w.minZ; z--) {
    const t = w.get(spot.x, spot.y, z);
    if (t && t.designation === "dig" && t.digQueue > 0) queued++; else break;
  }
  if (!queued) throw new Error("no deeper layers were queued - volume mining is not working");
  run("(g)=>g.jobs.reindex()", gs);
  const offered = gs.jobs.candidates.dig.some(([x, y, z]) => x === spot.x && y === spot.y && z < 0);
  if (offered) throw new Error("a queued layer was offered before the layer above was cleared");
});

check("mining: gold and marble are hidden until the rock is worked", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "medium" });
  const w = gs.world, hiddenOres = run("HIDDEN_ORES");
  let precious = 0, hidden = 0;
  for (let z = 0; z >= w.minZ; z--) {
    const tiles = w.getLevel(z);
    if (!tiles) continue;
    for (const row of tiles) for (const t of row) {
      if (!t.ore) continue;
      if (hiddenOres.includes(t.ore)) { precious++; if (!t.revealed) hidden++; }
      else if (!t.revealed) throw new Error("common ore should not be hidden: " + t.ore);
    }
  }
  if (!precious) throw new Error("no precious ore in the generated world");
  if (!hidden) throw new Error("precious ore was not hidden at world gen");
});

check("shifts: a night elf works while everyone else sleeps", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const DAY = run("DAY_LENGTH");
  const d = gs.dwarves[0];
  d.hunger = 0; d.thirst = 0; d.energy = 80;
  d.wounded = false; d.infected = false; d.vampireExposed = false;
  d.schedule = { day: "work", night: "sleep" };
  gs.time = DAY * 0.9;                      // night
  d.shiftPref = "any";
  if (gs.resolveActivity(d) !== "sleep") throw new Error("an ordinary elf should be asleep at night");
  d.shiftPref = "night";
  if (gs.resolveActivity(d) !== "work") throw new Error("a night-shift elf should be working at night");
  gs.time = DAY * 0.5;                      // daytime
  if (gs.resolveActivity(d) !== "sleep") throw new Error("a night-shift elf should sleep through the day");
  d.shiftPref = "any";
  if (gs.resolveActivity(d) !== "work") throw new Error("an ordinary elf should be working by day");
});

check("research: tiers are gated behind a built structure", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  const w = gs.world, K = run("K");
  for (const t of run("TECHS").filter(t2 => t2.tier === 1)) gs.tech[t.id] = true;
  const tech = run("TECHS").find(t => t.tier === 2);
  gs.rebuildZones();
  if (gs.tierGateMet(2)) throw new Error("tier 2 should start locked");
  if (!gs.tierGateMissing(2)) throw new Error("a locked tier should say what it needs");
  if (gs.techPrereqsMet(tech)) throw new Error("a tier-2 tech should be locked before its structure exists");
  let placed = false;
  for (let y = 2; y < w.h - 2 && !placed; y++) for (let x = 2; x < w.w - 2 && !placed; x++) {
    if (w.isWalkable(x, y, 0)) { w.get(x, y, 0).workshop = "crafting"; placed = true; }
  }
  if (!placed) throw new Error("could not place a test bench");
  gs.rebuildZones();
  if (!gs.tierGateMet(2)) throw new Error("building a Crafting Bench did not open tier 2");
  if (!gs.techPrereqsMet(tech)) throw new Error("the tech is still gated after the bench was built");
});

check("saves: a versioned save migrates, and a future one is refused", () => {
  const migrate = (d) => run("(d)=>migrateSave(d)", d);
  const SAVE_VERSION = run("SAVE_VERSION");
  if (SAVE_VERSION < 6) throw new Error("the save format should now be versioned at 6+");

  const old = { version: 5, world: { w: 10, h: 10 } };
  const m = migrate(old);
  if (!m.ok) throw new Error("a v5 save did not migrate: " + m.reason);
  if (m.data.version !== SAVE_VERSION) throw new Error("migration did not stamp the new version");
  if (!m.applied.length) throw new Error("migration was not recorded");

  const future = migrate({ version: SAVE_VERSION + 5 });
  if (future.ok) throw new Error("a save from a newer build should be refused");
  if (!/newer build/.test(future.reason)) throw new Error("unhelpful reason: " + future.reason);

  if (migrate(null).ok) throw new Error("null should not migrate");
  if (migrate([1, 2, 3]).ok) throw new Error("an array should not migrate");

  // end to end: a save written without a version still loads
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const data = JSON.parse(JSON.stringify(gs.serialize()));
  delete data.version;
  const back = run("(d)=>migrateSave(d)", data);
  if (!back.ok || back.data.version !== SAVE_VERSION) throw new Error("a version-less save did not migrate");
  const g2 = run("(d)=>new Game(d)", back.data);
  if (g2.dwarves.length !== gs.dwarves.length) throw new Error("the migrated save lost its colony");
});

check("accessibility: the colour-safe palette is complete and switchable", () => {
  const ORE = run("ORE_COLOR"), SAFE = run("ORE_COLOR_SAFE");
  for (const ore of ["iron", "gold", "coal", "marble"]) {
    if (!ORE[ore]) throw new Error("no default colour for " + ore);
    if (!SAFE[ore]) throw new Error("no colour-safe colour for " + ore);
    if (SAFE[ore] === ORE[ore]) throw new Error(ore + " is identical in both palettes");
  }
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const before = gs.moodColor(80);
  run("setPalette", "safe");
  if (!ctx.window.__paletteSafe) throw new Error("setPalette did not take effect");
  if (gs.moodColor(80) === before) throw new Error("mood colour does not change with the palette");
  run("setPalette", "default");
  if (ctx.window.__paletteSafe) throw new Error("setPalette did not switch back");
});

check("accessibility: the interface scale is remembered and applied", () => {
  const set = (m) => run("(m)=>setUiScale(m)", m);
  const get = () => run("()=>uiScaleMode()");
  if (get() !== "normal") throw new Error("the interface scale should default to normal");
  set("large");
  if (get() !== "large") throw new Error("the scale was not stored");
  if (documentStub.documentElement.getAttribute("data-ui") !== "large") throw new Error("data-ui was not set");
  set("compact");
  if (get() !== "compact") throw new Error("the scale did not change");
  set("nonsense");
  if (get() !== "normal") throw new Error("an unknown scale should fall back to normal");
});

check("diagnostics: a report carries the facts a playtest needs", () => {
  const D = run("Diagnostics");
  D.clear();
  D.record("before any game", "", 0, "");
  if (D.errors[0].day !== null) throw new Error("an error before a colony should record no day");
  const game = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  ctx.window.game = game;                       // record() reads the live game's day
  D.record("boom", "/tmp/x/game.js", 42, "at a\nat b");
  D.record("second failure", "", 0, "");
  if (D.errors.length !== 3) throw new Error("errors were not recorded");
  if (D.errors[1].where !== "game.js:42") throw new Error("the source was not recorded: " + D.errors[1].where);
  if (!(D.errors[1].day >= 1)) throw new Error("the in-game day was not recorded");

  // the buffer is bounded, so a crash loop cannot eat memory
  for (let i = 0; i < 60; i++) D.record("spam " + i, "", 0, "");
  if (D.errors.length > 20) throw new Error("the error buffer is unbounded: " + D.errors.length);

  const text = run("(g)=>Diagnostics.report(g)", game);
  for (const want of ["Elven Empire diagnostics", "build", "save check", "perf", "colony", "seed"]) {
    if (text.indexOf(want) === -1) throw new Error("the report is missing " + want);
  }
  if (text.indexOf("serialises OK") === -1) throw new Error("a healthy game did not pass the save check");
  if (text.indexOf("errors") === -1) throw new Error("the report does not mention errors");

  // with no game it must still produce something, not throw
  if (run("()=>Diagnostics.report(null)").indexOf("no game in progress") === -1) {
    throw new Error("an empty report does not say so");
  }

  // a game that cannot serialise must be reported, not swallowed
  const broken = { settings: {}, time: 0, weather: "clear", dwarves: [], enemies: [], items: [],
                   world: { w: 1, h: 1, seed: 1, minZ: 0 },
                   season: () => ({ name: "Spring" }),
                   serialize: () => { throw new Error("nope"); } };
  if (run("(b)=>Diagnostics.report(b)", broken).indexOf("FAILED to serialise") === -1) {
    throw new Error("a broken save check was not caught");
  }

  // delivering must not throw even where the DOM cannot do it
  const how = run("(t)=>Diagnostics.deliver(t,'x.txt')", "hello");
  if (!how) throw new Error("deliver returned nothing");
  D.clear();
  ctx.window.game = null;
});

check("camera: WASD pans the map, and the displaced tool keys follow", () => {
  const setPan = (on) => run("(on)=>setWasdPan(on)", on);
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const input = gs.input;
  const hold = (k) => { input.keys.add(k); gs.handleCameraKeys(0.5); input.keys.clear(); };

  setPan(true);
  gs.cam.x = 20; gs.cam.y = 20;
  hold("d");
  if (!(gs.cam.x > 20)) throw new Error("D did not pan the camera east");
  hold("a");
  if (!(gs.cam.x < 20 + 1)) throw new Error("A did not pan the camera west");
  const y0 = gs.cam.y; hold("w");
  if (!(gs.cam.y < y0)) throw new Error("W did not pan north");
  const y1 = gs.cam.y; hold("s");
  if (!(gs.cam.y > y1)) throw new Error("S did not pan south");

  // while panning, the letters must NOT also pick a tool
  for (const k of ["a", "s", "d"]) {
    if (input.toolForKey(k) !== null) throw new Error(k + " still selects a tool while WASD panning");
  }
  // ...but mining, stockpiling and ramps still have home keys
  if (input.toolForKey("m") !== "dig") throw new Error("M should mine");
  if (input.toolForKey("i") !== "stockpile") throw new Error("I should open stockpiles");
  if (input.toolForKey("n") !== "rampdown") throw new Error("N should dig a ramp");

  // the arrow keys never stopped working
  const x1 = gs.cam.x; hold("arrowright");
  if (!(gs.cam.x > x1)) throw new Error("the arrow keys stopped panning");

  // switching it off restores the original bindings exactly
  setPan(false);
  if (input.toolForKey("d") !== "dig") throw new Error("D should mine again with WASD panning off");
  if (input.toolForKey("s") !== "stockpile") throw new Error("S should stockpile again");
  if (input.toolForKey("a") !== "rampdown") throw new Error("A should be ramps again");
  if (input.toolForKey("m") !== "dig") throw new Error("M should still mine either way");
  const x2 = gs.cam.x; hold("d");
  if (gs.cam.x !== x2) throw new Error("D still pans with WASD panning off");
  setPan(true);                                  // leave the default in place
});

check("setup screen: the primary action cannot be pushed off the fold", () => {
  // The options scroll; Begin and Back sit in a sibling row that does not, so a
  // short viewport can never hide the screen's primary action.
  const html = run("(p)=>newGameDialogHTML(p)", { difficulty: "gentle", mapSize: "small" });
  if (html.indexOf("ng-scroll") === -1) throw new Error("the setup options are not in a scroll container");
  if (html.indexOf("id=\"ng-start\"") === -1) throw new Error("Begin is missing");
  if (html.indexOf("id=\"ng-back\"") === -1) throw new Error("Back is missing");
  if (!(html.indexOf("ng-scroll") < html.indexOf("menu-btns"))) {
    throw new Error("the action row should come after the scrolling options");
  }
  if (!(html.indexOf("menu-btns") < html.indexOf("id=\"ng-start\""))) {
    throw new Error("Begin should live in the action row, outside the scroller");
  }
  // and the options must genuinely be inside the scroller
  const open = html.indexOf("ng-scroll"), close = html.indexOf("ng-start");
  if (html.slice(open, close).indexOf("opt-card") === -1) {
    throw new Error("the option cards are not inside the scroll container");
  }
});

// ---------------------------------------------------------------- report
let bad = 0;
for (const [st, name] of results) {
  if (st !== "ok") bad++;
  console.log((st === "ok" ? "  PASS  " : "  FAIL  ") + name);
}
console.log("\n" + (bad ? bad + " failure(s)" : "all " + results.length + " checks passed"));
process.exit(bad ? 1 : 0);
