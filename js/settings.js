// ---- Colony setup: difficulty + map size ------------------------------------
//
// A new colony is configured before the world is generated. Difficulty is not
// a flat stat multiplier bolted on afterwards — each preset scales the systems
// that already drive the game: the Storyteller's incident pressure, the size
// and cadence of outbreak raids, how readily an angry neighbour actually comes
// raiding, how fast elves get hungry, and how much of a head start they get.
//
// A restored save carries its own settings, so loading an old colony keeps the
// difficulty it was founded under. Pure data + helpers; the Game reads it live.

const DIFFICULTIES = [
  {
    id: "gentle", name: "Gentle", icon: "🍃",
    blurb: "A quiet wood. Fewer raids and a generous start, for learning the ropes.",
    meta: "Raids ×0.7 · Events ×0.7 · Supplies ×1.5",
    storyRate: 0.7, raid: 0.7, raidDelay: 1.35, factionAggro: 0.5, hunger: 0.9, startBonus: 1.5,
  },
  {
    id: "standard", name: "Standard", icon: "🌳",
    blurb: "The intended balance: the outbreak escalates with your research, and neighbours keep their grudges.",
    meta: "Raids ×1 · Events ×1 · Supplies ×1",
    storyRate: 1, raid: 1, raidDelay: 1, factionAggro: 1, hunger: 1, startBonus: 1,
  },
  {
    id: "harsh", name: "Harsh", icon: "🌩️",
    blurb: "Leaner stores and hungrier raiders. Mistakes start costing you elves.",
    meta: "Raids ×1.3 · Events ×1.3 · Supplies ×0.75",
    storyRate: 1.3, raid: 1.25, raidDelay: 0.85, factionAggro: 1.2, hunger: 1.1, startBonus: 0.75,
  },
  {
    id: "brutal", name: "Brutal", icon: "💀",
    blurb: "The forest is not on your side. Expect to lose a colony or three.",
    meta: "Raids ×1.5 · Events ×1.6 · Supplies ×0.5",
    storyRate: 1.6, raid: 1.5, raidDelay: 0.7, factionAggro: 1.5, hunger: 1.25, startBonus: 0.5,
  },
];

const MAP_SIZES = [
  {
    id: "small", name: "Tight Grove", icon: "🌱", w: 70, h: 54,
    blurb: "A compact wood — quick to scout, little room to sprawl.",
    meta: "70 × 54 tiles",
  },
  {
    id: "medium", name: "Greenwood", icon: "🌳", w: 90, h: 70,
    blurb: "The classic woodland map.",
    meta: "90 × 70 tiles",
  },
  {
    id: "large", name: "Deep Forest", icon: "🌲", w: 120, h: 92,
    blurb: "A wide forest — more ore and wildlife, and a lot more ground to defend.",
    meta: "120 × 92 tiles",
  },
];

const DEFAULT_SETTINGS = { difficulty: "standard", mapSize: "medium" };

// ---- accessibility palette --------------------------------------------------
// The game leans on colour for ore types and for mood. "safe" swaps in an
// Okabe-Ito style ramp — which colour-vision deficiency handles well — and the
// renderer additionally gives each ore a distinct *shape*, because a palette
// alone cannot separate kinds for every kind of colour blindness.
// ---- interface scale --------------------------------------------------------
// The HUD type is small at 9-10px, which is uncomfortable on a large display.
// The chrome is scaled with `zoom`, which magnifies a fixed-position element and
// its contents together, so anchors stay anchored. Normal is the default, so
// nothing changes unless it is chosen.
const UI_SCALES = ["compact", "normal", "large"];
function uiScaleMode() {
  try {
    const m = localStorage.getItem("ee_uiscale");
    return UI_SCALES.includes(m) ? m : "normal";
  } catch (e) { return "normal"; }
}
function setUiScale(mode) {
  const m = UI_SCALES.includes(mode) ? mode : "normal";
  try { localStorage.setItem("ee_uiscale", m); } catch (e) {}
  try { document.documentElement.setAttribute("data-ui", m); } catch (e) {}
  return m;
}

const PALETTES = ["default", "safe"];
function paletteMode() {
  try { return localStorage.getItem("ee_palette") === "safe" ? "safe" : "default"; }
  catch (e) { return "default"; }
}
function setPalette(mode) {
  const m = PALETTES.includes(mode) ? mode : "default";
  try { localStorage.setItem("ee_palette", m); } catch (e) {}
  window.__paletteSafe = (m === "safe");
  try { document.documentElement.setAttribute("data-palette", m); } catch (e) {}
  return m;
}
const NEWGAME_PREF_KEY = "ee_newgame"; // remembered defaults for the next colony

function difficultyById(id) {
  for (const d of DIFFICULTIES) if (d.id === id) return d;
  return DIFFICULTIES[1]; // standard
}
function mapSizeById(id) {
  for (const m of MAP_SIZES) if (m.id === id) return m;
  return MAP_SIZES[1]; // medium
}

// The player's last choice, so a new colony starts from where they left off.
function loadNewGameSettings() {
  try {
    const raw = localStorage.getItem(NEWGAME_PREF_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return {
        difficulty: difficultyById(saved.difficulty).id,
        mapSize: mapSizeById(saved.mapSize).id,
      };
    }
  } catch (e) { /* storage blocked or corrupt — fall through to defaults */ }
  return Object.assign({}, DEFAULT_SETTINGS);
}

function saveNewGameSettings(s) {
  try {
    localStorage.setItem(NEWGAME_PREF_KEY, JSON.stringify({
      difficulty: difficultyById(s.difficulty).id,
      mapSize: mapSizeById(s.mapSize).id,
    }));
  } catch (e) { /* ignore */ }
}
