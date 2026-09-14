#!/usr/bin/env node
// Audio smoke test for Elven Empire.
//
// Loads the real game plus js/audio.js against a stubbed Web Audio API, drives
// the generative score across every state it reacts to, and checks that every
// event in the game log maps to the intended sound effect.
//
//     node tools/smoke-audio.js
//
// It cannot judge how anything *sounds* — only that the graph builds, no call
// throws, ambience levels track the weather, and the log wiring is correct.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const FILES = "version,utils,settings,skills,research,milestones,db,world,pathfinding,entities,factions,jobs,storyteller,render,input,save,game,audio".split(",");

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

// ------------------------------------------------------- Web Audio API stub
class Param {
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.value = v; return this; }
  setTargetAtTime(v) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
let nodeCount = 0;
class NodeStub {
  constructor(c, type) { this.ctx = c; this.nodeType = type; this._out = []; nodeCount++; }
  connect(n) { this._out.push(n); return n; }
  disconnect() {}
}
class GainStub extends NodeStub { constructor(c) { super(c, "gain"); c.gains++; this.gain = new Param(1); } }
class OscStub extends NodeStub {
  constructor(c) { super(c, "osc"); c.oscs++; this.type = "sine"; this.frequency = new Param(440); this.detune = new Param(0); }
  start() {} stop() {}
}
class FilterStub extends NodeStub { constructor(c) { super(c, "filter"); c.filters++; this.type = "lowpass"; this.frequency = new Param(350); this.Q = new Param(1); } }
class BufSrcStub extends NodeStub { constructor(c) { super(c, "bufsrc"); c.bufsrcs++; this.buffer = null; this.loop = false; } start() {} stop() {} }
class ConvStub extends NodeStub { constructor(c) { super(c, "conv"); c.convs++; this.buffer = null; } }
class PannerStub extends NodeStub { constructor(c) { super(c, "panner"); this.pan = new Param(0); } }
class CompStub extends NodeStub {
  constructor(c) {
    super(c, "comp"); c.comps++;
    this.threshold = new Param(-24); this.knee = new Param(30); this.ratio = new Param(12);
    this.attack = new Param(0.003); this.release = new Param(0.25);
  }
}
class AudioContextStub {
  constructor() {
    this.state = "running"; this.sampleRate = 48000; this._t = 0;
    this.gains = 0; this.oscs = 0; this.filters = 0; this.bufsrcs = 0; this.convs = 0; this.comps = 0;
    this.destination = new NodeStub(this, "dest");
  }
  get currentTime() { this._t += 0.002; return this._t; }
  resume() { this.state = "running"; return Promise.resolve(); }
  createGain() { return new GainStub(this); }
  createOscillator() { return new OscStub(this); }
  createBiquadFilter() { return new FilterStub(this); }
  createBufferSource() { return new BufSrcStub(this); }
  createConvolver() { return new ConvStub(this); }
  createStereoPanner() { return new PannerStub(this); }
  createDynamicsCompressor() { return new CompStub(this); }
  createBuffer(ch, len, rate) {
    const chans = [...Array(ch)].map(() => new Float32Array(len));
    return { numberOfChannels: ch, length: len, sampleRate: rate, duration: len / rate, getChannelData: i => chans[i] };
  }
}

let __clock = 0;
const ctx = {
  console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, Promise,
  Float32Array, Uint8Array, Uint8ClampedArray, Int32Array, isNaN, isFinite, parseInt, parseFloat,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  // A fixed-step clock instead of the wall clock: the game seeds its world
  // from performance.now(), so a real clock makes every run a different
  // colony and the scenario checks only occasionally reproducible.
  performance: { now: () => (__clock += 16) },
  requestAnimationFrame: () => 0,
  localStorage, document: documentStub,
  AudioContext: AudioContextStub,
};
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.devicePixelRatio = 1; ctx.innerWidth = 1000; ctx.innerHeight = 700;
ctx.addEventListener = () => {};
ctx.crypto = undefined; ctx.indexedDB = undefined; ctx.webkitAudioContext = undefined;
vm.createContext(ctx);
for (const name of FILES) {
  const p = path.join(ROOT, "js", name + ".js");
  vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: p });
}

// ---------------------------------------------------------------- scenarios
const results = [];
function check(name, fn) {
  try { fn(); results.push(["ok", name]); }
  catch (e) { results.push(["FAIL", name + " :: " + ((e && e.stack) || e)]); }
}
let snd;
check("boot: SoundManager builds its graph", () => {
  snd = ctx.window.sound;
  if (!snd) throw new Error("window.sound missing");
  snd.enabled = true; snd._ensure();
  if (!snd.ctx) throw new Error("no audio context");
  if (!snd.limiter) throw new Error("no master limiter");
  if (!snd.ambienceGain || !snd.ambience) throw new Error("no ambience bed");
});

const game = {
  weather: "clear", viewZ: 0, enemies: [], caravans: [],
  _day: 0.5, _season: 0, _hap: 55,
  dayFraction() { return this._day; },
  seasonIndex() { return this._season; },
  avgHappiness() { return this._hap; },
};
ctx.window.game = game;

check("score: 4 seasons x day/night x 6 weathers x combat x festive", () => {
  const before = nodeCount;
  for (let season = 0; season < 4; season++) {
    game._season = season;
    for (const d of [0.5, 0.9]) {
      game._day = d;
      for (const w of ["clear", "rain", "storm", "fog", "heatwave", "blizzard"]) {
        game.weather = w;
        snd._ambienceStep(snd.ctx.currentTime, 1);
        for (let i = 0; i < 40; i++) snd._musicStep();
      }
      game.enemies = [{ kind: "wolf" }]; for (let i = 0; i < 40; i++) snd._musicStep(); game.enemies = [];
      game.caravans = [{ state: "trading" }]; for (let i = 0; i < 40; i++) snd._musicStep(); game.caravans = [];
    }
  }
  if (nodeCount - before < 500) throw new Error("suspiciously few nodes created");
});

