// ---- SaveManager: persist games to localStorage -----------------------------

const SAVE_PREFIX = "df_save_";
const AUTOSAVE_NAME = "Autosave";
const SAVE_VERSION = 3;

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
    try {
      const data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) {
        // still attempt to load; version mismatch tolerated for now
      }
      return data;
    } catch (e) {
      return null;
    }
  },

  delete(name) { localStorage.removeItem(this.key(name)); },

  exists(name) { return localStorage.getItem(this.key(name)) !== null; },

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
