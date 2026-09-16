#!/usr/bin/env node
// Headless stress test for Elven Empire.
//
// Boots a large colony and times the simulation so performance claims stop
// being guesses:
//
//     node tools/stress.js                 # 40 elves, Deep Forest, 4x speed
//     node tools/stress.js 60 large        # population + map size
//
// Reports average cost per simulated update and the headroom against a 60fps
// frame budget. It measures the *simulation* only — rendering runs on the GPU
// and is not included.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const POP = parseInt(process.argv[2] || "40", 10);
const MAP = process.argv[3] || "large";
const FILES = "version,utils,settings,codex,skills,research,milestones,db,world,pathfinding,entities,factions,jobs,storyteller,render,input,save,game,diagnostics".split(",");

// ---- minimal DOM (same stub as smoke.js) ----
class ClassList {
  constructor() { this.s = new Set(); }
  add(...a) { a.forEach(x => this.s.add(x)); }
  remove(...a) { a.forEach(x => this.s.delete(x)); }
  toggle(c, f) { if (f === undefined) { this.s.has(c) ? this.s.delete(c) : this.s.add(c); } else if (f) this.s.add(c); else this.s.delete(c); return this.s.has(c); }
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
  const t = {}; const noop = () => {}; const grad = { addColorStop: noop };
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
const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: i => [...store.keys()][i], get length() { return store.size; } };
const documentStub = {
  getElementById: getEl, querySelector: () => null, querySelectorAll: () => [],
  createElement: t => (t === "canvas" ? new CanvasEl() : new El()),
  addEventListener: () => {}, body: new El("body"), documentElement: new El("html"), hidden: false,
};
let __clock = 0;
const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, Promise,
  Uint8Array, Uint8ClampedArray, Float32Array, Int32Array, isNaN, isFinite, parseInt, parseFloat,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  performance: { now: () => (__clock += 16) },
  requestAnimationFrame: () => 0, localStorage, document: documentStub,
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.devicePixelRatio = 1; ctx.innerWidth = 1000; ctx.innerHeight = 700;
ctx.addEventListener = () => {}; ctx.crypto = undefined; ctx.indexedDB = undefined; ctx.AudioContext = undefined;
vm.createContext(ctx);
for (const name of FILES) {
  const p = path.join(ROOT, "js", name + ".js");
  try { vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: p }); }
  catch (e) { console.error("LOAD FAIL " + name + ": " + e.message); process.exit(1); }
}
const run = (src, ...args) => { const v = vm.runInContext(src, ctx); return typeof v === "function" ? v(...args) : v; };

// PROFILE=1 wraps every Game/JobManager/Renderer method with a timer and prints
// the worst offenders. Crude, but it turns "the sim feels slow" into a list.
const prof = {};
const PROFILE = !!process.env.PROFILE;
if (PROFILE) {
  const instrument = (proto, label) => {
    if (!proto) return;
    for (const k of Object.getOwnPropertyNames(proto)) {
      const d = Object.getOwnPropertyDescriptor(proto, k);
      if (!d || typeof d.value !== "function" || k === "constructor") continue;
      const orig = d.value;
      proto[k] = function (...a) {
        const t0 = process.hrtime.bigint();
        try { return orig.apply(this, a); }
        finally {
          const e = prof[label + "." + k] || (prof[label + "." + k] = { ms: 0, calls: 0 });
          e.ms += Number(process.hrtime.bigint() - t0) / 1e6;
          e.calls++;
        }
      };
    }
  };
  for (const cls of ["Game", "JobManager", "Renderer"]) {
    try { instrument(vm.runInContext(cls + ".prototype", ctx), cls); } catch (e) { /* class absent */ }
  }
}

if (process.env.SKIP_FOOD) ctx.__skipFood = true;   // reproduce a starving colony
const g = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: MAP });
console.log(`map: ${g.world.w}x${g.world.h} (${MAP}) | difficulty: ${g.settings.difficulty}`);

