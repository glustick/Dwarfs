// ---- The Storyteller: curates incidents instead of raw timer rolls -----------
//
// Earlier rounds fired migrants, caravans and raids straight off their own
// timers. The Storyteller replaces that with a small pacing engine: it
// accumulates "pressure" over time (faster as the colony grows, ages and gets
// wealthier), and spends it on one incident at a time drawn from a weighted
// pool — migrant waves, strange merchants, disasters and windfalls, alongside
// the threats. Weights read live colony state, so a story unfolds instead of a
// metronome. The zombie outbreak and faction raids keep their own clocks; the
// Storyteller owns the *pace* of everything else.
//
// NOTE: nothing here may touch DAY_LENGTH at load time — game.js loads after
// this file, so that const is still in its temporal dead zone. Incidents store
// cooldowns in *days* and storyTick multiplies by DAY_LENGTH at runtime.

const STORY_PACES = ["Serene", "Steady", "Tense", "Turbulent", "Dire"];

function makeStoryState() {
  return { points: 0, timer: DAY_LENGTH * 1.4, lastId: null, count: 0, cooldown: {} };
}

// How fast pressure accrues. Scales with population, colony age and wealth so
// big, rich, old colonies see more incidents than a fresh band of seven.
function storyRate(g) {
  const pop = g.dwarves.length;
  const day = Math.floor(g.time / DAY_LENGTH) + 1;
  const wealth = g.countItems(ITEM.BAR) + g.countItems(ITEM.WEAPON) + g.countItems(ITEM.ARMOR);
  const diff = g.diff ? g.diff().storyRate : 1;
  return 0.005 * (1 + pop * 0.12 + day * 0.02 + wealth * 0.03) * diff;
}

// A rough 0..4 dial used both to speed up incident cadence and to label the
// current mood of the story in the Stats tab.
function storyPaceIndex(g) {
  const day = Math.floor(g.time / DAY_LENGTH) + 1;
  const pop = g.dwarves.length;
  return clamp(Math.floor((day - 1) / 10) + Math.floor(pop / 5), 0, STORY_PACES.length - 1);
}

// ---- incident actions (all take the Game) -----------------------------------

function storySpawnWanderer(g) {
  const w = g.world, rng = w.rng;
  for (let t = 0; t < 40; t++) {
    const x = w.spawnX + randint(rng, -6, 6), y = w.spawnY + randint(rng, -6, 6);
    if (!w.isWalkable(x, y, 0)) continue;
    const d = new Dwarf(dwarfName(rng), x, y, DWARF_COLORS[g.dwarves.length % DWARF_COLORS.length], rollStartingSkills(rng));
    d.traits = rollTraits(rng);
    // a wanderer is a seasoned specialist, not a green recruit
    const skill = choice(rng, SKILL_IDS);
    d.skills[skill].level = Math.max(d.skills[skill].level, randint(rng, 4, 8));
    g.dwarves.push(d); g.flushDwarfToDB(d);
    g.log(`🎒 A wandering ${professionOf(d)} named ${d.name} joins the colony.`, "good", "story");
    if (window.App) window.App.toast(`🎒 ${d.name} the ${professionOf(d)} has joined!`);
    if (colonyDB) colonyDB.logEvent(`${d.name} (${professionOf(d)}) wandered in`, Math.floor(g.time / DAY_LENGTH) + 1);
    return;
  }
}

function storyCache(g) {
  const w = g.world, rng = w.rng;
  for (let t = 0; t < 40; t++) {
    const x = randint(rng, 4, w.w - 5), y = randint(rng, 4, w.h - 5);
    if (!w.isWalkable(x, y, 0)) continue;
    const ore = choice(rng, ["iron", "gold", "coal"]);
    for (let i = 0; i < 2; i++) g.jobs.spawnItem(ITEM.ORE, x, y, ore, 0);
    g.jobs.spawnItem(ITEM.STONE, x, y, null, 0);
    g.log(`💎 Foragers stumble on a hidden cache of ${ore} ore.`, "good", "story");
    if (window.App) window.App.toast("💎 A hidden cache is found!");
    return;
  }
}

function storyWildBounty(g) {
  const w = g.world, rng = w.rng;
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const x = w.spawnX + randint(rng, -5, 5), y = w.spawnY + randint(rng, -5, 5);
    if (w.isWalkable(x, y, 0)) { g.jobs.spawnItem(ITEM.FOOD, x, y, null, 0); n++; }
  }
  if (!n) return;
  g.log(`🍄 A wild bounty — ${n} food is found near the colony.`, "good", "story");
}

