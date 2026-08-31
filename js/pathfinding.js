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

// Find a path from (sx,sy) to a goal.
// `goalTest(x,y)` returns true if the tile is an acceptable destination.
// `heuristic(x,y)` estimates remaining cost.
// Returns an array of {x,y} steps (excluding start) or null.
function findPath(world, sx, sy, goalTest, heuristic, opts = {}) {
  const maxNodes = opts.maxNodes || 6000;
  const outsider = !!opts.outsider;
  const W = world.w;
  const idx = (x, y) => y * W + x;

  const open = new MinHeap();
  const gScore = new Map();
  const came = new Map();
  const closed = new Set();

  gScore.set(idx(sx, sy), 0);
  open.push({ x: sx, y: sy, f: heuristic(sx, sy) });

  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    const ci = idx(cur.x, cur.y);
    if (closed.has(ci)) continue;
    closed.add(ci);

    if (goalTest(cur.x, cur.y)) {
      // reconstruct
      const path = [];
      let k = ci, cx = cur.x, cy = cur.y;
      while (came.has(k)) {
        path.push({ x: cx, y: cy });
        const p = came.get(k);
        cx = p.x; cy = p.y; k = idx(cx, cy);
      }
      path.reverse();
      return path;
    }

    if (++expanded > maxNodes) return null;

    const g = gScore.get(ci);
    for (const [dx, dy] of NEIGHBORS8) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!world.isWalkable(nx, ny, outsider)) continue;
      // Prevent cutting through wall corners on diagonals.
      if (dx !== 0 && dy !== 0) {
        if (!world.isWalkable(cur.x + dx, cur.y, outsider) && !world.isWalkable(cur.x, cur.y + dy, outsider)) continue;
      }
      const ni = idx(nx, ny);
      if (closed.has(ni)) continue;
      const step = (dx !== 0 && dy !== 0) ? 1.414 : 1;
      const tentative = g + step;
      if (tentative < (gScore.has(ni) ? gScore.get(ni) : Infinity)) {
        gScore.set(ni, tentative);
        came.set(ni, { x: cur.x, y: cur.y });
        open.push({ x: nx, y: ny, f: tentative + heuristic(nx, ny) });
      }
    }
  }
  return null;
}

// Convenience: path to an exact tile. `outsider` (raiders, caravans) can't
// pass a locked door.
function pathTo(world, sx, sy, tx, ty, outsider = false) {
  return findPath(world, sx, sy,
    (x, y) => x === tx && y === ty,
    (x, y) => Math.hypot(x - tx, y - ty), { outsider });
}

// Path to any tile ADJACENT to (tx,ty) — used for mining/chopping/building.
function pathAdjacent(world, sx, sy, tx, ty, outsider = false) {
  return findPath(world, sx, sy,
    (x, y) => Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1 && !(x === tx && y === ty),
    (x, y) => Math.hypot(x - tx, y - ty), { outsider });
}
