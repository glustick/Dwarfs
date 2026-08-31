// ---- Skills: catalog, XP/level maths, titles, effects -----------------------

const MAX_LEVEL = 20;

// Skill catalog. `jobs` lists the job types that train a skill through work.
// `attr` skills are personal attributes trained by activities rather than jobs.
const SKILLS = {
  mining:       { name: "Mining",       noun: "Miner",      icon: "⛏️", jobs: ["dig"],    attr: false },
  woodcutting:  { name: "Woodcutting",  noun: "Woodcutter", icon: "🪓", jobs: ["chop"],   attr: false },
  farming:      { name: "Farming",      noun: "Farmer",     icon: "🌿", jobs: ["gather"], attr: false },
  building:     { name: "Building",     noun: "Builder",    icon: "🧱", jobs: ["build"],  attr: false },
  hauling:      { name: "Hauling",      noun: "Hauler",     icon: "📦", jobs: ["haul"],   attr: false },
  cooking:      { name: "Cooking",      noun: "Cook",       icon: "🍲", jobs: ["eat"],    attr: false },
  smithing:     { name: "Smithing",     noun: "Smith",      icon: "🔨", jobs: ["craft"],  attr: false },
  fitness:      { name: "Fitness",      noun: "Athlete",    icon: "💪", attr: true },  // move speed / stamina
  fighting:     { name: "Fighting",     noun: "Warrior",    icon: "⚔️", attr: true },  // trained by 'train'
  charisma:     { name: "Charisma",     noun: "Diplomat",   icon: "💬", attr: true },  // social, migration
  intelligence: { name: "Intelligence", noun: "Scholar",    icon: "🧠", attr: true },  // multiplies XP gain
};

const SKILL_IDS = Object.keys(SKILLS);

// Which skills are sensible starting specialties for this mountain-forest world.
const ENVIRONMENT_SPECIALTIES = ["mining", "woodcutting", "farming", "building", "hauling", "fighting"];

// Map a job type to the skill it trains.
const JOB_SKILL = { dig: "mining", chop: "woodcutting", gather: "farming", build: "building", haul: "hauling", eat: "cooking", craft: "smithing", plant: "farming", harvest: "farming" };

// Classic roguelike-style proficiency titles.
const SKILL_TITLES = [
  [0, "Dabbling"], [1, "Novice"], [2, "Adequate"], [3, "Competent"], [4, "Skilled"],
  [5, "Proficient"], [6, "Talented"], [7, "Adept"], [8, "Expert"], [9, "Professional"],
  [10, "Accomplished"], [11, "Great"], [12, "Master"], [14, "High Master"],
  [16, "Grand Master"], [18, "Legendary"],
];

function skillTitle(level) {
  let t = "Dabbling";
  for (const [lvl, name] of SKILL_TITLES) if (level >= lvl) t = name; else break;
  return t;
}

// XP required to advance from `level` to the next.
function xpToNext(level) { return 100 + level * 45; }

// A fresh, empty skill set (all at level 0).
function makeSkillSet() {
  const s = {};
  for (const id of SKILL_IDS) s[id] = { level: 0, xp: 0 };
  return s;
}

// Roll random starting skills fitting the environment.
function rollStartingSkills(rng) {
  const s = makeSkillSet();
  // 1–2 specialties with a head start
  const nSpec = randint(rng, 1, 2);
  const pool = ENVIRONMENT_SPECIALTIES.slice();
  for (let i = 0; i < nSpec && pool.length; i++) {
    const idx = Math.floor(rng() * pool.length);
    const id = pool.splice(idx, 1)[0];
    s[id].level = randint(rng, 2, 6);
  }
  // small spread of dabbling in a couple of other skills + intelligence
  for (let i = 0; i < 3; i++) {
    const id = choice(rng, SKILL_IDS);
    if (s[id].level === 0) s[id].level = randint(rng, 0, 2);
  }
  s.intelligence.level = Math.max(s.intelligence.level, randint(rng, 0, 4));
  return s;
}

// Grant XP to one skill on a dwarf; returns the skill id if it leveled up.
function grantXp(dwarf, skillId, amount) {
  const sk = dwarf.skills[skillId];
  if (!sk) return null;
  const mult = 1 + dwarf.skills.intelligence.level * 0.05;
  sk.xp += amount * mult;
  let leveled = null;
  while (sk.level < MAX_LEVEL && sk.xp >= xpToNext(sk.level)) {
    sk.xp -= xpToNext(sk.level);
    sk.level++;
    leveled = skillId;
  }
  if (sk.level >= MAX_LEVEL) sk.xp = 0;
  return leveled;
}

// Highest skill overall — a dwarf's "profession".
function professionOf(dwarf) {
  let best = null, bl = 0;
  for (const id of SKILL_IDS) {
    const l = dwarf.skills[id].level;
    if (l > bl) { bl = l; best = id; }
  }
  if (!best || bl === 0) return "Peasant";
  return `${skillTitle(bl)} ${SKILLS[best].noun}`;
}
