// ---- Items & Dwarves --------------------------------------------------------

// Item kinds that can sit on the ground / be hauled / stored.
const ITEM = {
  WOOD: "wood",
  STONE: "stone",
  ORE: "ore",       // subtype in item.sub (iron/gold/coal)
  FOOD: "food",
  BAR: "bar",       // smelted metal bar (sub = iron/gold)
  WEAPON: "weapon", // forged weapon (sub = sword/axe)
  ARMOR: "armor",   // forged armor (sub = shield/mail)
  WATER: "water",   // drawn from a Well
  ALE: "ale",       // brewed from water + food; quenches thirst better
  WINE: "wine",     // brewed from food + food; less thirst-quenching, more mood, more elven
  MARBLE: "marble", // a rare vein found while mining; used directly as a building material, no smelting
  COMPONENT: "component",
  CLOTH: "cloth",
  CIRCUIT: "circuit",
  ARROW: "arrow",   // a bundle of 5 arrows — archer ammunition (see quiver)
};
const ITEM_LABEL = {
  wood: "Wood log", stone: "Stone", ore: "Ore", food: "Food",
  bar: "Metal bar", weapon: "Weapon", armor: "Armor",
  water: "Water", ale: "Ale", wine: "Wine", marble: "Marble",
  component: "Crafting component", cloth: "Cloth", circuit: "Circuit",
  arrow: "Arrow bundle (5)",
};

// Unique Elven relics discovered in deep stone. They remain with the pawn who
// finds them and their bonuses are read live by skill/combat calculations.
const ARTIFACTS = [
  { id: "leaf_crown", name: "Crown of First Leaves", icon: "🍃", lore: "Woven by the first greenwarden, it remembers every living root beneath the empire.", bonuses: { intelligence: 2, mood: 4 } },
  { id: "moon_shard", name: "Moon-Silver Shard", icon: "🌙", lore: "A splinter of the fallen moon, cold to the touch and bright in the dark.", bonuses: { mining: 2, toughness: 1 } },
  { id: "star_lens", name: "Starweaver Lens", icon: "🔭", lore: "The old astronomers used it to read paths through storms and unopened skies.", bonuses: { intelligence: 3, fitness: 1 } },
  { id: "thorn_heart", name: "Heart of the Thorn King", icon: "🌿", lore: "A black seed that beats once whenever danger crosses the forest border.", bonuses: { fighting: 2, toughness: 2 } },
  { id: "dawn_stone", name: "Dawnstone", icon: "🔆", lore: "Its first light was carried from the eastern gate at the founding of the empire.", bonuses: { mood: 8, fitness: 2 } },
];
const ARTIFACT_BY_ID = Object.fromEntries(ARTIFACTS.map(artifact => [artifact.id, artifact]));

// Build materials for walls/floors/doors/furniture: which item (kind[+sub])
// each one consumes, its Build-menu icon/name, and — matching the existing
// decor-mood pattern paintings already use — a small mood bonus for nicer
// ones. "Metal" means iron specifically; gold stays a pure trade commodity.
const MATERIALS = {
  wood:   { name: "Wood",   icon: "🪵" },
  stone:  { name: "Stone",  icon: "🪨" },
  marble: { name: "Marble", icon: "⬜", moodBonus: 2 },
  metal:  { name: "Metal",  icon: "⚙️", moodBonus: 1 },
};
// Resolve a material id to the actual {kind, sub} item it consumes.
function materialItem(id) {
  if (id === "marble") return { kind: ITEM.MARBLE, sub: null };
  if (id === "metal") return { kind: ITEM.BAR, sub: "iron" };
  if (id === "wood") return { kind: ITEM.WOOD, sub: null };
  return { kind: ITEM.STONE, sub: null };
}

// Stockpile filters group item kinds so a pile can be restricted to just one
// kind of goods (e.g. "Arms only") for cleaner logistics.
const STOCKPILE_CATEGORIES = [
  { id: "building", name: "Building", icon: "🧱" },
  { id: "ore", name: "Ore & Bars", icon: "⛏️" },
  { id: "food", name: "Food", icon: "🍄" },
  { id: "drink", name: "Drink", icon: "💧" },
  { id: "arms", name: "Arms", icon: "⚔️" },
];
const STOCKPILE_CATEGORY_OF = {
  wood: "building", stone: "building", marble: "building",
  ore: "ore", bar: "ore",
  food: "food",
  water: "drink", ale: "drink", wine: "drink",
  weapon: "arms", armor: "arms", arrow: "arms", component: "building", cloth: "building", circuit: "ore",
};

