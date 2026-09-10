# Changelog

Version shown on the main/pause menu as `vRELEASE · build N`. **Release**
bumps for a named feature round (see `ROADMAP.md`); **build** bumps by 1 on
every commit, independent of release. Both live in `js/version.js`.

## v1.13.0 (build 38)
Manual military control — the most-requested backlog item.

- **Box-select a squad**: drag with the Inspect tool over any soldiers to
  select them as a group (civilians are unaffected — they stay fully
  automatic, as before).
- **Click to give a move order**: with a squad selected, click any open
  ground to send them there. They march to that spot and then hold it —
  fighting anything that comes adjacent — instead of automatically
  chasing whatever raider happens to be nearest.
- Still fully safe: a soldier under manual order always fights back if an
  enemy gets adjacent, never just stands there taking free hits.
- Orders release automatically once a raid ends, or any time via a
  "Release to automatic AI" button in the Inspector (single soldier or
  whole squad).
- A 🎯 marker shows each soldier's rally point on the map and in the
  roster; save/load round-trips an in-progress order correctly.

## v1.12.0 (build 37)
Backlog round 1 — four small, independent player-requested fixes.

- **Medicine moved to Tier 2** (was Tier 3, gated behind Scholarship):
  now only needs Rations, and costs less — it was too late in the tree
  given how early injuries start mattering.
- **Wine** — a new Brewery recipe (Food + Food, no Water) alongside Ale;
  quenches thirst less but lifts mood more, and elves prefer it over ale
  or water when it's available. More thematically elven than beer.
