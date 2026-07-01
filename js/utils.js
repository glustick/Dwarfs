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

// Dwarven name generator.
const DWARF_FIRST = ["Urist", "Dodok", "Kadol", "Litast", "Zulban", "Mafol", "Sibrek",
  "Tholtig", "Athel", "Bomrek", "Cog", "Deler", "Erush", "Feb", "Goden", "Ingish",
  "Kib", "Logem", "Meng", "Nil", "Onol", "Rovod", "Solon", "Tosid", "Vabok"];
const DWARF_LAST = ["Bandshield", "Ironbeard", "Goldbeard", "Stonefist", "Rockseeker",
  "Anviltoe", "Deepdelver", "Gemcutter", "Coalheart", "Boulderborn", "Steelhelm",
  "Copperbraid", "Mithrilvein", "Craghand", "Emberforge", "Granitewill"];

function dwarfName(rng) {
  return choice(rng, DWARF_FIRST) + " " + choice(rng, DWARF_LAST);
}

const DWARF_COLORS = ["#d84c3e", "#e0913a", "#4c9be0", "#5cb85c", "#b06ec9",
  "#e0c34c", "#3ec9c0", "#e07ab0", "#8a9c3e", "#c98a4c"];
