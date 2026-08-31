// ---- Game: main loop, state, UI --------------------------------------------

const DAY_LENGTH = 120;        // real seconds per in-game day at 1x
const HUNGER_RATE = 100 / 280; // reach 100 in ~280s of game time
const ENERGY_RATE = 100 / 300; // drop to 0 in ~300s awake (faster at night)
const SPEEDS = [0, 1, 2, 4];
const DAY_START = 0.25;        // 06:00
const DAY_END = 0.75;          // 18:00

// Event chronicle categories (for the filterable Log panel).
const LOG_CATS = {
  order:  { name: "Orders",   icon: "📋" },
  labor:  { name: "Labor",    icon: "⚒️" },
  build:  { name: "Building",  icon: "🏗️" },
  craft:  { name: "Crafting",  icon: "🔨" },
  combat: { name: "Combat",    icon: "⚔️" },
  colony: { name: "Colony",    icon: "🧝" },
  skill:  { name: "Skills",    icon: "⭐" },
  system: { name: "System",    icon: "💾" },
};
const MAX_EVENTS = 4000;       // in-memory chronicle cap
const SAVED_EVENTS = 600;      // how many recent events persist in a save

class Game {
  // `saveData` restores a saved game; otherwise a fresh world is generated.
  constructor(saveData) {
    this.items = [];
    this.dwarves = [];
    this.enemies = [];
    this.caravans = [];
    this.stockpileTiles = [];
    this.bedTiles = [];
    this.diningTiles = [];
    this.depotTiles = [];
    this.doorTiles = [];
    this._nextItemId = 1;
    this.running = true;
    this.panelTab = "colony";  // colony | schedule | log | records
    this.events = [];          // full chronicle of everything that happens
    this.logFilter = "all";    // active category filter in the Log panel
    this._eventSeq = 1;

    // research
    this.research = 0;         // accumulated research points
    this.tech = {};            // completed tech ids -> true
    this.researchTimer = 0;
    this.farmTimer = 0;
    this.farmTiles = [];
    this.studyTiles = [];
    this.hospitalTiles = [];
    this.tableCount = 0;

    this.selectedDwarf = null;
    this.selectedTile = null;
    this.hoverTile = null;

    this.reindexTimer = 0;
    this.growthTimer = 0;
    this.statTimer = 0;
    this.migrationTimer = DAY_LENGTH * 1.5;
    this.raidTimer = DAY_LENGTH * 3;  // first raid around day 4
    this.raidCount = 0;
    this.tradeTimer = DAY_LENGTH * 2; // first caravan around day 2-3
    this.combatFx = [];               // transient hit sparks {x,y,t,bad}

    this.jobs = new JobManager(this);

    if (saveData) this.restore(saveData);
    else this.generateNew();

    this.rebuildZones();

    // Renderer & Input are reused across games so listeners aren't duplicated.
    const canvas = document.getElementById("canvas");
    if (!window.__renderer) window.__renderer = new Renderer(this, canvas);
    if (!window.__input) window.__input = new Input(this, canvas);
    this.renderer = window.__renderer; this.renderer.game = this;
    this.input = window.__input; this.input.game = this;

    if (saveData) this.log(`Loaded save “${saveData.name || "game"}”.`, "good", "system");
    else this.log("Your seven elves have arrived. Raise the empire!", "good", "colony");

    this.jobs.reindex();
    this.updateToolAvailability();
    this.updatePanel();
    this.updateStats();

    this._last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  generateNew() {
    this.world = new World(90, 70, (Math.floor(performance.now()) ^ 0x9e3779b9) >>> 0);
    this.cam = { x: this.world.spawnX, y: this.world.spawnY, zoom: 1.1 };
    this.time = 0.25 * DAY_LENGTH; // start at 06:00
    this.speedIdx = 1;
    this.paused = false;
    this.spawnStartingDwarves();
  }

  // ---- serialization ----
  serialize() {
    const w = this.world;
    const tiles = new Array(w.w * w.h);
    let i = 0;
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = w.tiles[y][x];
        tiles[i++] = [
          t.kind, t.feature, t.ore, Math.round(t.growth * 100) / 100,
          t.designation, t.built,
          t.buildJob ? 1 : 0, t.buildKind || 0, t.stockpile ? 1 : 0,
          t.reserved ? 1 : 0, t.item ? t.item.id : 0,
          t.zone || 0, t.furniture || 0,
          t.workshop || 0, t.workshopRecipe || 0,
          t.doorLocked ? 1 : 0,
        ];
      }
    }
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      day: Math.floor(this.time / DAY_LENGTH) + 1,
      pop: this.dwarves.length,
      world: { w: w.w, h: w.h, seed: w.seed, spawnX: w.spawnX, spawnY: w.spawnY, tiles },
      items: this.items.map(it => ({
        id: it.id, kind: it.kind, sub: it.sub, x: it.x, y: it.y,
        hauled: it.hauled ? 1 : 0, stored: it.stored ? 1 : 0,
      })),
      dwarves: this.dwarves.map(d => this.serializeDwarf(d)),
      enemies: this.enemies.map(e => ({
        kind: e.kind, x: e.x, y: e.y, hp: e.hp, facing: e.facing,
      })),
      raidTimer: this.raidTimer, raidCount: this.raidCount, tradeTimer: this.tradeTimer,
      research: this.research, tech: this.tech,
      events: this.events.slice(-SAVED_EVENTS),
      nextItemId: this._nextItemId,
      cam: { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom },
      time: this.time, speedIdx: this.speedIdx, paused: this.paused,
    };
  }

  serializeDwarf(d) {
    return {
      name: d.name, x: d.x, y: d.y, color: d.color,
      hunger: d.hunger, energy: d.energy, mood: d.mood, facing: d.facing,
      hp: d.hp, maxhp: d.maxhp, military: d.military ? 1 : 0,
      weapon: d.weapon, armor: d.armor,
      state: d.state, thought: d.thought, workTimer: d.workTimer,
      idleWander: d.idleWander, bob: d.bob, starve: d.starve || 0,
      carrying: d.carrying ? d.carrying.id : 0,
      dbId: d.dbId, skills: d.skills,
      labors: [...d.labors], schedule: d.schedule, activity: d.activity,
      bed: d.bed,
      path: d.path, pathIdx: d.pathIdx,
      job: d.job ? {
        type: d.job.type, x: d.job.x, y: d.job.y, phase: d.job.phase,
        item: d.job.item ? d.job.item.id : 0,
        dest: d.job.dest, dining: d.job.dining, buildKind: d.job.buildKind || null,
        slot: d.job.slot || null,
      } : null,
    };
  }

  restore(data) {
    const wd = data.world;
    this.world = new World(wd.w, wd.h, wd.seed, false);
    this.world.spawnX = wd.spawnX; this.world.spawnY = wd.spawnY;

    // rebuild items first so tiles/dwarves can reference them by id
    const byId = new Map();
    this.items = data.items.map(o => {
      const it = new Item(o.kind, o.x, o.y, o.sub);
      it.id = o.id; it.hauled = !!o.hauled; it.stored = !!o.stored;
      byId.set(o.id, it);
      return it;
    });
    this._nextItemId = data.nextItemId ||
      (this.items.reduce((m, it) => Math.max(m, it.id), 0) + 1);

    this.world.loadTiles(wd.tiles, byId);

    this.dwarves = data.dwarves.map(o => {
      const d = new Dwarf(o.name, o.x, o.y, o.color, o.skills);
      d.hunger = o.hunger; d.mood = o.mood; d.facing = o.facing;
      d.energy = o.energy != null ? o.energy : 100;
      d.hp = o.hp != null ? o.hp : 100; d.maxhp = o.maxhp || 100;
      d.military = !!o.military; d.weapon = o.weapon || null; d.armor = o.armor || null;
      d.state = o.state; d.thought = o.thought; d.workTimer = o.workTimer;
      d.idleWander = o.idleWander || 0; d.bob = o.bob || 0; d.starve = o.starve || 0;
      d.carrying = o.carrying ? byId.get(o.carrying) : null;
      if (o.dbId) d.dbId = o.dbId;
      if (o.labors) d.labors = new Set(o.labors);
      if (o.schedule) d.schedule = o.schedule;
      d.activity = o.activity || "work";
      d.bed = o.bed || null;
      d.path = o.path || null; d.pathIdx = o.pathIdx || 0;
      if (o.job) {
        const j = new Job(o.job.type, o.job.x, o.job.y);
        j.phase = o.job.phase;
        j.item = o.job.item ? byId.get(o.job.item) : null;
        j.dest = o.job.dest; j.dining = o.job.dining; j.buildKind = o.job.buildKind;
        j.slot = o.job.slot || null;
        d.job = j;
      }
      return d;
    });

    this.enemies = (data.enemies || []).map(o => {
      const e = new Enemy(o.kind, o.x, o.y);
      if (o.hp != null) e.hp = o.hp;
      e.facing = o.facing || 1;
      return e;
    });
    this.raidTimer = data.raidTimer != null ? data.raidTimer : DAY_LENGTH * 3;
    this.raidCount = data.raidCount || 0;
    this.tradeTimer = data.tradeTimer != null ? data.tradeTimer : DAY_LENGTH * 2;
    this.events = Array.isArray(data.events) ? data.events : [];
    this._eventSeq = this.events.reduce((m, e) => Math.max(m, e.seq || 0), 0) + 1;
    this.research = data.research || 0;
    this.tech = data.tech || {};

    this.cam = { x: data.cam.x, y: data.cam.y, zoom: data.cam.zoom };
    this.time = data.time;
    this.speedIdx = data.speedIdx != null ? data.speedIdx : 1;
    // Always resume running: manual saves are taken from the (paused) menu, so a
    // persisted `paused: true` would otherwise freeze the colony on load and the
    // dwarves would appear to "go idle" and never continue their work.
    this.paused = false;
    this.rebuildStockpiles();
    for (const d of this.dwarves) this.flushDwarfToDB(d);
  }

  spawnStartingDwarves() {
    const w = this.world, rng = w.rng;
    let placed = 0, tries = 0;
    while (placed < 7 && tries < 500) {
      tries++;
      const x = this.world.spawnX + randint(rng, -4, 4);
      const y = this.world.spawnY + randint(rng, -4, 4);
      if (w.isWalkable(x, y)) {
        const d = new Dwarf(dwarfName(rng), x, y, DWARF_COLORS[placed % DWARF_COLORS.length], rollStartingSkills(rng));
        this.dwarves.push(d);
        this.flushDwarfToDB(d);
        if (colonyDB) colonyDB.logEvent(`${d.name} (${professionOf(d)}) founded the colony`, 1);
        placed++;
      }
    }
    // Seed a bit of starting stone/wood so the first walls can go up.
    for (let i = 0; i < 6; i++) this.jobs.spawnItem(ITEM.STONE, this.world.spawnX + randint(rng, -3, 3), this.world.spawnY + randint(rng, -3, 3));
    for (let i = 0; i < 10; i++) this.jobs.spawnItem(ITEM.FOOD, this.world.spawnX + randint(rng, -3, 3), this.world.spawnY + randint(rng, -3, 3));
  }

  get speed() { return SPEEDS[this.speedIdx]; }
  togglePause() {
    this.paused = !this.paused;
    this.updateStats();
    this.log(this.paused ? "Paused." : "Resumed.", "", "system");
  }
  changeSpeed(dir) {
    this.speedIdx = clamp(this.speedIdx + dir, 1, SPEEDS.length - 1);
    this.paused = false;
    this.updateStats();
  }

  dayFraction() { return (this.time % DAY_LENGTH) / DAY_LENGTH; }

  rebuildStockpiles() {
    this.stockpileTiles = [];
    for (let y = 0; y < this.world.h; y++)
      for (let x = 0; x < this.world.w; x++)
        if (this.world.tiles[y][x].stockpile) this.stockpileTiles.push([x, y]);
  }

  // ---- main loop ----
  loop(now) {
    if (!this.running) return; // superseded by a newer game
    let dt = (now - this._last) / 1000;
    this._last = now;
    dt = Math.min(dt, 0.1); // clamp huge frames
    const gdt = this.paused ? 0 : dt * this.speed;

    if (gdt > 0) this.update(gdt);
    this.renderer.draw();
    // camera keys (real-time regardless of pause)
    this.handleCameraKeys(dt);

    requestAnimationFrame((t) => this.loop(t));
  }

  handleCameraKeys(dt) {
    // Arrow keys pan (letters are reserved for tool hotkeys).
    const k = this.input.keys, sp = 14 * dt / this.cam.zoom;
    if (k.has("arrowup")) this.cam.y -= sp;
    if (k.has("arrowdown")) this.cam.y += sp;
    if (k.has("arrowleft")) this.cam.x -= sp;
    if (k.has("arrowright")) this.cam.x += sp;
    this.input.clampCam();
  }

  update(dt) {
    this.time += dt;

    // periodic reindex of designations
    this.reindexTimer -= dt;
    if (this.reindexTimer <= 0) { this.jobs.reindex(); this.reindexTimer = 0.4; }

    // plant growth
    this.growthTimer -= dt;
    if (this.growthTimer <= 0) { this.world.tickGrowth(this.world.rng); this.growthTimer = 0.5; }

    // research accrues over time
    this.research += this.researchRate() * dt;

    // farm zones grow food (once Agriculture is researched)
    if (this.hasTech("agriculture") && this.farmTiles.length) {
      this.farmTimer -= dt;
      if (this.farmTimer <= 0) {
        this.farmTimer = 3;
        const yieldN = Math.max(1, Math.round(this.farmTiles.length * 0.15));
        const foodCap = 30 + this.dwarves.length * 6;   // don't let food run away
        if (this.countItems(ITEM.FOOD) < foodCap) {
          for (let k = 0; k < yieldN; k++) {
            const [fx, fy] = this.farmTiles[Math.floor(this.world.rng() * this.farmTiles.length)];
            if (!this.world.tiles[fy][fx].item) this.jobs.spawnItem(ITEM.FOOD, fx, fy);
          }
        }
      }
    }

    // dwarves
    for (const d of this.dwarves) this.updateDwarf(d, dt);
    this.flushRemovals();

    // enemies & combat
    if (this.enemies.length) { this.updateEnemies(dt); this.flushRemovals(); }
    for (let i = this.combatFx.length - 1; i >= 0; i--) {
      this.combatFx[i].t -= dt;
      if (this.combatFx[i].t <= 0) this.combatFx.splice(i, 1);
    }

    // raids
    this.raidTimer -= dt;
    if (this.raidTimer <= 0) {
      const day = Math.floor(this.time / DAY_LENGTH) + 1;
      this.raidTimer = randint(this.world.rng, DAY_LENGTH * 2, DAY_LENGTH * 3);
      if (day >= 3) this.spawnRaid();
    }

    // migration
    this.migrationTimer -= dt;
    if (this.migrationTimer <= 0) {
      this.migrationTimer = DAY_LENGTH * 1.5;
      this.tryMigration();
    }

    // trading caravans
    this.tradeTimer -= dt;
    if (this.tradeTimer <= 0) {
      this.tradeTimer = randint(this.world.rng, DAY_LENGTH * 2, DAY_LENGTH * 3.5);
      this.trySpawnCaravan();
    }
    if (this.caravans.length) this.updateCaravans(dt);

    // UI
    this.statTimer -= dt;
    if (this.statTimer <= 0) {
      this.updateStats();
      if (this.panelTab === "colony" || this.panelTab === "research") this.updatePanel();
      this.statTimer = 0.5;
    }
  }

  shift() { const f = this.dayFraction(); return (f >= DAY_START && f < DAY_END) ? "day" : "night"; }

  // Resolve what a dwarf should be doing right now (critical needs override schedule).
  resolveActivity(d) {
    if (d.hunger > 85) return "eat";
    if (d.energy < 15) return "sleep";
    return d.schedule[this.shift()] || "work";
  }

  updateDwarf(d, dt) {
    if (d.hp <= 0) return; // slain — awaiting removal this frame
    const night = this.shift() === "night";

    // needs
    d.hunger = clamp(d.hunger + this.hungerRate() * dt, 0, 100);
    if (d.state !== "sleep") d.energy = clamp(d.energy - ENERGY_RATE * (night ? 1.4 : 1) * dt, 0, 100);
    d.activity = this.resolveActivity(d);

    // mood
    if (d.hunger > 92) {
      d.mood = clamp(d.mood - dt * 4, 0, 100);
      d.starve = (d.starve || 0) + dt;
      if (d.starve > 45) { this.recordDeath(d, "starved to death"); return; }
    } else d.starve = 0;
    if (d.energy < 18) d.mood = clamp(d.mood - dt * 1.5, 0, 100);
    else if (d.hunger < 50 && d.state === "idle") d.mood = clamp(d.mood + dt * 0.3, 0, 100);

    // slow healing when no threat is present (faster with Medicine / in a Hospital)
    if (!this.enemies.length && d.hp < d.maxhp && (d.hunger < 85 || this.hasTech("medicine"))) {
      let heal = 3;
      if (this.hasTech("medicine")) heal *= 2.5;
      const here = this.world.tiles[d.tileY] && this.world.tiles[d.tileY][d.tileX];
      if (here && here.zone === ZONE.HOSPITAL) heal *= 2;
      d.hp = clamp(d.hp + heal * dt, 0, d.maxhp);
    }

    // overall happiness gauge (health + mood + satisfied needs)
    d.happiness = this.computeHappiness(d);

    // combat takes over whenever enemies are on the map
    if (this.enemies.length && this.handleCombat(d, dt)) return;

    if (d.job) {
      this.jobs.execute(d, dt);
    } else {
      d.state = "idle";
      if (!this.jobs.assign(d)) {
        d.idleWander -= dt;
        if (d.idleWander <= 0) {
          d.idleWander = 2 + Math.random() * 3;
          if (Math.random() < 0.5) {
            const nx = d.tileX + randint(this.world.rng, -3, 3);
            const ny = d.tileY + randint(this.world.rng, -3, 3);
            if (this.world.isWalkable(nx, ny)) {
              const p = pathTo(this.world, d.tileX, d.tileY, nx, ny);
              if (p) { d.setPath(p); d.state = "wander"; d.thought = "Wandering about"; }
            }
          }
        }
      }
    }

    if (d.state === "wander") { if (d.move(dt)) d.state = "idle"; }
  }

  // ---- skills / database ----
  awardXp(d, skillId, amount) {
    const leveled = grantXp(d, skillId, amount);
    if (leveled) {
      this.log(`${d.name} is now ${skillTitle(d.skills[leveled].level)} ${SKILLS[leveled].name}.`, "good", "skill");
      this.flushDwarfToDB(d);
      if (colonyDB) colonyDB.logEvent(`${d.name} became ${skillTitle(d.skills[leveled].level)} at ${SKILLS[leveled].name}`, Math.floor(this.time / DAY_LENGTH) + 1);
    }
  }

  flushDwarfToDB(d) {
    if (!colonyDB) return;
    const skills = {};
    for (const id in d.skills) skills[id] = d.skills[id].level;
    colonyDB.putDwarf({
      id: d.dbId, name: d.name, color: d.color, alive: true, skills,
      profession: professionOf(d), day: Math.floor(this.time / DAY_LENGTH) + 1,
    }).catch(() => {});
  }

  recordDeath(d, cause) {
    this.log(`${d.name} has ${cause}.`, "bad", "colony");
    if (d.bed) { const bt = this.world.get(d.bed.x, d.bed.y); if (bt) bt.reserved = false; }
    (this._toRemove || (this._toRemove = [])).push(d);
    if (colonyDB) {
      const skills = {};
      for (const id in d.skills) skills[id] = d.skills[id].level;
      colonyDB.putDwarf({
        id: d.dbId, name: d.name, color: d.color, alive: false, cause, skills,
        profession: professionOf(d), day: Math.floor(this.time / DAY_LENGTH) + 1,
      }).catch(() => {});
      colonyDB.logEvent(`${d.name} ${cause}`, Math.floor(this.time / DAY_LENGTH) + 1);
    }
  }

  // ---- research ----
  hasTech(id) { return !!this.tech[id]; }

  researchRate() {
    let r = 0;
    for (const d of this.dwarves) r += 0.12 * (1 + d.skillLevel("intelligence") * 0.08);
    r += this.studyTiles.length * 0.3;               // dedicated study zones
    if (this.hasTech("scholarship")) r *= 1.3;
    if (this.hasTech("bookkeeping")) r *= 1.3;
    return r;
  }

  techPrereqsMet(t) { return (t.requires || []).every(id => this.hasTech(id)); }
  canResearch(t) { return !this.hasTech(t.id) && this.techPrereqsMet(t) && this.research >= t.cost; }

  buyTech(t) {
    if (!this.canResearch(t)) return false;
    this.research -= t.cost;
    this.tech[t.id] = true;
    this.log(`Researched ${t.name}.`, "good", "skill");
    if (colonyDB) colonyDB.logEvent(`Researched ${t.name}`, Math.floor(this.time / DAY_LENGTH) + 1);
    this.updateToolAvailability();
    this.updatePanel();
    return true;
  }

  // Show/hide tools whose tech hasn't been researched yet.
  updateToolAvailability() {
    for (const tool in TOOL_TECH) {
      const unlocked = this.hasTech(TOOL_TECH[tool]);
      document.querySelectorAll(`.tool[data-tool="${tool}"]`).forEach(b => {
        b.style.display = unlocked ? "" : "none";
      });
    }
  }

  // ---- happiness (derived gauge: health + mood + needs) ----
  computeHappiness(d) {
    const hpPct = (d.hp / d.maxhp) * 100;
    return clamp(0.4 * d.mood + 0.25 * hpPct + 0.2 * (100 - d.hunger) + 0.15 * d.energy, 0, 100);
  }
  avgHappiness() {
    if (!this.dwarves.length) return 0;
    let s = 0; for (const d of this.dwarves) s += (d.happiness != null ? d.happiness : 60);
    return s / this.dwarves.length;
  }

  // ---- speed controls ----
  setSpeed(v) { // v === 0 pauses; otherwise a value from SPEEDS
    if (v === 0) { this.paused = true; }
    else { const i = SPEEDS.indexOf(v); if (i >= 0) this.speedIdx = i; this.paused = false; }
    this.updateStats();
  }

  hungerRate() { return HUNGER_RATE * (this.hasTech("rations") ? 0.75 : 1); }

  flushRemovals() {
    if (!this._toRemove || !this._toRemove.length) return;
    for (const d of this._toRemove) {
      const i = this.dwarves.indexOf(d);
      if (i >= 0) this.dwarves.splice(i, 1);
      if (this.selectedDwarf === d) this.selectedDwarf = null;
    }
    this._toRemove = null;
    this.updatePanel();
  }

  // ---- combat ----
  soldierCount() { let n = 0; for (const d of this.dwarves) if (d.military) n++; return n; }
  addFx(x, y, bad) { this.combatFx.push({ x, y, t: 0.3, bad: !!bad }); }

  nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const d = dist2(e.x, e.y, x, y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  nearestDwarf(x, y) {
    let best = null, bd = Infinity;
    for (const d of this.dwarves) {
      if (d.hp <= 0) continue;
      const dd = dist2(d.x, d.y, x, y) * (d.military ? 0.55 : 1); // enemies favour soldiers
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // Returns true if combat took control of this dwarf this frame.
  handleCombat(d, dt) {
    const foe = this.nearestEnemy(d.x, d.y);
    if (!foe) { d.fleeing = false; return false; }
    const fdist = Math.hypot(foe.x - d.x, foe.y - d.y);

    if (d.military) {
      if (d.job && d.job.type === "equip") { this.jobs.execute(d, dt); return true; } // finish arming
      if (d.job) this.jobs.cancel(d); // drop civilian work to fight
      const adj = Math.max(Math.abs(d.tileX - foe.tileX), Math.abs(d.tileY - foe.tileY)) <= 1;
      if (adj) {
        d.state = "fight"; d.path = null; d.facing = foe.x > d.x ? 1 : -1;
        d.attackCd -= dt;
        if (d.attackCd <= 0) { d.attackCd = 0.8; this.dwarfHitEnemy(d, foe); }
      } else {
        d.combatRepath -= dt;
        if (!d.path || d.combatRepath <= 0) {
          d.combatRepath = 0.4;
          const p = pathAdjacent(this.world, d.tileX, d.tileY, foe.tileX, foe.tileY);
          if (p) d.setPath(p);
        }
        d.state = "goto"; d.move(dt);
      }
      d.thought = "In battle!";
      return true;
    }

    // civilians flee toward the colony centre when a foe is near
    if (fdist < 8) {
      if (d.job) this.jobs.cancel(d);
      d.fleeing = true; d.thought = "Fleeing the enemy!";
      d.mood = clamp(d.mood - dt * 2, 0, 100);
      d.combatRepath -= dt;
      if (!d.path || d.combatRepath <= 0) {
        d.combatRepath = 0.5;
        const p = pathTo(this.world, d.tileX, d.tileY, this.world.spawnX, this.world.spawnY);
        if (p) d.setPath(p);
      }
      d.state = "goto"; d.move(dt);
      return true;
    }
    d.fleeing = false;
    return false;
  }

  dwarfHitEnemy(d, foe) {
    foe.hp -= d.attackDamage();
    this.addFx(foe.x, foe.y, false);
    if (window.sound) window.sound.play("combat", 100);
    this.awardXp(d, "fighting", 5); this.awardXp(d, "fitness", 1);
    if (foe.hp <= 0) this.killEnemy(foe, d);
  }

  enemyHitDwarf(e, d) {
    d.hp -= d.damageTaken(e.atk);
    this.addFx(d.x, d.y, true);
    if (window.sound) window.sound.play("combat", 100);
    this.awardXp(d, "fighting", 2);
    if (d.hp <= 0) this.recordDeath(d, `slain by a ${e.name}`);
  }

  killEnemy(foe, byDwarf) {
    foe.hp = 0; // filtered out after the enemy loop
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    if (byDwarf) {
      this.log(`${byDwarf.name} slew a ${foe.name}!`, "good", "combat");
      byDwarf.mood = clamp(byDwarf.mood + 4, 0, 100);
      this.awardXp(byDwarf, "fighting", 15);
    } else this.log(`A ${foe.name} was slain.`, "good", "combat");
    if (colonyDB) colonyDB.logEvent(`${byDwarf ? byDwarf.name : "The colony"} slew a ${foe.name}`, day);
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.attackCd -= dt;
      const tgt = this.nearestDwarf(e.x, e.y);
      if (!tgt) {
        e.repath -= dt;
        if (!e.path || e.repath <= 0) {
          e.repath = 0.6;
          const p = pathTo(this.world, e.tileX, e.tileY, this.world.spawnX, this.world.spawnY, true);
          if (p) e.setPath(p);
        }
        e.move(dt);
        continue;
      }
      const adj = Math.max(Math.abs(e.tileX - tgt.tileX), Math.abs(e.tileY - tgt.tileY)) <= 1;
      if (adj) {
        e.facing = tgt.x > e.x ? 1 : -1; e.path = null;
        if (e.attackCd <= 0) { e.attackCd = 1.0; this.enemyHitDwarf(e, tgt); }
      } else {
        e.repath -= dt;
        if (!e.path || e.repath <= 0) {
          e.repath = 0.5;
          const p = pathAdjacent(this.world, e.tileX, e.tileY, tgt.tileX, tgt.tileY, true);
          if (p) e.setPath(p);
        }
        e.move(dt);
      }
    }
    const before = this.enemies.length;
    this.enemies = this.enemies.filter(e => e.hp > 0);
    if (before && !this.enemies.length) this.log("The colony has repelled the attack!", "good", "combat");
  }

  randomEdgeTile(outsider = true) {
    const w = this.world;
    for (let t = 0; t < 40; t++) {
      const side = randint(w.rng, 0, 3);
      let x, y;
      if (side === 0) { x = randint(w.rng, 0, w.w - 1); y = 1; }
      else if (side === 1) { x = randint(w.rng, 0, w.w - 1); y = w.h - 2; }
      else if (side === 2) { x = 1; y = randint(w.rng, 0, w.h - 1); }
      else { x = w.w - 2; y = randint(w.rng, 0, w.h - 1); }
      if (w.isWalkable(x, y, outsider) && pathTo(w, x, y, w.spawnX, w.spawnY, outsider)) return { x, y };
    }
    return null;
  }

  spawnRaid() {
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    const n = clamp(1 + Math.floor(day / 5) + Math.floor(this.dwarves.length / 6), 1, 8);
    let kind = "wolf";
    if (day >= 12 && this.world.rng() < 0.35) kind = "troll";
    else if (day >= 6) kind = "goblin";
    const edge = this.randomEdgeTile();
    if (!edge) return;
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 14; t++) {
        const x = clamp(edge.x + randint(this.world.rng, -3, 3), 0, this.world.w - 1);
        const y = clamp(edge.y + randint(this.world.rng, -3, 3), 0, this.world.h - 1);
        if (this.world.isWalkable(x, y)) { this.enemies.push(new Enemy(kind, x, y)); spawned++; break; }
      }
    }
    if (!spawned) return;
    this.raidCount++;
    const label = ENEMY_TYPES[kind].name + (spawned > 1 ? "s" : "");
    this.log(`⚔️ A raid! ${spawned} ${label} approach from the wilds!`, "bad", "combat");
    if (window.App) window.App.toast(`⚔️ Raid — ${spawned} ${label}!`);
    if (colonyDB) colonyDB.logEvent(`Raid of ${spawned} ${label} attacked`, day);
  }

  // ---- trade caravans ----
  trySpawnCaravan() {
    if (!this.depotTiles.length) return;
    const edge = this.randomEdgeTile(true);
    if (!edge) return;
    const depot = this.jobs.nearestTile(this.depotTiles, edge.x, edge.y);
    const path = pathTo(this.world, edge.x, edge.y, depot.x, depot.y, true);
    if (!path) return;
    const car = new Caravan(edge.x, edge.y);
    car.setPath(path);
    car.depot = depot;
    this.caravans.push(car);
    this.log("🐎 A trading caravan approaches the depot!", "good", "colony");
    if (window.App) window.App.toast("🐎 A caravan has arrived to trade!");
  }

  updateCaravans(dt) {
    for (const car of this.caravans) {
      if (car.state === "approach") {
        if (car.move(dt)) { car.state = "trading"; car.tradeTimer = 3; this.doTrade(car); }
      } else if (car.state === "trading") {
        car.tradeTimer -= dt;
        if (car.tradeTimer <= 0) {
          const edge = this.randomEdgeTile(true);
          car.state = "leave";
          car.setPath(edge ? pathTo(this.world, car.tileX, car.tileY, edge.x, edge.y, true) : null);
          car._stuckTimer = 5; // fallback despawn if no path home
        }
      } else { // leave
        if (!car.path) { car._stuckTimer -= dt; if (car._stuckTimer <= 0) car._gone = true; }
        else if (car.move(dt)) car._gone = true;
      }
    }
    this.caravans = this.caravans.filter(c => !c._gone);
  }

  // Sell whatever sellable goods are sitting on depot tiles, then spend the
  // proceeds on whichever staple (food/wood/ore) the colony is shortest on.
  doTrade(car) {
    const w = this.world;
    let value = 0, sold = 0;
    for (const [x, y] of this.depotTiles) {
      const t = w.tiles[y][x];
      const it = t.item;
      if (!it) continue;
      const price = tradeSellPrice(it);
      if (price == null) continue;
      value += price; sold++;
      t.item = null;
      const idx = this.items.indexOf(it);
      if (idx >= 0) this.items.splice(idx, 1);
    }
    if (!sold) { this.log("The caravan found nothing to trade and moved on.", "", "colony"); return; }

    let cha = 0;
    for (const d of this.dwarves) cha = Math.max(cha, d.skillLevel("charisma"));
    value *= 1 + cha * 0.03;

    const needs = [
      { kind: ITEM.FOOD, cost: 2, have: this.countItems(ITEM.FOOD) },
      { kind: ITEM.WOOD, cost: 2, have: this.countItems(ITEM.WOOD) },
      { kind: ITEM.ORE, sub: "iron", cost: 4, have: this.countItems(ITEM.ORE) },
    ];
    const bought = {};
    let guard = 0;
    while (value > 0 && guard++ < 300) {
      needs.sort((a, b) => a.have - b.have);
      const pick = needs[0];
      if (value < pick.cost) break;
      value -= pick.cost; pick.have++;
      bought[pick.kind] = (bought[pick.kind] || 0) + 1;
    }
    for (const kind in bought) {
      const sub = kind === ITEM.ORE ? "iron" : null;
      for (let i = 0; i < bought[kind]; i++) {
        const spot = this.depotTiles[Math.floor(this.world.rng() * this.depotTiles.length)];
        this.jobs.spawnItem(kind, spot[0], spot[1], sub);
      }
    }
    const boughtTxt = Object.keys(bought).length
      ? Object.entries(bought).map(([k, n]) => `${n} ${ITEM_LABEL[k]}`).join(", ") : "nothing";
    this.log(`Traded ${sold} good${sold > 1 ? "s" : ""} with the caravan for ${boughtTxt}.`, "good", "colony");
    if (colonyDB) colonyDB.logEvent(`Traded with a caravan for ${boughtTxt}`, Math.floor(this.time / DAY_LENGTH) + 1);
  }

  rebuildZones() {
    this.bedTiles = []; this.diningTiles = [];
    this.farmTiles = []; this.studyTiles = []; this.hospitalTiles = [];
    this.depotTiles = []; this.doorTiles = [];
    this.tableCount = 0;
    for (let y = 0; y < this.world.h; y++)
      for (let x = 0; x < this.world.w; x++) {
        const t = this.world.tiles[y][x];
        if (t.furniture === FURN.BED) this.bedTiles.push([x, y]);
        else if (t.furniture === FURN.TABLE) this.tableCount++;
        if (t.zone === ZONE.DINING) this.diningTiles.push([x, y]);
        else if (t.zone === ZONE.FARM) this.farmTiles.push([x, y]);
        else if (t.zone === ZONE.STUDY) this.studyTiles.push([x, y]);
        else if (t.zone === ZONE.HOSPITAL) this.hospitalTiles.push([x, y]);
        else if (t.zone === ZONE.TRADE) this.depotTiles.push([x, y]);
        if (t.built === B.DOOR) this.doorTiles.push([x, y]);
      }
  }

  // ---- doors ----
  setDoorsLocked(locked) {
    if (!this.doorTiles.length) return;
    for (const [x, y] of this.doorTiles) this.world.tiles[y][x].doorLocked = locked;
    this.log(locked ? "All doors locked." : "All doors unlocked.", "", "order");
    this.updateStats();
  }

  // Migrants arrive randomly — better odds when the colony is thriving, but
  // only if there is room to house them (beds provide living space).
  tryMigration() {
    const HARD_CAP = 40;
    if (this.dwarves.length >= HARD_CAP) return;
    const capacity = 8 + this.bedTiles.length; // free buffer + one slot per bed
    const room = capacity - this.dwarves.length;
    if (room <= 0) return; // no space — nowhere to house new arrivals

    const food = this.countItems(ITEM.FOOD);
    const wellFed = food >= this.dwarves.length;
    const hap = this.avgHappiness();
    let cha = 0;
    for (const d of this.dwarves) cha = Math.max(cha, d.skillLevel("charisma"));

    // Base randomness improved by happiness, food security, charisma, bookkeeping.
    let chance = 0.12 + (hap / 100) * 0.5 + (wellFed ? 0.15 : -0.12) + cha * 0.02;
    if (this.hasTech("bookkeeping")) chance += 0.15;
    chance = clamp(chance, 0.02, 0.92);
    if (this.world.rng() >= chance) return; // no arrivals this season

    const n = clamp(randint(this.world.rng, 1, 3), 1, room);
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = this.world.spawnX + randint(this.world.rng, -6, 6);
        const y = this.world.spawnY + randint(this.world.rng, -6, 6);
        if (this.world.isWalkable(x, y)) {
          const d = new Dwarf(dwarfName(this.world.rng), x, y, DWARF_COLORS[this.dwarves.length % DWARF_COLORS.length], rollStartingSkills(this.world.rng));
          this.dwarves.push(d); arrived++;
          this.flushDwarfToDB(d);
          if (colonyDB) colonyDB.logEvent(`${d.name} (${professionOf(d)}) migrated to the colony`, Math.floor(this.time / DAY_LENGTH) + 1);
          break;
        }
      }
    }
    if (arrived) this.log(`${arrived} migrant${arrived > 1 ? "s have" : " has"} arrived seeking work.`, "good", "colony");
  }

  countItems(kind) {
    let n = 0;
    for (const it of this.items) if (it.kind === kind) n++;
    return n;
  }

  // ---- UI ----
  // Every message flows through here: it shows in the bottom ticker AND is
  // recorded in the permanent, filterable chronicle (this.events).
  log(msg, cls = "", cat = "system") {
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    const f = this.dayFraction() * 24;
    const hh = String(Math.floor(f)).padStart(2, "0");
    const mm = String(Math.floor((f % 1) * 60)).padStart(2, "0");
    const hm = `${hh}:${mm}`;

    // sound cue for the event (throttled inside the sound manager)
    if (window.sound) window.sound.onLog(cat, cls, msg);

    // record in the chronicle
    this.events.push({ seq: this._eventSeq++, day, hm, cat, cls, text: msg });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);

    // bottom ticker (recent only)
    const el = document.getElementById("log");
    if (el) {
      const div = document.createElement("div");
      div.className = "entry " + cls;
      div.textContent = `[D${day} ${hm}] ${msg}`;
      el.appendChild(div);
      while (el.children.length > 60) el.removeChild(el.firstChild);
      el.scrollTop = el.scrollHeight;
    }

    // live-refresh the Log panel if the player is viewing it at the top
    if (this.panelTab === "log") this.maybeRefreshLog();
  }

  updateStats() {
    document.getElementById("stat-pop").textContent = this.dwarves.length;
    document.getElementById("stat-wood").textContent = this.countItems(ITEM.WOOD);
    document.getElementById("stat-stone").textContent = this.countItems(ITEM.STONE);
    document.getElementById("stat-ore").textContent = this.countItems(ITEM.ORE);
    document.getElementById("stat-food").textContent = this.countItems(ITEM.FOOD);
    const f = this.dayFraction() * 24;
    const hh = String(Math.floor(f)).padStart(2, "0");
    const mm = String(Math.floor((f % 1) * 60)).padStart(2, "0");
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    const icon = this.shift() === "day" ? "☀️" : "🌙";
    document.getElementById("stat-clock").textContent = `${icon} Day ${day} · ${hh}:${mm}`;
    const rEl = document.getElementById("stat-research");
    if (rEl) rEl.innerHTML = `🔬 <b>${Math.floor(this.research)}</b>`;
    // highlight the active speed button
    document.querySelectorAll("#speed-ctl .spd").forEach(b => {
      const v = b.dataset.spd;
      const on = v === "pause" ? this.paused : (!this.paused && String(this.speed) === v);
      b.classList.toggle("on", on);
    });
    const threat = document.getElementById("stat-threat");
    if (threat) {
      if (this.enemies.length) {
        threat.style.display = "";
        threat.innerHTML = `⚔️ <b>${this.enemies.length}</b> · 🛡 ${this.soldierCount()}`;
      } else {
        threat.style.display = "none";
      }
    }
    const doorCtl = document.getElementById("door-ctl");
    if (doorCtl) doorCtl.style.display = this.doorTiles.length ? "" : "none";
  }

  setPanelTab(tab) {
    this.panelTab = tab;
    this._recordsLoaded = false;
    this.updatePanel();
  }

  updatePanel() {
    const c = document.getElementById("panel-content");
    if (!c) return;
    document.querySelectorAll(".ptab").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === this.panelTab));
    if (this.panelTab === "schedule") this.renderSchedule(c);
    else if (this.panelTab === "records") this.renderRecords(c);
    else if (this.panelTab === "log") this.renderLog(c);
    else if (this.panelTab === "research") this.renderResearch(c);
    else this.renderColony(c);
  }

  renderResearch(c) {
    const rate = this.researchRate();
    let html = `<h2>Research</h2>
      <div class="res-hdr">🔬 <b>${Math.floor(this.research)}</b> points
        <span class="res-rate">+${rate.toFixed(1)}/s</span></div>
      <div class="sched-note">Points accrue from your elves' intellect and Study zones. Spend them to unlock buildings, zones and efficiency bonuses.</div>
      <div class="tech-list">`;
    // group by tier
    for (let tier = 1; tier <= 3; tier++) {
      const inTier = TECHS.filter(t => t.tier === tier);
      if (!inTier.length) continue;
      html += `<div class="tech-tier">Tier ${tier}</div>`;
      for (const t of inTier) {
        const done = this.hasTech(t.id);
        const met = this.techPrereqsMet(t);
        const afford = this.research >= t.cost;
        const state = done ? "done" : !met ? "locked" : afford ? "ready" : "poor";
        const reqTxt = (t.requires || []).length
          ? `<div class="tech-req">Requires: ${t.requires.map(r => TECH_BY_ID[r] ? TECH_BY_ID[r].name : r).join(", ")}</div>` : "";
        html += `<div class="tech ${state}" data-tech="${t.id}">
          <div class="tech-top"><span class="tech-name">${t.icon} ${t.name}</span>
            <span class="tech-cost">${done ? "✓ done" : t.cost + " pts"}</span></div>
          <div class="tech-desc">${t.desc}</div>${reqTxt}</div>`;
      }
    }
    html += `</div>`;
    c.innerHTML = html;
    c.querySelectorAll(".tech.ready").forEach(el => {
      el.onclick = () => { this.buyTech(TECH_BY_ID[el.dataset.tech]); };
    });
  }

  // Full event chronicle with category filters.
  renderLog(c) {
    const cats = Object.keys(LOG_CATS);
    const filtered = this.events.filter(e => this.logFilter === "all" || e.cat === this.logFilter);
    const shown = filtered.slice(-400).reverse(); // newest first, cap for perf

    let chips = `<button class="log-chip${this.logFilter === "all" ? " on" : ""}" data-f="all">All</button>`;
    for (const id of cats) {
      chips += `<button class="log-chip${this.logFilter === id ? " on" : ""}" data-f="${id}">${LOG_CATS[id].icon} ${LOG_CATS[id].name}</button>`;
    }

    let rows = "";
    for (const e of shown) {
      const ico = (LOG_CATS[e.cat] || LOG_CATS.system).icon;
      rows += `<div class="log-line ${e.cls || ""}">
        <span class="lg-time">D${e.day} ${e.hm}</span>
        <span class="lg-ico">${ico}</span>
        <span class="lg-text">${this.escapeHtml(e.text)}</span></div>`;
    }
    if (!shown.length) rows = `<div class="menu-empty">No events${this.logFilter === "all" ? " yet" : " in this category"}.</div>`;

    c.innerHTML = `<h2>Event Log</h2>
      <div class="log-filters">${chips}</div>
      <div class="log-count">${filtered.length} event${filtered.length === 1 ? "" : "s"}${filtered.length > 400 ? " · showing latest 400" : ""} · newest first</div>
      <div id="log-body">${rows}</div>`;

    c.querySelectorAll(".log-chip").forEach(b => {
      b.onclick = () => { this.logFilter = b.dataset.f; this.renderLog(c); };
    });
  }

  // Re-render the log in place without disturbing a player scrolling history.
  maybeRefreshLog() {
    const body = document.getElementById("log-body");
    const c = document.getElementById("panel-content");
    if (!body || !c) return;
    if (body.scrollTop > 12) return; // player is reading older entries — leave it
    this.renderLog(c);
  }

  escapeHtml(s) {
    return String(s).replace(/[&<>]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
  }

  renderColony(c) {
    let html = `<h2>Colony · ${this.dwarves.length}</h2><div id="dwarf-list">`;
    this.dwarves.forEach((d, i) => {
      const hap = d.happiness != null ? d.happiness : 60;
      const hapColor = hap > 60 ? "#7ec86a" : hap > 35 ? "#e0b158" : "#e08a6a";
      const face = hap > 70 ? "😀" : hap > 45 ? "🙂" : hap > 25 ? "😕" : "😣";
      const sel = this.selectedDwarf === d ? " sel" : "";
      html += `
        <div class="dwarf-row${sel}" data-idx="${i}">
          <span class="swatch" style="background:${d.color}"></span>
          <span class="dname">${d.name} <span class="hap-face" title="Happiness ${Math.round(hap)}">${face}</span>
            <div class="dtask">${professionOf(d)} · ${this.taskLabel(d)}</div>
            <div class="bar" title="Happiness ${Math.round(hap)}"><i style="width:${hap}%;background:${hapColor}"></i></div>
          </span>
        </div>`;
    });
    html += `</div><hr/><h2>Selection</h2><div id="inspector">${this.inspectorHTML()}</div>`;
    c.innerHTML = html;
    c.querySelectorAll(".dwarf-row").forEach(row => {
      row.onclick = () => {
        const d = this.dwarves[+row.dataset.idx];
        this.selectedDwarf = d; this.selectedTile = null;
        this.cam.x = d.x; this.cam.y = d.y; this.updatePanel();
      };
    });
    this.wireInspector(c);
  }

  // Attach handlers for interactive controls inside the inspector.
  wireInspector(c) {
    const mil = c.querySelector("#insp-military");
    if (mil && this.selectedDwarf) {
      mil.onclick = () => {
        const d = this.selectedDwarf;
        d.military = !d.military;
        if (d.job) this.jobs.cancel(d); // re-evaluate role next tick
        this.log(`${d.name} ${d.military ? "enlists in the militia" : "returns to civilian life"}.`, "", "combat");
        this.updatePanel();
      };
    }
    if (this.selectedTile) {
      const tile = this.world.tiles[this.selectedTile.y][this.selectedTile.x];
      c.querySelectorAll(".recipe-btn").forEach(btn => {
        btn.onclick = () => {
          tile.workshopRecipe = +btn.dataset.recipe;
          this.jobs.reindex();
          this.updatePanel();
        };
      });
      const doorBtn = c.querySelector("#insp-door-lock");
      if (doorBtn && tile.built === B.DOOR) {
        doorBtn.onclick = () => {
          tile.doorLocked = !tile.doorLocked;
          this.log(`Door ${tile.doorLocked ? "locked" : "unlocked"}.`, "", "order");
          this.updatePanel();
        };
      }
    }
  }

  inspectorHTML() {
    if (this.selectedDwarf) {
      const d = this.selectedDwarf;
      let sk = `<div class="skill-grid">`;
      for (const id of SKILL_IDS) {
        const lv = d.skills[id].level;
        const strong = lv > 0 ? "" : ' style="opacity:.4"';
        sk += `<div class="skill"${strong} title="${skillTitle(lv)} (${lv}/${MAX_LEVEL})">
          <span>${SKILLS[id].icon} ${SKILLS[id].name}</span><b>${lv}</b></div>`;
      }
      sk += `</div>`;
      const gear = [d.weapon ? "🗡 " + d.weapon : null, d.armor ? "🛡 " + d.armor : null].filter(Boolean).join(" · ");
      return `
        <b>${d.name}</b> <span class="tag">${professionOf(d)}</span>${d.military ? ' <span class="tag" style="background:#6b2f2f">⚔ soldier</span>' : ""}<br/>
        Task: ${this.taskLabel(d)} <span class="tag">${d.activity}</span><br/>
        <div class="mini">Happiness <b>${Math.round(d.happiness != null ? d.happiness : 60)}</b> · HP ${Math.round(d.hp)} · Mood ${Math.round(d.mood)} · Hunger ${Math.round(d.hunger)} · Energy ${Math.round(d.energy)}</div>
        ${gear ? `<div class="mini">Equipped: ${gear}</div>` : ""}
        ${d.carrying ? "Carrying: " + ITEM_LABEL[d.carrying.kind] + "<br/>" : ""}
        <div class="thought">“${d.thought || "..."}”</div>
        <button class="mini-btn" id="insp-military">${d.military ? "Stand down" : "⚔ Enlist as soldier"}</button>
        <div class="mini2">Skills</div>${sk}`;
    }
    if (this.selectedTile) {
      const t = this.selectedTile;
      const tile = this.world.tiles[t.y][t.x];
      const parts = [`<b>Tile ${t.x}, ${t.y}</b>`];
      parts.push(`Terrain: <span class="tag">${tile.built === B.WALL ? "stone wall" : tile.built === B.DOOR ? "door" : tile.kind}</span>`);
      if (tile.ore) parts.push(`Ore: <span class="tag" style="color:${ORE_COLOR[tile.ore]}">${tile.ore}</span>`);
      if (tile.feature) parts.push(`Plant: <span class="tag">${tile.feature}</span>`);
      if (tile.furniture) parts.push(`Furniture: <span class="tag">${tile.furniture}</span>`);
      if (tile.workshop) {
        const list = RECIPES[tile.workshop] || [];
        parts.push(`Workshop: <span class="tag">${WORKSHOP_INFO[tile.workshop].icon} ${WORKSHOP_INFO[tile.workshop].name}</span>`);
        parts.push(`<div class="mini">Making: <b>${(list[tile.workshopRecipe] || {}).name || "—"}</b></div>`);
        parts.push(`<div class="recipe-row">` + list.map((r, i) =>
          `<button class="recipe-btn${i === (tile.workshopRecipe || 0) ? " on" : ""}" data-recipe="${i}">${r.name}</button>`).join("") + `</div>`);
      }
      if (tile.built === B.DOOR) {
        parts.push(`Door: <span class="tag">${tile.doorLocked ? "🔒 locked" : "🔓 unlocked"}</span>`);
        parts.push(`<button class="mini-btn" id="insp-door-lock">${tile.doorLocked ? "Unlock" : "Lock"} door</button>`);
      }
      if (tile.zone) parts.push(`Zone: <span class="tag">${tile.zone}</span>`);
      if (tile.designation) parts.push(`Designated: <span class="tag">${tile.designation}</span>`);
      if (tile.buildJob) parts.push(`Queued: <span class="tag">${tile.buildKind || "wall"}</span>`);
      if (tile.stockpile) parts.push(`<span class="tag">stockpile</span>`);
      if (tile.item) parts.push(`Item: <span class="tag">${ITEM_LABEL[tile.item.kind]}${tile.item.sub ? " (" + tile.item.sub + ")" : ""}</span>`);
      return parts.join("<br/>");
    }
    return "Click a tile or elf with the Inspect tool.";
  }

  renderSchedule(c) {
    let html = `<h2>Schedule &amp; Labors</h2>
      <div class="sched-note">☀️ Day 06:00–18:00 · 🌙 Night 18:00–06:00. Set what each elf does per shift, and which labors they'll take.</div>`;
    const opts = (sel) => ACTIVITIES.map(a =>
      `<option value="${a.id}"${a.id === sel ? " selected" : ""}>${a.icon} ${a.name}</option>`).join("");
    this.dwarves.forEach((d, i) => {
      html += `<div class="sched-dwarf" data-idx="${i}">
        <div class="sd-name"><span class="swatch" style="background:${d.color}"></span>${d.name}</div>
        <div class="sd-shifts">
          <label>☀️<select class="sd-day">${opts(d.schedule.day)}</select></label>
          <label>🌙<select class="sd-night">${opts(d.schedule.night)}</select></label>
        </div>
        <div class="sd-labors">
          ${LABORS.map(l => `<span class="chip${d.labors.has(l.id) ? " on" : ""}" data-labor="${l.id}" title="${l.name}">${l.icon}</span>`).join("")}
        </div>
      </div>`;
    });
    c.innerHTML = html;
    c.querySelectorAll(".sched-dwarf").forEach(row => {
      const d = this.dwarves[+row.dataset.idx];
      row.querySelector(".sd-day").onchange = (e) => { d.schedule.day = e.target.value; };
      row.querySelector(".sd-night").onchange = (e) => { d.schedule.night = e.target.value; };
      row.querySelectorAll(".chip").forEach(chip => {
        chip.onclick = () => {
          const id = chip.dataset.labor;
          if (d.labors.has(id)) d.labors.delete(id); else d.labors.add(id);
          chip.classList.toggle("on");
        };
      });
    });
  }

  renderRecords(c) {
    if (this._recordsLoaded) return;
    this._recordsLoaded = true;
    c.innerHTML = `<h2>Hall of Records</h2>
      <div class="sched-note">Persistent database: <b>${colonyDB ? colonyDB.describe() : "n/a"}</b></div>
      <div id="rec-body" class="menu-empty">Loading…</div>`;
    if (!colonyDB) return;
    Promise.all([colonyDB.getAllDwarves(), colonyDB.getEvents(30)]).then(([dwarves, events]) => {
      const body = document.getElementById("rec-body");
      if (!body) return;
      dwarves.sort((a, b) => (b.alive - a.alive) || 0);
      let html = "";
      for (const r of dwarves) {
        const top = r.skills ? Object.entries(r.skills).sort((a, b) => b[1] - a[1]).slice(0, 3)
          .filter(s => s[1] > 0).map(s => `${SKILLS[s[0]] ? SKILLS[s[0]].icon : ""}${s[1]}`).join(" ") : "";
        html += `<div class="rec-row ${r.alive ? "" : "dead"}">
          <span class="swatch" style="background:${r.color || "#888"}"></span>
          <span class="rec-main"><b>${r.name}</b> <span class="rec-prof">${r.profession || ""}</span>
          <div class="rec-sk">${top || "—"} ${r.alive ? "" : "· ✝ " + (r.cause || "lost")}</div></span>
        </div>`;
      }
      html += `<div class="mini2">Chronicle</div><div class="rec-events">`;
      for (const e of events) html += `<div>Day ${e.day}: ${e.text}</div>`;
      html += `</div>`;
      body.className = "";
      body.innerHTML = html || `<div class="menu-empty">No records yet.</div>`;
    }).catch(() => {
      const body = document.getElementById("rec-body");
      if (body) body.textContent = "Records unavailable.";
    });
  }

  taskLabel(d) {
    if (d.state === "fight") return "Fighting!";
    if (d.fleeing) return "Fleeing!";
    if (d.state === "sleep") return "Sleeping";
    if (!d.job) return d.state === "wander" ? "Strolling" : "Idle";
    const map = {
      dig: "Mining", chop: "Chopping", gather: "Gathering", build: "Building",
      haul: "Hauling", eat: "Eating", sleep: "Sleeping", train: "Training", socialize: "Socialising",
      craft: "Crafting", equip: "Arming up",
    };
    return map[d.job.type] || "Working";
  }
}

// Game creation is driven by the main menu — see js/menu.js.