function storyBlight(g) {
  let crops = 0;
  for (const [x, y, z] of g.farmTiles) {
    const t = g.world.get(x, y, z || 0);
    if (t && t.feature === F.CROP) { t.growth = Math.max(0, t.growth - 0.7); crops++; }
  }
  let spoiled = 0;
  for (let i = g.items.length - 1; i >= 0 && spoiled < 4; i--) {
    const it = g.items[i];
    if (it.kind !== ITEM.FOOD || it.hauled) continue;
    const t = g.world.get(it.x, it.y, it.z || 0);
    if (t && t.item === it) t.item = null;
    g.items.splice(i, 1); spoiled++;
  }
  g.log(`🦠 A blight withers ${crops} crop${crops === 1 ? "" : "s"}${spoiled ? ` and spoils ${spoiled} food` : ""}.`, "bad", "story");
  if (window.App) window.App.toast("🦠 A blight strikes the farms");
}

function storyVermin(g) {
  let eaten = 0;
  for (let i = g.items.length - 1; i >= 0 && eaten < 3; i--) {
    const it = g.items[i];
    if (it.kind !== ITEM.FOOD || it.hauled) continue;
    const t = g.world.get(it.x, it.y, it.z || 0);
    if (t && t.item === it) t.item = null;
    g.items.splice(i, 1); eaten++;
  }
  if (!eaten) return;
  g.log(`🐀 Vermin get into the stores and devour ${eaten} food.`, "bad", "story");
}

function storyDrySpell(g) {
  g.weather = "heatwave";
  g.weatherTimer = randint(g.world.rng, 60, 110);
  g.log("🥵 A dry spell settles in — the heat parches the surface.", "bad", "story");
  if (window.App) window.App.toast("🥵 A dry spell — surface elves thirst faster");
}

// Beasts and monsters — the previously-unused wolf/goblin/troll kinds finally
// have a place. Non-infectious: this is wildlife and raiders, not the outbreak.
function storySpawnBeasts(g, kinds, n, label) {
  const edge = g.randomEdgeTile(true);
  if (!edge) return;
  n = clamp(n, 1, 8);
  let spawned = 0; const counts = {};
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < 14; t++) {
      const x = clamp(edge.x + randint(g.world.rng, -3, 3), 0, g.world.w - 1);
      const y = clamp(edge.y + randint(g.world.rng, -3, 3), 0, g.world.h - 1);
      if (g.world.isWalkable(x, y, 0, true)) {
        const kind = kinds[randint(g.world.rng, 0, kinds.length - 1)];
        g.enemies.push(new Enemy(kind, x, y, 0));
        counts[kind] = (counts[kind] || 0) + 1; spawned++; break;
      }
    }
  }
  if (!spawned) return;
  const list = Object.entries(counts).map(([k, c]) => `${c} ${ENEMY_TYPES[k].name}${c > 1 ? "s" : ""}`).join(", ");
  g.log(`${label} ${list}!`, "bad", "story");
  if (window.App) window.App.toast(`${label} ${list} approach!`);
  g.triggerAutoPause(`${list} are attacking`);
}