class Item {
  constructor(kind, x, y, sub = null, z = 0) {
    this.kind = kind;
    this.sub = sub;      // e.g. ore type
    this.x = x;
    this.y = y;
    this.z = z;          // which level this item rests on
    this.hauled = false; // currently carried / claimed
    this.stored = false; // resting in a stockpile
    this.freshness = 1;  // 1 = fresh .. 0 = spoiled (only meaningful for ITEM.FOOD)
  }
}

// Labors a dwarf can be assigned (map to job types).
const LABORS = [
  { id: "mining",      job: "dig",    name: "Mining",      icon: "⛏️" },
  { id: "woodcutting", job: "chop",   name: "Woodcutting", icon: "🪓" },
  { id: "farming",     job: "gather", name: "Farming",     icon: "🌿" },
  { id: "building",    job: "build",  name: "Building",    icon: "🧱" },
  { id: "crafting",    job: "craft",  name: "Crafting",    icon: "🔨" },
  { id: "hauling",     job: "haul",   name: "Hauling",     icon: "📦" },
  { id: "medicine",    job: "doctor", name: "Doctoring",   icon: "⚕️" },
  { id: "foresting",   job: "forest", name: "Foresting",   icon: "🌲" },
  { id: "taming",      job: "tame",   name: "Taming",      icon: "🐾" },
];
const TRAITS = {
  diligent: { name: "Diligent", icon: "⚒️", desc: "Works 12% faster.", workSpeed: 0.12 },
  lorekeeper: { name: "Lorekeeper", icon: "📚", desc: "Generates 20% more research.", research: 0.2 },
  warbound: { name: "Warbound", icon: "⚔️", desc: "Deals 15% more combat damage.", attack: 0.15 },
  stalwart: { name: "Stalwart", icon: "🛡️", desc: "Takes 12% less damage.", defense: 0.12 },
  kindred: { name: "Kindred", icon: "💬", desc: "Social moments improve mood more strongly.", mood: 4 },
  greenwarden: { name: "Greenwarden", icon: "🌲", desc: "Forest and farming work 15% faster.", nature: 0.15 },
};
function rollTraits(rng) {
  const ids = Object.keys(TRAITS);
  const traits = [];
  while (traits.length < 2 && ids.length) traits.push(ids.splice(Math.floor(rng() * ids.length), 1)[0]);
  return traits;
}
const JOB_LABOR = { dig: "mining", chop: "woodcutting", gather: "farming", build: "building", craft: "crafting", haul: "hauling", plant: "farming", harvest: "farming", doctor: "medicine", forest: "foresting", stairsdown: "mining", rampdown: "mining", drain: "mining", tame: "taming" };

// Schedule activities per shift.
const ACTIVITIES = [
  { id: "work",  name: "Work",   icon: "⚒️" },
  { id: "sleep", name: "Sleep",  icon: "😴" },
  { id: "eat",   name: "Eat",    icon: "🍽️" },
  { id: "drink", name: "Drink",  icon: "💧" },
  { id: "train", name: "Train",  icon: "⚔️" },
  { id: "idle",  name: "Off",    icon: "🎲" },
];

// Relationship affinity (-100..100) -> a human-readable label.
const RELATIONSHIP_THRESHOLDS = [
  [60, "Lover"], [25, "Friend"], [-25, "Acquaintance"], [-60, "Rival"], [-Infinity, "Enemy"],
];
function relationshipLabel(affinity) {
  for (const [min, name] of RELATIONSHIP_THRESHOLDS) if (affinity >= min) return name;
  return "Enemy";
}

