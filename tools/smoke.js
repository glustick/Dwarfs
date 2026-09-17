#!/usr/bin/env node
// Headless smoke test for Elven Empire.
//
// Loads the real game scripts into a vm context with a minimal DOM stub, then
// drives the simulation directly. No browser, no dependencies — it exists so a
// change to the sim can be checked in one command:
//
//     node tools/smoke.js
//
// Rendering is exercised too (draw() runs against a stubbed canvas context) so
// a broken draw call fails loudly rather than only showing up in a browser.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, ".."));
// audio.js is deliberately omitted: it needs a Web Audio API (see smoke-audio.js).
const FILES = (process.argv[3] ||
  "version,utils,settings,codex,skills,research,milestones,db,world,pathfinding,entities,factions,jobs,storyteller,render,input,save,game,diagnostics,menu"
).split(",");

const { createHarness, El } = require("./harness.js");

// ---------------------------------------------------------------- harness
// The DOM, the fixed-step clock and the loading live in harness.js, shared with
// the other three tools.
const { ctx, document: documentStub, getEl } = createHarness({ files: FILES, root: ROOT });

// Evaluate a snippet in the game context; if it yields a function, call it
// with the remaining args (so both "new Game(null)" and "(d)=>new Game(d)" work).
const run = (src, ...args) => {
  const v = vm.runInContext(src, ctx);
  return typeof v === "function" ? v(...args) : v;
};

// ---------------------------------------------------------------- scenarios
const results = [];
function check(name, fn) {
  try { fn(); results.push(["ok", name]); }
  catch (e) { results.push(["FAIL", name + " :: " + ((e && e.stack) || e)]); }
}
const day = () => { for (let i = 0; i < 1400; i++) g.update(0.1); };

let g;
check("boot: construct a new game", () => {
  g = run("new Game(null)");
  if (!g || !g.dwarves.length || !g.world) throw new Error("game did not initialise");
});

check("sim: 400s of colony time", () => { for (let i = 0; i < 4000; i++) g.update(0.1); });

check("render: draw() runs", () => { g.renderer.draw(); });

check("ui: every panel tab renders", () => {
  for (const t of ["colony", "schedule", "research", "log", "records", "stats", "factions"]) {
    g.panelTab = t; g.updatePanel();
  }
});

check("save: serialize + restore round-trip", () => {
  const data = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = run("(d)=>new Game(d)", data);
  for (let i = 0; i < 300; i++) g2.update(0.1);
  if (typeof g2.factionRep("ironhold") !== "number") throw new Error("faction state lost");
});

check("factions: plunder raid actually loots", () => {
  const F = run("FACTION_BY_ID");
  g.factions.ironhold.rep = -80;
  run("(g,f)=>g.spawnFactionRaid(f)", g, F.ironhold);
  if (!g.enemies.filter(e => e.motive === "plunder").length) throw new Error("no looters spawned");
  for (let i = 0; i < 6; i++) g.jobs.spawnItem("stone", g.world.spawnX + i, g.world.spawnY);
  for (let i = 0; i < 1200; i++) g.update(0.1);
  const ev = g.events.filter(e => /loots a stockpile|slips away|recovered from/.test(e.text));
  if (!ev.length) throw new Error("looters never looted or escaped");
});

check("factions: slay raid runs", () => {
  const F = run("FACTION_BY_ID");
  g.factions.thornwatch.rep = -90;
  run("(g,f)=>g.spawnFactionRaid(f)", g, F.thornwatch);
  if (!g.enemies.length) throw new Error("no raiders spawned");
  for (let i = 0; i < 400; i++) g.update(0.1);
});

check("trade: faction caravan buys and pays", () => {
  const w = g.world;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = w.spawnX + dx, y = w.spawnY + dy, t = w.get(x, y, 0);
    if (t && w.isWalkable(x, y, 0)) { t.stockpile = true; t.zone = "trade"; }
  }
  g.rebuildZones(); g.rebuildStockpiles();
  g.jobs.spawnItem("bar", w.spawnX, w.spawnY, "gold");
  run("(g)=>g.trySpawnCaravan(true)", g);
  for (let i = 0; i < 800; i++) g.update(0.1);
});

check("factions: reputation tiers respond", () => {
  const before = g.factionRep("verdant");
  g.applyRep("verdant", 100);
  if (!(g.factionRep("verdant") > before)) throw new Error("reputation did not move");
});

check("storyteller: weighted incident pool fires", () => {
  const seen = new Set();
  for (let d = 0; d < 40; d++) {
    for (let i = 0; i < 1400; i++) { g.story.points = 6; g.update(0.1); }
    g.events.filter(e => e.cat === "story").forEach(e => seen.add(e.text.replace(/[0-9]+/g, "#")));
  }
  if (g.story.count < 5) throw new Error("storyteller barely fired (" + g.story.count + ")");
  if (seen.size < 4) throw new Error("too little variety (" + seen.size + " lines)");
});

check("storyteller: wildlife threats spawn", () => {
  const before = g.enemies.length;
  run("storySpawnBeasts", g, ["wolf"], 3, "TEST:");
  run("storySpawnBeasts", g, ["goblin", "troll"], 3, "TEST:");
  if (g.enemies.length <= before) throw new Error("beasts did not spawn");
  for (let i = 0; i < 300; i++) g.update(0.1);
});

check("save: story state survives a round-trip", () => {
  const data = JSON.parse(JSON.stringify(g.serialize()));
  if (!data.story || typeof data.story.points !== "number") throw new Error("story not serialized");
  const g3 = run("(d)=>new Game(d)", data);
  for (let i = 0; i < 200; i++) g3.update(0.1);
});

check("setup: map size applies to a new colony", () => {
  const dims = { small: [70, 54], medium: [90, 70], large: [120, 92] };
  for (const id of Object.keys(dims)) {
    const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: id });
    if (gs.world.w !== dims[id][0] || gs.world.h !== dims[id][1]) throw new Error("map size not applied: " + id);
    if (gs.dwarves.length !== 7) throw new Error("starting elves wrong for " + id);
  }
});

check("setup: difficulty is stored and scaled", () => {
  for (const d of run("DIFFICULTIES")) {
    const gs = run("(o)=>new Game(null,o)", { difficulty: d.id, mapSize: "small" });
    if (gs.settings.difficulty !== d.id) throw new Error("difficulty not stored: " + d.id);
    if (!gs.items.length) throw new Error("no starting supplies for " + d.id);
    if (d.id === "brutal" && !(gs.hungerRate() > run("HUNGER_RATE"))) throw new Error("brutal hunger not harsher");
  }
  // A gentler colony gets a bigger starting stock than a brutal one.
  const gentle = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const brutal = run("(o)=>new Game(null,o)", { difficulty: "brutal", mapSize: "small" });
  if (!(gentle.items.length > brutal.items.length)) throw new Error("starting supplies do not scale with difficulty");
  // ...and brutal sends a bigger raid for the same colony state.
  const raid = (gg) => { gg.enemies.length = 0; gg.spawnRaid(); return gg.enemies.length; };
  const rg = raid(gentle), rb = raid(brutal);
  if (!(rb > rg)) throw new Error("brutal raid (" + rb + ") not larger than gentle (" + rg + ")");
});

