// ---- Small utilities & seeded RNG -------------------------------------------

// Mulberry32 seeded PRNG for reproducible worlds.
function makeRNG(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const manhattan = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

function choice(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function randint(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

// Deterministic "chemistry" for a pair of ids: always the same value for the
// same two ids (order doesn't matter), so some pairs just naturally hit it
// off (positive) while others always clash (negative) — no hidden RNG jitter.
function pairChemistry(idA, idB) {
  const key = idA < idB ? idA + "|" + idB : idB + "|" + idA;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return ((h >>> 0) % 2001 - 1000) / 1000; // -1..1
}

// Lightweight value-noise for terrain — smooth, tileable-ish blobs.
function makeNoise(rng) {
  const size = 256;
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x, y) => grid[((y & (size - 1)) * size) + (x & (size - 1))];
  const smooth = (t) => t * t * (3 - 2 * t);
  // fractal (fBm) sampling
  return function (x, y, scale, octaves = 4) {
    let amp = 1, freq = 1 / scale, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const sx = x * freq, sy = y * freq;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = smooth(sx - x0), fy = smooth(sy - y0);
      const v00 = at(x0, y0), v10 = at(x0 + 1, y0);
      const v01 = at(x0, y0 + 1), v11 = at(x0 + 1, y0 + 1);
      const top = lerp(v00, v10, fx), bot = lerp(v01, v11, fx);
      sum += lerp(top, bot, fy) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}

// Elven name generator.
const DWARF_FIRST = ["Aelar", "Caelynn", "Elenwe", "Faelar", "Galinn", "Ithil", "Laurel",
  "Melian", "Nuvia", "Orophin", "Rumil", "Saelwin", "Thalind", "Vanya", "Aerin",
  "Celeborn", "Nimrodel", "Silinde", "Eluvia", "Faenor", "Lorien", "Maethor", "Sylvaen"];
const DWARF_LAST = ["Moonwhisper", "Silverleaf", "Nightbreeze", "Dawnstar", "Swiftarrow",
  "Greenbough", "Starcaller", "Windrunner", "Everdusk", "Willowsong", "Thornwood",
  "Brightwater", "Mistwalker", "Sunweaver", "Elmshade", "Dewpetal"];

function dwarfName(rng) {
  return choice(rng, DWARF_FIRST) + " " + choice(rng, DWARF_LAST);
}

const DWARF_COLORS = ["#4c9be0", "#5cb85c", "#3ec9c0", "#8a9c3e", "#b06ec9",
  "#e0c34c", "#7ad0a0", "#e07ab0", "#5cae6e", "#c9b84c"];
