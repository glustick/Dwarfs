# 🍃 Elven Empire — Graphical

A browser-based colony sim in the classic "manage a settlement of little people"
tradition — but you lead a band of **elves** raising an empire in the greenwood,
rendered with **drawn graphics instead of ASCII**. Everything (elves, trees,
ore-flecked stone, water, items) is painted with the HTML5 Canvas, no image
assets required.

## Play

Just open **`index.html`** in any modern browser (double-click it). No build step,
no server, no dependencies.

You'll land on a **main menu** — start a *New Game*, *Continue* your most recent
save, or *Load* any saved empire. The current release and build number are
shown at the bottom of the main and pause menus (see `CHANGELOG.md`).

## Saving & loading

- **In-game menu**: press **Esc** or click **☰ Menu** (top-right) to pause and open
  the menu — *Resume*, *Save Game*, *Load Game*, *New Game*, or *Quit to Main Menu*.
- **Save slots**: name your saves or overwrite existing ones. Delete them from the
  load screen.
- **Autosave**: the game saves automatically every 10 minutes to an *Autosave* slot.
- Saves live in your browser's `localStorage`, so they persist between sessions on
  the same browser.

## What to do

Your seven elves have arrived in a procedurally-generated wilderness. *Raise the empire!*

1. **⛏️ Mine** — drag over solid grey stone to designate digging. Elves carve it
   out into walkable floor and drop stone (and any **ore** they strike — iron, gold, coal).
2. **🪓 Chop** — drag over trees to fell them for wood logs.
3. **🌿 Gather** — drag over bushes/mushrooms to collect **food**.
4. **📦 Stockpile** — drag on open ground to make a storage zone. Elves haul loose
   items there automatically. Select any tile in it with Inspect to restrict the
   whole contiguous pile to one goods category (Building/Ore & Bars/Food/Drink/
   Arms) for cleaner logistics.
5. **🧱 Wall / ▦ Floor** — queue construction (each consumes 1 stone from a stockpile).
6. **🔍 Inspect** — click a tile or elf to see details in the right panel.
7. **🚫 Cancel** — clear any designation, zone, build order, or workshop.
8. **🗺️ Minimap** — bottom-right corner; click it to jump the camera anywhere
   on the map.
9. **🔔 Auto-pause** (top bar) — pauses the instant a raid starts, an elf
   dies, or one starts starving or dying of thirst, so a crisis at high
   speed doesn't slip by unnoticed.

### ⚒️ Industry & 🛡️ Defense

- **🔥 Smelter** & **⚒️ Forge** — build these workshops (they cost stone). The
  smelter turns **ore → metal bars**; the forge turns **iron bars → weapons &
  armor**. Select a workshop with Inspect to choose what it makes. A elf with
  the **Crafting** labor works it (trains the *Smithing* skill).
- **🧟 The outbreak attacks.** From around Day 4, zombies — Shamblers, then
  Runners and eventually Brutes — raid the colony. Their size and mix
  escalate with how far you've pushed into the tech tree (not the day
  count), telegraphed by the 🦠 dread indicator in the top bar (Calm →
  Stirring → Restless → Ravenous → Overrun) next to the ⚔️ threat indicator.
- **Enlist soldiers.** Select a elf and click **⚔ Enlist**. Enlisted elves
  automatically pick up forged weapons/armor from a stockpile, fight the
  outbreak, and train the *Fighting* skill; civilians flee to safety. Wall
  off your colony and keep a standing militia to survive.
- **🚪 Door** — build one to seal a wall while staying passable. Elves always walk
  through freely; toggle a single door from its Inspect panel, or use the
  🔒/🔓 buttons in the top bar to lock or unlock every door at once, sealing
  the horde out during a fight.
- **🩹 Injuries.** A hit that drops an elf below 60% hp badly wounds them (🩹 in
  the roster and Inspect panel) — they can no longer just shrug it off at work
  and head for the nearest bed to rest instead. Give someone the **Doctoring**
  labor and they'll tend wounded elves resting in a bed, healing them far
  faster (trains the *Medicine* skill) — especially inside a **⚕️ Hospital**
  zone (needs the Medicine tech).