check("setup: choice persists and survives a save", () => {
  const back = run("(o)=>{ saveNewGameSettings(o); return loadNewGameSettings(); }", { difficulty: "harsh", mapSize: "large" });
  if (back.difficulty !== "harsh" || back.mapSize !== "large") throw new Error("preference not remembered");
  const gs = run("(o)=>new Game(null,o)", { difficulty: "harsh", mapSize: "large" });
  const data = JSON.parse(JSON.stringify(gs.serialize()));
  if (!data.settings || data.settings.difficulty !== "harsh") throw new Error("settings not serialized");
  const g2 = run("(d)=>new Game(d)", data);
  if (g2.settings.mapSize !== "large") throw new Error("settings lost on load");
});

check("codex: content is intact and searchable", () => {
  const entries = run("CODEX_ENTRIES");
  const cats = run("CODEX_CATEGORIES");
  const search = (q) => run("(q)=>searchCodex(q)", q);
  if (entries.length < 20) throw new Error("too few codex entries: " + entries.length);
  const ids = new Set();
  for (const e of entries) {
    if (!e.id || !e.title || !e.icon || !e.body) throw new Error("incomplete entry: " + e.id);
    if (ids.has(e.id)) throw new Error("duplicate codex id: " + e.id);
    ids.add(e.id);
    if (!cats.includes(e.cat)) throw new Error("unknown category '" + e.cat + "' on " + e.id);
    if (!/<(p|ul|ol|table|li)/.test(e.body)) throw new Error("entry body looks empty: " + e.id);
  }
  if (search("").length !== entries.length) throw new Error("an empty search should return everything");
  for (const q of ["aquifer", "vampire", "brutal", "hotkey", "goose"]) { /* goose: title word */ }
  if (!search("aquifer").length) throw new Error("search missed 'aquifer'");
  if (!search("vampire").length) throw new Error("search missed 'vampire'");
  if (!search("hotkey").length) throw new Error("tag search failed");
  if (search("zzzznotathing").length) throw new Error("a nonsense query returned hits");
});

check("tech tree: every tech is rendered and reachable", () => {
  const techs = run("TECHS");
  const ids = new Set(techs.map(t => t.id));
  if (ids.size !== techs.length) throw new Error("duplicate tech id");
  const maxTier = techs.reduce((m, t) => Math.max(m, t.tier), 1);
  if (maxTier < 4) throw new Error("expected a tier-4 technology to exist");
  const el = new El("panel-content");
  g.renderResearch(el);
  const html = el._html;
  for (const t of techs) {
    if (!html.includes(`data-tech="${t.id}"`)) {
      throw new Error(`tech not rendered: ${t.id} (tier ${t.tier}) - is the tier loop capped?`);
    }
    for (const req of (t.requires || [])) {
      if (!ids.has(req)) throw new Error(`unknown prerequisite '${req}' on ${t.id}`);
    }
  }
  if (!html.includes("tech-tier")) throw new Error("no tier headings rendered");
  // the unlocks line should be derived, so at least one tech must advertise one
  if (!html.includes("tech-unlocks")) throw new Error("no technology advertised what it unlocks");
  if (!html.includes("tt-gate")) throw new Error("a gated tier does not advertise what it needs");
  if (!/\d+ of \d+ technologies/.test(html)) throw new Error("no researched counter rendered");
});

check("arms: early weapons exist, are ordered, and are reachable early", () => {
  const recipes = [];
  const byBench = run("RECIPES");
  for (const bench in byBench) for (const r of byBench[bench]) if (r.out.kind === "weapon") recipes.push({ bench, ...r });
  const subs = new Set(recipes.map(r => r.out.sub));
  for (const need of ["club", "knife", "stone_spear", "shortbow", "bow", "sword", "rifle", "laser_rifle"]) {
    if (!subs.has(need)) throw new Error("no recipe produces weapon: " + need);
  }
  const rank = run("WEAPON_RANK");
  for (const s2 of subs) if (!(s2 in rank)) throw new Error("weapon missing from WEAPON_RANK: " + s2);
  const ranged = run("RANGED_WEAPONS");
  if (!ranged.shortbow) throw new Error("shortbow is not a ranged weapon");
  if (!(ranged.shortbow.range < ranged.bow.range)) throw new Error("shortbow should reach less far than a longbow");
  if (!(rank.knife < rank.stone_spear && rank.stone_spear < rank.sword && rank.shortbow < rank.bow)) {
    throw new Error("weapon ladder out of order");
  }
  // Every crude arm needs a Crafting Bench recipe no deeper than tier 1.
  // (Legacy Weapons Bench entries may also exist - recipe indices are stored
  // per workshop, so removing them would silently retarget saved colonies.)
  const tierOf = {};
  run("TECHS").forEach(t => { tierOf[t.id] = t.tier; });
  for (const crude of ["club", "knife", "stone_spear", "shortbow"]) {
    const at = recipes.filter(r => r.out.sub === crude && r.bench === "crafting");
    if (!at.length) throw new Error(crude + " has no Crafting Bench recipe");
    for (const r of at) {
      if (r.tech && (tierOf[r.tech] || 9) > 1) throw new Error(crude + " gated behind tier " + tierOf[r.tech]);
    }
  }
  // A knife must beat bare hands but not an iron sword.
  if (!(rank.knife > rank.club)) throw new Error("knife should outrank a club");
});

check("ui: every panel tab declared in index.html actually renders", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const tabs = [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]);
  if (tabs.length < 7) throw new Error("expected the panel to declare its tabs, found " + tabs.length);
  const el = new El("panel-content");
  const orig = documentStub.getElementById;
  documentStub.getElementById = (id) => (id === "panel-content" ? el : getEl(id));
  try {
    for (const t of tabs) {
      el._html = "";
      g.setPanelTab(t);
      if (!el._html || el._html.length < 20) throw new Error(`panel tab '${t}' rendered nothing`);
    }
  } finally {
    documentStub.getElementById = orig;
    g.setPanelTab("colony");
  }
});

