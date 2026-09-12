// ---- World: tiles, generation, queries --------------------------------------

// Terrain kinds
const K = {
  GRASS: "grass",
  SOIL: "soil",
  SAND: "sand",
  WATER: "water",
  STONE: "stone",   // solid rock wall — must be mined
  FLOOR: "floor",   // mined-out rock or built floor — walkable
};

// Plant / surface features
const F = {
  NONE: null,
  TREE: "tree",
  SAPLING: "sapling",
  BUSH: "bush",
  MUSHROOM: "mushroom",
  BOULDER: "boulder",
  CROP: "crop",       // planted in a Farm zone; matures via growth, then harvested
};

// Ores (and marble, a decorative stone) embedded in solid rock
const ORES = ["iron", "gold", "coal", "marble"];
const ORE_COLOR = { iron: "#b8b0a0", gold: "#ffd34d", coal: "#3a3a3a", marble: "#e8e2d8" };

// Built structures
const B = { NONE: null, WALL: "wall", FLOOR: "floor", DOOR: "door", STAIRS: "stairs", RAMP: "ramp" };

// Furniture placed on a tile.
const FURN = { NONE: null, BED: "bed", TABLE: "table", DOUBLE_BED: "doublebed", PAINTING: "painting", GENERATOR: "generator", ICEBOX: "icebox", WATCHTOWER: "watchtower", TRAP: "trap", TORCH: "torch", LANTERN: "lantern", LAMP: "lamp" };
// Display info for furniture that isn't self-explanatory in the inspector.
const FURN_INFO = {
  generator: { name: "Essence Well", icon: "🔮" },
  icebox: { name: "Frost Chamber", icon: "❄️" },
  watchtower: { name: "Watchtower", icon: "🗼" },
  trap: { name: "Trap", icon: "⚠️" },
  torch: { name: "Torch", icon: "🔥" },
  lantern: { name: "Elven Lantern", icon: "🏮" },
  lamp: { name: "Aether Lamp", icon: "💠" },
};

// Light sources: radius in tiles (spread respects walls/doors via the same
// line-of-sight rule ranged combat uses). The Aether Lamp only shines while
// its conduit network carries power from an Essence Well.
const LIGHTS = {
  torch:     { radius: 4.5, color: "255,180,80" },
  lantern:   { radius: 6.5, color: "255,200,110" },
  lamp:      { radius: 8,   color: "120,220,255", needsPower: true },
  generator: { radius: 5,   color: "180,140,255" },
};

// Zones a tile can belong to (in addition to stockpile).
// farm/study/hospital are unlocked through research.
const ZONE = { NONE: null, BEDROOM: "bedroom", DINING: "dining", FARM: "farm", STUDY: "study", HOSPITAL: "hospital", TRADE: "trade", QUARANTINE: "quarantine" };

// Workshops that can be built on a tile.
const WORKSHOP = { NONE: null, SMELTER: "smelter", FORGE: "forge", WELL: "well", BREWERY: "brewery", CRAFTING: "crafting", WEAPONS: "weapons", CLOTHING: "clothing", ELECTRONICS: "electronics" };

// What a queued construction will produce.
const BUILD = { WALL: "wall", FLOOR: "floor", BED: "bed", TABLE: "table", SMELTER: "smelter", FORGE: "forge", DOOR: "door", WELL: "well", BREWERY: "brewery", DOUBLE_BED: "doublebed", PAINTING: "painting", CONDUIT: "conduit", GENERATOR: "generator", ICEBOX: "icebox" };
// Material each construction consumes.
const BUILD_MATERIAL = { wall: "stone", floor: "stone", bed: "wood", table: "wood", smelter: "stone", forge: "stone", well: "stone", brewery: "stone", crafting: "wood", weapons: "stone", clothing: "wood", electronics: "metal", door: "wood", doublebed: "wood", painting: "wood", conduit: "stone", generator: "stone", icebox: "wood", palisade: "wood", watchtower: "stone", trap: "wood", torch: "wood", lantern: "wood", lamp: "metal" };