- **🧟 Infection.** A zombie's bite can infect an elf (🧟 in the roster and
  Inspect panel) instead of just wounding them. An infected elf automatically
  seeks a bed — a Hospital bed if one's free — and races an infection clock:
  left untreated, it runs out and they turn, lost to the colony as a new
  hostile appears in their place. A Doctor's care, a Hospital zone, and the
  Medicine tech can each slow that clock, and together can reverse it
  entirely into a full cure — the same care that speeds up wound recovery.
- **🛡️ Toughness** — a combat attribute (trained by sparring and by surviving
  hits) that cuts incoming damage and raises max hp, so seasoned veterans take
  a lot more punishment before going down and before being wounded at all.

Keep your elves fed and watered — hungry elves eat from your food stores, thirsty
ones drink, and neglecting either can kill. A healthy colony attracts **migrants**
over time. Digging in underground (see Z-levels below) already keeps a colony
completely safe from the outbreak — raids never follow you down.

## Thirst, wells & brewing

- **💧 Well** — build one (costs stone, no ingredients needed). Elves with the
  Crafting labor draw **Water** from it, same as smelting or forging.
- **🍺 Brewery** — build one to brew **Water + Food → Ale**. Ale quenches thirst
  more than plain water and lifts mood further — a nice treat that also ties
  thirst straight into your farming output.
- Thirsty elves fetch the nearest drink automatically (preferring ale over
  water), same as eating. Track the colony's water supply with the 💧 counter
  in the top bar.

## Trade

- **🐎 Depot** — paint a trade zone. Elves with the Hauling labor carry spare
  **gold bars** and surplus **weapons/armor** there automatically (iron bars stay
  put — they're needed for the forge). Smelting now also burns **coal** as fuel,
  so mined coal finally has a use.
- **Caravans** — a merchant wagon visits periodically, buys whatever's sitting
  on the depot, and spends the proceeds on whichever staple (food, wood, or iron
  ore) your colony is shortest on. A high **Charisma** skill among your elves
  improves the exchange rate.

## Elves, skills & the colony database

Every elf is an individual with **skills** that improve through work:
Mining, Woodcutting, Farming, Building, Hauling, Cooking, Smithing, Medicine,
Foresting, plus the attributes Fitness, Fighting, Toughness, Charisma and
Intelligence. Higher skill = faster work and
better yields; Intelligence speeds all learning; Fitness speeds movement;
Charisma draws more migrants. Elves start with random specialties fitting the
woodland world, and earn classic roguelike-style titles (Novice → Legendary).

A persistent **database** (IndexedDB, with a localStorage fallback so it works
from `file://`) records every elf, their skills and profession, and a running
**chronicle** of colony events — view it in the **Records** tab. It survives
across games as a hall of records.

## Habitat & scheduling

- **🛏️ Bed** — build beds (costs wood). Tired elves seek a free bed to sleep.
- **🛌 Bedroom** / **🍽️ Dining** — paint zones. Sleeping in a bedroom and dining
  in the hall lift mood (and dining trains Charisma).
- **Energy** — elves tire out (faster at night) and must sleep to recover.
- **Schedule tab** — set each elf's activity per shift (☀️ Day 06:00–18:00,
  🌙 Night 18:00–06:00): Work, Sleep, Eat, Drink, Train, or Off. Toggle which
  **labors** (mining/woodcutting/gathering/building/hauling/crafting/medicine/
  foresting) each elf will take. Set the whole colony to sleep at night, or run
  night shifts — your call.

## Relationships