check("ambience: level tracks the weather", () => {
  const g = snd.ambienceGain.gain;
  game.weather = "clear"; snd._ambienceStep(1, 1); const clear = g.value;
  game.weather = "storm"; snd._ambienceStep(2, 1);
  if (!(g.value > clear)) throw new Error("storm not louder than clear");
  game.weather = "rain"; snd._ambienceStep(3, 1);
  if (!(g.value > clear)) throw new Error("rain not louder than clear");
});

check("sfx: every named effect fires", () => {
  const names = ["click", "mine", "chop", "gather", "build", "craft", "craftSmelter", "craftWell",
    "craftBrewery", "levelup", "tech", "migrant", "combat", "bow", "gun", "laser", "enemyDown",
    "raid", "death", "eat", "drink", "door", "digStairs", "ramp", "drain", "plant", "harvest",
    "tame", "heal", "bite", "vampire", "caveIn", "flood", "thunder", "milestone", "undo", "zone",
    "autosave", "load", "equip", "coin"];
  for (const n of names) {
    snd._last = {}; snd.play(n, 0);
    if (!(n in snd._last)) throw new Error("SFX did not fire: " + n);
  }
});

check("wiring: each log event maps to its effect", () => {
  const cases = [
    ["labor", "", "Caelynn mined out stone and struck iron!", "mine"],
    ["labor", "", "Faelar felled a tree (2 logs).", "chop"],
    ["labor", "", "Nuvia carved a stairwell down.", "digStairs"],
    ["labor", "", "Orophin carved a ramp down.", "ramp"],
    ["labor", "", "Galinn drained a flooded chamber.", "drain"],
    ["labor", "", "Ithil struck an aquifer — the chamber floods!", "flood"],
    ["labor", "", "Saelwin harvested 4 food from the farm.", "harvest"],
    ["labor", "", "Aerin planted a sapling.", "plant"],
    ["labor", "", "Melian treated Elenwe's wounds.", "heal"],
    ["build", "good", "Vanya built a stone bed.", "build"],
    ["craft", "", "Thalind crafted Iron bar at the Smelter.", "craftSmelter"],
    ["craft", "", "Rumil crafted Iron sword at the Forge.", "craft"],
    ["skill", "good", "Researched Metallurgy.", "tech"],
    ["skill", "good", "Elenwe is now Proficient Miner.", "levelup"],
    ["combat", "bad", "An outbreak! 3 Shamblers shamble in from the wilds!", "raid"],
    ["combat", "bad", "Aeris was bitten!", "bite"],
    ["combat", "bad", "A checkup uncovers the horrifying truth — a vampire!", "vampire"],
    ["combat", "good", "Galinn slew a Brute!", "enemyDown"],
    ["combat", "", "Faelar equips a sword.", "equip"],
    ["colony", "good", "2 migrants have arrived seeking work.", "migrant"],
    ["colony", "", "The weather turns to storm.", "thunder"],
    ["colony", "good", "🏆 Milestone: First Blood — survive.", "milestone"],
    ["colony", "bad", "💥 A cave-in collapses an unsupported chamber on B1!", "caveIn"],
    ["colony", "good", "Saelwin tamed a wild fox!", "tame"],
    ["colony", "good", "Saelwin has fought off the infection!", "heal"],
    ["colony", "bad", "Aerin has been slain by a Shambler.", "death"],
    ["faction", "good", "A Verdant Concord caravan approaches the depot!", "migrant"],
    ["faction", "good", "Traded 3 goods with the Verdant Concord for 4 food.", "coin"],
    ["faction", "bad", "The Thornwatch raid the colony — 4 warriors!", "raid"],
    ["story", "good", "🌾 Favourable weather ripens 5 crops overnight.", "migrant"],
    ["story", "bad", "🦠 A blight withers 3 crops.", "bite"],
    ["order", "", "Undid the last map action.", "undo"],
    ["order", "", "Mine marked: 5 tiles.", "zone"],
    ["order", "", "Door locked.", "door"],
    ["system", "", "Autosaved.", "autosave"],
    ["system", "", "Loaded save “X”.", "load"],
    ["system", "", "Paused.", "click"],
  ];
  const wrong = [];
  for (const [cat, cls, msg, want] of cases) {
    snd._last = {}; snd.onLog(cat, cls, msg);
    if (!(want in snd._last)) wrong.push(cat + "/" + want + " <- " + msg);
  }
  if (wrong.length) throw new Error("bad mappings:\n    " + wrong.join("\n    "));
});

check("controls: mute toggle + volume", () => {
  snd.toggle(); if (snd.enabled) throw new Error("toggle off failed");
  snd.toggle(); if (!snd.enabled) throw new Error("toggle on failed");
  snd.setMusicVolume(0.5); snd.setSfxVolume(0.25);
  if (snd.musicVol !== 0.5 || snd.sfxVol !== 0.25) throw new Error("volumes not stored");
  snd.startMusic(); snd.stopMusic();
});

let bad = 0;
for (const [st, name] of results) {
  if (st !== "ok") bad++;
  console.log((st === "ok" ? "  PASS  " : "  FAIL  ") + name);
}
console.log("\n" + (bad ? bad + " failure(s)" : "all " + results.length + " checks passed"));
process.exit(bad ? 1 : 0);
