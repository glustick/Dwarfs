// ---- Renderer: draws the world with canvas sprites --------------------------

const BASE_TS = 22; // base tile size in px

// Tint / border / glyph for each zone type.
const ZONE_STYLE = {
  bedroom:  { fill: "rgba(90,140,220,0.14)",  stroke: "rgba(120,170,240,0.45)", glyph: "" },
  dining:   { fill: "rgba(220,150,60,0.13)",  stroke: "rgba(230,170,80,0.40)",  glyph: "" },
  farm:     { fill: "rgba(120,190,70,0.16)",  stroke: "rgba(150,210,90,0.50)",  glyph: "" },
  study:    { fill: "rgba(150,110,220,0.15)", stroke: "rgba(180,150,240,0.50)", glyph: "📖" },
  hospital: { fill: "rgba(220,80,80,0.13)",   stroke: "rgba(240,120,120,0.50)", glyph: "✚" },
  trade:    { fill: "rgba(210,120,220,0.15)", stroke: "rgba(230,150,240,0.50)", glyph: "🐎" },
  quarantine: { fill: "rgba(120,40,60,0.16)", stroke: "rgba(170,60,90,0.50)",   glyph: "⛓️" },
};

// Colors for the buildable materials (wall/floor/door/furniture).
const MATERIAL_PALETTE = {
  wood:   { base: "#7a4f34", dark: "#5a3823", light: "#8a5f34" },
  stone:  { base: "#7a7570", dark: "#5a564f", light: "#928c82" },
  marble: { base: "#e8e2d8", dark: "#c9c2b4", light: "#f7f3ea" },
  metal:  { base: "#7a828c", dark: "#565c64", light: "#a4acb6" },
};
function matPalette(material) { return MATERIAL_PALETTE[material] || MATERIAL_PALETTE.stone; }

