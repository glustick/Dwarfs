// ---- Input: tools, mouse designation, camera --------------------------------

// Which toolbar category owns each tool (for fly-out highlighting).
const TOOL_CAT = {
  dig: "designate", chop: "designate", gather: "designate",
  build: "build", floor: "build", bed: "build", smelter: "build", forge: "build",
  stockpile: "zone", bedroom: "zone", dining: "zone",
};

class Input {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.tool = "select";
    this.dragStart = null;   // tile {x,y}
    this.dragCur = null;
    this.panning = false;
    this.panLast = null;
    this.keys = new Set();
    this.bind();
  }

  setTool(tool) {
    this.tool = tool;
    document.querySelectorAll(".tool").forEach(b =>
      b.classList.toggle("active", b.dataset.tool === tool));
    // highlight the category that owns this tool
    const cat = TOOL_CAT[tool] || null;
    document.querySelectorAll(".cat").forEach(b =>
      b.classList.toggle("active", b.dataset.cat === cat));
    this.canvas.style.cursor = tool === "select" ? "pointer" : "crosshair";
  }

  toggleFlyout(cat, btn) {
    const fly = document.getElementById("flyout");
    if (!fly) return;
    const open = !fly.classList.contains("hidden") && this._flyCat === cat;
    if (open) { this.closeFlyout(); return; }
    this._flyCat = cat;
    fly.querySelectorAll(".fly-group").forEach(g =>
      g.classList.toggle("show", g.dataset.group === cat));
    fly.classList.remove("hidden");
    if (btn) fly.style.top = Math.max(52, btn.getBoundingClientRect().top) + "px";
  }

  closeFlyout() {
    const fly = document.getElementById("flyout");
    if (fly) fly.classList.add("hidden");
    this._flyCat = null;
  }

  tileAt(ev) {
    const r = this.canvas.getBoundingClientRect();
    const w = this.game.renderer.screenToWorld(ev.clientX - r.left, ev.clientY - r.top);
    return { x: Math.floor(w.x), y: Math.floor(w.y) };
  }

  bind() {
    // NOTE: handlers must read `this.game` freshly — the Input instance is
    // reused across games, so a captured reference would go stale.
    const c = this.canvas;

    // Toolbar tool buttons (also present inside fly-outs)
    document.querySelectorAll(".tool").forEach(btn => {
      btn.addEventListener("click", () => { this.setTool(btn.dataset.tool); this.closeFlyout(); });
    });

    // Category buttons open their fly-out submenu
    document.querySelectorAll(".cat").forEach(btn => {
      btn.addEventListener("click", () => this.toggleFlyout(btn.dataset.cat, btn));
    });

    // Speed control buttons
    document.querySelectorAll("#speed-ctl .spd").forEach(btn => {
      btn.addEventListener("click", () => {
        const v = btn.dataset.spd;
        this.game.setSpeed(v === "pause" ? 0 : parseInt(v, 10));
      });
    });

    // Right-panel tabs
    document.querySelectorAll(".ptab").forEach(btn => {
      btn.addEventListener("click", () => this.game.setPanelTab(btn.dataset.tab));
    });

    c.addEventListener("contextmenu", e => e.preventDefault());

    c.addEventListener("pointerdown", (e) => {
      if (window.appMenuOpen) return;
      this.closeFlyout(); // clicking the map dismisses any open submenu
      c.setPointerCapture(e.pointerId);
      if (e.button === 2 || e.button === 1 || this.keys.has(" ")) {
        this.panning = true;
        this.panLast = { x: e.clientX, y: e.clientY };
        return;
      }
      const t = this.tileAt(e);
      if (this.tool === "select") {
        this.handleSelect(t, e);
      } else {
        this.dragStart = t;
        this.dragCur = t;
      }
    });

    c.addEventListener("pointermove", (e) => {
      if (this.panning) {
        const ts = this.game.renderer.ts;
        const dpr = this.game.renderer.dpr;
        const dx = (e.clientX - this.panLast.x) * dpr / ts;
        const dy = (e.clientY - this.panLast.y) * dpr / ts;
        this.game.cam.x -= dx; this.game.cam.y -= dy;
        this.panLast = { x: e.clientX, y: e.clientY };
        this.clampCam();
        return;
      }
      const t = this.tileAt(e);
      this.game.hoverTile = t;
      if (this.dragStart) this.dragCur = t;
    });

    const endDrag = (e) => {
      if (this.panning) { this.panning = false; return; }
      if (this.dragStart && this.dragCur) {
        this.applyTool(this.dragStart, this.dragCur);
      }
      this.dragStart = null;
      this.dragCur = null;
    };
    c.addEventListener("pointerup", endDrag);
    c.addEventListener("pointercancel", endDrag);

    // Zoom
    c.addEventListener("wheel", (e) => {
      if (window.appMenuOpen) return;
      e.preventDefault();
      const g = this.game;
      const r = c.getBoundingClientRect();
      const before = g.renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      g.cam.zoom = clamp(g.cam.zoom * factor, 0.4, 3.2);
      const after = g.renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      g.cam.x += before.x - after.x;
      g.cam.y += before.y - after.y;
      this.clampCam();
    }, { passive: false });

    // Keyboard
    window.addEventListener("keydown", (e) => {
      const g = this.game;
      // Escape closes an open submenu first, otherwise toggles the in-game menu.
      if (e.key === "Escape") {
        const fly = document.getElementById("flyout");
        if (fly && !fly.classList.contains("hidden")) { this.closeFlyout(); return; }
        if (window.App) window.App.onEscape();
        return;
      }
      if (window.appMenuOpen) return; // menu swallows other keys
      this.keys.add(e.key.toLowerCase());
      if (e.key === " ") { this.keys.add(" "); g.togglePause(); e.preventDefault(); }
      const map = { q: "select", d: "dig", c: "chop", g: "gather", s: "stockpile", b: "build", f: "floor", e: "bed", "1": "smelter", "2": "forge", r: "bedroom", t: "dining", x: "erase" };
      if (map[e.key.toLowerCase()] && !e.repeat) { this.setTool(map[e.key.toLowerCase()]); this.closeFlyout(); }
      if (e.key === "+" || e.key === "=") g.changeSpeed(1);
      if (e.key === "-" || e.key === "_") g.changeSpeed(-1);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
  }

  clampCam() {
    const g = this.game;
    g.cam.x = clamp(g.cam.x, 0, g.world.w);
    g.cam.y = clamp(g.cam.y, 0, g.world.h);
  }

  handleSelect(t, ev) {
    const g = this.game;
    // Did we click on a dwarf?
    let picked = null, bd = 0.7;
    for (const d of g.dwarves) {
      const dd = Math.hypot(d.x + 0.5 - (t.x + 0.5), d.y + 0.5 - (t.y + 0.5));
      if (dd < bd) { bd = dd; picked = d; }
    }
    if (picked) {
      g.selectedDwarf = picked;
      g.selectedTile = null;
    } else {
      g.selectedDwarf = null;
      g.selectedTile = g.world.inBounds(t.x, t.y) ? t : null;
    }
    g.updatePanel();
  }

  applyTool(a, b) {
    const g = this.game, w = g.world;
    const minX = Math.max(0, Math.min(a.x, b.x));
    const minY = Math.max(0, Math.min(a.y, b.y));
    const maxX = Math.min(w.w - 1, Math.max(a.x, b.x));
    const maxY = Math.min(w.h - 1, Math.max(a.y, b.y));
    let count = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = w.tiles[y][x];
        switch (this.tool) {
          case "dig":
            if (t.kind === K.STONE && t.built === B.NONE && w.hasWalkableNeighbor(x, y)) { t.designation = "dig"; count++; }
            break;
          case "chop":
            if (t.feature === F.TREE) { t.designation = "chop"; count++; }
            break;
          case "gather":
            if (t.feature === F.BUSH || t.feature === F.MUSHROOM) { t.designation = "gather"; count++; }
            break;
          case "stockpile":
            if (w.isWalkable(x, y) && !t.stockpile) { t.stockpile = true; count++; }
            break;
          case "build":
            if (w.isWalkable(x, y) && t.built === B.NONE && !t.buildJob && !t.stockpile && !t.furniture) { t.buildJob = true; t.buildKind = "wall"; count++; }
            break;
          case "floor":
            if (w.isWalkable(x, y) && t.kind !== K.FLOOR && t.built === B.NONE && !t.buildJob) { t.buildJob = true; t.buildKind = "floor"; count++; }
            break;
          case "bed":
            if (w.isWalkable(x, y) && t.built === B.NONE && !t.buildJob && !t.furniture && !t.stockpile && !t.workshop) { t.buildJob = true; t.buildKind = "bed"; count++; }
            break;
          case "smelter":
          case "forge":
            if (w.isWalkable(x, y) && t.built === B.NONE && !t.buildJob && !t.furniture && !t.stockpile && !t.workshop) { t.buildJob = true; t.buildKind = this.tool; count++; }
            break;
          case "bedroom":
            if (w.isWalkable(x, y) && t.zone !== ZONE.BEDROOM) { t.zone = ZONE.BEDROOM; count++; }
            break;
          case "dining":
            if (w.isWalkable(x, y) && t.zone !== ZONE.DINING) { t.zone = ZONE.DINING; count++; }
            break;
          case "farm":
            if (w.isWalkable(x, y) && t.zone !== ZONE.FARM) { t.zone = ZONE.FARM; count++; }
            break;
          case "study":
            if (w.isWalkable(x, y) && t.zone !== ZONE.STUDY) { t.zone = ZONE.STUDY; count++; }
            break;
          case "hospital":
            if (w.isWalkable(x, y) && t.zone !== ZONE.HOSPITAL) { t.zone = ZONE.HOSPITAL; count++; }
            break;
          case "table":
            if (w.isWalkable(x, y) && t.built === B.NONE && !t.buildJob && !t.furniture && !t.stockpile && !t.workshop) { t.buildJob = true; t.buildKind = "table"; count++; }
            break;
          case "erase":
            if (t.designation || t.buildJob || t.stockpile || t.zone || t.furniture || t.workshop) {
              t.designation = null; t.buildJob = false; t.buildKind = null;
              t.stockpile = false; t.zone = null; t.reserved = false;
              if (t.furniture === FURN.BED) t.furniture = null; // deconstruct
              t.workshop = null; // deconstruct workshop
              count++;
            }
            break;
        }
      }
    }

    if (this.tool === "stockpile" || this.tool === "erase") g.rebuildStockpiles();
    if (["bedroom", "dining", "farm", "study", "hospital", "erase", "bed"].includes(this.tool)) g.rebuildZones();
    g.jobs.reindex();
    if (count) {
      const verb = {
        dig: "Marked for mining", chop: "Marked for chopping", gather: "Marked to gather",
        stockpile: "Stockpile expanded", build: "Walls queued", floor: "Floors queued",
        bed: "Beds queued", smelter: "Smelter queued", forge: "Forge queued",
        table: "Tables queued", bedroom: "Bedroom zoned", dining: "Dining hall zoned",
        farm: "Farm zoned", study: "Study zoned", hospital: "Hospital zoned", erase: "Cleared",
      }[this.tool];
      g.log(`${verb}: ${count} tile${count > 1 ? "s" : ""}.`, "", "order");
    }
  }
}
