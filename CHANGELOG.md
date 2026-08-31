# Changelog

Version shown on the main/pause menu as `vRELEASE · build N`. **Release**
bumps for a named feature round (see `ROADMAP.md`); **build** bumps by 1 on
every commit, independent of release. Both live in `js/version.js`.

## v1.3.0 (build 18)
Completes Tier 3 — UX and quality-of-life:

- **Minimap** — bottom-right overview of the whole map, live viewport box,
  elf/enemy dots; click it to jump the camera there.
- **Auto-pause alerts** — a 🔔 top-bar toggle pauses the instant a raid
  starts, an elf dies, or an elf starts starving or dying of thirst.
- **Stockpile categories** — restrict a whole contiguous stockpile (via
  Inspect) to one goods category — Building, Ore & Bars, Food, Drink, or
  Arms — so hauling organizes itself.
- **Audio polish** — per-channel Music/SFX volume sliders (pause menu); the
  ambient score darkens, loudens, and speeds up during a raid for rising
  tension; the Smelter/Forge/Well/Brewery each got a distinct crafting
  sound; sparse daytime birdsong.

## v1.2.0 (build 17)
Elves develop opinions of each other, and forests can be replanted on purpose:

- **Relationships** — nearby elves' affinity for each other drifts over time
  (a fixed "chemistry" per pair, nudged by Charisma and by context — idle
  proximity < socializing < sharing a bed). Cross a high threshold and two
  elves fall in love (any pairing, no gender restriction) and become partners;
  drift negative and they become rivals, or a couple breaks up. A partner's
  death hits the survivor's mood hard.
- **💞 Double Bed** — a new furniture piece; partners sharing one get a mood
  bonus beyond sleeping alone.
- **🖼️ Painting** — a purely decorative furniture piece; nice things in a
  bedroom or dining hall add a further mood bonus to whoever's there.
- **Foresting** — a new labor/skill. Designate an empty patch of grass or
  soil (great for a logged-out clearing) and a Forester plants a sapling
  there, which matures into a full tree over time.

## v1.1.0 (build 16)
Completes Tier 2 of the roadmap:

- **Thirst** — a second survival need alongside hunger, with the same real
  stakes (a parched, unattended elf can die of thirst).
- **Well** — a new workshop (no inputs needed) that draws Water.
- **Brewery** — a new workshop that brews Water + Food into **Ale**, a
  stronger drink that quenches more thirst and lifts mood further — ties
  thirst directly to the farming loop, as the roadmap intended.

## v1.0.0 (build 15)
Baseline release — the full feature set as of introducing version tracking:

- Skills & titles, persistent colony database, scheduling, day/night cycle
- Habitat (beds/bedrooms/dining), combat & raids, smelter/forge crafting chain
- Research tree, happiness, space-gated migration, time controls
- Categorized build menus, filterable event chronicle, procedural audio
- **Doors & gates** — passable, lockable-during-raids barriers
- **Trade & economy** — Trade Depot zone, periodic caravans, coal as smelter fuel
- **Real farming** — plant → grow → harvest jobs, driven by a 4-season year
- **Injuries & the Hospital** — wounds require bed rest; a Doctor (Medicine
  skill/labor) speeds recovery
- **Toughness** — combat attribute reducing damage taken and raising max hp
