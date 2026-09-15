# Playtesting Elven Empire

A browser colony sim — you lead a band of elves raising an empire in the greenwood.
Everything is drawn procedurally on a canvas and all audio is synthesised, so there
are no asset files and nothing to install.

## Getting it running

1. Download `elven-empire-v1.28.0.zip` from the latest release.
2. Unzip it anywhere and open `index.html` in a modern browser (Chrome, Safari,
   Firefox or Edge).
3. Alternatively play the hosted copy on the NAS share.

No build step, no dependencies, no network access required. The only outbound
request the game ever makes is the optional "check for updates" call on the main
menu, which degrades quietly if it is blocked.

**Please check the version in the bottom-right of the main menu and quote it in
any bug report** — it's the fastest way for me to know what you were running.

## A suggested first twenty minutes

1. **New Game** → pick a difficulty and map size (**Standard / Greenwood** is the
   tuned baseline). The last choice is remembered.
2. The tutorial runs automatically the first time — it's skippable, and the
   **Codex** (❓, or from the main menu) covers everything in more depth.
3. Chop a few trees (**C**) and mine some stone (**D**), then paint a
   **Stockpile** (**S**) so the goods actually get carried.
4. Research **Crafting Basics**, build a **Crafting Bench**, and queue clubs or
   stone knives — see *Arming your elves* below.
5. Beds in a **Bedroom** zone, then a **Well**, then look at the **📦 Stock** tab
   to see what you're actually short of.
6. Around **Day 4** the outbreak starts. This is the part I most want judged.

## What I would most like judged

- **The opening pace.** Is Day 4 the right moment for the first outbreak, or does
  it land before you can plausibly be ready? The crude weapons (knife, spear,
  short bow) were added specifically to make that survivable, and have **never
  been playtested**.
- **The difficulty presets.** Gentle / Standard / Harsh / Brutal are wired into
  raids, incident pressure, hunger and starting supplies — but only unit-tested.
  If Standard feels wrong, that's the most useful thing you can tell me.
- **Whether anything is incomprehensible.** The Codex is new; if you read an
  entry and still don't know what to do, that's a documentation bug.
- **The Storyteller's rhythm.** Events are paced by a pressure budget rather than
  a timer. Does it feel like a story or like noise?
- **Burial.** Bodies persist and can be buried in a graveyard (zone tool, **K**).
  Does that land emotionally, or is it just admin?
- **Anything that looks or feels broken**, obviously.

## What I already know is rough

- **Performance at scale.** Measured at ~0.09 ms per simulation step for 40 elves
  on a 120×92 map (about 0.5% of a 60fps frame budget) after this round's fix —
  but that is a synthetic, unfed, unplayed colony. A real 40-elf colony with lots
  of items and pathing may still stutter, especially at 4× speed. If you feel a
  slowdown, note roughly how many elves and how long the colony had been running.
- **The balance of the late tech tree** — rifles, lasers and the essence branch
  have had little attention.
- **Save robustness.** Saves live in browser local storage, are tied to that
  browser, and there is no migration path if the save format changes. Export a
  slot to a file if a colony matters.
- Known cosmetic gap: the HUD text is small (9–10px) on a large display, and
  there's no UI-scale setting yet.

## Reporting something

Useful: the build number, what you did, what you expected, what happened, and —
if it's an event in the game rather than a crash — the relevant line from the
**📜 Log** tab (it's filterable by orders, combat, factions, events…).

If the game throws a JavaScript error, opening the browser console (F12) and
pasting the first line is enormously helpful.

## For me (not the playtester)

Before handing a build over, run:

```bash
node tools/smoke.js        # 23 checks: systems, save/load, the burial pipeline
node tools/smoke-audio.js  # 6 checks: the audio graph and every sound mapping
node tools/soak.js 15 20   # 15 days of chaotic play, asserting invariants
node tools/stress.js       # load/timing; PROFILE=1 for the hot-method breakdown
```
