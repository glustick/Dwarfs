# 🗺️ Dwarf Fortress — Roadmap / Future Enhancements

Tracking list of planned improvements. Ordered by priority; check items off as
they land. (See commit history for what's already shipped: skills, scheduling,
day/night, habitat, combat/forge, research tree, happiness, trade of ideas…)

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
- [ ] **Doors & gates**
  - Buildable barriers dwarves can pass but that can be **locked during raids**.
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
- [ ] **Sound** — ambient music + pick/chop/build/combat SFX.

## Tier 4 — the big one

- [ ] **Z-levels (dig down)** — the signature Dwarf Fortress feature and the
      largest single upgrade; touches the world model, rendering, and
      pathfinding. Plan toward this once the surface loop is deep.

---

### Notes
- Recommended bundle to do first: **Trade + Doors** (Tier 1) — eliminates the two
  dead-end resources and completes the economy + defense loops with moderate
  effort and strong synergy with existing systems.
- Cheapest immediate polish: **Minimap + Auto-pause alerts** (Tier 3).
