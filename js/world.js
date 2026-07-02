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
};

// Ores embedded in stone
const ORES = ["iron", "gold", "coal"];
const ORE_COLOR = { iron: "#b8b0a0", gold: "#ffd34d", coal: "#3a3a3a" };

// Built structures
const B = { NONE: null, WALL: "wall", FLOOR: "floor" };

// Furniture placed on a tile.
const FURN = { NONE: null, BED: "bed", TABLE: "table" };

// Zones a tile can belong to (in addition to stockpile).
// farm/study/hospital are unlocked through research.
const ZONE = { NONE: null, BEDROOM: "bedroom", DINING: "dining", FARM: "farm", STUDY: "study", HOSPITAL: "hospital" };

// Workshops that can be built on a tile.
const WORKSHOP = { NONE: null, SMELTER: "smelter", FORGE: "forge" };

// What a queued construction will produce.
const BUILD = { WALL: "wall", FLOOR: "floor", BED: "bed", TABLE: "table", SMELTER: "smelter", FORGE: "forge" };
// Material each construction consumes.
const BUILD_MATERIAL = { wall: "stone", floor: "stone", bed: "wood", table: "wood", smelter: "stone", forge: "stone" };

class Tile {
  constructor(kind) {
    this.kind = kind;
    this.feature = F.NONE;
    this.ore = null;
    this.growth = 0;          // plant maturity 0..1
    this.designation = null;  // 'dig' | 'chop' | 'gather'
    this.built = B.NONE;      // constructed wall/floor
    this.buildJob = false;    // construction queued here
    this.buildKind = null;    // 'wall' | 'floor' | 'bed' when buildJob
    this.stockpile = false;   // part of a stockpile zone
    this.zone = ZONE.NONE;    // 'bedroom' | 'dining'
    this.furniture = FURN.NONE; // 'bed' | 'table'
    this.workshop = WORKSHOP.NONE; // 'smelter' | 'forge'
    this.workshopRecipe = 0;  // selected recipe index for this workshop
    this.item = null;         // item resting on this tile
    this.reserved = false;    // a dwarf has claimed the job here
  }
}

class World {
  constructor(w, h, seed, gen = true) {
    this.w = w;
    this.h = h;
    this.seed = seed;
    this.rng = makeRNG(seed);
    this.tiles = [];
    if (gen) this.generate();
    else this.initEmpty();
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

  // Restore tile state from a serialized array; `itemsById` maps item ids.
  // Array layout: [kind,feature,ore,growth,designation,built,buildJob,
  //                buildKind,stockpile,reserved,itemId,zone,furniture,
  //                workshop,workshopRecipe]
  loadTiles(data, itemsById) {
    let i = 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const a = data[i++];
        const t = this.tiles[y][x];
        t.kind = a[0]; t.feature = a[1]; t.ore = a[2]; t.growth = a[3];
        t.designation = a[4]; t.built = a[5];
        t.buildJob = !!a[6]; t.buildKind = a[7] || null; t.stockpile = !!a[8];
        t.reserved = !!a[9];
        t.item = a[10] ? (itemsById.get(a[10]) || null) : null;
        t.zone = a[11] || null; t.furniture = a[12] || null;
        t.workshop = a[13] || null; t.workshopRecipe = a[14] || 0;
      }
    }
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.tiles[y][x] : null; }

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

  // Is this tile walkable by a dwarf?
  isWalkable(x, y) {
    const t = this.get(x, y);
    if (!t) return false;
    if (t.built === B.WALL) return false;
    if (t.kind === K.STONE) return false;   // solid rock
    if (t.kind === K.WATER) return false;
    if (t.feature === F.BOULDER) return false;
    return true;
  }

  // Can a mining/build job stand next to this target?
  hasWalkableNeighbor(x, y) {
    for (const [dx, dy] of NEIGHBORS4) {
      if (this.isWalkable(x + dx, y + dy)) return true;
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
}

const NEIGHBORS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NEIGHBORS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
