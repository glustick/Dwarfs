# Changelog

Version shown on the main/pause menu as `vRELEASE · build N`. **Release**
bumps for a named feature round (see `ROADMAP.md`); **build** bumps by 1 on
every commit, independent of release. Both live in `js/version.js`.

## v1.5.1 (build 21)
- **📖 Tutorial** — a short, skippable guided walkthrough (Welcome →
  designating work → stockpiles → building → zones → schedule → research →
  defending against the outbreak) opens automatically on a brand-new game.
  Skip it any time, and reopen it whenever with the new **❓ Help** button
  in the top bar. Doesn't pause or block the game underneath.

## v1.5.0 (build 20)
The Outbreak — the colony's threats turn undead, and escalate with research.

- **🧟 Zombies replace the raid roster.** Shamblers, Runners, and (later)
  Brutes attack instead of wolves/goblins/trolls; raid size and mix now
  scale with how deep the colony has gone into the tech tree, not day
  count. A new 🦠 outbreak indicator (top bar) — Calm → Stirring →
  Restless → Ravenous → Overrun — telegraphs it, so research choices
  visibly foreshadow what's coming.
- **Bite → infection → cure or turn.** A zombie hit has a chance to infect
  an elf instead of just hurting them. An infected elf automatically seeks
  a bed (a Hospital bed if one's free, same as a bad wound) and races an
  infection clock: untreated, it runs out and they turn — lost to the
  colony, and a new hostile appears in their place. A Hospital zone,
  Medicine research, and above all an attending Doctor can turn that clock
  around and cure them outright.
- The existing wound/Hospital/Doctor pipeline does almost all the work
  here — infection reuses the same "seek a bed, get treated" loop wounds
  already use. Digging in underground already keeps a colony completely
  safe from an outbreak (raids stay surface-only, per the Z-levels
  release) — no new code needed for that, just a nice side effect of
  what's already there.
- **Deliberately out of scope this round**: vampires (a hidden day/night
  threat), quarantine zones, a doctor "checkup" detection mechanic,
  relationship-driven cover-ups, and new defensive structures (palisades,
  watchtowers, traps). Candidates for a future round.

## v1.4.0 (build 19)
Tier 4, Phase 1 — Z-levels: the colony can dig down.

- **🌀 Dig Stairs** — a new designation (Orders flyout) carves a stairwell
  down from any tile into the level below, auto-generating fresh stone +
  ore terrain underground the first time a stairwell reaches it. Elves,
  hauled/dropped items, and pathfinding all move between floors through a
  connected pair of stairs tiles.
- **Floor navigation** — a ⛰️ indicator and ▲/▼ buttons in the top bar (also
  `[` / `]`) switch which floor the camera, minimap, and every tool (mining,
  building, zoning, stockpiles) act on. Selecting an elf on another floor
  jumps the view to them automatically.
- Every system — jobs, hauling, beds, farms, workshops, stockpile filters,
  save/load — is floor-aware. Older saves (single-level, pre-1.4) still load
  unchanged.
- **Deliberately out of scope this round**: ramps (stairs only), raiders/
  caravans/migrants (surface-only for now — the underground is safe from
  raids), and underground water/flooding/cave-ins. Candidates for a Phase 2.

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
