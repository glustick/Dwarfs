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

  // ---- Tier 3 ----
  {
    id: "medicine", name: "Medicine", icon: "⚕️", tier: 3, cost: 260, requires: ["scholarship"],
    desc: "Unlocks the Hospital zone. Badly wounded elves recover far faster there — especially with a dedicated Doctor (Medicine labor) tending them.",
    unlock: "hospital",
  },
  {
    id: "bookkeeping", name: "Bookkeeping", icon: "🧮", tier: 3, cost: 220, requires: ["scholarship"],
    desc: "Better-run colony: more migrants arrive and research speeds up 30%.",
  },
];

const TECH_BY_ID = {};
for (const t of TECHS) TECH_BY_ID[t.id] = t;

// Tools/zones that stay hidden until their tech is researched.
const TOOL_TECH = { farm: "agriculture", study: "scholarship", hospital: "medicine", table: "furniture" };
