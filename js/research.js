// ---- Research: the tech tree ------------------------------------------------
// Techs are pure data. Their effects are read live from game.tech[id] by the
// simulation (see game.js / jobs.js), so completing a tech is just a flag flip.

const TECHS = [
  // ---- Tier 1 ----
  {
    id: "tools", name: "Improved Tools", icon: "⛏️", tier: 1, cost: 60, requires: [],
    desc: "Mining and construction work 25% faster.",
  },
  {
    id: "axes", name: "Sharp Axes", icon: "🪓", tier: 1, cost: 60, requires: [],
    desc: "Woodcutting 25% faster and yields an extra log.",
  },
  {
    id: "rations", name: "Preserved Rations", icon: "🥫", tier: 1, cost: 70, requires: [],
    desc: "Elves grow hungry 25% slower; foraging yields more food.",
  },

  // ---- Tier 2 ----
  {
    id: "metallurgy", name: "Metallurgy", icon: "🔥", tier: 2, cost: 150, requires: ["tools"],
    desc: "Smelting and forging 40% faster.",
  },
  {
    id: "agriculture", name: "Agriculture", icon: "🌾", tier: 2, cost: 150, requires: ["rations"],
    desc: "Unlocks the Farm zone — elves plant, tend, and harvest crops for food. Growth speed depends on the season.",
    unlock: "farm",
  },
  {
    id: "comfort", name: "Comfortable Quarters", icon: "🛌", tier: 2, cost: 140, requires: ["rations"],
    desc: "Beds restore 50% more energy; bedrooms lift mood twice as much.",
  },
  {
    id: "scholarship", name: "Scholarship", icon: "📚", tier: 2, cost: 140, requires: ["tools"],
    desc: "Unlocks the Study zone and speeds all research by 30%.",
    unlock: "study",
  },
  {
    id: "furniture", name: "Fine Furniture", icon: "🪑", tier: 2, cost: 130, requires: ["axes"],
    desc: "Unlocks Tables; a furnished dining hall greatly improves happiness.",
    unlock: "table",
  },
  {
    id: "crafting", name: "Crafting Basics", icon: "🛠️", tier: 1, cost: 80, requires: [],
    desc: "Unlocks a Crafting Bench for components and cloth.", unlock: "crafting",
  },
  {
    id: "weaponsmithing", name: "Weaponsmithing", icon: "🗡️", tier: 2, cost: 150, requires: ["crafting", "metallurgy"],
    desc: "Unlocks a Weapons Bench for wooden, stone, and metal arms.", unlock: "weapons",
  },
  {
    id: "tailoring", name: "Tailoring", icon: "🧵", tier: 2, cost: 130, requires: ["crafting"],
    desc: "Unlocks a Clothing Bench for cloth and reinforced armor.", unlock: "clothing",
  },
  {
    id: "archery", name: "Archery", icon: "🏹", tier: 2, cost: 140, requires: ["weaponsmithing"],
    desc: "Unlocks bows and arrow bundles at the Weapons Bench. Archers shoot foes from 6 tiles (8 from a Watchtower) but consume arrows from their quiver — melee with a bow is clumsy.",
  },
  {
    id: "electronics", name: "Electronics", icon: "⚡", tier: 3, cost: 260, requires: ["weaponsmithing", "essence"],
    desc: "Unlocks an Electronics Bench and adds circuits and laser blades to the Weapons Bench.", unlock: "electronics",
  },
  {
    id: "medicine", name: "Medicine", icon: "⚕️", tier: 2, cost: 160, requires: ["rations"],
    desc: "Unlocks the Hospital zone. Badly wounded elves recover far faster there — especially with a dedicated Doctor (Medicine labor) tending them.",
    unlock: "hospital",
  },

  // ---- Tier 3 ----
  {
    id: "bookkeeping", name: "Bookkeeping", icon: "🧮", tier: 3, cost: 220, requires: ["scholarship"],
    desc: "Better-run colony: more migrants arrive and research speeds up 30%.",
  },
  {
    id: "essence", name: "Essence Craft", icon: "✨", tier: 3, cost: 240, requires: ["metallurgy"],
    desc: "Unlocks Arcane Conduits, the Essence Well, and the Frost Chamber — wire up power to keep stockpiled food from spoiling.",
    unlock: "conduit",
  },

  // ---- Tier 3/4 — modern & futuristic arms ----
  {
    id: "ballistics", name: "Ballistics", icon: "🔫", tier: 3, cost: 240, requires: ["archery", "metallurgy"],
    desc: "Unlocks the iron Rifle and bullet boxes at the Weapons Bench. Rifles shoot farther and faster than bows (8 tiles, quicker reload) — soldiers auto-upgrade when a better weapon is spare.",
  },
  {
    id: "photonics", name: "Photonics", icon: "💫", tier: 4, cost: 320, requires: ["ballistics", "electronics"],
    desc: "Unlocks the Laser Rifle at the Weapons Bench and energy cells at the Electronics Bench — 10 tiles of reach, the fastest rate of fire in the empire.",
  },
];

const TECH_BY_ID = {};
for (const t of TECHS) TECH_BY_ID[t.id] = t;

// Tools/zones that stay hidden until their tech is researched.
const TOOL_TECH = {
  farm: "agriculture", study: "scholarship", hospital: "medicine", quarantine: "medicine", table: "furniture",
  conduit: "essence", generator: "essence", icebox: "essence", lamp: "essence", lantern: "furniture",
  crafting: "crafting", weapons: "weaponsmithing", clothing: "tailoring", electronics: "electronics",
};
