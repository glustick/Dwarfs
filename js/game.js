// ---- Game: main loop, state, UI --------------------------------------------

const DAY_LENGTH = 120;        // real seconds per in-game day at 1x
const HUNGER_RATE = 100 / 280; // reach 100 in ~280s of game time
const THIRST_RATE = 100 / 240; // reach 100 in ~240s of game time — a bit thirstier than hungry
const ENERGY_RATE = 100 / 300; // drop to 0 in ~300s awake (faster at night)
const SPEEDS = [0, 1, 2, 4];
const DAY_START = 0.25;        // 06:00
const DAY_END = 0.75;          // 18:00

// Seasons affect crop growth in Farm zones. A year is 4 * SEASON_DAYS days.
const SEASON_DAYS = 15;
const SEASONS = [
  { name: "Spring", icon: "🌱", growth: 1.3 },
  { name: "Summer", icon: "🌻", growth: 1.6 },
  { name: "Autumn", icon: "🍂", growth: 1.0 },
  { name: "Winter", icon: "❄️", growth: 0.2 },
];

// ---- Weather: a surface-only overlay on top of the season, like the season
// itself it never reaches underground, so digging in stays the safe bet.
const WEATHER_TYPES = {
  clear:    { name: "Clear",    icon: "☀️" },
  rain:     { name: "Rain",     icon: "🌧️" },
  storm:    { name: "Storm",    icon: "⛈️" },
  fog:      { name: "Fog",      icon: "🌫️" },
  heatwave: { name: "Heatwave", icon: "🥵" },
  blizzard: { name: "Blizzard", icon: "🌨️" },
};
// Weighted odds per season index (0 spring, 1 summer, 2 autumn, 3 winter).
const WEATHER_ODDS = [
  [["clear", 50], ["rain", 35], ["storm", 15]],
  [["clear", 55], ["heatwave", 25], ["rain", 20]],
  [["clear", 45], ["rain", 30], ["storm", 15], ["fog", 10]],
  [["clear", 40], ["blizzard", 35], ["fog", 25]],
];

// Event chronicle categories (for the filterable Log panel).
// Icons and names for the stock panel: one row per item type, with the weapon
// subtypes spelled out so the arms ladder is legible at a glance.
const STOCK_SUB_ICONS = {
  club: "🪵", knife: "🔪", stone_spear: "🔱", shortbow: "🏹", bow: "🎯",
  rifle: "🔫", laser_blade: "⚡", laser_rifle: "💫",
};
const STOCK_SUB_LABELS = {
  iron: "Iron", gold: "Gold", coal: "Coal",
  club: "Wooden club", knife: "Stone knife", stone_spear: "Stone spear",
  shortbow: "Short bow", bow: "Longbow", rifle: "Iron rifle",
  laser_blade: "Laser blade", laser_rifle: "Laser rifle",
  cloak: "Cloth cloak", shield: "Shield", mail: "Mail", reinforced_mail: "Reinforced mail",
};
// How many shots one stored ammunition item refills (see RANGED_WEAPONS.per).
const AMMO_SHOTS = { arrow: 5, bullet: 10, cell: 5 };

// Human labels for the build tools/zones a technology can reveal, so the
// Research tab can say what a tech is actually for.
const TECH_UNLOCK_LABELS = {
  farm: "Farm zone", study: "Study zone", hospital: "Hospital zone", quarantine: "Quarantine zone",
  table: "Table", conduit: "Arcane Conduit", generator: "Essence Well", icebox: "Frost Chamber",
  lamp: "Aether Lamp", lantern: "Elven Lantern", crafting: "Crafting Bench",
  weapons: "Weapons Bench", clothing: "Clothing Bench", electronics: "Electronics Bench",
};

const LOG_CATS = {
  order:  { name: "Orders",   icon: "📋" },
  labor:  { name: "Labor",    icon: "⚒️" },
  build:  { name: "Building",  icon: "🏗️" },
  craft:  { name: "Crafting",  icon: "🔨" },
  combat: { name: "Combat",    icon: "⚔️" },
  colony: { name: "Colony",    icon: "🧝" },
  skill:  { name: "Skills",    icon: "⭐" },
  faction: { name: "Factions", icon: "🤝" },
  story:  { name: "Events",    icon: "🎭" },
  system: { name: "System",    icon: "💾" },
};
const MAX_EVENTS = 4000;       // in-memory chronicle cap
const SAVED_EVENTS = 600;      // how many recent events persist in a save

// ---- The outbreak: infection clock & dread labels ----
const INFECTION_TIME = 90;     // game-seconds an untreated bite takes to turn
const OUTBREAK_LABELS = ["Calm", "Stirring", "Restless", "Ravenous", "Overrun"];

// ---- The outbreak, phase 2: vampirism — hidden until a Doctor checkup
// exposes it (or it's never caught and simply runs its course).
const VAMPIRE_TIME = 150;        // longer than INFECTION_TIME — nothing but a checkup can intervene while hidden
const CHECKUP_COOLDOWN = 100;    // seconds before the same elf is checkup-eligible again
const CHECKUP_REVEAL_BASE = 0.4; // base reveal chance on an uncovered checkup

// ---- defensive structures ----
const WATCHTOWER_ATK_MULT = 1.3;   // damage bonus for a soldier fighting from a watchtower tile
const WATCHTOWER_DEF_MULT = 0.75;  // damage taken multiplier while standing on one (lower = safer)
const TRAP_DAMAGE = 18;            // flat damage dealt to a hostile that triggers a trap
const TRAP_COOLDOWN = 8;           // seconds before a triggered trap can fire again

// ---- Essence Craft: an Essence Well powers a network of Arcane Conduits;
// a powered Frost Chamber slows spoilage for food resting nearby.
const FOOD_SPOIL_TIME = 600;     // game-seconds for an unchilled food item to fully spoil
const ESSENCE_CHILL_RADIUS = 4;  // tiles (Manhattan) a powered Frost Chamber keeps cool

class Game {
  // `saveData` restores a saved game; otherwise a fresh world is generated.
  constructor(saveData, settings) {
    // Colony setup (difficulty + map size), chosen on the New Game screen. A
    // restored save carries its own and overwrites these — see restore().
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settings || {});
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
    this.discoveredArtifacts = [];
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
    this.quarantineTiles = [];
    this.watchtowerTiles = [];
    this.trapTiles = [];
    this.tableCount = 0;

    this.selectedDwarf = null;
    this.selectedAnimal = null;
    this.selectedTile = null;
    this.selectedSquad = []; // multi-selected soldiers (manual military control)
    this.hoverTile = null;

    // ---- weather (surface-only, layered on top of the season) ----
    this.weather = "clear";
    this.weatherTimer = 20;

    // ---- wildlife & tamed companions ----
    this.animals = [];
    this.animalTimer = 20;

    // ---- lifetime production counters & population history (this colony) ----
    this.stats = { mined: 0, chopped: 0, gathered: 0, crafted: 0, built: 0, tamed: 0 };
    this.popHistory = [];
    this._lastPopDay = 0;

    // ---- Essence Craft: power network & food spoilage ----
    this.essenceTimer = 1;
    this.chilledTiles = new Set();

    this.reindexTimer = 0;
    this.growthTimer = 0;
    this.statTimer = 0;
    this.relTimer = 0;
    this.rooms = [];          // graded Bedroom/Dining rooms (see computeRooms)
    this.roomAt = new Map();  // "x,y,z" of each room tile -> its room object
    this.roomTimer = 5;       // walls/floors finishing also change quality — rescore periodically
    this.roofed = new Set();  // "x,y,z" tiles under a roof (enclosed, or underground)
    this.lit = new Map();     // "x,y,z" -> brightness 0..1 from light sources
    this.lightSources = [];   // [{x,y,z,furn,powered}] for rendering glows
    this.viewZ = 0; // which floor the camera/UI is currently showing
    this.autoPause = (() => { try { return localStorage.getItem("ee_autopause") === "1"; } catch (e) { return false; } })();
    this.story = makeStoryState();
    // Collapsed state per research tier, remembered like the theme choice.
    this.techTierOpen = {};
    try {
      const saved = localStorage.getItem("ee_tech_tiers");
      if (saved) this.techTierOpen = JSON.parse(saved) || {};
    } catch (e) { this.techTierOpen = {}; }
    this.raidTimer = DAY_LENGTH * 3 * this.diff().raidDelay;  // first raid around day 4 (scaled by difficulty)
    this.raidCount = 0;
    this.tradeTimer = DAY_LENGTH * 2; // first caravan around day 2-3
    this.factionRaidTimer = DAY_LENGTH * 4; // first faction raid (only if a neighbour turns hostile)
    this.factionRepTimer = 5;
    this._raidersEscaped = false;
    this.initFactions();
    this.combatFx = [];               // transient hit sparks {x,y,t,bad}
    this.projectileFx = [];           // transient arrow/bile streaks {x1,y1,x2,y2,z,t,bad}

    // ---- Z-levels phase 2: cave-ins & flooding (underground only) ----
    // Fixed initial value like raidTimer above — world.rng() isn't available
    // yet this early in the constructor; re-rolled randomly after it first fires.
    this.caveInTimer = DAY_LENGTH * 2;
    this.floodTimer = 2;

