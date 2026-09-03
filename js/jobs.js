// ---- Jobs: designations -> tasks -> dwarf AI --------------------------------

const WORK_TIME = { dig: 1.6, chop: 1.8, gather: 0.9, build: 1.4, eat: 1.2, drink: 1.0, train: 2.0, socialize: 2.4, craft: 2.6, equip: 0.6, plant: 1.6, harvest: 1.3, doctor: 2.2, forest: 1.8, stairsdown: 2.2 };
const ENERGY_SLEEP_BED = 26;     // energy restored per second in a bed
const ENERGY_SLEEP_GROUND = 13;  // ... on the bare ground

// Combined 2D+depth distance: vertical distance is weighted heavier since it
// always requires a stairwell detour, never a direct diagonal shortcut.
function dist3(x, y, z, x2, y2, z2) { return manhattan(x, y, x2, y2) + Math.abs(z - z2) * 4; }

// Workshop recipes: inputs consumed from stockpiles -> output produced.
// Smelting burns a lump of coal alongside the ore — coal's only sink.
const RECIPES = {
  smelter: [
    { name: "Iron bar", in: [{ kind: ITEM.ORE, sub: "iron" }, { kind: ITEM.ORE, sub: "coal" }], out: { kind: ITEM.BAR, sub: "iron" }, time: 2.6 },
    { name: "Gold bar", in: [{ kind: ITEM.ORE, sub: "gold" }, { kind: ITEM.ORE, sub: "coal" }], out: { kind: ITEM.BAR, sub: "gold" }, time: 2.6 },
  ],
  forge: [
    { name: "Sword", in: [{ kind: ITEM.BAR, sub: "iron" }], out: { kind: ITEM.WEAPON, sub: "sword" }, time: 3.2 },
    { name: "Axe", in: [{ kind: ITEM.BAR, sub: "iron" }], out: { kind: ITEM.WEAPON, sub: "axe" }, time: 3.2 },
    { name: "Shield", in: [{ kind: ITEM.BAR, sub: "iron" }], out: { kind: ITEM.ARMOR, sub: "shield" }, time: 3.0 },
    { name: "Mail", in: [{ kind: ITEM.BAR, sub: "iron" }], out: { kind: ITEM.ARMOR, sub: "mail" }, time: 3.4 },
  ],
  // Wells need no inputs — an empty `in` list just always succeeds.
  well: [
    { name: "Draw water", in: [], out: { kind: ITEM.WATER }, time: 1.8 },
  ],
  brewery: [
    { name: "Brew ale", in: [{ kind: ITEM.WATER }, { kind: ITEM.FOOD }], out: { kind: ITEM.ALE }, time: 3.0 },
  ],
};
const WORKSHOP_INFO = {
  smelter: { name: "Smelter", icon: "🔥" },
  forge: { name: "Forge", icon: "⚒️" },
  well: { name: "Well", icon: "💧" },
  brewery: { name: "Brewery", icon: "🍺" },
};

// What a caravan will pay for each sellable item (sub-keyed). Gold bars and
// forged arms are the only surplus goods worth exporting.
const TRADE_SELL_PRICE = {
  bar: { gold: 14 },
  weapon: { sword: 10, axe: 10 },
  armor: { shield: 10, mail: 10 },
};
function tradeSellPrice(it) {
  const m = TRADE_SELL_PRICE[it.kind];
  return m ? (m[it.sub] || null) : null;
}

class Job {
  constructor(type, x, y, z = 0) {
    this.type = type;   // dig|chop|gather|build|haul|eat|sleep|train|socialize|stairsdown
    this.x = x;
    this.y = y;
    this.z = z;
    this.phase = "move";
    this.item = null;
    this.dest = null;      // {x,y,z} carry destination (haul)
    this.dining = null;    // {x,y,z} dining spot (eat)
    this.buildKind = null; // wall|floor|bed|smelter|forge
    this.slot = null;      // equip slot: weapon|armor
    this.patient = null;   // doctor: the wounded Dwarf being treated
  }
}

class JobManager {
  constructor(game) {
    this.game = game;
    this.candidates = { dig: [], chop: [], gather: [], build: [], craft: [], plant: [], harvest: [], doctor: [], forest: [], stairsdown: [] };
  }

  // ---- outstanding designations ----
  reindex() {
    const g = this.game, w = g.world;
    const c = { dig: [], chop: [], gather: [], build: [], craft: [], plant: [], harvest: [], doctor: [], forest: [], stairsdown: [] };
    for (let z = 0; z >= w.minZ; z--) {
      const tiles = w.getLevel(z);
      if (!tiles) continue;
      for (let y = 0; y < w.h; y++) {
        for (let x = 0; x < w.w; x++) {
          const t = tiles[y][x];
          if (t.reserved) continue;
          if (t.designation === "dig" && w.hasWalkableNeighbor(x, y, z)) c.dig.push([x, y, z]);
          else if (t.designation === "chop" && w.hasWalkableNeighbor(x, y, z)) c.chop.push([x, y, z]);
          else if (t.designation === "gather" && w.hasWalkableNeighbor(x, y, z)) c.gather.push([x, y, z]);
          else if (t.designation === "forest" && w.hasWalkableNeighbor(x, y, z)) c.forest.push([x, y, z]);
          else if (t.designation === "stairsdown" && t.built !== B.STAIRS && t.kind !== K.WATER && w.hasWalkableNeighbor(x, y, z)) c.stairsdown.push([x, y, z]);
          if (t.buildJob && w.hasWalkableNeighbor(x, y, z)) c.build.push([x, y, z]);
          if (t.workshop && this.recipeAvailable(t) && w.hasWalkableNeighbor(x, y, z)) c.craft.push([x, y, z]);
          if (t.zone === ZONE.FARM && w.hasWalkableNeighbor(x, y, z)) {
            if (t.feature === F.NONE) c.plant.push([x, y, z]);
            else if (t.feature === F.CROP && t.growth >= 1) c.harvest.push([x, y, z]);
          }
        }
      }
    }
    // doctor candidates are dwarves, not tiles — resting patients not yet attended
    for (const d of g.dwarves) {
      if ((d.wounded || d.infected) && d.state === "recover" && !d.beingTreated) c.doctor.push(d);
    }
    this.candidates = c;
  }

