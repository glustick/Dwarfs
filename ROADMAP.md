# 🗺️ Elven Empire — Roadmap / Future Enhancements

Tracking list of planned improvements. Ordered by priority; check items off as
they land.

## ✅ Already shipped
Skills & titles · persistent colony database · scheduling · day/night cycle ·
habitat (beds/bedrooms/dining) · combat & raids · smelter/forge crafting chain ·
research tree · happiness · space-gated migration · time controls (pause/2×/4×) ·
categorized build menus · filterable event chronicle · **procedural audio**
(generative ambient score + gameplay SFX, day/night-aware, with a mute toggle).

## Known loose ends to close
- [ ] **Gold bars are a dead-end** — smelted but nothing consumes them.
- [ ] **Coal ore is a dead-end** — mined but has no smelter recipe / use.
- [ ] **Walls block all pathing** — no doors/gates, so a base can't be both
      sealed and usable.

---

## Tier 1 — close the loops, add strategy (recommended next)

- [ ] **Trade & economy (caravans)**
  - Merchants visit periodically; sell surplus (gold bars, weapons, crafts),
    buy what's lacking (food, ore, wood).
  - Gives **gold bars a purpose**; makes **coal a smelter fuel**.
  - Prices influenced by the **Charisma** skill; rewards the smithing chain.
  - Adds a wealth/growth vector beyond migration.
  - *Audio hook:* a caravan-arrival horn/chime is a natural fit for the new
    sound system.
- [ ] **Doors & gates**
  - Buildable barriers elves can pass but that can be **locked during raids**.
  - Makes base design + the combat system meaningfully interact.
  - Reuses the existing build system.

## Tier 2 — deepen thin systems

- [ ] **Real farming** — replace the auto-producing Farm zone with
      plant → grow → harvest jobs (+ seasons) so the Farming labor/skill matters.
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
- Recommended bundle to do first: **Trade + Doors** (Tier 1) — eliminates the two
  dead-end resources and completes the economy + defense loops with moderate
  effort and strong synergy with existing systems (including a ready audio hook).
- Cheapest immediate polish: **Minimap + Auto-pause alerts** (Tier 3).
- With **audio now shipped**, the remaining Tier 3 sound work is optional polish
  rather than a gap.
