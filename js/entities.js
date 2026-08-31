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
};
const ITEM_LABEL = {
  wood: "Wood log", stone: "Stone", ore: "Ore", food: "Food",
  bar: "Metal bar", weapon: "Weapon", armor: "Armor",
};

class Item {
  constructor(kind, x, y, sub = null) {
    this.kind = kind;
    this.sub = sub;      // e.g. ore type
    this.x = x;
    this.y = y;
    this.hauled = false; // currently carried / claimed
    this.stored = false; // resting in a stockpile
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
];
const JOB_LABOR = { dig: "mining", chop: "woodcutting", gather: "farming", build: "building", craft: "crafting", haul: "hauling", plant: "farming", harvest: "farming", doctor: "medicine" };

// Schedule activities per shift.
const ACTIVITIES = [
  { id: "work",  name: "Work",   icon: "⚒️" },
  { id: "sleep", name: "Sleep",  icon: "😴" },
  { id: "eat",   name: "Eat",    icon: "🍽️" },
  { id: "train", name: "Train",  icon: "⚔️" },
  { id: "idle",  name: "Off",    icon: "🎲" },
];

// Dwarf state machine: idle -> pathing -> working -> (deliver) -> idle
class Dwarf {
  constructor(name, x, y, color, skills) {
    this.name = name;
    this.x = x;            // tile coords (float during movement)
    this.y = y;
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
    this.energy = 100;     // 100 rested .. 0 exhausted
    this.mood = 70;        // 0 miserable .. 100 ecstatic
    this.happiness = 70;   // overall gauge: health + mood + needs (derived)
    this.facing = 1;       // 1 right, -1 left
    this.bob = Math.random() * Math.PI * 2; // walk animation phase
    this.idleWander = 0;
    this.thought = "";     // short status text

    // ---- persistent identity & progression ----
    this.dbId = newDwarfId();
    this.skills = skills || makeSkillSet();

    // ---- labor & schedule ----
    this.labors = new Set(LABORS.map(l => l.id)); // all enabled by default
    this.schedule = { day: "work", night: "sleep" };
    this.activity = "work";  // resolved from schedule + shift
    this.bed = null;         // {x,y} of an assigned bed while sleeping

    // ---- health & military ----
    this.hp = 100;           // 0 = dead
    this.maxhp = 100;
    this.military = false;   // enlisted soldier?
    this.weapon = null;      // equipped weapon sub (sword/axe)
    this.armor = null;       // equipped armor sub (shield/mail)
    this.attackCd = 0;       // swing cooldown
    this.combatRepath = 0;   // throttle for chasing/fleeing pathing
    this.fleeing = false;

    // ---- injuries ----
    this.wounded = false;      // hp dropped low enough to need bed rest to heal
    this.beingTreated = false; // a doctor is currently attending them
  }

  skillLevel(id) { return this.skills[id] ? this.skills[id].level : 0; }
  // Higher skill => faster work (multiplier applied to divide work time).
  workSpeedMult(skillId) { return 1 + this.skillLevel(skillId) * 0.05; }
  moveSpeedMult() { return 1 + this.skillLevel("fitness") * 0.03; }

  // Damage this dwarf deals per swing (weapon + fighting skill).
  attackDamage() { return (4 + this.skillLevel("fighting") * 0.7) * (this.weapon ? 1.9 : 1); }
  // Incoming damage after armor + skill-based dodge.
  damageTaken(raw) {
    const dodge = 1 - Math.min(0.5, this.skillLevel("fighting") * 0.02);
    return raw * (this.armor ? 0.5 : 1) * dodge;
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
      this.x = step.x; this.y = step.y;
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this.path = null; return true; }
      return false;
    }
    const sluggish = (this.hunger > 80 || this.energy < 18) ? 0.6 : 1;
    const spd = this.speed * this.moveSpeedMult() * sluggish * dt;
    const m = Math.min(spd, d);
    this.x += (dx / d) * m;
    this.y += (dy / d) * m;
    if (Math.abs(dx) > 0.01) this.facing = dx > 0 ? 1 : -1;
    this.bob += m * 6;
    return false;
  }
}

// ---- Enemies (raiders & wildlife) ------------------------------------------
const ENEMY_TYPES = {
  wolf:   { name: "Wolf",   hp: 24, atk: 6,  speed: 3.9, color: "#7d7468" },
  goblin: { name: "Goblin", hp: 42, atk: 11, speed: 3.0, color: "#5f7d3a" },
  troll:  { name: "Troll",  hp: 95, atk: 20, speed: 2.4, color: "#6a5f7d" },
};

class Enemy {
  constructor(kind, x, y) {
    const t = ENEMY_TYPES[kind] || ENEMY_TYPES.goblin;
    this.kind = kind;
    this.name = t.name;
    this.x = x; this.y = y;
    this.hp = t.hp; this.maxhp = t.hp;
    this.atk = t.atk; this.speed = t.speed; this.color = t.color;
    this.path = null; this.pathIdx = 0;
    this.attackCd = 0; this.repath = 0;
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
      this.x = step.x; this.y = step.y;
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

// ---- Trading caravan (friendly, non-combatant) ------------------------------
class Caravan {
  constructor(x, y) {
    this.x = x; this.y = y;
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
      this.x = step.x; this.y = step.y;
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