// Spawn straight to the target population. Migration is far too slow to build a
// stress case, and an unattended colony is lethal to itself — it starves, and
// the outbreak finishes the job — so the population is topped back up during the
// run. Otherwise the numbers measure a near-empty map, not a busy one.
const TOPUP_SRC = `(g0, target) => {
  const w = g0.world, rng = w.rng;
  let guard = 0;
  while (g0.dwarves.length < target && guard++ < 4000) {
    const x = clamp(w.spawnX + randint(rng, -12, 12), 0, w.w - 1);
    const y = clamp(w.spawnY + randint(rng, -12, 12), 0, w.h - 1);
    if (!w.isWalkable(x, y, 0)) continue;
    const d = new Dwarf(dwarfName(rng), x, y, DWARF_COLORS[g0.dwarves.length % DWARF_COLORS.length], rollStartingSkills(rng));
    d.traits = rollTraits(rng);
    g0.dwarves.push(d);
  }
  // Also keep them fed and watered: a colony of starving elves fails every job
  // search and thrashes pathfinding, which measures a pathological case rather
  // than a busy one.
  let food = 0, water = 0;
  for (const it of g0.items) { if (it.kind === "food") food++; if (it.kind === "water") water++; }
  if (!globalThis.__skipFood) {
    for (let i = food; i < 120; i++) g0.jobs.spawnItem("food", w.spawnX + randint(rng, -6, 6), w.spawnY + randint(rng, -6, 6), null, 0);
    for (let i = water; i < 120; i++) g0.jobs.spawnItem("water", w.spawnX + randint(rng, -6, 6), w.spawnY + randint(rng, -6, 6), null, 0);
  }
  return g0.dwarves.length;
}`;
const topUp = (target) => run(TOPUP_SRC, g, target);
topUp(POP);
console.log(`population: ${g.dwarves.length} elves`);

const DT = 0.05;               // one 4x-speed simulation step
const TICKS = parseInt(process.env.TICKS || "6000", 10);   // sim steps to measure
for (let i = 0; i < 200; i++) g.update(DT);   // warm up

// Slice the measured window so the *shape* of the cost is visible: a constant
// per-elf cost and a cost that grows with the length of a run look identical in
// a single average, and only one of them is a bug.
const SLICE = Math.max(200, Math.floor(TICKS / 10));
const slices = [];
let popSum = 0, samples = 0;
const t0 = process.hrtime.bigint();
let sliceStart = t0, sliceTicks = 0;
for (let i = 0; i < TICKS; i++) {
  g.update(DT);
  if (i % 250 === 249) topUp(POP);
  if (i % 50 === 0) { popSum += g.dwarves.length; samples++; }
  sliceTicks++;
  if (sliceTicks === SLICE || i === TICKS - 1) {
    const now = process.hrtime.bigint();
    slices.push({
      ticks: sliceTicks,
      ms: Number(now - sliceStart) / 1e6,
      items: g.items.length, dwarves: g.dwarves.length, enemies: g.enemies.length,
      paths: g.dwarves.filter(d => d.path).length,
    });
    sliceStart = now; sliceTicks = 0;
  }
}
const t1 = process.hrtime.bigint();
const avgPop = samples ? popSum / samples : g.dwarves.length;

const msTotal = Number(t1 - t0) / 1e6;
const msPerTick = msTotal / TICKS;
const budget = 16.67;
console.log(`\nsim: ${TICKS} updates (${(TICKS * DT).toFixed(0)}s game time) in ${msTotal.toFixed(0)} ms`);
console.log(`     ${msPerTick.toFixed(3)} ms/update  ->  ${(1000 / msPerTick).toFixed(0)} updates/sec`);
console.log(`     ${((msPerTick / budget) * 100).toFixed(1)}% of a 60fps frame budget (sim only)`);
if (PROFILE) {
  const rows = Object.entries(prof).sort((a, b) => b[1].ms - a[1].ms).slice(0, 14);
  console.log("\nhottest methods (total ms across the measured window):");
  console.log("        total   share       calls     ms/call  method");
  for (const [k, v] of rows) {
    console.log(`     ${v.ms.toFixed(0).padStart(8)} ms ${((v.ms / msTotal) * 100).toFixed(1).padStart(5)}% ${String(v.calls).padStart(11)} ${(v.ms / v.calls).toFixed(4).padStart(11)}  ${k}`);
  }
  console.log("     (total ms < the run time means the cost is in the harness's own loop, not in these methods)");
}

console.log("\nper-slice cost (ms/update), with load at the end of each slice:");
for (const sl of slices) {
  const per = sl.ms / sl.ticks;
  const bar = "#".repeat(Math.min(50, Math.round(per * 4)));
  console.log(`     ${per.toFixed(3).padStart(8)} ms/up  items ${String(sl.items).padStart(4)}  elves ${String(sl.dwarves).padStart(3)}  pathing ${String(sl.paths).padStart(3)}  ${bar}`);
}

console.log(`\nload: ${avgPop.toFixed(1)} elves averaged over the run (target ${POP})`);
console.log(`state: day ${Math.floor(g.time / 120) + 1}, ${g.items.length} items, ${g.enemies.length} enemies`);