  // ---- workshop recipe helpers ----
  currentRecipe(t) {
    const list = RECIPES[t.workshop];
    if (!list || !list.length) return null;
    return list[(t.workshopRecipe || 0) % list.length];
  }

  // A stored (stockpiled) item matching a recipe input spec.
  findStoredMatch(kind, sub) {
    for (const it of this.game.items) {
      if (it.kind !== kind || it.hauled) continue;
      if (sub && it.sub !== sub) continue;
      const t = this.game.world.get(it.x, it.y, it.z);
      if (t && t.stockpile) return it;
    }
    return null;
  }

  recipeAvailable(t) {
    const rec = this.currentRecipe(t);
    if (!rec) return false;
    // Temporarily flag matched items so duplicate input specs need distinct items.
    const claimed = [];
    let ok = true;
    for (const inp of rec.in) {
      const it = this.findStoredMatch(inp.kind, inp.sub);
      if (!it) { ok = false; break; }
      it.hauled = true; claimed.push(it);
    }
    for (const it of claimed) it.hauled = false;
    return ok;
  }

  // Consume a recipe's inputs from stockpiles; returns false if any is missing.
  consumeInputs(rec) {
    const claimed = [];
    for (const inp of rec.in) {
      const it = this.findStoredMatch(inp.kind, inp.sub);
      if (!it) { for (const c of claimed) c.hauled = false; return false; }
      it.hauled = true; claimed.push(it);
    }
    for (const it of claimed) this.consumeItem(it);
    return true;
  }

  // ---- stockpile / item helpers ----
  // `itemKind`, if given, skips any pile filtered to a different category.
  findFreeStockpileTile(nearX, nearY, itemKind = null, nearZ = 0) {
    const g = this.game, w = g.world;
    const cat = itemKind ? STOCKPILE_CATEGORY_OF[itemKind] : null;
    let best = null, bd = Infinity;
    for (const [x, y, z] of g.stockpileTiles) {
      const t = w.get(x, y, z);
      if (!t || t.item || t.built === B.WALL) continue;
      if (t.stockpileFilter && cat && t.stockpileFilter !== cat) continue;
      const d = dist3(x, y, z, nearX, nearY, nearZ);
      if (d < bd) { bd = d; best = { x, y, z }; }
    }
    return best;
  }

