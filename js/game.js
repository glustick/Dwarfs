// ---- Game: main loop, state, UI --------------------------------------------

const DAY_LENGTH = 120;        // real seconds per in-game day at 1x
const HUNGER_RATE = 100 / 280; // reach 100 in ~280s of game time
const ENERGY_RATE = 100 / 300; // drop to 0 in ~300s awake (faster at night)
const SPEEDS = [0, 1, 2, 4];
const DAY_START = 0.25;        // 06:00
const DAY_END = 0.75;          // 18:00

class Game {
  // `saveData` restores a saved game; otherwise a fresh world is generated.
  constructor(saveData) {
    this.items = [];
    this.dwarves = [];
    this.stockpileTiles = [];
    this.bedTiles = [];
    this.diningTiles = [];
    this._nextItemId = 1;
    this.running = true;
    this.panelTab = "colony";  // colony | schedule | records

    this.selectedDwarf = null;
    this.selectedTile = null;
    this.hoverTile = null;

    this.reindexTimer = 0;
    this.growthTimer = 0;
    this.statTimer = 0;
    this.migrationTimer = DAY_LENGTH * 1.5;

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

    if (saveData) this.log(`Loaded save “${saveData.name || "game"}”.`, "good");
    else this.log("Your seven dwarves have arrived. Strike the earth!", "good");

    this.jobs.reindex();
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
      nextItemId: this._nextItemId,
      cam: { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom },
      time: this.time, speedIdx: this.speedIdx, paused: this.paused,
    };
  }

  serializeDwarf(d) {
    return {
      name: d.name, x: d.x, y: d.y, color: d.color,
      hunger: d.hunger, energy: d.energy, mood: d.mood, facing: d.facing,
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
        d.job = j;
      }
      return d;
    });

    this.cam = { x: data.cam.x, y: data.cam.y, zoom: data.cam.zoom };
    this.time = data.time;
    this.speedIdx = data.speedIdx != null ? data.speedIdx : 1;
    this.paused = !!data.paused;
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
    this.log(this.paused ? "Paused." : "Resumed.");
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

    // dwarves
    for (const d of this.dwarves) this.updateDwarf(d, dt);
    // remove starved
    if (this._toRemove && this._toRemove.length) {
      for (const d of this._toRemove) {
        const i = this.dwarves.indexOf(d);
        if (i >= 0) this.dwarves.splice(i, 1);
        if (this.selectedDwarf === d) this.selectedDwarf = null;
      }
      this._toRemove = null;
      this.updatePanel();
    }

    // migration
    this.migrationTimer -= dt;
    if (this.migrationTimer <= 0) {
      this.migrationTimer = DAY_LENGTH * 1.5;
      this.tryMigration();
    }

    // UI
    this.statTimer -= dt;
    if (this.statTimer <= 0) {
      this.updateStats();
      if (this.panelTab === "colony") this.updatePanel(); // live bars; other tabs refresh on demand
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
    const night = this.shift() === "night";

    // needs
    d.hunger = clamp(d.hunger + HUNGER_RATE * dt, 0, 100);
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
      this.log(`${d.name} is now ${skillTitle(d.skills[leveled].level)} ${SKILLS[leveled].name}.`, "good");
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
    this.log(`${d.name} has ${cause}.`, "bad");
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

  rebuildZones() {
    this.bedTiles = []; this.diningTiles = [];
    for (let y = 0; y < this.world.h; y++)
      for (let x = 0; x < this.world.w; x++) {
        const t = this.world.tiles[y][x];
        if (t.furniture === FURN.BED) this.bedTiles.push([x, y]);
        if (t.zone === ZONE.DINING) this.diningTiles.push([x, y]);
      }
  }

  tryMigration() {
    const food = this.countItems(ITEM.FOOD);
    if (this.dwarves.length >= 16) return;
    if (food < this.dwarves.length) { return; } // need surplus to attract migrants
    // A charismatic colony draws more migrants.
    let cha = 0;
    for (const d of this.dwarves) cha = Math.max(cha, d.skillLevel("charisma"));
    const n = randint(this.world.rng, 1, 3) + Math.floor(cha / 6);
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
    if (arrived) this.log(`${arrived} migrant${arrived > 1 ? "s have" : " has"} arrived seeking work.`, "good");
  }

  countItems(kind) {
    let n = 0;
    for (const it of this.items) if (it.kind === kind) n++;
    return n;
  }

  // ---- UI ----
  log(msg, cls = "") {
    const el = document.getElementById("log");
    const div = document.createElement("div");
    div.className = "entry " + cls;
    const f = this.dayFraction() * 24;
    const hh = String(Math.floor(f)).padStart(2, "0");
    const mm = String(Math.floor((f % 1) * 60)).padStart(2, "0");
    div.textContent = `[${hh}:${mm}] ${msg}`;
    el.appendChild(div);
    while (el.children.length > 60) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
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
    document.getElementById("stat-speed").textContent = this.paused ? "⏸ Paused" : `▶ ${this.speed}×`;
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
    else this.renderColony(c);
  }

  renderColony(c) {
    let html = `<h2>Colony · ${this.dwarves.length}</h2><div id="dwarf-list">`;
    this.dwarves.forEach((d, i) => {
      const hungerColor = d.hunger < 50 ? "#5cb85c" : d.hunger < 80 ? "#e0b158" : "#e08a6a";
      const energyColor = d.energy > 50 ? "#5c9be0" : d.energy > 20 ? "#e0b158" : "#e08a6a";
      const sel = this.selectedDwarf === d ? " sel" : "";
      html += `
        <div class="dwarf-row${sel}" data-idx="${i}">
          <span class="swatch" style="background:${d.color}"></span>
          <span class="dname">${d.name}
            <div class="dtask">${professionOf(d)} · ${this.taskLabel(d)}</div>
            <div class="bar" title="Hunger"><i style="width:${100 - d.hunger}%;background:${hungerColor}"></i></div>
            <div class="bar" title="Energy"><i style="width:${d.energy}%;background:${energyColor}"></i></div>
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
      return `
        <b>${d.name}</b> <span class="tag">${professionOf(d)}</span><br/>
        Task: ${this.taskLabel(d)} <span class="tag">${d.activity}</span><br/>
        <div class="mini">Mood ${Math.round(d.mood)} · Hunger ${Math.round(d.hunger)} · Energy ${Math.round(d.energy)}</div>
        ${d.carrying ? "Carrying: " + ITEM_LABEL[d.carrying.kind] + "<br/>" : ""}
        <div class="thought">“${d.thought || "..."}”</div>
        <div class="mini2">Skills</div>${sk}`;
    }
    if (this.selectedTile) {
      const t = this.selectedTile;
      const tile = this.world.tiles[t.y][t.x];
      const parts = [`<b>Tile ${t.x}, ${t.y}</b>`];
      parts.push(`Terrain: <span class="tag">${tile.built === B.WALL ? "stone wall" : tile.kind}</span>`);
      if (tile.ore) parts.push(`Ore: <span class="tag" style="color:${ORE_COLOR[tile.ore]}">${tile.ore}</span>`);
      if (tile.feature) parts.push(`Plant: <span class="tag">${tile.feature}</span>`);
      if (tile.furniture) parts.push(`Furniture: <span class="tag">${tile.furniture}</span>`);
      if (tile.zone) parts.push(`Zone: <span class="tag">${tile.zone}</span>`);
      if (tile.designation) parts.push(`Designated: <span class="tag">${tile.designation}</span>`);
      if (tile.buildJob) parts.push(`Queued: <span class="tag">${tile.buildKind || "wall"}</span>`);
      if (tile.stockpile) parts.push(`<span class="tag">stockpile</span>`);
      if (tile.item) parts.push(`Item: <span class="tag">${ITEM_LABEL[tile.item.kind]}${tile.item.sub ? " (" + tile.item.sub + ")" : ""}</span>`);
      return parts.join("<br/>");
    }
    return "Click a tile or dwarf with the Inspect tool.";
  }

  renderSchedule(c) {
    let html = `<h2>Schedule &amp; Labors</h2>
      <div class="sched-note">☀️ Day 06:00–18:00 · 🌙 Night 18:00–06:00. Set what each dwarf does per shift, and which labors they'll take.</div>`;
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
    if (d.state === "sleep") return "Sleeping";
    if (!d.job) return d.state === "wander" ? "Strolling" : "Idle";
    const map = {
      dig: "Mining", chop: "Chopping", gather: "Gathering", build: "Building",
      haul: "Hauling", eat: "Eating", sleep: "Sleeping", train: "Training", socialize: "Socialising",
    };
    return map[d.job.type] || "Working";
  }
}

// Game creation is driven by the main menu — see js/menu.js.