check("stock: the inventory panel reports real counts", () => {
  g.jobs.spawnItem("marble", g.world.spawnX, g.world.spawnY, null, 0);
  g.jobs.spawnItem("arrow", g.world.spawnX, g.world.spawnY, null, 0);
  const marble = g.countItems("marble");
  const arrows = g.countItems("arrow");
  if (!marble || !arrows) throw new Error("failed to seed stock");
  const el = new El("panel-content");
  const orig = documentStub.getElementById;
  documentStub.getElementById = (id) => (id === "panel-content" ? el : getEl(id));
  try { g.setPanelTab("stock"); } finally { documentStub.getElementById = orig; }
  const html = el._html;
  if (!html.includes("Stock")) throw new Error("no Stock heading");
  if (!html.includes(`<b>${marble}</b>`)) throw new Error("marble count " + marble + " missing");
  if (!/Ammunition/i.test(html)) throw new Error("no ammunition section");
  if (!new RegExp(arrows * 5 + " shots").test(html)) throw new Error("arrow count not expressed in shots");
  g.setPanelTab("colony");
});

check("death: a fallen elf leaves a named body behind", () => {
  // fresh colony: the shared one has usually been wiped out by the Storyteller
  // checks above (40 unattended days of forced incidents).
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const victim = gs.dwarves[gs.dwarves.length - 1];
  const name = victim.name;
  const before = gs.items.filter(i => i.kind === "corpse").length;
  gs.recordDeath(victim, "died in a test");
  gs.flushRemovals();
  const bodies = gs.items.filter(i => i.kind === "corpse");
  if (bodies.length !== before + 1) throw new Error("no body was left behind");
  const body = bodies[bodies.length - 1];
  if (body.name !== name) throw new Error("the body lost the elf's name");
  if (!body.diedDay) throw new Error("the body lost the day of death");
  // ...and a corpse must never be offered to ordinary hauling
  const loose = gs.jobs.findLooseItem(body.x, body.y, body.z);
  if (loose && loose.kind === "corpse") throw new Error("a corpse was offered to ordinary hauling");
});

check("burial: a graveyard turns a body into a named grave (and it saves)", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const w = gs.world;
  const victim = gs.dwarves[gs.dwarves.length - 1];
  const name = victim.name;
  gs.recordDeath(victim, "died in a test");
  gs.flushRemovals();
  const body = gs.items.find(i => i.kind === "corpse");
  if (!body) throw new Error("no body was left behind");
  // zone a graveyard around the body, give everyone the hauling labour
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = body.x + dx, y = body.y + dy;
    if (w.isWalkable(x, y, body.z)) w.get(x, y, body.z).zone = "graveyard";
  }
  gs.rebuildZones();
  if (!gs.graveyardTiles.length) throw new Error("graveyard zone was not registered");
  for (const d of gs.dwarves) d.labors.add("hauling");
  const hasGrave = () => gs.graveyardTiles.some(([x, y, z]) => { const t = w.get(x, y, z || 0); return !!(t && t.grave); });
  for (let i = 0; i < 8000 && !hasGrave(); i++) gs.update(0.1);
  if (!hasGrave()) throw new Error("no grave was dug");
  const plot = gs.graveyardTiles.find(([x, y, z]) => { const t = w.get(x, y, z || 0); return !!(t && t.grave); });
  const t = w.get(plot[0], plot[1], plot[2] || 0);
  if (t.grave.name !== name) throw new Error("the grave is not named after the elf");
  if (!(gs.stats.buried >= 1)) throw new Error("burial was not counted");

  // the grave must survive a save/load
  const data = JSON.parse(JSON.stringify(gs.serialize()));
  const g2 = run("(d)=>new Game(d)", data);
  let found = 0;
  for (let z = 0; z >= g2.world.minZ; z--) {
    const tiles = g2.world.getLevel(z);
    if (!tiles) continue;
    for (const row of tiles) for (const tile of row) if (tile.grave) found++;
  }
  if (!found) throw new Error("graves were not serialized");

  // Exercise the new render paths: a grave and a fresh corpse on screen. draw()
  // is otherwise only ever called on a map with neither.
  gs.cam.x = plot[0]; gs.cam.y = plot[1];
  gs.renderer.draw();
  const g3 = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  g3.recordDeath(g3.dwarves[0], "died in a test");
  g3.flushRemovals();
  const corpse = g3.items.find(i => i.kind === "corpse");
  if (!corpse) throw new Error("no corpse to draw");
  g3.cam.x = corpse.x; g3.cam.y = corpse.y;
  g3.renderer.draw();
});

check("colony lost: the last death ends the colony", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  for (const d of gs.dwarves.slice()) { gs.recordDeath(d, "died in a test"); gs.flushRemovals(); }
  if (gs.dwarves.length) throw new Error("dwarves should all be gone");
  if (!gs.colonyLost) throw new Error("colony was not marked lost");
  if (!gs.paused) throw new Error("the simulation should stop");
  const s = gs.colonySummary();
  for (const key of ["day", "peak", "techs", "techTotal", "milestones", "graves", "burials", "difficulty", "map"]) {
    if (s[key] === undefined) throw new Error("summary is missing " + key);
  }
});

check("arms: a new colony starts armed, and weapons equip per elf", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  const count = (kind, sub) => gs.items.filter(i => i.kind === kind && (!sub || i.sub === sub)).length;
  if (count("weapon", "knife") < 3) throw new Error("a new colony has no knives");
  if (count("weapon", "stone_spear") < 2) throw new Error("no starting spears");
  if (count("weapon", "shortbow") < 2) throw new Error("no starting bows");
  if (count("arrow") < 3) throw new Error("no starting arrows");

  const d = gs.dwarves[0];
  const bows0 = count("weapon", "shortbow");
  if (!gs.equipWeaponFor(d, "shortbow")) throw new Error("could not equip a short bow");
  if (d.weapon !== "shortbow") throw new Error("the weapon was not set on the elf");
  if (count("weapon", "shortbow") !== bows0 - 1) throw new Error("the bow was not taken from the store");
  if (!gs.equipWeaponFor(d, "stone_spear")) throw new Error("could not swap weapons");
  if (count("weapon", "shortbow") !== bows0) throw new Error("the old weapon was not dropped back");
  if (gs.equipWeaponFor(d, "laser_rifle")) throw new Error("equipped a weapon the colony does not own");
  if (!gs.equipWeaponFor(d, null)) throw new Error("could not disarm");
  if (d.weapon) throw new Error("still holding a weapon after disarming");
});

check("research: tiers collapse, and finished ones start closed", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  const el = new El("panel-content");
  const orig = documentStub.getElementById;
  const render = () => {
    el._html = "";
    documentStub.getElementById = (id) => (id === "panel-content" ? el : getEl(id));
    try { gs.setPanelTab("research"); } finally { documentStub.getElementById = orig; }
  };
  render();
  if (!el._html.includes("tech-tier")) throw new Error("no tier headers rendered");
  if (!el._html.includes("tt-count")) throw new Error("tiers do not show their progress");
  if (!el._html.includes('data-tech="tools"')) throw new Error("an unfinished tier should start open");
  for (const t of run("TECHS").filter(x => x.tier === 1)) gs.tech[t.id] = true;   // finish tier 1
  gs.techTierOpen = {};
  render();
  if (el._html.includes('data-tech="tools"')) throw new Error("a finished tier did not collapse");
  gs.setPanelTab("colony");
});

