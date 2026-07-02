# ⛏️ Dwarf Fortress — Graphical

A browser-based colony sim inspired by the open-source game that the commercial
**Dwarf Fortress** grew from — but rendered with **drawn graphics instead of ASCII**.
Everything (dwarves, trees, ore-flecked stone, water, items) is painted with the
HTML5 Canvas, no image assets required.

## Play

Just open **`index.html`** in any modern browser (double-click it). No build step,
no server, no dependencies.

You'll land on a **main menu** — start a *New Game*, *Continue* your most recent
save, or *Load* any saved fortress.

## Saving & loading

- **In-game menu**: press **Esc** or click **☰ Menu** (top-right) to pause and open
  the menu — *Resume*, *Save Game*, *Load Game*, *New Game*, or *Quit to Main Menu*.
- **Save slots**: name your saves or overwrite existing ones. Delete them from the
  load screen.
- **Autosave**: the game saves automatically every 10 minutes to an *Autosave* slot.
- Saves live in your browser's `localStorage`, so they persist between sessions on
  the same browser.

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
7. **🚫 Cancel** — clear any designation, zone, build order, or workshop.

### ⚒️ Industry & 🛡️ Defense

- **🔥 Smelter** & **⚒️ Forge** — build these workshops (they cost stone). The
  smelter turns **ore → metal bars**; the forge turns **iron bars → weapons &
  armor**. Select a workshop with Inspect to choose what it makes. A dwarf with
  the **Crafting** labor works it (trains the *Smithing* skill).
- **Raiders attack.** From around Day 4, wolves — then goblins and trolls — raid
  the colony. Watch the ⚔️ threat indicator in the top bar.
- **Enlist soldiers.** Select a dwarf and click **⚔ Enlist**. Enlisted dwarves
  automatically pick up forged weapons/armor from a stockpile, fight raiders, and
  train the *Fighting* skill; civilians flee to safety. Wall off your colony and
  keep a standing militia to survive.

Keep your dwarves fed — hungry dwarves eat from your food stores, and starving ones
can die. A healthy, well-fed colony attracts **migrants** over time.

## Dwarves, skills & the colony database

Every dwarf is an individual with **skills** that improve through work:
Mining, Woodcutting, Farming, Building, Hauling, Cooking, plus the attributes
Fitness, Fighting, Charisma and Intelligence. Higher skill = faster work and
better yields; Intelligence speeds all learning; Fitness speeds movement;
Charisma draws more migrants. Dwarves start with random specialties fitting the
mountain-forest world, and earn Dwarf-Fortress-style titles (Novice → Legendary).

A persistent **database** (IndexedDB, with a localStorage fallback so it works
from `file://`) records every dwarf, their skills and profession, and a running
**chronicle** of colony events — view it in the **Records** tab. It survives
across games as a hall of records.

## Habitat & scheduling

- **🛏️ Bed** — build beds (costs wood). Tired dwarves seek a free bed to sleep.
- **🛌 Bedroom** / **🍽️ Dining** — paint zones. Sleeping in a bedroom and dining
  in the hall lift mood (and dining trains Charisma).
- **Energy** — dwarves tire out (faster at night) and must sleep to recover.
- **Schedule tab** — set each dwarf's activity per shift (☀️ Day 06:00–18:00,
  🌙 Night 18:00–06:00): Work, Sleep, Eat, Train, or Off. Toggle which **labors**
  (mining/woodcutting/gathering/building/hauling) each dwarf will take. Set the
  whole colony to sleep at night, or run night shifts — your call.

### 🔬 Research & 😀 Happiness

- **Research tree** (Research tab): points accrue from your dwarves' *Intelligence*
  and from **Study zones**. Spend them on a tree of techs that make dwarves more
  efficient (faster mining/chopping/smithing, slower hunger, comfier beds) and
  **unlock new build/zone options** — **Farm** (grows food), **Study** (more
  research), **Hospital** (faster healing) and **Tables** (happier dining halls).
- **Happiness** — each colonist has an overall happiness gauge combining health,
  mood, and satisfied needs (food, rest). Shown as a face + bar in the roster.
- **Growth** — migrants arrive at random; the odds rise when the colony is happy
  and well-fed, but only if there's **space** (each bed adds room to grow).
- **Time controls** — the ⏸ ▶ ⏩ ⏭ buttons (top bar) pause or set speed so you can
  stop to make decisions or fast-forward the grind.

## Controls

| Action | Control |
|---|---|
| Designate / build | Left-drag with a tool selected |
| Pan camera | Arrow keys, or right-drag |
| Zoom | Mouse wheel |
| Pause / resume | Space, or the ⏸ button |
| Game speed | `+` / `-`, or the ▶ ⏩ ⏭ buttons |
| Tool hotkeys | `Q` inspect · `D` mine · `C` chop · `G` gather · `S` stockpile · `B` wall · `F` floor · `E` bed · `R` bedroom · `T` dining · `X` cancel |

## Under the hood

- **Skills** (`js/skills.js`) — skill catalog, XP/level maths, titles, professions.
- **Database** (`js/db.js`) — `ColonyDB`, an IndexedDB store (localStorage fallback)
  for persistent dwarf/skill records and the event chronicle.
- **World** (`js/world.js`) — value-noise terrain generation, tile model.
- **Pathfinding** (`js/pathfinding.js`) — A* over the tile grid with a binary heap.
- **Jobs & AI** (`js/jobs.js`) — designations become tasks; dwarves claim, path to,
  and execute mining / chopping / gathering / hauling / building / eating.
- **Rendering** (`js/render.js`) — procedural canvas sprites, day/night cycle,
  animated water, camera transform.
- **Input** (`js/input.js`) — tools, drag-designation, pan/zoom.
- **Game loop** (`js/game.js`) — time, needs, migration, UI.

Everything is plain, dependency-free JavaScript.