// ---- the incident pool -------------------------------------------------------
// `cooldownDays` is in in-game days (converted to seconds at runtime).
// weight(g) returning 0 removes an incident from the running this time.
const STORY_INCIDENTS = [
  {
    id: "migrant_wave", icon: "🧝", name: "Migrant wave", cat: "event",
    cost: 0.8, cooldownDays: 0.9, minDay: 2,
    weight: g => (g.dwarves.length >= 40 ? 0 : 1.6),
    apply: g => g.tryMigration(true),
  },
  {
    id: "wanderer", icon: "🎒", name: "A wanderer arrives", cat: "event",
    cost: 0.8, cooldownDays: 2.5, minDay: 3,
    weight: g => (g.dwarves.length >= 40 ? 0 : 0.7),
    apply: g => storySpawnWanderer(g),
  },
  {
    id: "strange_merchant", icon: "🛒", name: "A strange merchant", cat: "windfall",
    cost: 0.8, cooldownDays: 2.5, minDay: 3,
    weight: g => (g.depotTiles.some(t => !t[2]) ? 1.1 : 0),
    apply: g => g.trySpawnCaravan(true),
  },
  {
    id: "bumper_harvest", icon: "🌾", name: "Bumper harvest", cat: "windfall",
    cost: 0.6, cooldownDays: 2, minDay: 4,
    weight: g => (g.farmTiles.length ? 1.2 : 0),
    apply: g => {
      let n = 0;
      for (const [x, y, z] of g.farmTiles) {
        const t = g.world.get(x, y, z || 0);
        if (t && t.feature === F.CROP && t.growth < 1) { t.growth = 1; n++; }
      }
      if (n) g.log(`🌾 Favourable weather ripens ${n} crop${n === 1 ? "" : "s"} overnight.`, "good", "story");
    },
  },
  {
    id: "wild_bounty", icon: "🍄", name: "A wild bounty", cat: "windfall",
    cost: 0.4, cooldownDays: 1.2, minDay: 2,
    weight: g => (g.countItems(ITEM.FOOD) < g.dwarves.length * 2 ? 1.4 : 0.5),
    apply: g => storyWildBounty(g),
  },
  {
    id: "hidden_cache", icon: "💎", name: "A hidden cache", cat: "windfall",
    cost: 0.5, cooldownDays: 2.5, minDay: 3,
    weight: g => 0.9,
    apply: g => storyCache(g),
  },
  {
    id: "faction_gift", icon: "🎁", name: "A neighbour's gift", cat: "windfall",
    cost: 0.6, cooldownDays: 3, minDay: 3,
    weight: g => (FACTIONS.some(f => g.factionRep(f.id) >= 25) ? 1.0 : 0),
    apply: g => g.factionGift(),
  },
  {
    id: "blight", icon: "🦠", name: "Blight", cat: "disaster",
    cost: 0.9, cooldownDays: 3, minDay: 5,
    weight: g => (g.farmTiles.length || g.countItems(ITEM.FOOD) ? 1.0 : 0),
    apply: g => storyBlight(g),
  },
  {
    id: "vermin", icon: "🐀", name: "Vermin", cat: "disaster",
    cost: 0.6, cooldownDays: 1.5, minDay: 3,
    weight: g => (g.countItems(ITEM.FOOD) >= 4 ? 1.1 : 0),
    apply: g => storyVermin(g),
  },
  {
    id: "dry_spell", icon: "🥵", name: "A dry spell", cat: "disaster",
    cost: 0.7, cooldownDays: 3, minDay: 4,
    weight: g => (g.weather !== "heatwave" ? 0.9 : 0),
    apply: g => storyDrySpell(g),
  },
  {
    id: "wild_hunt", icon: "🐺", name: "A hunting pack", cat: "threat",
    cost: 1.2, cooldownDays: 3, minDay: 5,
    weight: g => 1.0,
    apply: g => storySpawnBeasts(g, ["wolf"], 2 + Math.floor(g.dwarves.length / 8), "🐺 A hunting pack descends on the colony —"),
  },
  {
    id: "goblin_scouts", icon: "👺", name: "Goblin scouts", cat: "threat",
    cost: 1.7, cooldownDays: 4, minDay: 8,
    weight: g => 0.7 + g.techTierScore() * 0.1,
    apply: g => storySpawnBeasts(g, ["goblin", "goblin", "troll"], 2 + Math.floor(g.techTierScore()), "👺 A war-band of"),
  },
];

// The tick: accrue pressure, cool incidents down, and when the timer elapses
// spend pressure on one weighted incident. Deferred (short re-arm) when nothing
// affordable is eligible yet, so the pool never fires dry.
function storyTick(g, dt) {
  const s = g.story;
  const day = Math.floor(g.time / DAY_LENGTH) + 1;
  s.points = Math.min(6, s.points + storyRate(g) * dt);
  for (const k in s.cooldown) if (s.cooldown[k] > 0) s.cooldown[k] = Math.max(0, s.cooldown[k] - dt);
  s.timer -= dt;
  if (s.timer > 0) return;

  const pace = storyPaceIndex(g);
  const jitter = randint(g.world.rng, 55, 130) * (1 - pace * 0.06);
  const eligible = STORY_INCIDENTS.filter(i => {
    if (i.minDay && day < i.minDay) return false;
    if ((s.cooldown[i.id] || 0) > 0) return false;
    if (i.id === s.lastId) return false;            // never twice in a row
    return i.weight(g) > 0;
  });
  const affordable = eligible.filter(i => s.points >= i.cost);
  if (!affordable.length) { s.timer = Math.max(15, jitter * 0.35); return; }

  const weights = affordable.map(i => i.weight(g));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) { s.timer = jitter; return; }
  let r = g.world.rng() * total, pick = affordable[0];
  for (let i = 0; i < affordable.length; i++) {
    if (r < weights[i]) { pick = affordable[i]; break; }
    r -= weights[i];
  }

  s.points -= pick.cost;
  s.lastId = pick.id;
  s.count++;
  s.cooldown[pick.id] = (pick.cooldownDays || 1) * DAY_LENGTH;
  s.timer = jitter;
  try { pick.apply(g); }
  catch (e) { g.log(`Something stirred beyond the trees… (${e.message})`, "", "story"); }
}