check("arms: the inspector offers an equipment picker", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  gs.selectedDwarf = gs.dwarves[0];
  const html = gs.inspectorHTML();
  if (!html.includes("Equipment")) throw new Error("the inspector has no Equipment section");
  if (!html.includes('data-equip=""')) throw new Error("there is no way to disarm an elf");
  if (!/data-equip="(knife|shortbow|stone_spear)"/.test(html)) throw new Error("no weapons are offered");
});

check("mining: a designation covers the volume, one layer at a time", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const K = run("K");
  const w = gs.world;
  let spot = null;
  // Find a column of rock: a surface stone tile that also has stone under it.
  // The level below only exists once the world has generated it, which is what
  // digging a stairwell down does in play — so materialise it first.
  w.getLevel(-1);
  for (let y = 1; y < w.h - 1 && !spot; y++) for (let x = 1; x < w.w - 1 && !spot; x++) {
    const t = w.get(x, y, 0);
    if (!t || t.kind !== K.STONE || !w.hasWalkableNeighbor(x, y, 0)) continue;
    const below = w.get(x, y, -1);
    if (below && below.kind === K.STONE) spot = { x, y };
  }
  if (!spot) throw new Error("no column of rock to test mining with");
  gs.input.tool = "dig"; gs.viewZ = 0;
  gs.input.applyTool({ x: spot.x, y: spot.y }, { x: spot.x, y: spot.y });
  if (w.get(spot.x, spot.y, 0).designation !== "dig") throw new Error("the tile was not designated");
  let queued = 0;
  for (let z = -1; z >= w.minZ; z--) {
    const t = w.get(spot.x, spot.y, z);
    if (t && t.designation === "dig" && t.digQueue > 0) queued++; else break;
  }
  if (!queued) throw new Error("no deeper layers were queued - volume mining is not working");
  run("(g)=>g.jobs.reindex()", gs);
  const offered = gs.jobs.candidates.dig.some(([x, y, z]) => x === spot.x && y === spot.y && z < 0);
  if (offered) throw new Error("a queued layer was offered before the layer above was cleared");
});

check("mining: gold and marble are hidden until the rock is worked", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "medium" });
  const w = gs.world, hiddenOres = run("HIDDEN_ORES");
  let precious = 0, hidden = 0;
  for (let z = 0; z >= w.minZ; z--) {
    const tiles = w.getLevel(z);
    if (!tiles) continue;
    for (const row of tiles) for (const t of row) {
      if (!t.ore) continue;
      if (hiddenOres.includes(t.ore)) { precious++; if (!t.revealed) hidden++; }
      else if (!t.revealed) throw new Error("common ore should not be hidden: " + t.ore);
    }
  }
  if (!precious) throw new Error("no precious ore in the generated world");
  if (!hidden) throw new Error("precious ore was not hidden at world gen");
});

check("shifts: a night elf works while everyone else sleeps", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const DAY = run("DAY_LENGTH");
  const d = gs.dwarves[0];
  d.hunger = 0; d.thirst = 0; d.energy = 80;
  d.wounded = false; d.infected = false; d.vampireExposed = false;
  d.schedule = { day: "work", night: "sleep" };
  gs.time = DAY * 0.9;                      // night
  d.shiftPref = "any";
  if (gs.resolveActivity(d) !== "sleep") throw new Error("an ordinary elf should be asleep at night");
  d.shiftPref = "night";
  if (gs.resolveActivity(d) !== "work") throw new Error("a night-shift elf should be working at night");
  gs.time = DAY * 0.5;                      // daytime
  if (gs.resolveActivity(d) !== "sleep") throw new Error("a night-shift elf should sleep through the day");
  d.shiftPref = "any";
  if (gs.resolveActivity(d) !== "work") throw new Error("an ordinary elf should be working by day");
});

check("research: tiers are gated behind a built structure", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "standard", mapSize: "small" });
  const w = gs.world, K = run("K");
  for (const t of run("TECHS").filter(t2 => t2.tier === 1)) gs.tech[t.id] = true;
  const tech = run("TECHS").find(t => t.tier === 2);
  gs.rebuildZones();
  if (gs.tierGateMet(2)) throw new Error("tier 2 should start locked");
  if (!gs.tierGateMissing(2)) throw new Error("a locked tier should say what it needs");
  if (gs.techPrereqsMet(tech)) throw new Error("a tier-2 tech should be locked before its structure exists");
  let placed = false;
  for (let y = 2; y < w.h - 2 && !placed; y++) for (let x = 2; x < w.w - 2 && !placed; x++) {
    if (w.isWalkable(x, y, 0)) { w.get(x, y, 0).workshop = "crafting"; placed = true; }
  }
  if (!placed) throw new Error("could not place a test bench");
  gs.rebuildZones();
  if (!gs.tierGateMet(2)) throw new Error("building a Crafting Bench did not open tier 2");
  if (!gs.techPrereqsMet(tech)) throw new Error("the tech is still gated after the bench was built");
});

check("saves: a versioned save migrates, and a future one is refused", () => {
  const migrate = (d) => run("(d)=>migrateSave(d)", d);
  const SAVE_VERSION = run("SAVE_VERSION");
  if (SAVE_VERSION < 6) throw new Error("the save format should now be versioned at 6+");

  const old = { version: 5, world: { w: 10, h: 10 } };
  const m = migrate(old);
  if (!m.ok) throw new Error("a v5 save did not migrate: " + m.reason);
  if (m.data.version !== SAVE_VERSION) throw new Error("migration did not stamp the new version");
  if (!m.applied.length) throw new Error("migration was not recorded");

  const future = migrate({ version: SAVE_VERSION + 5 });
  if (future.ok) throw new Error("a save from a newer build should be refused");
  if (!/newer build/.test(future.reason)) throw new Error("unhelpful reason: " + future.reason);

  if (migrate(null).ok) throw new Error("null should not migrate");
  if (migrate([1, 2, 3]).ok) throw new Error("an array should not migrate");

  // end to end: a save written without a version still loads
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const data = JSON.parse(JSON.stringify(gs.serialize()));
  delete data.version;
  const back = run("(d)=>migrateSave(d)", data);
  if (!back.ok || back.data.version !== SAVE_VERSION) throw new Error("a version-less save did not migrate");
  const g2 = run("(d)=>new Game(d)", back.data);
  if (g2.dwarves.length !== gs.dwarves.length) throw new Error("the migrated save lost its colony");
});