  findStoredItem(kind, nearX, nearY, nearZ = 0) {
    const g = this.game, w = g.world;
    let best = null, bd = Infinity;
    for (const it of g.items) {
      if (it.kind !== kind || it.hauled) continue;
      const t = w.get(it.x, it.y, it.z);
      if (!t || !t.stockpile) continue;
      const d = dist3(it.x, it.y, it.z, nearX, nearY, nearZ);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  findGroundItem(kind, nearX, nearY, nearZ = 0) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const it of g.items) {
      if (it.kind !== kind || it.hauled) continue;
      const d = dist3(it.x, it.y, it.z, nearX, nearY, nearZ);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  findAnyItem(kind, nearX, nearY, nearZ = 0) {
    return this.findStoredItem(kind, nearX, nearY, nearZ) || this.findGroundItem(kind, nearX, nearY, nearZ);
  }

  findLooseItem(nearX, nearY, nearZ = 0) {
    const g = this.game;
    if (!g.stockpileTiles.length) return null;
    let best = null, bd = Infinity;
    for (const it of g.items) {
      if (it.hauled || it.stored) continue;
      const t = g.world.get(it.x, it.y, it.z);
      if (t && t.stockpile) continue;
      const d = dist3(it.x, it.y, it.z, nearX, nearY, nearZ);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  nearestTile(list, x, y, z = 0) {
    let best = null, bd = Infinity;
    for (const [tx, ty, tz] of list) {
      const d = dist3(tx, ty, tz || 0, x, y, z);
      if (d < bd) { bd = d; best = { x: tx, y: ty, z: tz || 0 }; }
    }
    return best;
  }

  // `preferHospital` biases the pick toward a Hospital-zoned bed (still the
  // nearest among those) when one exists, for wounded elves seeking care.
  // `dwarf`, if given, lets the search join a double bed its partner already
  // occupies rather than treating it as full.
  nearestFreeBed(x, y, z = 0, preferHospital = false, dwarf = null) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const [bx, by, bz] of g.bedTiles) {
      const t = g.world.get(bx, by, bz || 0);
      if (!t || (t.furniture !== FURN.BED && t.furniture !== FURN.DOUBLE_BED)) continue;
      const cap = t.furniture === FURN.DOUBLE_BED ? 2 : 1;
      const occ = t.bedOccupants || [];
      const withPartner = dwarf && dwarf.partnerId && occ.includes(dwarf.partnerId);
      if (occ.length >= cap) continue;
      if (occ.length > 0 && !withPartner) continue; // occupied by someone else
      let d = dist3(bx, by, bz || 0, x, y, z);
      if (preferHospital && t.zone === ZONE.HOSPITAL) d -= 1000;
      if (withPartner) d -= 500; // prefer joining a partner over any other free bed
      if (d < bd) { bd = d; best = { x: bx, y: by, z: bz || 0 }; }
    }
    return best;
  }

  // Claim a bed tile for a sleeping/recovering dwarf (co-occupancy aware).
  claimBed(dwarf, bed) {
    const t = this.game.world.get(bed.x, bed.y, bed.z || 0);
    t.bedOccupants = t.bedOccupants || [];
    t.bedOccupants.push(dwarf.dbId);
    t.reserved = true;
    dwarf.bed = { x: bed.x, y: bed.y, z: bed.z || 0 };
  }

  // Release a dwarf from whatever bed they're in, freeing it only once empty.
  releaseBed(dwarf) {
    if (!dwarf.bed) return;
    const t = this.game.world.get(dwarf.bed.x, dwarf.bed.y, dwarf.bed.z || 0);
    if (t) {
      t.bedOccupants = (t.bedOccupants || []).filter(id => id !== dwarf.dbId);
      t.reserved = t.bedOccupants.length > 0;
    }
    dwarf.bed = null;
  }

  buildMaterialKind(t) {
    const m = BUILD_MATERIAL[t.buildKind || "wall"];
    return m === "wood" ? ITEM.WOOD : ITEM.STONE;
  }

  workDuration(dwarf, type) {
    const base = WORK_TIME[type] || 1.2;
    const skill = JOB_SKILL[type];
    let mult = skill ? dwarf.workSpeedMult(skill) : 1;
    const g = this.game;
    if ((type === "dig" || type === "build" || type === "stairsdown") && g.hasTech("tools")) mult *= 1.25;
    if (type === "chop" && g.hasTech("axes")) mult *= 1.25;
    if (type === "craft" && g.hasTech("metallurgy")) mult *= 1.4;
    return base / mult;
  }

  // ---- assignment (schedule/labor aware) ----
  assign(dwarf) {
    // Enlisted soldiers gear up during peacetime before anything else.
    if (dwarf.military && !this.game.enemies.length && this.assignEquip(dwarf)) return true;

    const act = dwarf.activity || "work";
    if (act === "sleep") return this.assignSleep(dwarf);
    if (act === "recover") return this.assignRecover(dwarf);
    if (act === "train") return this.assignTrain(dwarf);
    if (act === "eat") {
      if (dwarf.hunger > 35 && this.assignEat(dwarf, true)) return true;
      return this.assignSocialize(dwarf); // otherwise mingle in the hall
    }
    if (act === "drink") {
      if (dwarf.thirst > 35 && this.assignDrink(dwarf, true)) return true;
      return this.assignSocialize(dwarf);
    }
    if (act === "idle") {
      if (dwarf.hunger > 70 && this.assignEat(dwarf, false)) return true;
      if (dwarf.thirst > 70 && this.assignDrink(dwarf, false)) return true;
      return false;
    }

    // ---- "work" shift ----
    if (dwarf.hunger > 70 && this.assignEat(dwarf, false)) return true;
    if (dwarf.thirst > 70 && this.assignDrink(dwarf, false)) return true;
    return this.assignWork(dwarf) || this.assignDoctor(dwarf) || this.assignSell(dwarf) || this.assignHaul(dwarf);
  }

  assignWork(dwarf) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    const pools = [
      ["dig", this.candidates.dig], ["chop", this.candidates.chop],
      ["gather", this.candidates.gather], ["build", this.candidates.build],
      ["craft", this.candidates.craft],
      ["plant", this.candidates.plant], ["harvest", this.candidates.harvest],
      ["forest", this.candidates.forest], ["stairsdown", this.candidates.stairsdown],
    ];
    let best = null, bestD = Infinity;
    for (const [type, list] of pools) {
      if (!dwarf.labors.has(JOB_LABOR[type])) continue;
      for (const [x, y, z] of list) {
        const t = g.world.getLevel(z)[y][x];
        if (t.reserved) continue;
        if (type === "build") {
          if (!t.buildJob) continue;
          if (!this.findAnyItem(this.buildMaterialKind(t), dx, dy, dz)) continue;
        } else if (type === "craft") {
          if (!t.workshop || !this.recipeAvailable(t)) continue;
        } else if (type === "plant" || type === "harvest") {
          // candidate lists from reindex() are already precise — no extra check
        } else if (t.designation !== type) continue;
        const d = dist3(x, y, z, dx, dy, dz);
        if (d >= bestD) continue;
        best = { type, x, y, z }; bestD = d;
      }
    }
    if (!best) return false;

    const t = g.world.getLevel(best.z)[best.y][best.x];
    const path = pathAdjacent(g.world, dx, dy, dz, best.x, best.y, best.z);
    if (!path) return false;
    t.reserved = true;
    const job = new Job(best.type, best.x, best.y, best.z);
    if (best.type === "build") {
      job.buildKind = t.buildKind || "wall";
      const matKind = this.buildMaterialKind(t);
      const mat = this.findAnyItem(matKind, dx, dy, dz);
      mat.hauled = true; job.item = mat; job.phase = "toMat";
      const p2 = pathAdjacent(g.world, dx, dy, dz, mat.x, mat.y, mat.z) || pathTo(g.world, dx, dy, dz, mat.x, mat.y, mat.z);
      if (!p2) { t.reserved = false; mat.hauled = false; return false; }
      dwarf.setPath(p2); dwarf.thought = `Fetching ${matKind} to build`;
    } else {
      job.phase = "move"; dwarf.setPath(path);
      dwarf.thought = {
        dig: "Off to mine", chop: "Off to chop", gather: "Gathering plants",
        craft: `Off to the ${WORKSHOP_INFO[t.workshop] ? WORKSHOP_INFO[t.workshop].name.toLowerCase() : "workshop"}`,
        plant: "Off to plant a crop", harvest: "Off to harvest the farm",
        forest: "Off to plant a sapling", stairsdown: "Carving a stairwell down",
      }[best.type];
    }
    dwarf.job = job; dwarf.state = "goto";
    return true;
  }

  // Enlisted dwarves fetch a weapon, then armor, from stockpiles/ground.
  assignEquip(dwarf) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    let slot = null, item = null;
    if (!dwarf.weapon) { item = this.findAnyItem(ITEM.WEAPON, dx, dy, dz); if (item) slot = "weapon"; }
    if (!item && !dwarf.armor) { item = this.findAnyItem(ITEM.ARMOR, dx, dy, dz); if (item) slot = "armor"; }
    if (!item) return false;
    const path = pathAdjacent(g.world, dx, dy, dz, item.x, item.y, item.z) || pathTo(g.world, dx, dy, dz, item.x, item.y, item.z);
    if (!path) return false;
    item.hauled = true;
    const job = new Job("equip", item.x, item.y, item.z);
    job.item = item; job.slot = slot; job.phase = "move";
    dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto";
    dwarf.thought = `Arming up (${item.sub || slot})`;
    return true;
  }

