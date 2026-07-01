// ---- Jobs: designations -> tasks -> dwarf AI --------------------------------

const WORK_TIME = { dig: 1.6, chop: 1.8, gather: 0.9, build: 1.4, eat: 1.2 };

class Job {
  constructor(type, x, y) {
    this.type = type;   // dig | chop | gather | build | haul | eat
    this.x = x;         // primary target tile
    this.y = y;
    this.phase = "move";
    this.item = null;   // for haul/build/eat
    this.dest = null;   // {x,y} carry destination
  }
}

class JobManager {
  constructor(game) {
    this.game = game;
    this.reindexTimer = 0;
    this.candidates = { dig: [], chop: [], gather: [], build: [] };
  }

  // Rebuild the list of outstanding designations by scanning the map.
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

  // --- stockpile / item helpers ---
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
      const t = w.tiles[it.y][it.x];
      if (!t.stockpile) continue;
      const d = manhattan(it.x, it.y, nearX, nearY);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  findLooseItem(nearX, nearY) {
    const g = this.game;
    if (!g.stockpileTiles.length) return null;
    let best = null, bd = Infinity;
    for (const it of g.items) {
      if (it.hauled || it.stored) continue;
      const t = g.world.tiles[it.y][it.x];
      if (t.stockpile) continue; // already in a pile
      const d = manhattan(it.x, it.y, nearX, nearY);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  findAnyItem(kind, nearX, nearY) {
    // prefer stored, fall back to loose ground item
    return this.findStoredItem(kind, nearX, nearY) ||
      this.findGroundItem(kind, nearX, nearY);
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

  // Pick and assign the best job for an idle dwarf.
  assign(dwarf) {
    const g = this.game;
    const dx = dwarf.tileX, dy = dwarf.tileY;

    // 1) Eat when hungry and food exists.
    if (dwarf.hunger > 68) {
      const food = this.findAnyItem(ITEM.FOOD, dx, dy);
      if (food) {
        const path = pathAdjacent(g.world, dx, dy, food.x, food.y) ||
          pathTo(g.world, dx, dy, food.x, food.y);
        if (path) {
          const job = new Job("eat", food.x, food.y);
          job.item = food; job.phase = "move";
          food.hauled = true;
          dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto";
          dwarf.thought = "Hungry — getting food";
          return true;
        }
      }
    }

    // 2) Work designations — nearest reachable of any type.
    const pools = [
      ["dig", this.candidates.dig],
      ["chop", this.candidates.chop],
      ["gather", this.candidates.gather],
      ["build", this.candidates.build],
    ];
    let bestJob = null, bestD = Infinity;
    for (const [type, list] of pools) {
      for (const [x, y] of list) {
        const t = g.world.tiles[y][x];
        if (t.reserved) continue; // claimed by another dwarf this frame
        // still valid?
        if (type === "build") {
          if (!t.buildJob) continue;
          if (!this.findAnyItem(ITEM.STONE, dx, dy)) continue; // needs a stone
        } else if (t.designation !== type) {
          continue;
        }
        const d = manhattan(x, y, dx, dy);
        if (d >= bestD) continue;
        bestD = d; bestJob = { type, x, y };
      }
    }
    if (bestJob) {
      const path = pathAdjacent(g.world, dx, dy, bestJob.x, bestJob.y);
      if (path) {
        const t = g.world.tiles[bestJob.y][bestJob.x];
        t.reserved = true;
        const job = new Job(bestJob.type, bestJob.x, bestJob.y);
        if (bestJob.type === "build") {
          // switch to fetch phase for the material
          const stone = this.findAnyItem(ITEM.STONE, dx, dy);
          stone.hauled = true;
          job.item = stone; job.phase = "toStone";
          const p2 = pathAdjacent(g.world, dx, dy, stone.x, stone.y) ||
            pathTo(g.world, dx, dy, stone.x, stone.y);
          if (!p2) { t.reserved = false; stone.hauled = false; return false; }
          dwarf.setPath(p2);
          dwarf.thought = "Fetching stone to build";
        } else {
          job.phase = "move";
          dwarf.setPath(path);
          dwarf.thought = { dig: "Off to mine", chop: "Off to chop", gather: "Gathering plants" }[bestJob.type];
        }
        dwarf.job = job; dwarf.state = "goto";
        // remove from candidate pool
        return true;
      } else {
        // temporarily un-listable; skip this tick
      }
    }

    // 3) Hauling loose items to stockpiles.
    const loose = this.findLooseItem(dx, dy);
    if (loose) {
      const dest = this.findFreeStockpileTile(loose.x, loose.y);
      if (dest) {
        const path = pathAdjacent(g.world, dx, dy, loose.x, loose.y) ||
          pathTo(g.world, dx, dy, loose.x, loose.y);
        if (path) {
          loose.hauled = true;
          const job = new Job("haul", loose.x, loose.y);
          job.item = loose; job.dest = dest; job.phase = "toItem";
          dwarf.setPath(path); dwarf.job = job; dwarf.state = "goto";
          dwarf.thought = "Hauling to stockpile";
          return true;
        }
      }
    }

    return false;
  }

  // Per-frame execution for a dwarf that has a job.
  execute(dwarf, dt) {
    const g = this.game, w = g.world;
    const job = dwarf.job;
    if (!job) { dwarf.state = "idle"; return; }

    switch (dwarf.state) {
      case "goto": {
        if (dwarf.move(dt)) {
          // Arrived at destination for current phase.
          if (job.type === "haul") {
            if (job.phase === "toItem") { this.pickup(dwarf, job.item); this.gotoTile(dwarf, job.dest.x, job.dest.y, "carry"); job.phase = "toPile"; }
          } else if (job.type === "eat") {
            dwarf.state = "work"; dwarf.workTimer = WORK_TIME.eat;
          } else if (job.type === "build") {
            if (job.phase === "toStone") {
              this.pickup(dwarf, job.item);
              const p = pathAdjacent(w, dwarf.tileX, dwarf.tileY, job.x, job.y);
              if (p) { dwarf.setPath(p); dwarf.state = "goto"; job.phase = "toSite"; dwarf.thought = "Carrying stone"; }
              else this.cancel(dwarf);
            } else if (job.phase === "toSite") {
              dwarf.state = "work"; dwarf.workTimer = WORK_TIME.build;
            }
          } else {
            // dig / chop / gather
            dwarf.state = "work"; dwarf.workTimer = WORK_TIME[job.type];
          }
        }
        break;
      }
      case "carry": {
        if (dwarf.move(dt)) {
          // haul: drop at stockpile
          const t = w.tiles[dwarf.job.dest.y][dwarf.job.dest.x];
          if (t.item) {
            // spot got taken; find another
            const dest = this.findFreeStockpileTile(dwarf.tileX, dwarf.tileY);
            if (dest) { dwarf.job.dest = dest; this.gotoTile(dwarf, dest.x, dest.y, "carry"); break; }
            else { this.dropCarried(dwarf); this.cancel(dwarf); break; }
          }
          this.dropCarried(dwarf);
          this.cancel(dwarf);
        }
        break;
      }
      case "work": {
        dwarf.workTimer -= dt;
        if (dwarf.workTimer <= 0) this.finishWork(dwarf);
        break;
      }
      default:
        dwarf.state = "idle";
    }
  }

  gotoTile(dwarf, x, y, endState) {
    const p = pathTo(this.game.world, dwarf.tileX, dwarf.tileY, x, y);
    if (p) { dwarf.setPath(p); dwarf.state = endState; }
    else { this.dropCarried(dwarf); this.cancel(dwarf); }
  }

  pickup(dwarf, item) {
    const w = this.game.world;
    const t = w.tiles[item.y][item.x];
    if (t.item === item) t.item = null;
    item.stored = false;
    dwarf.carrying = item;
  }

  dropCarried(dwarf) {
    const it = dwarf.carrying;
    if (!it) return;
    const w = this.game.world;
    let x = dwarf.tileX, y = dwarf.tileY;
    // find a spot without an item
    if (w.tiles[y][x].item) {
      let placed = false;
      for (const [ddx, ddy] of NEIGHBORS8) {
        const nx = x + ddx, ny = y + ddy;
        if (w.inBounds(nx, ny) && w.isWalkable(nx, ny) && !w.tiles[ny][nx].item) { x = nx; y = ny; placed = true; break; }
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
      dwarf.mood = clamp(dwarf.mood + (ore ? 6 : 1), 0, 100);
    } else if (job.type === "chop" && t) {
      t.designation = null; t.reserved = false;
      t.feature = F.NONE; t.growth = 0;
      const logs = randint(w.rng, 1, 3);
      for (let i = 0; i < logs; i++) this.spawnItem(ITEM.WOOD, job.x, job.y);
      g.log(`${dwarf.name} felled a tree (${logs} logs).`);
    } else if (job.type === "gather" && t) {
      t.designation = null; t.reserved = false;
      const food = t.feature === F.BUSH ? randint(w.rng, 1, 2) : 1;
      t.feature = F.NONE; t.growth = 0;
      for (let i = 0; i < food; i++) this.spawnItem(ITEM.FOOD, job.x, job.y);
      g.log(`${dwarf.name} gathered ${food} food.`);
    } else if (job.type === "build" && t) {
      t.reserved = false; t.buildJob = false;
      // consume the carried stone
      if (dwarf.carrying) { this.consumeItem(dwarf.carrying); dwarf.carrying = null; }
      if (job.buildKind === B.FLOOR || t.pendingFloor) {
        t.kind = K.FLOOR; t.built = B.FLOOR; t.pendingFloor = false;
        g.log(`${dwarf.name} built a stone floor.`);
      } else {
        t.built = B.WALL; t.feature = F.NONE;
        g.log(`${dwarf.name} built a stone wall.`);
      }
    } else if (job.type === "eat") {
      if (dwarf.carrying) { this.consumeItem(dwarf.carrying); dwarf.carrying = null; }
      else if (job.item) { this.consumeItem(job.item); }
      dwarf.hunger = clamp(dwarf.hunger - 70, 0, 100);
      dwarf.mood = clamp(dwarf.mood + 5, 0, 100);
      dwarf.thought = "Ate a good meal";
    }

    this.cancel(dwarf, true);
  }

  spawnItem(kind, x, y, sub = null) {
    const g = this.game, w = g.world;
    // place on tile or nearest free walkable tile
    let px = x, py = y;
    if (!w.isWalkable(px, py) || w.tiles[py][px].item) {
      let found = false;
      for (const [dx, dy] of NEIGHBORS8) {
        const nx = x + dx, ny = y + dy;
        if (w.inBounds(nx, ny) && w.isWalkable(nx, ny) && !w.tiles[ny][nx].item) { px = nx; py = ny; found = true; break; }
      }
      if (!found) { // fallback: allow stacking search wider
        for (let r = 2; r < 6 && !found; r++) {
          for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
            const nx = x + dx, ny = y + dy;
            if (w.inBounds(nx, ny) && w.isWalkable(nx, ny) && !w.tiles[ny][nx].item) { px = nx; py = ny; found = true; }
          }
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

  // Release the dwarf's job (optionally after successful completion).
  cancel(dwarf, completed = false) {
    const job = dwarf.job;
    if (job) {
      const t = this.game.world.get(job.x, job.y);
      if (t && !completed) {
        // leave designation intact so it can be re-picked; clear reservation
        t.reserved = false;
      }
      if (!completed && job.item) job.item.hauled = false;
    }
    if (!completed && dwarf.carrying) this.dropCarried(dwarf);
    dwarf.job = null;
    dwarf.state = "idle";
    dwarf.path = null;
  }
}
