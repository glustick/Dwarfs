# 🗺️ Elven Empire — Roadmap / Future Enhancements

Tracking list of planned improvements. Ordered by priority; check items off as
they land.

## ✅ Already shipped
Skills & titles · persistent colony database · scheduling · day/night cycle ·
habitat (beds/bedrooms/dining) · combat & raids · smelter/forge crafting chain ·
research tree · happiness · space-gated migration · time controls (pause/2×/4×) ·
categorized build menus · filterable event chronicle · **procedural audio**
(generative ambient score + gameplay SFX, day/night-aware, with a mute toggle) ·
**doors & gates** (passable, lockable-during-raids barriers; global lock/unlock
in the top bar) · **trade & economy** (Trade Depot zone, periodic caravans that
buy surplus gold bars/weapons/armor and sell food/wood/iron ore, Charisma-boosted
prices, coal now consumed as smelter fuel) · **real farming** (plant → grow →
harvest jobs in the Farm zone, driven by a 4-season year) · **injuries & the
Hospital** (badly wounded elves must rest in a bed and can be tended by a
Doctor — new Medicine labor/skill — for meaningfully faster recovery) ·
**Toughness** (combat attribute reducing damage taken and raising max hp) ·
**thirst & wells/brewing** (a second survival need; Well draws water,
Brewery turns water + food into mood-boosting Ale) · **relationships**
(elves develop love/hate opinions of each other, any pairing; partners get a
mood bonus sharing a Double Bed, decorated with Paintings) · **foresting**
(a Forester labor plants saplings to deliberately regrow logged forest) ·
**minimap**, **auto-pause alerts**, **stockpile categories**, **audio
polish** (combat tension music, per-workshop crafting tones, birdsong,
volume sliders), **Z-levels** (dig a stairwell — or a cheaper/faster ramp —
down to a new floor of dense stone and ore; every system — jobs, hauling,
beds, farms, workshops, save/load — works across floors; raids can now
follow you down a stairwell/ramp, rare aquifer veins flood when mined and
are reclaimable with a Drain designation, and large unsupported rooms can
cave in; trade/migration/wildlife stay surface-only), **the Outbreak**
(raids are now zombies — Shamblers/Runners/Brutes — escalating with tech
progress rather than day count; a bite can infect an elf, who races a cure
via the Hospital/Doctor pipeline or turns into a new hostile — or, rarely,
a Vampire's bite curses them secretly instead, hidden until a Doctor
checkup exposes it, routing them to a new Quarantine zone), a **tutorial**
(a skippable guided walkthrough on a new game, reopenable
any time from the ❓ Help button), **milestones** (11 persistent
achievements — Master Scholar, Against the Odds, Down Under, Best Friend, and
more — unlocked once and remembered forever across every colony, shown in the
Hall of Records), **weather** (Rain/Storm/Fog/Heatwave/Blizzard layered on
top of the season, surface-only, affecting mood/energy/crop growth and
pausing migrants/caravans mid-storm), **tamed animals** (wild foxes a
Taming-labor elf can win over; a tamed pet roams near its owner and lifts
nearby elves' mood), a **Stats tab** (population sparkline, lifetime
production counters, and a cross-colony cause-of-death breakdown), and
**Essence Craft** (Essence Well → Arcane Conduit → Frost Chamber power
network, food spoilage as the problem it solves, proper Build-menu buttons
and visuals — it had been left half-wired with no toolbar entry, no
rendering, and no actual power logic), **build materials** (a Wood/
Stone/Marble/Metal picker in the Build fly-out applies to walls, floors,
doors, and furniture; Marble is a new decorative vein found while mining,
Metal reuses forged iron bars, and both give a small mood bonus over
plain stone/wood — same pattern paintings already used), **defensive
structures** (a Palisade is a quick stake wall built in half the usual
time; a Watchtower gives a soldier fighting from it a passive damage/
defense bonus; a reusable Trap damages a raider that steps on it, never
colonists, and resets after a cooldown), **group selection** (drag a box to
select every elf inside — civilians too — with labor chips that retask the
whole group at once), and **room quality** (bedroom/dining zones flood-fill
into discrete rooms graded Cramped→Royal from enclosure, flooring,
materials, decor, and size; sleep and dining mood bonuses scale off the
actual room instead of colony-wide counters).

## Known loose ends to close
- [x] ~~Gold bars are a dead-end~~ — sold to caravans.
- [x] ~~Coal ore is a dead-end~~ — consumed as smelter fuel.
- [x] ~~Walls block all pathing~~ — doors are passable and lockable.

---

## Tier 1 — close the loops, add strategy
*(done — see Tier 2, recommended next)*

## Tier 2 — deepen thin systems

- [x] ~~Real farming~~ — Farm zone tiles are now plant → grow → harvest jobs
      worked by the Farming labor/skill, with a 4-season cycle (Spring/Summer/
      Autumn/Winter, shown in the top bar) driving how fast crops mature.