  assignHaul(dwarf) {
    if (!dwarf.labors.has("hauling")) return false;
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    const loose = this.findLooseItem(dx, dy, dz);
    if (!loose) return false;
    const dest = this.findFreeStockpileTile(loose.x, loose.y, loose.kind, loose.z);
    if (!dest) return false;
    const path = pathAdjacent(g.world, dx, dy, dz, loose.x, loose.y, loose.z) || pathTo(g.world, dx, dy, dz, loose.x, loose.y, loose.z);
    if (!path) return false;
    loose.hauled = true;
    const job = new Job("haul", loose.x, loose.y, loose.z);
    job.item = loose; job.dest = dest; job.phase = "toItem";
    dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto";
    dwarf.thought = "Hauling to stockpile";
    return true;
  }

  // How many more of this kind are stockpiled than the militia still needs —
  // >0 means some are surplus and safe to sell off to a caravan.
  sellableSurplus(kind) {
    const g = this.game;
    let have = 0;
    for (const it of g.items) if (it.kind === kind && !it.hauled) have++;
    const need = g.dwarves.filter(d => d.military && !(kind === ITEM.WEAPON ? d.weapon : d.armor)).length;
    return have - need;
  }

  // Nearest stockpiled (non-depot) item the colony can spare for trade.
  findSellableItem(nearX, nearY, nearZ = 0) {
    const g = this.game, w = g.world;
    const weaponSurplus = this.sellableSurplus(ITEM.WEAPON) > 0;
    const armorSurplus = this.sellableSurplus(ITEM.ARMOR) > 0;
    let best = null, bd = Infinity;
    for (const it of g.items) {
      if (it.hauled) continue;
      const t = w.get(it.x, it.y, it.z);
      if (!t || !t.stockpile || t.zone === ZONE.TRADE) continue;
      const sellable = (it.kind === ITEM.BAR && it.sub === "gold")
        || (it.kind === ITEM.WEAPON && weaponSurplus)
        || (it.kind === ITEM.ARMOR && armorSurplus);
      if (!sellable) continue;
      const d = dist3(it.x, it.y, it.z, nearX, nearY, nearZ);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  findFreeDepotTile(nearX, nearY, nearZ = 0) {
    const g = this.game, w = g.world;
    let best = null, bd = Infinity;
    for (const [x, y, z] of g.depotTiles) {
      const t = w.get(x, y, z || 0);
      if (!t || t.item || t.built === B.WALL) continue;
      const d = dist3(x, y, z || 0, nearX, nearY, nearZ);
      if (d < bd) { bd = d; best = { x, y, z: z || 0 }; }
    }
    return best;
  }

  // Haul spare gold bars / arms out to the trade depot for the next caravan.
  assignSell(dwarf) {
    if (!dwarf.labors.has("hauling")) return false;
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    if (!g.depotTiles.length) return false;
    const item = this.findSellableItem(dx, dy, dz);
    if (!item) return false;
    const dest = this.findFreeDepotTile(item.x, item.y, item.z);
    if (!dest) return false;
    const path = pathAdjacent(g.world, dx, dy, dz, item.x, item.y, item.z) || pathTo(g.world, dx, dy, dz, item.x, item.y, item.z);
    if (!path) return false;
    item.hauled = true;
    const job = new Job("haul", item.x, item.y, item.z);
    job.item = item; job.dest = dest; job.phase = "toItem";
    dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto";
    dwarf.thought = "Hauling goods to the trade depot";
    return true;
  }

  assignEat(dwarf, force) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    if (!force && dwarf.hunger < 55) return false;
    const food = this.findAnyItem(ITEM.FOOD, dx, dy, dz);
    if (!food) return false;
    const path = pathAdjacent(g.world, dx, dy, dz, food.x, food.y, food.z) || pathTo(g.world, dx, dy, dz, food.x, food.y, food.z);
    if (!path) return false;
    food.hauled = true;
    const job = new Job("eat", food.x, food.y, food.z);
    job.item = food; job.phase = "toFood";
    job.dining = g.diningTiles.length ? this.nearestTile(g.diningTiles, food.x, food.y, food.z) : null;
    dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto"; dwarf.thought = "Fetching a meal";
    return true;
  }

  // Prefers ale (brewed) over plain water when both are available.
  assignDrink(dwarf, force) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    if (!force && dwarf.thirst < 55) return false;
    const drink = this.findAnyItem(ITEM.ALE, dx, dy, dz) || this.findAnyItem(ITEM.WATER, dx, dy, dz);
    if (!drink) return false;
    const path = pathAdjacent(g.world, dx, dy, dz, drink.x, drink.y, drink.z) || pathTo(g.world, dx, dy, dz, drink.x, drink.y, drink.z);
    if (!path) return false;
    drink.hauled = true;
    const job = new Job("drink", drink.x, drink.y, drink.z);
    job.item = drink; job.phase = "toWater";
    job.dining = g.diningTiles.length ? this.nearestTile(g.diningTiles, drink.x, drink.y, drink.z) : null;
    dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto"; dwarf.thought = "Fetching a drink";
    return true;
  }

