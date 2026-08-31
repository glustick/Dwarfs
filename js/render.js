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
};

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
        this.drawTile(ctx, w.tiles[y][x], x * ts + ox, y * ts + oy, ts, x, y);
      }
    }

    // 2) designations & zones
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = w.tiles[y][x];
        if (t.zone) this.drawZone(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.stockpile) this.drawStockpile(ctx, x * ts + ox, y * ts + oy, ts);
        if (t.furniture) this.drawFurniture(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.workshop) this.drawWorkshop(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.designation) this.drawDesignation(ctx, t, x * ts + ox, y * ts + oy, ts);
        if (t.buildJob) this.drawBuildGhost(ctx, t, x * ts + ox, y * ts + oy, ts);
      }
    }

    // 3) items
    for (const it of g.items) {
      if (it.hauled) continue;
      if (it.x < x0 - 1 || it.x > x1 + 1 || it.y < y0 - 1 || it.y > y1 + 1) continue;
      this.drawItem(ctx, it, it.x * ts + ox, it.y * ts + oy, ts);
    }

    // 4) dwarves
    for (const d of g.dwarves) {
      this.drawDwarf(ctx, d, ox, oy, ts);
    }

    // 4b) enemies
    for (const e of g.enemies) {
      if (e.hp <= 0) continue;
      this.drawEnemy(ctx, e, ox, oy, ts);
    }

    // 4c) caravans
    for (const car of g.caravans) this.drawCaravan(ctx, car, ox, oy, ts);

    // 4d) combat sparks
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
      case K.FLOOR: base = "#8a8378"; break;
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
    if (t.built === B.WALL) this.drawBrickWall(ctx, sx, sy, s);
    if (t.built === B.DOOR) this.drawDoor(ctx, t, sx, sy, ts);
    if (t.kind === K.FLOOR || t.built === B.FLOOR) this.drawFloorGrid(ctx, sx, sy, ts);

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

  drawBrickWall(ctx, sx, sy, s) {
    ctx.fillStyle = "#7a4f34";
    ctx.fillRect(sx, sy, s, s);
    ctx.strokeStyle = "#5a3823";
    ctx.lineWidth = Math.max(1, s * 0.05);
    const rows = 3, rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const y = sy + r * rh;
      ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + s, y); ctx.stroke();
      const off = (r % 2) ? s / 2 : 0;
      ctx.beginPath(); ctx.moveTo(sx + off, y); ctx.lineTo(sx + off, y + rh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx + (off + s / 2) % s, y); ctx.lineTo(sx + (off + s / 2) % s, y + rh); ctx.stroke();
    }
  }

  drawDoor(ctx, t, sx, sy, ts) {
    const pad = ts * 0.12;
    ctx.fillStyle = t.doorLocked ? "#6b3a2a" : "#8a5a34";
    ctx.fillRect(sx + pad, sy, ts - pad * 2, ts);
    ctx.strokeStyle = "#3a2416"; ctx.lineWidth = Math.max(1, ts * 0.05);
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
  drawStockpile(ctx, sx, sy, ts) {
    ctx.fillStyle = "rgba(200,160,60,0.12)";
    ctx.fillRect(sx, sy, ts, ts);
    ctx.strokeStyle = "rgba(220,180,80,0.5)";
    ctx.setLineDash([Math.max(2, ts * 0.14), Math.max(2, ts * 0.1)]);
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
    ctx.setLineDash([]);
  }

  drawDesignation(ctx, t, sx, sy, ts) {
    const pulse = 0.4 + Math.sin(this.game.time * 4) * 0.2;
    const colors = { dig: `rgba(230,150,40,${pulse})`, chop: `rgba(230,90,40,${pulse})`, gather: `rgba(90,200,90,${pulse})` };
    ctx.fillStyle = colors[t.designation] || `rgba(255,255,255,${pulse})`;
    ctx.fillRect(sx, sy, ts, ts);
    ctx.strokeStyle = colors[t.designation];
    ctx.lineWidth = Math.max(1, ts * 0.08);
    ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2);
    // little icon glyph
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = `${Math.floor(ts * 0.5)}px serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const glyph = { dig: "⛏", chop: "🪓", gather: "🌿" }[t.designation] || "";
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
    const glyph = { wall: "🧱", floor: "▦", bed: "🛏", door: "🚪", well: "💧", brewery: "🍺" }[t.buildKind] || "🧱";
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
    if (t.furniture === FURN.BED) this.drawBed(ctx, sx, sy, ts);
    else if (t.furniture === FURN.TABLE) this.drawTable(ctx, sx, sy, ts);
  }

  drawTable(ctx, sx, sy, ts) {
    const pad = ts * 0.2;
    ctx.fillStyle = "#6a4526";
    ctx.fillRect(sx + pad, sy + pad, ts - pad * 2, ts - pad * 2);
    ctx.fillStyle = "#8a5f34";
    ctx.fillRect(sx + pad, sy + pad, ts - pad * 2, (ts - pad * 2) * 0.4);
    ctx.strokeStyle = "#4a2f18"; ctx.lineWidth = 1;
    ctx.strokeRect(sx + pad + 0.5, sy + pad + 0.5, ts - pad * 2 - 1, ts - pad * 2 - 1);
  }

  drawWorkshop(ctx, t, sx, sy, ts) {
    // stone platform
    const bg = { forge: "#4a4038", smelter: "#4a4340", well: "#3a4048", brewery: "#4a3d28" }[t.workshop] || "#4a4340";
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
    }
  }

  drawBed(ctx, sx, sy, ts) {
    const pad = ts * 0.14;
    const x = sx + pad, y = sy + pad, w = ts - pad * 2, h = ts - pad * 2;
    // frame
    ctx.fillStyle = "#7a4f2c";
    ctx.fillRect(x, y, w, h);
    // mattress
    ctx.fillStyle = "#c9b8a0";
    ctx.fillRect(x + w * 0.12, y + h * 0.28, w * 0.76, h * 0.6);
    // pillow
    ctx.fillStyle = "#eee4d2";
    ctx.fillRect(x + w * 0.16, y + h * 0.12, w * 0.68, h * 0.2);
    // blanket band
    ctx.fillStyle = "#9a5b4a";
    ctx.fillRect(x + w * 0.12, y + h * 0.62, w * 0.76, h * 0.26);
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
      ctx.fillStyle = "#e8e0d0";
      ctx.fillRect(cx - ts * 0.04, cy - ts * 0.02, ts * 0.08, ts * 0.16);
      ctx.fillStyle = "#c0472e";
      ctx.beginPath(); ctx.ellipse(cx, cy - ts * 0.02, ts * 0.14, ts * 0.08, 0, Math.PI, 0); ctx.fill();
    } else if (it.kind === ITEM.BAR) {
      const col = it.sub === "gold" ? "#ffd34d" : it.sub === "coal" ? "#4a4a4a" : "#c4cad2";
      ctx.fillStyle = col;
      ctx.fillRect(cx - ts * 0.16, cy - ts * 0.02, ts * 0.32, ts * 0.12);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(cx - ts * 0.16, cy - ts * 0.02, ts * 0.32, ts * 0.03);
    } else if (it.kind === ITEM.WEAPON) {
      ctx.strokeStyle = "#d8dde4"; ctx.lineWidth = Math.max(1.5, ts * 0.08);
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.12, cy + ts * 0.12); ctx.lineTo(cx + ts * 0.12, cy - ts * 0.16); ctx.stroke();
      ctx.strokeStyle = "#7a5a2c";
      ctx.beginPath(); ctx.moveTo(cx - ts * 0.16, cy + ts * 0.06); ctx.lineTo(cx - ts * 0.06, cy + ts * 0.16); ctx.stroke();
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
    }
  }

  // -- dwarves -------------------------------------------------------------
  drawDwarf(ctx, d, ox, oy, ts) {
    const bob = Math.sin(d.bob) * (d.state === "goto" || d.state === "carry" ? ts * 0.06 : 0);
    const cx = (d.x + 0.5) * ts + ox;
    const cy = (d.y + 0.5) * ts + oy + bob;
    const r = ts * 0.30;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.1, r * 0.9, r * 0.35, 0, 0, 7); ctx.fill();

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

    // helmet / hair
    ctx.fillStyle = "#4a3a26";
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.62, r * 0.56, Math.PI, 0); ctx.fill();

    // beard
    ctx.fillStyle = "#b98a4a";
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.5, cy - r * 0.42);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.42);
    ctx.lineTo(cx + r * 0.28, cy + r * 0.35);
    ctx.lineTo(cx, cy + r * 0.5);
    ctx.lineTo(cx - r * 0.28, cy + r * 0.35);
    ctx.closePath(); ctx.fill();

    // eyes
    ctx.fillStyle = "#2a2018";
    const ex = d.facing * r * 0.12;
    ctx.beginPath(); ctx.arc(cx - r * 0.16 + ex, cy - r * 0.55, r * 0.07, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.16 + ex, cy - r * 0.55, r * 0.07, 0, 7); ctx.fill();

    // carried item indicator
    if (d.carrying) {
      ctx.fillStyle = { wood: "#8a5a2c", stone: "#9a948a", ore: "#ffd34d", food: "#c0472e", bar: "#c4cad2", weapon: "#d8dde4", armor: "#8a94a0", water: "#4a7a9a", ale: "#e8b84a" }[d.carrying.kind] || "#fff";
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

    // HP bar when wounded
    if (d.hp < d.maxhp) {
      const bw = r * 1.6, frac = clamp(d.hp / d.maxhp, 0, 1);
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(cx - bw / 2, cy - r * 1.7, bw, r * 0.24);
      ctx.fillStyle = frac > 0.5 ? "#5cb85c" : frac > 0.25 ? "#e0b158" : "#e0553a";
      ctx.fillRect(cx - bw / 2, cy - r * 1.7, bw * frac, r * 0.24);
    }

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

    // working spark
    if (d.state === "work") {
      const t = this.game.time;
      const jt = d.job ? d.job.type : null;
      const col = jt === "train" ? "180,200,255" : jt === "eat" ? "160,220,140" : jt === "socialize" ? "230,180,240" : jt === "doctor" ? "230,120,120" : "255,220,120";
      ctx.strokeStyle = `rgba(${col},${0.5 + Math.sin(t * 20) * 0.4})`;
      ctx.lineWidth = Math.max(1, ts * 0.08);
      const a = t * 8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r, cy - r + Math.sin(a) * r * 0.4);
      ctx.lineTo(cx + Math.cos(a) * r * 1.6, cy - r + Math.sin(a) * r * 0.4 - r * 0.5);
      ctx.stroke();
    }

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

    // resting to recover from a wound
    if (d.state === "recover") {
      const t = this.game.time;
      ctx.fillStyle = `rgba(230,110,110,${0.6 + Math.sin(t * 3) * 0.3})`;
      ctx.font = `${Math.floor(ts * 0.4)}px serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("✚", cx + r * 0.9, cy - r * 1.1 - (Math.sin(t * 2) * ts * 0.06));
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
    }

    // selection ring
    if (this.game.selectedDwarf === d) {
      ctx.strokeStyle = "#ffcf6b";
      ctx.lineWidth = Math.max(1.5, ts * 0.06);
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, 7); ctx.stroke();
    }
  }

  drawEnemy(ctx, e, ox, oy, ts) {
    const bob = Math.sin(e.bob) * (e.path ? ts * 0.05 : 0);
    const cx = (e.x + 0.5) * ts + ox;
    const cy = (e.y + 0.5) * ts + oy + bob;
    const r = ts * 0.30;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.1, r * 0.9, r * 0.35, 0, 0, 7); ctx.fill();

    if (e.kind === "wolf") {
      // low four-legged body
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.2, r * 0.95, r * 0.5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + e.facing * r * 0.8, cy, r * 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = "#c94040"; // eye
      ctx.beginPath(); ctx.arc(cx + e.facing * r * 0.9, cy - r * 0.05, r * 0.08, 0, 7); ctx.fill();
    } else {
      // humanoid raider
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy + r); ctx.lineTo(cx - r * 0.5, cy - r * 0.1);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.1); ctx.lineTo(cx + r * 0.7, cy + r);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = e.kind === "troll" ? "#8a7f9a" : "#6f8a48";
      ctx.beginPath(); ctx.arc(cx, cy - r * 0.5, r * 0.55, 0, 7); ctx.fill();
      // menacing eyes
      ctx.fillStyle = "#e03020";
      const ex = e.facing * r * 0.12;
      ctx.beginPath(); ctx.arc(cx - r * 0.18 + ex, cy - r * 0.55, r * 0.09, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + r * 0.18 + ex, cy - r * 0.55, r * 0.09, 0, 7); ctx.fill();
      // crude weapon
      ctx.strokeStyle = "#b0b6bc"; ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.beginPath(); ctx.moveTo(cx + e.facing * r * 0.8, cy + r * 0.5); ctx.lineTo(cx + e.facing * r * 0.8, cy - r * 0.6); ctx.stroke();
    }

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
}