// Dwarf state machine: idle -> pathing -> working -> (deliver) -> idle
class Dwarf {
  constructor(name, x, y, color, skills) {
    this.name = name;
    this.x = x;            // tile coords (float during movement)
    this.y = y;
    this.z = 0;            // level (0 = surface, negative = underground)
    this.tx = x;           // current target tile of movement
    this.ty = y;
    this.color = color;
    this.path = null;      // array of {x,y}
    this.pathIdx = 0;
    this.speed = 3.4;      // tiles per second
    this.job = null;       // current Job
    this.state = "idle";
    this.carrying = null;  // Item being carried
    this.workTimer = 0;    // seconds of work remaining on current action
    this.hunger = 0;       // 0 fine .. 100 starving
    this.thirst = 0;       // 0 fine .. 100 parched
    this.energy = 100;     // 100 rested .. 0 exhausted
    this.mood = 70;        // 0 miserable .. 100 ecstatic
    this.happiness = 70;   // overall gauge: health + mood + needs (derived)
    this.facing = 1;       // 1 right, -1 left
    this.facingV = 1;      // 1 toward camera (south), -1 away (north) — picks front/back pose
    this.bob = Math.random() * Math.PI * 2; // walk animation phase
    this.idleWander = 0;
    this.thought = "";     // short status text

    // ---- persistent identity & progression ----
    this.dbId = newDwarfId();
    this.skills = skills || makeSkillSet();

    // ---- labor & schedule ----
    this.labors = new Set(LABORS.map(l => l.id)); // all enabled by default
    this.laborPriority = Object.fromEntries(LABORS.map(l => [l.id, 3])); // 0 off, 1 low, 2 normal, 3 high
    this.traits = [];
    this.schedule = { day: "work", night: "sleep" };
    this.activity = "work";  // resolved from schedule + shift
    this.bed = null;         // {x,y} of an assigned bed while sleeping

    // ---- relationships ----
    this.relationships = {}; // otherDbId -> { affinity: -100..100 }
    this.partnerId = null;   // dbId of current romantic partner, or null

    // ---- health & military ----
    // Toughness raises the hp pool itself — 2 per level, up to +40 at max.
    this.maxhp = 100 + this.skillLevel("toughness") * 2;
    this.hp = this.maxhp;    // 0 = dead
    this.military = false;   // enlisted soldier?
    this.weapon = null;      // equipped weapon sub (sword/axe/bow)
    this.armor = null;       // equipped armor sub (shield/mail)
    this.quiver = 0;         // arrows held by a bowman (bundles refill adds 5)
    this.inventory = [];     // persistent carried relics and other personal items
    this.attackCd = 0;       // swing cooldown
    this.combatRepath = 0;   // throttle for chasing/fleeing pathing
    this.fleeing = false;
    this.manualOrder = null; // {x,y,z} — a player move order overriding the automatic nearest-enemy AI (soldiers only)

    // ---- injuries ----
    this.wounded = false;      // hp dropped low enough to need bed rest to heal
    this.beingTreated = false; // a doctor is currently attending them

    // ---- infection (the outbreak) ----
    this.infected = false;     // bitten by an infectious enemy; racing the clock
    this.infectionTimer = 0;   // counts down to 0 (turns) or up to INFECTION_TIME (cured)

    // ---- vampirism (the outbreak, phase 2 — hidden until exposed) ----
    this.vampiric = false;       // secretly cursed by a Vampire's bite
    this.vampireTimer = 0;       // counts down toward turning; once exposed+treated, counts back up to cure
    this.vampireExposed = false; // a checkup revealed them — now routed to quarantine
    this.checkupCooldown = 0;    // seconds until eligible for another Doctor checkup
    this.beingInspected = false; // a doctor is currently examining them (claim flag, mirrors beingTreated)
  }

  artifactBonus(stat) {
    return (this.inventory || []).reduce((total, item) => total + ((ARTIFACT_BY_ID[item.id]?.bonuses || {})[stat] || 0), 0);
  }
  traitBonus(stat) {
    return (this.traits || []).reduce((total, id) => total + (TRAITS[id]?.[stat] || 0), 0);
  }
  skillLevel(id) { return (this.skills[id] ? this.skills[id].level : 0) + this.artifactBonus(id); }
  // Higher skill => faster work (multiplier applied to divide work time).
  workSpeedMult(skillId) {
    const nature = ["farming", "foresting"].includes(skillId) ? this.traitBonus("nature") : 0;
    return (1 + this.skillLevel(skillId) * 0.05 + nature) * (1 + this.traitBonus("workSpeed"));
  }
  moveSpeedMult() { return 1 + this.skillLevel("fitness") * 0.03; }