  assignSleep(dwarf) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    const bed = this.nearestFreeBed(dx, dy, dz, false, dwarf);
    const job = new Job("sleep", bed ? bed.x : dx, bed ? bed.y : dy, bed ? bed.z : dz);
    job.phase = "move";
    if (bed) {
      const path = pathTo(g.world, dx, dy, dz, bed.x, bed.y, bed.z);
      if (path) {
        this.claimBed(dwarf, bed);
        const withPartner = (g.world.get(bed.x, bed.y, bed.z).bedOccupants || []).includes(dwarf.partnerId);
        dwarf.setPath(path); dwarf.thought = withPartner ? "Off to bed with their beloved" : "Off to bed";
      } else { dwarf.bed = null; dwarf.setPath(null); dwarf.thought = "Napping on the ground"; }
    } else {
      dwarf.bed = null; dwarf.setPath(null); dwarf.thought = "Napping on the ground";
    }
    dwarf.job = job; dwarf.state = "goto";
    return true;
  }

  // A badly wounded elf seeks a bed (a Hospital bed if one's free) to rest and heal.
  assignRecover(dwarf) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    const bed = this.nearestFreeBed(dx, dy, dz, true, dwarf);
    const job = new Job("recover", bed ? bed.x : dx, bed ? bed.y : dy, bed ? bed.z : dz);
    job.phase = "move";
    if (bed) {
      const path = pathTo(g.world, dx, dy, dz, bed.x, bed.y, bed.z);
      if (path) {
        this.claimBed(dwarf, bed);
        dwarf.setPath(path); dwarf.thought = "Wounded — heading to recover";
      } else { dwarf.bed = null; dwarf.setPath(null); dwarf.thought = "Resting where they lie"; }
    } else {
      dwarf.bed = null; dwarf.setPath(null); dwarf.thought = "Resting where they lie";
    }
    dwarf.job = job; dwarf.state = "goto";
    return true;
  }

  // A dwarf with the Medicine labor tends the nearest untreated, resting patient.
  assignDoctor(dwarf) {
    if (!dwarf.labors.has("medicine")) return false;
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    const list = this.candidates.doctor;
    if (!list.length) return false;
    let patient = null, bd = Infinity;
    for (const p of list) {
      if (p === dwarf) continue;
      const d = dist3(p.tileX, p.tileY, p.z, dx, dy, dz);
      if (d < bd) { bd = d; patient = p; }
    }
    if (!patient) return false;
    const path = pathAdjacent(g.world, dx, dy, dz, patient.tileX, patient.tileY, patient.z) || pathTo(g.world, dx, dy, dz, patient.tileX, patient.tileY, patient.z);
    if (!path) return false;
    patient.beingTreated = true;
    const job = new Job("doctor", patient.tileX, patient.tileY, patient.z);
    job.patient = patient; job.phase = "move";
    dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto";
    dwarf.thought = `Off to treat ${patient.name}`;
    return true;
  }

  assignTrain(dwarf) {
    const job = new Job("train", dwarf.tileX, dwarf.tileY, dwarf.z);
    job.phase = "move"; dwarf.setPath(null);
    dwarf.job = job; dwarf.state = "goto"; dwarf.thought = "Training hard";
    return true;
  }

  assignSocialize(dwarf) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY, dz = dwarf.z;
    if (!g.diningTiles.length) return false;
    const spot = this.nearestTile(g.diningTiles, dx, dy, dz);
    const path = pathTo(g.world, dx, dy, dz, spot.x, spot.y, spot.z);
    if (!path) return false;
    const job = new Job("socialize", spot.x, spot.y, spot.z);
    job.phase = "move"; dwarf.setPath(path);
    dwarf.job = job; dwarf.state = "goto"; dwarf.thought = "Off to the hall";
    return true;
  }

  // ---- per-frame execution ----
  execute(dwarf, dt) {
    const g = this.game, w = g.world;
    const job = dwarf.job;
    if (!job) { dwarf.state = "idle"; return; }

    switch (dwarf.state) {
      case "goto": {
        if (dwarf.move(dt)) this.onArrive(dwarf, job);
        break;
      }
      case "carry": {
        if (dwarf.move(dt)) {
          const t = w.get(job.dest.x, job.dest.y, job.dest.z || 0);
          if (t && t.item) {
            const dest = this.findFreeStockpileTile(dwarf.tileX, dwarf.tileY, dwarf.carrying ? dwarf.carrying.kind : null, dwarf.z);
            if (dest) { job.dest = dest; this.gotoTile(dwarf, dest.x, dest.y, dest.z, "carry"); break; }
            this.dropCarried(dwarf); this.cancel(dwarf); break;
          }
          this.dropCarried(dwarf); this.cancel(dwarf);
        }
        break;
      }
      case "work": {
        dwarf.workTimer -= dt;
        if (dwarf.workTimer <= 0) this.finishWork(dwarf);
        break;
      }
      case "sleep": {
        const inBed = !!dwarf.bed;
        const comfort = g.hasTech("comfort") ? 1.5 : 1;
        dwarf.energy = clamp(dwarf.energy + (inBed ? ENERGY_SLEEP_BED : ENERGY_SLEEP_GROUND) * comfort * dt, 0, 100);
        if (inBed) {
          const bedTile = w.get(dwarf.bed.x, dwarf.bed.y, dwarf.bed.z || 0);
          if (bedTile.zone === ZONE.BEDROOM) {
            dwarf.mood = clamp(dwarf.mood + dt * 0.6 * (g.hasTech("comfort") ? 2 : 1), 0, 100);
            dwarf.mood = clamp(dwarf.mood + dt * 0.15 * Math.min(5, g.decorCount[ZONE.BEDROOM] || 0), 0, 100);
          }
          if (dwarf.partnerId && (bedTile.bedOccupants || []).includes(dwarf.partnerId))
            dwarf.mood = clamp(dwarf.mood + dt * 1.2, 0, 100); // sharing a bed with a partner
        }
        if (dwarf.energy >= 99 || (dwarf.activity !== "sleep" && dwarf.energy > 55))
          this.finishSleep(dwarf);
        break;
      }
      case "recover": {
        // Actual healing/infection-fighting happens in Game.updateDwarf's
        // ambient passes (they read d.state === "recover" for the bed-rest
        // bonus); this just watches for the wound to close and/or the
        // infection to clear so the elf can get back to work.
        if (!dwarf.wounded && !dwarf.infected) this.finishRecover(dwarf);
        break;
      }
      default: dwarf.state = "idle";
    }
  }

  onArrive(dwarf, job) {
    const g = this.game, w = g.world;
    switch (job.type) {
      case "haul":
        this.pickup(dwarf, job.item);
        this.gotoTile(dwarf, job.dest.x, job.dest.y, job.dest.z, "carry"); job.phase = "toPile";
        break;
      case "build":
        if (job.phase === "toMat" || job.phase === "toStone") {
          this.pickup(dwarf, job.item);
          const p = pathAdjacent(w, dwarf.tileX, dwarf.tileY, dwarf.z, job.x, job.y, job.z);
          if (p) { dwarf.setPath(p); dwarf.state = "goto"; job.phase = "toSite"; dwarf.thought = "Carrying materials"; }
          else this.cancel(dwarf);
        } else {
          dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "build");
        }
        break;
      case "eat":
        if (job.phase === "toFood") {
          this.pickup(dwarf, job.item);
          if (job.dining) { this.gotoTile(dwarf, job.dining.x, job.dining.y, job.dining.z, "goto"); job.phase = "toDining"; dwarf.thought = "To the dining hall"; }
          else { dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "eat"); }
        } else { // toDining
          dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "eat");
        }
        break;
      case "drink":
        if (job.phase === "toWater") {
          this.pickup(dwarf, job.item);
          if (job.dining) { this.gotoTile(dwarf, job.dining.x, job.dining.y, job.dining.z, "goto"); job.phase = "toDining"; dwarf.thought = "To the dining hall"; }
          else { dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "drink"); }
        } else { // toDining
          dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "drink");
        }
        break;
      case "sleep":
        dwarf.state = "sleep";
        break;
      case "recover":
        dwarf.state = "recover";
        break;
      case "doctor":
        dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "doctor");
        break;
      case "train":
        dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "train");
        break;
      case "socialize":
        dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "socialize");
        break;
      case "craft": {
        const wt = w.get(job.x, job.y, job.z);
        const rec = this.currentRecipe(wt);
        const base = rec ? rec.time : WORK_TIME.craft;
        let mult = dwarf.workSpeedMult("smithing");
        if (g.hasTech("metallurgy")) mult *= 1.4;
        dwarf.state = "work"; dwarf.workTimer = base / mult;
        break;
      }
      case "equip":
        dwarf.state = "work"; dwarf.workTimer = WORK_TIME.equip;
        break;
      default: // dig / chop / gather / forest / stairsdown
        dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, job.type);
    }
  }

  gotoTile(dwarf, x, y, z, endState) {
    const p = pathTo(this.game.world, dwarf.tileX, dwarf.tileY, dwarf.z, x, y, z);
    if (p) { dwarf.setPath(p); dwarf.state = endState; }
    else { this.dropCarried(dwarf); this.cancel(dwarf); }
  }

  pickup(dwarf, item) {
    const t = this.game.world.get(item.x, item.y, item.z);
    if (t && t.item === item) t.item = null;
    item.stored = false;
    dwarf.carrying = item;
  }

  dropCarried(dwarf) {
    const it = dwarf.carrying;
    if (!it) return;
    const w = this.game.world;
    let x = dwarf.tileX, y = dwarf.tileY, z = dwarf.z;
    const here = w.get(x, y, z);
    if (here && here.item) {
      for (const [ddx, ddy] of NEIGHBORS8) {
        const nx = x + ddx, ny = y + ddy;
        if (w.inBounds(nx, ny) && w.isWalkable(nx, ny, z) && !w.get(nx, ny, z).item) { x = nx; y = ny; break; }
      }
    }
    it.x = x; it.y = y; it.z = z; it.hauled = false;
    const t = w.get(x, y, z);
    it.stored = !!t.stockpile;
    t.item = it;
    dwarf.carrying = null;
  }

  finishWork(dwarf) {
    const g = this.game, w = g.world;
    const job = dwarf.job;
    const t = w.get(job.x, job.y, job.z);

    if (job.type === "dig" && t) {
      t.designation = null; t.reserved = false;
      const ore = t.ore;
      t.kind = K.FLOOR; t.ore = null; t.feature = F.NONE;
      this.spawnItem(ITEM.STONE, job.x, job.y, null, job.z);
      if (ore) this.spawnItem(ITEM.ORE, job.x, job.y, ore, job.z);
      g.log(`${dwarf.name} mined out stone${ore ? " and struck " + ore + "!" : "."}`, ore ? "good" : "", "labor");
      g.awardXp(dwarf, "mining", 12); g.awardXp(dwarf, "fitness", 2);
      dwarf.mood = clamp(dwarf.mood + (ore ? 6 : 1), 0, 100);
    } else if (job.type === "stairsdown" && t) {
      t.designation = null; t.reserved = false;
      const wasStone = t.kind === K.STONE;
      const ore = t.ore;
      if (wasStone) {
        this.spawnItem(ITEM.STONE, job.x, job.y, null, job.z);
        if (ore) this.spawnItem(ITEM.ORE, job.x, job.y, ore, job.z);
      }
      g.world.carveStairs(job.x, job.y, job.z);
      g.log(`${dwarf.name} carved a stairwell down${ore ? ", striking " + ore + "!" : "."}`, ore ? "good" : "", "labor");
      g.awardXp(dwarf, "mining", 16); g.awardXp(dwarf, "fitness", 2);
      dwarf.mood = clamp(dwarf.mood + (ore ? 6 : 2), 0, 100);
    } else if (job.type === "chop" && t) {
      t.designation = null; t.reserved = false;
      t.feature = F.NONE; t.growth = 0;
      const logs = randint(w.rng, 1, 3) + Math.floor(dwarf.skillLevel("woodcutting") / 6) + (g.hasTech("axes") ? 1 : 0);
      for (let i = 0; i < logs; i++) this.spawnItem(ITEM.WOOD, job.x, job.y, null, job.z);
      g.log(`${dwarf.name} felled a tree (${logs} logs).`, "", "labor");
      g.awardXp(dwarf, "woodcutting", 12); g.awardXp(dwarf, "fitness", 2);
    } else if (job.type === "gather" && t) {
      t.designation = null; t.reserved = false;
      let food = (t.feature === F.BUSH ? randint(w.rng, 1, 2) : 1) + Math.floor(dwarf.skillLevel("farming") / 8) + (g.hasTech("rations") ? 1 : 0);
      t.feature = F.NONE; t.growth = 0;
      for (let i = 0; i < food; i++) this.spawnItem(ITEM.FOOD, job.x, job.y, null, job.z);
      g.log(`${dwarf.name} gathered ${food} food.`, "", "labor");
      g.awardXp(dwarf, "farming", 9);
    } else if (job.type === "forest" && t) {
      t.designation = null; t.reserved = false;
      t.feature = F.SAPLING; t.growth = 0.05;
      g.log(`${dwarf.name} planted a sapling.`, "", "labor");
      g.awardXp(dwarf, "foresting", 10);
    } else if (job.type === "plant" && t) {
      t.reserved = false;
      t.feature = F.CROP; t.growth = 0;
      g.log(`${dwarf.name} planted a crop.`, "", "labor");
      g.awardXp(dwarf, "farming", 6);
    } else if (job.type === "harvest" && t) {
      t.reserved = false;
      const food = randint(w.rng, 2, 4) + Math.floor(dwarf.skillLevel("farming") / 6) + (g.hasTech("rations") ? 1 : 0);
      t.feature = F.NONE; t.growth = 0;
      for (let i = 0; i < food; i++) this.spawnItem(ITEM.FOOD, job.x, job.y, null, job.z);
      g.log(`${dwarf.name} harvested ${food} food from the farm.`, "", "labor");
      g.awardXp(dwarf, "farming", 14);
    } else if (job.type === "build" && t) {
      t.reserved = false; t.buildJob = false;
      if (dwarf.carrying) { this.consumeItem(dwarf.carrying); dwarf.carrying = null; }
      const kind = job.buildKind || "wall";
      if (kind === "floor") { t.kind = K.FLOOR; t.built = B.FLOOR; g.log(`${dwarf.name} built a stone floor.`, "", "build"); }
      else if (kind === "bed") { t.furniture = FURN.BED; g.rebuildZones(); g.log(`${dwarf.name} built a bed.`, "good", "build"); }
      else if (kind === "doublebed") { t.furniture = FURN.DOUBLE_BED; g.rebuildZones(); g.log(`${dwarf.name} built a double bed.`, "good", "build"); }
      else if (kind === "table") { t.furniture = FURN.TABLE; g.rebuildZones(); g.log(`${dwarf.name} built a table.`, "good", "build"); }
      else if (kind === "painting") { t.furniture = FURN.PAINTING; g.rebuildZones(); g.log(`${dwarf.name} hung a painting.`, "good", "build"); }
      else if (kind === "smelter" || kind === "forge" || kind === "well" || kind === "brewery") {
        t.workshop = kind; t.workshopRecipe = 0;
        g.log(`${dwarf.name} built a ${WORKSHOP_INFO[kind].name}.`, "good", "build");
      }
      else if (kind === "door") {
        t.built = B.DOOR; t.doorLocked = false; g.rebuildZones();
        g.log(`${dwarf.name} built a door.`, "good", "build");
      }
      else { t.built = B.WALL; t.feature = F.NONE; g.log(`${dwarf.name} built a stone wall.`, "", "build"); }
      t.buildKind = null;
      g.awardXp(dwarf, "building", 12); g.awardXp(dwarf, "fitness", 1);
    } else if (job.type === "craft" && t && t.workshop) {
      t.reserved = false;
      const rec = this.currentRecipe(t);
      if (rec && this.consumeInputs(rec)) {
        this.spawnItem(rec.out.kind, job.x, job.y, rec.out.sub, job.z);
        g.awardXp(dwarf, "smithing", 12);
        dwarf.mood = clamp(dwarf.mood + 2, 0, 100);
        g.log(`${dwarf.name} crafted ${rec.name} at the ${WORKSHOP_INFO[t.workshop].name}.`, "", "craft");
      } else {
        dwarf.thought = "No materials to craft";
      }
    } else if (job.type === "equip") {
      // Consume the equipment item and don it.
      if (job.item) {
        const slot = job.slot || (job.item.kind === ITEM.ARMOR ? "armor" : "weapon");
        dwarf[slot] = job.item.sub || slot;
        this.consumeItem(job.item);
        g.awardXp(dwarf, "fighting", 3);
        g.log(`${dwarf.name} equips a ${job.item.sub || slot}.`, "", "combat");
      }
    } else if (job.type === "eat") {
      if (dwarf.carrying) { this.consumeItem(dwarf.carrying); dwarf.carrying = null; }
      else if (job.item) this.consumeItem(job.item);
      const here = w.get(dwarf.tileX, dwarf.tileY, dwarf.z);
      const inDining = here && here.zone === ZONE.DINING;
      dwarf.hunger = clamp(dwarf.hunger - (60 + dwarf.skillLevel("cooking") * 2), 0, 100);
      const diningBonus = inDining ? (g.hasTech("furniture") && g.tableCount > 0 ? 14 : 9) : 5;
      dwarf.mood = clamp(dwarf.mood + diningBonus, 0, 100);
      g.awardXp(dwarf, "cooking", 5);
      if (inDining) g.awardXp(dwarf, "charisma", 4);
      dwarf.thought = inDining ? "Dined well in the hall" : "Ate a meal";
    } else if (job.type === "drink") {
      const kind = (dwarf.carrying && dwarf.carrying.kind) || (job.item && job.item.kind);
      if (dwarf.carrying) { this.consumeItem(dwarf.carrying); dwarf.carrying = null; }
      else if (job.item) this.consumeItem(job.item);
      const here = w.get(dwarf.tileX, dwarf.tileY, dwarf.z);
      const inDining = here && here.zone === ZONE.DINING;
      const isAle = kind === ITEM.ALE;
      dwarf.thirst = clamp(dwarf.thirst - (isAle ? 85 : 60), 0, 100);
      const diningBonus = inDining ? (isAle ? 10 : 6) : (isAle ? 6 : 3);
      dwarf.mood = clamp(dwarf.mood + diningBonus, 0, 100);
      if (inDining) g.awardXp(dwarf, "charisma", 3);
      dwarf.thought = isAle
        ? (inDining ? "Enjoyed ale in the hall" : "Enjoyed a mug of ale")
        : (inDining ? "Refreshed in the hall" : "Had a drink");
    } else if (job.type === "doctor") {
      const patient = job.patient;
      if (patient) patient.beingTreated = false;
      if (patient && patient.hp > 0 && (patient.wounded || patient.infected)) {
        g.awardXp(dwarf, "medicine", 14);
        dwarf.mood = clamp(dwarf.mood + 2, 0, 100);
        g.log(patient.infected
          ? `${dwarf.name} fights to keep ${patient.name}'s infection at bay.`
          : `${dwarf.name} treated ${patient.name}'s wounds.`, "good", "labor");
      } else {
        dwarf.thought = "No patient to treat";
      }
    } else if (job.type === "train") {
      g.awardXp(dwarf, "fighting", 10); g.awardXp(dwarf, "fitness", 6); g.awardXp(dwarf, "toughness", 7);
      dwarf.mood = clamp(dwarf.mood + 1, 0, 100);
      dwarf.thought = "Sparring in the barracks";
    } else if (job.type === "socialize") {
      g.awardXp(dwarf, "charisma", 8);
      dwarf.mood = clamp(dwarf.mood + 3, 0, 100);
      dwarf.thought = "Traded tales with friends";
    }

    this.cancel(dwarf, true);
  }

  finishSleep(dwarf) {
    const g = this.game;
    this.releaseBed(dwarf);
    dwarf.thought = "Well rested";
    this.cancel(dwarf, true);
  }

  finishRecover(dwarf) {
    const g = this.game;
    this.releaseBed(dwarf);
    if (!dwarf.wounded && !dwarf.infected) {
      dwarf.thought = "Recovered";
      g.log(`${dwarf.name} has recovered.`, "good", "colony");
    }
    this.cancel(dwarf, true);
  }

  spawnItem(kind, x, y, sub = null, z = 0) {
    const g = this.game, w = g.world;
    const tiles = w.getLevel(z);
    let px = x, py = y;
    if (!w.isWalkable(px, py, z) || tiles[py][px].item) {
      let found = false;
      for (const [dx, dy] of NEIGHBORS8) {
        const nx = x + dx, ny = y + dy;
        if (w.inBounds(nx, ny) && w.isWalkable(nx, ny, z) && !tiles[ny][nx].item) { px = nx; py = ny; found = true; break; }
      }
      if (!found) {
        for (let r = 2; r < 6 && !found; r++)
          for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
            const nx = x + dx, ny = y + dy;
            if (w.inBounds(nx, ny) && w.isWalkable(nx, ny, z) && !tiles[ny][nx].item) { px = nx; py = ny; found = true; }
          }
      }
    }
    const it = new Item(kind, px, py, sub, z);
    it.id = g._nextItemId++;
    it.stored = !!tiles[py][px].stockpile;
    tiles[py][px].item = it;
    g.items.push(it);
    return it;
  }

  consumeItem(item) {
    const g = this.game, w = g.world;
    const t = w.get(item.x, item.y, item.z);
    if (t && t.item === item) t.item = null;
    const i = g.items.indexOf(item);
    if (i >= 0) g.items.splice(i, 1);
  }

  cancel(dwarf, completed = false) {
    const job = dwarf.job;
    if (job) {
      const isBedJob = job.type === "sleep" || job.type === "recover";
      // A doctor's job.x/y is the patient's tile (their bed) — never owned by
      // this job. A sleep/recover job's x/y is the dwarf's own bed, released
      // via releaseBed() below (which respects a double bed's other occupant).
      const t = (job.type === "doctor" || isBedJob) ? null : this.game.world.get(job.x, job.y, job.z);
      if (t && !completed) t.reserved = false;
      if (!completed && job.item) job.item.hauled = false;
      if (!completed && job.type === "doctor" && job.patient) job.patient.beingTreated = false;
      if (!completed && isBedJob) this.releaseBed(dwarf);
    }
    if (!completed && dwarf.carrying) this.dropCarried(dwarf);
    dwarf.job = null;
    dwarf.state = "idle";
    dwarf.path = null;
  }
}