- [x] ~~Injuries & the Hospital~~ — a hit that drops an elf below 60% hp marks
      them wounded: they can no longer just shrug it off at work and must rest
      in a bed to heal. A Doctor (new Medicine labor/skill) tending them in a
      Hospital heals far faster than bed rest alone.
- [x] ~~Thirst + wells/brewing~~ — a second survival need with the same real
      stakes as hunger. A buildable Well draws Water; a Brewery turns Water +
      Food into Ale, a stronger drink that quenches more and lifts mood
      further — ties the new need directly into the farming loop.

## Tier 3 — UX & quality of life (cheap wins)

- [x] ~~Minimap~~ — bottom-right overview of the whole map with a live
      viewport box and elf/enemy dots; click it to jump the camera there.
- [x] ~~Auto-pause alerts~~ — a 🔔 toggle in the top bar that pauses the game
      the moment a raid starts, an elf dies, or an elf starts starving or
      dying of thirst — so crises aren't missed at high speed.
- [x] ~~Stockpile categories~~ — select a stockpile with Inspect to restrict
      what a whole contiguous pile accepts (Building/Ore & Bars/Food/Drink/
      Arms), so hauling organizes itself instead of dumping everything into
      whichever pile is nearest.
- [x] ~~Audio polish~~ — per-channel Music/SFX volume sliders (pause menu);
      the ambient score darkens, loudens, and speeds up during a raid; the
      Smelter/Forge/Well/Brewery each have a distinct crafting sound; sparse
      daytime birdsong.

## Tier 4 — the big one

- [x] ~~Z-levels (dig down) — Phase 1~~ — a 🌀 Dig Stairs designation carves
      a stairwell down to a newly-generated level below (dense stone + ore),
      connected end-to-end for pathfinding/hauling; a ⛰️ floor indicator and
      ▲/▼ controls (or `[`/`]`) switch which level the camera, tools, and
      minimap act on. Every system (jobs, beds, farms, workshops, stockpile
      filters, save/load) is floor-aware; older single-level saves still load.
- [x] ~~Z-levels — Phase 2~~ — a 🌀 Dig Ramp designation carves a faster/
      cheaper alternative to stairs (same portal mechanic, distinct visual);
      raids can now follow a dug stairwell/ramp down instead of only
      approaching from the surface edge (chance scales with how deep the
      colony has dug — "digging down always carries some risk"); rare
      aquifer veins flood permanently when mined into, spreading a little
      into adjacent mined-out floor, reclaimable with a 🪣 Drain designation;
      large unsupported mined-out rooms can randomly cave in, collapsing
      back to stone and hurting anyone caught underneath. Caravans/migrants/
      wildlife deliberately stay surface-only (a trade caravan or a new
      migrant has no reason to know about private tunnels).

## Tier 5 — The Outbreak

- [x] ~~The Outbreak — Phase 1~~ — raids are now zombies (Shambler/Runner/
      Brute), scaling in size and mix with `techTierScore()` (highest tech
      tier researched, plus a bonus per tech) instead of day count, shown
      via a 🦠 dread indicator. A zombie hit can infect an elf; they
      auto-seek a bed/Hospital and race an infection clock that a Doctor +
      Hospital + Medicine tech can reverse into a cure, or that runs out
      and turns them into a new hostile (`Turned Elf`) in their place.
- [x] ~~The Outbreak — Phase 2~~ — a rare Vampire raider's bite curses an
      elf secretly: no badge, no log line, they keep working their normal
      schedule with no outward sign anything's wrong. A Doctor with a spare
      moment gives elves periodic "checkups" (cooldown-gated, not tied to
      being wounded); an uncovered vampire has a skill-boosted chance of
      being exposed, at which point they're routed to a new Quarantine zone
      (needs Medicine, like Hospital) where a Doctor's care can still cure
      them. A partner or close friend automatically covers for a checkup
      (relationship affinity ≥ Friend), and if the curse is never caught —
      hidden or quarantined-but-untreated — it runs its course and the elf
      turns into a Vampire Lord, mirroring the zombie Turned Elf mechanic.
- [x] ~~The Outbreak — defensive structures~~ — a Palisade is a quick stake
      wall, half the build time of a proper wall (same wall otherwise, just
      faster to erect — mirrors how a Ramp differs from Stairs). A
      Watchtower gives any soldier fighting from that tile a passive combat
      bonus (more damage dealt, less taken) rather than its own ranged-
      attack mechanic. A Trap damages a raider that steps on it and resets
      after a cooldown — never affects colonists, purely a raider hazard.

## Player-requested backlog

- [x] ~~Manual military control~~ — box-select a soldier or squad with the
      Inspect tool and click a destination for a direct move order; they
      hold that ground (still fighting anything adjacent) instead of
      auto-chasing the nearest raider. Civilians stay fully automatic.
- [x] ~~Medicine moved to Tier 2~~ — was behind Scholarship at Tier 3, too
      late in the tree given how early injuries start mattering. Now only
      needs Rations, and costs less (260→160).
