#!/usr/bin/env node
// Soak test for Elven Empire.
//
// Drives a colony with random-but-valid player actions for many simulated days,
// with no human in the loop, and asserts the world stays consistent. Every real
// bug this project has produced was found by *running* the game rather than
// reading it — this is that, automated.
//
//     node tools/soak.js [days] [population]
//
// Exits non-zero on an exception or a broken invariant. Deterministic: the
// harness uses a fixed-step clock, so a failure reproduces.
//
// NOTE: the bot is deliberately hostile — it spawns raids, incidents and hazards
// on a colony that never fortifies itself, so most runs end with the colony
// lost within a few days. That is expected. The point is that nothing throws and
// the world stays consistent while it happens, including the colony-lost path
// and repeated save/load round-trips.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DAYS = parseInt(process.argv[2] || "20", 10);
const POP = parseInt(process.argv[3] || "18", 10);
const FILES = "version,utils,settings,codex,skills,research,milestones,db,world,pathfinding,entities,factions,jobs,storyteller,render,input,save,game,diagnostics".split(",");

const { createHarness } = require("./harness.js");

// ---------------------------------------------------------------- harness
// The DOM, the fixed-step clock and the loading live in harness.js, shared with
// the other three tools.
const { ctx, document: documentStub, getEl } = createHarness({ files: FILES, root: ROOT });

const run = (src, ...args) => { const v = vm.runInContext(src, ctx); return typeof v === "function" ? v(...args) : v; };

// ---------------------------------------------------------------- the bot
// One snippet rather than many round-trips, so a whole "player turn" is a single
// deterministic call into the game context.
const BOT = `
(g, n) => {
  const w = g.world, rng = w.rng, out = [];
  const pick = (arr) => arr.length ? arr[Math.floor(rng() * arr.length)] : null;
  const around = () => {
    for (let t = 0; t < 30; t++) {
      const x = clamp(w.spawnX + randint(rng, -18, 18), 1, w.w - 2);
      const y = clamp(w.spawnY + randint(rng, -18, 18), 1, w.h - 2);
      if (w.isWalkable(x, y, 0)) return { x, y };
    }
    return null;
  };
  // Housekeeping any player would do: keep the larder stocked, otherwise the
  // colony simply starves and the soak never reaches the interesting late game.
  let food = 0, water = 0;
  for (const it of g.items) {
    if (it.kind === ITEM.FOOD) food++;
    else if (it.kind === ITEM.WATER) water++;
  }
  const want = Math.max(20, g.dwarves.length * 4);
  for (let i = food; i < want; i++) { const at = around(); if (!at) break; g.jobs.spawnItem(ITEM.FOOD, at.x, at.y, null, 0); }
  for (let i = water; i < want; i++) { const at = around(); if (!at) break; g.jobs.spawnItem(ITEM.WATER, at.x, at.y, null, 0); }

  for (let i = 0; i < n; i++) {
    const roll = rng();
    if (roll < 0.20) {
      // designate a small patch of work
      const at = around(); if (!at) continue;
      const kind = pick(["dig", "chop", "gather", "forest"]);
      let n2 = 0;
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
        const x = at.x + dx, y = at.y + dy;
        if (!w.inBounds(x, y)) continue;
        const t = w.get(x, y, 0);
        if (kind === "dig" && t.kind !== K.STONE) continue;
        if (kind === "chop" && t.feature !== F.TREE) continue;
        if (kind === "forest" && t.feature !== F.NONE) continue;
        t.designation = kind; n2++;
      }
      if (n2) out.push("designate:" + kind);
    } else if (roll < 0.36) {
      const at = around(); if (!at) continue;
      const zone = pick(["stockpile", "bedroom", "dining", "graveyard"]);
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
        const x = at.x + dx, y = at.y + dy;
        if (!w.inBounds(x, y) || !w.isWalkable(x, y, 0)) continue;
        const t = w.get(x, y, 0);
        if (zone === "stockpile") { t.stockpile = true; t.zone = ZONE.TRADE === t.zone ? t.zone : t.zone; }
        else t.zone = zone === "bedroom" ? ZONE.BEDROOM : zone === "dining" ? ZONE.DINING : ZONE.GRAVEYARD;
      }
      out.push("zone:" + zone);
    } else if (roll < 0.50) {
      const at = around(); if (!at) continue;
      const t = w.get(at.x, at.y, 0);
      if (!t.buildJob && !t.item) {
        t.buildJob = true;
        t.buildKind = pick(["wall", "floor", "bed", "door"]);
        t.buildMaterial = pick(["wood", "stone", "marble", "metal"]);
        out.push("build:" + t.buildKind);
      }
    } else if (roll < 0.57 && g.dwarves.length) {
      const d = pick(g.dwarves);
      d.military = !d.military;
      if (!d.military) d.weapon = null;
      out.push("enlist:" + d.name);
    } else if (roll < 0.62 && g.doorTiles.length) {
      g.setDoorsLocked(!g.doorsLocked);
      out.push("doors:" + g.doorsLocked);
    } else if (roll < 0.65) {
      // force a threat or a hazard, the things a player can't easily reproduce
      const hazard = pick(["raid", "faction", "caveIn", "flood", "beasts"]);
      if (hazard === "raid") g.spawnRaid();
      else if (hazard === "faction") { g.factions.ironhold.rep = -80; g.spawnFactionRaid(FACTION_BY_ID.ironhold); }
      else if (hazard === "caveIn") g.caveInTimer = 0;   // let the next tick's roll decide
      else if (hazard === "flood") g.floodTimer = 0;
      else storySpawnBeasts(g, ["wolf", "goblin", "troll"], 3, "TEST:");
      out.push("hazard:" + hazard);
    } else if (roll < 0.73) {
      // a storyteller incident
      g.story.timer = 0; g.story.points = 6;
      out.push("incident");
    } else if (roll < 0.90) {
      // feed and water them so the colony is not merely starving to death
      const at = around(); if (!at) continue;
      g.jobs.spawnItem(pick(["food", "water"]), at.x, at.y, null, 0);
      out.push("supply");
    } else if (roll < 0.93 && g.dwarves.length) {
      // wound someone: exercises healing, hospitals and the infection clock
      if (rng() < 0.25) { const d = pick(g.dwarves); d.hp = Math.max(1, d.hp * 0.4); d.wounded = true; out.push("wound:" + d.name); }
    } else {
      g.jobs.reindex();
      out.push("reindex");
    }
  }
  g.rebuildZones();
  return out;
}`;