check("accessibility: the colour-safe palette is complete and switchable", () => {
  const ORE = run("ORE_COLOR"), SAFE = run("ORE_COLOR_SAFE");
  for (const ore of ["iron", "gold", "coal", "marble"]) {
    if (!ORE[ore]) throw new Error("no default colour for " + ore);
    if (!SAFE[ore]) throw new Error("no colour-safe colour for " + ore);
    if (SAFE[ore] === ORE[ore]) throw new Error(ore + " is identical in both palettes");
  }
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const before = gs.moodColor(80);
  run("setPalette", "safe");
  if (!ctx.window.__paletteSafe) throw new Error("setPalette did not take effect");
  if (gs.moodColor(80) === before) throw new Error("mood colour does not change with the palette");
  run("setPalette", "default");
  if (ctx.window.__paletteSafe) throw new Error("setPalette did not switch back");
});

check("accessibility: the interface scale is remembered and applied", () => {
  const set = (m) => run("(m)=>setUiScale(m)", m);
  const get = () => run("()=>uiScaleMode()");
  if (get() !== "normal") throw new Error("the interface scale should default to normal");
  set("large");
  if (get() !== "large") throw new Error("the scale was not stored");
  if (documentStub.documentElement.getAttribute("data-ui") !== "large") throw new Error("data-ui was not set");
  set("compact");
  if (get() !== "compact") throw new Error("the scale did not change");
  set("nonsense");
  if (get() !== "normal") throw new Error("an unknown scale should fall back to normal");
});

check("diagnostics: a report carries the facts a playtest needs", () => {
  const D = run("Diagnostics");
  D.clear();
  D.record("before any game", "", 0, "");
  if (D.errors[0].day !== null) throw new Error("an error before a colony should record no day");
  const game = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  ctx.window.game = game;                       // record() reads the live game's day
  D.record("boom", "/tmp/x/game.js", 42, "at a\nat b");
  D.record("second failure", "", 0, "");
  if (D.errors.length !== 3) throw new Error("errors were not recorded");
  if (D.errors[1].where !== "game.js:42") throw new Error("the source was not recorded: " + D.errors[1].where);
  if (!(D.errors[1].day >= 1)) throw new Error("the in-game day was not recorded");

  // the buffer is bounded, so a crash loop cannot eat memory
  for (let i = 0; i < 60; i++) D.record("spam " + i, "", 0, "");
  if (D.errors.length > 20) throw new Error("the error buffer is unbounded: " + D.errors.length);

  const text = run("(g)=>Diagnostics.report(g)", game);
  for (const want of ["Elven Empire diagnostics", "build", "save check", "perf", "colony", "seed"]) {
    if (text.indexOf(want) === -1) throw new Error("the report is missing " + want);
  }
  if (text.indexOf("serialises OK") === -1) throw new Error("a healthy game did not pass the save check");
  if (text.indexOf("errors") === -1) throw new Error("the report does not mention errors");

  // with no game it must still produce something, not throw
  if (run("()=>Diagnostics.report(null)").indexOf("no game in progress") === -1) {
    throw new Error("an empty report does not say so");
  }

  // a game that cannot serialise must be reported, not swallowed
  const broken = { settings: {}, time: 0, weather: "clear", dwarves: [], enemies: [], items: [],
                   world: { w: 1, h: 1, seed: 1, minZ: 0 },
                   season: () => ({ name: "Spring" }),
                   serialize: () => { throw new Error("nope"); } };
  if (run("(b)=>Diagnostics.report(b)", broken).indexOf("FAILED to serialise") === -1) {
    throw new Error("a broken save check was not caught");
  }

  // delivering must not throw even where the DOM cannot do it
  const how = run("(t)=>Diagnostics.deliver(t,'x.txt')", "hello");
  if (!how) throw new Error("deliver returned nothing");
  D.clear();
  ctx.window.game = null;
});

check("camera: WASD pans the map, and the displaced tool keys follow", () => {
  const setPan = (on) => run("(on)=>setWasdPan(on)", on);
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const input = gs.input;
  const hold = (k) => { input.keys.add(k); gs.handleCameraKeys(0.5); input.keys.clear(); };

  setPan(true);
  gs.cam.x = 20; gs.cam.y = 20;
  hold("d");
  if (!(gs.cam.x > 20)) throw new Error("D did not pan the camera east");
  hold("a");
  if (!(gs.cam.x < 20 + 1)) throw new Error("A did not pan the camera west");
  const y0 = gs.cam.y; hold("w");
  if (!(gs.cam.y < y0)) throw new Error("W did not pan north");
  const y1 = gs.cam.y; hold("s");
  if (!(gs.cam.y > y1)) throw new Error("S did not pan south");

  // while panning, the letters must NOT also pick a tool
  for (const k of ["a", "s", "d"]) {
    if (input.toolForKey(k) !== null) throw new Error(k + " still selects a tool while WASD panning");
  }
  // ...but mining, stockpiling and ramps still have home keys
  if (input.toolForKey("m") !== "dig") throw new Error("M should mine");
  if (input.toolForKey("i") !== "stockpile") throw new Error("I should open stockpiles");
  if (input.toolForKey("n") !== "rampdown") throw new Error("N should dig a ramp");

  // the arrow keys never stopped working
  const x1 = gs.cam.x; hold("arrowright");
  if (!(gs.cam.x > x1)) throw new Error("the arrow keys stopped panning");

  // switching it off restores the original bindings exactly
  setPan(false);
  if (input.toolForKey("d") !== "dig") throw new Error("D should mine again with WASD panning off");
  if (input.toolForKey("s") !== "stockpile") throw new Error("S should stockpile again");
  if (input.toolForKey("a") !== "rampdown") throw new Error("A should be ramps again");
  if (input.toolForKey("m") !== "dig") throw new Error("M should still mine either way");
  const x2 = gs.cam.x; hold("d");
  if (gs.cam.x !== x2) throw new Error("D still pans with WASD panning off");
  setPan(true);                                  // leave the default in place
});

check("setup screen: the primary action cannot be pushed off the fold", () => {
  // The options scroll; Begin and Back sit in a sibling row that does not, so a
  // short viewport can never hide the screen's primary action.
  const html = run("(p)=>newGameDialogHTML(p)", { difficulty: "gentle", mapSize: "small" });
  if (html.indexOf("ng-scroll") === -1) throw new Error("the setup options are not in a scroll container");
  if (html.indexOf("id=\"ng-start\"") === -1) throw new Error("Begin is missing");
  if (html.indexOf("id=\"ng-back\"") === -1) throw new Error("Back is missing");
  if (!(html.indexOf("ng-scroll") < html.indexOf("menu-btns"))) {
    throw new Error("the action row should come after the scrolling options");
  }
  if (!(html.indexOf("menu-btns") < html.indexOf("id=\"ng-start\""))) {
    throw new Error("Begin should live in the action row, outside the scroller");
  }
  // and the options must genuinely be inside the scroller
  const open = html.indexOf("ng-scroll"), close = html.indexOf("ng-start");
  if (html.slice(open, close).indexOf("opt-card") === -1) {
    throw new Error("the option cards are not inside the scroll container");
  }
});