- [x] ~~Deconstruct & refund~~ — Cancel/Erase now tears down an
      already-built wall, floor, door, furniture piece, workshop, or
      conduit (walls/floors previously couldn't be removed at all) and
      refunds the exact material spent building it as a loose item.
- [x] ~~Wine~~ — a new Brewery recipe (Food + Food, no Water), more
      thematically elven than ale; quenches thirst less but lifts mood
      more, and elves prefer it when available.
- [x] ~~Elf sprites with pointed ears~~ — pointed ears added, the
      dwarvish beard removed.
- [x] ~~True per-item material choice~~ — the Build fly-out now makes material
      selection an explicit first step, followed by choosing the wall, floor,
      furniture, door, or palisade to place. The selected material is visibly
      highlighted and applied to the next designation; existing tile material,
      job, save, and refund mechanics are unchanged.
- [x] ~~Skills visible from the Schedule tab~~ — each elf's skill
      grid inline in the Schedule/labor panel (or a merged panel) so
      assigning labors and reviewing skills don't need flipping between
      the Colony and Schedule tabs.
- [x] ~~Check for updates on launch~~ — on the main menu, compare the
      running `RELEASE_VERSION`/`BUILD_NUMBER` (`js/version.js`) against
      the latest release on `glustick/Dwarfs` via the GitHub API, and show
      an "update available" banner/link if the local copy is behind. Note
      the realistic shape this takes: since the game is a static page with
      no build step or server, opened via `file://` or a plain static host,
      it can check-and-notify but can't silently rewrite its own files —
      "update" means walking the player through pulling/downloading the
      new version (`git pull`, re-download the release zip, or refresh a
      hosted deployment), not an automatic in-place patch.

- [x] ~~Undo map actions~~ — the last designation, build, zone, or erase
      action can be reversed with the ↶ button or Cmd/Ctrl+Z.

- [x] ~~Progressive workbenches and weapons~~ — Crafting Basics unlocks a
      Crafting Bench, Weaponsmithing unlocks a Weapons Bench with wooden,
      stone, and metal arms, Tailoring unlocks a Clothing Bench, and Electronics
      unlocks a dedicated Electronics Bench with circuits and laser blades.
      Higher-tier benches require larger multi-material construction bills.

- [x] ~~Blueprint copy/paste~~ — drag a rectangle with Copy, then place the
      copied structure and zone layout with Paste; pasted structures become
      fresh construction jobs and still consume their normal materials.

- [x] ~~Work priorities and production bills~~ — Schedule labor chips cycle
      through off/low/normal/high priority, and workshop inspectors support
      finite output targets or repeat-forever production.

- [x] ~~Pawn traits~~ — each new or migrating pawn receives two persistent
      traits such as Diligent, Lorekeeper, Warbound, Stalwart, Kindred, or
      Greenwarden; traits affect existing work, research, combat, mood, and
      nature systems and are shown in the inspector.

---

## Tier 6 — deeper systems

- [x] ~~Room quality~~ — Bedroom and Dining zone tiles flood-fill into
      discrete rooms graded Cramped → Modest → Fine → Grand → Royal from
      enclosure (walls/doors around the perimeter), flooring, build
      materials (marble/metal), decor (paintings; tables in dining halls),
      and size. Sleeping in a bedroom and eating in a dining hall scale
      their mood bonuses off the room's actual score instead of colony-wide
      counters; selecting a room tile shows its grade and its weakest point.
- [x] ~~Ranged tactics~~ — Archery (tech, after Weaponsmithing) unlocks the
      Bow and arrow bundles at the Weapons Bench. Bow-armed soldiers shoot
      from 6 tiles (8 from a Watchtower — a true firing position) with a
      line-of-sight check, consuming arrows from a 20-shot quiver that
      refills from stored bundles; melee with a bow is clumsy. The Bile
      Spitter is a new ranged zombie that lobs bile from 5 tiles, forcing
      melee defence to come to it.
- [x] ~~Modern & futuristic arms~~ — Ballistics (Tier 3) unlocks the iron
      Rifle and bullet boxes; Photonics (first Tier 4 tech) unlocks the
      Laser Rifle and energy cells. 8- and 10-tile reach, per-weapon ammo
      and sounds, and soldiers auto-upgrade to a strictly better spare
      weapon (returning the old one as an item) instead of needing
      micro-management.
- [ ] Factions — multiple neighbor groups with per-faction reputation,
      trade terms, and their own raid motivations beyond the zombie threat.
- [ ] Storyteller events — a pacing/event-pool system that curates
      incidents (migrant waves, strange merchants, disasters, windfalls)
      instead of purely timer-driven rolls.

---

### Notes
- **Tiers 1–5, both Phase 2 rounds, and defensive structures are all
      shipped.** Tier 6 is underway: room quality (v1.15.0), ranged tactics
      (v1.16.0), and the modern/futuristic weapon ladder (v1.17.0) shipped;
      factions and storyteller events are the open directions.
