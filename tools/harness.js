#!/usr/bin/env node
// ---------------------------------------------------------------- harness.js
// The shared headless harness for the test tools.
//
// smoke, smoke-audio, soak and stress all need the same three things: a minimal
// DOM, a fixed-step clock, and a vm context with the real game scripts loaded
// into it. That preamble used to be copy-pasted into all four tools, so every
// stub fix had to be made four times and three of them were easy to forget.
// It lives here instead.
//
//     const { createHarness } = require("./harness.js");
//     const { ctx, document: documentStub, getEl } = createHarness({ files: FILES, root: ROOT });
//
// `onContext` is the hook for tool-specific stubs (smoke-audio adds a Web Audio
// API), and it runs *before* the game scripts are evaluated.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

// A 2D context that answers every call with a no-op and keeps assignments, so
// draw() can run for real without a canvas.
function makeCanvasCtx() {
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
  constructor() { super("canvas"); this.width = 1000; this.height = 700; this._ctx = makeCanvasCtx(); this._ctx.__canvas = this; }
  getContext() { return this._ctx; }
}

// Build a context with the named scripts from <root>/js loaded into it.
// Returns the pieces a tool may need to poke at: the context itself, the DOM
// stubs, and the localStorage backing store.
function createHarness(opts = {}) {
  const root = opts.root || path.join(__dirname, "..");
  const files = opts.files || [];
  const width = opts.width || 1000;
  const height = opts.height || 700;

  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, id === "canvas" ? new CanvasEl() : new El(id));
    return elements.get(id);
  };
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

  let clock = 0;
  const ctx = {
    console, Math, Date, JSON, Object, Array, String, Number, Boolean, Set, Map, Promise,
    Uint8Array, Uint8ClampedArray, Float32Array, Int32Array, isNaN, isFinite, parseInt, parseFloat,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    // A fixed-step clock instead of the wall clock: the game seeds its world
    // from performance.now(), so a real clock makes every run a different
    // colony and the scenario checks only occasionally reproducible.
    performance: { now: () => (clock += 16) },
    requestAnimationFrame: () => 0,
    localStorage, document: documentStub,
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.devicePixelRatio = 1; ctx.innerWidth = width; ctx.innerHeight = height;
  ctx.addEventListener = () => {};
  ctx.crypto = undefined; ctx.indexedDB = undefined; ctx.AudioContext = undefined;

  if (opts.onContext) opts.onContext(ctx);

  vm.createContext(ctx);
  for (const name of files) {
    const p = path.join(root, "js", name + ".js");
    try { vm.runInContext(fs.readFileSync(p, "utf8"), ctx, { filename: p }); }
    catch (e) { console.error("LOAD FAIL " + name + ": " + e.message); process.exit(1); }
  }

  return { ctx, document: documentStub, getEl, elements, storage: store, El, CanvasEl, localStorage };
}

module.exports = { createHarness, ClassList, El, CanvasEl, makeCanvasCtx };