check("perf: the optional readout reports frame rate and simulation cost", () => {
  const set = (on) => run("(on)=>setPerfBadge(on)", on);
  if (run("perfBadgeOn")) throw new Error("the performance readout should default to off");
  set(true);
  if (!ctx.window.__perfBadge) throw new Error("setPerfBadge did not take effect");
  if (!run("perfBadgeOn")) throw new Error("the readout setting was not stored");

  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  gs.frameMs = 16.7; gs.updateMs = 0.09;
  gs.updatePerfBadge();                  // no DOM here: it must not throw
  ctx.window.game = gs;
  gs.updatePerfBadge();

  set(false);
  if (ctx.window.__perfBadge) throw new Error("the readout did not switch off");
  ctx.window.game = null;
});

check("diagnostics: the report carries the colony's history, not just its state", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const text = run("(g)=>Diagnostics.report(g)", gs);
  if (text.indexOf("history") === -1) throw new Error("the report has no history line");
  if (!/\d+ days/.test(text)) throw new Error("the history line does not say how far the colony got");
  if (text.indexOf("peak") === -1) throw new Error("the history line does not report a peak population");
  // and it must survive a game whose summary is unavailable
  const broken = { settings: {}, time: 0, weather: "clear", dwarves: [], enemies: [], items: [],
                   world: { w: 1, h: 1, seed: 1, minZ: 0 },
                   season: () => ({ name: "Spring" }),
                   serialize: () => "{}" };
  if (run("(b)=>Diagnostics.report(b)", broken).indexOf("Elven Empire diagnostics") === -1) {
    throw new Error("a game without a summary broke the report");
  }
});

check("mining: a selection designates the whole area, not just the reachable rim", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const K = run("K"), w = gs.world;

  // Find a rock body whose 4x4 corner has both reachable and buried stone.
  let at = null;
  for (let y = 1; y < w.h - 5 && !at; y++) {
    for (let x = 1; x < w.w - 5 && !at; x++) {
      const a = w.get(x, y, 0), b = w.get(x + 1, y, 0), c = w.get(x, y + 1, 0);
      if (a && b && c && a.kind === K.STONE && b.kind === K.STONE && c.kind === K.STONE) at = { x, y };
    }
  }
  if (!at) throw new Error("no rock body found to test with");

  let stone = 0, reachable = 0;
  for (let y = at.y; y < at.y + 4; y++) for (let x = at.x; x < at.x + 4; x++) {
    const t = w.get(x, y, 0);
    if (t && t.kind === K.STONE) { stone++; if (w.hasWalkableNeighbor(x, y, 0)) reachable++; }
  }
  if (reachable === 0 || reachable === stone) throw new Error("the sample has no buried stone to distinguish");

  gs.viewZ = 0;
  gs.input.tool = "dig";
  gs.input.applyTool({ x: at.x, y: at.y }, { x: at.x + 3, y: at.y + 3 });

  let designated = 0;
  for (let y = at.y; y < at.y + 4; y++) for (let x = at.x; x < at.x + 4; x++) {
    const t = w.get(x, y, 0);
    if (t && t.kind === K.STONE && t.designation === "dig") designated++;
  }
  if (designated !== stone) {
    throw new Error(`only ${designated} of ${stone} stone tiles were designated (the rim is ${reachable})`);
  }

  // The reachability guard must still live in the job pool, or elves would be
  // handed work they cannot walk to.
  gs.jobs.reindex();
  for (const [x, y, z] of gs.jobs.candidates.dig) {
    if (!w.hasWalkableNeighbor(x, y, z)) throw new Error(`an unreachable tile entered the job pool: ${x},${y},${z}`);
  }
  if (!gs.jobs.candidates.dig.length) throw new Error("no mining jobs were offered at all");

  // And when the rim comes away, the interior must become available by itself —
  // this is what stops elves "mining the outside and stopping".
  const buried = [];
  for (let y = at.y; y < at.y + 4; y++) for (let x = at.x; x < at.x + 4; x++) {
    const t = w.get(x, y, 0);
    if (t && t.kind === K.STONE && t.designation === "dig" && !w.hasWalkableNeighbor(x, y, 0)) buried.push([x, y]);
  }
  if (!buried.length) throw new Error("the sample has no buried designations");
  // dig out a tile adjacent to a buried one, as a finished dig would
  const [bx, by] = buried[0];
  const rim = [[bx - 1, by], [bx + 1, by], [bx, by - 1], [bx, by + 1]]
    .find(([x, y]) => { const t = w.get(x, y, 0); return t && t.kind === K.STONE && t.designation === "dig"; });
  if (!rim) throw new Error("no adjacent designated tile to clear");
  w.get(rim[0], rim[1], 0).kind = K.FLOOR;
  gs.jobs.reindex();
  const nowOffered = gs.jobs.candidates.dig.some(([x, y, z]) => x === bx && y === by && z === 0);
  if (!nowOffered) throw new Error("the interior stayed unofferable after the rim was cleared");
});

check("command: an enlisted elf obeys a move order in a quiet colony", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const w = gs.world;
  // The bug was that the order was only ever read when enemies were about, so
  // that condition is the whole point of this check.
  if (gs.enemies.length) throw new Error("this check needs an unthreatened colony");

  const d = gs.dwarves[0];
  d.military = true;
  gs.selectedSquad = []; gs.selectedDwarf = null;

  // Exactly what a player does: click the elf, then click the ground.
  const at = { x: d.tileX, y: d.tileY };
  gs.input.handleSelectDrag(at, at, {});
  if (!gs.selectedSquad.length) throw new Error("clicking an enlisted elf did not select them");

  let target = null;
  for (let r = 3; r < 7 && !target; r++) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const x = d.tileX + dx, y = d.tileY + dy;
      if (x > 0 && y > 0 && x < w.w && y < w.h && w.isWalkable(x, y, d.z || 0)) { target = { x, y }; break; }
    }
  }
  if (!target) throw new Error("no walkable ground to order them to");

  gs.input.handleSelectDrag(target, target, {});
  if (!d.manualOrder) throw new Error("the move order was not recorded");

  const before = Math.hypot(d.x - target.x, d.y - target.y);
  for (let i = 0; i < 900; i++) gs.update(1 / 60);
  const after = Math.hypot(d.x - target.x, d.y - target.y);
  if (after > 1.2) {
    throw new Error(`the elf did not arrive: ${before.toFixed(1)} -> ${after.toFixed(1)} tiles (${d.thought})`);
  }
  if (d.thought !== "Holding position") throw new Error("the elf did not report holding the position");

  // A civilian must NOT be given manual control — that rule is deliberate.
  const civ = gs.dwarves.find(x => !x.military);
  if (civ) {
    gs.selectedSquad = [civ]; gs.selectedDwarf = civ;
    civ.manualOrder = null;
    gs.input.handleSelectDrag({ x: civ.tileX + 3, y: civ.tileY }, { x: civ.tileX + 3, y: civ.tileY }, {});
    if (civ.manualOrder) throw new Error("a civilian was given a manual move order");
  }
});

