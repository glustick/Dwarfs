// ---- Items & Dwarves --------------------------------------------------------

// Item kinds that can sit on the ground / be hauled / stored.
const ITEM = {
  WOOD: "wood",
  STONE: "stone",
  ORE: "ore",     // subtype in item.sub
  FOOD: "food",
};
const ITEM_LABEL = { wood: "Wood log", stone: "Stone", ore: "Ore", food: "Food" };

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
  { id: "farming",     job: "gather", name: "Gathering",   icon: "🌿" },
  { id: "building",    job: "build",  name: "Building",    icon: "🧱" },
  { id: "hauling",     job: "haul",   name: "Hauling",     icon: "📦" },
];
const JOB_LABOR = { dig: "mining", chop: "woodcutting", gather: "farming", build: "building", haul: "hauling" };

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
  }

  skillLevel(id) { return this.skills[id] ? this.skills[id].level : 0; }
  // Higher skill => faster work (multiplier applied to divide work time).
  workSpeedMult(skillId) { return 1 + this.skillLevel(skillId) * 0.05; }
  moveSpeedMult() { return 1 + this.skillLevel("fitness") * 0.03; }

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
