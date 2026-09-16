// ---- Diagnostics: crash capture, and a report a playtester can hand back ----
// A playtest is only as useful as what comes back from it. This keeps a small
// ring buffer of runtime errors and assembles a single plain-text report
// describing the run — build, colony facts, settings, performance, a save check
// and the recent log — so a bug report can carry evidence instead of a shrug.

const DIAG_MAX_ERRORS = 20;

const Diagnostics = {
  errors: [],
  installed: false,

  // Capture errors that would otherwise only ever reach the player's console.
  install() {
    if (this.installed) return;
    if (typeof window === "undefined" || !window.addEventListener) return;
    this.installed = true;
    window.addEventListener("error", (e) => {
      this.record(
        (e && e.message) || "script error",
        (e && e.filename) || "",
        (e && e.lineno) || 0,
        e && e.error && e.error.stack
      );
    });
    window.addEventListener("unhandledrejection", (e) => {
      const r = e && e.reason;
      this.record("unhandled rejection: " + ((r && r.message) || r || "?"), "", 0, r && r.stack);
    });
  },

  record(message, file, line, stack) {
    const g = (typeof window !== "undefined" && window.game) || null;
    this.errors.push({
      at: new Date().toISOString(),
      day: g ? Math.floor((g.time || 0) / DAY_LENGTH) + 1 : null,   // null = before any colony
      message: String(message == null ? "?" : message).slice(0, 300),
      where: file ? String(file).split("/").pop() + (line ? ":" + line : "") : "",
      stack: stack ? String(stack).split("\n").slice(0, 2).join(" | ").slice(0, 300) : "",
    });
    while (this.errors.length > DIAG_MAX_ERRORS) this.errors.shift();
  },

  clear() { this.errors.length = 0; },

  // The last lines the colony printed — usually the most human-useful part.
  recentLog(n = 18) {
    try {
      const el = document.getElementById("log");
      if (!el) return [];
      return String(el.textContent || "")
        .split("\n").map((s) => s.trim()).filter(Boolean).slice(-n);
    } catch (e) { return []; }
  },

  // Assemble the report. Takes the game rather than reaching for it, so it can
  // be called in tests with no live game at all.
  report(g, errs, logLines) {
    const L = [];
    const add = (k, v) => L.push(String(k).padEnd(14) + ": " + v);
    const ver = typeof RELEASE_VERSION !== "undefined" ? RELEASE_VERSION : "?";
    const build = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "?";

    L.push(`Elven Empire diagnostics — v${ver} (build ${build})`);
    L.push("");
    add("generated", new Date().toISOString());

    try {
      if (typeof navigator !== "undefined") add("browser", String(navigator.userAgent || "?").slice(0, 160));
    } catch (e) {}
    try {
      const c = document.getElementById("canvas");
      add("viewport", `${window.innerWidth}x${window.innerHeight}` +
        (c ? ` — canvas ${c.width}x${c.height}` : "") +
        (typeof devicePixelRatio !== "undefined" ? ` @${devicePixelRatio}x` : ""));
    } catch (e) {}

    if (g) {
      const mode = g.settings || {};
      const diff = (typeof difficultyById === "function" && mode.difficulty) ? difficultyById(mode.difficulty).name : (mode.difficulty || "?");
      const map = (typeof mapSizeById === "function" && mode.mapSize) ? mapSizeById(mode.mapSize).name : (mode.mapSize || "?");
      add("mode", `${diff} · ${map}`);
      add("colony", `day ${Math.floor((g.time || 0) / DAY_LENGTH) + 1}` +
        (g.season ? ` · ${g.season().name}` : "") +
        ` · ${g.weather || "?"} · ${g.dwarves.length} elves`);
      add("world", `${g.world.w}x${g.world.h}, seed ${g.world.seed}, z ${g.world.minZ}..0`);
      add("entities", `${g.enemies.length} hostiles · ${g.items.length} items`);
      if (g.lost) add("state", "COLONY LOST");
      const fps = g.frameMs ? Math.round(1000 / g.frameMs) : 0;
      add("perf", `frame ${g.frameMs ? g.frameMs.toFixed(1) : "?"} ms (~${fps} fps)` +
        ` · sim ${g.updateMs ? g.updateMs.toFixed(3) : "?"} ms/update`);
      try {
        const json = JSON.stringify(g.serialize());
        add("save check", `serialises OK, ${Math.round(json.length / 1024)} KB`);
      } catch (e) {
        add("save check", `FAILED to serialise — ${e.message || e}`);
      }
    } else {
      add("colony", "(no game in progress)");
    }

    const list = errs || this.errors;
    add("errors", list.length ? String(list.length) : "none");
    for (const e of list.slice(-8)) {
      L.push(`  [day ${e.day == null ? "?" : e.day}] ${e.message}${e.where ? "  @ " + e.where : ""}`);
      if (e.stack) L.push(`           ${e.stack}`);
    }

    const lines = logLines || this.recentLog();
    if (lines.length) {
      L.push("");
      L.push("Recent log:");
      for (const l of lines) L.push("  " + l);
    }
    L.push("");
    return L.join("\n");
  },

  // Writing one file is the reliable path: a page opened from file:// has no
  // clipboard permission, which is exactly how this game is usually played.
  deliver(text, filename) {
    let copied = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
        copied = true;                       // best effort; the file is the guarantee
      }
    } catch (e) {}
    let saved = false;
    try {
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      saved = true;
    } catch (e) {}
    return saved ? (copied ? "both" : "download") : (copied ? "clipboard" : "failed");
  },

  // One call for the UI: assemble, deliver, and describe what happened.
  send(g) {
    if (!g) return "no game";
    const text = this.report(g);
    const how = this.deliver(text, `ee-diagnostics-${typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : "x"}.txt`);
    if (how === "failed") return "Could not write the report — check your browser's downloads.";
    return how === "download"
      ? "Diagnostics written — attach the file to your playtest notes."
      : "Diagnostics copied and written — attach the file to your playtest notes.";
  },
};

if (typeof window !== "undefined" && window.addEventListener) Diagnostics.install();