check("command: right-click marches a squad and names a target to attack", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const w = gs.world;
  const squad = gs.dwarves.slice(0, 3);
  for (const d of squad) d.military = true;
  gs.selectedSquad = squad.slice();

  // right-click open ground -> every selected elf gets the move order
  let target = null;
  for (let r = 3; r < 7 && !target; r++) {
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const x = squad[0].tileX + dx, y = squad[0].tileY + dy;
      if (x > 0 && y > 0 && x < w.w && y < w.h && w.isWalkable(x, y, 0)) { target = { x, y }; break; }
    }
  }
  if (!target) throw new Error("no open ground to order them to");
  gs.input.rightClickOrder(target);
  for (const d of squad) {
    if (!d.manualOrder) throw new Error(`${d.name} did not receive the group move order`);
    if (d.attackOrder) throw new Error("a move order left an attack order standing");
  }

  // right-click an enemy -> an attack order naming that enemy
  const d0 = squad[0];
  const foe = run("(k,x,y,z)=>new Enemy(k,x,y,z)", "zombie", d0.tileX + 1, d0.tileY, 0);
  gs.enemies.push(foe);
  const ft = { x: Math.floor(foe.x), y: Math.floor(foe.y) };
  gs.input.rightClickOrder(ft);
  for (const d of squad) {
    if (d.attackOrder !== foe) throw new Error("the attack order did not name the target");
    if (d.manualOrder) throw new Error("an attack order left a move order standing");
  }
  if (!/attack/.test(gs.log ? "" : "")) { /* log is DOM-side; nothing to assert */ }

  // and it routes into combat: an adjacent target takes a hit
  const hp0 = foe.hp;
  for (let i = 0; i < 120; i++) gs.update(1 / 60);
  if (!(foe.hp < hp0)) throw new Error("the ordered attack never landed a blow");

  // the order is dropped once the target is dead, rather than chasing a corpse
  foe.hp = 0;
  gs.update(1 / 60);
  for (const d of squad) if (d.attackOrder) throw new Error("the attack order outlived its target");

  // right-clicking a COLONIST must never be an attack
  gs.enemies.length = 0;
  const mate = gs.dwarves.find(x => x !== d0);
  mate.military = false;
  const mateT = { x: mate.tileX, y: mate.tileY };
  w.get(mateT.x, mateT.y, 0).kind = w.get(mateT.x, mateT.y, 0).kind === "stone" ? "floor" : w.get(mateT.x, mateT.y, 0).kind;
  gs.input.rightClickOrder(mateT);
  for (const d of squad) {
    if (d.attackOrder) throw new Error("a colonist could be ordered as an attack target");
  }

  // nothing selected: it must do nothing at all, not throw
  gs.selectedSquad = [];
  gs.input.rightClickOrder({ x: 5, y: 5 });
});

check("command: a multi-selection offers a group enlist", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const squad = gs.dwarves.slice(0, 3);
  for (const d of squad) d.military = false;
  gs.selectedSquad = squad.slice(); gs.selectedDwarf = null;

  const civilianView = gs.inspectorHTML();
  if (civilianView.indexOf("insp-squad-enlist") === -1) throw new Error("a group of civilians had no enlist control");
  if (civilianView.indexOf("insp-squad-release") !== -1) throw new Error("a group of civilians was offered release-to-AI");

  for (const d of squad) d.military = true;
  const soldierView = gs.inspectorHTML();
  if (soldierView.indexOf("insp-squad-release") === -1) throw new Error("an enlisted group had no release control");
  if (soldierView.indexOf("insp-squad-discharge") === -1) throw new Error("an enlisted group could not be stood down in bulk");
  if (soldierView.indexOf("insp-squad-enlist") !== -1) throw new Error("an all-soldier group still offered enlist");
  if (soldierView.indexOf("Right-click") === -1) throw new Error("the group panel does not explain right-click orders");
});

check("building: furniture and workshops go on a finished floor", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const Bv = run("B"), w = gs.world;
  gs.viewZ = 0;

  // a bare, walkable tile
  let at = null;
  for (let y = 1; y < w.h - 1 && !at; y++) for (let x = 1; x < w.w - 1 && !at; x++) {
    const t = w.get(x, y, 0);
    if (t && t.built === Bv.NONE && w.isWalkable(x, y, 0) && !t.feature && !t.zone) at = { x, y, t };
  }
  if (!at) throw new Error("no bare ground found");

  // floor it, exactly as a finished floor build would
  const t = at.t;
  t.built = Bv.FLOOR;
  t.buildMaterial = t.buildMaterial || "wood";
  t.buildJob = false;

  // the fix: a bed and a workshop can now go on top of it
  gs.input.tool = "bed";
  gs.input.applyTool(at, at);
  if (!t.buildJob || t.buildKind !== "bed") throw new Error("a bed could not be built on a finished floor");

  t.buildJob = false; t.buildKind = null;
  gs.input.tool = "smelter";
  gs.input.applyTool(at, at);
  if (!t.buildJob || t.buildKind !== "smelter") throw new Error("a workshop could not be built on a finished floor");

  // but the structural rules still hold: no floor on a floor, no wall on a floor
  t.buildJob = false; t.buildKind = null;
  gs.input.tool = "floor";
  gs.input.applyTool(at, at);
  if (t.buildJob) throw new Error("a second floor was allowed on top of a floor");

  t.buildJob = false; t.buildKind = null;
  gs.input.tool = "build";
  gs.input.applyTool(at, at);
  if (t.buildJob) throw new Error("a wall was allowed on top of a floor");

  // and a bed still cannot be placed inside a wall
  const t2 = { ...t, built: Bv.WALL, buildJob: false, buildKind: null, furniture: null, workshop: null, stockpile: null };
  if (gs.input.canPlaceFixture(t2)) throw new Error("a wall was treated as a placeable surface");
});