class Renderer {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.dpr = dpr;
  }

  get ts() { return BASE_TS * this.game.cam.zoom; }

  worldToScreen(wx, wy) {
    const ts = this.ts;
    const ox = this.canvas.width / 2 - this.game.cam.x * ts;
    const oy = this.canvas.height / 2 - this.game.cam.y * ts;
    return { x: wx * ts + ox, y: wy * ts + oy };
  }

  screenToWorld(sx, sy) {
    const ts = this.ts;
    const px = sx * this.dpr, py = sy * this.dpr;
    const ox = this.canvas.width / 2 - this.game.cam.x * ts;
    const oy = this.canvas.height / 2 - this.game.cam.y * ts;
    return { x: (px - ox) / ts, y: (py - oy) / ts };
  }

  draw() {
    const ctx = this.ctx, g = this.game, w = g.world;
    const ts = this.ts;
    const ox = this.canvas.width / 2 - g.cam.x * ts;
    const oy = this.canvas.height / 2 - g.cam.y * ts;
    const viewZ = g.viewZ || 0;
    const tiles = w.getLevel(viewZ) || w.tiles;

    // background (deep earth)
    ctx.fillStyle = "#0a0806";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const x0 = Math.max(0, Math.floor(-ox / ts));
    const y0 = Math.max(0, Math.floor(-oy / ts));
    const x1 = Math.min(w.w - 1, Math.ceil((this.canvas.width - ox) / ts));
    const y1 = Math.min(w.h - 1, Math.ceil((this.canvas.height - oy) / ts));

    // 1) terrain
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.drawTile(ctx, tiles[y][x], x * ts + ox, y * ts + oy, ts, x, y);
      }
    }

    // 2) designations & zones
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = tiles[y][x];
        if (t.zone) this.drawZone(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.stockpile) this.drawStockpile(ctx, x * ts + ox, y * ts + oy, ts, t.stockpileFilter);
        if (t.furniture) this.drawFurniture(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.workshop) this.drawWorkshop(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.conduit) this.drawConduit(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.designation) this.drawDesignation(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.buildJob) this.drawBuildGhost(ctx, t, x * ts + ox, y * ts + oy, ts);
      }
    }

    // 3) items (only those on the floor currently being viewed)
    for (const it of g.items) {
      if (it.hauled || (it.z || 0) !== viewZ) continue;
      if (it.x < x0 - 1 || it.x > x1 + 1 || it.y < y0 - 1 || it.y > y1 + 1) continue;
      this.drawItem(ctx, it, it.x * ts + ox, it.y * ts + oy, ts);
    }

    // 3b) wildlife & tamed companions — foxes stay surface-only by spawn
    // logic (trySpawnAnimal never places one underground), but this filters
    // by actual z like dwarves below rather than hardcoding viewZ===0.
    for (const a of g.animals) {
      if ((a.z || 0) !== viewZ) continue;
      this.drawAnimal(ctx, a, ox, oy, ts);
    }

    // 4) dwarves (only those on the floor currently being viewed)
    for (const d of g.dwarves) {
      if ((d.z || 0) !== viewZ) continue;
      this.drawDwarf(ctx, d, ox, oy, ts);
    }

    // 4b) enemies — can now be underground (raids may follow a stairwell
    // down), so this filters by the enemy's own z instead of hardcoding
    // viewZ===0.
    for (const e of g.enemies) {
      if (e.hp <= 0 || (e.z || 0) !== viewZ) continue;
      this.drawEnemy(ctx, e, ox, oy, ts);
    }

    // 4c) caravans stay surface-only by spawn logic (trySpawnCaravan never
    // places one underground) — filtered by z for the same consistency as above.
    for (const car of g.caravans) {
      if ((car.z || 0) !== viewZ) continue;
      this.drawCaravan(ctx, car, ox, oy, ts);
    }

    // 4d) projectile streaks (arrows out, bile back) then combat sparks
    for (const fx of g.projectileFx) {
      if ((fx.z || 0) !== viewZ) continue;
      const x1 = (fx.x1 + 0.5) * ts + ox, y1 = (fx.y1 + 0.5) * ts + oy;
      const x2 = (fx.x2 + 0.5) * ts + ox, y2 = (fx.y2 + 0.5) * ts + oy;
      const a = clamp(fx.t / 0.18, 0, 1);
      const mid = 1 - a; // streak head travels from shooter to target
      const hx = x1 + (x2 - x1) * mid, hy = y1 + (y2 - y1) * mid - ts * 0.25;
      ctx.strokeStyle = fx.bad
        ? `rgba(154,190,58,${a * 0.9})`
        : `rgba(240,220,150,${a * 0.9})`;
      ctx.lineWidth = Math.max(1.5, ts * 0.09);
      ctx.beginPath();
      ctx.moveTo(hx - (x2 - x1) * 0.16, hy - (y2 - y1) * 0.16 + ts * 0.25);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    }
    for (const fx of g.combatFx) {
      const fcx = (fx.x + 0.5) * ts + ox, fcy = (fx.y + 0.3) * ts + oy;
      const a = clamp(fx.t / 0.3, 0, 1);
      ctx.fillStyle = fx.bad ? `rgba(230,70,60,${a})` : `rgba(255,230,120,${a})`;
      ctx.font = `bold ${Math.floor(ts * 0.5)}px serif`;
      ctx.textAlign = "center";
      ctx.fillText("✳", fcx, fcy - (1 - a) * ts * 0.4);
      ctx.textAlign = "start";
    }

    // 5) selection + drag rectangle
    this.drawSelection(ctx, ox, oy, ts);

    // 6) day/night tint
    this.drawDayNight(ctx);

    // 6b) weather overlay (surface-only)
    this.drawWeather(ctx);

    // 7) minimap overlay
    this.drawMinimap(ctx, x0, y0, x1, y1);
  }

  // -- minimap ---------------------------------------------------------------
  get miniRect() {
    const w = this.game.world;
    const mw = 180, mh = Math.round(180 * w.h / w.w);
    const pad = 14 * this.dpr;
    const x = this.canvas.width - mw * this.dpr - pad;
    const y = this.canvas.height - mh * this.dpr - pad;
    return { x, y, w: mw * this.dpr, h: mh * this.dpr };
  }

  // Each floor gets its own cached texture, keyed by z, since they show
  // completely different terrain.
  buildMinimapTexture(z) {
    const w = this.game.world;
    const tiles = w.getLevel(z);
    if (!tiles) return null;
    if (!this._miniByZ) this._miniByZ = new Map();
    let entry = this._miniByZ.get(z);
    if (!entry) {
      const canvas = document.createElement("canvas");
      canvas.width = w.w; canvas.height = w.h;
      entry = { canvas, ctx: canvas.getContext("2d"), builtAt: 0 };
      this._miniByZ.set(z, entry);
    }
    const mctx = entry.ctx;
    const img = mctx.createImageData(w.w, w.h);
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = tiles[y][x];
        let r, gg, b;
        if (t.built === B.WALL) { r = 122; gg = 79; b = 52; }
        else if (t.built === B.STAIRS) { r = 200; gg = 170; b = 90; }
        else if (t.built === B.RAMP) { r = 150; gg = 165; b = 185; }
        else if (t.workshop || t.furniture) { r = 138; gg = 120; b = 90; }
        else if (t.kind === K.WATER) { r = 45; gg = 100; b = 160; }
        else if (t.kind === K.SAND) { r = 201; gg = 184; b = 120; }
        else if (t.kind === K.STONE) { r = 109; gg = 106; b = 100; }
        else if (t.kind === K.FLOOR) { r = 138; gg = 131; b = 120; }
        else if (t.kind === K.GRASS) { r = t.feature === F.TREE ? 40 : 74; gg = t.feature === F.TREE ? 90 : 122; b = 40; }
        else { r = 107; gg = 78; b = 46; } // soil
        const i = (y * w.w + x) * 4;
        img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      }
    }
    mctx.putImageData(img, 0, 0);
    entry.builtAt = performance.now();
    return entry;
  }

  drawMinimap(ctx, x0, y0, x1, y1) {
    const g = this.game, w = g.world;
    const z = g.viewZ || 0;
    let entry = this._miniByZ && this._miniByZ.get(z);
    if (!entry || performance.now() - entry.builtAt > 2000) entry = this.buildMinimapTexture(z);
    if (!entry) return;
    const r = this.miniRect;

    ctx.fillStyle = "rgba(10,8,6,0.75)";
    ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(entry.canvas, 0, 0, w.w, w.h, r.x, r.y, r.w, r.h);
    ctx.imageSmoothingEnabled = true;

    const sx = r.w / w.w, sy = r.h / w.h;
    // viewport rectangle
    ctx.strokeStyle = "#ffcf6b"; ctx.lineWidth = Math.max(1, this.dpr);
    ctx.strokeRect(r.x + x0 * sx, r.y + y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy);
    // dwarves on this floor
    for (const d of g.dwarves) {
      if ((d.z || 0) !== z) continue;
      ctx.fillStyle = d.color;
      ctx.fillRect(r.x + d.x * sx - 1, r.y + d.y * sy - 1, 2, 2);
    }
    // enemies on this floor — can now be underground
    ctx.fillStyle = "#e0553a";
    for (const e of g.enemies) {
      if (e.hp <= 0 || (e.z || 0) !== z) continue;
      ctx.fillRect(r.x + e.x * sx - 1, r.y + e.y * sy - 1, 2, 2);
    }
    // wildlife (surface-only by spawn logic, filtered by z for consistency)
    ctx.fillStyle = "#d8964a";
    for (const a of g.animals) {
      if ((a.z || 0) !== z) continue;
      ctx.fillRect(r.x + a.x * sx - 1, r.y + a.y * sy - 1, 2, 2);
    }
    ctx.strokeStyle = "rgba(180,150,100,0.6)"; ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }

  // -- terrain -------------------------------------------------------------
  drawTile(ctx, t, sx, sy, ts, gx, gy) {
    const s = Math.ceil(ts) + 1;
    let base;
    switch (t.kind) {
      case K.GRASS: base = "#4a7a34"; break;
      case K.SOIL: base = "#6b4e2e"; break;
      case K.SAND: base = "#c9b878"; break;
      case K.WATER: base = null; break;
      case K.STONE: base = "#6d6a64"; break;
      case K.FLOOR: base = (t.built === B.FLOOR && t.buildMaterial) ? matPalette(t.buildMaterial).base : "#8a8378"; break;
      default: base = "#333";
    }

    if (t.kind === K.WATER) {
      this.drawWater(ctx, sx, sy, s, gx, gy);
    } else {
      ctx.fillStyle = base;
      ctx.fillRect(sx, sy, s, s);
      // subtle per-tile texture using deterministic hash
      const h = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
      if (t.kind === K.GRASS) {
        ctx.fillStyle = (h & 1) ? "#548636" : "#43702f";
        const n = 3 + (h % 3);
        for (let i = 0; i < n; i++) {
          const rx = sx + ((h >> (i * 3)) % 100) / 100 * ts;
          const ry = sy + ((h >> (i * 3 + 2)) % 100) / 100 * ts;
          ctx.fillRect(rx, ry, Math.max(1, ts * 0.06), Math.max(1, ts * 0.12));
        }
      } else if (t.kind === K.SOIL) {
        ctx.fillStyle = (h & 2) ? "#75552f" : "#5e4527";
        ctx.fillRect(sx + (h % 6), sy + ((h >> 4) % 6), ts * 0.18, ts * 0.18);
      } else if (t.kind === K.SAND) {
        ctx.fillStyle = "#d6c78c";
        ctx.fillRect(sx + (h % 8), sy + ((h >> 3) % 8), ts * 0.1, ts * 0.1);
      }
    }

    if (t.kind === K.STONE && t.built === B.NONE) {
      this.drawStoneWall(ctx, t, sx, sy, s, gx, gy);
    }
    if (t.built === B.WALL) this.drawBrickWall(ctx, sx, sy, s, t.buildMaterial);
    if (t.built === B.DOOR) this.drawDoor(ctx, t, sx, sy, ts);
    if (t.kind === K.FLOOR || t.built === B.FLOOR) this.drawFloorGrid(ctx, sx, sy, ts);
    if (t.built === B.STAIRS) this.drawStairs(ctx, sx, sy, ts);
    else if (t.built === B.RAMP) this.drawRamp(ctx, sx, sy, ts);

    // features
    if (t.feature === F.TREE) this.drawTree(ctx, sx, sy, ts, t.growth, gx, gy);
    else if (t.feature === F.SAPLING) this.drawSapling(ctx, sx, sy, ts);
    else if (t.feature === F.BUSH) this.drawBush(ctx, sx, sy, ts);
    else if (t.feature === F.MUSHROOM) this.drawMushroom(ctx, sx, sy, ts);
    else if (t.feature === F.BOULDER) this.drawBoulder(ctx, sx, sy, ts);
    else if (t.feature === F.CROP) this.drawCrop(ctx, sx, sy, ts, t.growth);
  }

  drawWater(ctx, sx, sy, s, gx, gy) {
    const t = this.game.time;
    const wave = Math.sin(t * 1.5 + gx * 0.7 + gy * 0.5) * 0.5 + 0.5;
    const c1 = 40 + wave * 20;
    ctx.fillStyle = `rgb(${30 + wave * 10},${90 + wave * 20},${150 + c1})`;
    ctx.fillRect(sx, sy, s, s);
    ctx.fillStyle = `rgba(255,255,255,${0.06 + wave * 0.06})`;
    const yy = sy + (Math.sin(t * 2 + gx) * 0.2 + 0.4) * s;
    ctx.fillRect(sx, yy, s, Math.max(1, s * 0.12));
  }

  drawStoneWall(ctx, t, sx, sy, s, gx, gy) {
    // shaded solid rock
    ctx.fillStyle = "#5c5952";
    ctx.fillRect(sx, sy, s, s);
    ctx.fillStyle = "#767268";
    ctx.fillRect(sx, sy, s, Math.max(1, s * 0.16));
    ctx.fillStyle = "#47443e";
    ctx.fillRect(sx, sy + s * 0.84, s, Math.max(1, s * 0.16));
    // crack detail
    const h = ((gx * 12345) ^ (gy * 6789)) >>> 0;
    ctx.strokeStyle = "#3f3c36";
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(sx + (h % 100) / 100 * s, sy);
    ctx.lineTo(sx + ((h >> 3) % 100) / 100 * s, sy + s);
    ctx.stroke();
    // ore flecks
    if (t.ore) {
      ctx.fillStyle = ORE_COLOR[t.ore];
      for (let i = 0; i < 5; i++) {
        const rx = sx + ((h >> (i * 2)) % 100) / 100 * s * 0.8 + s * 0.1;
        const ry = sy + ((h >> (i * 2 + 1)) % 100) / 100 * s * 0.8 + s * 0.1;
        const r = Math.max(1, s * 0.07);
        ctx.beginPath(); ctx.arc(rx, ry, r, 0, 7); ctx.fill();
      }
    }
  }

  drawBrickWall(ctx, sx, sy, s, material) {
    const p = matPalette(material);
    ctx.fillStyle = p.base;
    ctx.fillRect(sx, sy, s, s);
    ctx.strokeStyle = p.dark;
    ctx.lineWidth = Math.max(1, s * 0.05);
    const rows = 3, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const y = sy + r * rh;
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + s, y); ctx.stroke();
      const off = (r % 2) ? s / 2 : 0;
      ctx.beginPath(); ctx.moveTo(sx + off, y); ctx.lineTo(sx + off, y + rh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + (off + s / 2) % s, y); ctx.lineTo(sx + (off + s / 2) % s, y + rh); ctx.stroke();
    }
    if (material === "metal") {
      // a subtle sheen across the top for a metallic read
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(sx, sy, s, s * 0.12);
    } else if (material === "marble") {
      // a couple of veins
      ctx.strokeStyle = "rgba(170,160,145,0.5)"; ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.beginPath(); ctx.moveTo(sx + s * 0.15, sy); ctx.lineTo(sx + s * 0.55, sy + s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + s * 0.7, sy + s * 0.2); ctx.lineTo(sx + s * 0.9, sy + s * 0.7); ctx.stroke();
    }
  }

  drawDoor(ctx, t, sx, sy, ts) {
    const p = matPalette(t.buildMaterial || "wood");
    const pad = ts * 0.12;
    ctx.fillStyle = t.doorLocked ? p.dark : p.base;
    ctx.fillRect(sx + pad, sy, ts - pad * 2, ts);
    ctx.strokeStyle = p.dark; ctx.lineWidth = Math.max(1, ts * 0.05);
    ctx.strokeRect(sx + pad, sy, ts - pad * 2, ts);
    ctx.fillStyle = "#e8d8a0";
    ctx.beginPath(); ctx.arc(sx + ts * 0.68, sy + ts * 0.5, ts * 0.05, 0, 7); ctx.fill();
    if (t.doorLocked) {
      ctx.font = `${Math.floor(ts * 0.4)}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🔒", sx + ts / 2, sy + ts * 0.24);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }
  }

  drawFloorGrid(ctx, sx, sy, ts) {
    ctx.strokeStyle = "rgba(0,0,0,0.13)";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, ts, ts);
  }

  drawStairs(ctx, sx, sy, ts) {
    const cx = sx + ts / 2, cy = sy + ts / 2, r = ts * 0.32;
    ctx.fillStyle = "rgba(20,16,10,0.5)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.strokeStyle = "#d8b56a"; ctx.lineWidth = Math.max(1, ts * 0.06);
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2.4;
      const rr = r * (i / 8);
      const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  // A ramp reads as a plain sloped cut — a diagonal wedge with a direction
  // arrow — distinct from the stairwell's spiral.
  drawRamp(ctx, sx, sy, ts) {
    ctx.fillStyle = "rgba(20,16,10,0.4)";
    ctx.fillRect(sx + ts * 0.15, sy + ts * 0.15, ts * 0.7, ts * 0.7);
    ctx.strokeStyle = "#8a9bb0"; ctx.lineWidth = Math.max(1, ts * 0.06);
    ctx.beginPath();
    ctx.moveTo(sx + ts * 0.2, sy + ts * 0.8);
    ctx.lineTo(sx + ts * 0.8, sy + ts * 0.2);
    ctx.moveTo(sx + ts * 0.8, sy + ts * 0.2);
    ctx.lineTo(sx + ts * 0.6, sy + ts * 0.24);
    ctx.moveTo(sx + ts * 0.8, sy + ts * 0.2);
    ctx.lineTo(sx + ts * 0.76, sy + ts * 0.4);
    ctx.stroke();
  }

  // -- features ------------------------------------------------------------
  drawTree(ctx, sx, sy, ts, growth, gx, gy) {
    const cx = sx + ts / 2, cy = sy + ts / 2;
    const scale = 0.55 + growth * 0.45;
    // trunk
    ctx.fillStyle = "#5a3a1e";
    ctx.fillRect(cx - ts * 0.06, cy, ts * 0.12, ts * 0.4 * scale);
    // canopy (layered circles)
    const r = ts * 0.34 * scale;
    const greens = ["#2f5e26", "#3c7330", "#4c8a3a"];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = greens[i];
      ctx.beginPath();
      ctx.arc(cx - r * 0.25 + i * r * 0.18, cy - ts * 0.12 - i * r * 0.12, r * (1 - i * 0.14), 0, 7);
      ctx.fill();
    }
  }

  drawSapling(ctx, sx, sy, ts) {
    const cx = sx + ts / 2, cy = sy + ts * 0.6;
    ctx.strokeStyle = "#6a4a24"; ctx.lineWidth = Math.max(1, ts * 0.06);
    ctx.beginPath(); ctx.moveTo(cx, cy + ts * 0.2); ctx.lineTo(cx, cy - ts * 0.05); ctx.stroke();
    ctx.fillStyle = "#5ca23e";
    ctx.beginPath(); ctx.arc(cx, cy - ts * 0.1, ts * 0.14, 0, 7); ctx.fill();
  }

  drawBush(ctx, sx, sy, ts) {
    const cx = sx + ts / 2, cy = sy + ts * 0.6;
    ctx.fillStyle = "#3f6e2c";
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx + (i - 1) * ts * 0.2, cy - (i === 1 ? ts * 0.1 : 0), ts * 0.16, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = "#c94040";
    ctx.beginPath(); ctx.arc(cx, cy - ts * 0.05, ts * 0.05, 0, 7); ctx.fill();
  }

  drawMushroom(ctx, sx, sy, ts) {
    const cx = sx + ts / 2, cy = sy + ts * 0.6;
    ctx.fillStyle = "#e8e0d0";
    ctx.fillRect(cx - ts * 0.05, cy - ts * 0.05, ts * 0.1, ts * 0.22);
    ctx.fillStyle = "#c0472e";
    ctx.beginPath(); ctx.ellipse(cx, cy - ts * 0.05, ts * 0.17, ts * 0.1, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#f0d8c8";
    ctx.beginPath(); ctx.arc(cx - ts * 0.05, cy - ts * 0.08, ts * 0.02, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ts * 0.05, cy - ts * 0.06, ts * 0.02, 0, 7); ctx.fill();
  }

  drawCrop(ctx, sx, sy, ts, growth) {
    const cx = sx + ts / 2, cy = sy + ts * 0.68;
    const ripe = growth >= 1;
    const h = ts * 0.4 * (0.25 + growth * 0.75);
    ctx.strokeStyle = ripe ? "#d8b84a" : "#4a8a3a";
    ctx.lineWidth = Math.max(1, ts * 0.05);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * ts * 0.12, cy);
      ctx.lineTo(cx + i * ts * 0.12 * 0.6, cy - h);
      ctx.stroke();
    }
    if (ripe) {
      ctx.fillStyle = "#e8cf6a";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.arc(cx + i * ts * 0.07, cy - h, ts * 0.07, 0, 7); ctx.fill();
      }
    }
  }

  drawBoulder(ctx, sx, sy, ts) {
    const cx = sx + ts / 2, cy = sy + ts * 0.55;
    ctx.fillStyle = "#807a70";
    ctx.beginPath(); ctx.arc(cx, cy, ts * 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = "#9a948a";
    ctx.beginPath(); ctx.arc(cx - ts * 0.08, cy - ts * 0.08, ts * 0.12, 0, 7); ctx.fill();
  }

  // -- overlays ------------------------------------------------------------
  drawStockpile(ctx, sx, sy, ts, filter) {
    ctx.fillStyle = "rgba(200,160,60,0.12)";
    ctx.fillRect(sx, sy, ts, ts);
    ctx.strokeStyle = "rgba(220,180,80,0.5)";
    ctx.setLineDash([Math.max(2, ts * 0.14), Math.max(2, ts * 0.1)]);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
    ctx.setLineDash([]);
    if (filter && ts > 14) {
      const cat = STOCKPILE_CATEGORIES.find(c => c.id === filter);
      if (cat) {
        ctx.globalAlpha = 0.55;
        ctx.font = `${Math.floor(ts * 0.4)}px serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(cat.icon, sx + ts * 0.78, sy + ts * 0.24);
        ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
        ctx.globalAlpha = 1;
      }
    }
  }

  drawDesignation(ctx, t, sx, sy, ts) {
    const pulse = 0.4 + Math.sin(this.game.time * 4) * 0.2;
    const colors = { dig: `rgba(230,150,40,${pulse})`, chop: `rgba(230,90,40,${pulse})`, gather: `rgba(90,200,90,${pulse})`, forest: `rgba(60,170,90,${pulse})`, stairsdown: `rgba(200,170,90,${pulse})`, rampdown: `rgba(150,165,190,${pulse})`, drain: `rgba(70,140,220,${pulse})` };
    ctx.fillStyle = colors[t.designation] || `rgba(255,255,255,${pulse})`;
    ctx.fillRect(sx, sy, ts, ts);
    ctx.strokeStyle = colors[t.designation];
    ctx.lineWidth = Math.max(1, ts * 0.08);
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
    // little icon glyph
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `${Math.floor(ts * 0.5)}px serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const glyph = { dig: "⛏", chop: "🪓", gather: "🌿", forest: "🌲", stairsdown: "🌀", rampdown: "⤵️", drain: "🪣" }[t.designation] || "";
    ctx.fillText(glyph, sx + ts / 2, sy + ts / 2 + 1);
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }

  drawBuildGhost(ctx, t, sx, sy, ts) {
    const pulse = 0.3 + Math.sin(this.game.time * 3) * 0.15;
    ctx.fillStyle = `rgba(120,180,240,${pulse})`;
    ctx.fillRect(sx, sy, ts, ts);
    ctx.strokeStyle = `rgba(150,200,255,0.7)`;
    ctx.setLineDash([Math.max(2, ts * 0.12), Math.max(2, ts * 0.1)]);
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
    ctx.setLineDash([]);
    const glyph = { wall: "🧱", floor: "▦", bed: "🛏", door: "🚪", well: "💧", brewery: "🍺", doublebed: "💞", painting: "🖼️", conduit: "🔗", generator: "🔮", icebox: "❄️" }[t.buildKind] || "🧱";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `${Math.floor(ts * 0.45)}px serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(glyph, sx + ts / 2, sy + ts / 2 + 1);
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }

  drawZone(ctx, t, sx, sy, ts) {
    const z = ZONE_STYLE[t.zone] || ZONE_STYLE.bedroom;
    ctx.fillStyle = z.fill;
    ctx.fillRect(sx, sy, ts, ts);
    ctx.strokeStyle = z.stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
    if (z.glyph && ts > 14) {
      ctx.globalAlpha = 0.5;
      ctx.font = `${Math.floor(ts * 0.5)}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(z.glyph, sx + ts / 2, sy + ts / 2 + 1);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
      ctx.globalAlpha = 1;
    }
  }

  drawFurniture(ctx, t, sx, sy, ts) {
    if (t.furniture === FURN.BED) this.drawBed(ctx, sx, sy, ts, false, t.buildMaterial);
    else if (t.furniture === FURN.DOUBLE_BED) this.drawBed(ctx, sx, sy, ts, true, t.buildMaterial);
    else if (t.furniture === FURN.TABLE) this.drawTable(ctx, sx, sy, ts, t.buildMaterial);
    else if (t.furniture === FURN.PAINTING) this.drawPainting(ctx, sx, sy, ts, t.buildMaterial);
    else if (t.furniture === FURN.GENERATOR) this.drawGenerator(ctx, sx, sy, ts);
    else if (t.furniture === FURN.ICEBOX) this.drawIcebox(ctx, sx, sy, ts, t.powered);
    else if (t.furniture === FURN.WATCHTOWER) this.drawWatchtower(ctx, sx, sy, ts);
    else if (t.furniture === FURN.TRAP) this.drawTrap(ctx, sx, sy, ts, t.trapCooldown);
  }

  // -- Essence Craft: power network furniture & wiring -----------------------
  drawGenerator(ctx, sx, sy, ts) {
    const cx = sx + ts * 0.5, cy = sy + ts * 0.6;
    const t = this.game.time, pulse = 0.5 + Math.sin(t * 3 + sx) * 0.5;
    const bob = Math.sin(t * 2 + sx) * ts * 0.03;
    // stone base
    ctx.fillStyle = "#4a4250";
    ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.16, ts * 0.28, ts * 0.12, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#2c2730"; ctx.lineWidth = Math.max(1, ts * 0.03);
    ctx.beginPath(); ctx.ellipse(cx, cy + ts * 0.16, ts * 0.28, ts * 0.12, 0, 0, 7); ctx.stroke();
    // floating crystal
    ctx.fillStyle = `rgba(150,110,240,${0.75 + pulse * 0.25})`;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ts * 0.34 + bob);
    ctx.lineTo(cx + ts * 0.15, cy - ts * 0.08 + bob);
    ctx.lineTo(cx, cy + ts * 0.12 + bob);
    ctx.lineTo(cx - ts * 0.15, cy - ts * 0.08 + bob);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(215,190,255,${0.5 + pulse * 0.4})`;
    ctx.beginPath(); ctx.arc(cx, cy - ts * 0.08 + bob, ts * 0.05, 0, 7); ctx.fill();
    // ambient sparkle motes
    for (let i = 0; i < 3; i++) {
      const a = t * 1.5 + i * 2.1;
      ctx.fillStyle = `rgba(200,170,255,${0.3 + 0.3 * Math.sin(a)})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * ts * 0.24, cy + Math.sin(a) * ts * 0.18 + bob, ts * 0.025, 0, 7); ctx.fill();
    }
  }

  drawIcebox(ctx, sx, sy, ts, powered) {
    const pad = ts * 0.16;
    const x = sx + pad, y = sy + pad, w = ts - pad * 2, h = ts - pad * 2;
    ctx.fillStyle = "#3a4550";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#22282e"; ctx.lineWidth = Math.max(1, ts * 0.04);
    ctx.strokeRect(x, y, w, h);
    const glow = powered ? 0.55 + Math.sin(this.game.time * 3) * 0.25 : 0.15;
    ctx.fillStyle = `rgba(140,210,240,${glow})`;
    ctx.fillRect(x + w * 0.15, y + h * 0.18, w * 0.7, h * 0.24);
    ctx.fillStyle = `rgba(220,240,255,${powered ? 0.6 : 0.3})`;
    ctx.fillRect(x + w * 0.15, y + h * 0.58, w * 0.7, h * 0.24);
    ctx.font = `${Math.floor(ts * 0.3)}px serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha = powered ? 1 : 0.45;
    ctx.fillText("❄️", sx + ts * 0.5, sy + ts * 0.24);
    ctx.globalAlpha = 1;
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }

  // -- defensive structures --------------------------------------------------
  drawWatchtower(ctx, sx, sy, ts) {
    const cx = sx + ts * 0.5;
    ctx.fillStyle = "#6a5f4a";
    ctx.beginPath();
    ctx.moveTo(cx - ts * 0.28, sy + ts * 0.92);
    ctx.lineTo(cx - ts * 0.14, sy + ts * 0.2);
    ctx.lineTo(cx + ts * 0.14, sy + ts * 0.2);
    ctx.lineTo(cx + ts * 0.28, sy + ts * 0.92);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#3a3222"; ctx.lineWidth = Math.max(1, ts * 0.03);
    ctx.stroke();
    // platform
    ctx.fillStyle = "#8a7a56";
    ctx.fillRect(cx - ts * 0.34, sy + ts * 0.12, ts * 0.68, ts * 0.12);
    ctx.strokeRect(cx - ts * 0.34, sy + ts * 0.12, ts * 0.68, ts * 0.12);
    // crenellations
    ctx.fillStyle = "#6a5f4a";
    for (const off of [-0.28, -0.08, 0.12]) ctx.fillRect(cx + off * ts, sy + ts * 0.04, ts * 0.1, ts * 0.1);
  }

  drawTrap(ctx, sx, sy, ts, cooldown) {
    const cx = sx + ts * 0.5, cy = sy + ts * 0.5, r = ts * 0.3;
    const armed = !cooldown || cooldown <= 0;
    ctx.fillStyle = armed ? "rgba(40,32,20,0.7)" : "rgba(60,50,40,0.4)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.strokeStyle = armed ? "#c9a25c" : "#6a5a44";
    ctx.lineWidth = Math.max(1, ts * 0.03);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
      ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      ctx.stroke();
    }
  }

  // Embedded wiring: a dim cross when dormant, a glowing lilac one once part
  // of a network that includes an Essence Well.
  drawConduit(ctx, t, sx, sy, ts) {
    const cx = sx + ts / 2, cy = sy + ts / 2;
    const on = t.powered;
    ctx.strokeStyle = on ? `rgba(180,140,255,${0.55 + Math.sin(this.game.time * 4) * 0.25})` : "rgba(120,110,130,0.35)";
    ctx.lineWidth = Math.max(1, ts * 0.08);
    ctx.beginPath(); ctx.moveTo(sx, cy); ctx.lineTo(sx + ts, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, sy); ctx.lineTo(cx, sy + ts); ctx.stroke();
    ctx.fillStyle = on ? "rgba(210,180,255,0.9)" : "rgba(150,140,160,0.5)";
    ctx.beginPath(); ctx.arc(cx, cy, ts * 0.08, 0, 7); ctx.fill();
  }

  drawTable(ctx, sx, sy, ts, material) {
    const p = matPalette(material || "wood");
    const pad = ts * 0.2;
    ctx.fillStyle = p.dark;
    ctx.fillRect(sx + pad, sy + pad, ts - pad * 2, ts - pad * 2);
    ctx.fillStyle = p.base;
    ctx.fillRect(sx + pad, sy + pad, ts - pad * 2, (ts - pad * 2) * 0.4);
    ctx.strokeStyle = p.dark; ctx.lineWidth = 1;
    ctx.strokeRect(sx + pad + 0.5, sy + pad + 0.5, ts - pad * 2 - 1, ts - pad * 2 - 1);
  }

  drawWorkshop(ctx, t, sx, sy, ts) {
    // stone platform
    const bg = { forge: "#4a4038", smelter: "#4a4340", well: "#3a4048", brewery: "#4a3d28", crafting: "#4a4638", weapons: "#403c48", clothing: "#493d4a", electronics: "#354b4d" }[t.workshop] || "#4a4340";
    ctx.fillStyle = bg;
    ctx.fillRect(sx + ts * 0.08, sy + ts * 0.08, ts * 0.84, ts * 0.84);
    ctx.strokeStyle = "#2a2420"; ctx.lineWidth = Math.max(1, ts * 0.05);
    ctx.strokeRect(sx + ts * 0.08, sy + ts * 0.08, ts * 0.84, ts * 0.84);
    const pulse = 0.5 + Math.sin(this.game.time * 5 + sx) * 0.5;
    if (t.workshop === "smelter") {
      ctx.fillStyle = `rgba(255,${120 + pulse * 90},40,0.85)`;
      ctx.beginPath();
      ctx.moveTo(sx + ts * 0.5, sy + ts * 0.28);
      ctx.lineTo(sx + ts * 0.36, sy + ts * 0.66);
      ctx.lineTo(sx + ts * 0.64, sy + ts * 0.66);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,235,120,${0.6 + pulse * 0.3})`;
      ctx.beginPath(); ctx.arc(sx + ts * 0.5, sy + ts * 0.55, ts * 0.1, 0, 7); ctx.fill();
    } else if (t.workshop === "forge") {
      // anvil
      ctx.fillStyle = "#20242a";
      ctx.fillRect(sx + ts * 0.3, sy + ts * 0.5, ts * 0.4, ts * 0.12);
      ctx.fillRect(sx + ts * 0.42, sy + ts * 0.4, ts * 0.16, ts * 0.14);
      ctx.fillStyle = `rgba(255,180,60,${0.4 + pulse * 0.5})`;
      ctx.beginPath(); ctx.arc(sx + ts * 0.62, sy + ts * 0.44, ts * 0.05, 0, 7); ctx.fill();
    } else if (t.workshop === "well") {
      const cx = sx + ts * 0.5, cy = sy + ts * 0.58;
      // roof
      ctx.fillStyle = "#7a4f2c";
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.3, sy + ts * 0.2); ctx.lineTo(cx, sy + ts * 0.06); ctx.lineTo(cx + ts * 0.3, sy + ts * 0.2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#5a3a1e"; ctx.lineWidth = Math.max(1, ts * 0.05);
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.22, sy + ts * 0.22); ctx.lineTo(cx - ts * 0.22, cy - ts * 0.1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + ts * 0.22, sy + ts * 0.22); ctx.lineTo(cx + ts * 0.22, cy - ts * 0.1); ctx.stroke();
      // stone rim + water
      ctx.fillStyle = "#8a8378";
      ctx.beginPath(); ctx.arc(cx, cy, ts * 0.27, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(80,${140 + pulse * 30},${170 + pulse * 30},0.9)`;
      ctx.beginPath(); ctx.arc(cx, cy, ts * 0.18, 0, 7); ctx.fill();
    } else if (t.workshop === "brewery") {
      const cx = sx + ts * 0.5, cy = sy + ts * 0.6;
      // barrel
      ctx.fillStyle = "#6a4a24";
      ctx.beginPath(); ctx.ellipse(cx, cy, ts * 0.3, ts * 0.26, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = "#3a2712"; ctx.lineWidth = Math.max(1, ts * 0.04);
      ctx.beginPath(); ctx.ellipse(cx, cy, ts * 0.3, ts * 0.26, 0, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.3, cy - ts * 0.09); ctx.lineTo(cx + ts * 0.3, cy - ts * 0.09); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.3, cy + ts * 0.09); ctx.lineTo(cx + ts * 0.3, cy + ts * 0.09); ctx.stroke();
      // bubbling glow
      ctx.fillStyle = `rgba(210,160,60,${0.5 + pulse * 0.3})`;
      ctx.beginPath(); ctx.arc(cx, cy - ts * 0.14, ts * 0.07, 0, 7); ctx.fill();
    } else if (t.workshop === "crafting" || t.workshop === "weapons" || t.workshop === "clothing" || t.workshop === "electronics") {
      const cx = sx + ts * 0.5, cy = sy + ts * 0.56;
      const accent = { crafting: "#c49b58", weapons: "#b7c9df", clothing: "#d18fc0", electronics: "#73d5d0" }[t.workshop];
      ctx.fillStyle = "#252b29";
      ctx.fillRect(sx + ts * 0.22, sy + ts * 0.44, ts * 0.56, ts * 0.28);
      ctx.fillStyle = accent;
      ctx.fillRect(sx + ts * 0.3, sy + ts * 0.31, ts * 0.4, ts * 0.12);
      ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, ts * 0.04);
      ctx.beginPath(); ctx.arc(cx, cy, ts * 0.16, 0, 7); ctx.stroke();
      if (t.workshop === "electronics") {
        ctx.fillStyle = `rgba(115,213,208,${0.35 + pulse * 0.35})`;
        ctx.fillRect(cx - ts * 0.08, sy + ts * 0.38, ts * 0.16, ts * 0.16);
        ctx.beginPath(); ctx.moveTo(cx - ts * 0.24, sy + ts * 0.46); ctx.lineTo(cx - ts * 0.08, sy + ts * 0.46); ctx.lineTo(cx + ts * 0.08, sy + ts * 0.62); ctx.lineTo(cx + ts * 0.24, sy + ts * 0.62); ctx.stroke();
      } else if (t.workshop === "weapons") {
        ctx.beginPath(); ctx.moveTo(cx - ts * 0.2, sy + ts * 0.25); ctx.lineTo(cx + ts * 0.2, sy + ts * 0.68); ctx.stroke();
      } else if (t.workshop === "clothing") {
        ctx.beginPath(); ctx.moveTo(cx - ts * 0.16, sy + ts * 0.26); ctx.lineTo(cx, sy + ts * 0.72); ctx.lineTo(cx + ts * 0.16, sy + ts * 0.26); ctx.stroke();
      }
    }
  }

  drawBed(ctx, sx, sy, ts, double = false, material = null) {
    const p = matPalette(material || "wood");
    const pad = ts * 0.14;
    const x = sx + pad, y = sy + pad, w = ts - pad * 2, h = ts - pad * 2;
    // frame
    ctx.fillStyle = p.base;
    ctx.fillRect(x, y, w, h);
    // mattress
    ctx.fillStyle = "#c9b8a0";
    ctx.fillRect(x + w * 0.12, y + h * 0.28, w * 0.76, h * 0.6);
    // pillow(s) — two side by side for a double bed
    ctx.fillStyle = "#eee4d2";
    if (double) {
      ctx.fillRect(x + w * 0.14, y + h * 0.12, w * 0.32, h * 0.2);
      ctx.fillRect(x + w * 0.54, y + h * 0.12, w * 0.32, h * 0.2);
    } else {
      ctx.fillRect(x + w * 0.16, y + h * 0.12, w * 0.68, h * 0.2);
    }
    // blanket band
    ctx.fillStyle = double ? "#7a3b5a" : "#9a5b4a";
    ctx.fillRect(x + w * 0.12, y + h * 0.62, w * 0.76, h * 0.26);
  }

  drawPainting(ctx, sx, sy, ts, material) {
    const p = matPalette(material || "wood");
    const pad = ts * 0.2;
    const x = sx + pad, y = sy + pad * 0.6, w = ts - pad * 2, h = ts * 0.55;
    ctx.fillStyle = p.dark;
    ctx.fillRect(x - ts * 0.03, y - ts * 0.03, w + ts * 0.06, h + ts * 0.06);
    ctx.fillStyle = "#cbb87a";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#4a7a5a";
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.35, y + h * 0.4); ctx.lineTo(x + w * 0.65, y + h * 0.75); ctx.lineTo(x + w, y + h * 0.25); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8cf6a";
    ctx.beginPath(); ctx.arc(x + w * 0.75, y + h * 0.25, ts * 0.06, 0, 7); ctx.fill();
  }

  // -- items ---------------------------------------------------------------
  drawItem(ctx, it, sx, sy, ts) {
    const cx = sx + ts / 2, cy = sy + ts * 0.62;
    if (it.kind === ITEM.WOOD) {
      ctx.fillStyle = "#8a5a2c";
      ctx.fillRect(cx - ts * 0.22, cy - ts * 0.06, ts * 0.44, ts * 0.13);
      ctx.fillStyle = "#c89a5c";
      ctx.beginPath(); ctx.arc(cx - ts * 0.22, cy, ts * 0.065, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + ts * 0.22, cy, ts * 0.065, 0, 7); ctx.fill();
    } else if (it.kind === ITEM.STONE) {
      ctx.fillStyle = "#9a948a";
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.16, cy + ts * 0.08);
      ctx.lineTo(cx - ts * 0.06, cy - ts * 0.12);
      ctx.lineTo(cx + ts * 0.14, cy - ts * 0.06);
      ctx.lineTo(cx + ts * 0.16, cy + ts * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#b8b2a6";
      ctx.beginPath(); ctx.arc(cx - ts * 0.02, cy - ts * 0.02, ts * 0.05, 0, 7); ctx.fill();
    } else if (it.kind === ITEM.MARBLE) {
      ctx.fillStyle = "#e8e2d8";
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.16, cy + ts * 0.08);
      ctx.lineTo(cx - ts * 0.05, cy - ts * 0.13);
      ctx.lineTo(cx + ts * 0.15, cy - ts * 0.05);
      ctx.lineTo(cx + ts * 0.16, cy + ts * 0.1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(170,160,145,0.6)"; ctx.lineWidth = Math.max(1, ts * 0.02);
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.08, cy); ctx.lineTo(cx + ts * 0.08, cy - ts * 0.08); ctx.stroke();
    } else if (it.kind === ITEM.ORE) {
      ctx.fillStyle = "#6b675e";
      ctx.beginPath(); ctx.arc(cx, cy, ts * 0.16, 0, 7); ctx.fill();
      ctx.fillStyle = ORE_COLOR[it.sub] || "#ffd34d";
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(cx + Math.cos(i * 1.7) * ts * 0.08, cy + Math.sin(i * 1.7) * ts * 0.08, ts * 0.04, 0, 7);
        ctx.fill();
      }
    } else if (it.kind === ITEM.FOOD) {
      const rot = 1 - (it.freshness != null ? it.freshness : 1); // 0 fresh .. 1 spoiled
      ctx.fillStyle = "#e8e0d0";
      ctx.fillRect(cx - ts * 0.04, cy - ts * 0.02, ts * 0.08, ts * 0.16);
      ctx.fillStyle = `rgb(${Math.round(192 - rot * 50)},${Math.round(71 - rot * 35)},${Math.round(46 - rot * 15)})`;
      ctx.beginPath(); ctx.ellipse(cx, cy - ts * 0.02, ts * 0.14, ts * 0.08, 0, Math.PI, 0); ctx.fill();
      if (rot > 0.5) {
        // visibly on the turn: a couple of dark rot specks
        ctx.fillStyle = `rgba(40,32,20,${(rot - 0.5) * 1.2})`;
        ctx.beginPath(); ctx.arc(cx - ts * 0.04, cy - ts * 0.02, ts * 0.02, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + ts * 0.05, cy - ts * 0.01, ts * 0.015, 0, 7); ctx.fill();
      }
    } else if (it.kind === ITEM.BAR) {
      const col = it.sub === "gold" ? "#ffd34d" : it.sub === "coal" ? "#4a4a4a" : "#c4cad2";
      ctx.fillStyle = col;
      ctx.fillRect(cx - ts * 0.16, cy - ts * 0.02, ts * 0.32, ts * 0.12);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(cx - ts * 0.16, cy - ts * 0.02, ts * 0.32, ts * 0.03);
    } else if (it.kind === ITEM.WEAPON && it.sub === "bow") {
      // an arc of pale wood with a string
      ctx.strokeStyle = "#a87c46"; ctx.lineWidth = Math.max(1.5, ts * 0.07);
      ctx.beginPath(); ctx.arc(cx - ts * 0.1, cy, ts * 0.2, -Math.PI * 0.42, Math.PI * 0.42); ctx.stroke();
      ctx.strokeStyle = "#e8e0cc"; ctx.lineWidth = Math.max(1, ts * 0.025);
      const bx = cx - ts * 0.1 + Math.cos(-Math.PI * 0.42) * ts * 0.2, by = cy + Math.sin(-Math.PI * 0.42) * ts * 0.2;
      const bx2 = cx - ts * 0.1 + Math.cos(Math.PI * 0.42) * ts * 0.2, by2 = cy + Math.sin(Math.PI * 0.42) * ts * 0.2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx2, by2); ctx.stroke();
    } else if (it.kind === ITEM.WEAPON) {
      ctx.strokeStyle = "#d8dde4"; ctx.lineWidth = Math.max(1.5, ts * 0.08);
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.12, cy + ts * 0.12); ctx.lineTo(cx + ts * 0.12, cy - ts * 0.16); ctx.stroke();
      ctx.strokeStyle = "#7a5a2c";
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.16, cy + ts * 0.06); ctx.lineTo(cx - ts * 0.06, cy + ts * 0.16); ctx.stroke();
    } else if (it.kind === ITEM.ARROW) {
      // a small fanned bundle of three fletched shafts
      for (let i = -1; i <= 1; i++) {
        const ax = cx + i * ts * 0.07, ay = cy + Math.abs(i) * ts * 0.03;
        ctx.strokeStyle = "#a87c46"; ctx.lineWidth = Math.max(1, ts * 0.03);
        ctx.beginPath(); ctx.moveTo(ax - ts * 0.09, ay + ts * 0.08); ctx.lineTo(ax + ts * 0.09, ay - ts * 0.1); ctx.stroke();
        ctx.strokeStyle = "#d8d0b8"; ctx.lineWidth = Math.max(1, ts * 0.025);
        ctx.beginPath(); ctx.moveTo(ax - ts * 0.09, ay + ts * 0.08); ctx.lineTo(ax - ts * 0.13, ay + ts * 0.04); ctx.stroke();
      }
    } else if (it.kind === ITEM.ARMOR) {
      ctx.fillStyle = "#8a94a0";
      ctx.beginPath();
      ctx.moveTo(cx, cy - ts * 0.16);
      ctx.lineTo(cx + ts * 0.14, cy - ts * 0.06);
      ctx.lineTo(cx, cy + ts * 0.16);
      ctx.lineTo(cx - ts * 0.14, cy - ts * 0.06);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#5a636e"; ctx.lineWidth = 1; ctx.stroke();
    } else if (it.kind === ITEM.WATER) {
      ctx.fillStyle = "#4a7a9a";
      ctx.beginPath();
      ctx.moveTo(cx, cy - ts * 0.16);
      ctx.quadraticCurveTo(cx + ts * 0.14, cy + ts * 0.02, cx, cy + ts * 0.14);
      ctx.quadraticCurveTo(cx - ts * 0.14, cy + ts * 0.02, cx, cy - ts * 0.16);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.arc(cx - ts * 0.03, cy, ts * 0.02, 0, 7); ctx.fill();
    } else if (it.kind === ITEM.ALE) {
      ctx.fillStyle = "#8a5a2c";
      ctx.fillRect(cx - ts * 0.12, cy - ts * 0.1, ts * 0.24, ts * 0.2);
      ctx.fillStyle = "#e8b84a";
      ctx.fillRect(cx - ts * 0.1, cy - ts * 0.08, ts * 0.2, ts * 0.08);
      ctx.strokeStyle = "#5a3a1e"; ctx.lineWidth = Math.max(1, ts * 0.03);
      ctx.beginPath(); ctx.moveTo(cx + ts * 0.12, cy - ts * 0.05); ctx.lineTo(cx + ts * 0.18, cy - ts * 0.05); ctx.lineTo(cx + ts * 0.18, cy + ts * 0.06); ctx.lineTo(cx + ts * 0.12, cy + ts * 0.06); ctx.stroke();
    } else if (it.kind === ITEM.WINE) {
      // a slender glass with a stem, deep red wine inside
      ctx.strokeStyle = "#c9c2b0"; ctx.lineWidth = Math.max(1, ts * 0.025);
      ctx.beginPath(); ctx.moveTo(cx, cy - ts * 0.02); ctx.lineTo(cx, cy + ts * 0.14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.06, cy + ts * 0.14); ctx.lineTo(cx + ts * 0.06, cy + ts * 0.14); ctx.stroke();
      ctx.fillStyle = "#6a1a2e";
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.09, cy - ts * 0.16);
      ctx.quadraticCurveTo(cx, cy - ts * 0.02, cx + ts * 0.09, cy - ts * 0.16);
      ctx.quadraticCurveTo(cx, cy - ts * 0.06, cx - ts * 0.09, cy - ts * 0.16);
      ctx.fill();
      ctx.strokeStyle = "#c9c2b0";
      ctx.beginPath();
      ctx.moveTo(cx - ts * 0.1, cy - ts * 0.17);
      ctx.quadraticCurveTo(cx, cy - ts * 0.01, cx + ts * 0.1, cy - ts * 0.17);
      ctx.stroke();
    }
  }

  // -- dwarves -------------------------------------------------------------
  drawDwarf(ctx, d, ox, oy, ts) {
    const moving = d.state === "goto" || d.state === "carry" || d.state === "wander";
    // Walking uses the distance-driven d.bob phase (see Dwarf.move); standing
    // still switches to a slow real-time phase so idle elves still breathe,
    // offset by their own bob value so a crowd doesn't breathe in unison.
    const phase = moving ? d.bob : this.game.time * 1.6 + d.bob;
    const bobSin = Math.sin(phase);
    const bobAmt = moving ? ts * 0.06 : ts * 0.015;
    const cx = (d.x + 0.5) * ts + ox;
    const cy = (d.y + 0.5) * ts + oy + bobSin * bobAmt;
    const r = ts * 0.30;

    // squash/stretch, anchored at the feet so the hop reads as leaving the
    // ground rather than the whole body sliding up and down
    const stretchAmt = moving ? 0.09 : 0.02;
    const groundY = cy + r;
    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(1 - bobSin * stretchAmt * 0.6, 1 + bobSin * stretchAmt);
    ctx.translate(-cx, -groundY);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.1, r * 0.9, r * 0.35, 0, 0, 7); ctx.fill();

    // walking feet, alternating — drawn under the tunic hem
    if (moving) {
      const step = ts * 0.09;
      ctx.fillStyle = "#2a2018";
      ctx.beginPath(); ctx.ellipse(cx - r * 0.28, cy + r * 1.06 + bobSin * step, r * 0.15, r * 0.1, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + r * 0.28, cy + r * 1.06 - bobSin * step, r * 0.15, r * 0.1, 0, 0, 7); ctx.fill();
    }

    // body (tunic)
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.7, cy + r);
    ctx.lineTo(cx - r * 0.5, cy - r * 0.1);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.1);
    ctx.lineTo(cx + r * 0.7, cy + r);
    ctx.closePath(); ctx.fill();

    // head
    ctx.fillStyle = "#e6c39a";
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.5, r * 0.55, 0, 7); ctx.fill();

    // pointed elf ears — the sprite's biggest tell of dwarf vs. elf
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r * 0.58);
    ctx.lineTo(cx - r * 0.86, cy - r * 0.74);
    ctx.lineTo(cx - r * 0.46, cy - r * 0.34);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.5, cy - r * 0.58);
    ctx.lineTo(cx + r * 0.86, cy - r * 0.74);
    ctx.lineTo(cx + r * 0.46, cy - r * 0.34);
    ctx.closePath(); ctx.fill();

    if (d.facingV === -1) {
      // walking away from camera: back of the head, hair covers it entirely,
      // no face — this is what actually reads as "turned around" at a glance
      ctx.fillStyle = "#4a3a26";
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.5, r * 0.56, 0, 7); ctx.fill();
      ctx.strokeStyle = "#3a2c1c"; ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.moveTo(cx, cy - r * 1.02); ctx.lineTo(cx, cy - r * 0.1); ctx.stroke();
    } else {
      // helmet / hair
      ctx.fillStyle = "#4a3a26";
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.62, r * 0.56, Math.PI, 0); ctx.fill();

      // eyes
      ctx.fillStyle = "#2a2018";
      const ex = d.facing * r * 0.12;
      ctx.beginPath(); ctx.arc(cx - r * 0.16 + ex, cy - r * 0.55, r * 0.07, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.16 + ex, cy - r * 0.55, r * 0.07, 0, 7); ctx.fill();
    }

    // carried item indicator
    if (d.carrying) {
      ctx.fillStyle = { wood: "#8a5a2c", stone: "#9a948a", marble: "#e8e2d8", ore: "#ffd34d", food: "#c0472e", bar: "#c4cad2", weapon: "#d8dde4", armor: "#8a94a0", water: "#4a7a9a", ale: "#e8b84a", wine: "#6a1a2e" }[d.carrying.kind] || "#fff";
      ctx.fillRect(cx + r * 0.5, cy - r * 0.3, r * 0.5, r * 0.5);
    }

    // equipped weapon (held) and armor (shield)
    if (d.weapon) {
      ctx.strokeStyle = "#e2e6ec"; ctx.lineWidth = Math.max(1, r * 0.18);
      const hx = cx + d.facing * r * 0.8;
      ctx.beginPath(); ctx.moveTo(hx, cy + r * 0.4); ctx.lineTo(hx, cy - r * 0.7); ctx.stroke();
    }
    if (d.armor) {
      ctx.fillStyle = "#8a94a0"; ctx.strokeStyle = "#5a636e"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx - d.facing * r * 0.7, cy + r * 0.15, r * 0.34, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.restore(); // end squash/stretch — HP bar and overlays below stay undistorted

    // HP bar when wounded
    if (d.hp < d.maxhp) {
      const bw = r * 1.6, frac = clamp(d.hp / d.maxhp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(cx - bw / 2, cy - r * 1.7, bw, r * 0.24);
      ctx.fillStyle = frac > 0.5 ? "#5cb85c" : frac > 0.25 ? "#e0b158" : "#e0553a";
      ctx.fillRect(cx - bw / 2, cy - r * 1.7, bw * frac, r * 0.24);
    }

    this.drawActivityBadge(ctx, d, cx, cy, r, ts);

    // fighting spark
    if (d.state === "fight") {
      const t = this.game.time;
      ctx.strokeStyle = `rgba(255,120,90,${0.6 + Math.sin(t * 24) * 0.4})`;
      ctx.lineWidth = Math.max(1.5, ts * 0.1);
      const a = t * 12;
      ctx.beginPath();
      ctx.moveTo(cx + d.facing * r, cy - r * 0.5);
      ctx.lineTo(cx + d.facing * (r * 1.7 + Math.sin(a) * r * 0.3), cy - r * 0.2);
      ctx.stroke();
    }

    // work animation — swing/strike/reach per job type, or a generic spark
    if (d.state === "work") this.drawWorkAnim(ctx, d, cx, cy, r, ts);
    if (d.state === "work" || d.state === "carry") this.drawActionSprite(ctx, d, cx, cy, r, ts);

    // sleeping: Zzz
    if (d.state === "sleep") {
      const t = this.game.time;
      ctx.fillStyle = `rgba(200,220,255,${0.6 + Math.sin(t * 2) * 0.3})`;
      ctx.font = `${Math.floor(ts * 0.42)}px serif`;
      ctx.textAlign = "center";
      ctx.fillText("z", cx + r * 0.9, cy - r * 1.1 - (Math.sin(t * 2) * ts * 0.06));
      ctx.font = `${Math.floor(ts * 0.3)}px serif`;
      ctx.fillText("z", cx + r * 1.4, cy - r * 1.5);
      ctx.textAlign = "start";
    }

    // resting to recover from a wound or an infection
    if (d.state === "recover") {
      const t = this.game.time;
      ctx.fillStyle = d.infected
        ? `rgba(120,210,120,${0.6 + Math.sin(t * 3) * 0.3})`
        : `rgba(230,110,110,${0.6 + Math.sin(t * 3) * 0.3})`;
      ctx.font = `${Math.floor(ts * 0.4)}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(d.infected ? "🧟" : "✚", cx + r * 0.9, cy - r * 1.1 - (Math.sin(t * 2) * ts * 0.06));
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    } else if (d.infected) {
      // still up and working, but visibly sickly
      const t = this.game.time;
      ctx.fillStyle = `rgba(120,210,120,${0.5 + Math.sin(t * 3) * 0.25})`;
      ctx.font = `${Math.floor(ts * 0.35)}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🧟", cx + r * 0.9, cy - r * 1.1);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }

    // selection ring — also lights up every soldier in a multi-select squad
    if (this.game.selectedDwarf === d || this.game.selectedSquad.includes(d)) {
      ctx.strokeStyle = "#ffcf6b";
      ctx.lineWidth = Math.max(1.5, ts * 0.06);
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, 7); ctx.stroke();
    }
    // a soldier holding a manual position order gets a small ground marker
    if (d.manualOrder && (d.manualOrder.z || 0) === (this.game.viewZ || 0)) {
      const mx = (d.manualOrder.x + 0.5) * ts + ox, my = (d.manualOrder.y + 0.5) * ts + oy;
      const pulse = 0.5 + Math.sin(this.game.time * 4) * 0.3;
      ctx.strokeStyle = `rgba(255,207,107,${pulse})`;
      ctx.lineWidth = Math.max(1, ts * 0.05);
      ctx.beginPath(); ctx.moveTo(mx - ts * 0.15, my); ctx.lineTo(mx + ts * 0.15, my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my - ts * 0.15); ctx.lineTo(mx, my + ts * 0.15); ctx.stroke();
    }
  }

  drawActivityBadge(ctx, d, cx, cy, r, ts) {
    const activities = {
      dig: ["⛏", "Mining", "#d5d9df"], chop: ["🪓", "Chopping", "#d6a76a"],
      gather: ["🌿", "Gathering", "#9fca8c"], harvest: ["🌾", "Harvesting", "#c9b45b"],
      plant: ["🌱", "Planting", "#9fca8c"], forest: ["🌲", "Foresting", "#72b879"],
      build: ["🧱", "Building", "#d3a86b"], craft: ["🔨", "Crafting", "#e0c47c"],
      haul: ["📦", "Hauling", "#b6c9d9"], doctor: ["⚕", "Doctoring", "#e58d78"],
      fight: ["⚔", "Fighting", "#ed806e"], equip: ["🛡", "Equipping", "#b7c9df"],
      train: ["⚔", "Training", "#c9d7e8"], socialize: ["💬", "Socializing", "#d9a9df"],
      eat: ["🍽", "Eating", "#b7d98d"], drink: ["💧", "Drinking", "#80c6e5"],
      sleep: ["💤", "Sleeping", "#aab4e3"], recover: ["✚", "Recovering", "#e58d78"],
      quarantine: ["⛓", "Quarantine", "#c78bd1"], tame: ["🐾", "Taming", "#d9a06e"],
    };
    let key = d.state === "fight" ? "fight" : d.state;
    if (!activities[key] && d.job) key = d.job.type;
    if (!activities[key]) return;
    const [icon, label, color] = activities[key];
    const text = `${icon} ${label}`;
    ctx.save();
    ctx.font = `600 ${Math.max(9, Math.floor(ts * 0.16))}px "Avenir Next", sans-serif`;
    const width = ctx.measureText(text).width + ts * 0.22;
    const height = Math.max(14, ts * 0.24);
    const x = cx - width / 2, y = cy - r * 2.05 - height;
    ctx.fillStyle = "rgba(10, 18, 14, .88)";
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, ts * 0.025);
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, height * 0.45);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, cx, y + height / 2 + 0.5);
    ctx.restore();
  }

  drawActionSprite(ctx, d, cx, cy, r, ts) {
    const jt = d.job ? d.job.type : null;
    const side = d.facing * r * 1.12;
    const handX = cx + side, handY = cy + r * 0.05;
    const scale = Math.max(1, ts * 0.045);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.5, scale * 1.7);

    if (jt === "dig" || jt === "stairsdown" || jt === "rampdown" || jt === "drain") {
      // Pickaxe: a crossed head makes mining unmistakable at map scale.
      ctx.strokeStyle = "#d4d9df";
      ctx.beginPath(); ctx.moveTo(handX - side * 0.25, handY - r * 0.9); ctx.lineTo(handX + side * 0.2, handY + r * 0.65); ctx.stroke();
      ctx.lineWidth = Math.max(2, scale * 2.5);
      ctx.beginPath(); ctx.moveTo(handX - side * 0.42, handY - r * 0.72); ctx.lineTo(handX + side * 0.42, handY - r * 0.72); ctx.stroke();
    } else if (jt === "chop") {
      // Axe: wooden haft with a bright metal wedge.
      ctx.strokeStyle = "#8d6039";
      ctx.beginPath(); ctx.moveTo(handX - side * 0.15, handY + r * 0.55); ctx.lineTo(handX + side * 0.18, handY - r * 0.78); ctx.stroke();
      ctx.fillStyle = "#c9d1d9";
      ctx.beginPath(); ctx.moveTo(handX + side * 0.05, handY - r * 0.85); ctx.lineTo(handX + side * 0.48, handY - r * 0.62); ctx.lineTo(handX + side * 0.12, handY - r * 0.35); ctx.closePath(); ctx.fill();
    } else if (jt === "build" || jt === "craft") {
      // Hammer and workpiece: a solid head over a small amber block.
      ctx.strokeStyle = "#8d6039";
      ctx.beginPath(); ctx.moveTo(handX, handY + r * 0.45); ctx.lineTo(handX, handY - r * 0.58); ctx.stroke();
      ctx.fillStyle = "#c7d0d7";
      ctx.fillRect(handX - r * 0.28, handY - r * 0.72, r * 0.56, r * 0.2);
      ctx.fillStyle = "#d6a85d";
      ctx.fillRect(handX - r * 0.22, handY + r * 0.32, r * 0.44, r * 0.25);
    } else if (jt === "haul") {
      // A visible carried crate, separate from the tiny item-color marker.
      ctx.fillStyle = "#b27a42";
      ctx.fillRect(handX - r * 0.32, handY - r * 0.12, r * 0.64, r * 0.58);
      ctx.strokeStyle = "#f0c477";
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeRect(handX - r * 0.32, handY - r * 0.12, r * 0.64, r * 0.58);
      ctx.beginPath(); ctx.moveTo(handX - r * 0.25, handY + r * 0.17); ctx.lineTo(handX + r * 0.25, handY + r * 0.17); ctx.stroke();
    } else if (jt === "gather" || jt === "harvest" || jt === "plant" || jt === "forest") {
      // Leafy sprig / seedling held low to the ground.
      ctx.strokeStyle = "#6f9f61";
      ctx.beginPath(); ctx.moveTo(handX, handY + r * 0.42); ctx.lineTo(handX, handY - r * 0.42); ctx.stroke();
      ctx.fillStyle = "#a8d47e";
      ctx.beginPath(); ctx.ellipse(handX - r * 0.2, handY - r * 0.24, r * 0.22, r * 0.1, -0.5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(handX + r * 0.2, handY - r * 0.02, r * 0.22, r * 0.1, 0.5, 0, 7); ctx.fill();
    } else if (jt === "doctor") {
      // Medical cross held forward.
      ctx.strokeStyle = "#f1a29a";
      ctx.lineWidth = Math.max(2, scale * 2.2);
      ctx.beginPath(); ctx.moveTo(handX, handY - r * 0.42); ctx.lineTo(handX, handY + r * 0.42); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(handX - r * 0.42, handY); ctx.lineTo(handX + r * 0.42, handY); ctx.stroke();
    } else if (jt === "train" || d.state === "fight" || jt === "equip") {
      // Blade silhouette for training, combat, and equipment work.
      ctx.strokeStyle = d.state === "fight" ? "#ff987f" : "#dce6ef";
      ctx.beginPath(); ctx.moveTo(handX - side * 0.18, handY + r * 0.48); ctx.lineTo(handX + side * 0.2, handY - r * 0.78); ctx.stroke();
      ctx.lineWidth = Math.max(2, scale * 2.2);
      ctx.beginPath(); ctx.moveTo(handX - side * 0.35, handY + r * 0.1); ctx.lineTo(handX + side * 0.1, handY + r * 0.1); ctx.stroke();
    }
    ctx.restore();
  }

  // Per-job work animations, grouped into a few archetypes so every tool-job
  // reads distinctly at a glance instead of one generic orbiting spark.
  drawWorkAnim(ctx, d, cx, cy, r, ts) {
    const t = this.game.time;
    const jt = d.job ? d.job.type : null;

    if (jt === "dig" || jt === "stairsdown" || jt === "chop" || jt === "forest" || jt === "train") {
      // a tool swings in a fast overhead-to-side arc
      const speed = jt === "chop" ? 7 : jt === "train" ? 9 : 6;
      const phase = (Math.sin(t * speed) + 1) / 2; // 0..1
      const ang = -0.9 + phase * 1.6;
      const hx = cx + d.facing * r * 0.75, hy = cy - r * 0.1;
      const tipx = hx + Math.cos(ang) * d.facing * r * 1.1, tipy = hy - Math.sin(ang) * r * 1.1 - r * 0.3;
      ctx.strokeStyle = jt === "chop" || jt === "forest" ? "#c9a25c" : jt === "train" ? "#d8dde4" : "#cfd3d8";
      ctx.lineWidth = Math.max(1.5, ts * 0.09);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tipx, tipy); ctx.stroke();
      if (phase > 0.85) { // impact flash at the bottom of the swing
        ctx.fillStyle = `rgba(255,230,150,${(phase - 0.85) / 0.15 * 0.8})`;
        ctx.beginPath(); ctx.arc(tipx, tipy, r * 0.12, 0, 7); ctx.fill();
      }
    } else if (jt === "build" || jt === "craft") {
      // a hammer strikes straight down, rhythmically
      const raw = (Math.sin(t * 5) + 1) / 2;
      const liftY = -r * 0.6 * (1 - raw);
      const hx = cx + d.facing * r * 0.55, baseY = cy - r * 0.1;
      ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = Math.max(1.5, ts * 0.08);
      ctx.beginPath(); ctx.moveTo(hx, baseY); ctx.lineTo(hx, baseY + liftY); ctx.stroke();
      ctx.fillStyle = "#5a4526";
      ctx.fillRect(hx - r * 0.14, baseY + liftY - r * 0.08, r * 0.28, r * 0.14);
      if (raw > 0.9) {
        ctx.fillStyle = `rgba(255,220,140,${(raw - 0.9) / 0.1 * 0.7})`;
        ctx.beginPath(); ctx.arc(hx, cy + r * 0.05, r * 0.14, 0, 7); ctx.fill();
      }
    } else if (jt === "gather" || jt === "harvest" || jt === "plant") {
      // stoop down toward the ground and back up
      const reach = r * 0.35 * (Math.sin(t * 3) + 1) / 2;
      ctx.strokeStyle = "#8fbf6a"; ctx.lineWidth = Math.max(1, ts * 0.06);
      ctx.beginPath();
      ctx.moveTo(cx + d.facing * r * 0.3, cy + r * 0.6);
      ctx.lineTo(cx + d.facing * r * 0.5, cy + r * 0.6 + reach);
      ctx.stroke();
    } else {
      // generic orbiting spark — doctor, eat, drink, socialize, equip, etc.
      const col = jt === "eat" ? "160,220,140" : jt === "socialize" ? "230,180,240" : jt === "doctor" ? "230,120,120" : "255,220,120";
      ctx.strokeStyle = `rgba(${col},${0.5 + Math.sin(t * 20) * 0.4})`;
      ctx.lineWidth = Math.max(1, ts * 0.08);
      const a = t * 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy - r + Math.sin(a) * r * 0.4);
      ctx.lineTo(cx + Math.cos(a) * r * 1.6, cy - r + Math.sin(a) * r * 0.4 - r * 0.5);
      ctx.stroke();
    }
  }

  drawEnemy(ctx, e, ox, oy, ts) {
    const moving = !!e.path;
    const bobSin = Math.sin(e.bob) * (moving ? 1 : 0);
    const cx = (e.x + 0.5) * ts + ox;
    const cy = (e.y + 0.5) * ts + oy + bobSin * ts * 0.05;
    const r = ts * 0.30;

    const stretchAmt = moving ? 0.08 : 0;
    const groundY = cy + r;
    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(1 - bobSin * stretchAmt * 0.6, 1 + bobSin * stretchAmt);
    ctx.translate(-cx, -groundY);

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.1, r * 0.9, r * 0.35, 0, 0, 7); ctx.fill();

    if (e.kind === "wolf") {
      // paws, alternating
      if (moving) {
        const step = ts * 0.06;
        ctx.fillStyle = "#2a2018";
        ctx.beginPath(); ctx.ellipse(cx - r * 0.5, cy + r * 0.5 + bobSin * step, r * 0.12, r * 0.09, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + r * 0.5, cy + r * 0.5 - bobSin * step, r * 0.12, r * 0.09, 0, 0, 7); ctx.fill();
      }
      // low four-legged body
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.2, r * 0.95, r * 0.5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + e.facing * r * 0.8, cy, r * 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = "#c94040"; // eye
      ctx.beginPath(); ctx.arc(cx + e.facing * r * 0.9, cy - r * 0.05, r * 0.08, 0, 7); ctx.fill();
    } else {
      // feet, alternating — drawn under the tunic hem
      if (moving) {
        const step = ts * 0.08;
        ctx.fillStyle = "#1a1512";
        ctx.beginPath(); ctx.ellipse(cx - r * 0.28, cy + r * 1.06 + bobSin * step, r * 0.15, r * 0.1, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + r * 0.28, cy + r * 1.06 - bobSin * step, r * 0.15, r * 0.1, 0, 0, 7); ctx.fill();
      }
      // humanoid raider
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy + r); ctx.lineTo(cx - r * 0.5, cy - r * 0.1);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.1); ctx.lineTo(cx + r * 0.7, cy + r);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = e.kind === "troll" ? "#8a7f9a" : "#6f8a48";
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.5, r * 0.55, 0, 7); ctx.fill();
      if (e.facingV !== -1) {
        // menacing eyes — hidden when facing away from the camera
        ctx.fillStyle = "#e03020";
        const ex = e.facing * r * 0.12;
        ctx.beginPath(); ctx.arc(cx - r * 0.18 + ex, cy - r * 0.55, r * 0.09, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + r * 0.18 + ex, cy - r * 0.55, r * 0.09, 0, 7); ctx.fill();
      }
      // crude weapon — except the Spitter, whose bulging bile sac replaces it
      if (e.kind === "spitter") {
        ctx.fillStyle = "#9ab43a";
        ctx.beginPath(); ctx.arc(cx + e.facing * r * 0.7, cy - r * 0.15, r * 0.34, 0, 7); ctx.fill();
        ctx.fillStyle = "#6a7f24";
        ctx.beginPath(); ctx.arc(cx + e.facing * r * 0.7, cy - r * 0.15, r * 0.18, 0, 7); ctx.fill();
      } else {
        ctx.strokeStyle = "#b0b6bc"; ctx.lineWidth = Math.max(1, r * 0.16);
        ctx.beginPath(); ctx.moveTo(cx + e.facing * r * 0.8, cy + r * 0.5); ctx.lineTo(cx + e.facing * r * 0.8, cy - r * 0.6); ctx.stroke();
      }
    }
    ctx.restore();

    // hp bar
    if (e.hp < e.maxhp) {
      const bw = r * 1.7, frac = clamp(e.hp / e.maxhp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(cx - bw / 2, cy - r * 1.7, bw, r * 0.24);
      ctx.fillStyle = "#e0553a";
      ctx.fillRect(cx - bw / 2, cy - r * 1.7, bw * frac, r * 0.24);
    }
  }

  drawCaravan(ctx, car, ox, oy, ts) {
    const bob = Math.sin(car.bob) * (car.path ? ts * 0.05 : 0);
    const cx = (car.x + 0.5) * ts + ox;
    const cy = (car.y + 0.5) * ts + oy + bob;
    const r = ts * 0.32;

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.15, r, r * 0.35, 0, 0, 7); ctx.fill();

    // wheels
    ctx.fillStyle = "#3a2e1c";
    ctx.beginPath(); ctx.arc(cx - r * 0.55, cy + r * 0.8, r * 0.28, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.55, cy + r * 0.8, r * 0.28, 0, 7); ctx.fill();

    // wagon bed
    ctx.fillStyle = "#7a5a34";
    ctx.fillRect(cx - r * 0.9, cy - r * 0.15, r * 1.8, r * 0.9);

    // canopy
    ctx.fillStyle = "rgba(224,212,180,0.9)";
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.1, r * 0.95, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.1, r * 0.95, Math.PI, 0); ctx.stroke();

    if (car.state === "trading") {
      ctx.font = `${Math.floor(ts * 0.4)}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🪙", cx, cy - r * 1.6);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }
  }

  drawSelection(ctx, ox, oy, ts) {
    const g = this.game;
    // hover / drag rectangle from input
    if (g.input && g.input.dragStart && g.input.dragCur) {
      const a = g.input.dragStart, b = g.input.dragCur;
      const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
      const maxX = Math.max(a.x, b.x), maxY = Math.max(a.y, b.y);
      const sx = minX * ts + ox, sy = minY * ts + oy;
      ctx.fillStyle = "rgba(255,207,107,0.15)";
      ctx.fillRect(sx, sy, (maxX - minX + 1) * ts, (maxY - minY + 1) * ts);
      ctx.strokeStyle = "#ffcf6b";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 0.5, sy + 0.5, (maxX - minX + 1) * ts, (maxY - minY + 1) * ts);
    }
    // selected tile
    if (g.selectedTile) {
      const sx = g.selectedTile.x * ts + ox, sy = g.selectedTile.y * ts + oy;
      ctx.strokeStyle = "#ffe9a8";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
    }
  }

  drawDayNight(ctx) {
    // day fraction 0..1 (0.5 = noon)
    const f = this.game.dayFraction();
    // brightness: darkest at 0/1 (midnight), brightest at 0.5 (noon)
    const night = Math.max(0, Math.cos((f - 0.5) * Math.PI * 2) * -0.5 + 0.5); // 0 noon .. 1 midnight-ish
    const dark = clamp(night * 0.6, 0, 0.6);
    if (dark > 0.02) {
      ctx.fillStyle = `rgba(10,14,40,${dark})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // -- weather (surface-only screen overlay) --------------------------------
  drawWeather(ctx) {
    const g = this.game;
    if ((g.viewZ || 0) !== 0) return; // weather never reaches underground
    const wthr = g.weather;
    if (!wthr || wthr === "clear") return;
    const w = this.canvas.width, h = this.canvas.height, t = g.time;

    if (wthr === "rain" || wthr === "storm") {
      if (wthr === "storm") { ctx.fillStyle = "rgba(16,18,32,0.22)"; ctx.fillRect(0, 0, w, h); }
      ctx.strokeStyle = wthr === "storm" ? "rgba(180,200,230,0.35)" : "rgba(180,200,230,0.2)";
      ctx.lineWidth = Math.max(1, this.dpr);
      const len = 16 * this.dpr, n = 130;
      for (let i = 0; i < n; i++) {
        const seed = i * 97.13;
        const x = ((seed * 53 + t * 280) % (w + len * 2)) - len;
        const y = ((seed * 71 + t * 420) % (h + len * 2)) - len;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * 0.3, y + len); ctx.stroke();
      }
      if (wthr === "storm") {
        const flash = (Math.sin(t * 0.6) * 0.5 + 0.5) > 0.985 ? 0.3 : 0;
        if (flash) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, w, h); }
      }
    } else if (wthr === "blizzard") {
      ctx.fillStyle = "rgba(200,220,240,0.10)"; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      const n = 100;
      for (let i = 0; i < n; i++) {
        const seed = i * 133.7;
        const x = ((seed * 43 + t * 40 + Math.sin(t + i) * 24) % (w + 20)) - 10;
        const y = ((seed * 61 + t * 130) % (h + 20)) - 10;
        const r = (1 + (i % 3)) * this.dpr;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
    } else if (wthr === "fog") {
      ctx.fillStyle = `rgba(200,200,200,${0.14 + Math.sin(t * 0.3) * 0.03})`;
      ctx.fillRect(0, 0, w, h);
    } else if (wthr === "heatwave") {
      ctx.fillStyle = "rgba(230,140,40,0.08)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  // -- wildlife & tamed companions ------------------------------------------
  drawAnimal(ctx, a, ox, oy, ts) {
    const moving = !!a.path;
    const bobSin = Math.sin(a.bob) * (moving ? 1 : 0);
    const cx = (a.x + 0.5) * ts + ox, cy = (a.y + 0.5) * ts + oy + bobSin * ts * 0.05;
    const r = ts * 0.22;
    const info = ANIMAL_TYPES[a.kind] || ANIMAL_TYPES.fox;

    const stretchAmt = moving ? 0.08 : 0;
    const groundY = cy + r * 0.6;
    ctx.save();
    ctx.translate(cx, groundY);
    ctx.scale(1 - bobSin * stretchAmt * 0.6, 1 + bobSin * stretchAmt);
    ctx.translate(-cx, -groundY);

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r, r * 0.9, r * 0.3, 0, 0, 7); ctx.fill();

    // paws, alternating
    if (moving) {
      const step = ts * 0.045;
      ctx.fillStyle = "#2a2018";
      ctx.beginPath(); ctx.ellipse(cx - r * 0.4, cy + r * 0.68 + bobSin * step, r * 0.13, r * 0.09, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + r * 0.4, cy + r * 0.68 - bobSin * step, r * 0.13, r * 0.09, 0, 0, 7); ctx.fill();
    }

    const body = a.tamed ? info.color : "#8a7560"; // wild ones read duller until tamed
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + a.facing * r * 0.9, cy - r * 0.25, r * 0.5, 0, 7); ctx.fill();
    // ears
    ctx.beginPath();
    ctx.moveTo(cx + a.facing * r * 0.55, cy - r * 0.6);
    ctx.lineTo(cx + a.facing * r * 0.75, cy - r * 1.1);
    ctx.lineTo(cx + a.facing * r * 1.0, cy - r * 0.55);
    ctx.closePath(); ctx.fill();
    // tail — wags briskly on the move, lazily at rest
    const wagSpeed = moving ? 9 : 2.5;
    const wag = Math.sin(this.game.time * wagSpeed + a.bob) * 0.25;
    ctx.beginPath();
    ctx.ellipse(cx - a.facing * r * 0.9, cy, r * 0.5, r * 0.2, (a.facing > 0 ? 0.4 : -0.4) + wag, 0, 7);
    ctx.fill();

    if (a.tamed) {
      ctx.font = `${Math.floor(ts * 0.28)}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🐾", cx, cy - r * 1.7);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    if (this.game.selectedAnimal === a) {
      ctx.strokeStyle = "#ffcf6b";
      ctx.lineWidth = Math.max(1.5, ts * 0.05);
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.6, 0, 7); ctx.stroke();
    }
  }
}
