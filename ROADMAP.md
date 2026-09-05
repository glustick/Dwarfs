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
volume sliders), **Z-levels** (dig a stairwell down to a new floor of
dense stone and ore; every system — jobs, hauling, beds, farms, workshops,
save/load — works across floors; raids/trade/migration stay surface-only),
**the Outbreak** (raids are now zombies — Shamblers/Runners/Brutes —
escalating with tech progress rather than day count; a bite can infect an
elf, who races a cure via the Hospital/Doctor pipeline or turns into a new
hostile), and a **tutorial** (a skippable guided walkthrough on a new game,
reopenable any time from the ❓ Help button).

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
- [ ] **Z-levels — Phase 2 (future)**: ramps (not just stairs), raiders/
      caravans/migrants reaching underground, underground water/flooding,
      cave-ins. Surface-only for raids/trade/migration was a deliberate
      Phase 1 scope cut, not an oversight.

## Tier 5 — The Outbreak

- [x] ~~The Outbreak — Phase 1~~ — raids are now zombies (Shambler/Runner/
      Brute), scaling in size and mix with `techTierScore()` (highest tech
      tier researched, plus a bonus per tech) instead of day count, shown
      via a 🦠 dread indicator. A zombie hit can infect an elf; they
      auto-seek a bed/Hospital and race an infection clock that a Doctor +
      Hospital + Medicine tech can reverse into a cure, or that runs out
      and turns them into a new hostile (`Turned Elf`) in their place.
- [ ] **The Outbreak — Phase 2 (future)**: vampires as a hidden day/night
      threat ("looks sick, hides during the day," can quietly turn others
      from the inside rather than announcing themselves like a zombie
      does); a quarantine zone; a Doctor "checkup" detection/tells
      mechanic for catching an infection before it's obvious; relationship-
      driven cover-ups (a partner concealing a loved one's infection); new
      defensive structures (palisades, watchtowers, traps) to lean further
      into the tower-defense angle.

---

### Notes
- **Tiers 1–5 (Phase 1s) are all shipped.** What's left is genuinely
  optional: Z-levels Phase 2, The Outbreak Phase 2 (vampires and the
  social-deduction angle are a meaningfully different, riskier system —
  worth their own dedicated round), or smaller quality-of-life ideas as
  they come up.