    // ---- milestones: persistent achievements, across every colony ----
    this.milestoneFlags = { cured: false, turned: false, traded: false, tamed: false, vampireExposed: false, vampireCured: false, vampireTurned: false };
    this.unlockedMilestones = new Set();
    this._milestonesLoaded = false;
    this.milestoneTimer = 0;
    if (colonyDB) {
      colonyDB.getMilestones()
        .then(list => { for (const r of list) this.unlockedMilestones.add(r.id); this._milestonesLoaded = true; })
        .catch(() => { this._milestonesLoaded = true; });
    } else this._milestonesLoaded = true;

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
    this.input.undoStack = [];
    this.input.updateUndoButton();

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
    const size = mapSizeById(this.settings.mapSize);
    this.world = new World(size.w, size.h, (Math.floor(performance.now()) ^ 0x9e3779b9) >>> 0);
    this.cam = { x: this.world.spawnX, y: this.world.spawnY, zoom: 1.1 };
    this.time = 0.25 * DAY_LENGTH; // start at 06:00
    this.speedIdx = 1;
    this.paused = false;
    this.spawnStartingDwarves();
  }

  // ---- serialization ----
  serialize() {
    const w = this.world;
    const levels = {};
    for (const [z, tiles] of w.levels) levels[z] = this.serializeLevelTiles(tiles);
    return {
      version: SAVE_VERSION,
      release: RELEASE_VERSION, build: BUILD_NUMBER, // informational: which release/build made this save
      savedAt: Date.now(),
      day: Math.floor(this.time / DAY_LENGTH) + 1,
      pop: this.dwarves.length,
      settings: this.settings,
      world: { w: w.w, h: w.h, seed: w.seed, spawnX: w.spawnX, spawnY: w.spawnY, minZ: w.minZ, levels },
      items: this.items.map(it => ({
        id: it.id, kind: it.kind, sub: it.sub, x: it.x, y: it.y, z: it.z || 0,
        hauled: it.hauled ? 1 : 0, stored: it.stored ? 1 : 0,
        fresh: it.freshness != null ? Math.round(it.freshness * 100) : 100,
        name: it.name || null, color: it.color || null, diedDay: it.diedDay || 0,
      })),
      dwarves: this.dwarves.map(d => this.serializeDwarf(d)),
      enemies: this.enemies.map(e => ({
        kind: e.kind, x: e.x, y: e.y, z: e.z || 0, hp: e.hp, facing: e.facing, facingV: e.facingV,
        factionId: e.factionId || null, motive: e.motive || null, loot: e.loot || 0,
        looted: e.looted || null, color: e.color || null, name: e.name || null,
      })),
      raidTimer: this.raidTimer, raidCount: this.raidCount, tradeTimer: this.tradeTimer,
      factionRaidTimer: this.factionRaidTimer, factions: this.factions,
      story: this.story,
      caveInTimer: this.caveInTimer, floodTimer: this.floodTimer,
      research: this.research, tech: this.tech,
      discoveredArtifacts: this.discoveredArtifacts,
      events: this.events.slice(-SAVED_EVENTS),
      nextItemId: this._nextItemId,
      cam: { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom },
      viewZ: this.viewZ,
      time: this.time, speedIdx: this.speedIdx, paused: this.paused,
      weather: this.weather, weatherTimer: this.weatherTimer,
      animals: this.animals.map(a => ({
        kind: a.kind, x: a.x, y: a.y, z: a.z || 0, tamed: a.tamed ? 1 : 0, ownerId: a.ownerId,
      })),
      stats: this.stats,
      popHistory: this.popHistory,
    };
  }

  // Flatten one level's Tile[][] into the per-tile array format shared with
  // world.js's loadLevelTiles.
  serializeLevelTiles(tiles) {
    const w = this.world;
    const out = new Array(w.w * w.h);
    let i = 0;
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = tiles[y][x];
        out[i++] = [
          t.kind, t.feature, t.ore, Math.round(t.growth * 100) / 100,
          t.designation, t.built,
          t.buildJob ? 1 : 0, t.buildKind || 0, t.stockpile ? 1 : 0,
          t.reserved ? 1 : 0, t.item ? t.item.id : 0,
          t.zone || 0, t.furniture || 0,
          t.workshop || 0, t.workshopRecipe || 0,
          t.doorLocked ? 1 : 0,
          t.bedOccupants && t.bedOccupants.length ? t.bedOccupants.join(",") : 0,
          t.stockpileFilter || 0,
          t.conduit ? 1 : 0,
          t.buildMaterial || 0,
          t.aquifer ? 1 : 0,
          t.flooded ? 1 : 0,
          Math.round(t.trapCooldown) || 0,
          t.workshopTarget || 0, t.workshopProduced || 0,
          t.grave || 0,
        ];
      }
    }
    return out;
  }

  serializeDwarf(d) {
    return {
      name: d.name, x: d.x, y: d.y, z: d.z || 0, color: d.color,
      hunger: d.hunger, thirst: d.thirst, energy: d.energy, mood: d.mood, facing: d.facing, facingV: d.facingV,
      hp: d.hp, maxhp: d.maxhp, military: d.military ? 1 : 0, manualOrder: d.manualOrder || null,
      wounded: d.wounded ? 1 : 0, beingTreated: d.beingTreated ? 1 : 0,
      infected: d.infected ? 1 : 0, infectionTimer: d.infectionTimer || 0,
      vampiric: d.vampiric ? 1 : 0, vampireTimer: d.vampireTimer || 0, vampireExposed: d.vampireExposed ? 1 : 0,
      checkupCooldown: d.checkupCooldown || 0, beingInspected: d.beingInspected ? 1 : 0,
      weapon: d.weapon, armor: d.armor, quiver: d.quiver,
      inventory: d.inventory || [],
      traits: d.traits || [],
      state: d.state, thought: d.thought, workTimer: d.workTimer,
      idleWander: d.idleWander, bob: d.bob, starve: d.starve || 0, parch: d.parch || 0,
      carrying: d.carrying ? d.carrying.id : 0,
      relationships: d.relationships, partnerId: d.partnerId || null,
      dbId: d.dbId, skills: d.skills,
      labors: [...d.labors], schedule: d.schedule, activity: d.activity,
      laborPriority: d.laborPriority,
      bed: d.bed,
      path: d.path, pathIdx: d.pathIdx,
      job: d.job ? {
        type: d.job.type, x: d.job.x, y: d.job.y, z: d.job.z || 0, phase: d.job.phase,
        item: d.job.item ? d.job.item.id : 0,
        dest: d.job.dest, dining: d.job.dining, buildKind: d.job.buildKind || null,
        slot: d.job.slot || null,
        extraMaterials: (d.job.extraMaterials || []).map(item => item.id),
      } : null,
    };
  }

  restore(data) {
    // A save keeps the difficulty it was founded under.
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings || {});
    const wd = data.world;
    this.world = new World(wd.w, wd.h, wd.seed, false);
    this.world.spawnX = wd.spawnX; this.world.spawnY = wd.spawnY;

    // rebuild items first so tiles/dwarves can reference them by id
    const byId = new Map();
    this.items = data.items.map(o => {
      const it = new Item(o.kind, o.x, o.y, o.sub, o.z || 0);
      it.id = o.id; it.hauled = !!o.hauled; it.stored = !!o.stored;
      it.freshness = o.fresh != null ? o.fresh / 100 : 1;
      it.name = o.name || null; it.color = o.color || null; it.diedDay = o.diedDay || 0;
      byId.set(o.id, it);
      return it;
    });
    this._nextItemId = data.nextItemId ||
      (this.items.reduce((m, it) => Math.max(m, it.id), 0) + 1);

    if (wd.levels) {
      for (const k of Object.keys(wd.levels)) this.world.loadLevelTiles(parseInt(k, 10), wd.levels[k], byId);
    } else {
      // Pre-Z-levels save: a single flat `tiles` array is level 0.
      this.world.loadTiles(wd.tiles, byId);
    }
    if (wd.minZ != null && wd.minZ < this.world.minZ) this.world.minZ = wd.minZ;

    this.dwarves = data.dwarves.map(o => {
      const d = new Dwarf(o.name, o.x, o.y, o.color, o.skills);
      d.z = o.z || 0;
      d.hunger = o.hunger; d.thirst = o.thirst != null ? o.thirst : 0; d.mood = o.mood; d.facing = o.facing; d.facingV = o.facingV || 1;
      d.energy = o.energy != null ? o.energy : 100;
      d.hp = o.hp != null ? o.hp : 100; d.maxhp = o.maxhp || 100;
      d.military = !!o.military; d.weapon = o.weapon || null; d.armor = o.armor || null; d.quiver = o.quiver || 0;
      d.inventory = Array.isArray(o.inventory) ? o.inventory : [];
      d.traits = Array.isArray(o.traits) ? o.traits : rollTraits(Math.random);
      d.manualOrder = o.manualOrder || null;
      d.wounded = !!o.wounded; d.beingTreated = !!o.beingTreated;
      d.infected = !!o.infected; d.infectionTimer = o.infectionTimer || 0;
      d.vampiric = !!o.vampiric; d.vampireTimer = o.vampireTimer || 0; d.vampireExposed = !!o.vampireExposed;
      d.checkupCooldown = o.checkupCooldown || 0; d.beingInspected = !!o.beingInspected;
      d.relationships = o.relationships || {}; d.partnerId = o.partnerId || null;
      d.state = o.state; d.thought = o.thought; d.workTimer = o.workTimer;
      d.idleWander = o.idleWander || 0; d.bob = o.bob || 0; d.starve = o.starve || 0; d.parch = o.parch || 0;
      d.carrying = o.carrying ? byId.get(o.carrying) : null;
      if (o.dbId) d.dbId = o.dbId;
      if (o.labors) d.labors = new Set(o.labors);
      d.laborPriority = Object.assign(Object.fromEntries(LABORS.map(l => [l.id, 3])), o.laborPriority || {});
      if (o.schedule) d.schedule = o.schedule;
      d.activity = o.activity || "work";
      d.bed = o.bed || null;
      d.path = o.path || null; d.pathIdx = o.pathIdx || 0;
      if (o.job) {
        const j = new Job(o.job.type, o.job.x, o.job.y, o.job.z || 0);
        j.phase = o.job.phase;
        j.item = o.job.item ? byId.get(o.job.item) : null;
        j.dest = o.job.dest; j.dining = o.job.dining; j.buildKind = o.job.buildKind;
        j.slot = o.job.slot || null;
        j.extraMaterials = (o.job.extraMaterials || []).map(id => byId.get(id)).filter(Boolean);
        d.job = j;
      }
      return d;
    });

    this.enemies = (data.enemies || []).map(o => {
      const e = new Enemy(o.kind, o.x, o.y, o.z || 0);
      if (o.hp != null) e.hp = o.hp;
      e.facing = o.facing || 1;
      e.facingV = o.facingV || 1;
      e.factionId = o.factionId || null; e.motive = o.motive || null;
      e.loot = o.loot || 0; e.looted = o.looted || null;
      if (o.color) e.color = o.color;
      if (o.name) e.name = o.name;
      return e;
    });
    this.raidTimer = data.raidTimer != null ? data.raidTimer : DAY_LENGTH * 3;
    this.raidCount = data.raidCount || 0;
    this.tradeTimer = data.tradeTimer != null ? data.tradeTimer : DAY_LENGTH * 2;
    this.factionRaidTimer = data.factionRaidTimer != null ? data.factionRaidTimer : DAY_LENGTH * 4;
    this.initFactions();
    if (data.factions) for (const id in data.factions) {
      if (this.factions[id] && typeof data.factions[id].rep === "number") this.factions[id].rep = data.factions[id].rep;
    }
    this.story = Object.assign(makeStoryState(), data.story || {});
    this.story.cooldown = Object.assign({}, (data.story && data.story.cooldown) || {});
    this.caveInTimer = data.caveInTimer != null ? data.caveInTimer : DAY_LENGTH * 2;
    this.floodTimer = data.floodTimer != null ? data.floodTimer : 2;
    this.events = Array.isArray(data.events) ? data.events : [];
    this._eventSeq = this.events.reduce((m, e) => Math.max(m, e.seq || 0), 0) + 1;
    this.research = data.research || 0;
    this.tech = data.tech || {};
    this.discoveredArtifacts = Array.isArray(data.discoveredArtifacts) ? data.discoveredArtifacts : [];

    this.cam = { x: data.cam.x, y: data.cam.y, zoom: data.cam.zoom };
    this.viewZ = data.viewZ || 0;
    this.time = data.time;
    this.speedIdx = data.speedIdx != null ? data.speedIdx : 1;
    this.weather = data.weather || "clear";
    this.weatherTimer = data.weatherTimer != null ? data.weatherTimer : 30;
    this.animals = (data.animals || []).map(o => {
      const a = new Animal(o.kind, o.x, o.y, o.z || 0);
      a.tamed = !!o.tamed; a.ownerId = o.ownerId || null;
      return a;
    });
    this.stats = Object.assign({ mined: 0, chopped: 0, gathered: 0, crafted: 0, built: 0, tamed: 0 }, data.stats || {});
    this.popHistory = Array.isArray(data.popHistory) ? data.popHistory : [];
    this._lastPopDay = this.popHistory.length ? this.popHistory[this.popHistory.length - 1].day : 0;
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
        d.traits = rollTraits(rng);
        this.dwarves.push(d);
        this.flushDwarfToDB(d);
        if (colonyDB) colonyDB.logEvent(`${d.name} (${professionOf(d)}) founded the colony`, 1);
        placed++;
      }
    }
    // Seed a bit of starting stone/wood/food/water so the colony has a grace
    // period to get a Well built before anyone goes hungry or thirsty.
    // A starting armory: enough to put a weapon in several elves' hands on day
    // one, with no research at all. Short *and* long reach, because the outbreak
    // arrives around Day 4 and an unarmed elf loses to a single zombie.
    const kit = [
      [ITEM.WEAPON, "knife"], [ITEM.WEAPON, "knife"], [ITEM.WEAPON, "knife"],
      [ITEM.WEAPON, "stone_spear"], [ITEM.WEAPON, "stone_spear"],
      [ITEM.WEAPON, "shortbow"], [ITEM.WEAPON, "shortbow"],
      [ITEM.ARROW], [ITEM.ARROW], [ITEM.ARROW],
      [ITEM.ARMOR, "cloak"],
    ];
    for (const [kind, subId] of kit) {
      this.jobs.spawnItem(kind, this.world.spawnX + randint(rng, -3, 3), this.world.spawnY + randint(rng, -3, 3), subId || null, 0);
    }
    const bonus = this.diff().startBonus;
    for (let i = 0; i < Math.round(6 * bonus); i++) this.jobs.spawnItem(ITEM.STONE, this.world.spawnX + randint(rng, -3, 3), this.world.spawnY + randint(rng, -3, 3));
    for (let i = 0; i < Math.round(10 * bonus); i++) this.jobs.spawnItem(ITEM.FOOD, this.world.spawnX + randint(rng, -3, 3), this.world.spawnY + randint(rng, -3, 3));
    for (let i = 0; i < Math.round(10 * bonus); i++) this.jobs.spawnItem(ITEM.WATER, this.world.spawnX + randint(rng, -3, 3), this.world.spawnY + randint(rng, -3, 3));
  }

  get speed() { return SPEEDS[this.speedIdx]; }
  togglePause() {
    this.paused = !this.paused;
    this.updateStats();
    this.log(this.paused ? "Paused." : "Resumed.", "", "system");
  }

  // ---- auto-pause on crises (raid, death, starvation/dehydration) ----
  toggleAutoPause() {
    this.autoPause = !this.autoPause;
    try { localStorage.setItem("ee_autopause", this.autoPause ? "1" : "0"); } catch (e) {}
    this.updateStats();
  }
  triggerAutoPause(reason) {
    if (!this.autoPause || this.paused) return;
    this.paused = true;
    this.updateStats();
    if (window.App) window.App.toast(`⏸ Auto-paused: ${reason}`);
  }
  changeSpeed(dir) {
    this.speedIdx = clamp(this.speedIdx + dir, 1, SPEEDS.length - 1);
    this.paused = false;
    this.updateStats();
  }

  // ---- z-levels (floors) ----
  // Switches which floor the camera/UI/tools are showing. Clamped to floors
  // that actually exist (level 0, the surface, down to however deep a
  // stairwell has been dug).
  setViewZ(z) {
    const w = this.world;
    z = clamp(Math.round(z), w.minZ, 0);
    if (!w.levels.has(z) || z === this.viewZ) return;
    this.viewZ = z;
    this.selectedTile = null;
    this.selectedAnimal = null;
    this.updateStats();
  }

  dayFraction() { return (this.time % DAY_LENGTH) / DAY_LENGTH; }

  rebuildStockpiles() {
    this.stockpileTiles = [];
    const w = this.world;
    for (let z = 0; z >= w.minZ; z--) {
      const tiles = w.getLevel(z);
      if (!tiles) continue;
      for (let y = 0; y < w.h; y++)
        for (let x = 0; x < w.w; x++)
          if (tiles[y][x].stockpile) this.stockpileTiles.push([x, y, z]);
    }
  }

  // Set an item-type filter across a whole contiguous stockpile (flood-fill
  // over 4-connected stockpile tiles from x,y on level z), not just the one
  // clicked tile.
  setStockpileFilter(x, y, z, filter) {
    const w = this.world;
    const tiles = w.getLevel(z);
    const start = tiles && tiles[y] && tiles[y][x];
    if (!start || !start.stockpile) return;
    const seen = new Set();
    const key = (px, py) => py * w.w + px;
    const stack = [[x, y]];
    seen.add(key(x, y));
    while (stack.length) {
      const [cx, cy] = stack.pop();
      tiles[cy][cx].stockpileFilter = filter;
      for (const [dx, dy] of NEIGHBORS4) {
        const nx = cx + dx, ny = cy + dy;
        if (!w.inBounds(nx, ny)) continue;
        const k = key(nx, ny);
        if (seen.has(k)) continue;
        if (!tiles[ny][nx].stockpile) continue;
        seen.add(k);
        stack.push([nx, ny]);
      }
    }
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

    // population history: one sample per in-game day, for the Stats tab
    const today = Math.floor(this.time / DAY_LENGTH) + 1;
    if (today !== this._lastPopDay) {
      this._lastPopDay = today;
      this.popHistory.push({ day: today, pop: this.dwarves.length });
      if (this.popHistory.length > 200) this.popHistory.shift();
    }

    // room quality: zones trigger an immediate rescore via rebuildZones, but
    // a wall or floor finishing construction also changes the score. Roofs
    // and light shift on the same events for the same reason.
    this.roomTimer -= dt;
    if (this.roomTimer <= 0) {
      this.roomTimer = 5;
      this.computeRooms();
      this.computeLightAndRoof();
    }

    // weather: rolls a new condition periodically, weighted by the season
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = randint(this.world.rng, 45, 100);
      const next = this.rollWeather();
      if (next !== this.weather) {
        this.weather = next;
        const info = WEATHER_TYPES[next];
        this.log(`${info.icon} The weather turns to ${info.name.toLowerCase()}.`, "", "colony");
        if (window.App && next !== "clear") window.App.toast(`${info.icon} ${info.name}`);
      }
    }

    // wildlife: the odd wild animal wanders in; tamed ones roam near their owner
    this.animalTimer -= dt;
    if (this.animalTimer <= 0) { this.animalTimer = randint(this.world.rng, 50, 90); this.trySpawnAnimal(); }
    if (this.animals.length) this.updateAnimals(dt);

    // Essence Craft: recompute the power network and spoil unchilled food, ~once/sec
    this.essenceTimer -= dt;
    if (this.essenceTimer <= 0) {
      this.essenceTimer = 1;
      this.updateEssenceNetwork();
      this.decayFood();
    }

    // periodic reindex of designations
    this.reindexTimer -= dt;
    if (this.reindexTimer <= 0) { this.jobs.reindex(); this.reindexTimer = 0.4; }

    // plant growth
    this.growthTimer -= dt;
    if (this.growthTimer <= 0) { this.world.tickGrowth(this.world.rng); this.growthTimer = 0.5; }

    // aquifer floods slowly spread into adjacent mined-out chambers
    this.floodTimer -= dt;
    if (this.floodTimer <= 0) { this.world.tickFlood(this.world.rng); this.floodTimer = 2; }

    // trap cooldowns tick down regardless of whether a raider is nearby
    if (this.trapTiles.length) {
      for (const [tx, ty, tz] of this.trapTiles) {
        const t = this.world.get(tx, ty, tz);
        if (t && t.trapCooldown > 0) t.trapCooldown = Math.max(0, t.trapCooldown - dt);
      }
    }

    // relationships drift between nearby elves
    this.relTimer -= dt;
    if (this.relTimer <= 0) { this.updateRelationships(); this.relTimer = 4; }

    // research accrues over time
    this.research += this.researchRate() * dt;

    // farm zones: planted crops mature over time (rate depends on the season);
    // elves with the Farming labor handle the actual plant/harvest jobs.
    if (this.farmTiles.length) {
      this.farmTimer -= dt;
      if (this.farmTimer <= 0) {
        this.farmTimer = 1;
        const weatherMult = this.weather === "rain" ? 1.2 : (this.weather === "blizzard" || this.weather === "heatwave") ? 0.75 : 1;
        const mult = this.season().growth * weatherMult;
        for (const [fx, fy, fz] of this.farmTiles) {
          const t = this.world.get(fx, fy, fz || 0);
          if (t && t.feature === F.CROP && t.growth < 1) t.growth = Math.min(1, t.growth + mult / 120);
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
    for (let i = this.projectileFx.length - 1; i >= 0; i--) {
      this.projectileFx[i].t -= dt;
      if (this.projectileFx[i].t <= 0) this.projectileFx.splice(i, 1);
    }

    // raids
    this.raidTimer -= dt;
    if (this.raidTimer <= 0) {
      const day = Math.floor(this.time / DAY_LENGTH) + 1;
      this.raidTimer = randint(this.world.rng, DAY_LENGTH * 2, DAY_LENGTH * 3) * this.diff().raidDelay;
      if (day >= 3) this.spawnRaid();
    }

    // cave-ins: only relevant once something's actually been dug out
    if (this.world.minZ < 0) {
      this.caveInTimer -= dt;
      if (this.caveInTimer <= 0) {
        this.caveInTimer = randint(this.world.rng, DAY_LENGTH * 1.5, DAY_LENGTH * 3);
        this.tryCaveIn();
      }
    }

    // migration is curated by the Storyteller now (see js/storyteller.js) —
    // a "migrant wave" incident calls tryMigration(true) in its place.

    // trading caravans
    this.tradeTimer -= dt;
    if (this.tradeTimer <= 0) {
      this.tradeTimer = randint(this.world.rng, DAY_LENGTH * 2, DAY_LENGTH * 3.5);
      this.trySpawnCaravan();
    }
    if (this.caravans.length) this.updateCaravans(dt);

    // factions: reputation heals slowly toward neutral, and a neighbour pushed
    // far enough into hostility may come raiding (on its own clock, separate
    // from the outbreak).
    this.factionRepTimer -= dt;
    if (this.factionRepTimer <= 0) {
      this.factionRepTimer = 5;
      for (const f of FACTIONS) {
        const st = this.factions[f.id]; if (!st) continue;
        if (st.rep > 0) st.rep = Math.max(0, st.rep - 0.08);
        else if (st.rep < 0) st.rep = Math.min(0, st.rep + 0.08);
      }
    }
    this.factionRaidTimer -= dt;
    if (this.factionRaidTimer <= 0) {
      this.factionRaidTimer = randint(this.world.rng, DAY_LENGTH * 3, DAY_LENGTH * 5);
      if (Math.floor(this.time / DAY_LENGTH) + 1 >= 4) this.tryFactionRaid();
    }

    // The Storyteller paces everything else — migrants, merchants, disasters
    // and windfalls — from a weighted incident pool (see js/storyteller.js).
    storyTick(this, dt);

    // milestones
    this.milestoneTimer -= dt;
    if (this.milestoneTimer <= 0) { this.checkMilestones(); this.milestoneTimer = 2; }

    // UI
    this.statTimer -= dt;
    if (this.statTimer <= 0) {
      this.updateStats();
      if (this.panelTab === "colony" || this.panelTab === "research") this.updatePanel();
      this.statTimer = 0.5;
    }
  }

  shift() { const f = this.dayFraction(); return (f >= DAY_START && f < DAY_END) ? "day" : "night"; }

  // ---- seasons ----
  seasonIndex() { return Math.floor(Math.floor(this.time / DAY_LENGTH) / SEASON_DAYS) % 4; }
  season() { return SEASONS[this.seasonIndex()]; }

  // ---- weather ----
  rollWeather() {
    const odds = WEATHER_ODDS[this.seasonIndex()];
    const total = odds.reduce((s, [, w]) => s + w, 0);
    let r = this.world.rng() * total;
    for (const [id, w] of odds) { if (r < w) return id; r -= w; }
    return "clear";
  }
  weatherIsHarsh() { return this.weather === "storm" || this.weather === "blizzard"; }

  // ---- wildlife & tamed companions ----
  trySpawnAnimal() {
    if (this.animals.filter(a => !a.tamed).length >= 3) return;
    const w = this.world;
    for (let t = 0; t < 30; t++) {
      const x = randint(w.rng, 0, w.w - 1), y = randint(w.rng, 0, w.h - 1);
      const tile = w.get(x, y, 0);
      if (tile && tile.kind === K.GRASS && w.isWalkable(x, y, 0)) {
        this.animals.push(new Animal("fox", x, y));
        break;
      }
    }
  }

  updateAnimals(dt) {
    for (const a of this.animals) {
      if (a.fleeTimer > 0) a.fleeTimer -= dt;
      if (a.reserved) continue; // being approached/worked on — hold still
      const outsider = !a.tamed; // a tamed pet is treated as part of the colony (passes locked doors like an elf)
      if (a.tamed) {
        const owner = this.dwarves.find(d => d.dbId === a.ownerId);
        if (owner && Math.hypot(owner.x - a.x, owner.y - a.y) > 6) {
          a.repath -= dt;
          if (!a.path || a.repath <= 0) {
            a.repath = 1;
            const p = pathTo(this.world, a.tileX, a.tileY, 0, owner.tileX, owner.tileY, 0, outsider);
            if (p) a.setPath(p);
          }
          a.move(dt);
          continue;
        }
      }
      a.wanderTimer -= dt;
      if (a.wanderTimer <= 0) {
        a.wanderTimer = 2 + this.world.rng() * 4;
        if (this.world.rng() < 0.5) {
          const nx = a.tileX + randint(this.world.rng, -3, 3), ny = a.tileY + randint(this.world.rng, -3, 3);
          if (this.world.isWalkable(nx, ny, 0, outsider)) {
            const p = pathTo(this.world, a.tileX, a.tileY, 0, nx, ny, 0, outsider);
            if (p) a.setPath(p);
          }
        }
      }
      if (a.path) a.move(dt);
    }
  }

  // ---- Essence Craft: power network & food spoilage ----
  // Flood-fills every connected cluster of conduit/generator/icebox tiles on
  // each floor; a cluster is "powered" the moment it contains at least one
  // Essence Well. Then rebuilds the set of tiles kept cool by a powered
  // Frost Chamber, which decayFood() reads to slow spoilage nearby.
  updateEssenceNetwork() {
    const w = this.world;
    const isNode = (t) => t.conduit || t.furniture === FURN.GENERATOR || t.furniture === FURN.ICEBOX || t.furniture === FURN.LAMP;
    this.chilledTiles = new Set();
    for (let z = 0; z >= w.minZ; z--) {
      const tiles = w.getLevel(z);
      if (!tiles) continue;
      const seen = new Set();
      for (let y = 0; y < w.h; y++) {
        for (let x = 0; x < w.w; x++) {
          const key = y * w.w + x;
          if (seen.has(key) || !isNode(tiles[y][x])) continue;
          const comp = [];
          let hasGenerator = false;
          const stack = [[x, y]];
          seen.add(key);
          while (stack.length) {
            const [cx, cy] = stack.pop();
            const ct = tiles[cy][cx];
            comp.push(ct);
            if (ct.furniture === FURN.GENERATOR) hasGenerator = true;
            for (const [dx, dy] of NEIGHBORS4) {
              const nx = cx + dx, ny = cy + dy;
              if (!w.inBounds(nx, ny)) continue;
              const nk = ny * w.w + nx;
              if (seen.has(nk) || !isNode(tiles[ny][nx])) continue;
              seen.add(nk);
              stack.push([nx, ny]);
            }
          }
          for (const ct of comp) ct.powered = hasGenerator;
        }
      }
      // radius around every powered Frost Chamber on this floor
      for (let y = 0; y < w.h; y++) {
        for (let x = 0; x < w.w; x++) {
          const t = tiles[y][x];
          if (t.furniture !== FURN.ICEBOX || !t.powered) continue;
          for (let dy = -ESSENCE_CHILL_RADIUS; dy <= ESSENCE_CHILL_RADIUS; dy++) {
            for (let dx = -ESSENCE_CHILL_RADIUS; dx <= ESSENCE_CHILL_RADIUS; dx++) {
              if (Math.abs(dx) + Math.abs(dy) > ESSENCE_CHILL_RADIUS) continue;
              const nx = x + dx, ny = y + dy;
              if (w.inBounds(nx, ny)) this.chilledTiles.add(`${z}:${nx},${ny}`);
            }
          }
        }
      }
    }
  }

  // Unattended food slowly rots; a powered Frost Chamber's chill radius
  // cuts the rate to a sixth. Spoiled items vanish with a single summary log
  // line rather than spamming one per item.
  decayFood() {
    if (!this.items.length) return;
    let spoiled = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (it.kind !== ITEM.FOOD || it.hauled) continue;
      const chilled = this.chilledTiles.has(`${it.z || 0}:${it.x},${it.y}`);
      it.freshness = (it.freshness != null ? it.freshness : 1) - (chilled ? 0.15 : 1) / FOOD_SPOIL_TIME;
      if (it.freshness <= 0) {
        const t = this.world.get(it.x, it.y, it.z || 0);
        if (t && t.item === it) t.item = null;
        this.items.splice(i, 1);
        spoiled++;
      }
    }
    if (spoiled) this.log(`${spoiled} spoiled food rotted away.`, "bad", "colony");
  }

  // Resolve what a dwarf should be doing right now (critical needs override schedule).
  resolveActivity(d) {
    if (d.hunger > 85) return "eat";
    if (d.thirst > 85) return "drink";
    if (d.vampireExposed) return "quarantine";
    if (d.wounded || d.infected) return "recover";
    if (d.energy < 15) return "sleep";
    return d.schedule[this.shift()] || "work";
  }

  updateDwarf(d, dt) {
    if (d.hp <= 0) return; // slain — awaiting removal this frame
    const night = this.shift() === "night";

    // needs
    d.hunger = clamp(d.hunger + this.hungerRate() * dt, 0, 100);
    d.thirst = clamp(d.thirst + THIRST_RATE * dt, 0, 100);
    if (d.state !== "sleep") d.energy = clamp(d.energy - ENERGY_RATE * (night ? 1.4 : 1) * dt, 0, 100);
    d.activity = this.resolveActivity(d);

    // weather: harsh conditions sting surface elves; underground is sheltered,
    // same as it already is from raids.
    if (d.z === 0) {
      if (this.weatherIsHarsh()) {
        d.mood = clamp(d.mood - dt * 0.6, 0, 100);
        d.energy = clamp(d.energy - dt * (this.weather === "blizzard" ? 3 : 1.5), 0, 100);
      } else if (this.weather === "heatwave") {
        d.thirst = clamp(d.thirst + dt * 8, 0, 100);
      }
      // a nearby tamed pet lifts spirits
      for (const a of this.animals) {
        if (a.tamed && Math.hypot(d.x - a.x, d.y - a.y) <= 3) { d.mood = clamp(d.mood + dt * 0.5, 0, 100); break; }
      }
    }

    // mood
    if (d.hunger > 92) {
      if (!d.starve) this.triggerAutoPause(`${d.name} is starving`);
      d.mood = clamp(d.mood - dt * 4, 0, 100);
      d.starve = (d.starve || 0) + dt;
      if (d.starve > 45) { this.recordDeath(d, "starved to death"); return; }
    } else d.starve = 0;
    if (d.thirst > 92) {
      if (!d.parch) this.triggerAutoPause(`${d.name} is dying of thirst`);
      d.mood = clamp(d.mood - dt * 4, 0, 100);
      d.parch = (d.parch || 0) + dt;
      if (d.parch > 45) { this.recordDeath(d, "died of thirst"); return; }
    } else d.parch = 0;
    if (d.energy < 18) d.mood = clamp(d.mood - dt * 1.5, 0, 100);
    else if (d.hunger < 50 && d.thirst < 50 && d.state === "idle") d.mood = clamp(d.mood + dt * 0.3, 0, 100);

    // Slow healing when no threat is present. A badly wounded elf (d.wounded)
    // only heals while actively in "recover" state — minor scrapes still
    // shrug off on their own during normal work.
    if (!this.enemies.length && d.hp < d.maxhp && (d.hunger < 85 || this.hasTech("medicine"))
        && (!d.wounded || d.state === "recover")) {
      const here = this.world.get(d.tileX, d.tileY, d.z);
      let heal;
      if (!d.wounded) {
        // minor scrape: unchanged gentle ambient regen
        heal = 3;
        if (this.hasTech("medicine")) heal *= 2.5;
        if (here && here.zone === ZONE.HOSPITAL) heal *= 2;
      } else {
        // serious wound: modest baseline bed rest, with each of a proper bed,
        // a Hospital, Medicine research, and a doctor's care adding on top —
        // additive, so no single upgrade trivializes recovery by itself.
        heal = 1.5;
        if (d.bed) heal += 1.5;
        if (here && here.zone === ZONE.HOSPITAL) heal += 2;
        if (this.hasTech("medicine")) heal += 1.5;
        if (d.beingTreated) heal += 3;
      }
      d.hp = clamp(d.hp + heal * dt, 0, d.maxhp);
      if (d.wounded && d.hp >= d.maxhp) d.wounded = false;
    }

    // The infection clock: ticks down toward turning regardless of whether
    // a raid is active. Hospital + Medicine tech alone nearly stall it —
    // a doctor's active attention (which cycles on/off between discrete
    // treatment visits, same as the wound-healing bonus) is what pushes the
    // rate decisively negative, i.e. actually recovering, while they're there.
    if (d.infected) {
      const here = this.world.get(d.tileX, d.tileY, d.z);
      let rate = 1;
      if (here && here.zone === ZONE.HOSPITAL) rate -= 0.5;
      if (this.hasTech("medicine")) rate -= 0.4;
      if (d.beingTreated) rate -= 0.6;
      rate = Math.max(-0.5, rate);
      d.infectionTimer -= rate * dt;
      if (d.infectionTimer <= 0) { this.turnZombie(d); return; }
      if (d.infectionTimer >= INFECTION_TIME) {
        d.infected = false;
        d.mood = clamp(d.mood + 10, 0, 100);
        this.log(`${d.name} has fought off the infection!`, "good", "colony");
        this.milestoneFlags.cured = true;
      }
    }

    // The curse clock: ticks toward turning whether hidden or quarantined.
    // While hidden it's a flat, unmodifiable rate — nothing but a checkup
    // can intervene. Once exposed, Quarantine zone + Medicine tech + an
    // active doctor can push the rate negative, same shape as infection.
    if (d.vampiric) {
      let rate = 1;
      if (d.vampireExposed) {
        const here = this.world.get(d.tileX, d.tileY, d.z);
        if (here && here.zone === ZONE.QUARANTINE) rate -= 0.5;
        if (this.hasTech("medicine")) rate -= 0.4;
        if (d.beingTreated) rate -= 0.6;
        rate = Math.max(-0.5, rate);
      }
      d.vampireTimer -= rate * dt;
      if (d.vampireTimer <= 0) { this.turnVampire(d); return; }
      if (d.vampireExposed && d.vampireTimer >= VAMPIRE_TIME) {
        d.vampiric = false;
        d.vampireExposed = false;
        d.mood = clamp(d.mood + 10, 0, 100);
        this.log(`${d.name} has been cured of the vampiric curse!`, "good", "colony");
        this.milestoneFlags.vampireCured = true;
      }
    }

    // a roofed, unlit workspace is gloomy — torches and lanterns keep both
    // the work and the spirits moving (work-speed effect lives in jobs.js)
    if (d.state === "work" && this.isDark(d.tileX, d.tileY, d.z)) {
      d.mood = clamp(d.mood - dt * 0.08, 0, 100);
      d.thought = "Working in the gloom";
    }

    // overall happiness gauge (health + mood + satisfied needs)
    d.happiness = this.computeHappiness(d);

    // combat takes over whenever enemies are on the map — no longer
    // surface-only, since a raid can now follow a stairwell/ramp down;
    // handleCombat/nearestEnemy are z-aware so this only ever matches a
    // threat on the dwarf's own floor.
    if (this.enemies.length && this.handleCombat(d, dt)) return;

    if (d.job) {
      this.jobs.execute(d, dt);
    } else {
      d.state = "idle";
      // Back off between job searches. Without this, every jobless elf re-runs
      // the full assignment chain every tick, and each failing search costs a
      // full A* budget — see IDLE_ASSIGN_COOLDOWN in jobs.js.
      if (d.assignCd > 0) {
        d.assignCd -= dt;
      } else {
        d.assignCd = this.jobs.assign(d) ? 0 : IDLE_ASSIGN_COOLDOWN;
      }
      if (!d.job) {
        d.idleWander -= dt;
        if (d.idleWander <= 0) {
          d.idleWander = 2 + Math.random() * 3;
          if (Math.random() < 0.5) {
            const nx = d.tileX + randint(this.world.rng, -3, 3);
            const ny = d.tileY + randint(this.world.rng, -3, 3);
            if (this.world.isWalkable(nx, ny, d.z)) {
              const p = pathTo(this.world, d.tileX, d.tileY, d.z, nx, ny, d.z);
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
      if (leveled === "toughness") { d.maxhp += 2; d.hp = clamp(d.hp + 2, 0, d.maxhp); }
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

  // ---- milestones: persistent achievements, unlocked once, ever ----
  checkMilestones() {
    this.checkColonyLost();
    if (this.colonyLost) return;
    if (!this._milestonesLoaded) return;
    for (const m of MILESTONES) {
      if (this.unlockedMilestones.has(m.id)) continue;
      if (m.check(this)) this.unlockMilestone(m);
    }
  }

  unlockMilestone(m) {
    this.unlockedMilestones.add(m.id);
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    this.log(`🏆 Milestone: ${m.name} — ${m.desc}`, "good", "colony");
    if (window.App) window.App.toast(`🏆 ${m.name}`);
    if (colonyDB) colonyDB.unlockMilestone(m.id, day).catch(() => {});
  }

  recordDeath(d, cause) {
    this.log(`${d.name} has ${cause}.`, "bad", "colony");
    this.triggerAutoPause(`${d.name} has ${cause}`);
    this.jobs.releaseBed(d);
    if (d.partnerId) {
      const partner = this.dwarves.find(o => o.dbId === d.partnerId);
      if (partner) {
        partner.partnerId = null;
        partner.mood = clamp(partner.mood - 20, 0, 100);
        this.log(`${partner.name} mourns the loss of ${d.name}.`, "bad", "colony");
      }
    }
    // The dead do not simply vanish: leave a body where they fell. Haulers will
    // carry it to a graveyard if one is zoned — see assignBury in jobs.js.
    const corpse = this.jobs.spawnItem(ITEM.CORPSE, d.tileX, d.tileY, null, d.z || 0);
    if (corpse) {
      corpse.name = d.name;
      corpse.color = d.color;
      corpse.diedDay = Math.floor(this.time / DAY_LENGTH) + 1;
      this.log(`${d.name}'s body awaits burial.`, "", "colony");
    }
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

  // An infection that ran its full course: the colonist is lost, and a new
  // hostile appears in their place. Mirrors recordDeath's bookkeeping.
  turnZombie(d) {
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    this.milestoneFlags.turned = true;
    this.log(`${d.name} succumbed to the infection and turned!`, "bad", "combat");
    this.triggerAutoPause(`${d.name} has turned!`);
    this.jobs.releaseBed(d);
    if (d.partnerId) {
      const partner = this.dwarves.find(o => o.dbId === d.partnerId);
      if (partner) {
        partner.partnerId = null;
        partner.mood = clamp(partner.mood - 25, 0, 100);
        this.log(`${partner.name} watches in horror as ${d.name} turns.`, "bad", "colony");
      }
    }
    (this._toRemove || (this._toRemove = [])).push(d);
    const turned = new Enemy("turned", d.x, d.y, d.z || 0);
    this.enemies.push(turned);
    if (colonyDB) {
      const skills = {};
      for (const id in d.skills) skills[id] = d.skills[id].level;
      colonyDB.putDwarf({
        id: d.dbId, name: d.name, color: d.color, alive: false, cause: "turned into a zombie", skills,
        profession: professionOf(d), day,
      }).catch(() => {});
      colonyDB.logEvent(`${d.name} turned into a zombie`, day);
    }
  }

  // The curse ran its full course, unexposed or untreated: the colonist is
  // lost, and a Vampire Lord rises in their place. Mirrors turnZombie.
  turnVampire(d) {
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    this.milestoneFlags.vampireTurned = true;
    this.log(`${d.name}'s curse consumed them — they rise as a vampire!`, "bad", "combat");
    this.triggerAutoPause(`${d.name} has turned into a vampire!`);
    this.jobs.releaseBed(d);
    if (d.partnerId) {
      const partner = this.dwarves.find(o => o.dbId === d.partnerId);
      if (partner) {
        partner.partnerId = null;
        partner.mood = clamp(partner.mood - 25, 0, 100);
        this.log(`${partner.name} watches in horror as ${d.name} turns.`, "bad", "colony");
      }
    }
    (this._toRemove || (this._toRemove = [])).push(d);
    const turned = new Enemy("vampire_lord", d.x, d.y, d.z || 0);
    this.enemies.push(turned);
    if (colonyDB) {
      const skills = {};
      for (const id in d.skills) skills[id] = d.skills[id].level;
      colonyDB.putDwarf({
        id: d.dbId, name: d.name, color: d.color, alive: false, cause: "turned into a vampire", skills,
        profession: professionOf(d), day,
      }).catch(() => {});
      colonyDB.logEvent(`${d.name} turned into a vampire`, day);
    }
  }

  // ---- research ----
  hasTech(id) { return !!this.tech[id]; }

  discoverArtifact(dwarf) {
    const undiscovered = ARTIFACTS.filter(artifact => !this.discoveredArtifacts.includes(artifact.id));
    if (!undiscovered.length || this.world.rng() >= 0.025) return null;
    const artifact = undiscovered[Math.floor(this.world.rng() * undiscovered.length)];
    this.discoveredArtifacts.push(artifact.id);
    dwarf.inventory = dwarf.inventory || [];
    dwarf.inventory.push({ id: artifact.id });
    this.log(`${dwarf.name} discovered ${artifact.icon} ${artifact.name}!`, "good", "skill");
    if (colonyDB) colonyDB.logEvent(`${dwarf.name} discovered ${artifact.name}`, Math.floor(this.time / DAY_LENGTH) + 1);
    this.updatePanel();
    return artifact;
  }

  // ---- the outbreak: escalation keyed to research progress, not day ----
  // Highest tier researched, plus a small bonus per tech beyond that — so
  // a colony that pushes deep into the tree faces a worse outbreak even
  // within the same tier.
  techTierScore() {
    let maxTier = 0, count = 0;
    for (const t of TECHS) if (this.hasTech(t.id)) { maxTier = Math.max(maxTier, t.tier); count++; }
    return maxTier + count * 0.15;
  }

  outbreakLabel() {
    const idx = clamp(Math.floor(this.techTierScore()), 0, OUTBREAK_LABELS.length - 1);
    return OUTBREAK_LABELS[idx];
  }

  researchRate() {
    let r = 0;
    for (const d of this.dwarves) r += 0.12 * (1 + d.skillLevel("intelligence") * 0.08) * (1 + d.traitBonus("research"));
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
      document.querySelectorAll(`[data-material-group="${tool}"]`).forEach(group => {
        group.style.display = unlocked ? "" : "none";
      });
    }
  }

  // ---- happiness (derived gauge: health + mood + needs) ----
  computeHappiness(d) {
    const hpPct = (d.hp / d.maxhp) * 100;
    return clamp(0.35 * (d.mood + d.artifactBonus("mood") + d.traitBonus("mood")) + 0.2 * hpPct + 0.15 * (100 - d.hunger) + 0.15 * (100 - d.thirst) + 0.15 * d.energy, 0, 100);
  }
  avgHappiness() {
    if (!this.dwarves.length) return 0;
    let s = 0; for (const d of this.dwarves) s += (d.happiness != null ? d.happiness : 60);
    return s / this.dwarves.length;
  }

  // ---- relationships ----
  getRelationship(a, b) {
    if (!a.relationships[b.dbId]) a.relationships[b.dbId] = { affinity: 0 };
    return a.relationships[b.dbId];
  }

  // Does this dwarf have a bond strong enough that whoever's covering for
  // them can throw off a checkup? A partner is always the strongest bond;
  // otherwise fall back to their single best relationship vs. the existing
  // "Friend" threshold (25, RELATIONSHIP_THRESHOLDS in entities.js).
  hasCoverUp(d) {
    if (d.partnerId) return true;
    let best = -Infinity;
    for (const id in d.relationships) best = Math.max(best, d.relationships[id].affinity);
    return best >= 25;
  }

  // Nearby elves' opinions of each other drift over time. Each pair has a
  // fixed "chemistry" (some just click, some just don't) plus a bump from
  // Charisma and from the context (idle chatter < socializing < sharing a
  // bed). Crossing a high threshold pairs them up; crossing back into the
  // negative ends it.
  updateRelationships() {
    const ds = this.dwarves;
    for (let i = 0; i < ds.length; i++) {
      const a = ds[i];
      if (a.hp <= 0) continue;
      for (let j = i + 1; j < ds.length; j++) {
        const b = ds[j];
        if (b.hp <= 0) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 4) continue;

        const chem = pairChemistry(a.dbId, b.dbId);
        const socializing = (a.job && a.job.type === "socialize") || (b.job && b.job.type === "socialize");
        const sharingBed = a.bed && b.bed && a.bed.x === b.bed.x && a.bed.y === b.bed.y;
        let rate = 0.15;
        if (socializing) rate = 0.6;
        if (sharingBed) rate = 0.9;
        const cha = ((a.skillLevel("charisma") + b.skillLevel("charisma")) / 2) * 0.015;
        const delta = rate * chem + (chem > 0 ? cha : -cha * 0.5);

        const rel = this.getRelationship(a, b);
        rel.affinity = clamp(rel.affinity + delta, -100, 100);
        this.getRelationship(b, a).affinity = rel.affinity; // symmetric, single shared value

        if (a.partnerId === b.dbId) {
          a.mood = clamp(a.mood + 0.3, 0, 100); b.mood = clamp(b.mood + 0.3, 0, 100);
          if (rel.affinity < 0) {
            a.partnerId = null; b.partnerId = null;
            this.log(`💔 ${a.name} and ${b.name} have broken up.`, "bad", "colony");
          }
        } else if (rel.affinity <= -60) {
          a.mood = clamp(a.mood - 0.15, 0, 100); b.mood = clamp(b.mood - 0.15, 0, 100);
        } else if (rel.affinity >= 60 && !a.partnerId && !b.partnerId) {
          a.partnerId = b.dbId; b.partnerId = a.dbId;
          this.log(`💞 ${a.name} and ${b.name} have fallen in love!`, "good", "colony");
        }
      }
    }
  }

  // ---- speed controls ----
  setSpeed(v) { // v === 0 pauses; otherwise a value from SPEEDS
    if (v === 0) { this.paused = true; }
    else { const i = SPEEDS.indexOf(v); if (i >= 0) this.speedIdx = i; this.paused = false; }
    this.updateStats();
  }

  hungerRate() {
    return HUNGER_RATE * (this.hasTech("rations") ? 0.75 : 1) * this.diff().hunger;
  }

  // The active difficulty preset (see js/settings.js).
  diff() { return difficultyById(this.settings.difficulty); }

  flushRemovals() {
    if (!this._toRemove || !this._toRemove.length) return;
    for (const d of this._toRemove) {
      const i = this.dwarves.indexOf(d);
      if (i >= 0) this.dwarves.splice(i, 1);
      if (this.selectedDwarf === d) this.selectedDwarf = null;
      if (this.selectedSquad.length) this.selectedSquad = this.selectedSquad.filter(x => x !== d);
    }
    this._toRemove = null;
    this.updatePanel();
    this.checkColonyLost();
  }

  // ---- the end of a colony ----
  // Nothing handled this before: the last elf died, the sim paused, and the
  // player was left staring at an empty map with no closure.
  checkColonyLost() {
    if (this.colonyLost || this.dwarves.length > 0) return;
    this.colonyLost = true;
    this.paused = true;
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    this.log(`The colony is lost — its last elf has fallen on day ${day}.`, "bad", "colony");
    if (colonyDB) colonyDB.logEvent(`Colony lost on day ${day}`, day);
    if (window.sound) window.sound.play("death", 0);
    if (window.App && window.App.openColonyLost) window.App.openColonyLost();
  }

  // The figures on the colony-lost card.
  colonySummary() {
    let graves = 0;
    for (const [x, y, z] of this.graveyardTiles) {
      const t = this.world.get(x, y, z || 0);
      if (t && t.grave) graves++;
    }
    const peak = this.popHistory.length ? Math.max(...this.popHistory.map(h => h.pop)) : this.dwarves.length;
    return {
      day: Math.floor(this.time / DAY_LENGTH) + 1,
      peak,
      techs: TECHS.filter(t => this.hasTech(t.id)).length,
      techTotal: TECHS.length,
      milestones: this.unlockedMilestones ? this.unlockedMilestones.size : 0,
      graves,
      burials: this.stats.buried || 0,
      difficulty: difficultyById(this.settings.difficulty).name,
      map: mapSizeById(this.settings.mapSize).name,
    };
  }

  // ---- combat ----
  soldierCount() { let n = 0; for (const d of this.dwarves) if (d.military) n++; return n; }
  addFx(x, y, bad) { this.combatFx.push({ x, y, t: 0.3, bad: !!bad }); }

  addProjectileFx(x1, y1, x2, y2, z, bad, color) {
    this.projectileFx.push({ x1, y1, x2, y2, z: z || 0, t: 0.18, bad: !!bad, color: color || null });
  }

  // Line of sight between two tiles on the same floor: walls, solid rock, and
  // closed-off door tiles block; trees and furniture don't. Endpoints are
  // never blockers (the shooter/target tile itself doesn't count).
  hasLOS(x1, y1, z, x2, y2) {
    const w = this.world;
    let dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx - dy, x = x1, y = y1;
    while (x !== x2 || y !== y2) {
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x2 && y === y2) break;
      const t = w.get(x, y, z);
      if (!t || t.built === B.WALL || t.built === B.DOOR || t.kind === K.STONE) return false;
    }
    return true;
  }

  // Top up a gunner's/archer's quiver from stored/loose ammo packs. Each pack
  // holds RANGED_WEAPONS[weapon].per shots; the quiver holds 20 of anything.
  // Returns how many shots were added.
  refillQuiver(d) {
    const rw = RANGED_WEAPONS[d.weapon];
    if (!rw || d.quiver >= 20) return 0;
    const packs = this.items
      .filter(it => it.kind === rw.ammo)
      .sort((a, b) => dist3(a.x, a.y, a.z || 0, d.tileX, d.tileY, d.z || 0) - dist3(b.x, b.y, b.z || 0, d.tileX, d.tileY, d.z || 0));
    let added = 0;
    for (const pack of packs) {
      if (d.quiver >= 20) break;
      this.jobs.consumeItem(pack);
      d.quiver = Math.min(20, d.quiver + rw.per);
      added += rw.per;
    }
    if (added) this.log(`${d.name} loads ${added} ${rw.label} (${d.quiver}/20).`, "", "combat");
    return added;
  }

  // z-aware for the same reason as nearestDwarf — without this, a dwarf on
  // one floor could be matched to an enemy on another once raids can reach
  // underground (see handleCombat's call site, no longer surface-only).
  nearestEnemy(x, y, z = 0) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.hp <= 0 || (e.z || 0) !== z) continue;
      const d = dist2(e.x, e.y, x, y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Only elves on the same floor as the searching enemy are valid targets —
  // raids can now follow a stairwell/ramp down (see spawnRaid), so this is
  // z-aware rather than hardcoded to the surface.
  nearestDwarf(x, y, z = 0) {
    let best = null, bd = Infinity;
    for (const d of this.dwarves) {
      if (d.hp <= 0 || d.z !== z) continue;
      const dd = dist2(d.x, d.y, x, y) * (d.military ? 0.55 : 1); // enemies favour soldiers
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // Returns true if combat took control of this dwarf this frame.
  handleCombat(d, dt) {
    const dz = d.z || 0;
    const foe = this.nearestEnemy(d.x, d.y, dz);

    if (d.military) {
      if (d.job && d.job.type === "equip") { this.jobs.execute(d, dt); return true; } // finish arming
      if (d.job) this.jobs.cancel(d); // drop civilian work to fight

      // Adjacent to a foe? Always fight — a manual order never leaves a
      // soldier standing still taking a free hit while "moving into position."
      if (foe) {
        const adj = Math.max(Math.abs(d.tileX - foe.tileX), Math.abs(d.tileY - foe.tileY)) <= 1;
        if (adj) {
          d.state = "fight"; d.path = null; d.facing = foe.x > d.x ? 1 : -1;
          d.attackCd -= dt;
          if (d.attackCd <= 0) { d.attackCd = 0.8; this.dwarfHitEnemy(d, foe); }
          d.thought = "In battle!";
          return true;
        }
        // A soldier with a ranged weapon (bow/rifle/laser rifle) and ammo
        // stands off and shoots instead of charging — per-weapon reach, +2
        // when firing from a Watchtower. Without line of sight (or ammo) they
        // simply fall through to normal chase behavior.
        const rw = RANGED_WEAPONS[d.weapon];
        if (rw && d.quiver > 0) {
          const dist = Math.max(Math.abs(d.tileX - foe.tileX), Math.abs(d.tileY - foe.tileY));
          const range = rw.range + (this.isOnWatchtower(d) ? 2 : 0);
          if (dist <= range && this.hasLOS(d.tileX, d.tileY, dz, foe.tileX, foe.tileY)) {
            d.state = "fight"; d.path = null; d.facing = foe.x > d.x ? 1 : -1;
            d.attackCd -= dt;
            if (d.attackCd <= 0) {
              d.attackCd = rw.cd;
              d.quiver--;
              this.addProjectileFx(d.x, d.y, foe.x, foe.y, dz, false, rw.color);
              this.dwarfHitEnemy(d, foe, true);
              if (window.sound) window.sound.play(rw.sound, 90);
            }
            d.thought = d.quiver ? "Firing at will!" : "Out of ammo!";
            return true;
          }
        }
      }

      // A player move order holds: march to the ordered spot, then stand
      // fast there (rather than auto-chasing the nearest enemy) until a new
      // order arrives or the raid ends.
      if (d.manualOrder) {
        const mo = d.manualOrder;
        const atOrder = d.tileX === mo.x && d.tileY === mo.y && dz === mo.z;
        if (!atOrder) {
          d.combatRepath -= dt;
          if (!d.path || d.combatRepath <= 0) {
            d.combatRepath = 0.4;
            const p = pathTo(this.world, d.tileX, d.tileY, dz, mo.x, mo.y, mo.z);
            if (p) d.setPath(p); else d.manualOrder = null; // unreachable — drop the order
          }
          d.state = "goto"; d.move(dt);
          d.thought = "Moving to position";
        } else {
          d.state = "idle"; d.path = null;
          d.thought = "Holding position";
        }
        return true;
      }

      if (!foe) { d.fleeing = false; return false; } // nothing on this floor to do
      d.combatRepath -= dt;
      if (!d.path || d.combatRepath <= 0) {
        d.combatRepath = 0.4;
        const p = pathAdjacent(this.world, d.tileX, d.tileY, dz, foe.tileX, foe.tileY, dz);
        if (p) d.setPath(p);
      }
      d.state = "goto"; d.move(dt);
      d.thought = "In battle!";
      return true;
    }

    if (!foe) { d.fleeing = false; return false; }
    const fdist = Math.hypot(foe.x - d.x, foe.y - d.y);
    // civilians flee toward the surface entrance when a foe is near — a
    // starting z other than 0 is fine, pathTo can route them up a stairwell.
    if (fdist < 8) {
      if (d.job) this.jobs.cancel(d);
      d.fleeing = true; d.thought = "Fleeing the enemy!";
      d.mood = clamp(d.mood - dt * 2, 0, 100);
      d.combatRepath -= dt;
      if (!d.path || d.combatRepath <= 0) {
        d.combatRepath = 0.5;
        const p = pathTo(this.world, d.tileX, d.tileY, dz, this.world.spawnX, this.world.spawnY, 0);
        if (p) d.setPath(p);
      }
      d.state = "goto"; d.move(dt);
      return true;
    }
    d.fleeing = false;
    return false;
  }

  // A soldier fighting from a watchtower tile is both harder-hitting and
  // safer — the passive bonus this round settled on instead of giving
  // watchtowers their own ranged-attack/targeting mechanic.
  isOnWatchtower(entity) {
    const t = this.world.get(entity.tileX, entity.tileY, entity.z || 0);
    return !!(t && t.furniture === FURN.WATCHTOWER);
  }

  dwarfHitEnemy(d, foe, ranged = false) {
    let dmg = d.attackDamage();
    if (!ranged && RANGED_WEAPONS[d.weapon]) dmg *= 0.6; // swinging a ranged weapon like a club
    if (this.isOnWatchtower(d)) dmg *= WATCHTOWER_ATK_MULT;
    foe.hp -= dmg;
    this.addFx(foe.x, foe.y, false);
    if (window.sound && !ranged) window.sound.play("combat", 100);
    this.awardXp(d, "fighting", 5); this.awardXp(d, "fitness", 1);
    if (foe.hp <= 0) this.killEnemy(foe, d);
  }

  enemyHitDwarf(e, d) {
    let dmg = d.damageTaken(e.atk);
    if (this.isOnWatchtower(d)) dmg *= WATCHTOWER_DEF_MULT;
    d.hp -= dmg;
    this.addFx(d.x, d.y, true);
    if (window.sound) window.sound.play("combat", 100);
    this.awardXp(d, "fighting", 2);
    this.awardXp(d, "toughness", 3); // enduring a hit builds resilience
    if (d.hp <= 0) { this.recordDeath(d, `slain by a ${e.name}`); return; }
    if (!d.wounded && d.hp < d.maxhp * 0.6) {
      d.wounded = true;
      d.mood = clamp(d.mood - 8, 0, 100);
      this.log(`${d.name} has been badly wounded!`, "bad", "combat");
    }
    const bite = ENEMY_TYPES[e.kind];
    if (bite && bite.infectious && !d.infected && !d.vampiric) {
      if (this.world.rng() < (bite.biteChance || 0.2)) {
        d.infected = true;
        d.infectionTimer = INFECTION_TIME;
        d.mood = clamp(d.mood - 12, 0, 100);
        this.log(`${d.name} was bitten!`, "bad", "combat");
      }
    } else if (bite && bite.curses && !d.vampiric && !d.infected) {
      if (this.world.rng() < (bite.curseChance || 0.2)) {
        // Deliberately no mood hit, no log line — a vampiric bite must look
        // like nothing happened, unlike the infected branch above.
        d.vampiric = true;
        d.vampireTimer = VAMPIRE_TIME;
      }
    }
  }

  killEnemy(foe, byDwarf) {
    foe.hp = 0; // filtered out after the enemy loop
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    if (byDwarf) {
      this.log(`${byDwarf.name} slew a ${foe.name}!`, "good", "combat");
      byDwarf.mood = clamp(byDwarf.mood + 4, 0, 100);
      this.awardXp(byDwarf, "fighting", 15);
    } else this.log(`A ${foe.name} was slain.`, "good", "combat");
    // Faction raiders: cutting one down sours relations with its banner and
    // warms that faction's rival. A loot-laden raider drops what it stole.
    if (foe.factionId && FACTION_BY_ID[foe.factionId]) {
      const f = FACTION_BY_ID[foe.factionId];
      this.applyRep(f.id, foe.motive === "plunder" ? -3 : -5);
      if (f.rival) this.applyRep(f.rival, 2);
    }
    if (foe.looted && foe.looted.length) {
      for (const l of foe.looted) this.jobs.spawnItem(l.kind, foe.tileX, foe.tileY, l.sub, foe.z || 0);
      this.log(`The stolen goods are recovered from the fallen ${foe.name}.`, "good", "faction");
      foe.looted = null;
    }
    if (colonyDB) colonyDB.logEvent(`${byDwarf ? byDwarf.name : "The colony"} slew a ${foe.name}`, day);
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.attackCd -= dt;
      const ez = e.z || 0;

      // Traps trigger on any hostile standing on them, reusable once the
      // cooldown expires — never on a dwarf, this is a raider-only hazard.
      const hereTile = this.world.get(e.tileX, e.tileY, ez);
      if (hereTile && hereTile.furniture === FURN.TRAP && (hereTile.trapCooldown || 0) <= 0) {
        hereTile.trapCooldown = TRAP_COOLDOWN;
        this.addFx(e.x, e.y, false);
        e.hp -= TRAP_DAMAGE;
        if (e.hp <= 0) { this.killEnemy(e, null); continue; }
        this.log(`A trap springs on a ${e.name}!`, "good", "combat");
      }

      // A plunderer ignores the fight unless cornered — it makes for the
      // stockpiles, grabs what it can, and runs for the edge with it.
      if (e.motive === "plunder") { this.updatePlunderer(e, dt); continue; }

      const tgt = this.nearestDwarf(e.x, e.y, ez);
      if (!tgt) {
        // Underground with no target has nowhere to retreat to (no literal
        // map "edge" down there) — just keep wandering along the existing
        // path. Only surface enemies fall back toward the colony center.
        if (ez === 0) {
          e.repath -= dt;
          if (!e.path || e.repath <= 0) {
            e.repath = 0.6;
            const p = pathTo(this.world, e.tileX, e.tileY, 0, this.world.spawnX, this.world.spawnY, 0, true);
            if (p) e.setPath(p);
          }
        }
        e.move(dt);
        continue;
      }
      const adj = Math.max(Math.abs(e.tileX - tgt.tileX), Math.abs(e.tileY - tgt.tileY)) <= 1;
      if (adj) {
        e.facing = tgt.x > e.x ? 1 : -1; e.path = null;
        if (e.attackCd <= 0) { e.attackCd = 1.0; this.enemyHitDwarf(e, tgt); }
      } else {
        // Ranged foes (the Bile Spitter) halt within their reach and lob at
        // the nearest elf — melee-focussed defence has to come to them.
        const et = ENEMY_TYPES[e.kind];
        const ranged = et.ranged
          && Math.max(Math.abs(e.tileX - tgt.tileX), Math.abs(e.tileY - tgt.tileY)) <= et.range
          && this.hasLOS(e.tileX, e.tileY, ez, tgt.tileX, tgt.tileY);
        if (ranged) {
          e.facing = tgt.x > e.x ? 1 : -1; e.path = null;
          if (e.attackCd <= 0) {
            e.attackCd = 2.2;
            this.addProjectileFx(e.x, e.y, tgt.x, tgt.y, ez, true);
            this.enemyHitDwarf(e, tgt);
          }
        } else {
          e.repath -= dt;
          if (!e.path || e.repath <= 0) {
            e.repath = 0.5;
            const p = pathAdjacent(this.world, e.tileX, e.tileY, ez, tgt.tileX, tgt.tileY, tgt.z, true);
            if (p) e.setPath(p);
          }
          e.move(dt);
        }
      }
    }
    const before = this.enemies.length;
    this.enemies = this.enemies.filter(e => e.hp > 0 && !e._gone);
    if (before && !this.enemies.length) {
      this.log(this._raidersEscaped ? "The raiders withdraw, laden with plunder." : "The colony has repelled the attack!",
        this._raidersEscaped ? "bad" : "good", this._raidersEscaped ? "faction" : "combat");
      this._raidersEscaped = false;
      // Manual move orders only make sense mid-fight — once it's over, hand
      // soldiers back to their normal equip/idle/labor routine. Gunners and
      // archers also restock their quivers from stored ammo packs.
      for (const d of this.dwarves) {
        d.manualOrder = null;
        if (d.military && RANGED_WEAPONS[d.weapon] && d.quiver < 20) this.refillQuiver(d);
      }
    }
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
      if (w.isWalkable(x, y, 0, outsider) && pathTo(w, x, y, 0, w.spawnX, w.spawnY, 0, outsider)) return { x, y };
    }
    return null;
  }

  // Underground has no map "edge" — a stairhead/ramphead on the deepest dug
  // level is the analogous entry point for a raid that "follows the colony
  // down" (see spawnRaid). Returns null if nothing's been dug yet.
  randomStairheadTile() {
    const w = this.world;
    if (w.minZ >= 0) return null;
    const z = w.minZ;
    const tiles = w.getLevel(z);
    const heads = [];
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = tiles[y][x];
        if (t.built === B.STAIRS || t.built === B.RAMP) heads.push({ x, y });
      }
    }
    if (!heads.length) return null;
    const pick = heads[randint(w.rng, 0, heads.length - 1)];
    return { x: pick.x, y: pick.y, z };
  }

  // Rolls one zombie's kind, weighted by how deep the colony has gone into
  // the tech tree — shamblers early, then runners, spitters, and eventually
  // brutes as the outbreak worsens.
  rollZombieKind(score) {
    const r = this.world.rng();
    // Vampires are rare and only show up once deep in the tech tree — a
    // separate, first-priority slice of the roll ahead of the zombie mix.
    const vampireChance = clamp((score - 2.5) * 0.12, 0, 0.12);
    if (r < vampireChance) return "vampire";
    const bruteChance = clamp((score - 2) * 0.25, 0, 0.5);
    const runnerChance = clamp((score - 0.5) * 0.3, 0, 0.45);
    const spitterChance = clamp((score - 1.5) * 0.2, 0, 0.25);
    if (r < bruteChance) return "brute";
    if (r < bruteChance + runnerChance) return "runner";
    if (r < bruteChance + runnerChance + spitterChance) return "spitter";
    return "shambler";
  }

  spawnRaid() {
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    const score = this.techTierScore();
    const n = clamp(Math.round((1 + Math.floor(score) + Math.floor(this.dwarves.length / 6)) * this.diff().raid), 1, 12);

    // Once a stairwell/ramp reaches underground, raids have a rising chance
    // to follow it down instead of approaching from the surface edge —
    // "digging down always carries some risk." Scales with depth dug.
    const depth = -this.world.minZ;
    const undergroundChance = depth > 0 ? clamp(0.1 + depth * 0.08, 0, 0.6) : 0;
    const underground = depth > 0 && this.world.rng() < undergroundChance;
    const site = underground ? this.randomStairheadTile() : this.randomEdgeTile();
    if (!site) return;
    const z = site.z || 0;

    let spawned = 0;
    const counts = {};
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 14; t++) {
        const x = clamp(site.x + randint(this.world.rng, -3, 3), 0, this.world.w - 1);
        const y = clamp(site.y + randint(this.world.rng, -3, 3), 0, this.world.h - 1);
        if (this.world.isWalkable(x, y, z)) {
          const kind = this.rollZombieKind(score);
          this.enemies.push(new Enemy(kind, x, y, z));
          counts[kind] = (counts[kind] || 0) + 1;
          spawned++;
          break;
        }
      }
    }
    if (!spawned) return;
    this.raidCount++;
    const label = Object.entries(counts)
      .map(([kind, c]) => `${c} ${ENEMY_TYPES[kind].name}${c > 1 ? "s" : ""}`)
      .join(", ");
    const originTxt = underground ? ` up through the stairwell on B${-z}` : " in from the wilds";
    this.log(`🧟 An outbreak! ${label} shamble${originTxt}!`, "bad", "combat");
    if (window.App) window.App.toast(`🧟 Outbreak — ${spawned} infected!`);
    if (colonyDB) colonyDB.logEvent(`Outbreak of ${label} attacked`, day);
    this.triggerAutoPause(`an outbreak of ${spawned} infected is approaching`);
  }

  // A mined-out floor tile counts as "supported" if solid stone/wall exists
  // within a small radius on the same level — leave pillars when digging big
  // rooms, mirroring real support-pillar play. Computed live (no per-tile
  // persistent field) — simpler, and avoids yet another save-format field.
  isUnsupported(x, y, z) {
    const w = this.world, R = 4;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > R) continue;
        const t = w.get(x + dx, y + dy, z);
        if (t && (t.kind === K.STONE || t.built === B.WALL)) return false;
      }
    }
    return true;
  }

  // Bounded random sample (mirrors tickGrowth's sampling shape) — cheap even
  // on a large dug-out level, and avoids a full-grid scan every check.
  tryCaveIn() {
    const w = this.world;
    const candidates = [];
    for (let i = 0; i < 60; i++) {
      const z = randint(w.rng, w.minZ, -1);
      const tiles = w.getLevel(z);
      const x = randint(w.rng, 0, w.w - 1), y = randint(w.rng, 0, w.h - 1);
      const t = tiles[y][x];
      if (t.kind !== K.FLOOR || t.built !== B.NONE) continue; // natural mined floor only — never a built floor/stairs/ramp
      if (this.isUnsupported(x, y, z)) candidates.push({ x, y, z });
    }
    if (!candidates.length) return;
    const chance = clamp(0.05 + candidates.length * 0.01, 0.05, 0.4);
    if (w.rng() >= chance) return;
    const origin = candidates[randint(w.rng, 0, candidates.length - 1)];
    this.collapseCluster(origin.x, origin.y, origin.z);
  }

  // Flood-fills a small cluster of unsupported floor tiles back to solid stone.
  collapseCluster(x, y, z) {
    const w = this.world;
    const cluster = [];
    const seen = new Set([`${x},${y}`]);
    const stack = [{ x, y }];
    while (stack.length && cluster.length < 6) {
      const c = stack.pop();
      const t = w.get(c.x, c.y, z);
      if (!t || t.kind !== K.FLOOR || t.built !== B.NONE) continue;
      cluster.push(c);
      for (const [dx, dy] of NEIGHBORS4) {
        const nx = c.x + dx, ny = c.y + dy, key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        seen.add(key);
        stack.push({ x: nx, y: ny });
      }
    }
    if (!cluster.length) return;
    for (const c of cluster) {
      const t = w.get(c.x, c.y, z);
      t.kind = K.STONE; t.ore = null; t.item = null;
      t.designation = null; t.buildJob = false; t.stockpile = false; t.zone = null; t.reserved = false;
    }
    for (const d of this.dwarves) {
      if (d.z !== z) continue;
      if (cluster.some(c => c.x === d.tileX && c.y === d.tileY)) this.caveInHitDwarf(d);
    }
    this.log(`💥 A cave-in collapses an unsupported chamber on B${-z}!`, "bad", "colony");
    this.triggerAutoPause("a cave-in has struck the colony");
  }

  // Almost always just wounds/knocks the elf down — an 8% instant-death roll
  // (mirroring recordDeath) covers the rare "fully buried" case, so this
  // doesn't feel too punishing/RNG-swingy for a colony sim.
  caveInHitDwarf(d) {
    if (this.world.rng() < 0.08) { this.recordDeath(d, "been buried in a cave-in"); return; }
    const raw = 15 + randint(this.world.rng, 0, 15);
    d.hp = Math.max(1, d.hp - d.damageTaken(raw));
    if (!d.wounded) { d.wounded = true; d.mood = clamp(d.mood - 10, 0, 100); }
    this.addFx(d.x, d.y, true);
    this.log(`${d.name} was caught in the cave-in!`, "bad", "combat");
  }

  // ---- trade caravans ----
  trySpawnCaravan(force = false) {
    if (this.weatherIsHarsh() && !force) return; // caravans wait out a storm/blizzard
    // Caravans are surface-only this release — only a Trade Depot on level 0
    // can receive one.
    const surfaceDepots = this.depotTiles.filter(t => !t[2]);
    if (!surfaceDepots.length) return;
    // A neighbour sends the caravan: openly hostile factions don't trade, and
    // friendlier ones are likelier to show up.
    const candidates = FACTIONS.filter(f => this.factionRep(f.id) > -60);
    if (!candidates.length) return;
    const weights = candidates.map(f => Math.max(1, 40 + this.factionRep(f.id)));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = this.world.rng() * total, faction = candidates[0];
    for (let i = 0; i < candidates.length; i++) { if (r < weights[i]) { faction = candidates[i]; break; } r -= weights[i]; }
    const edge = this.randomEdgeTile(true);
    if (!edge) return;
    const depot = this.jobs.nearestTile(surfaceDepots, edge.x, edge.y, 0);
    const path = pathTo(this.world, edge.x, edge.y, 0, depot.x, depot.y, 0, true);
    if (!path) return;
    const car = new Caravan(edge.x, edge.y);
    car.setPath(path);
    car.depot = depot;
    car.faction = faction.id;
    if (force) car.strange = true; // a Storyteller "strange merchant" pays a premium
    this.caravans.push(car);
    this.log(`${faction.icon} A ${faction.name} caravan approaches the depot!`, "good", "faction");
    if (window.App) window.App.toast(`${faction.icon} A ${faction.name} caravan has arrived to trade!`);
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
          car.setPath(edge ? pathTo(this.world, car.tileX, car.tileY, 0, edge.x, edge.y, 0, true) : null);
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
    const f = FACTION_BY_ID[car.faction] || FACTIONS[0];
    // Better standing and an eager merchant both improve the exchange rate; a
    // faction only buys what it wants (plus gold, which always sells).
    const priceMult = f.priceBias * (1 + this.factionRep(f.id) / 300) * (car.strange ? 1.3 : 1);
    const w = this.world;
    let value = 0, sold = 0;
    for (const [x, y, z] of this.depotTiles) {
      const t = w.get(x, y, z || 0);
      const it = t.item;
      if (!it) continue;
      const base = tradeSellPrice(it);
      if (base == null || !factionAccepts(f, it)) continue;
      value += base * priceMult; sold++;
      // Selling arms to one neighbour sours that neighbour's rival.
      if ((it.kind === ITEM.WEAPON || it.kind === ITEM.ARMOR) && f.rival) this.applyRep(f.rival, -1);
      t.item = null;
      const idx = this.items.indexOf(it);
      if (idx >= 0) this.items.splice(idx, 1);
    }
    if (!sold) { this.log(`The ${f.name} caravan found nothing to its taste and moved on.`, "", "faction"); return; }
    this.milestoneFlags.traded = true;
    this.applyRep(f.id, clamp(2 + Math.floor(value / 20), 2, 8));
    if (f.rival) this.applyRep(f.rival, -2);

    let cha = 0;
    for (const d of this.dwarves) cha = Math.max(cha, d.skillLevel("charisma"));
    value *= 1 + cha * 0.03;
    if (car.strange) {
      // a strange merchant also leaves a few curiosities behind
      const spots = this.depotTiles.filter(t => !t[2]);
      if (spots.length) {
        const spot = spots[Math.floor(this.world.rng() * spots.length)];
        this.jobs.spawnItem(ITEM.CIRCUIT, spot[0], spot[1], null, 0);
        this.jobs.spawnItem(ITEM.BAR, spot[0], spot[1], "iron", 0);
      }
    }

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
    const surfaceDepots = this.depotTiles.filter(t => !t[2]);
    for (const kind in bought) {
      const sub = kind === ITEM.ORE ? "iron" : null;
      for (let i = 0; i < bought[kind]; i++) {
        const spot = surfaceDepots[Math.floor(this.world.rng() * surfaceDepots.length)];
        this.jobs.spawnItem(kind, spot[0], spot[1], sub, 0);
      }
    }
    const boughtTxt = Object.keys(bought).length
      ? Object.entries(bought).map(([k, n]) => `${n} ${ITEM_LABEL[k]}`).join(", ") : "nothing";
    this.log(`Traded ${sold} good${sold > 1 ? "s" : ""} with the ${f.name} for ${boughtTxt}.`, "good", "faction");
    if (colonyDB) colonyDB.logEvent(`Traded with the ${f.name} for ${boughtTxt}`, Math.floor(this.time / DAY_LENGTH) + 1);
  }

  rebuildZones() {
    this.bedTiles = []; this.diningTiles = [];
    this.farmTiles = []; this.studyTiles = []; this.hospitalTiles = []; this.quarantineTiles = [];
    this.depotTiles = []; this.doorTiles = [];
    this.graveyardTiles = [];
    this.watchtowerTiles = []; this.trapTiles = [];
    const w = this.world;
    for (let z = 0; z >= w.minZ; z--) {
      const tiles = w.getLevel(z);
      if (!tiles) continue;
      for (let y = 0; y < w.h; y++)
        for (let x = 0; x < w.w; x++) {
          const t = tiles[y][x];
          if (t.furniture === FURN.BED || t.furniture === FURN.DOUBLE_BED) this.bedTiles.push([x, y, z]);
          else if (t.furniture === FURN.WATCHTOWER) this.watchtowerTiles.push([x, y, z]);
          else if (t.furniture === FURN.TRAP) this.trapTiles.push([x, y, z]);
          // zone decor (paintings, marble/metal) is scored per-room by
          // computeRooms/scoreRoom — no colony-wide counter anymore
          if (t.zone === ZONE.DINING) this.diningTiles.push([x, y, z]);
          else if (t.zone === ZONE.FARM) this.farmTiles.push([x, y, z]);
          else if (t.zone === ZONE.STUDY) this.studyTiles.push([x, y, z]);
          else if (t.zone === ZONE.HOSPITAL) this.hospitalTiles.push([x, y, z]);
          else if (t.zone === ZONE.QUARANTINE) this.quarantineTiles.push([x, y, z]);
          else if (t.zone === ZONE.TRADE) this.depotTiles.push([x, y, z]);
          else if (t.zone === ZONE.GRAVEYARD) this.graveyardTiles.push([x, y, z]);
          if (t.built === B.DOOR) this.doorTiles.push([x, y, z]);
        }
    }
    this.computeRooms();
    this.computeLightAndRoof();
  }

  // ---- roofs, darkness & lighting ----
  // A surface tile is "roofed" the moment it can no longer reach the map edge
  // without crossing a wall, door, or solid rock — connect a room's walls and
  // a roof is implied, and it goes dark inside. Underground levels are roofed
  // by the rock itself. Light spreads from torches/lanterns/lamps (LIGHTS)
  // with the same line-of-sight rule ranged combat uses, so a lit room needs
  // a source inside it, not just outside a window.
  computeLightAndRoof() {
    const w = this.world;
    this.updateEssenceNetwork(); // lamp powered flags must be fresh
    this.roofed = new Set();
    this.lit = new Map();
    const sealing = (t) => t.built === B.WALL || t.built === B.DOOR || t.kind === K.STONE;

    // Surface: flood-fill open sky in from the map edge; whatever it can't
    // reach (and isn't itself a wall/door/rock) sits under a roof.
    const level = w.getLevel(0);
    const reached = new Uint8Array(w.w * w.h);
    const stack = [];
    const seed = (x, y) => {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) return;
      const k = y * w.w + x;
      if (reached[k] || sealing(level[y][x])) return;
      reached[k] = 1;
      stack.push([x, y]);
    };
    for (let x = 0; x < w.w; x++) { seed(x, 0); seed(x, w.h - 1); }
    for (let y = 0; y < w.h; y++) { seed(0, y); seed(w.w - 1, y); }
    while (stack.length) {
      const [cx, cy] = stack.pop();
      for (const [dx, dy] of NEIGHBORS4) seed(cx + dx, cy + dy);
    }
    const prevRoofed0 = this._roofedCount0 || 0;
    let roofedCount0 = 0;
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        if (!reached[y * w.w + x] && !sealing(level[y][x])) {
          this.roofed.add(`${x},${y},0`);
          roofedCount0++;
        }
      }
    }
    // Everything underground is under the mountain.
    for (let z = -1; z >= w.minZ; z--) {
      const tiles = w.getLevel(z);
      if (!tiles) continue;
      for (let y = 0; y < w.h; y++)
        for (let x = 0; x < w.w; x++)
          if (!sealing(tiles[y][x])) this.roofed.add(`${x},${y},${z}`);
    }
    // Announce newly enclosed surface rooms (throttled).
    const now = this.time;
    if (roofedCount0 > prevRoofed0 && roofedCount0 > 0 && now - (this._lastRoofLog || -999) > 10) {
      this.log("A roof settles over the enclosed room — it is dark inside without light.", "", "build");
      this._lastRoofLog = now;
    }
    this._roofedCount0 = roofedCount0;

    // Spread light from every source with LOS; brightness 1 at the source,
    // fading to ~0.15 at the radius edge.
    this.lightSources = [];
    for (let z = 0; z >= w.minZ; z--) {
      const tiles = w.getLevel(z);
      if (!tiles) continue;
      for (let y = 0; y < w.h; y++) {
        for (let x = 0; x < w.w; x++) {
          const t = tiles[y][x];
          const info = t.furniture && LIGHTS[t.furniture];
          if (!info) continue;
          const powered = !info.needsPower || t.powered;
          this.lightSources.push({ x, y, z, furn: t.furniture, powered });
          if (!powered) continue;
          const R = Math.ceil(info.radius);
          for (let dy = -R; dy <= R; dy++) {
            for (let dx = -R; dx <= R; dx++) {
              const tx = x + dx, ty = y + dy;
              if (tx < 0 || ty < 0 || tx >= w.w || ty >= w.h) continue;
              const d = Math.hypot(dx, dy);
              if (d > info.radius) continue;
              if (dx || dy) {
                if (!this.hasLOS(x, y, z, tx, ty)) continue;
              }
              const key = `${tx},${ty},${z}`;
              const b = 1 - 0.85 * (d / info.radius);
              if (b > (this.lit.get(key) || 0)) this.lit.set(key, b);
            }
          }
        }
      }
    }
  }

  // True when the tile sits in darkness — roofed over (or underground) and
  // too far from any light source. Surface tiles in the open are daylit.
  isDark(x, y, z = 0) {
    const key = `${x},${y},${z}`;
    return this.roofed.has(key) && (this.lit.get(key) || 0) < 0.25;
  }

  // ---- room quality ----
  // A "room" is a flood-filled patch of Bedroom or Dining zone on one floor.
  // Quality (0–100) blends enclosure, flooring, build materials, decor, and
  // size into a grade from Cramped up to Royal; sleeping in a bedroom and
  // dining in a hall scale their mood bonus off it, so a marble-walled,
  // painting-hung chamber finally beats a cot in a muddy dugout.
  // Recomputed on every zone change (rebuildZones) and on a slow timer,
  // since walls/floors finishing construction also move the score.
  computeRooms() {
    this.rooms = [];
    this.roomAt = new Map();
    const w = this.world;
    for (const zone of [ZONE.BEDROOM, ZONE.DINING]) {
      for (let z = 0; z >= w.minZ; z--) {
        const level = w.getLevel(z);
        if (!level) continue;
        const seen = new Set();
        for (let y = 0; y < w.h; y++) {
          for (let x = 0; x < w.w; x++) {
            if (seen.has(`${x},${y},${z}`) || level[y][x].zone !== zone) continue;
            const tiles = [];
            const stack = [[x, y]];
            seen.add(`${x},${y},${z}`);
            while (stack.length) {
              const [cx, cy] = stack.pop();
              tiles.push([cx, cy, z]);
              for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
                if (nx < 0 || ny < 0 || nx >= w.w || ny >= w.h) continue;
                if (seen.has(`${nx},${ny},${z}`) || level[ny][nx].zone !== zone) continue;
                seen.add(`${nx},${ny},${z}`);
                stack.push([nx, ny]);
              }
            }
            const room = this.scoreRoom(tiles, zone);
            this.rooms.push(room);
            for (const [tx, ty, tz] of tiles) this.roomAt.set(`${tx},${ty},${tz}`, room);
          }
        }
      }
    }
  }

  scoreRoom(tiles, zone) {
    const w = this.world;
    const isBedroom = zone === ZONE.BEDROOM;
    const inRoom = new Set(tiles.map(([x, y, z]) => `${x},${y},${z}`));
    let perimeter = 0, sealed = 0, floors = 0, bestMat = 0, paintings = 0, tables = 0;
    for (const [x, y, z] of tiles) {
      const t = w.get(x, y, z);
      if (t.built === B.FLOOR) floors += 1;
      else if (t.kind === K.FLOOR && t.built !== B.FLOOR) floors += 0.5; // smooth mined rock
      if (t.furniture === FURN.PAINTING) paintings++;
      if (t.furniture === FURN.TABLE) tables++;
      const mat = t.buildMaterial && MATERIALS[t.buildMaterial];
      if (mat && mat.moodBonus) bestMat = Math.max(bestMat, mat.moodBonus);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (inRoom.has(`${nx},${ny},${z}`)) continue;
        perimeter++;
        const n = w.get(nx, ny, z);
        if (n && (n.built === B.DOOR || !w.isWalkable(nx, ny, z))) {
          sealed++;
          const nmat = n.buildMaterial && MATERIALS[n.buildMaterial];
          if (nmat && nmat.moodBonus) bestMat = Math.max(bestMat, nmat.moodBonus);
        }
      }
    }
    const n = tiles.length;
    const parts = {
      // walls/doors/solid rock around the room — an open-air zone is not a room
      enclosure: perimeter ? 30 * (sealed / perimeter) : 0,
      // built floors, with mined-stone floors counting half
      flooring: 20 * (floors / n),
      // marble walls/floors (2) beat metal (1); wood/stone add nothing
      material: 15 * (bestMat / 2),
      // paintings anywhere, tables in dining halls
      decor: Math.min(2, paintings) * 7 + (isBedroom ? 0 : Math.min(2, tables) * 3),
      // bedrooms want cozy 4–12 tiles; dining halls want elbow room
      space: isBedroom
        ? (n < 4 ? n * 1.5 : n <= 12 ? 15 : Math.max(6, 15 - (n - 12) * 0.75))
        : Math.min(15, n * 1.25),
    };
    const quality = clamp(Math.round(parts.enclosure + parts.flooring + parts.material + parts.decor + parts.space), 0, 100);
    const grade = quality < 25 ? "Cramped" : quality < 45 ? "Modest" : quality < 65 ? "Fine" : quality < 85 ? "Grand" : "Royal";
    const weakest = Object.entries(parts).sort((a, b) => a[1] - b[1])[0];
    const hints = { enclosure: "seal the room with walls or doors", flooring: "lay more floors", material: "build with marble or metal", decor: isBedroom ? "hang more paintings" : "add tables and paintings", space: isBedroom ? "resize toward 4–12 tiles" : "give the hall more space" };
    return { zone, name: isBedroom ? "bedroom" : "dining hall", tiles: n, quality, grade, parts, hint: hints[weakest[0]] };
  }

  // ---- doors ----
  setDoorsLocked(locked) {
    if (!this.doorTiles.length) return;
    for (const [x, y, z] of this.doorTiles) this.world.get(x, y, z || 0).doorLocked = locked;
    this.log(locked ? "All doors locked." : "All doors unlocked.", "", "order");
    this.updateStats();
  }

  // Migrants arrive randomly — better odds when the colony is thriving, but
  // only if there is room to house them (beds provide living space).
  tryMigration(force = false) {
    const HARD_CAP = 40;
    if (this.dwarves.length >= HARD_CAP) return;
    if (this.weatherIsHarsh() && !force) return; // migrants wait out a storm/blizzard
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
    if (!force && this.world.rng() >= chance) return; // no arrivals this season

    const n = clamp(randint(this.world.rng, 1, 3), 1, room);
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = this.world.spawnX + randint(this.world.rng, -6, 6);
        const y = this.world.spawnY + randint(this.world.rng, -6, 6);
        if (this.world.isWalkable(x, y)) {
          const d = new Dwarf(dwarfName(this.world.rng), x, y, DWARF_COLORS[this.dwarves.length % DWARF_COLORS.length], rollStartingSkills(this.world.rng));
          d.traits = rollTraits(this.world.rng);
          this.dwarves.push(d); arrived++;
          this.flushDwarfToDB(d);
          if (colonyDB) colonyDB.logEvent(`${d.name} (${professionOf(d)}) migrated to the colony`, Math.floor(this.time / DAY_LENGTH) + 1);
          break;
        }
      }
    }
    if (arrived) this.log(`${arrived} migrant${arrived > 1 ? "s have" : " has"} arrived seeking work.`, "good", "colony");
  }

  countItems(kind, sub = null) {
    let n = 0;
    for (const it of this.items) if (it.kind === kind && (sub === null || it.sub === sub)) n++;
    return n;
  }

  // ---- factions: reputation & raids ----
  initFactions() {
    this.factions = {};
    for (const f of FACTIONS) this.factions[f.id] = { rep: f.startRep };
  }

  factionRep(id) { return this.factions[id] ? this.factions[id].rep : 0; }

  // Nudge a faction's opinion, announcing the moment it crosses a tier line.
  applyRep(id, delta) {
    const f = FACTION_BY_ID[id]; if (!f) return;
    const st = this.factions[id] || (this.factions[id] = { rep: f.startRep });
    const before = factionTier(st.rep).name;
    st.rep = clamp(st.rep + delta, -100, 100);
    const tier = factionTier(st.rep);
    if (tier.name !== before) {
      this.log(`${f.icon} The ${f.name} now regard you as ${tier.name}.`, tier.name === "Hostile" ? "bad" : "good", "faction");
      if (window.App) window.App.toast(`${f.icon} ${f.name}: ${tier.name}`);
    }
  }

  // A faction whose opinion has fallen past its threshold may send a warband.
  // The further below the line, the likelier it is.
  tryFactionRaid() {
    let pick = null;
    for (const f of FACTIONS) {
      if (!f.raid) continue;
      const rep = this.factionRep(f.id);
      if (rep > f.raid.minRep) continue;
      if (!pick || rep < this.factionRep(pick.id)) pick = f;
    }
    if (!pick) return;
    const depth = clamp((pick.raid.minRep - this.factionRep(pick.id)) / 40, 0, 1);
    if (this.world.rng() >= clamp((0.25 + depth * 0.55) * this.diff().factionAggro, 0.05, 0.95)) return;
    this.spawnFactionRaid(pick);
  }

  spawnFactionRaid(f) {
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    const score = this.techTierScore();
    const n = clamp(Math.round((1 + Math.floor(score * 0.8) + Math.floor(this.dwarves.length / 7)) * f.raid.size), 1, 9);
    const edge = this.randomEdgeTile(true);
    if (!edge) return;
    const kinds = FACTION_RAIDER_KINDS[f.raid.motive] || FACTION_RAIDER_KINDS.slay;
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 14; t++) {
        const x = clamp(edge.x + randint(this.world.rng, -3, 3), 0, this.world.w - 1);
        const y = clamp(edge.y + randint(this.world.rng, -3, 3), 0, this.world.h - 1);
        if (this.world.isWalkable(x, y, 0, true)) {
          const kind = kinds[randint(this.world.rng, 0, kinds.length - 1)];
          const e = new Enemy(kind, x, y, 0);
          e.factionId = f.id; e.motive = f.raid.motive;
          e.color = f.color; e.name = `${f.name} ${ENEMY_TYPES[kind].name}`;
          if (f.raid.motive === "plunder") { e.lootGoal = 2; e.loot = 0; e.looted = []; }
          this.enemies.push(e); spawned++;
          break;
        }
      }
    }
    if (!spawned) return;
    const motiveTxt = f.raid.motive === "plunder" ? "to plunder your stores" : "to drive you from the greenwood";
    this.log(`${f.icon} The ${f.name} raid the colony — ${spawned} warriors, ${motiveTxt}!`, "bad", "faction");
    if (window.App) window.App.toast(`${f.icon} ${f.name} attack!`);
    if (colonyDB) colonyDB.logEvent(`${f.name} raided the colony`, day);
    this.triggerAutoPause(`${f.name} are raiding the colony`);
  }

  // A looter's turn: grab stockpile goods, then run for the map edge. Cornered
  // by an elf it fights back, but otherwise it wants loot, not battle.
  updatePlunderer(e, dt) {
    const w = this.world;
    const tgt = this.nearestDwarf(e.x, e.y, 0);
    if (tgt) {
      const adj = Math.max(Math.abs(e.tileX - tgt.tileX), Math.abs(e.tileY - tgt.tileY)) <= 1;
      if (adj) {
        e.facing = tgt.x > e.x ? 1 : -1; e.path = null;
        if (e.attackCd <= 0) { e.attackCd = 1.1; this.enemyHitDwarf(e, tgt); }
        return;
      }
    }
    // standing on something worth taking?
    const here = w.get(e.tileX, e.tileY, 0);
    if (here && here.item && !here.item.hauled) {
      const it = here.item;
      here.item = null;
      const idx = this.items.indexOf(it);
      if (idx >= 0) this.items.splice(idx, 1);
      e.loot = (e.loot || 0) + 1;
      (e.looted || (e.looted = [])).push({ kind: it.kind, sub: it.sub });
      this.log(`A ${e.name} loots a stockpile!`, "bad", "faction");
      return;
    }
    // enough loot (or nothing left)? escape with it
    if ((e.loot || 0) >= (e.lootGoal || 2)) {
      if (!e._escaping) {
        e._escaping = true;
        const edge = this.randomEdgeTile(true);
        if (edge) e.setPath(pathTo(w, e.tileX, e.tileY, 0, edge.x, edge.y, 0, true));
      }
      if (!e.path) {
        this.log(`A ${e.name} slips away with ${e.loot} stolen item${e.loot === 1 ? "" : "s"}.`, "bad", "faction");
        this._raidersEscaped = true; e._gone = true; e.hp = 0;
        return;
      }
      e.move(dt);
      return;
    }
    // otherwise make for the nearest item on the ground
    let best = null, bd = Infinity;
    for (const it of this.items) {
      if (it.hauled) continue;
      const d = dist2(it.x, it.y, e.x, e.y);
      if (d < bd) { bd = d; best = it; }
    }
    if (!best) { e.lootGoal = 0; return; } // nothing to take — leave next tick
    e.repath -= dt;
    if (!e.path || e.repath <= 0) {
      e.repath = 0.5;
      const p = pathTo(w, e.tileX, e.tileY, 0, best.x, best.y, 0, true)
        || pathAdjacent(w, e.tileX, e.tileY, 0, best.x, best.y, 0, true);
      if (p) e.setPath(p);
    }
    e.move(dt);
  }

  // A friendly neighbour's goodwill gift (a Storyteller "A neighbour's gift").
  factionGift() {
    const friendly = FACTIONS.filter(f => f.gift && this.factionRep(f.id) >= 25);
    if (!friendly.length) return;
    const f = friendly[randint(this.world.rng, 0, friendly.length - 1)];
    const w = this.world;
    for (const [kind, sub, n] of f.gift.items) {
      for (let i = 0; i < n; i++) {
        const x = w.spawnX + randint(w.rng, -5, 5), y = w.spawnY + randint(w.rng, -5, 5);
        if (w.isWalkable(x, y, 0)) this.jobs.spawnItem(kind, x, y, sub, 0);
      }
    }
    this.applyRep(f.id, 2);
    this.log(`${f.icon} The ${f.name} send a gift of ${f.gift.label}.`, "good", "faction");
    if (window.App) window.App.toast(`${f.icon} Gift from the ${f.name}!`);
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
    document.getElementById("stat-water").textContent = this.countItems(ITEM.WATER) + this.countItems(ITEM.ALE) + this.countItems(ITEM.WINE);
    const f = this.dayFraction() * 24;
    const hh = String(Math.floor(f)).padStart(2, "0");
    const mm = String(Math.floor((f % 1) * 60)).padStart(2, "0");
    const day = Math.floor(this.time / DAY_LENGTH) + 1;
    const icon = this.shift() === "day" ? "☀️" : "🌙";
    const seas = this.season();
    const weatherTxt = this.weather !== "clear" ? ` · ${WEATHER_TYPES[this.weather].icon} ${WEATHER_TYPES[this.weather].name}` : "";
    document.getElementById("stat-clock").textContent = `${icon} Day ${day} · ${hh}:${mm} · ${seas.icon} ${seas.name}${weatherTxt}`;
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
        threat.innerHTML = `🧟 <b>${this.enemies.length}</b> · 🛡 ${this.soldierCount()}`;
      } else {
        threat.style.display = "none";
      }
    }
    const outbreak = document.getElementById("stat-outbreak");
    if (outbreak) {
      if (day >= 3 || this.raidCount) {
        outbreak.style.display = "";
        outbreak.textContent = `🦠 ${this.outbreakLabel()}`;
      } else {
        outbreak.style.display = "none";
      }
    }
    const doorCtl = document.getElementById("door-ctl");
    if (doorCtl) doorCtl.style.display = this.doorTiles.length ? "" : "none";
    const apBtn = document.getElementById("autopause-btn");
    if (apBtn) {
      apBtn.classList.toggle("on", this.autoPause);
      apBtn.textContent = this.autoPause ? "🔔" : "🔕";
      apBtn.setAttribute("aria-label", this.autoPause ? "Disable auto-pause on crises" : "Enable auto-pause on crises");
    }
    const zCtl = document.getElementById("zlevel-ctl");
    if (zCtl) {
      zCtl.style.display = this.world.minZ < 0 ? "" : "none";
      const zLabel = document.getElementById("stat-zlevel");
      if (zLabel) zLabel.textContent = this.viewZ === 0 ? "⛰️ Surface" : `⛰️ B${-this.viewZ}`;
      const zUp = document.getElementById("zlevel-up"), zDown = document.getElementById("zlevel-down");
      if (zUp) zUp.disabled = this.viewZ >= 0;
      if (zDown) zDown.disabled = !this.world.levels.has(this.viewZ - 1);
    }
    this.renderColonistBar();
  }

  // Bottom-center portrait strip (RimWorld-style colonist bar) — click one to
  // select it and jump the camera there, same as a Colony-tab roster row.
  renderColonistBar() {
    const el = document.getElementById("colonistbar");
    if (!el) return;
    let html = "";
    this.dwarves.forEach((d, i) => {
      const hap = d.happiness != null ? d.happiness : 60;
      const face = hap > 70 ? "😀" : hap > 45 ? "🙂" : hap > 25 ? "😕" : "😣";
      const sel = this.selectedDwarf === d ? " sel" : "";
      const badge = d.infected ? "🧟" : d.vampireExposed ? "🧛" : d.wounded ? "🩹" : d.military ? "⚔️" : "";
      html += `<div class="cbar-chip${sel}" data-idx="${i}" title="${d.name} — ${professionOf(d)}">
        <span class="cbar-face" style="background:${d.color}">${face}</span>
        <span class="cbar-name">${d.name.split(" ")[0]}</span>
        ${badge ? `<span class="cbar-badge">${badge}</span>` : ""}
      </div>`;
    });
    el.innerHTML = html;
    el.querySelectorAll(".cbar-chip").forEach(chip => {
      chip.onclick = () => {
        const d = this.dwarves[+chip.dataset.idx];
        this.selectedDwarf = d; this.selectedTile = null; this.selectedAnimal = null;
        this.setViewZ(d.z);
        this.cam.x = d.x; this.cam.y = d.y;
        this.updatePanel();
        this.renderColonistBar();
      };
    });
  }

  setPanelTab(tab) {
    this.panelTab = tab;
    this._recordsLoaded = false;
    this._statsLoaded = false;
    this.updatePanel();
  }

  updatePanel() {
    const c = document.getElementById("panel-content");
    if (!c) return;
    document.querySelectorAll(".ptab").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === this.panelTab));
    if (this.panelTab === "stock") this.renderStock(c);
    else if (this.panelTab === "schedule") this.renderSchedule(c);
    else if (this.panelTab === "records") this.renderRecords(c);
    else if (this.panelTab === "log") this.renderLog(c);
    else if (this.panelTab === "research") this.renderResearch(c);
    else if (this.panelTab === "stats") this.renderStats(c);
    else if (this.panelTab === "factions") this.renderFactions(c);
    else this.renderColony(c);
  }

  // Neighbouring factions: standing, disposition, tastes and raid threat.
  renderFactions(c) {
    let html = `<h2>Neighbours</h2>
      <div class="sched-note">Reputation rises as you trade and falls when you sell arms to a rival or cut down their raiders. High standing means better prices and gifts; push a neighbour far enough and it will come raiding.</div>`;
    for (const f of FACTIONS) {
      const rep = this.factionRep(f.id);
      const tier = factionTier(rep);
      const pct = clamp((rep + 100) / 2, 0, 100);
      const rival = f.rival ? FACTION_BY_ID[f.rival] : null;
      const buys = f.buys.map(k => ITEM_LABEL[k] || k).join(", ");
      const raiding = rep <= f.raid.minRep;
      const motiveTxt = f.raid.motive === "plunder" ? "plunder your stores" : "burn the colony";
      html += `<div class="faction-card">
        <div class="fac-top"><span class="fac-icon" style="color:${f.color}">${f.icon}</span>
          <span class="fac-name">${f.name}</span>
          <span class="fac-tier" style="color:${tier.color}">${tier.name}</span></div>
        <div class="bar fac-bar"><i style="width:${pct}%;background:${tier.color}"></i></div>
        <div class="mini">${f.blurb}</div>
        <div class="mini">Buys: <b>${buys}</b>${rival ? ` · Rival: <b>${rival.icon} ${rival.name}</b>` : ""}</div>
        <div class="mini" style="color:${raiding ? "#e0553a" : "#b7a988"}">${raiding
          ? `⚔ Will raid — motive: ${motiveTxt}`
          : `🕊 At peace (raids below ${f.raid.minRep} standing)`}</div>
      </div>`;
    }
    c.innerHTML = html;
  }

  // Hand a specific weapon to a specific elf, taking it from the colony's spares
  // and dropping whatever they were holding. The manual counterpart to
  // JobManager.assignEquip, which only ever upgrades automatically.
  equipWeaponFor(dwarf, subId) {
    if (!dwarf) return false;
    if ((dwarf.weapon || null) === (subId || null)) return false;
    if (subId) {
      const spare = this.items.find(it => it.kind === ITEM.WEAPON && it.sub === subId && !it.hauled);
      if (!spare) return false;
      const t = this.world.get(spare.x, spare.y, spare.z || 0);
      if (t && t.item === spare) t.item = null;
      const idx = this.items.indexOf(spare);
      if (idx >= 0) this.items.splice(idx, 1);
    }
    if (dwarf.job) this.jobs.cancel(dwarf);   // don't equip mid-task
    if (dwarf.weapon) {
      // put the old one back on the ground where they stand
      this.jobs.spawnItem(ITEM.WEAPON, dwarf.tileX, dwarf.tileY, dwarf.weapon, dwarf.z || 0);
    }
    dwarf.weapon = subId || null;
    if (!subId) dwarf.quiver = 0;
    const label = subId ? (STOCK_SUB_LABELS[subId] || subId) : null;
    this.log(`${dwarf.name} ${label ? `takes up a ${label}` : "puts their weapon down"}.`, "", "colony");
    if (window.sound) window.sound.play("equip", 0);
    this.updatePanel();
    return true;
  }

  // Colony-wide inventory. Before this the only stock you could see was the
  // five counters in the top bar; everything else — bars, arms, ammunition,
  // components — meant hunting the map for piles and counting by eye.
  renderStock(c) {
    const itemCount = (kind, sub) => this.countItems(kind, sub);
    const equipped = {};
    for (const d of this.dwarves) {
      if (d.weapon) equipped[d.weapon] = (equipped[d.weapon] || 0) + 1;
      if (d.armor) equipped[d.armor] = (equipped[d.armor] || 0) + 1;
    }
    const stored = this.items.filter(it => {
      const t = this.world.get(it.x, it.y, it.z || 0);
      return t && t.stockpile;
    }).length;

    const row = (icon, label, n, note) =>
      `<div class="stock-row${n ? "" : " empty"}">
         <span class="sk-ico">${icon}</span><span class="sk-lbl">${label}</span>
         <b>${n}</b>${note ? `<span class="sk-note">${note}</span>` : ""}
       </div>`;
    const group = (title, rows) =>
      `<div class="mini2">${title}</div><div class="stock-grid">${rows.join("")}</div>`;

    const materials = [
      row("🪵", "Wood logs", itemCount(ITEM.WOOD)),
      row("🪨", "Stone", itemCount(ITEM.STONE)),
      row("⬜", "Marble", itemCount(ITEM.MARBLE)),
      row("⚙️", "Components", itemCount(ITEM.COMPONENT)),
      row("🧵", "Cloth", itemCount(ITEM.CLOTH)),
    ];
    const metal = [
      row("⛏️", "Iron ore", itemCount(ITEM.ORE, "iron")),
      row("⛏️", "Gold ore", itemCount(ITEM.ORE, "gold")),
      row("⛏️", "Coal", itemCount(ITEM.ORE, "coal")),
      row("🔩", "Iron bars", itemCount(ITEM.BAR, "iron")),
      row("🔩", "Gold bars", itemCount(ITEM.BAR, "gold")),
      row("⚡", "Circuits", itemCount(ITEM.CIRCUIT)),
    ];
    const food = [
      row("🍄", "Food", itemCount(ITEM.FOOD)),
      row("💧", "Water", itemCount(ITEM.WATER)),
      row("🍺", "Ale", itemCount(ITEM.ALE)),
      row("🍷", "Wine", itemCount(ITEM.WINE)),
    ];

    // Arms: weapons and armour by type, then the ammunition the ranged ladder
    // burns through — the thing you most need to see during a raid.
    const weaponSubs = ["club", "knife", "stone_spear", "shortbow", "bow", "rifle", "laser_blade", "laser_rifle"];
    const weaponRows = weaponSubs
      .map(subId => {
        const n = itemCount(ITEM.WEAPON, subId);
        const eq = equipped[subId] || 0;
        if (!n && !eq) return null;
        return row(STOCK_SUB_ICONS[subId] || "🗡️", STOCK_SUB_LABELS[subId] || subId, n, eq ? `${eq} equipped` : "");
      })
      .filter(Boolean);
    const armorSubs = ["cloak", "shield", "mail", "reinforced_mail"];
    const armorRows = armorSubs
      .map(subId => {
        const n = itemCount(ITEM.ARMOR, subId);
        const eq = equipped[subId] || 0;
        if (!n && !eq) return null;
        return row("🛡️", STOCK_SUB_LABELS[subId] || subId, n, eq ? `${eq} worn` : "");
      })
      .filter(Boolean);
    const ammoKinds = [[ITEM.ARROW, "🏹"], [ITEM.BULLET, "🔫"], [ITEM.CELL, "🔋"]];
    const ammoRows = ammoKinds.map(([kind, icon]) => {
      const n = itemCount(kind);
      const shots = n * (AMMO_SHOTS[kind] || 1);
      return row(icon, ITEM_LABEL[kind], n, shots ? `${shots} shots` : "");
    });
    const outOfAmmo = this.dwarves.filter(d => d.military && RANGED_WEAPONS[d.weapon] && d.quiver === 0).length;

    let html = `<h2>Stock</h2>
      <div class="mini">${this.items.length} items in the colony · <b>${stored}</b> on stockpile tiles</div>
      <div class="sched-note">Everything you own, by type. Stockpiles keep it tidy, but items on the ground still count.</div>`;
    html += group("🧱 Materials", materials);
    html += group("🔩 Metal &amp; circuits", metal);
    html += group("🍄 Food &amp; drink", food);
    html += group("⚔️ Arms",
      (weaponRows.length || armorRows.length ? weaponRows.concat(armorRows)
        : [row("🗡️", "No weapons or armour", 0, "craft clubs at a Crafting Bench")]));
    html += group("🏹 Ammunition", ammoRows);
    if (outOfAmmo) {
      html += `<div class="stock-warn">⚠️ ${outOfAmmo} archer${outOfAmmo > 1 ? "s" : ""} out of ammunition — queue more at the bench.</div>`;
    }
    c.innerHTML = html;
  }

  // What a technology actually puts in your hands: the recipes it gates, plus
  // any build tool or zone it reveals (the reverse of TOOL_TECH).
  techUnlocks(id) {
    const out = [];
    for (const bench in RECIPES) {
      for (const r of RECIPES[bench]) if (r.tech === id) out.push(r.name);
    }
    for (const key in TOOL_TECH) {
      if (TOOL_TECH[key] === id && TECH_UNLOCK_LABELS[key]) out.push(TECH_UNLOCK_LABELS[key]);
    }
    return out;
  }

  renderResearch(c) {
    const rate = this.researchRate();
    const doneCount = TECHS.filter(t => this.hasTech(t.id)).length;
    const pct = Math.round((doneCount / TECHS.length) * 100);
    let html = `<h2>Research</h2>
      <div class="res-hdr">🔬 <b>${Math.floor(this.research)}</b> points
        <span class="res-rate">+${rate.toFixed(1)}/s</span></div>
      <div class="res-progress" title="${doneCount} of ${TECHS.length} researched"><i style="width:${pct}%"></i></div>
      <div class="mini">${doneCount} of ${TECHS.length} technologies researched</div>
      <div class="sched-note">Points accrue from your elves' intellect and Study zones. Spend them to unlock buildings, zones, arms and efficiency bonuses.</div>
      <div class="tech-list">`;
    // Group by tier. The ceiling is derived from the data so a new top tier can
    // never silently fall off the bottom of the list again.
    const maxTier = TECHS.reduce((m, t) => Math.max(m, t.tier), 1);
    for (let tier = 1; tier <= maxTier; tier++) {
      const inTier = TECHS.filter(t => t.tier === tier);
      if (!inTier.length) continue;
      // Tiers collapse: a finished tier is just noise once you have moved on.
      const doneInTier = inTier.filter(t => this.hasTech(t.id)).length;
      const open = this.techTierIsOpen(tier, inTier);
      html += `<button class="tech-tier${open ? "" : " closed"}" data-tier="${tier}" aria-expanded="${open}">
          <span class="tt-arrow">${open ? "▾" : "▸"}</span><span>Tier ${tier}</span>
          <span class="tt-count">${doneInTier}/${inTier.length}</span>
        </button>`;
      if (!open) continue;
      for (const t of inTier) {
        const isDone = this.hasTech(t.id);
        const met = this.techPrereqsMet(t);
        const afford = this.research >= t.cost;
        const state = isDone ? "done" : !met ? "locked" : afford ? "ready" : "poor";
        const reqTxt = (t.requires || []).length
          ? `<div class="tech-req">Requires: ${t.requires.map(r => TECH_BY_ID[r] ? TECH_BY_ID[r].name : r).join(", ")}</div>` : "";
        const unlocks = isDone ? [] : this.techUnlocks(t.id);
        const unlockTxt = unlocks.length ? `<div class="tech-unlocks">🔓 ${unlocks.join(" · ")}</div>` : "";
        html += `<div class="tech ${state}" data-tech="${t.id}">
          <div class="tech-top"><span class="tech-name">${t.icon} ${t.name}</span>
            <span class="tech-cost">${isDone ? "✓ done" : t.cost + " pts"}</span></div>
          <div class="tech-desc">${t.desc}</div>${unlockTxt}${reqTxt}</div>`;
      }
    }
    html += `</div>`;
    c.innerHTML = html;
    c.querySelectorAll(".tech.ready").forEach(el => {
      el.onclick = () => { this.buyTech(TECH_BY_ID[el.dataset.tech]); };
    });
    c.querySelectorAll(".tech-tier").forEach(btn => {
      btn.onclick = () => this.toggleTechTier(+btn.dataset.tier);
    });
  }

  // A tier stays open if the player opened it; otherwise the one you are still
  // working on is open and finished tiers are collapsed.
  techTierIsOpen(tier, inTier) {
    if (this.techTierOpen && this.techTierOpen[tier] !== undefined) return !!this.techTierOpen[tier];
    return !inTier.every(t => this.hasTech(t.id));
  }

  toggleTechTier(tier) {
    const inTier = TECHS.filter(t => t.tier === tier);
    this.techTierOpen[tier] = !this.techTierIsOpen(tier, inTier);
    try { localStorage.setItem("ee_tech_tiers", JSON.stringify(this.techTierOpen)); } catch (e) {}
    this.updatePanel();
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
    // One line of triage: with twenty elves the per-row badges mean scanning.
    const wounded = this.dwarves.filter(d => d.wounded).length;
    const infected = this.dwarves.filter(d => d.infected).length;
    const starving = this.dwarves.filter(d => d.hunger > 70).length;
    const parched = this.dwarves.filter(d => d.thirst > 70).length;
    const bits = [];
    if (wounded) bits.push(`<span class="cs-bad">🩹 ${wounded} wounded</span>`);
    if (infected) bits.push(`<span class="cs-bad">🧟 ${infected} infected</span>`);
    if (starving) bits.push(`<span class="cs-warn">🍄 ${starving} starving</span>`);
    if (parched) bits.push(`<span class="cs-warn">💧 ${parched} parched</span>`);
    const unburied = this.items.filter(it => it.kind === ITEM.CORPSE).length;
    if (unburied) bits.push(`<span class="cs-warn">⚰️ ${unburied} awaiting burial</span>`);
    const status = bits.length
      ? `<div class="colony-status">${bits.join(" · ")}</div>`
      : `<div class="colony-status ok">🙂 all ${this.dwarves.length} elves are well</div>`;
    let html = `<h2>Colony · ${this.dwarves.length}</h2>${status}<div id="dwarf-list">`;
    this.dwarves.forEach((d, i) => {
      const hap = d.happiness != null ? d.happiness : 60;
      const hapColor = hap > 60 ? "#7ec86a" : hap > 35 ? "#e0b158" : "#e08a6a";
      const face = hap > 70 ? "😀" : hap > 45 ? "🙂" : hap > 25 ? "😕" : "😣";
      const sel = (this.selectedDwarf === d || this.selectedSquad.includes(d)) ? " sel" : "";
      html += `
        <div class="dwarf-row${sel}" data-idx="${i}">
          <span class="swatch" style="background:${d.color}"></span>
          <span class="dname">${d.name}${d.wounded ? " 🩹" : ""}${d.infected ? " 🧟" : ""}${d.manualOrder ? " 🎯" : ""} <span class="hap-face" title="Happiness ${Math.round(hap)}">${face}</span>
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
        this.selectedDwarf = d; this.selectedTile = null; this.selectedAnimal = null;
        this.selectedSquad = d.military ? [d] : [];
        this.setViewZ(d.z);
        this.cam.x = d.x; this.cam.y = d.y; this.updatePanel();
        this.renderColonistBar();
      };
    });
    this.wireInspector(c);
  }

  // Attach handlers for interactive controls inside the inspector.
  wireInspector(c) {
    c.querySelectorAll("[data-equip]").forEach(btn => {
      btn.onclick = () => {
        const d = this.selectedDwarf;
        if (d) this.equipWeaponFor(d, btn.dataset.equip || null);
      };
    });
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
    const orderRelease = c.querySelector("#insp-order-release");
    if (orderRelease && this.selectedDwarf) {
      orderRelease.onclick = () => {
        this.selectedDwarf.manualOrder = null;
        this.log(`${this.selectedDwarf.name} is released to automatic AI.`, "", "combat");
        this.updatePanel();
      };
    }
    const squadRelease = c.querySelector("#insp-squad-release");
    if (squadRelease) {
      squadRelease.onclick = () => {
        for (const d of this.selectedSquad) d.manualOrder = null;
        this.log(`Squad released to automatic AI.`, "", "combat");
        this.updatePanel();
      };
    }
    // Group labor chips: cycle the priority for every elf in the selection.
    if (this.selectedSquad && this.selectedSquad.length > 1) {
      c.querySelectorAll(".sd-labors .chip").forEach(chip => {
        chip.onclick = () => {
          const id = chip.dataset.labor;
          const labor = LABORS.find(l => l.id === id);
          const lowest = Math.min(...this.selectedSquad.map(d => d.laborPriority?.[id] ?? (d.labors.has(id) ? 3 : 0)));
          const next = (lowest + 1) % 4;
          for (const d of this.selectedSquad) {
            d.laborPriority = d.laborPriority || {};
            d.laborPriority[id] = next;
            if (next) d.labors.add(id); else d.labors.delete(id);
            if (d.job) this.jobs.cancel(d); // re-evaluate role next tick
          }
          this.log(`${labor ? labor.name : id} priority set to ${next || "off"} for ${this.selectedSquad.length} elves.`, "", "order");
          this.updatePanel();
        };
      });
    }
    if (this.selectedTile) {
      const tile = this.world.get(this.selectedTile.x, this.selectedTile.y, this.selectedTile.z || 0);
      c.querySelectorAll(".recipe-btn").forEach(btn => {
        btn.onclick = () => {
          tile.workshopRecipe = +btn.dataset.recipe;
          tile.workshopProduced = 0;
          this.jobs.reindex();
          this.updatePanel();
        };
      });
      const billTarget = c.querySelector("#bill-target");
      if (billTarget) billTarget.onchange = () => {
        tile.workshopTarget = Math.max(0, Math.floor(+billTarget.value || 0));
        if (!tile.workshopTarget) tile.workshopProduced = 0;
        this.jobs.reindex();
        this.updatePanel();
      };
      const doorBtn = c.querySelector("#insp-door-lock");
      if (doorBtn && tile.built === B.DOOR) {
        doorBtn.onclick = () => {
          tile.doorLocked = !tile.doorLocked;
          this.log(`Door ${tile.doorLocked ? "locked" : "unlocked"}.`, "", "order");
          this.updatePanel();
        };
      }
      c.querySelectorAll(".stockfilter-btn").forEach(btn => {
        btn.onclick = () => {
          this.setStockpileFilter(this.selectedTile.x, this.selectedTile.y, this.selectedTile.z || 0, btn.dataset.filter || null);
          this.updatePanel();
        };
      });
    }
  }

  relationshipsHTML(d) {
    const partner = d.partnerId ? this.dwarves.find(o => o.dbId === d.partnerId) : null;
    const entries = Object.entries(d.relationships || {})
      .map(([dbId, rel]) => ({ dwarf: this.dwarves.find(o => o.dbId === dbId), affinity: rel.affinity }))
      .filter(e => e.dwarf && Math.abs(e.affinity) >= 25 && e.dwarf.dbId !== d.partnerId)
      .sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity))
      .slice(0, 3);
    let html = partner ? `<div class="mini">💞 Partner: <b>${partner.name}</b></div>` : "";
    if (!entries.length && !partner) return html || `<div class="mini" style="opacity:.6">No notable relationships yet.</div>`;
    for (const e of entries) {
      html += `<div class="mini">${relationshipLabel(e.affinity)}: ${e.dwarf.name} <span class="tag">${Math.round(e.affinity)}</span></div>`;
    }
    return html;
  }

  inspectorHTML() {
    if (this.selectedSquad && this.selectedSquad.length > 1) {
      const group = this.selectedSquad;
      const names = group.map(d => d.name).join(", ");
      const soldiers = group.filter(d => d.military).length;
      const allMilitary = soldiers === group.length;
      const chips = LABORS.map(l => {
        const lowest = Math.min(...group.map(d => d.laborPriority?.[l.id] ?? (d.labors.has(l.id) ? 3 : 0)));
        return `<span class="chip p${lowest}${lowest ? " on" : ""}" data-labor="${l.id}" title="${l.name} priority ${lowest || "off"} — click to set for all ${group.length} elves">${l.icon}<b>${lowest || "–"}</b></span>`;
      }).join("");
      return `<b>Group selected</b> <span class="tag">👥 ${group.length} elves</span>${soldiers ? ` <span class="tag" style="background:#6b2f2f">⚔ ${soldiers} soldier${soldiers > 1 ? "s" : ""}</span>` : ""}<br/>
        <div class="mini">${this.escapeHtml(names)}</div>
        ${allMilitary ? `<div class="mini" style="opacity:.75">Click anywhere on the ground to send them there — they'll hold that
        position and fight anything that comes adjacent, instead of chasing the nearest raider on their own.</div>
        <button class="mini-btn" id="insp-squad-release">Release to automatic AI</button>` : ""}
        <div class="mini2">Labors · applies to all ${group.length} selected elves</div>
        <div class="sd-labors">${chips}</div>
        <div class="mini" style="opacity:.6">Click a labor to cycle its priority (off → 1 → 2 → 3) for the whole group.</div>`;
    }
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
      const gearNames = { club: "Wooden club", knife: "Stone knife", shortbow: "Short bow", stone_spear: "Stone spear", sword: "Iron sword", axe: "Iron axe", laser_blade: "Laser blade", bow: "Bow", rifle: "Iron rifle", laser_rifle: "Laser rifle", cloak: "Cloth cloak", shield: "Shield", mail: "Mail", reinforced_mail: "Reinforced mail" };
      const gear = [d.weapon ? "🗡 " + (gearNames[d.weapon] || d.weapon) : null, d.armor ? "🛡 " + (gearNames[d.armor] || d.armor) : null].filter(Boolean).join(" · ");
      const rwInfo = RANGED_WEAPONS[d.weapon];
      const quiverTxt = rwInfo ? ` <span class="tag">🏹 ${d.quiver}/20 ${rwInfo.label}</span>` : "";
      // Weapons this elf could take up right now: anything lying around, plus
      // whatever they are already holding.
      const spareCounts = {};
      for (const it of this.items) {
        if (it.kind !== ITEM.WEAPON || it.hauled || !it.sub) continue;
        spareCounts[it.sub] = (spareCounts[it.sub] || 0) + 1;
      }
      if (d.weapon) spareCounts[d.weapon] = (spareCounts[d.weapon] || 0) + 1;
      const equipSubs = Object.entries(spareCounts).sort((a, b) => (WEAPON_RANK[a[0]] ?? 0) - (WEAPON_RANK[b[0]] ?? 0));
      const inventory = (d.inventory || []).map(item => ARTIFACT_BY_ID[item.id]).filter(Boolean);
      const inventoryHTML = inventory.length ? inventory.map(artifact => {
        const boosts = Object.entries(artifact.bonuses).map(([stat, value]) => `+${value} ${stat}`).join(" · ");
        return `<div class="artifact" title="${this.escapeHtml(artifact.lore)}"><span>${artifact.icon}</span><b>${artifact.name}</b><small>${boosts}</small><div class="mini">${this.escapeHtml(artifact.lore)}</div></div>`;
      }).join("") : `<div class="mini" style="opacity:.6">No Elven artifacts carried.</div>`;
      const traitsHTML = (d.traits || []).map(id => {
        const trait = TRAITS[id];
        return trait ? `<span class="trait" title="${this.escapeHtml(trait.desc)}">${trait.icon} ${trait.name}</span>` : "";
      }).join("");
      return `
        <b>${d.name}</b> <span class="tag">${professionOf(d)}</span>${d.military ? ' <span class="tag" style="background:#6b2f2f">⚔ soldier</span>' : ""}${d.wounded ? ' <span class="tag" style="background:#6b2f2f">🩹 wounded</span>' : ""}${d.infected ? ' <span class="tag" style="background:#2f6b3a">🧟 infected</span>' : ""}<br/>
        Task: ${this.taskLabel(d)} <span class="tag">${d.activity}</span><br/>
        <div class="mini">Happiness <b>${Math.round(d.happiness != null ? d.happiness : 60)}</b> · HP ${Math.round(d.hp)} · Mood ${Math.round(d.mood)} · Hunger ${Math.round(d.hunger)} · Thirst ${Math.round(d.thirst)} · Energy ${Math.round(d.energy)}</div>
        ${d.infected ? `<div class="mini" style="color:#8fd08f">🧟 Fighting the infection — ${Math.max(0, Math.round(d.infectionTimer))}s until it takes hold</div>` : ""}
        ${gear ? `<div class="mini">Equipped: ${gear}${quiverTxt}</div>` : ""}
        ${rwInfo && d.quiver === 0 ? `<div class="mini" style="color:#e08a6a">Out of ammo — craft more ${rwInfo.label} at the ${rwInfo.bench || "Weapons"} Bench so they can shoot.</div>` : ""}
        <div class="mini2">Traits</div><div class="trait-list">${traitsHTML || `<span class="mini">No traits recorded.</span>`}</div>
        ${d.carrying ? "Carrying: " + ITEM_LABEL[d.carrying.kind] + "<br/>" : ""}
        <div class="mini2">Inventory · ${inventory.length}</div>${inventoryHTML}
        <div class="thought">“${d.thought || "..."}”</div>
        <div class="mini2">Equipment</div>
        <div class="mini">Holding ${d.weapon ? `<b>${gearNames[d.weapon] || d.weapon}</b>` : "<b>nothing</b>"}${d.armor ? ` · wearing <b>${gearNames[d.armor] || d.armor}</b>` : ""}</div>
        <div class="equip-row">
          <button class="recipe-btn${d.weapon ? "" : " on"}" data-equip="">Bare hands</button>
          ${equipSubs.map(([subId, n]) => `<button class="recipe-btn${d.weapon === subId ? " on" : ""}" data-equip="${subId}">${gearNames[subId] || subId}${n > 1 ? ` ×${n}` : ""}</button>`).join("")}
        </div>
        <button class="mini-btn" id="insp-military">${d.military ? "Stand down" : "⚔ Enlist as soldier"}</button>
        ${d.military && d.manualOrder ? `<div class="mini">🎯 Holding a manual position order</div><button class="mini-btn" id="insp-order-release">Release to automatic AI</button>` : ""}
        <div class="mini2">Relationships</div>${this.relationshipsHTML(d)}
        <div class="mini2">Skills</div>${sk}`;
    }
    if (this.selectedAnimal) {
      const a = this.selectedAnimal;
      const info = ANIMAL_TYPES[a.kind] || {};
      const owner = a.ownerId ? this.dwarves.find(d => d.dbId === a.ownerId) : null;
      return `<b>${info.name || a.kind}</b> <span class="tag">${a.tamed ? "🐾 tamed" : "wild"}</span><br/>
        ${owner ? `Bonded to: <b>${owner.name}</b><br/>` : ""}
        <div class="mini">${a.tamed
          ? "Roams near its owner and lifts the mood of any elf spending time nearby."
          : "Skittish. A dwarf with the Taming labor may approach and win it over."}</div>`;
    }
    if (this.selectedTile) {
      const t = this.selectedTile;
      const tile = this.world.get(t.x, t.y, t.z || 0);
      const parts = [`<b>Tile ${t.x}, ${t.y}</b>${t.z ? ` <span class="tag">B${-t.z}</span>` : ""}`];
      const matInfo = tile.buildMaterial && MATERIALS[tile.buildMaterial];
      const wallLabel = matInfo ? `${matInfo.name.toLowerCase()} wall` : "stone wall";
      parts.push(`Terrain: <span class="tag">${tile.built === B.WALL ? wallLabel : tile.built === B.DOOR ? "door" : tile.kind}</span>`);
      if (matInfo && (tile.built === B.WALL || tile.built === B.FLOOR || tile.built === B.DOOR)) {
        parts.push(`Material: <span class="tag">${matInfo.icon} ${matInfo.name}</span>`);
      }
      if (tile.ore) parts.push(`Ore: <span class="tag" style="color:${ORE_COLOR[tile.ore]}">${tile.ore}</span>`);
      if (tile.feature) parts.push(`Plant: <span class="tag">${tile.feature}</span>`);
      if (tile.feature === F.CROP) parts.push(`Growth: <span class="tag">${Math.round(tile.growth * 100)}%</span>`);
      if (tile.furniture === FURN.GENERATOR || tile.furniture === FURN.ICEBOX || tile.furniture === FURN.WATCHTOWER || tile.furniture === FURN.TRAP || tile.furniture === FURN.TORCH || tile.furniture === FURN.LANTERN || tile.furniture === FURN.LAMP) {
        const info = FURN_INFO[tile.furniture];
        parts.push(`Furniture: <span class="tag">${info.icon} ${info.name}</span>`);
        if (tile.furniture === FURN.ICEBOX) {
          parts.push(`Power: <span class="tag" style="color:${tile.powered ? "#8fd0ff" : "#e08a6a"}">${tile.powered ? "⚡ powered" : "unpowered"}</span>`);
          if (tile.powered) parts.push(`<div class="mini">Slows spoilage for food within ${ESSENCE_CHILL_RADIUS} tiles.</div>`);
        } else if (tile.furniture === FURN.LAMP) {
          parts.push(`Power: <span class="tag" style="color:${tile.powered ? "#8fd0ff" : "#e08a6a"}">${tile.powered ? "⚡ powered" : "unpowered"}</span>`);
          parts.push(`<div class="mini">Brightens ${LIGHTS.lamp.radius} tiles while an Essence Well powers its conduit network.</div>`);
        } else if (tile.furniture === FURN.TORCH) {
          parts.push(`<div class="mini">Pushes back the dark for ${LIGHTS.torch.radius} tiles.</div>`);
        } else if (tile.furniture === FURN.LANTERN) {
          parts.push(`<div class="mini">A steadier, wider light — ${LIGHTS.lantern.radius} tiles.</div>`);
        } else if (tile.furniture === FURN.WATCHTOWER) {
          parts.push(`<div class="mini">A soldier fighting from here deals ${Math.round((WATCHTOWER_ATK_MULT - 1) * 100)}% more damage, takes ${Math.round((1 - WATCHTOWER_DEF_MULT) * 100)}% less, and shoots 2 tiles farther.</div>`);
        } else if (tile.furniture === FURN.TRAP) {
          const ready = !tile.trapCooldown || tile.trapCooldown <= 0;
          parts.push(`Status: <span class="tag" style="color:${ready ? "#8fd08f" : "#e08a6a"}">${ready ? "armed" : `resetting (${Math.ceil(tile.trapCooldown)}s)`}</span>`);
        }
      } else if (tile.furniture) {
        parts.push(`Furniture: <span class="tag">${tile.furniture}</span>`);
        if (matInfo) parts.push(`Material: <span class="tag">${matInfo.icon} ${matInfo.name}</span>`);
      }
      if (tile.conduit) parts.push(`<span class="tag" style="color:${tile.powered ? "#c9a8ff" : "#9c8a64"}">🔗 conduit · ${tile.powered ? "powered" : "dormant"}</span>`);
      if (tile.workshop) {
        const list = RECIPES[tile.workshop] || [];
        parts.push(`Workshop: <span class="tag">${WORKSHOP_INFO[tile.workshop].icon} ${WORKSHOP_INFO[tile.workshop].name}</span>`);
        parts.push(`<div class="mini">Making: <b>${(list[tile.workshopRecipe] || {}).name || "—"}</b></div>`);
        parts.push(`<label class="bill-control">Bill target <input id="bill-target" type="number" min="0" step="1" value="${tile.workshopTarget || 0}" title="0 means repeat forever" /> <span class="mini">${tile.workshopTarget ? `${tile.workshopProduced || 0}/${tile.workshopTarget}` : "forever"}</span></label>`);
        parts.push(`<div class="recipe-row">` + list.map((r, i) =>
          `<button class="recipe-btn${i === (tile.workshopRecipe || 0) ? " on" : ""}" data-recipe="${i}">${r.name}</button>`).join("") + `</div>`);
      }
      if (tile.built === B.DOOR) {
        parts.push(`Door: <span class="tag">${tile.doorLocked ? "🔒 locked" : "🔓 unlocked"}</span>`);
        parts.push(`<button class="mini-btn" id="insp-door-lock">${tile.doorLocked ? "Unlock" : "Lock"} door</button>`);
      }
      if (tile.zone) parts.push(`Zone: <span class="tag">${tile.zone}</span>`);
      if (tile.grave) {
        parts.push(`<div class="grave-note"><span class="gn-cross">✝</span> Here lies <b>${this.escapeHtml(tile.grave.name)}</b>` +
          `${tile.grave.day ? `, who died on day ${tile.grave.day}` : ""}.</div>`);
      }
      if (tile.item && tile.item.kind === ITEM.CORPSE) {
        parts.push(`<div class="grave-note warn"><span class="gn-cross">⚰️</span> The body of <b>${this.escapeHtml(tile.item.name || "an elf")}</b>` +
          `${tile.item.diedDay ? `, fallen on day ${tile.item.diedDay}` : ""} — zone a graveyard and a hauler will lay them to rest.</div>`);
      }
      if (tile.zone === ZONE.BEDROOM || tile.zone === ZONE.DINING) {
        const room = this.roomAt.get(`${t.x},${t.y},${t.z || 0}`);
        if (room) {
          parts.push(`Room: <b>${room.grade} ${room.name}</b> <span class="tag">${room.quality}/100 · ${room.tiles} tiles</span>`);
          if (room.quality < 85) parts.push(`<div class="mini" style="opacity:.7">To raise the grade: ${room.hint}.</div>`);
        }
      }
      if (tile.designation) parts.push(`Designated: <span class="tag">${tile.designation}</span>`);
      if (tile.buildJob) parts.push(`Queued: <span class="tag">${tile.buildKind || "wall"}</span>`);
      if (tile.stockpile) {
        parts.push(`<span class="tag">stockpile</span>`);
        const cat = STOCKPILE_CATEGORIES.find(c => c.id === tile.stockpileFilter);
        parts.push(`Accepts: <span class="tag">${cat ? cat.icon + " " + cat.name : "Anything"}</span>`);
        parts.push(`<div class="recipe-row">
          <button class="stockfilter-btn${!tile.stockpileFilter ? " on" : ""}" data-filter="">All</button>
          ${STOCKPILE_CATEGORIES.map(c => `<button class="stockfilter-btn${tile.stockpileFilter === c.id ? " on" : ""}" data-filter="${c.id}">${c.icon} ${c.name}</button>`).join("")}
        </div>`);
      }
      if (tile.item) {
        const freshTxt = tile.item.kind === ITEM.FOOD && tile.item.freshness != null ? ` · ${Math.round(tile.item.freshness * 100)}% fresh` : "";
        parts.push(`Item: <span class="tag">${ITEM_LABEL[tile.item.kind]}${tile.item.sub ? " (" + tile.item.sub + ")" : ""}${freshTxt}</span>`);
      }
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
          ${LABORS.map(l => {
            const priority = d.laborPriority?.[l.id] ?? (d.labors.has(l.id) ? 3 : 0);
            return `<span class="chip p${priority}${priority ? " on" : ""}" data-labor="${l.id}" title="${l.name} priority ${priority || "off"}">${l.icon}<b>${priority || "–"}</b></span>`;
          }).join("")}
        </div>
        <div class="mini2">Skills</div>
        <div class="skill-grid sched-skills">
          ${SKILL_IDS.map(id => {
            const lv = d.skills[id].level;
            const strong = lv > 0 ? "" : ' style="opacity:.4"';
            return `<div class="skill"${strong} title="${skillTitle(lv)} (${lv}/${MAX_LEVEL})">
              <span>${SKILLS[id].icon} ${SKILLS[id].name}</span><b>${lv}</b></div>`;
          }).join("")}
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
          const next = ((d.laborPriority?.[id] ?? (d.labors.has(id) ? 3 : 0)) + 1) % 4;
          d.laborPriority = d.laborPriority || {};
          d.laborPriority[id] = next;
          if (next) d.labors.add(id); else d.labors.delete(id);
          this.renderSchedule(c);
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
    Promise.all([colonyDB.getAllDwarves(), colonyDB.getEvents(30), colonyDB.getMilestones()]).then(([dwarves, events, milestones]) => {
      const body = document.getElementById("rec-body");
      if (!body) return;
      const byId = new Map(milestones.map(r => [r.id, r]));
      let html = `<div class="mini2">Milestones · ${byId.size}/${MILESTONES.length}</div><div class="milestone-grid">`;
      for (const m of MILESTONES) {
        const rec = byId.get(m.id);
        html += `<div class="milestone${rec ? " on" : ""}" title="${this.escapeHtml(m.desc)}">
          <span class="ms-icon">${rec ? m.icon : "🔒"}</span>
          <span class="ms-name">${m.name}</span>
          ${rec ? `<span class="ms-day">Day ${rec.day}</span>` : ""}
        </div>`;
      }
      html += `</div>`;
      dwarves.sort((a, b) => (b.alive - a.alive) || 0);
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

  // Population sparkline, lifetime production counters, and a cause-of-death
  // breakdown pulled from the same cross-colony database the Records tab uses.
  renderStats(c) {
    if (this._statsLoaded) return;
    this._statsLoaded = true;
    const s = this.stats;
    const pts = this.popHistory.slice(-60);
    const maxPop = Math.max(1, this.dwarves.length, ...pts.map(h => h.pop));
    const chartW = 210, chartH = 56;
    const barW = pts.length ? chartW / pts.length : chartW;
    let bars = "";
    pts.forEach((h, i) => {
      const bh = Math.max(1, (h.pop / maxPop) * chartH);
      bars += `<rect x="${(i * barW).toFixed(1)}" y="${(chartH - bh).toFixed(1)}" width="${Math.max(1, barW - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#8fd0ff"></rect>`;
    });

    let html = `<h2>Colony Stats</h2>
      <div class="mini">Difficulty <b>${difficultyById(this.settings.difficulty).name}</b> · Map <b>${mapSizeById(this.settings.mapSize).name}</b> <span class="tag">${this.world.w} × ${this.world.h}</span></div>
      <div class="mini2">Population over time</div>
      <svg width="${chartW}" height="${chartH}" class="stat-chart">${bars}</svg>
      <div class="mini">Current: <b>${this.dwarves.length}</b> · Peak: <b>${maxPop}</b></div>
      <div class="mini2">Production (this colony)</div>
      <div class="prod-grid">
        <div class="prod-tile">⛏️ <b>${s.mined}</b><span>Stone mined</span></div>
        <div class="prod-tile">🪓 <b>${s.chopped}</b><span>Trees felled</span></div>
        <div class="prod-tile">🌿 <b>${s.gathered}</b><span>Food gathered</span></div>
        <div class="prod-tile">🔨 <b>${s.crafted}</b><span>Items crafted</span></div>
        <div class="prod-tile">🧱 <b>${s.built}</b><span>Structures built</span></div>
        <div class="prod-tile">🦊 <b>${s.tamed}</b><span>Animals tamed</span></div>
      </div>
      <div class="mini2">The Storyteller</div>
      <div class="mini">Pace: <b>${STORY_PACES[storyPaceIndex(this)]}</b> · incidents so far: <b>${this.story.count || 0}</b> · pressure: <b>${Math.floor((this.story.points || 0) * 10) / 10}</b></div>
      <div class="mini">${this.events.filter(e => e.cat === "story").slice(-4).reverse().map(e => `<div>D${e.day} · ${this.escapeHtml(e.text)}</div>`).join("") || "<span style='opacity:.6'>No tales yet.</span>"}</div>
      <div class="mini2">Causes of death · all colonies ever played</div>
      <div id="stat-deaths" class="menu-empty">Loading…</div>`;
    c.innerHTML = html;

    if (!colonyDB) { const el = document.getElementById("stat-deaths"); if (el) el.textContent = "n/a"; return; }
    colonyDB.getAllDwarves().then(list => {
      const el = document.getElementById("stat-deaths");
      if (!el) return;
      const dead = list.filter(r => !r.alive);
      if (!dead.length) { el.className = "menu-empty"; el.textContent = "No losses yet — long may it last."; return; }
      const byCause = {};
      for (const r of dead) { const cause = r.cause || "unknown causes"; byCause[cause] = (byCause[cause] || 0) + 1; }
      const entries = Object.entries(byCause).sort((a, b) => b[1] - a[1]);
      const total = dead.length;
      el.className = "";
      el.innerHTML = entries.map(([cause, n]) => `
        <div class="death-row">
          <span class="death-label">${this.escapeHtml(cause)}</span>
          <div class="bar" style="flex:1"><i style="width:${Math.round(n / total * 100)}%;background:#e08a6a"></i></div>
          <span class="death-count">${n}</span>
        </div>`).join("") + `<div class="mini" style="margin-top:6px">${total} loss${total === 1 ? "" : "es"} across every colony you've played.</div>`;
    }).catch(() => { const el = document.getElementById("stat-deaths"); if (el) el.textContent = "Unavailable."; });
  }

  taskLabel(d) {
    if (d.state === "fight") return "Fighting!";
    if (d.fleeing) return "Fleeing!";
    if (d.state === "sleep") return "Sleeping";
    if (!d.job) return d.state === "wander" ? "Strolling" : "Idle";
    const map = {
      dig: "Mining", chop: "Chopping", gather: "Gathering", build: "Building",
      haul: "Hauling", eat: "Eating", drink: "Drinking", sleep: "Sleeping", train: "Training", socialize: "Socialising",
      craft: "Crafting", equip: "Arming up", plant: "Planting", harvest: "Harvesting",
      recover: "Recovering", doctor: "Treating patient", forest: "Foresting",
      stairsdown: "Carving stairs", tame: "Taming a fox",
    };
    return map[d.job.type] || "Working";
  }
}

// Game creation is driven by the main menu — see js/menu.js.