check("hunting: a hunter kills a wild animal for meat, never a tamed one", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const d = gs.dwarves[0];
  if (!run("SKILLS").hunting) throw new Error("there is no Hunting skill");
  if (!run("LABORS").some(l => l.job === "hunt")) throw new Error("there is no Hunting labor");
  if (!run("JOB_SKILL").hunt) throw new Error("the hunt job trains no skill");

  // a wild fox in reach, and somebody's pet beside it
  const fox = run("(k,x,y)=>new Animal(k,x,y,0)", "fox", d.tileX + 1, d.tileY);
  if (fox.tileX === undefined) throw new Error("an animal has no tile position");
  gs.animals.push(fox);
  const pet = run("(k,x,y)=>new Animal(k,x,y,0)", "fox", d.tileX - 1, d.tileY);
  pet.tamed = true;
  gs.animals.push(pet);
  gs.jobs.reindex();

  if (!gs.jobs.candidates.hunt.includes(fox)) throw new Error("the wild animal was not offered as quarry");
  if (gs.jobs.candidates.hunt.includes(pet)) throw new Error("a TAMED animal was offered as quarry");

  // without the labor there is no hunting
  d.labors.delete("hunting");
  if (gs.jobs.assignHunt(d)) throw new Error("an elf with no Hunting labor went hunting anyway");

  d.labors.add("hunting");
  if (!gs.jobs.assignHunt(d)) throw new Error("a hunter did not take the job");
  if (!d.job || d.job.type !== "hunt") throw new Error("the assigned job was not a hunt");

  const before = d.skillXp ? d.skillXp("hunting") : 0;
  let ticks = 0;
  while (gs.animals.includes(fox) && ticks < 3000) { gs.update(1 / 60); ticks++; }

  if (gs.animals.includes(fox)) throw new Error(`the fox survived ${ticks} ticks (job=${d.job && d.job.type}, thought=${d.thought})`);
  if (!gs.animals.includes(pet)) throw new Error("the hunt killed a tamed animal as well");

  // Counted across the colony rather than at the kill site: haulers pick meat up
  // the moment it drops, which is the correct behaviour and would otherwise make
  // this look like a failure.
  const meat = gs.items.filter(i => i.kind === "food" && i.sub === "meat");
  if (meat.length < 2) throw new Error(`the kill produced ${meat.length} meat (expected at least 2)`);

  if (d.skillLevel("hunting") < 0) throw new Error("hunting skill is not readable");
  const after = d.skillXp ? d.skillXp("hunting") : 0;
  if (d.skillXp && !(after > before)) throw new Error("the hunter learned nothing");
});

check("command: several elves on one square can still be picked apart", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const a = gs.dwarves[0], b = gs.dwarves[1];
  // put them on the same square, which a rout used to cause
  b.x = a.x; b.y = a.y; b.z = a.z;
  const t = { x: a.tileX, y: a.tileY };

  gs.selectedDwarf = null;
  gs.input.handleSelect(t);
  const first = gs.selectedDwarf;
  gs.input.handleSelect(t);
  const second = gs.selectedDwarf;

  if (!first || !second) throw new Error("a square with two elves on it selected nobody");
  if (first === second) throw new Error("clicking a stack always returned the same elf — a selection dead end");
  if (![first, second].includes(a) || ![first, second].includes(b)) {
    throw new Error("cycling did not reach both elves on the square");
  }
  gs.input.handleSelect(t);
  if (!gs.selectedDwarf) throw new Error("cycling left nothing selected");
});

check("rout: fleeing civilians scatter instead of all running for one tile", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const squad = gs.dwarves.slice(0, 4);
  if (squad.length < 4) throw new Error("not enough elves to test a rout");
  for (const d of squad) { d.fleeing = true; d.fleeTarget = gs.claimFleeSpot(d); }

  const spots = new Set(squad.map(d => d.fleeTarget.x + "," + d.fleeTarget.y));
  if (spots.size !== squad.length) {
    throw new Error(`${squad.length} fleeing elves claimed only ${spots.size} distinct squares`);
  }
  // and each claimed square is somewhere they can actually stand
  for (const d of squad) {
    if (!gs.world.isWalkable(d.fleeTarget.x, d.fleeTarget.y, 0)) {
      throw new Error("a flee spot was claimed on unwalkable ground");
    }
  }
});

check("movement: one elf per square, and it must not freeze anyone", () => {
  const gs = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  const w = gs.world, a = gs.dwarves[0], b = gs.dwarves[1];

  // a walkable square with a walkable neighbour
  let T = null;
  for (let y = 2; y < w.h - 2 && !T; y++) for (let x = 2; x < w.w - 2 && !T; x++) {
    if (w.isWalkable(x, y, 0) && w.isWalkable(x + 1, y, 0)) T = { x, y };
  }
  if (!T) throw new Error("no open ground to test with");

  gs.update(1 / 60);                       // builds the occupancy map and d.game
  const park = () => {
    b.x = T.x; b.y = T.y; b.z = 0;
    a.x = T.x + 1; a.y = T.y; a.z = 0;
    gs._occupied.set(T.x + "," + T.y + ",0", b);   // b holds the square
    a.path = [{ x: T.x, y: T.y, z: 0 }]; a.pathIdx = 0; a.blockedFor = 0;
  };

  // 1. it will not step onto a square another elf holds
  park();
  a.move(1 / 60);
  if (a.tileX === T.x && a.tileY === T.y) throw new Error("an elf stepped onto a square another elf was standing on");

  // 2. and it does not force its way in later either — the escape valve gives up
  //    the step rather than the rule
  let abandoned = false;
  for (let i = 0; i < 120; i++) { a.move(1 / 60); if (!a.path) { abandoned = true; break; } }
  if (a.tileX === T.x && a.tileY === T.y) throw new Error("a blocked elf eventually forced its way onto the occupied square");
  if (!abandoned) throw new Error("a blocked elf waited for ever instead of giving up the step");

  // 3. the rule lifts the moment the square is free
  gs._occupied.delete(T.x + "," + T.y + ",0");
  b.x = T.x + 2; b.y = T.y + 2;
  park(); gs._occupied.delete(T.x + "," + T.y + ",0");
  for (let i = 0; i < 400 && !(a.tileX === T.x && a.tileY === T.y); i++) a.move(1 / 60);
  if (!(a.tileX === T.x && a.tileY === T.y)) throw new Error("a free square became unreachable — the rule is over-blocking");

  // 4. a monster on a square must NOT stop an elf walking through it
  const foe = run("(k,x,y,z)=>new Enemy(k,x,y,z)", "zombie", T.x, T.y, 0);
  gs.enemies.push(foe);
  if (gs.tileOccupiedByOther(T.x, T.y, 0, a)) throw new Error("an enemy counted as an elf holding a square");
  gs.enemies.length = 0;

  // 5. a fresh colony starts with nobody sharing a square (its own game, because
  //    the elves above have been teleported around by this check)
  const fresh = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "small" });
  fresh.update(1 / 60);
  const seen = new Set();
  for (const d of fresh.dwarves) {
    const key = (d.tileX || 0) + "," + (d.tileY || 0) + "," + (d.z || 0);
    if (seen.has(key)) throw new Error("two elves started on one square: " + key);
    seen.add(key);
  }
});

// ---------------------------------------------------------------- report
let bad = 0;
for (const [st, name] of results) {
  if (st !== "ok") bad++;
  console.log((st === "ok" ? "  PASS  " : "  FAIL  ") + name);
}
console.log("\n" + (bad ? bad + " failure(s)" : "all " + results.length + " checks passed"));
process.exit(bad ? 1 : 0);
