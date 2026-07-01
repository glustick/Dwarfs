# ⛏️ Dwarf Fortress — Graphical

A browser-based colony sim inspired by the open-source game that the commercial
**Dwarf Fortress** grew from — but rendered with **drawn graphics instead of ASCII**.
Everything (dwarves, trees, ore-flecked stone, water, items) is painted with the
HTML5 Canvas, no image assets required.

## Play

Just open **`index.html`** in any modern browser (double-click it). No build step,
no server, no dependencies.

## What to do

Your seven dwarves have arrived in a procedurally-generated wilderness. *Strike the earth!*

1. **⛏️ Mine** — drag over solid grey stone to designate digging. Dwarves carve it
   out into walkable floor and drop stone (and any **ore** they strike — iron, gold, coal).
2. **🪓 Chop** — drag over trees to fell them for wood logs.
3. **🌿 Gather** — drag over bushes/mushrooms to collect **food**.
4. **📦 Stockpile** — drag on open ground to make a storage zone. Dwarves haul loose
   items there automatically.
5. **🧱 Wall / ▦ Floor** — queue construction (each consumes 1 stone from a stockpile).
6. **🔍 Inspect** — click a tile or dwarf to see details in the right panel.
7. **🚫 Cancel** — clear any designation, zone, or build order.

Keep your dwarves fed — hungry dwarves eat from your food stores, and starving ones
can die. A healthy, well-fed colony attracts **migrants** over time.

## Controls

| Action | Control |
|---|---|
| Designate / build | Left-drag with a tool selected |
| Pan camera | Arrow keys, or right-drag |
| Zoom | Mouse wheel |
| Pause / resume | Space |
| Game speed | `+` / `-` |
| Tool hotkeys | `Q` inspect · `D` mine · `C` chop · `G` gather · `S` stockpile · `B` wall · `F` floor · `X` cancel |

## Under the hood

- **World** (`js/world.js`) — value-noise terrain generation, tile model.
- **Pathfinding** (`js/pathfinding.js`) — A* over the tile grid with a binary heap.
- **Jobs & AI** (`js/jobs.js`) — designations become tasks; dwarves claim, path to,
  and execute mining / chopping / gathering / hauling / building / eating.
- **Rendering** (`js/render.js`) — procedural canvas sprites, day/night cycle,
  animated water, camera transform.
- **Input** (`js/input.js`) — tools, drag-designation, pan/zoom.
- **Game loop** (`js/game.js`) — time, needs, migration, UI.

Everything is plain, dependency-free JavaScript.