  // Damage this dwarf deals per swing (weapon + fighting skill).
  attackDamage() {
    const weaponMult = { club: 1.35, stone_spear: 1.7, sword: 1.9, axe: 1.8, laser_blade: 2.8, bow: 1.15 };
    return (4 + this.skillLevel("fighting") * 0.7) * (this.weapon ? (weaponMult[this.weapon] || 1.9) : 1) * (1 + this.traitBonus("attack"));
  }
  // Incoming damage after armor, skill-based dodge, and Toughness (raw resilience).
  damageTaken(raw) {
    const dodge = 1 - Math.min(0.5, this.skillLevel("fighting") * 0.02);
    const tough = 1 - Math.min(0.4, this.skillLevel("toughness") * 0.02);
    const armorMult = { cloak: 0.8, shield: 0.5, mail: 0.5, reinforced_mail: 0.35 };
    return raw * (this.armor ? (armorMult[this.armor] || 0.5) : 1) * dodge * tough * (1 - this.traitBonus("defense"));
  }

  get tileX() { return Math.round(this.x); }
  get tileY() { return Math.round(this.y); }

  setPath(path) {
    this.path = path;
    this.pathIdx = 0;
    if (path && path.length) {
      this.tx = path[0].x; this.ty = path[0].y;
    }
  }

  // Advance movement along the path. Returns true when destination reached.
  move(dt) {
    if (!this.path || this.pathIdx >= this.path.length) return true;
    const step = this.path[this.pathIdx];
    const dx = step.x - this.x, dy = step.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) {
      this.x = step.x; this.y = step.y; this.z = step.z;
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; return true; }
      return false;
    }
    const sluggish = (this.hunger > 80 || this.thirst > 80 || this.energy < 18) ? 0.6 : 1;
    const spd = this.speed * this.moveSpeedMult() * sluggish * dt;
    const m = Math.min(spd, d);
    this.x += (dx / d) * m;
    this.y += (dy / d) * m;
    if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 0.01) this.facingV = dy > 0 ? 1 : -1;
    this.bob += m * 6;
    return false;
  }
}

// ---- Enemies (the outbreak & wildlife) --------------------------------------
// `infectious` kinds have a chance to bite a dwarf they hit instead of just
// hurting them — see Game.enemyHitDwarf / Game.turnZombie. `curses` is the
// vampire-branch analog of `infectious` (Game.enemyHitDwarf keeps the two
// mutually exclusive — one bite makes a dwarf either infected or vampiric,
// never both). `wolf`/`goblin`/`troll` are kept (unused by spawnRaid) in
// case a future round wants them.
const ENEMY_TYPES = {
  wolf:         { name: "Wolf",         hp: 24,  atk: 6,  speed: 3.9, color: "#7d7468" },
  goblin:       { name: "Goblin",       hp: 42,  atk: 11, speed: 3.0, color: "#5f7d3a" },
  troll:        { name: "Troll",        hp: 95,  atk: 20, speed: 2.4, color: "#6a5f7d" },
  shambler:     { name: "Shambler",     hp: 18,  atk: 5,  speed: 2.0, color: "#5c6b4a", infectious: true, biteChance: 0.15 },
  runner:       { name: "Runner",       hp: 30,  atk: 8,  speed: 4.2, color: "#6e5a44", infectious: true, biteChance: 0.20 },
  brute:        { name: "Brute",        hp: 110, atk: 22, speed: 2.1, color: "#4a4038", infectious: true, biteChance: 0.30 },
  turned:       { name: "Turned Elf",   hp: 55,  atk: 9,  speed: 2.6, color: "#4a5f3a", infectious: true, biteChance: 0.20 },
  spitter:      { name: "Bile Spitter", hp: 26,  atk: 7,  speed: 2.2, color: "#7d8a3a", infectious: true, biteChance: 0.10, ranged: true, range: 5 },
  vampire:      { name: "Vampire",      hp: 70,  atk: 14, speed: 3.3, color: "#7a2038", curses: true, curseChance: 0.5 },
  vampire_lord: { name: "Vampire Lord", hp: 130, atk: 24, speed: 2.7, color: "#4a0f24", curses: true, curseChance: 0.35 },
};

