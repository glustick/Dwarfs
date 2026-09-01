// ---- A* pathfinding on the tile grid ----------------------------------------

// Binary min-heap keyed on f-score.
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    const a = this.a; a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let s = i;
        if (l < a.length && a[l].f < a[s].f) s = l;
        if (r < a.length && a[r].f < a[s].f) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]]; i = s;
      }
    }
    return top;
  }
}

// Find a path from (sx,sy,sz) to a goal.
// `goalTest(x,y,z)` returns true if the tile is an acceptable destination.
// `heuristic(x,y,z)` estimates remaining cost.
// Returns an array of {x,y,z} steps (excluding start) or null.
function findPath(world, sx, sy, sz, goalTest, heuristic, opts = {}) {
  const maxNodes = opts.maxNodes || 6000;
  const outsider = !!opts.outsider;
  const W = world.w, H = world.h;
  // Pack (x,y,z) into one integer key. z is small (a handful of levels),
  // offset so it's always non-negative.
  const idx = (x, y, z) => (z + 1000) * (W * H) + y * W + x;

  const open = new MinHeap();
  const gScore = new Map();
  const came = new Map();
  const closed = new Set();

  gScore.set(idx(sx, sy, sz), 0);
  open.push({ x: sx, y: sy, z: sz, f: heuristic(sx, sy, sz) });

  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    const ci = idx(cur.x, cur.y, cur.z);
    if (closed.has(ci)) continue;
    closed.add(ci);

    if (goalTest(cur.x, cur.y, cur.z)) {
      // reconstruct
      const path = [];
      let k = ci, cx = cur.x, cy = cur.y, cz = cur.z;
      while (came.has(k)) {
        path.push({ x: cx, y: cy, z: cz });
        const p = came.get(k);
        cx = p.x; cy = p.y; cz = p.z; k = idx(cx, cy, cz);
      }
      path.reverse();
      return path;
    }

    if (++expanded > maxNodes) return null;

    const g = gScore.get(ci);
    for (const [dx, dy] of NEIGHBORS8) {
      const nx = cur.x + dx, ny = cur.y + dy, nz = cur.z;
      if (!world.isWalkable(nx, ny, nz, outsider)) continue;
      // Prevent cutting through wall corners on diagonals.
      if (dx !== 0 && dy !== 0) {
        if (!world.isWalkable(cur.x + dx, cur.y, nz, outsider) && !world.isWalkable(cur.x, cur.y + dy, nz, outsider)) continue;
      }
      const ni = idx(nx, ny, nz);
      if (closed.has(ni)) continue;
      const step = (dx !== 0 && dy !== 0) ? 1.414 : 1;
      const tentative = g + step;
      if (tentative < (gScore.has(ni) ? gScore.get(ni) : Infinity)) {
        gScore.set(ni, tentative);
        came.set(ni, { x: cur.x, y: cur.y, z: cur.z });
        open.push({ x: nx, y: ny, z: nz, f: tentative + heuristic(nx, ny, nz) });
      }
    }

    // Vertical neighbors: a connected pair of STAIRS tiles links (x,y,z)
    // to (x,y,z-1) and (x,y,z+1).
    const hereTile = world.get(cur.x, cur.y, cur.z);
    if (hereTile && hereTile.built === B.STAIRS) {
      for (const nz of [cur.z - 1, cur.z + 1]) {
        const belowTile = world.get(cur.x, cur.y, nz);
        if (!belowTile || belowTile.built !== B.STAIRS) continue;
        const ni = idx(cur.x, cur.y, nz);
        if (closed.has(ni)) continue;
        const tentative = g + 1;
        if (tentative < (gScore.has(ni) ? gScore.get(ni) : Infinity)) {
          gScore.set(ni, tentative);
          came.set(ni, { x: cur.x, y: cur.y, z: cur.z });
          open.push({ x: cur.x, y: cur.y, z: nz, f: tentative + heuristic(cur.x, cur.y, nz) });
        }
      }
    }
  }
  return null;
}

// Convenience: path to an exact tile. `outsider` (raiders, caravans) can't
// pass a locked door.
function pathTo(world, sx, sy, sz, tx, ty, tz, outsider = false) {
  return findPath(world, sx, sy, sz,
    (x, y, z) => x === tx && y === ty && z === tz,
    (x, y, z) => Math.hypot(x - tx, y - ty) + Math.abs(z - tz), { outsider });
}

// Path to any tile ADJACENT to (tx,ty,tz) — used for mining/chopping/building.
function pathAdjacent(world, sx, sy, sz, tx, ty, tz, outsider = false) {
  return findPath(world, sx, sy, sz,
    (x, y, z) => z === tz && Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1 && !(x === tx && y === ty),
    (x, y, z) => Math.hypot(x - tx, y - ty) + Math.abs(z - tz), { outsider });
}