class Tile {
  constructor(kind) {
    this.kind = kind;
    this.feature = F.NONE;
    this.ore = null;
    this.aquifer = false;     // hidden hazard: mining this stone tile floods it instead of a normal drop
    this.flooded = false;     // true only for aquifer-originated water (not an ordinary surface lake) — lets `drain` target it
    this.growth = 0;          // plant maturity 0..1
    this.designation = null;  // 'dig' | 'chop' | 'gather'
    this.built = B.NONE;      // constructed wall/floor
    this.buildJob = false;    // construction queued here
    this.buildKind = null;    // 'wall' | 'floor' | 'bed' when buildJob
    this.buildMaterial = null; // 'wood'|'stone'|'marble'|'metal' chosen for this build; null = old default for buildKind
    this.stockpile = false;   // part of a stockpile zone
    this.stockpileFilter = null; // null = accepts anything, else a STOCKPILE_CATEGORIES id
    this.zone = ZONE.NONE;    // 'bedroom' | 'dining'
    this.furniture = FURN.NONE; // 'bed' | 'table' | 'doublebed' | 'painting'
    this.bedOccupants = [];   // dbIds currently sleeping here (beds only; >1 only for a double bed)
    this.workshop = WORKSHOP.NONE; // 'smelter' | 'forge'
    this.workshopRecipe = 0;  // selected recipe index for this workshop
    this.workshopTarget = 0;  // 0 = repeat forever, otherwise stop after this many outputs
    this.workshopProduced = 0;
    this.item = null;         // item resting on this tile
    this.reserved = false;    // a dwarf has claimed the job here
    this.doorLocked = false;  // built === DOOR: barred against raiders
    this.conduit = false;     // carries Essence between generators/consumers
    this.powered = false;     // computed each network tick — part of a satisfied network
    this.trapCooldown = 0;    // FURN.TRAP only: seconds until it can trigger again
  }
}

class World {
  constructor(w, h, seed, gen = true) {
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.rng = makeRNG(seed);
    this.tiles = [];         // level 0 (surface) — kept for backward compatibility
    this.levels = new Map(); // z -> Tile[][], z=0 is `this.tiles`
    this.minZ = 0;           // deepest level dug into so far
    if (gen) this.generate();
    else this.initEmpty();
    this.levels.set(0, this.tiles);
  }

