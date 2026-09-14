// ---- Factions: neighbouring powers, reputation, trade terms & their own raids
//
// Three neighbours ring the greenwood. Each keeps a reputation with the colony
// (-100 hostile .. +100 allied) that colours its trade terms and decides whether
// it ever comes raiding. This is the *political* threat sitting beside the
// anonymous zombie outbreak: a neighbour you anger has a reason, a motive, and
// a banner. Reputation rises with trade and falls when you sell arms to a
// faction's rival or cut down its raiders — see Game.applyRep / Game.doTrade /
// Game.killEnemy. This file is pure data + helpers; the Game reads it live.

const FACTION_TIERS = [
  [60, "Allied", "#7ec86a"],
  [25, "Friendly", "#a8c86a"],
  [-25, "Neutral", "#cbb98f"],
  [-60, "Wary", "#e0b158"],
  [-Infinity, "Hostile", "#e0553a"],
];
function factionTier(rep) {
  for (const [min, name, color] of FACTION_TIERS) if (rep >= min) return { name, color };
  return { name: "Hostile", color: "#e0553a" };
}

// A raid motive decides both the raiders' stat mix and their behaviour:
//   "slay"    — a warband that fights the colony head-on.
//   "plunder" — looters who make for the stockpiles, grab what they can, and
//               flee to the map edge with it (kill them to get it back).
const FACTIONS = [
  {
    id: "verdant",
    name: "Verdant Concord",
    icon: "🌿",
    color: "#5cb85c",
    blurb: "A league of woodland traders who prize food, drink and peaceful dealing above all else.",
    startRep: 15,
    buys: ["food", "ale", "wine", "wood"],
    priceBias: 1.10,          // they simply pay more for what they want
    rival: "ironhold",
    raid: { motive: "slay", minRep: -55, size: 0.8 },
    gift: { label: "food and drink", items: [["food", null, 4], ["ale", null, 2]] },
  },
  {
    id: "ironhold",
    name: "Ironhold Compact",
    icon: "⚒️",
    color: "#c98b4a",
    blurb: "Dour delvers from the deep halls, hungry for ore, marble and worked metal.",
    startRep: 0,
    buys: ["ore", "bar", "marble"],
    priceBias: 1.0,
    rival: "verdant",
    raid: { motive: "plunder", minRep: -35, size: 1.0 },
    gift: { label: "stone and iron", items: [["stone", null, 8], ["ore", "iron", 3]] },
  },
  {
    id: "thornwatch",
    name: "Thornwatch",
    icon: "🏴",
    color: "#a5443f",
    blurb: "A marauding band that takes from the greenwood whatever it cannot trade for.",
    startRep: -30,
    buys: ["weapon", "armor", "bar"],
    priceBias: 0.85,          // cut-throats drive a hard bargain
    rival: null,
    raid: { motive: "slay", minRep: -20, size: 1.15 },
    gift: null,
  },
];
const FACTION_BY_ID = Object.fromEntries(FACTIONS.map(f => [f.id, f]));

// Which raider kinds a motive fields (see ENEMY_TYPES in entities.js).
const FACTION_RAIDER_KINDS = {
  slay:    ["faction_raider", "faction_champion"],
  plunder: ["faction_looter", "faction_raider"],
};

// Does a faction pay for this item? Gold bars are universal currency and
// always sell; everything else must match the faction's tastes.
function factionAccepts(faction, it) {
  if (it.kind === ITEM.BAR && it.sub === "gold") return true;
  return faction.buys.includes(it.kind);
}