- **Deconstruct & refund** — Cancel/Erase can now also tear down an
  already-built wall, floor, door, furniture piece, workshop, or conduit
  (walls/floors couldn't be removed at all before this), and refunds the
  exact material that was spent building it as a loose item on the spot.
- **Elf sprites now look like elves** — pointed ears added, the dwarvish
  beard removed.

## v1.11.1 (build 36)
Defensive structures — three new Defenses buildables, all ungated.

- **Palisade**: a quick stake wall, half the build time of a proper wall
  and otherwise identical (a wall is a wall) — the same "cheaper/faster
  alternative" pattern as Ramp vs. Stairs.
- **Watchtower**: a soldier fighting from a watchtower tile deals 30% more
  damage and takes 25% less — a passive bonus rather than a new ranged-
  attack/targeting mechanic.
- **Trap**: damages a raider that steps on it, then resets after an 8s
  cooldown — reusable, and never triggers on a colonist.

## v1.11.0 (build 35)
Ship Tier 4 Phase 2: Z-levels get ramps, underground raids, flooding, and
cave-ins — digging down now carries real weight instead of being purely
upside.

- **Ramps**: a 🌀 Dig Ramp designation is a faster/cheaper alternative to
  stairs — same portal mechanic, just a distinct sloped-cut visual, no
  monster-access difference of its own.
- **Underground raids**: once a stairwell or ramp reaches underground, a
  raid has a rising chance (scaling with how deep the colony has dug) to
  follow it down and arrive at a stairhead instead of the surface edge —
  "digging down always carries some risk." Enemies, and the combat AI that
  reacts to them, are now fully floor-aware instead of hardcoded to the
  surface.
- **Aquifers & drain**: rare veins found while mining underground flood the
  chamber permanently when struck, spreading a little into adjacent
  mined-out floor over time. A 🪣 Drain designation reclaims a flooded tile
  back to dry floor.
- **Cave-ins**: a large mined-out room with no support pillars nearby can
  randomly collapse back to solid stone, hurting (rarely killing) anyone
  caught underneath — leave stone pillars when digging out big rooms.
- Caravans, migrants, and wildlife deliberately stay surface-only — none of
  them have a reason to know about a colony's private tunnels.

## v1.10.0 (build 34)
Ship Tier 5 Phase 2: The Outbreak's vampires — a hidden social-deduction
threat layered on top of the existing zombie raids.

- **A rare Vampire raider's bite curses an elf secretly**: no badge, no log
  line, no change to their schedule — they keep working normally. This is
  deliberately unlike an infected bite, which announces itself immediately.
- **Doctor checkups**: a dwarf with the Medicine labor periodically examines
  other elves for hidden tells (cooldown-gated, not tied to being wounded,
  so it doesn't loop on one elf forever). A higher Medicine skill both
  works the checkup faster and improves the reveal chance.
- **Automatic cover-ups**: a partner, or anyone with a Friend-or-better
  relationship, always throws off a checkup on their behalf — no dialogue,
  just a quiet rule.
- **Quarantine zone** (needs Medicine, like Hospital): an exposed vampire is
  routed here and confined; a Doctor tending them can still cure the curse,
  same healing-math shape as Hospital/infection.
- **Turns hostile if never caught**: whether hidden or quarantined-but-
  untreated, the curse eventually runs its course and the elf turns into a
  Vampire Lord — mirrors the existing zombie Turned Elf mechanic exactly.
- Two new milestones: Nosferatu Unmasked (expose a vampire), Purged of the
  Curse (cure one).

## v1.9.6 (build 33)
Autosave on exit — the 10-minute autosave timer now has a companion that
fires the moment the tab is hidden or closed (`visibilitychange` +
`pagehide`), instead of only on the fixed timer. Covers a normal tab
switch/close/navigate-away; doesn't catch a hard crash or force-quit.

## v1.9.5 (build 32)
Save export/import — saves are no longer trapped in one browser's
localStorage.

- **Export**: a ⬇ button on every save slot (Load Game screen) downloads
  that save as a `.json` file.
- **Import**: an "Import Save…" button on the same screen reads a save
  file back in as a new slot, ready to load — auto-renamed (`Name (2)`,
  `(3)`, …) if a slot with that name already exists, so it never silently
  overwrites one.
- **Load Game is now always reachable from the main menu**, even with zero
  saves, since that's also where importing your first save on a fresh
  install lives — e.g. carrying a colony over after moving the game to a
  new host (localStorage doesn't follow you across origins).

## v1.9.4 (build 31)
The ambient score stopped being a short loop on repeat — v1.9.1 fixed the
harmony, but a single fixed 4-chord progression and one melodic phrase still
looped every ~16-20 seconds, which wears thin fast over a long session.

- **Section variety**: 4 chord progressions and 4 melodic phrases to choose
  from; every time the current pair finishes a full pass, the generator
  rerolls to a different one (never repeating the same pair twice in a row)
  instead of looping the same progression/phrase forever.
- **Arpeggio layer**: a soft plucked voice stepping through each chord's
  tones, interleaved between the melody's notes, for a fuller texture.
- **Stereo width**: melody, arpeggio, and birdsong now pan across the
  stereo field instead of every voice stacking up dead-center mono (the
  chord pad stays centered as the anchor).
- **Humanization**: small per-note timing and gain jitter on the melody/
  arpeggio so the grid doesn't feel perfectly quantized/robotic.

## v1.9.3 (build 30)
Directional sprites — elves and humanoid enemies/zombies now turn around
instead of always facing the camera.

- **Front/back pose**: a new vertical-facing state (tracked alongside the
  existing left/right one) picks a distinct pose when someone is walking
  mostly north vs. mostly south. Walking away shows the back of the head
  (hair covering it entirely, a center-part line, no face) instead of the
  same face-forward look no matter which way they're headed.
- Zombies/raiders lose their menacing red eyes the same way when facing
  away, instead of staring through the back of their own skull.
- Persisted in saves like the existing left/right facing; old saves default
  to front-facing on load.

## v1.9.2 (build 29)
Build materials — walls, floors, doors, and furniture no longer have to be
plain wood/stone.

- **Material picker**: the Build fly-out gets a Wood/Stone/Marble/Metal row
  above the construction/furniture buttons. Pick one, then queue a wall,
  floor, bed, double bed, table, painting, or door as normal — the current
  choice shows as a badge on the Build category button.
- **Marble**: a new decorative vein found while mining, alongside iron/gold/
  coal — drops as its own item and builds directly, no smelting.
- **Metal**: reuses forged iron bars, so it's gated behind the existing
  smelter/forge chain rather than being a new resource.
- Marble and metal each give a small mood bonus over plain stone/wood when
  used in a zone, the same pattern paintings already use.
- Walls/floors/doors/furniture render in their material's color (including a
  metal sheen and marble veining), and the tile Inspect panel shows a
  Material line. Old saves default to stone/wood, matching pre-existing
  builds.

## v1.9.1 (build 28)
Reworked the ambient score — it was a musically directionless random walk
with no chords, plus a scale-math bug that quietly capped it to one octave.

- **Real harmony**: a 4-chord root progression (i-iv-v-VII) the bass drone
  now cycles through, instead of two notes alternating forever.
- **A melody that belongs to the chords**: replaced the unconstrained random
  walk with a short contour replayed (and lightly varied) each chord,
  transposed to the current root — it resolves instead of just wandering.
- **Fixed** a scale bug where any melody degree past the 5th just repeated
  the same pitch instead of climbing an octave, quietly limiting the melody's
  range this whole time.
- **Reverb**: a procedural hall reverb (shaped noise, no asset file) run
  alongside the dry signal — music was completely dry before, which read as
  thin/harsh. SFX are untouched, still crisp and dry for punchy feedback.

## v1.9.0 (build 27)
Sprite animation pass — elves, enemies, and wildlife feel more alive without
any new art: everything is the same procedural canvas shapes, just posed
differently frame to frame.

- **Walk cycle** — a real squash/stretch (anchored at the feet, so it reads
  as leaving the ground rather than sliding up and down) plus alternating
  leg/paw marks peeking out from under the body, replacing the old plain
  vertical bob. Applied to elves, enemies (humanoid and wolf), and animals.
- **Idle breathing** — standing elves get a barely-perceptible sway instead
  of being perfectly frozen, phase-offset per elf so a crowd doesn't breathe
  in unison.
- **Per-job work animations** — mining/chopping/foresting/stairs/training
  now swing a tool in an arc with an impact flash; building/crafting strike
  a hammer straight down; gathering/harvesting/planting stoop toward the
  ground. Everything else (doctoring, eating, socializing, etc.) keeps the
  original orbiting spark.
- Foxes also got a tail wag (brisk on the move, lazy at rest).

## v1.8.1 (build 26)
- **Fix**: `assignTame` picked its target from the last reindex's candidate
  snapshot without re-checking `reserved` at claim time, so two idle elves
  could occasionally both start "approaching" the same wild fox before the
  next reindex caught up (harmless — no duplicate reward — but looked like
  a small crowd converging on one fox). Now re-checks live, same guard
  `assignWork` already uses for tile-based jobs.

## v1.8.0 (build 25)
A RimWorld-inspired interface rework:

- **Bottom-center architect bar** — Orders/Build/Zones (plus Inspect and
  Cancel) moved from the left sidebar to a horizontal bar at the bottom of
  the screen. Clicking a category expands its submenu upward from the bar,
  same as RimWorld's Architect menu, instead of popping out sideways.
- **🧝 Colonist portrait strip** — a new row of chips above the architect
  bar, one per elf, showing their mood face and a status badge (🩹 wounded,
  🧟 infected, ⚔️ enlisted). Click one to select it, jump the camera there,
  and update the right panel — same as clicking their row in the Colony tab.
- Removed the old static on-screen hint text (redundant with the ❓
  tutorial) and widened the play area now that the left sidebar is gone.

## v1.7.0 (build 24)
Finishes Essence Craft — it was already half-wired (the tech, the build
material costs, the tile flags) but had no toolbar buttons, no visuals, and
no actual power or spoilage logic. Now it's a complete loop:

- **🔮 Essence Well** — once Essence Craft is researched, build one (no
  ongoing labor needed) to generate Essence for any connected network.
- **🔗 Arcane Conduit** — embedded wiring; coexists with a stockpile,
  workshop, or furniture already on a tile. A connected cluster of
  conduit/Well/Frost-Chamber tiles is powered the moment it touches an
  Essence Well — inspect any tile in it to see "powered" vs "dormant."
- **❄️ Frost Chamber** — once powered, slows spoilage to a sixth of normal
  for food resting within 4 tiles.
- **🍄 Food spoilage** — stockpiled (or just-lying-around) food now rots
  over time if left unattended (~10 in-game days unchilled); the food
  sprite itself darkens and specks as it turns, and a spoiled batch is
  swept with a single summary log line rather than one per item.
- All three now have proper Build-menu buttons (Build → Arcane) instead of
  only being reachable through the `5`/`6`/`U` hotkeys.

## v1.6.0 (build 23)
Weather, wildlife, and a Stats tab.

- **⛈️ Weather** — a surface-only condition layered on top of the season
  (Clear, Rain, Storm, Fog, Heatwave, Blizzard), rolled periodically with
  odds weighted by the current season and shown in the top-bar clock.
  A storm or blizzard chills mood and drains energy for elves working the
  surface, migrants and caravans wait it out rather than arrive mid-storm,
  and rain speeds up crop growth a little (a blizzard/heatwave slows it).
  As with raids, digging in underground stays completely sheltered from it.
- **🦊 Tamed animals** — wild foxes wander onto the map; a dwarf with the new
  **Taming** labor (trains a new *Taming* skill) can approach and win one
  over. A tamed fox bonds to its tamer, roams near them, and lifts the mood
  of any elf who spends time nearby — inspect one (wild or tamed) with the
  Inspect tool to see its status. A new milestone, **Best Friend**, marks
  the first one.
- **📊 Stats tab** — a new Colony panel tab: a population-over-time
  sparkline for this colony, lifetime production counters (stone mined,
  trees felled, food gathered, items crafted, structures built, animals
  tamed), and a cause-of-death breakdown pulled from the same persistent
  database as the Hall of Records — so it covers every colony you've
  ever played, not just this one.

## v1.5.2 (build 22)
- **🏆 Milestones** — 10 achievements (First Blood, Practically Immortal,
  Master Scholar, Against the Odds, Lost to the Dark, Love is in the Air,
  Down Under, Full House, Open for Business, Standing Army), unlocked once
  and remembered forever across every colony you play — a new section in
  the Hall of Records (Records tab) shows locked vs. unlocked, with a toast
  and log line the moment you earn one. Stored in the same persistent
  database as the elf records and chronicle (IndexedDB, with a localStorage
  fallback).

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
