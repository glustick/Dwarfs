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
harvest jobs in the Farm zone, driven by a 4-season year).

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
- [ ] **Injuries & the Hospital** — combat **wounds** that require bed rest and a
      doctor (Medicine skill), giving Hospital/Medicine real teeth.
- [ ] **Thirst + wells/brewing** — a second survival need tied to farming and a
      buildable Well.

## Tier 3 — UX & quality of life (cheap wins)

- [ ] **Minimap** — 90×70 world is easy to get lost in.
- [ ] **Auto-pause alerts** — toggle to pause on raid / starvation so crises
      aren't missed at high speed.
- [ ] **Stockpile categories** — per-stockpile item-type filters (separate arms,
      ore, food) for cleaner logistics.
- [ ] **Audio polish** *(base system shipped)* — per-channel music/SFX volume
      sliders, tension music that ramps during raids, and richer per-action
      variety (distinct forge vs. smelter tones, ambient birdsong by day).

## Tier 4 — the big one

- [ ] **Z-levels (dig down)** — the signature "dig ever deeper" feature and the
      largest single upgrade; touches the world model, rendering, and
      pathfinding. Plan toward this once the surface loop is deep.

---

### Notes
- With **Trade + Doors** and now **Real farming** shipped, recommended next:
  **Injuries & the Hospital** (Tier 2) — the other thin system, and it pairs
  naturally with the existing combat/raid loop.
- Cheapest immediate polish: **Minimap + Auto-pause alerts** (Tier 3).
- With **audio now shipped**, the remaining Tier 3 sound work is optional polish
  rather than a gap.
