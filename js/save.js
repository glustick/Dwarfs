// ---- SaveManager: persist games to localStorage -----------------------------

const SAVE_PREFIX = "df_save_";
const AUTOSAVE_NAME = "Autosave";
const SAVE_VERSION = 6;

// ---- save migrations --------------------------------------------------------
// Each entry upgrades a save by exactly one version, and they run in order, so a
// v3 save is brought forward by running 3→4, 4→5 and 5→6.
//
// Every format change so far has been additive — new keys on objects, new fields
// appended to the tile tuple — and `Game.restore` defaults anything missing, so
// these steps are mostly a *record* of what changed rather than a transform. The
// framework exists so that the first genuinely breaking change has somewhere
// honest to live, instead of being papered over by "version mismatch tolerated".
const SAVE_MIGRATIONS = {
  5: (d) => {
    // v6 collects everything added since the format was last stamped: faction
    // reputation, the Storyteller's state, colony settings (difficulty/map),
    // grave markers, dig queues, hidden ore and per-elf shift preference. All of
    // them are optional and defaulted in restore(), so nothing is rewritten here.
    d.version = 6;
    return d;
  },
};

// Bring a parsed save up to the current version. Never throws: a save that cannot
// be read is reported, not crashed on.
function migrateSave(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, reason: "not a save file" };
  }
  // Saves written before the version was stamped behave as the format they were.
  const from = typeof data.version === "number" ? data.version : 5;
  if (from > SAVE_VERSION) {
    return { ok: false, reason: `made by a newer build (v${from})`, from };
  }
  let v = from;
  const applied = [];
  while (v < SAVE_VERSION) {
    const step = SAVE_MIGRATIONS[v];
    if (!step) return { ok: false, reason: `no migration route from v${v}`, from };
    data = step(data);
    applied.push(`v${v}->v${v + 1}`);
    v++;
  }
  if (typeof data.version !== "number") data.version = SAVE_VERSION;
  return { ok: true, data, from, applied };
}

const SaveManager = {
  key(name) { return SAVE_PREFIX + name; },

  // Serialize a live game and store it under `name`. Returns {ok, error}.
  save(name, game) {
    try {
      const data = game.serialize();
      data.name = name;
      const json = JSON.stringify(data);
      localStorage.setItem(this.key(name), json);
      return { ok: true, bytes: json.length };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  },

  load(name) {
    const raw = localStorage.getItem(this.key(name));
    if (!raw) return null;
    this.lastError = null;
    try {
      const parsed = JSON.parse(raw);
      const m = migrateSave(parsed);
      if (!m.ok) {
        // Previously this was silently tolerated, which meant a save from a
        // newer build could be loaded into a half-broken colony.
        this.lastError = m.reason;
        return null;
      }
      if (m.applied.length) m.data._migratedFrom = m.from;
      return m.data;
    } catch (e) {
      this.lastError = "the save file is corrupt";
      return null;
    }
  },

  // Exposed so the UI and the test harness can ask what a file actually is.
  inspect(name) {
    const raw = localStorage.getItem(this.key(name));
    if (!raw) return { ok: false, reason: "no such save" };
    try { return migrateSave(JSON.parse(raw)); }
    catch (e) { return { ok: false, reason: "the save file is corrupt" }; }
  },

  // Store already-parsed save data (e.g. from an imported file) as-is,
  // without needing a live Game instance to serialize — see App.importFromFile.
  saveRaw(name, data) {
    try {
      const m = migrateSave(data);
      if (!m.ok) return { ok: false, error: `cannot import: ${m.reason}` };
      const json = JSON.stringify({ ...m.data, name });
      localStorage.setItem(this.key(name), json);
      return { ok: true, bytes: json.length };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  },

  delete(name) { localStorage.removeItem(this.key(name)); },

  exists(name) { return localStorage.getItem(this.key(name)) !== null; },

  // An import shouldn't silently clobber an existing slot with the same name.
  uniqueName(base) {
    let name = base, n = 2;
    while (this.exists(name)) name = `${base} (${n++})`;
    return name;
  },

  // Return metadata for every save, most-recent first.
  list() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(SAVE_PREFIX)) continue;
      const name = k.slice(SAVE_PREFIX.length);
      let meta = { name, day: "?", pop: "?", savedAt: 0 };
      try {
        const d = JSON.parse(localStorage.getItem(k));
        meta.day = d.day; meta.pop = d.pop; meta.savedAt = d.savedAt || 0;
        meta.build = d.build || null;
        meta.auto = name === AUTOSAVE_NAME;
      } catch (e) { /* corrupt slot */ }
      out.push(meta);
    }
    out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return out;
  },

  hasAnySave() { return this.list().length > 0; },

  // Human friendly "time ago" for a timestamp (ms).
  timeAgo(ts) {
    if (!ts) return "unknown time";
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return m + " min ago";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    const d = Math.floor(h / 24);
    return d + "d ago";
  },
};
