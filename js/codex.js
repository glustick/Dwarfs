// ---- The Codex: in-game reference -------------------------------------------
//
// A searchable handbook for everything the game does. The tutorial teaches the
// opening moves; the Codex is the reference you come back to — every zone,
// labour, tech, threat and shortcut in one place.
//
// Entries are pure data. Each has a category (for the filter chips), search
// `tags`, and a short HTML `body`. Keep bodies to a few sentences: this is a
// reference, not a manual.

const CODEX_CATEGORIES = ["Basics", "Work", "Building", "Industry", "Survival", "Threats", "Neighbours", "Reference"];

const CODEX_ENTRIES = [
  // ---------------------------------------------------------------- Basics
  {
    id: "getting-started", icon: "🍃", title: "Getting started", cat: "Basics",
    tags: "start intro first steps beginner loop",
    body: `<p>You lead <b>seven elves</b> in a greenwood. The loop is always the same:</p>
      <ol>
        <li><b>Designate work</b> — mark trees to chop and stone to mine (hotkeys <b>C</b> and <b>D</b>).</li>
        <li><b>Haul it home</b> — designate a <b>Stockpile</b> (<b>S</b>) so Miners and Haulers actually move the goods.</li>
        <li><b>Build shelter</b> — beds in a Bedroom zone lift mood and energy (<b>E</b>, then <b>R</b>).</li>
        <li><b>Feed them</b> — forage first, then research <b>Agriculture</b> and lay out a Farm zone.</li>
        <li><b>Research</b> — scholars generate research points; the tree unlocks everything else.</li>
        <li><b>Defend</b> — from around <b>Day 4</b> the outbreak begins. Wall up, enlist soldiers.</li>
      </ol>
      <p>Elves do nothing you haven't asked for. If the colony is idle, it's because nothing is designated.</p>`,
  },
  {
    id: "difficulty", icon: "🌿", title: "Difficulty & map size", cat: "Basics",
    tags: "difficulty gentle standard harsh brutal map size start new game",
    body: `<p>Chosen on the <b>New Game</b> screen; a save keeps the difficulty it was founded under.</p>
      <p><b>Difficulty</b> scales the systems the game already runs on — not one global multiplier:</p>
      <ul>
        <li><b>🍃 Gentle</b> — raids ×0.7, events ×0.7, supplies ×1.5. For learning.</li>
        <li><b>🌳 Standard</b> — the tuned balance.</li>
        <li><b>🌩️ Harsh</b> — raids ×1.3, events ×1.3, supplies ×0.75.</li>
        <li><b>💀 Brutal</b> — raids ×1.5, events ×1.6, supplies ×0.5. Meant to be lost.</li>
      </ul>
      <p>It adjusts <i>Storyteller pressure, raid size, raid cadence, how readily a hostile neighbour raids, hunger rate, and starting supplies</i>.</p>
      <p><b>Map size</b>: Tight Grove (70×54), Greenwood (90×70) or Deep Forest (120×92) — more ore and wildlife, and more ground to defend.</p>`,
  },
  {
    id: "saving", icon: "💾", title: "Saving & loading", cat: "Basics",
    tags: "save load slot export import autosave storage version migrate accessibility palette scale colourblind",
    body: `<p>Saves live in your <b>browser's local storage</b> — they survive closing the tab, but not clearing site data or switching browsers.</p>
      <p>The pause menu has <b>Save</b> and <b>Load</b>: named slots, plus an automatic <b>Autosave</b>. Slots can be <b>exported</b> to a file and imported again, which is the sane way to move a colony between machines.</p>
      <p>A save records the map, every elf, stockpiles, research, reputation, the Storyteller's state and your difficulty. Saves are **versioned**: an older one is brought up to date when you load it (and says so), and one written by a newer build is refused with a reason rather than loaded half-broken.</p>
      <p>In **⏸ Menu → 🎛 Interface** you'll also find a **colour-safe palette** (ore gets a distinct shape as well as a colour) and a **compact / normal / large interface scale**.</p>`,
  },

  // ---------------------------------------------------------------- Work
  {
    id: "designating", icon: "⛏️", title: "Designating work", cat: "Work",
    tags: "mine chop gather plant dig stairs ramp drain designate orders cancel drag",
    body: `<p>Pick a tool and <b>drag a rectangle</b> to mark tiles. A line of text appears in the log confirming the order.</p>
      <ul>
        <li><b>⛏️ Mine</b> (<b>D</b>) — cuts through stone; strikes ore veins, marble and occasionally an <b>aquifer</b>.</li>
        <li><b>🪓 Chop</b> (<b>C</b>) — fells trees into logs.</li>
        <li><b>🌿 Gather</b> (<b>G</b>) — forage food and plants.</li>
        <li><b>🌲 Plant tree</b> (<b>P</b>) — reforests; needs Foresting.</li>
        <li><b>Stairs <b>Z</b> / Ramp <b>A</b></b> — carve a way down to the next Z-level.</li>
        <li><b>Drain</b> (<b>V</b>) — removes a flooded tile.</li>
      </ul>
      <p><b>X</b> erases a designation, a build order or a zone — the universal "never mind". Only the <i>top</i> Z-level tiles you can see are affected; switch floors with <b>[</b> and <b>]</b>.</p>`,
  },
  {
    id: "stockpiles", icon: "📦", title: "Stockpiles & hauling", cat: "Work",
    tags: "stockpile haul category filter store zone items stock inventory count",
    body: `<p>A <b>Stockpile</b> zone (<b>S</b>) is where loose items get carried. Each tile can be filtered to one category, so a tidy colony ends up with separate wood, ore, food, drink and arms piles.</p>
      <ul>
        <li><b>🧱 Building</b> — wood, stone, marble, components, cloth</li>
        <li><b>⛏️ Ore &amp; Bars</b> — ore, smelted bars, circuits</li>
        <li><b>🍄 Food</b> · <b>💧 Drink</b> — water, ale, wine</li>
        <li><b>⚔️ Arms</b> — weapons, armour, arrows, bullets, cells</li>
      </ul>
      <p>Items sitting on the ground still <b>exist</b> — they can be used from anywhere — but hauling them into a stockpile keeps the colony organised and is how a <b>Trade Depot</b> ends up stocked for sale. Hauling is the lowest-priority labour, so idle elves do it.</p>
      <p>The <b>📦 Stock</b> tab lists everything you own by type — materials, metal, food and drink, arms, and <b>ammunition</b> with its shot count — and flags archers who have run dry.</p>`,
  },
  {
    id: "burial", icon: "⚰️", title: "Death, graves & burial", cat: "Work",
    tags: "death die corpse body grave graveyard burial bury rest memorial cross lost",
    body: `<p>When an elf dies their <b>body stays where it fell</b> — they do not simply vanish. A body is a drag on the colony until it is dealt with, and it will never be hauled to a stockpile.</p>
      <p>Paint a <b>⚰️ Graveyard</b> zone (<b>K</b>) anywhere you like. Any elf with the <b>Hauling</b> labour will then fetch the body and <b>lay it to rest</b>: the corpse is consumed and the plot keeps a named marker — a stone cross, tinted with the colour of the elf buried there.</p>
      <p>Click a grave to read who lies there and on which day they died. Burial lifts the whole colony's mood a little, and the <b>📦 Stock</b> tab and the Colony header both count bodies still awaiting burial.</p>
      <p>If the last elf dies the colony is <b>lost</b> — the game ends and shows you how long it survived.</p>`,
  },
  {
    id: "labors", icon: "⚒️", title: "Labours & schedules", cat: "Work",
    tags: "labour labor jobs priority schedule sleep work shift assign skill",
    body: `<p>There are nine <b>labours</b>: Mining, Woodcutting, Farming, Building, Crafting, Hauling, Doctoring, Foresting and Taming. Elves decide what to do from the jobs available and their own skills — skilled elves work faster and produce more.</p>
      <p>The <b>Schedule</b> tab is where you shape a colony: give each elf a <b>Sleep / Work / Anything</b> timetable and switch individual labours on or off. A specialist who only mines stops wandering off to haul.</p>
      <p>Set a couple of elves to nothing but Doctoring, and lay out a Hospital — that combination is what actually saves lives.</p>`,
  },
  {
    id: "zones", icon: "📐", title: "Zones", cat: "Work",
    tags: "zone bedroom dining depot farm study hospital quarantine stockpile room",
    body: `<p>Zones are painted areas that give tiles a purpose. Roofed tiles inside a zone count as a room.</p>
      <ul>
        <li><b>🛏️ Bedroom</b> — beds must sit here; quality lifts mood and sleep.</li>
        <li><b>🍽️ Dining</b> — eat here with tables for a big happiness bonus.</li>
        <li><b>🛒 Depot</b> — where caravans trade; goods on depot tiles are what gets sold.</li>
        <li><b>🌾 Farm</b> — crops (needs <b>Agriculture</b>).</li>
        <li><b>📚 Study</b> — scholars research here (needs <b>Scholarship</b>).</li>
        <li><b>⚕️ Hospital</b> — faster healing; slows the infection.</li>
        <li><b>🚧 Quarantine</b> — slows a <i>known</i> vampire's turn (needs <b>Medicine</b>).</li>
        <li><b>⚰️ Graveyard</b> — where hauler elves bury the fallen (<b>K</b>).</li>
      </ul>
      <p>A zone with a door is how you make a room that can be sealed.</p>`,
  },

  // ---------------------------------------------------------------- Building
  {
    id: "building", icon: "🏗️", title: "Building", cat: "Building",
    tags: "build wall floor door material wood stone marble metal bed table torch",
    body: `<p>Everything is built as a <b>build order</b>: drag it out, and Builders carry the material and construct it.</p>
      <p><b>Pick the material first</b> — 🪵 Wood, 🪨 Stone, ⬜ Marble or ⚙️ Metal. Materials change cost, look and durability, not the footprint.</p>
      <p>Categories in the Build menu: <b>Construction</b> (wall, floor, door, palisade), <b>Furniture</b> (bed, double bed, table, painting), <b>Lighting</b> (torch, lantern, aether lamp), <b>Workshops</b> (smelter, forge, crafting, weapons, clothing, electronics, well, brewery), <b>Defences</b> (watchtower, trap) and <b>Arcane</b> (essence well, conduit, frost chamber).</p>
      <p>Several of these stay hidden until their research unlocks them.</p>`,
  },
  {
    id: "doors", icon: "🚪", title: "Doors, walls & locking", cat: "Building",
    tags: "door lock unlock wall defend seal palisade strangers",
    body: `<p>Walls block movement; <b>doors</b> let your elves through. That asymmetry is the whole point of a base: your elves can pass, <b>outsiders cannot</b>.</p>
      <p>Use the <b>🔒 / 🔓</b> buttons in the top bar to lock or unlock every door at once — normally at the start of a raid. Locked doors keep zombies and raiders out while your elves keep working inside; you can also seal an area to contain an infection.</p>
      <p>Palisades are the cheap outdoor version of a wall. A <b>Watchtower</b> extends an archer's range.</p>`,
  },
  {
    id: "zlevels", icon: "⛰️", title: "Z-levels, stairs & cave-ins", cat: "Building",
    tags: "z level floor stairs ramp dig down mine underground cave-in collapse support aquifer",
    body: `<p>The world is layered. Switch floors with <b>[</b> / <b>]</b> (or the ▲▼ buttons) and dig a <b>stairwell</b> (<b>Z</b>) or <b>ramp</b> (<b>A</b>) to connect them.</p>
      <p>Underground you find the ore veins, marble and coal that the surface lacks — and two hazards:</p>
      <ul>
        <li><b>💥 Cave-ins</b> — a wide unsupported ceiling can collapse. Leave pillars, or accept the risk.</li>
        <li><b>💧 Aquifers</b> — some stone is wet. Break into one and the chamber floods; use the <b>Drain</b> tool (<b>V</b>) to clear it.</li>
      </ul>
      <p>Underground has no weather and no daylight: it's always dark unless you light it.</p>`,
  },
  {
    id: "lighting", icon: "🔥", title: "Light, roofs & darkness", cat: "Building",
    tags: "light darkness roof enclosed room torch lantern lamp mood workspace gloomy",
    body: `<p>Once a room is <b>enclosed by a roof and walls</b>, it stops receiving daylight — and an unlit workspace is gloomy. Elves working in the dark lose mood, and the log will tell you a roof has settled over a room.</p>
      <p>Fix it with <b>🔥 torches</b>, <b>🏮 lanterns</b> or <b>aether lamps</b> (research-gated). Underground rooms need light from the start, since there is no daylight below.</p>
      <p>This is why the classic fortress shape — a lit, roofed hall — keeps everyone both efficient and cheerful.</p>`,
  },

  // ---------------------------------------------------------------- Industry
  {
    id: "research", icon: "🔬", title: "Research", cat: "Industry",
    tags: "research tech tree points scholar study unlock tier progress",
    body: `<p><b>Research points</b> accumulate from your elves and, once you have <b>Scholarship</b>, from elves working in a <b>Study</b>. The <b>Research</b> tab spends them — it shows a progress bar, what you've finished, and what each technology actually unlocks (🔓).</p>
      <p>There are <b>19 technologies</b> across four tiers, and most of the game is locked behind them: the Farm zone, tables, the hospital, the crafting benches, bows, rifles, lasers, and the whole essence branch.</p>
      <p>Priorities worth knowing: <b>Crafting Basics</b> and <b>Fletching</b> (clubs, knives, spears and a short bow — a real weapon before the forge), <b>Agriculture</b> (a food supply), <b>Medicine</b> (survive the outbreak), then <b>Weaponsmithing → Archery → Ballistics → Photonics</b> for the arms ladder and <b>Essence Craft</b> to stop food spoiling.</p>`,
  },
  {
    id: "crafting", icon: "🔨", title: "Crafting & workshops", cat: "Industry",
    tags: "craft workshop smelter forge bench bill recipe weapons clothing electronics components",
    body: `<p>Workshops turn raw goods into finished ones. Build the bench, select it, and choose a recipe from its <b>bill</b>. The <b>Bill target</b> sets how many to make: leave it at <b>0</b> to repeat forever, or enter a number (say 5) and the bench stops once it has produced that many.</p>
      <ul>
        <li><b>🔥 Smelter</b> — ore → metal bars.</li>
        <li><b>⚒️ Forge</b> — bars → weapons and armour.</li>
        <li><b>🛠️ Crafting Bench</b> — components and cloth, plus the <b>crude arms</b>: clubs, stone knives, stone spears, and (with <b>Fletching</b>) a short bow and arrow bundles.</li>
        <li><b>🗡️ Weapons Bench</b> — wooden, stone and metal arms; bows with <b>Archery</b>, rifles with <b>Ballistics</b>, laser blades with <b>Electronics</b>, laser rifles with <b>Photonics</b>.</li>
        <li><b>🧵 Clothing Bench</b> — cloth and reinforced armour.</li>
        <li><b>⚡ Electronics Bench</b> — circuits, and later energy cells.</li>
      </ul>
      <p>Elves <b>auto-equip a better weapon</b> if one is spare, so a working armory upgrades your whole militia.</p>`,
  },
  {
    id: "essence", icon: "✨", title: "Essence craft", cat: "Industry",
    tags: "essence conduit generator well frost chamber power spoil food magic arcane",
    body: `<p>The arcane branch, unlocked by <b>Essence Craft</b>. It works like a small power grid: an <b>Essence Well</b> or <b>Generator</b> produces power, and <b>Arcane Conduits</b> carry it.</p>
      <p>The practical payoff is the <b>Frost Chamber</b>: while powered, stockpiled food stops spoiling. Food that spoils is food you mined, farmed and hauled for nothing.</p>
      <p>Aether lamps also need the branch, and give the best light.</p>`,
  },
  {
    id: "artifacts", icon: "💎", title: "Artifacts & relics", cat: "Industry",
    tags: "artifact relic discover treasure rare loot",
    body: `<p>While working, an elf can occasionally <b>discover an artifact</b> — a rare relic found in the rock or soil. It goes into that elf's inventory and is announced in the log.</p>
      <p>They're rare by design (a small chance per discovery roll), and they're the kind of colony story you remember rather than a resource to spend.</p>`,
  },
  {
    id: "trade", icon: "🛒", title: "Trade & caravans", cat: "Industry",
    tags: "trade caravan depot sell buy gold bar price standing barter merchant",
    body: `<p>Build a <b>Trade Depot</b> zone (<b>Y</b>) on the surface. When a caravan arrives it walks to the depot and sells whatever is <b>sitting on depot tiles</b>.</p>
      <p>A caravan belongs to a <b>faction</b> and only buys what that faction wants (plus <b>gold bars</b>, which always sell). Your <b>standing</b> with that faction sets the price: friendlier neighbours pay better.</p>
      <p>The proceeds are spent automatically on whichever staple you're shortest of — food, wood or iron ore.</p>`,
  },

  // ---------------------------------------------------------------- Survival
  {
    id: "food", icon: "🍄", title: "Food & farming", cat: "Survival",
    tags: "food farm crop harvest gather forag plant season agriculture hunger eat starve",
    body: `<p>Early food comes from <b>foraging</b> (Gather, <b>G</b>). It won't last — research <b>Agriculture</b> and paint a <b>Farm</b> zone, where elves plant, tend and harvest crops.</p>
      <p><b>Growth depends on the season</b>: spring and summer are productive, autumn slows, winter is nearly barren. Put food by in the good months.</p>
      <p>Stored food <b>spoils</b> over time unless you build the <b>Frost Chamber</b> from the essence branch. Eating in a proper <b>Dining</b> hall, at tables, is a large happiness bonus — a hungry or miserable elf works badly and eventually starves.</p>`,
  },
  {
    id: "water", icon: "💧", title: "Water, ale & wine", cat: "Survival",
    tags: "water thirst drink well brewery ale wine mood dwarves elves",
    body: `<p>Thirst kills faster than hunger. Build a <b>Well</b> (<b>3</b>) for <b>water</b>, and a <b>Brewery</b> (<b>4</b>) once you can spare the ingredients.</p>
      <ul>
        <li><b>💧 Water</b> — quenches thirst, nothing more.</li>
        <li><b>🍺 Ale</b> (water + food) — quenches thirst <i>better</i>, and lifts mood.</li>
        <li><b>🍷 Wine</b> (food + food) — quenches less, but lifts mood the most. Very elven.</li>
      </ul>
      <p>Surface elves thirst much faster during a <b>heatwave</b>, so keep the stores full in summer.</p>`,
  },
  {
    id: "mood", icon: "🙂", title: "Mood & happiness", cat: "Survival",
    tags: "mood happiness thought bedroom dining table quality art painting trait unhappy tantrum",
    body: `<p>Happiness drives everything: miserable elves work slowly, and a colony in a bad mood spirals. It's built from many small things — quality bedrooms (beds, and doubly so with <b>Comfortable Quarters</b>), a furnished <b>dining hall</b>, paintings on the wall, ale and wine, light instead of darkness, and the thoughts elves report in the inspector.</p>
      <p><b>Traits</b> colour this: a <b>Kindred</b> elf gets more from company, a <b>Diligent</b> one simply works faster.</p>
      <p>The <b>Colony</b> tab shows every elf's mood at a glance; the inspector tells you their current thought, which is usually the fastest clue to what's wrong.</p>`,
  },
  {
    id: "skills", icon: "⭐", title: "Skills & experience", cat: "Survival",
    tags: "skill level xp experience training profession mine builder scholar grow",
    body: `<p>Elves gain <b>experience by doing work</b> — a miner improves at mining, a builder at building — and level up into named ranks (Competent, Proficient, Talented…). Higher skill is faster work and, in combat, more damage.</p>
      <p>Elves start with a spread of skill from their background, which is why your first miners are usually already decent at it.</p>
      <p><b>Train deliberately</b>: a colony of specialists beats seven generalists, and the Schedule tab is how you enforce it.</p>`,
  },
  {
    id: "animals", icon: "🐾", title: "Animals & taming", cat: "Survival",
    tags: "animal tame pet fox wildlife wolf hunt",
    body: `<p>Wildlife wanders the surface. Set the <b>Taming</b> labour and an elf will try to befriend wild animals; a tamed animal becomes a <b>pet</b> with an owner, and is a real happiness boost.</p>
      <p>Not every animal is friendly — some wildlife will hunt your elves, and the Storyteller's <b>hunting packs</b> are wolves, not pets. Taming is surface-only, like everything else wildlife.</p>`,
  },

  // ---------------------------------------------------------------- Threats
  {
    id: "outbreak", icon: "🦠", title: "The outbreak", cat: "Threats",
    tags: "zombie outbreak infection bite turn infected shambler horde dread quarantine hospital cure",
    body: `<p>Around <b>Day 4</b> the outbreak begins, and it <b>escalates the further you research</b> — the <b>🦠 dread meter</b> in the top bar tracks how dangerous the world has become. That's the central tension: progress buys you tools and worse enemies at the same time.</p>
      <p>Elves <b>bitten</b> are <i>infected</i>. The infection clock always ticks toward turning, and only decisive care pushes it back:</p>
      <ul>
        <li><b>⚕️ Hospital</b> zone — −0.5 to the rate</li>
        <li><b>Medicine</b> tech — −0.4</li>
        <li><b>A doctor treating them</b> — −0.6 (the strongest lever)</li>
      </ul>
      <p>Stack all three and an elf not only survives, they <b>fight the infection off</b>. Walls, locked doors and a standing army are the other half of the answer.</p>`,
  },
  {
    id: "vampirism", icon: "🩸", title: "Vampirism", cat: "Threats",
    tags: "vampire curse hidden exposed checkup quarantine nosferatu cure turn lord",
    body: `<p>Rare, and only once you're deep in the tech tree. An elf can carry the vampiric curse <b>hidden</b> — while hidden, the clock ticks toward turning and <b>nothing can slow it</b>. A <b>checkup</b> is what exposes it (that's the "audit uncovers the truth" moment).</p>
      <p>Once <b>exposed</b>, it behaves like an infection: <b>Quarantine</b> (−0.5), <b>Medicine</b> (−0.4) and an actively treating <b>doctor</b> (−0.6) can turn the rate negative, and a cured elf is announced and celebrated.</p>
      <p>Let the clock run out and the elf turns — becoming a Vampire, and eventually a <b>Vampire Lord</b>.</p>`,
  },
  {
    id: "combat", icon: "⚔️", title: "Combat & soldiers", cat: "Threats",
    tags: "combat soldier enlist weapon armour armor bow rifle laser arrow bullet watchtower trap defence",
    body: `<p>Enlist elves as soldiers from the inspector (<b>⚔ Enlist</b>). They'll train, arm themselves from your stores, and intercept threats.</p>
      <p>You can't armour an elf with nothing, so the ladder starts cheap: <b>wooden club</b> → <b>stone knife</b> → <b>stone spear</b> (all from a Crafting Bench), then a <b>short bow</b> with <b>Fletching</b> — a real ranged weapon available while the forge is still a research project.</p>
      <ul>
        <li><b>Melee</b> — clubs, knives and spears early, then iron swords and axes; short reach, solid damage.</li>
        <li><b>🏹 Short bow</b> — fires from 4 tiles on a slower reload; enough to keep an elf out of biting distance. The <b>longbow</b> reaches 6 (8 from a Watchtower).</li>
        <li><b>🔫 Rifles</b> — 8 tiles, quicker reload than a bow, using bullets.</li>
        <li><b>💫 Laser rifles</b> — 10 tiles and the fastest rate of fire in the empire, on energy cells.</li>
      </ul>
      <p>Armour reduces damage, and <b>traps</b> soften an approach. Soldiers <b>auto-upgrade</b> to a better spare weapon, so a well-stocked armory is a militia upgrade.</p>`,
  },
  {
    id: "storyteller", icon: "🎭", title: "The Storyteller", cat: "Threats",
    tags: "storyteller events incidents pacing pressure migrant merchant blight vermin pack goblin threats",
    body: `<p>Events aren't on a fixed clock. A <b>Storyteller</b> accumulates <i>pressure</i> as your colony grows older, larger and richer, then spends it on one <b>incident</b> at a time from a weighted pool that reads your colony's actual state.</p>
      <p>Expect <b>migrant waves</b> and wandering specialists, <b>strange merchants</b>, hidden caches, wild bounties and a neighbour's gift — and, less happily, <b>blights</b>, vermin, dry spells, <b>hunting packs</b> and <b>goblin war-bands</b>.</p>
      <p>Its current pace and recent tales are in the <b>Stats</b> tab, and everything it does lands in the log's <b>🎭 Events</b> filter.</p>`,
  },

  // ---------------------------------------------------------------- Neighbours
  {
    id: "factions", icon: "🤝", title: "Factions & reputation", cat: "Neighbours",
    tags: "faction reputation standing allied hostile rival verdant ironhold thornwatch raid gift diplomat",
    body: `<p>Three neighbours ring the greenwood, each tracking its own <b>standing</b> with you, from Hostile (−100) to Allied (+100). The <b>Factions</b> tab shows it all.</p>
      <ul>
        <li><b>🌿 Verdant Concord</b> — traders who pay well for food, ale, wine and wood. Rival: Ironhold.</li>
        <li><b>⚒️ Ironhold Compact</b> — delvers who want ore, marble and bars. Raids to <b>plunder</b>.</li>
        <li><b>🏴 Thornwatch</b> — marauders who buy arms and fight for the rest.</li>
      </ul>
      <p>Standing rises as you trade and falls when you sell arms to a rival or cut down their raiders; it also drifts slowly back toward neutral. Get a neighbour to <b>Friendly</b> and it may send a gift; push one below its threshold and it <b>raids</b> — on its own clock, separate from the outbreak.</p>
      <p>Ironhold's raids are special: its <b>looters</b> make for your stockpiles, grab what they can, and run for the map edge. Kill them and the goods drop back; let them escape and it's gone.</p>`,
  },

  // ---------------------------------------------------------------- Reference
  {
    id: "hotkeys", icon: "⌨️", title: "Keyboard shortcuts", cat: "Reference",
    tags: "hotkey key keyboard shortcut bind control commands",
    body: `<table class="codex-keys">
      <tr><td><b>Q</b></td><td>Inspect</td><td><b>D</b></td><td>Mine</td></tr>
      <tr><td><b>C</b></td><td>Chop trees</td><td><b>G</b></td><td>Gather</td></tr>
      <tr><td><b>P</b></td><td>Plant tree</td><td><b>Z</b> / <b>A</b></td><td>Dig stairs / ramp</td></tr>
      <tr><td><b>V</b></td><td>Drain</td><td><b>X</b></td><td>Erase / cancel</td></tr>
      <tr><td><b>S</b></td><td>Stockpile</td><td><b>B</b></td><td>Wall (build)</td></tr>
      <tr><td><b>F</b></td><td>Floor</td><td><b>E</b></td><td>Bed</td></tr>
      <tr><td><b>1</b></td><td>Smelter</td><td><b>2</b></td><td>Forge</td></tr>
      <tr><td><b>3</b></td><td>Well</td><td><b>4</b></td><td>Brewery</td></tr>
      <tr><td><b>5</b></td><td>Generator</td><td><b>6</b></td><td>Frost chamber</td></tr>
      <tr><td><b>U</b></td><td>Conduit</td><td><b>O</b></td><td>Door</td></tr>
      <tr><td><b>R</b></td><td>Bedroom zone</td><td><b>T</b></td><td>Dining zone</td></tr>
      <tr><td><b>K</b></td><td>Graveyard zone</td><td><b>Y</b></td><td>Depot zone</td></tr>
      <tr><td><b>Y</b></td><td>Depot zone</td><td><b>Space</b></td><td>Pause</td></tr>
      <tr><td><b>+</b> / <b>−</b></td><td>Game speed</td><td><b>[</b> / <b>]</b></td><td>Floor up / down</td></tr>
      <tr><td><b>⌘/Ctrl+Z</b></td><td>Undo map action</td><td><b>Esc</b></td><td>Close / pause menu</td></tr>
    </table>`,
  },
  {
    id: "glossary", icon: "📖", title: "Items & materials", cat: "Reference",
    tags: "item material wood stone ore bar food water ale wine marble component cloth circuit arrow bullet cell glossary",
    body: `<table class="codex-keys">
      <tr><td>🪵 <b>Wood</b></td><td>Felled trees. Building and fuel.</td></tr>
      <tr><td>🪨 <b>Stone</b></td><td>Mined. Building.</td></tr>
      <tr><td>⬜ <b>Marble</b></td><td>Rare vein. Builds directly — no smelting.</td></tr>
      <tr><td>⛏️ <b>Ore</b></td><td>Iron, gold or coal. Smelt it.</td></tr>
      <tr><td>🔩 <b>Bars</b></td><td>Smelted metal, for arms and armour.</td></tr>
      <tr><td>🍄 <b>Food</b></td><td>Foraged or farmed. Spoils.</td></tr>
      <tr><td>💧 <b>Water</b> · 🍺 <b>Ale</b> · 🍷 <b>Wine</b></td><td>Drink. Ale best for thirst, wine for mood.</td></tr>
      <tr><td>⚙️ <b>Components</b> · 🧵 <b>Cloth</b></td><td>Crafting bench products.</td></tr>
      <tr><td>⚡ <b>Circuits</b></td><td>Electronics bench. Gates the modern arms.</td></tr>
      <tr><td>🏹 <b>Arrows</b> · 🔫 <b>Bullets</b> · 🔋 <b>Cells</b></td><td>Ammunition — bundles of 5, boxes of 10.</td></tr>
    </table>`,
  },
  {
    id: "seasons", icon: "🍂", title: "Seasons & weather", cat: "Reference",
    tags: "season spring summer autumn winter weather rain storm fog heatwave blizzard thirst crop",
    body: `<p>Four seasons turn over roughly every ten days, and they change farming, music and mood.</p>
      <ul>
        <li><b>🌱 Spring</b> / <b>☀️ Summer</b> — crops grow; summer heat makes surface elves thirst faster.</li>
        <li><b>🍂 Autumn</b> — growth slows. Store food now.</li>
        <li><b>❄️ Winter</b> — crops barely grow; cold and dark.</li>
      </ul>
      <p>Weather rolls on top: <b>rain</b>, <b>fog</b>, <b>storms</b>, <b>heatwaves</b> and <b>blizzards</b>. Harsh weather halts migrants and caravans, and thunderstorms are audible in the ambience. The top bar always shows the date, weather and season.</p>`,
  },
  {
    id: "milestones", icon: "🏆", title: "Milestones & records", cat: "Reference",
    tags: "milestone record achievement stats deaths history chronicle",
    body: `<p><b>Records</b> keeps the colony's story: milestones you've hit (First Blood, Down Under, Diplomat, Blood Feud…), a roster of every elf who ever lived here, and a chronicle of the notable events.</p>
      <p>Milestones unlock naturally as you play — reaching <b>Allied</b> with a neighbour earns <b>Diplomat</b>; driving one to open hostility earns <b>Blood Feud</b>.</p>
      <p>The <b>Stats</b> tab tracks population, production, research rate, causes of death, the Storyteller's pacing, and the difficulty and map this colony was founded on.</p>`,
  },
  {
    id: "tips", icon: "💡", title: "Tips from the wood", cat: "Reference",
    tags: "tips advice beginner strategy help tricks",
    body: `<ul>
      <li><b>Designate work or nothing happens.</b> Seven idle elves means an empty order queue.</li>
      <li><b>Arm them before Day 4.</b> Research <b>Crafting Basics</b> (or <b>Fletching</b> for bows) and queue clubs, knives, spears or short bows at the Crafting Bench — an unarmed elf loses to a single zombie.</li>
      <li><b>Stockpiles first.</b> Un-hauled goods are chaos; a filtered stockpile is a functioning colony.</li>
      <li><b>Research Agriculture early</b> — foraging cannot feed a growing colony through winter.</li>
      <li><b>Build the hospital before you need it</b>, and give one elf Doctoring as their only job.</li>
      <li><b>Lock the doors when the dread meter moves.</b> Walls buy time; time wins fights.</li>
      <li><b>Trade raises standing</b> — and standing is the cheapest defence you'll ever buy.</li>
      <li><b>Light your rooms.</b> A roofed, unlit workshop quietly drains mood.</li>
      <li><b>Dig down when the surface runs thin</b> — but leave pillars, and watch for aquifers.</li>
    </ul>`,
  },
];

const CODEX_BY_ID = {};
for (const e of CODEX_ENTRIES) CODEX_BY_ID[e.id] = e;

// Free-text search across title, tags and body text. All terms must match.
function searchCodex(query) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return CODEX_ENTRIES.slice();
  return CODEX_ENTRIES.filter(e => {
    const hay = (e.title + " " + e.cat + " " + e.tags + " " + e.body.replace(/<[^>]*>/g, " ")).toLowerCase();
    return terms.every(t => hay.includes(t));
  });
}