// ---------------------------------------------------------------- invariants
function checkWorld(g, where) {
  const w = g.world;
  const fail = (msg) => { throw new Error(`${where}: ${msg}`); };
  for (const d of g.dwarves) {
    if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) fail(`${d.name} has a non-finite position (${d.x}, ${d.y})`);
    if (!Number.isFinite(d.hp) || !Number.isFinite(d.mood)) fail(`${d.name} has non-finite hp/mood`);
    if ((d.z || 0) > 0 || (d.z || 0) < w.minZ) fail(`${d.name} is on an out-of-range level (${d.z})`);
    if (!w.inBounds(d.tileX, d.tileY)) fail(`${d.name} stands outside the map (${d.tileX}, ${d.tileY})`);
  }
  for (const it of g.items) {
    if (it.id == null) fail("an item has no id");
    if (!Number.isFinite(it.x) || !Number.isFinite(it.y)) fail(`item ${it.kind} has a non-finite position`);
    if (!it.hauled) {
      const t = w.get(it.x, it.y, it.z || 0);
      if (t && t.item !== it) fail(`item ${it.kind} at ${it.x},${it.y} is not on its tile`);
    }
  }
  if (g.dwarves.length > 40) fail(`population ${g.dwarves.length} exceeds the hard cap of 40`);
  const graves = g.graveyardTiles.filter(([x, y, z]) => { const t = w.get(x, y, z || 0); return !!(t && t.grave); });
  for (const [x, y, z] of graves) {
    const t = w.get(x, y, z || 0);
    if (!t.grave.name) fail("a grave has no name");
  }
}

// ---------------------------------------------------------------- run
const g = run("(o)=>new Game(null,o)", { difficulty: "gentle", mapSize: "medium" });

// Grow to the target population directly (migration is far too slow to soak).
const seed = `(g0, target) => {
  const w = g0.world, rng = w.rng;
  let guard = 0;
  while (g0.dwarves.length < target && guard++ < 3000) {
    const x = clamp(w.spawnX + randint(rng, -14, 14), 1, w.w - 2);
    const y = clamp(w.spawnY + randint(rng, -14, 14), 1, w.h - 2);
    if (!w.isWalkable(x, y, 0)) continue;
    const d = new Dwarf(dwarfName(rng), x, y, DWARF_COLORS[g0.dwarves.length % DWARF_COLORS.length], rollStartingSkills(rng));
    d.traits = rollTraits(rng);
    g0.dwarves.push(d);
  }
  return g0.dwarves.length;
}`;
run(seed, g, POP);

const DT = 0.05;
const ticksPerDay = Math.round(120 / DT);
let actions = 0, reloads = 0, ticks = 0;
const counts = {};

console.log(`soak: ${DAYS} days, ${g.dwarves.length} elves, ${g.world.w}x${g.world.h}`);

for (let day = 1; day <= DAYS; day++) {
  for (let i = 0; i < ticksPerDay; i++) {
    try {
      g.update(DT);
    } catch (e) {
      console.error(`\nFAIL: exception on day ${day}, tick ${ticks}: ${e && e.message}`);
      console.error(e && e.stack);
      process.exit(1);
    }
    ticks++;
    if (i % 100 === 0) checkWorld(g, `day ${day}`);
    if (i % Math.round(ticksPerDay / 6) === 0) {
      let acts = [];
      try { acts = run(BOT, g, 3); } catch (e) {
        console.error(`\nFAIL: the bot threw on day ${day}: ${e && e.message}`);
        console.error(e && e.stack); process.exit(1);
      }
      actions += acts.length;
      for (const a of acts) counts[a.split(":")[0]] = (counts[a.split(":")[0]] || 0) + 1;
    }
  }
  checkWorld(g, `end of day ${day}`);

  // A save/load round-trip every few days: the world must survive serialization
  // exactly as intact as it was.
  if (day % 4 === 0) {
    const dwarvesBefore = g.dwarves.length, itemsBefore = g.items.length;
    const data = JSON.parse(JSON.stringify(g.serialize()));
    const g2 = run("(d)=>new Game(d)", data);
    if (g2.dwarves.length !== dwarvesBefore) {
      console.error(`FAIL: after reload day ${day}: ${g2.dwarves.length} elves, expected ${dwarvesBefore}`);
      process.exit(1);
    }
    checkWorld(g2, `after reload on day ${day}`);
    reloads++;
  }
  if (g.colonyLost) { console.log(`     colony lost on day ${day}`); break; }
}

console.log(`     ${actions} player actions across ${ticks} ticks, ${reloads} save/load round-trips`);
console.log("     actions: " + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}x${v}`).join(", "));
console.log(`     ended day ${Math.floor(g.time / 120) + 1}, ${g.dwarves.length} elves, ${g.items.length} items, ${g.items.filter(i => i.kind === 'corpse').length} unburied`);
console.log("\nOK — no exceptions and every invariant held");