class Enemy {
  constructor(kind, x, y, z = 0) {
    const t = ENEMY_TYPES[kind] || ENEMY_TYPES.goblin;
    this.kind = kind;
    this.name = t.name;
    this.x = x; this.y = y; this.z = z;
    this.hp = t.hp; this.maxhp = t.hp;
    this.atk = t.atk; this.speed = t.speed; this.color = t.color;
    this.path = null; this.pathIdx = 0;
    this.attackCd = 0; this.repath = 0;
    this.facing = 1;
    this.facingV = 1;
    this.bob = Math.random() * Math.PI * 2;
  }

  get tileX() { return Math.round(this.x); }
  get tileY() { return Math.round(this.y); }
  setPath(path) { this.path = path; this.pathIdx = 0; }

  move(dt) {
    if (!this.path || this.pathIdx >= this.path.length) return true;
    const step = this.path[this.pathIdx];
    const dx = step.x - this.x, dy = step.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) {
      this.x = step.x; this.y = step.y; this.z = step.z;
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; return true; }
      return false;
    }
    const m = Math.min(this.speed * dt, d);
    this.x += (dx / d) * m; this.y += (dy / d) * m;
    if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 0.01) this.facingV = dy > 0 ? 1 : -1;
    this.bob += m * 6;
    return false;
  }
}

// ---- Wildlife & tamed companions (surface-only by spawn logic) -------------
// Wild ones wander the map; a dwarf with the Taming labor can win one over
// (see JobManager.assignTame in jobs.js). A tamed animal bonds to its tamer,
// roams near them, and lifts the mood of any elf who spends time nearby.
const ANIMAL_TYPES = {
  fox: { name: "Fox", speed: 3.0, color: "#c9702f" },
};

class Animal {
  constructor(kind, x, y, z = 0) {
    const t = ANIMAL_TYPES[kind] || ANIMAL_TYPES.fox;
    this.kind = kind;
    this.x = x; this.y = y; this.z = z;
    this.speed = t.speed;
    this.path = null; this.pathIdx = 0;
    this.repath = 0;
    this.wanderTimer = 1 + Math.random() * 3;
    this.facing = 1;
    this.bob = Math.random() * Math.PI * 2;
    this.tamed = false;
    this.ownerId = null;   // dbId of the elf who tamed it
    this.reserved = false; // a dwarf is approaching/working on taming this one
    this.fleeTimer = 0;    // briefly skittish after a failed tame attempt
  }

  get tileX() { return Math.round(this.x); }
  get tileY() { return Math.round(this.y); }
  setPath(path) { this.path = path; this.pathIdx = 0; }

  move(dt) {
    if (!this.path || this.pathIdx >= this.path.length) return true;
    const step = this.path[this.pathIdx];
    const dx = step.x - this.x, dy = step.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) {
      this.x = step.x; this.y = step.y; this.z = step.z;
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; return true; }
      return false;
    }
    const m = Math.min(this.speed * dt, d);
    this.x += (dx / d) * m; this.y += (dy / d) * m;
    if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
    this.bob += m * 6;
    return false;
  }
}

// ---- Trading caravan (friendly, non-combatant, surface-only by spawn logic) -
class Caravan {
  constructor(x, y, z = 0) {
    this.x = x; this.y = y; this.z = z;
    this.speed = 3.0;
    this.path = null; this.pathIdx = 0;
    this.state = "approach"; // approach | trading | leave
    this.tradeTimer = 0;
    this.depot = null;       // {x,y} depot tile it's visiting
    this.facing = 1;
    this.bob = Math.random() * Math.PI * 2;
  }

  get tileX() { return Math.round(this.x); }
  get tileY() { return Math.round(this.y); }
  setPath(path) { this.path = path; this.pathIdx = 0; }

  move(dt) {
    if (!this.path || this.pathIdx >= this.path.length) return true;
    const step = this.path[this.pathIdx];
    const dx = step.x - this.x, dy = step.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) {
      this.x = step.x; this.y = step.y; this.z = step.z;
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; return true; }
      return false;
    }
    const m = Math.min(this.speed * dt, d);
    this.x += (dx / d) * m; this.y += (dy / d) * m;
    if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
    this.bob += m * 6;
    return false;
  }
}
