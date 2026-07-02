// ---- ColonyDB: persistent dwarf/skill database ------------------------------
// Real IndexedDB when available (a genuine client-side database), with a
// transparent localStorage-backed fallback so it still works from file://.
// All methods are async (return Promises). Game logic never awaits these —
// writes are fire-and-forget so async never blocks the simulation.

const DB_NAME = "DwarfFortressDB";
const DB_VERSION = 1;

class ColonyDB {
  constructor() {
    this.db = null;
    this.mode = "pending";     // "idb" | "ls" | "pending"
    this.ready = this._open();
  }

  _open() {
    return new Promise((resolve) => {
      let idb = null;
      try { idb = window.indexedDB; } catch (e) { idb = null; }
      if (!idb) { this._useFallback("no indexedDB"); return resolve(); }

      let req;
      try { req = idb.open(DB_NAME, DB_VERSION); }
      catch (e) { this._useFallback(e.message); return resolve(); }

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("dwarves"))
          db.createObjectStore("dwarves", { keyPath: "id" });
        if (!db.objectStoreNames.contains("events"))
          db.createObjectStore("events", { keyPath: "seq", autoIncrement: true });
      };
      req.onsuccess = (e) => { this.db = e.target.result; this.mode = "idb"; resolve(); };
      req.onerror = () => { this._useFallback("open error"); resolve(); };
      // Safari sometimes leaves file:// requests hanging — fall back after a beat.
      setTimeout(() => { if (this.mode === "pending") { this._useFallback("timeout"); resolve(); } }, 1500);
    });
  }

  _useFallback(reason) {
    if (this.mode !== "pending") return;
    this.mode = "ls";
    this._lsReason = reason;
    // hydrate in-memory maps from localStorage
    this._dwarves = new Map();
    this._events = [];
    try {
      const d = JSON.parse(localStorage.getItem("df_db_dwarves") || "[]");
      for (const r of d) this._dwarves.set(r.id, r);
      this._events = JSON.parse(localStorage.getItem("df_db_events") || "[]");
    } catch (e) { /* start empty */ }
  }

  _flushLS() {
    try {
      localStorage.setItem("df_db_dwarves", JSON.stringify([...this._dwarves.values()]));
      localStorage.setItem("df_db_events", JSON.stringify(this._events.slice(-500)));
    } catch (e) { /* storage full/blocked — ignore */ }
  }

  describe() {
    return this.mode === "idb" ? "IndexedDB"
      : this.mode === "ls" ? "localStorage (fallback)"
      : "initializing";
  }

  // ---- dwarves store ----
  async putDwarf(rec) {
    await this.ready;
    if (this.mode === "idb") {
      return new Promise((res) => {
        try {
          const tx = this.db.transaction("dwarves", "readwrite");
          tx.objectStore("dwarves").put(rec);
          tx.oncomplete = () => res(true);
          tx.onerror = () => res(false);
        } catch (e) { res(false); }
      });
    }
    this._dwarves.set(rec.id, rec); this._flushLS(); return true;
  }

  async getAllDwarves() {
    await this.ready;
    if (this.mode === "idb") {
      return new Promise((res) => {
        try {
          const tx = this.db.transaction("dwarves", "readonly");
          const rq = tx.objectStore("dwarves").getAll();
          rq.onsuccess = () => res(rq.result || []);
          rq.onerror = () => res([]);
        } catch (e) { res([]); }
      });
    }
    return [...this._dwarves.values()];
  }

  // ---- events store (colony chronicle) ----
  async logEvent(text, day) {
    await this.ready;
    const rec = { text, day, ts: Date.now() };
    if (this.mode === "idb") {
      return new Promise((res) => {
        try {
          const tx = this.db.transaction("events", "readwrite");
          tx.objectStore("events").add(rec);
          tx.oncomplete = () => res(true);
          tx.onerror = () => res(false);
        } catch (e) { res(false); }
      });
    }
    this._events.push(rec); this._flushLS(); return true;
  }

  async getEvents(limit = 40) {
    await this.ready;
    if (this.mode === "idb") {
      return new Promise((res) => {
        try {
          const tx = this.db.transaction("events", "readonly");
          const rq = tx.objectStore("events").getAll();
          rq.onsuccess = () => res((rq.result || []).slice(-limit).reverse());
          rq.onerror = () => res([]);
        } catch (e) { res([]); }
      });
    }
    return this._events.slice(-limit).reverse();
  }
}

// Single shared instance.
const colonyDB = new ColonyDB();

// Generate a stable unique id for a dwarf record.
function newDwarfId() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return "d-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
}
