// ---- Jobs: designations -> tasks -> dwarf AI --------------------------------

const WORK_TIME = { dig: 1.6, chop: 1.8, gather: 0.9, build: 1.4, eat: 1.2, train: 2.0, socialize: 2.4 };
const ENERGY_SLEEP_BED = 26;     // energy restored per second in a bed
const ENERGY_SLEEP_GROUND = 13;  // ... on the bare ground

class Job {
  constructor(type, x, y) {
    this.type = type;   // dig|chop|gather|build|haul|eat|sleep|train|socialize
    this.x = x;
    this.y = y;
    this.phase = "move";
    this.item = null;
    this.dest = null;      // {x,y} carry destination (haul)
    this.dining = null;    // {x,y} dining spot (eat)
    this.buildKind = null; // wall|floor|bed
  }
}

class JobManager {
  constructor(game) {
    this.game = game;
    this.candidates = { dig: [], chop: [], gather: [], build: [] };
  }

  // ---- outstanding designations ----
  reindex() {
    const g = this.game, w = g.world;
    const c = { dig: [], chop: [], gather: [], build: [] };
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = w.tiles[y][x];
        if (t.reserved) continue;
        if (t.designation === "dig" && w.hasWalkableNeighbor(x, y)) c.dig.push([x, y]);
        else if (t.designation === "chop" && w.hasWalkableNeighbor(x, y)) c.chop.push([x, y]);
        else if (t.designation === "gather" && w.hasWalkableNeighbor(x, y)) c.gather.push([x, y]);
        if (t.buildJob && w.hasWalkableNeighbor(x, y)) c.build.push([x, y]);
      }
    }
    this.candidates = c;
  }

  // ---- stockpile / item helpers ----
  findFreeStockpileTile(nearX, nearY) {
    const g = this.game, w = g.world;
    let best = null, bd = Infinity;
    for (const [x, y] of g.stockpileTiles) {
      const t = w.tiles[y][x];
      if (t.item || t.built === B.WALL) continue;
      const d = manhattan(x, y, nearX, nearY);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }

  findStoredItem(kind, nearX, nearY) {
    const g = this.game, w = g.world;
    let best = null, bd = Infinity;
    for (const it of g.items) {
      if (it.kind !== kind || it.hauled) continue;
      if (!w.tiles[it.y][it.x].stockpile) continue;
      const d = manhattan(it.x, it.y, nearX, nearY);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  findGroundItem(kind, nearX, nearY) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const it of g.items) {
      if (it.kind !== kind || it.hauled) continue;
      const d = manhattan(it.x, it.y, nearX, nearY);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  findAnyItem(kind, nearX, nearY) {
    return this.findStoredItem(kind, nearX, nearY) || this.findGroundItem(kind, nearX, nearY);
  }

  findLooseItem(nearX, nearY) {
    const g = this.game;
    if (!g.stockpileTiles.length) return null;
    let best = null, bd = Infinity;
    for (const it of g.items) {
      if (it.hauled || it.stored) continue;
      if (g.world.tiles[it.y][it.x].stockpile) continue;
      const d = manhattan(it.x, it.y, nearX, nearY);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  nearestTile(list, x, y) {
    let best = null, bd = Infinity;
    for (const [tx, ty] of list) {
      const d = manhattan(tx, ty, x, y);
      if (d < bd) { bd = d; best = { x: tx, y: ty }; }
    }
    return best;
  }

  nearestFreeBed(x, y) {
    const g = this.game;
    let best = null, bd = Infinity;
    for (const [bx, by] of g.bedTiles) {
      const t = g.world.tiles[by][bx];
      if (t.furniture !== FURN.BED || t.reserved) continue;
      const d = manhattan(bx, by, x, y);
      if (d < bd) { bd = d; best = { x: bx, y: by }; }
    }
    return best;
  }

  buildMaterialKind(t) {
    const m = BUILD_MATERIAL[t.buildKind || "wall"];
    return m === "wood" ? ITEM.WOOD : ITEM.STONE;
  }

  workDuration(dwarf, type) {
    const base = WORK_TIME[type] || 1.2;
    const skill = JOB_SKILL[type];
    const mult = skill ? dwarf.workSpeedMult(skill) : 1;
    return base / mult;
  }

  // ---- assignment (schedule/labor aware) ----
  assign(dwarf) {
    const act = dwarf.activity || "work";
    if (act === "sleep") return this.assignSleep(dwarf);
    if (act === "train") return this.assignTrain(dwarf);
    if (act === "eat") {
      if (dwarf.hunger > 35 && this.assignEat(dwarf, true)) return true;
      return this.assignSocialize(dwarf); // otherwise mingle in the hall
    }
    if (act === "idle") return (dwarf.hunger > 70) ? this.assignEat(dwarf, false) : false;

    // ---- "work" shift ----
    if (dwarf.hunger > 70 && this.assignEat(dwarf, false)) return true;
    return this.assignWork(dwarf) || this.assignHaul(dwarf);
  }

  assignWork(dwarf) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY;
    const pools = [
      ["dig", this.candidates.dig], ["chop", this.candidates.chop],
      ["gather", this.candidates.gather], ["build", this.candidates.build],
    ];
    let best = null, bestD = Infinity;
    for (const [type, list] of pools) {
      if (!dwarf.labors.has(JOB_LABOR[type])) continue;
      for (const [x, y] of list) {
        const t = g.world.tiles[y][x];
        if (t.reserved) continue;
        if (type === "build") {
          if (!t.buildJob) continue;
          if (!this.findAnyItem(this.buildMaterialKind(t), dx, dy)) continue;
        } else if (t.designation !== type) continue;
        const d = manhattan(x, y, dx, dy);
        if (d >= bestD) continue;
        best = { type, x, y }; bestD = d;
      }
    }
    if (!best) return false;

    const t = g.world.tiles[best.y][best.x];
    const path = pathAdjacent(g.world, dx, dy, best.x, best.y);
    if (!path) return false;
    t.reserved = true;
    const job = new Job(best.type, best.x, best.y);
    if (best.type === "build") {
      job.buildKind = t.buildKind || "wall";
      const matKind = this.buildMaterialKind(t);
      const mat = this.findAnyItem(matKind, dx, dy);
      mat.hauled = true; job.item = mat; job.phase = "toMat";
      const p2 = pathAdjacent(g.world, dx, dy, mat.x, mat.y) || pathTo(g.world, dx, dy, mat.x, mat.y);
      if (!p2) { t.reserved = false; mat.hauled = false; return false; }
      dwarf.setPath(p2); dwarf.thought = `Fetching ${matKind} to build`;
    } else {
      job.phase = "move"; dwarf.setPath(path);
      dwarf.thought = { dig: "Off to mine", chop: "Off to chop", gather: "Gathering plants" }[best.type];
    }
    dwarf.job = job; dwarf.state = "goto";
    return true;
  }

  assignHaul(dwarf) {
    if (!dwarf.labors.has("hauling")) return false;
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY;
    const loose = this.findLooseItem(dx, dy);
    if (!loose) return false;
    const dest = this.findFreeStockpileTile(loose.x, loose.y);
    if (!dest) return false;
    const path = pathAdjacent(g.world, dx, dy, loose.x, loose.y) || pathTo(g.world, dx, dy, loose.x, loose.y);
    if (!path) return false;
    loose.hauled = true;
    const job = new Job("haul", loose.x, loose.y);
    job.item = loose; job.dest = dest; job.phase = "toItem";
    dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto";
    dwarf.thought = "Hauling to stockpile";
    return true;
  }

  assignEat(dwarf, force) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY;
    if (!force && dwarf.hunger < 55) return false;
    const food = this.findAnyItem(ITEM.FOOD, dx, dy);
    if (!food) return false;
    const path = pathAdjacent(g.world, dx, dy, food.x, food.y) || pathTo(g.world, dx, dy, food.x, food.y);
    if (!path) return false;
    food.hauled = true;
    const job = new Job("eat", food.x, food.y);
    job.item = food; job.phase = "toFood";
    job.dining = g.diningTiles.length ? this.nearestTile(g.diningTiles, food.x, food.y) : null;
    dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto"; dwarf.thought = "Fetching a meal";
    return true;
  }

  assignSleep(dwarf) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY;
    const bed = this.nearestFreeBed(dx, dy);
    const job = new Job("sleep", bed ? bed.x : dx, bed ? bed.y : dy);
    job.phase = "move";
    if (bed) {
      const path = pathTo(g.world, dx, dy, bed.x, bed.y);
      if (path) {
        g.world.tiles[bed.y][bed.x].reserved = true;
        dwarf.bed = { x: bed.x, y: bed.y };
        dwarf.setPath(path); dwarf.thought = "Off to bed";
      } else { dwarf.bed = null; dwarf.setPath(null); dwarf.thought = "Napping on the ground"; }
    } else {
      dwarf.bed = null; dwarf.setPath(null); dwarf.thought = "Napping on the ground";
    }
    dwarf.job = job; dwarf.state = "goto";
    return true;
  }

  assignTrain(dwarf) {
    const job = new Job("train", dwarf.tileX, dwarf.tileY);
    job.phase = "move"; dwarf.setPath(null);
    dwarf.job = job; dwarf.state = "goto"; dwarf.thought = "Training hard";
    return true;
  }

  assignSocialize(dwarf) {
    const g = this.game, dx = dwarf.tileX, dy = dwarf.tileY;
    if (!g.diningTiles.length) return false;
    const spot = this.nearestTile(g.diningTiles, dx, dy);
    const path = pathTo(g.world, dx, dy, spot.x, spot.y);
    if (!path) return false;
    const job = new Job("socialize", spot.x, spot.y);
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
          const t = w.tiles[job.dest.y][job.dest.x];
          if (t.item) {
            const dest = this.findFreeStockpileTile(dwarf.tileX, dwarf.tileY);
            if (dest) { job.dest = dest; this.gotoTile(dwarf, dest.x, dest.y, "carry"); break; }
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
        dwarf.energy = clamp(dwarf.energy + (inBed ? ENERGY_SLEEP_BED : ENERGY_SLEEP_GROUND) * dt, 0, 100);
        if (inBed && w.tiles[dwarf.bed.y][dwarf.bed.x].zone === ZONE.BEDROOM)
          dwarf.mood = clamp(dwarf.mood + dt * 0.6, 0, 100);
        if (dwarf.energy >= 99 || (dwarf.activity !== "sleep" && dwarf.energy > 55))
          this.finishSleep(dwarf);
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
        this.gotoTile(dwarf, job.dest.x, job.dest.y, "carry"); job.phase = "toPile";
        break;
      case "build":
        if (job.phase === "toMat" || job.phase === "toStone") {
          this.pickup(dwarf, job.item);
          const p = pathAdjacent(w, dwarf.tileX, dwarf.tileY, job.x, job.y);
          if (p) { dwarf.setPath(p); dwarf.state = "goto"; job.phase = "toSite"; dwarf.thought = "Carrying materials"; }
          else this.cancel(dwarf);
        } else {
          dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "build");
        }
        break;
      case "eat":
        if (job.phase === "toFood") {
          this.pickup(dwarf, job.item);
          if (job.dining) { this.gotoTile(dwarf, job.dining.x, job.dining.y, "goto"); job.phase = "toDining"; dwarf.thought = "To the dining hall"; }
          else { dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "eat"); }
        } else { // toDining
          dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "eat");
        }
        break;
      case "sleep":
        dwarf.state = "sleep";
        break;
      case "train":
        dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "train");
        break;
      case "socialize":
        dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, "socialize");
        break;
      default: // dig / chop / gather
        dwarf.state = "work"; dwarf.workTimer = this.workDuration(dwarf, job.type);
    }
  }

  gotoTile(dwarf, x, y, endState) {
    const p = pathTo(this.game.world, dwarf.tileX, dwarf.tileY, x, y);
    if (p) { dwarf.setPath(p); dwarf.state = endState; }
    else { this.dropCarried(dwarf); this.cancel(dwarf); }
  }

  pickup(dwarf, item) {
    const t = this.game.world.tiles[item.y][item.x];
    if (t.item === item) t.item = null;
    item.stored = false;
    dwarf.carrying = item;
  }

  dropCarried(dwarf) {
    const it = dwarf.carrying;
    if (!it) return;
    const w = this.game.world;
    let x = dwarf.tileX, y = dwarf.tileY;
    if (w.tiles[y][x].item) {
      for (const [ddx, ddy] of NEIGHBORS8) {
        const nx = x + ddx, ny = y + ddy;
        if (w.inBounds(nx, ny) && w.isWalkable(nx, ny) && !w.tiles[ny][nx].item) { x = nx; y = ny; break; }
      }
    }
    it.x = x; it.y = y; it.hauled = false;
    it.stored = !!w.tiles[y][x].stockpile;
    w.tiles[y][x].item = it;
    dwarf.carrying = null;
  }

  finishWork(dwarf) {
    const g = this.game, w = g.world;
    const job = dwarf.job;
    const t = w.tiles[job.y] ? w.tiles[job.y][job.x] : null;

    if (job.type === "dig" && t) {
      t.designation = null; t.reserved = false;
      const ore = t.ore;
      t.kind = K.FLOOR; t.ore = null; t.feature = F.NONE;
      this.spawnItem(ITEM.STONE, job.x, job.y);
      if (ore) this.spawnItem(ITEM.ORE, job.x, job.y, ore);
      g.log(`${dwarf.name} mined out stone${ore ? " and struck " + ore + "!" : "."}`, ore ? "good" : "");
      g.awardXp(dwarf, "mining", 12); g.awardXp(dwarf, "fitness", 2);
      dwarf.mood = clamp(dwarf.mood + (ore ? 6 : 1), 0, 100);
    } else if (job.type === "chop" && t) {
      t.designation = null; t.reserved = false;
      t.feature = F.NONE; t.growth = 0;
      const logs = randint(w.rng, 1, 3) + Math.floor(dwarf.skillLevel("woodcutting") / 6);
      for (let i = 0; i < logs; i++) this.spawnItem(ITEM.WOOD, job.x, job.y);
      g.log(`${dwarf.name} felled a tree (${logs} logs).`);
      g.awardXp(dwarf, "woodcutting", 12); g.awardXp(dwarf, "fitness", 2);
    } else if (job.type === "gather" && t) {
      t.designation = null; t.reserved = false;
      let food = (t.feature === F.BUSH ? randint(w.rng, 1, 2) : 1) + Math.floor(dwarf.skillLevel("farming") / 8);
      t.feature = F.NONE; t.growth = 0;
      for (let i = 0; i < food; i++) this.spawnItem(ITEM.FOOD, job.x, job.y);
      g.log(`${dwarf.name} gathered ${food} food.`);
      g.awardXp(dwarf, "farming", 9);
    } else if (job.type === "build" && t) {
      t.reserved = false; t.buildJob = false;
      if (dwarf.carrying) { this.consumeItem(dwarf.carrying); dwarf.carrying = null; }
      const kind = job.buildKind || "wall";
      if (kind === "floor") { t.kind = K.FLOOR; t.built = B.FLOOR; g.log(`${dwarf.name} built a stone floor.`); }
      else if (kind === "bed") { t.furniture = FURN.BED; g.rebuildZones(); g.log(`${dwarf.name} built a bed.`, "good"); }
      else { t.built = B.WALL; t.feature = F.NONE; g.log(`${dwarf.name} built a stone wall.`); }
      t.buildKind = null;
      g.awardXp(dwarf, "building", 12); g.awardXp(dwarf, "fitness", 1);
    } else if (job.type === "eat") {
      if (dwarf.carrying) { this.consumeItem(dwarf.carrying); dwarf.carrying = null; }
      else if (job.item) this.consumeItem(job.item);
      const here = w.tiles[dwarf.tileY] && w.tiles[dwarf.tileY][dwarf.tileX];
      const inDining = here && here.zone === ZONE.DINING;
      dwarf.hunger = clamp(dwarf.hunger - (60 + dwarf.skillLevel("cooking") * 2), 0, 100);
      dwarf.mood = clamp(dwarf.mood + (inDining ? 9 : 5), 0, 100);
      g.awardXp(dwarf, "cooking", 5);
      if (inDining) g.awardXp(dwarf, "charisma", 4);
      dwarf.thought = inDining ? "Dined well in the hall" : "Ate a meal";
    } else if (job.type === "train") {
      g.awardXp(dwarf, "fighting", 10); g.awardXp(dwarf, "fitness", 6);
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
    if (dwarf.bed) {
      const t = g.world.tiles[dwarf.bed.y][dwarf.bed.x];
      if (t) t.reserved = false;
      dwarf.bed = null;
    }
    dwarf.thought = "Well rested";
    this.cancel(dwarf, true);
  }

  spawnItem(kind, x, y, sub = null) {
    const g = this.game, w = g.world;
    let px = x, py = y;
    if (!w.isWalkable(px, py) || w.tiles[py][px].item) {
      let found = false;
      for (const [dx, dy] of NEIGHBORS8) {
        const nx = x + dx, ny = y + dy;
        if (w.inBounds(nx, ny) && w.isWalkable(nx, ny) && !w.tiles[ny][nx].item) { px = nx; py = ny; found = true; break; }
      }
      if (!found) {
        for (let r = 2; r < 6 && !found; r++)
          for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
            const nx = x + dx, ny = y + dy;
            if (w.inBounds(nx, ny) && w.isWalkable(nx, ny) && !w.tiles[ny][nx].item) { px = nx; py = ny; found = true; }
          }
      }
    }
    const it = new Item(kind, px, py, sub);
    it.id = g._nextItemId++;
    it.stored = !!w.tiles[py][px].stockpile;
    w.tiles[py][px].item = it;
    g.items.push(it);
    return it;
  }

  consumeItem(item) {
    const g = this.game, w = g.world;
    const t = w.tiles[item.y] && w.tiles[item.y][item.x];
    if (t && t.item === item) t.item = null;
    const i = g.items.indexOf(item);
    if (i >= 0) g.items.splice(i, 1);
  }

  cancel(dwarf, completed = false) {
    const job = dwarf.job;
    if (job) {
      const t = this.game.world.get(job.x, job.y);
      if (t && !completed) t.reserved = false;
      if (!completed && job.item) job.item.hauled = false;
      if (!completed && job.type === "sleep" && dwarf.bed) {
        const bt = this.game.world.get(dwarf.bed.x, dwarf.bed.y);
        if (bt) bt.reserved = false;
        dwarf.bed = null;
      }
    }
    if (!completed && dwarf.carrying) this.dropCarried(dwarf);
    dwarf.job = null;
    dwarf.state = "idle";
    dwarf.path = null;
  }
}