- Nearby elves' opinions of each other drift over time — some pairs just click,
  some just clash, and it's a bit faster when they're actively socializing or
  sharing a bed. Cross a high threshold and two elves **fall in love** (any
  pairing — there's no gender restriction); drift into the negative and they
  become **rivals**. Check an elf's Inspect panel for their partner and
  notable relationships.
- **💞 Double Bed** — build one (costs wood) in a bedroom. A couple can share
  it, which lifts mood beyond what sleeping alone gets them.
- **🖼️ Painting** — a purely decorative furniture piece (costs wood). Nice
  things in the room matter: paintings in a bedroom (or dining hall) add a
  further mood bonus to whoever's there.
- A partner's death is a real blow — it clears the relationship and hits the
  survivor's mood hard.

## Foresting

- **🌲 Plant Tree** — drag over an empty patch of grass or soil (handy on a
  logged-out clearing) to designate it for replanting. An elf with the new
  **Foresting** labor plants a sapling there, which matures into a full tree
  over time — same as any other regrowth, just started deliberately instead
  of left to chance.

## Z-levels — digging down

- **🌀 Dig Stairs** — drag over any tile (solid stone or already-open ground)
  to designate it for a stairwell. An elf with the Mining labor carves it,
  which also opens up a brand-new level directly below — dense stone laced
  with ore, generated the moment a stairwell first reaches it.
- **⛰️ Floor indicator** (top bar) — shows which floor the camera, tools, and
  minimap are currently showing. Click ▲/▼ (or press `[` / `]`) to switch
  floors; selecting an elf on another floor jumps the view there for you.
  Every system works underground too: mining, hauling, beds, farms,
  workshops, stockpile filters, saving and loading.
- Raiders, trading caravans, and migrants are surface-only for now — the
  underground is safe from raids, at least until a future round takes that
  on. Ramps, flooding, and cave-ins are similarly left for later.

### 🔬 Research & 😀 Happiness

- **Research tree** (Research tab): points accrue from your elves' *Intelligence*
  and from **Study zones**. Spend them on a tree of techs that make elves more
  efficient (faster mining/chopping/smithing, slower hunger, comfier beds) and
  **unlock new build/zone options** — **Farm** (plant/grow/harvest crops),
  **Study** (more research), **Hospital** (faster healing) and **Tables**
  (happier dining halls).
- **🌾 Farm** — once Agriculture is researched, paint a Farm zone. Elves with
  the **Farming** labor plant empty plots, then harvest them once ripe for food.
  Growth speed follows a 4-season year (🌱 Spring, 🌻 Summer, 🍂 Autumn, ❄️
  Winter — shown in the top bar), so plan your food stores for the slow winter
  stretch.
- **Happiness** — each colonist has an overall happiness gauge combining health,
  mood, and satisfied needs (food, rest). Shown as a face + bar in the roster.
- **Growth** — migrants arrive at random; the odds rise when the colony is happy
  and well-fed, but only if there's **space** (each bed adds room to grow).
- **Time controls** — the ⏸ ▶ ⏩ ⏭ buttons (top bar) pause or set speed so you can
  stop to make decisions or fast-forward the grind.

## Audio

Everything is synthesized live (no audio files) — a generative ambient score
plus procedural sound effects, all built from oscillators and noise. It darkens
and picks up tempo the moment a raid starts, each workshop has its own crafting
tone, and daytime brings sparse birdsong. Mute entirely from the 🔊 button (top
bar), or dial Music and SFX separately from the **⏸ Menu → Audio** sliders.

## Controls

| Action | Control |
|---|---|
| Designate / build | Left-drag with a tool selected |
| Pan camera | Arrow keys, or right-drag |
| Zoom | Mouse wheel |
| Pause / resume | Space, or the ⏸ button |
| Game speed | `+` / `-`, or the ▶ ⏩ ⏭ buttons |
| Tool hotkeys | `Q` inspect · `D` mine · `C` chop · `G` gather · `P` plant tree · `Z` dig stairs · `S` stockpile · `B` wall · `F` floor · `E` bed · `O` door · `1` smelter · `2` forge · `3` well · `4` brewery · `R` bedroom · `T` dining · `Y` depot · `X` cancel |
| Switch floor | `[` / `]`, or the ▲/▼ buttons next to the ⛰️ floor indicator |

## Under the hood

- **Skills** (`js/skills.js`) — skill catalog, XP/level maths, titles, professions.
- **Database** (`js/db.js`) — `ColonyDB`, an IndexedDB store (localStorage fallback)
  for persistent elf/skill records and the event chronicle.
- **World** (`js/world.js`) — value-noise terrain generation, tile model.
- **Pathfinding** (`js/pathfinding.js`) — A* over the tile grid with a binary heap.
- **Jobs & AI** (`js/jobs.js`) — designations become tasks; elves claim, path to,
  and execute mining / chopping / gathering / hauling / building / eating.
- **Rendering** (`js/render.js`) — procedural canvas sprites, day/night cycle,
  animated water, camera transform.
- **Input** (`js/input.js`) — tools, drag-designation, pan/zoom.
- **Game loop** (`js/game.js`) — time, needs, migration, UI.

Everything is plain, dependency-free JavaScript.