  // Build a blank grid (used before loading tiles from a save).
  initEmpty() {
    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) row.push(new Tile(K.SOIL));
      this.tiles.push(row);
    }
    this.spawnX = Math.floor(this.w / 2);
    this.spawnY = Math.floor(this.h / 2);
  }

  // Build a blank grid for a not-yet-existing sub-surface level (used while
  // restoring a save so loadLevelTiles has something to write into).
  blankLevel() {
    const rows = [];
    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) row.push(new Tile(K.STONE));
      rows.push(row);
    }
    return rows;
  }

  // Get (or lazily generate) the tile grid for level `z`. z=0 is the
  // surface, already generated; z<0 levels are dense underground stone
  // with ore veins, generated the first time a stairwell reaches them.
  getLevel(z) {
    let lvl = this.levels.get(z);
    if (!lvl) {
      lvl = this.generateUndergroundLevel(z);
      this.levels.set(z, lvl);
      if (z < this.minZ) this.minZ = z;
    }
    return lvl;
  }

  generateUndergroundLevel(z) {
    const noise = makeNoise(this.rng);
    const rng = this.rng;
    const rows = [];
    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) {
        const t = new Tile(K.STONE);
        const veins = noise(x + z * 733, y - z * 411, 22, 4);
        if (veins > 0.55 && rng() < 0.16) {
          t.ore = choice(rng, ORES);
        } else {
          // Aquifers: a real hazard, not a common annoyance — rarer than ore,
          // own noise field so they don't just track vein placement, and
          // mutually exclusive with ore on a given tile.
          const water = noise(x - z * 577, y + z * 911, 28, 4);
          if (water > 0.75 && rng() < 0.04) t.aquifer = true;
        }
        row.push(t);
      }
      rows.push(row);
    }
    return rows;
  }

  // Restore tile state from a serialized array into a specific level's
  // grid; `itemsById` maps item ids. Level 0 defaults to `this.tiles`.
  // Array layout: [kind,feature,ore,growth,designation,built,buildJob,
  //                buildKind,stockpile,reserved,itemId,zone,furniture,
  //                workshop,workshopRecipe,doorLocked,bedOccupants,
  //                stockpileFilter,conduit,buildMaterial,aquifer,flooded,
  //                trapCooldown]
  loadLevelTiles(z, data, itemsById) {
    let tiles = this.levels.get(z);
    if (!tiles) {
      tiles = this.blankLevel();
      this.levels.set(z, tiles);
      if (z === 0) this.tiles = tiles;
      if (z < this.minZ) this.minZ = z;
    }
    let i = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const a = data[i++];
        const t = tiles[y][x];
        t.kind = a[0]; t.feature = a[1]; t.ore = a[2]; t.growth = a[3];
        t.designation = a[4]; t.built = a[5];
        t.buildJob = !!a[6]; t.buildKind = a[7] || null; t.stockpile = !!a[8];
        t.reserved = !!a[9];
        t.item = a[10] ? (itemsById.get(a[10]) || null) : null;
        t.zone = a[11] || null; t.furniture = a[12] || null;
        t.workshop = a[13] || null; t.workshopRecipe = a[14] || 0;
        t.workshopTarget = a[23] || 0; t.workshopProduced = a[24] || 0;
        t.doorLocked = !!a[15];
        t.bedOccupants = a[16] ? String(a[16]).split(",") : [];
        t.stockpileFilter = a[17] || null;
        t.conduit = !!a[18];
        t.buildMaterial = a[19] || null;
        t.aquifer = !!a[20];
        t.flooded = !!a[21];
        t.trapCooldown = a[22] || 0;
        t.powered = false;
      }
    }
  }

  // Backward-compatible alias: load into level 0.
  loadTiles(data, itemsById) { this.loadLevelTiles(0, data, itemsById); }

  // Carve a stairwell connecting (x,y,z) down to (x,y,z-1), auto-generating
  // the level below the first time it's reached.
  carveStairs(x, y, z) {
    const here = this.getLevel(z)[y][x];
    here.kind = K.FLOOR; here.built = B.STAIRS; here.ore = null; here.feature = F.NONE;
    const below = this.getLevel(z - 1)[y][x];
    below.kind = K.FLOOR; below.built = B.STAIRS; below.ore = null; below.feature = F.NONE;
  }

  // Carve a ramp connecting (x,y,z) down to (x,y,z-1) — a second, purely
  // cosmetic/build-cost-flavored alternative to carveStairs. Same portal
  // mechanic (same-(x,y) stacking), same monster-access implications.
  carveRamp(x, y, z) {
    const here = this.getLevel(z)[y][x];
    here.kind = K.FLOOR; here.built = B.RAMP; here.ore = null; here.feature = F.NONE;
    const below = this.getLevel(z - 1)[y][x];
    below.kind = K.FLOOR; below.built = B.RAMP; below.ore = null; below.feature = F.NONE;
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y, z = 0) {
    if (!this.inBounds(x, y)) return null;
    const lvl = z === 0 ? this.tiles : this.levels.get(z);
    return lvl ? lvl[y][x] : null;
  }

  generate() {
    const noise = makeNoise(this.rng);
    const rng = this.rng;

    for (let y = 0; y < this.h; y++) {
      const row = [];
      for (let x = 0; x < this.w; x++) {
        const elev = noise(x, y, 34, 5);       // overall elevation
        const rock = noise(x + 900, y + 900, 20, 4); // rocky patches
        const moist = noise(x + 400, y - 300, 26, 3);

        let t;
        if (elev < 0.30) {
          t = new Tile(K.WATER);
        } else if (elev < 0.35) {
          t = new Tile(K.SAND);
        } else if (rock > 0.62) {
          // exposed stone highlands — solid rock to mine into
          t = new Tile(K.STONE);
          if (rng() < 0.11) t.ore = choice(rng, ORES);
        } else {
          t = new Tile(moist > 0.5 ? K.GRASS : K.SOIL);
        }
        row.push(t);
      }
      this.tiles.push(row);
    }

    // Vegetation pass on open ground
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = this.tiles[y][x];
        if (t.kind === K.GRASS) {
          const forest = noise(x - 500, y + 700, 16, 3);
          if (forest > 0.60 && rng() < 0.55) {
            t.feature = F.TREE; t.growth = 0.6 + rng() * 0.4;
          } else if (rng() < 0.05) {
            t.feature = F.BUSH; t.growth = 0.4 + rng() * 0.6;
          } else if (rng() < 0.02) {
            t.feature = F.MUSHROOM; t.growth = 1;
          }
        } else if (t.kind === K.SOIL && rng() < 0.03) {
          t.feature = F.MUSHROOM; t.growth = 1;
        } else if (t.kind === K.STONE && rng() < 0.02) {
          // occasional loose boulder on the surface? keep rare
        }
      }
    }

    // Cave-in a small starting clearing near map center so dwarves have room.
    this.spawnX = Math.floor(this.w / 2);
    this.spawnY = Math.floor(this.h / 2);
    this.carveClearing(this.spawnX, this.spawnY, 5);
  }

  carveClearing(cx, cy, r) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inBounds(x, y)) continue;
        if (dist2(x, y, cx, cy) > r * r) continue;
        const t = this.tiles[y][x];
        if (t.kind === K.STONE) { t.kind = K.FLOOR; t.ore = null; }
        if (t.kind === K.WATER) t.kind = K.SOIL;
        if (t.feature === F.TREE || t.feature === F.BOULDER) t.feature = F.NONE;
      }
    }
  }

  // Is this tile walkable? `outsider` (raiders, caravans) is blocked by a
  // locked door; the colony's own elves always pass through their doors.
  // `z` selects the level (0 = surface, negative = underground).
  isWalkable(x, y, z = 0, outsider = false) {
    const t = this.get(x, y, z);
    if (!t) return false;
    if (t.built === B.WALL) return false;
    if (t.built === B.DOOR && outsider && t.doorLocked) return false;
    if (t.kind === K.STONE) return false;   // solid rock
    if (t.kind === K.WATER) return false;
    if (t.feature === F.BOULDER) return false;
    return true;
  }

  // Can a mining/build job stand next to this target?
  hasWalkableNeighbor(x, y, z = 0) {
    for (const [dx, dy] of NEIGHBORS4) {
      if (this.isWalkable(x + dx, y + dy, z)) return true;
    }
    return false;
  }

  // Grow plants over time.
  tickGrowth(rng) {
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(rng() * this.w);
      const y = Math.floor(rng() * this.h);
      const t = this.tiles[y][x];
      if (t.feature === F.SAPLING) {
        t.growth += 0.02;
        if (t.growth >= 1) { t.feature = F.TREE; }
      } else if (t.feature === F.BUSH || t.feature === F.MUSHROOM) {
        if (t.growth < 1) t.growth = Math.min(1, t.growth + 0.01);
      } else if ((t.kind === K.GRASS) && t.feature === F.NONE && rng() < 0.002) {
        // occasional regrowth
        t.feature = rng() < 0.5 ? F.SAPLING : F.MUSHROOM;
        t.growth = rng() < 0.5 ? 0.1 : 0.2;
      }
    }
  }

  // Aquifer floods slowly creep into adjacent mined-out floor tiles, bounded
  // per-level per-tick so one vein can't drown a whole floor. Mirrors
  // tickGrowth's bounded-random-sample cadence/shape. A dwarf already
  // mid-path across a tile that floods this tick isn't interrupted — nothing
  // else in the codebase invalidates in-flight paths on tile changes either
  // (e.g. a wall built mid-path isn't special-cased) — only future
  // pathfinding sees the new water.
  tickFlood(rng) {
    for (let z = this.minZ; z < 0; z++) {
      const tiles = this.levels.get(z);
      if (!tiles) continue;
      for (let i = 0; i < 6; i++) {
        const x = Math.floor(rng() * this.w), y = Math.floor(rng() * this.h);
        const t = tiles[y][x];
        if (t.kind !== K.WATER || !t.flooded) continue;
        const dirs = NEIGHBORS4.slice().sort(() => rng() - 0.5);
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const nt = tiles[ny][nx];
          if (nt.kind !== K.FLOOR || nt.built !== B.NONE || nt.item) continue;
          if (rng() < 0.12) {
            nt.kind = K.WATER; nt.flooded = true;
            nt.designation = null; nt.buildJob = false; nt.stockpile = false;
          }
          break;
        }
      }
    }
  }
}

const NEIGHBORS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEIGHBORS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
