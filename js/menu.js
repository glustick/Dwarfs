// ---- App: menus, save/load flow, autosave -----------------------------------

const AUTOSAVE_MINUTES = 10;

class App {
  constructor() {
    this.overlay = document.getElementById("overlay");
    this.inGame = false;     // a game is active (vs. sitting on the main menu)
    this.panel = "main";     // main | pause | save | load
    this.updateInfo = null;
    window.appMenuOpen = true;

    document.getElementById("menu-btn").addEventListener("click", () => {
      if (this.inGame) this.openPauseMenu();
    });

    // Autosave loop (real time).
    setInterval(() => this.autosave(), AUTOSAVE_MINUTES * 60 * 1000);

    // Also autosave the moment the tab is hidden or closed — not just on the
    // 10-minute timer — so switching away/closing up doesn't lose progress
    // made since the last tick. Doesn't catch a hard crash/force-quit, but
    // covers the normal close/tab-switch/navigate-away case.
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.autosave(); });
    window.addEventListener("pagehide", () => this.autosave());

    this.openMainMenu();
  }

  // ---- overlay helpers ----
  show(html, panel) {
    this.panel = panel;
    this.overlay.innerHTML = html;
    this.overlay.classList.remove("hidden");
    window.appMenuOpen = true;
  }
  hide() {
    this.overlay.classList.add("hidden");
    this.overlay.innerHTML = "";
    window.appMenuOpen = false;
  }

  toast(msg) {
    const box = document.getElementById("toast");
    const el = document.createElement("div");
    el.className = "toast-msg";
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ---- game lifecycle ----
  startGame(saveData, settings) {
    if (window.game) window.game.running = false; // stop old loop
    window.game = new Game(saveData, settings);
    this.inGame = true;
    this.hide();
    this.toast(saveData ? "Game loaded" : "A new elven empire is founded!");
    if (!saveData && window.tutorial && window.tutorial.shouldAutoShow()) window.tutorial.open();
  }

  resumeGame() {
    this.hide();
    if (window.game) window.game.paused = false;
    if (window.game) window.game.updateStats();
  }

  quitToMainMenu() {
    if (window.game) { window.game.running = false; window.game.paused = true; }
    this.inGame = false;
    this.openMainMenu();
  }

  onEscape() {
    if (!window.appMenuOpen) {
      if (this.inGame) this.openPauseMenu();
      return;
    }
    if (this.panel === "lost") return; // only the buttons leave this screen
    if (this.panel === "pause") this.resumeGame();
    else if (this.panel === "codex") {
      if (this.inGame) this.openPauseMenu(); else this.openMainMenu();
    }
    else if (this.panel === "newgame") {
      if (this.inGame) this.openPauseMenu(); else this.openMainMenu();
    }
    else if (this.panel === "save" || this.panel === "load") {
      if (this.inGame) this.openPauseMenu(); else this.openMainMenu();
    }
  }

  // ---- MAIN MENU ----
  openMainMenu() {
    const saves = SaveManager.list();
    const recent = saves[0];
    this.show(`
      <div class="menu-card">
        <div class="menu-title">🍃 <span class="pick">Elven Empire</span></div>
        <div class="menu-sub">Graphical edition — raise an empire in the greenwood</div>
        <div class="menu-btns">
          ${recent ? `<button class="menu-btn primary" id="mm-continue">
            <span class="mi">▶</span>
            <span>Continue<br><span style="font-size:12px;color:#b7a988">${recent.name} · Day ${recent.day} · ${recent.pop} elves · ${SaveManager.timeAgo(recent.savedAt)}</span></span>
          </button>` : ``}
          <button class="menu-btn" id="mm-new"><span class="mi">✨</span><span>New Game</span></button>
          <button class="menu-btn" id="mm-codex"><span class="mi">📖</span><span>Codex &amp; Help</span></button>
          <button class="menu-btn" id="mm-load">
            <span class="mi">📂</span><span>Load Game ${saves.length ? `<span style="color:#9c8a64">(${saves.length})</span>` : ""}</span>
          </button>
        </div>
        <div id="update-status" class="menu-update" aria-live="polite"></div>
        <div class="menu-version">v${RELEASE_VERSION} · build ${BUILD_NUMBER}</div>
      </div>`, "main");

    if (recent) document.getElementById("mm-continue").onclick = () => this.startGame(SaveManager.load(recent.name));
    document.getElementById("mm-new").onclick = () => this.openNewGameDialog(false);
    document.getElementById("mm-codex").onclick = () => this.openCodex();
    // Always reachable, even with zero saves — that's also where importing a
    // save from a file lives, e.g. carrying a save over to a freshly hosted
    // copy of the game (a new origin means fresh, empty localStorage).
    document.getElementById("mm-load").onclick = () => this.openLoadDialog();
    this.checkForUpdates();
  }

  checkForUpdates() {
    const status = document.getElementById("update-status");
    if (!status || this.updateInfo) {
      if (status && this.updateInfo) this.renderUpdateStatus(status);
      return;
    }
    status.textContent = "Checking for updates...";
    fetch("https://api.github.com/repos/glustick/Dwarfs/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    }).then(response => {
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      return response.json();
    }).then(release => {
      const remote = String(release.tag_name || "").replace(/^v/, "");
      const currentParts = RELEASE_VERSION.split(".").map(Number);
      const remoteParts = remote.split(".").map(Number);
      let comparison = 0;
      if (remoteParts.length === 3 && remoteParts.every(Number.isFinite)) {
        for (let i = 0; i < 3 && comparison === 0; i++) {
          if (remoteParts[i] !== (currentParts[i] || 0)) comparison = remoteParts[i] > (currentParts[i] || 0) ? 1 : -1;
        }
      }
      const newer = comparison > 0;
      this.updateInfo = { available: newer, latest: remote, url: release.html_url || "" };
      const currentStatus = document.getElementById("update-status");
      if (currentStatus) this.renderUpdateStatus(currentStatus);
    }).catch(() => {
      this.updateInfo = { unavailable: true };
      const currentStatus = document.getElementById("update-status");
      if (currentStatus) this.renderUpdateStatus(currentStatus);
    });
  }

  renderUpdateStatus(status) {
    status.innerHTML = "";
    if (this.updateInfo.unavailable) return;
    if (!this.updateInfo.available) {
      status.textContent = "You are up to date";
      return;
    }
    status.innerHTML = `Update available: <a href="${this.updateInfo.url}" target="_blank" rel="noopener">v${this.updateInfo.latest}</a>`;
  }

  // ---- THE COLONY IS LOST ----
  openColonyLost() {
    const g = window.game;
    if (!g) return;
    const s = g.colonySummary();
    this.show(`
      <div class="menu-card lost">
        <div class="lost-ico">🪦</div>
        <div class="menu-title" style="font-size:26px">The colony is lost</div>
        <div class="menu-sub">Every elf is gone. The greenwood takes the rest.</div>
        <div class="lost-grid">
          <div class="lost-tile"><b>${s.day}</b><span>days survived</span></div>
          <div class="lost-tile"><b>${s.peak}</b><span>elves at its height</span></div>
          <div class="lost-tile"><b>${s.techs}/${s.techTotal}</b><span>technologies</span></div>
          <div class="lost-tile"><b>${s.milestones}</b><span>milestones</span></div>
          <div class="lost-tile"><b>${s.burials || 0}</b><span>laid to rest</span></div>
          <div class="lost-tile"><b>${s.graves || 0}</b><span>graves dug</span></div>
        </div>
        <div class="mini" style="text-align:center">${s.difficulty} · ${s.map}</div>
        <div class="menu-btns" style="margin-top:18px">
          <button class="menu-btn primary" id="lost-new"><span class="mi">🌱</span><span>Found a new colony</span></button>
          <button class="menu-btn" id="lost-load"><span class="mi">📂</span><span>Load a save</span></button>
          <button class="menu-btn ghost" id="lost-menu"><span class="mi">🚪</span><span>Main menu</span></button>
        </div>
      </div>`, "lost");
    document.getElementById("lost-new").onclick = () => this.openNewGameDialog(false);
    document.getElementById("lost-load").onclick = () => this.openLoadDialog();
    document.getElementById("lost-menu").onclick = () => this.openMainMenu();
  }

  // ---- CODEX ----
  // A searchable handbook: category chips + entry list on the left, the article
  // on the right. Opened from the ❓ button or the pause menu.
  openCodex(entryId) {
    this.codexCat = this.codexCat || "All";
    this.codexQuery = this.codexQuery || "";
    this.codexEntry = entryId || this.codexEntry || CODEX_ENTRIES[0].id;
    if (!CODEX_BY_ID[this.codexEntry]) this.codexEntry = CODEX_ENTRIES[0].id;
    this.show(`
      <div class="menu-card codex">
        <div class="codex-head">
          <span class="codex-title">📖 Codex</span>
          <input id="codex-search" class="codex-search" type="search" placeholder="Search the codex…"
                 aria-label="Search the codex" value="${String(this.codexQuery).replace(/"/g, "&quot;")}" />
          <button class="tut-btn codex-tut" id="codex-tut">🎓 Tutorial</button>
          <button class="tut-btn codex-close" id="codex-close" aria-label="Close the codex">✕</button>
        </div>
        <div class="codex-body">
          <div class="codex-left">
            <div class="codex-cats" id="codex-cats"></div>
            <div class="codex-list" id="codex-list"></div>
          </div>
          <div class="codex-article" id="codex-article"></div>
        </div>
      </div>`, "codex");

    const draw = () => {
      const hits = searchCodex(this.codexQuery).filter(e => this.codexCat === "All" || e.cat === this.codexCat);
      document.getElementById("codex-cats").innerHTML = ["All"].concat(CODEX_CATEGORIES).map(c =>
        `<button class="codex-cat${c === this.codexCat ? " on" : ""}" data-cat="${c}">${c}</button>`).join("");
      document.getElementById("codex-list").innerHTML = hits.length
        ? hits.map(e => `<button class="codex-item${e.id === this.codexEntry ? " on" : ""}" data-id="${e.id}">
             <span class="ci-ico">${e.icon}</span><span class="ci-title">${e.title}</span><span class="ci-cat">${e.cat}</span>
           </button>`).join("")
        : `<div class="menu-empty">Nothing matches “${String(this.codexQuery).replace(/</g, "&lt;")}”.</div>`;
      const entry = hits.find(e => e.id === this.codexEntry) || hits[0];
      this.codexEntry = entry ? entry.id : null;
      document.getElementById("codex-article").innerHTML = entry
        ? `<h3>${entry.icon} ${entry.title}</h3>${entry.body}` : "";
      document.getElementById("codex-cats").querySelectorAll(".codex-cat").forEach((b) => {
        b.onclick = () => { this.codexCat = b.dataset.cat; draw(); };
      });
      document.getElementById("codex-list").querySelectorAll(".codex-item").forEach((b) => {
        b.onclick = () => { this.codexEntry = b.dataset.id; draw(); };
      });
    };
    draw();

    const search = document.getElementById("codex-search");
    if (search) {
      search.addEventListener("input", () => {
        this.codexQuery = search.value;
        this.codexEntry = null;
        draw();
      });
      search.focus();
    }
    const close = () => (this.inGame ? this.openPauseMenu() : this.openMainMenu());
    document.getElementById("codex-close").onclick = close;
    document.getElementById("codex-tut").onclick = () => {
      this.overlay.classList.add("hidden");
      window.appMenuOpen = false;
      if (window.tutorial) window.tutorial.open();
    };
  }

  // ---- NEW GAME SETUP ----
  // Difficulty and map size are picked before the world is generated: they scale
  // the Storyteller's pressure, raid size and cadence, how readily an angry
  // neighbour raids, hunger, and how much of a starting stock the elves get.
  // The last choice is remembered for the next colony.
  openNewGameDialog(fromPause = false) {
    const pick = loadNewGameSettings();
    const backTo = fromPause ? () => this.openPauseMenu() : () => this.openMainMenu();
    const cards = (list, group) => list.map(o => `
        <button class="opt-card${o.id === pick[group] ? " on" : ""}" data-group="${group}" data-id="${o.id}">
          <span class="opt-ico">${o.icon}</span>
          <span class="opt-name">${o.name}</span>
          <span class="opt-blurb">${o.blurb}</span>
          <span class="opt-meta">${o.meta}</span>
        </button>`).join("");
    this.show(`
      <div class="menu-card wide">
        <div class="menu-title" style="font-size:26px">✨ Found a new colony</div>
        <div class="menu-sub">Choose how the forest receives you.</div>
        <div class="menu-section-title">🌿 Difficulty</div>
        <div class="opt-grid">${cards(DIFFICULTIES, "difficulty")}</div>
        <div class="menu-section-title">🗺️ Map size</div>
        <div class="opt-grid">${cards(MAP_SIZES, "mapSize")}</div>
        <div class="menu-btns" style="margin-top:20px">
          <button class="menu-btn primary" id="ng-start"><span class="mi">🌱</span><span>Begin</span></button>
          <button class="menu-btn ghost" id="ng-back"><span class="mi">←</span><span>Back</span></button>
        </div>
      </div>`, "newgame");
    this.overlay.querySelectorAll(".opt-card").forEach((btn) => {
      btn.onclick = () => {
        pick[btn.dataset.group] = btn.dataset.id;
        if (btn.closest) btn.closest(".opt-grid").querySelectorAll(".opt-card")
          .forEach(b => b.classList.toggle("on", b === btn));
      };
    });
    document.getElementById("ng-start").onclick = () => {
      saveNewGameSettings(pick);
      this.startGame(null, pick);
    };
    document.getElementById("ng-back").onclick = backTo;
  }

  // ---- PAUSE / IN-GAME MENU ----
  openPauseMenu() {
    if (window.game) window.game.paused = true;
    if (window.game) window.game.updateStats();
    const g = window.game;
    const day = g ? Math.floor(g.time / DAY_LENGTH) + 1 : 1;
    this.show(`
      <div class="menu-card">
        <div class="menu-title" style="font-size:26px">⏸ Paused</div>
        <div class="menu-sub">Day ${day} · ${g ? g.dwarves.length : 0} elves${g ? ` · ${difficultyById(g.settings.difficulty).name} · ${mapSizeById(g.settings.mapSize).name}` : ""}</div>
        <div class="menu-btns">
          <button class="menu-btn primary" id="pm-resume"><span class="mi">▶</span><span>Resume</span></button>
          <button class="menu-btn" id="pm-save"><span class="mi">💾</span><span>Save Game</span></button>
          <button class="menu-btn" id="pm-load"><span class="mi">📂</span><span>Load Game</span></button>
          <button class="menu-btn" id="pm-codex"><span class="mi">📖</span><span>Codex &amp; Help</span></button>
          <button class="menu-btn" id="pm-new"><span class="mi">✨</span><span>New Game</span></button>
          <button class="menu-btn danger ghost" id="pm-main"><span class="mi">🚪</span><span>Quit to Main Menu</span></button>
        </div>
        <div class="menu-section-title">🎛 Interface</div>
        <div class="ui-row">
          <button class="spd" id="sound-btn" title="Sound on — click to mute" aria-label="Mute sound">🔊</button>
          <span class="ui-lbl">Sound</span>
          <button class="spd" id="autopause-btn" title="Auto-pause on crises (raid, death, starvation, dehydration)" aria-label="Disable auto-pause on crises">🔔</button>
          <span class="ui-lbl">Auto-pause</span>
          <button class="tut-btn ui-codex" id="help-btn">📖 Codex</button>
        </div>
        <div class="menu-section-title">🎨 Theme</div>
        <div class="theme-row" id="theme-row">
          <button class="theme-btn" data-theme="greenwood">Greenwood</button>
          <button class="theme-btn" data-theme="aether">Aether</button>
          <button class="theme-btn" data-theme="daylight">Daylight</button>
        </div>
        <div class="menu-section-title">🎚 Audio</div>
        <div class="vol-row"><span>Music</span><input type="range" id="vol-music" min="0" max="100" value="${Math.round((window.sound ? window.sound.musicVol : 1) * 100)}"><span>SFX</span><input type="range" id="vol-sfx" min="0" max="100" value="${Math.round((window.sound ? window.sound.sfxVol : 1) * 100)}"></div>
        <div class="menu-version">v${RELEASE_VERSION} · build ${BUILD_NUMBER}</div>
      </div>`, "pause");

    document.getElementById("pm-resume").onclick = () => this.resumeGame();
    document.getElementById("pm-save").onclick = () => this.openSaveDialog();
    document.getElementById("pm-load").onclick = () => this.openLoadDialog();
    document.getElementById("pm-codex").onclick = () => this.openCodex();
    document.getElementById("pm-new").onclick = () => {
      if (confirm("Start a new game? Unsaved progress will be lost.")) this.openNewGameDialog(true);
    };
    document.getElementById("pm-main").onclick = () => {
      if (confirm("Return to the main menu? Unsaved progress will be lost.")) this.quitToMainMenu();
    };
    const volMusic = document.getElementById("vol-music");
    if (volMusic) volMusic.addEventListener("input", (e) => { if (window.sound) window.sound.setMusicVolume(+e.target.value / 100); });
    const volSfx = document.getElementById("vol-sfx");
    if (volSfx) volSfx.addEventListener("input", (e) => { if (window.sound) window.sound.setSfxVolume(+e.target.value / 100); });
    const themeRow = document.getElementById("theme-row");
    if (themeRow) {
      const active = document.documentElement.getAttribute("data-theme") || "greenwood";
      themeRow.querySelectorAll(".theme-btn").forEach((btn) => {
        btn.classList.toggle("on", btn.dataset.theme === active);
        btn.onclick = () => { if (window.setTheme) window.setTheme(btn.dataset.theme); };
      });
    }
    // Sound, auto-pause and the codex now live in here rather than the top bar.
    const sndBtn = document.getElementById("sound-btn");
    if (sndBtn) sndBtn.onclick = () => { if (window.sound) window.sound.toggle(); };
    const apBtn = document.getElementById("autopause-btn");
    if (apBtn) apBtn.onclick = () => {
      const gg = window.game;
      if (!gg) return;
      gg.autoPause = !gg.autoPause;
      try { localStorage.setItem("ee_autopause", gg.autoPause ? "1" : "0"); } catch (e) {}
      this.syncInterfaceToggles();
      gg.updateStats();
    };
    const codexBtn = document.getElementById("help-btn");
    if (codexBtn) codexBtn.onclick = () => this.openCodex();
    this.syncInterfaceToggles();
  }

  // Reflect the relocated interface controls (they only exist while the pause
  // menu is on screen, so their state is pushed in whenever it is built).
  syncInterfaceToggles() {
    if (window.sound && window.sound._reflectToggle) window.sound._reflectToggle();
    const g = window.game;
    const apBtn = document.getElementById("autopause-btn");
    if (apBtn && g) {
      apBtn.classList.toggle("on", g.autoPause);
      apBtn.textContent = g.autoPause ? "🔔" : "🔕";
      apBtn.setAttribute("aria-label", g.autoPause ? "Disable auto-pause on crises" : "Enable auto-pause on crises");
    }
  }

  // ---- SAVE DIALOG ----
  openSaveDialog() {
    const g = window.game;
    const day = Math.floor(g.time / DAY_LENGTH) + 1;
    const suggested = `Empire Day ${day}`;
    const saves = SaveManager.list().filter(s => !s.auto);
    this.show(`
      <div class="menu-card">
        <div class="menu-title" style="font-size:24px">💾 Save Game</div>
        <div class="menu-sub">Name this save, or overwrite an existing one</div>
        <div class="name-row">
          <input id="sv-name" type="text" maxlength="40" value="${suggested}" />
          <button class="menu-btn primary" style="width:auto;padding:10px 18px" id="sv-do"><span>Save</span></button>
        </div>
        ${saves.length ? `<div class="menu-section-title">Overwrite existing</div>
        <div class="slot-list" id="sv-list"></div>` : ``}
        <div class="menu-btns" style="margin-top:18px">
          <button class="menu-btn ghost" id="sv-back"><span class="mi">←</span><span>Back</span></button>
        </div>
      </div>`, "save");

    const input = document.getElementById("sv-name");
    input.focus(); input.select();
    const doSave = () => {
      const name = (input.value || suggested).trim();
      if (!name) { this.toast("Enter a name"); return; }
      this.doSave(name);
    };
    document.getElementById("sv-do").onclick = doSave;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(); });

    const list = document.getElementById("sv-list");
    if (list) {
      for (const s of saves) {
        const row = document.createElement("div");
        row.className = "slot";
        row.innerHTML = `<div class="slot-main"><div class="slot-name">${s.name}</div>
          <div class="slot-meta">Day ${s.day} · ${s.pop} elves · ${SaveManager.timeAgo(s.savedAt)}${s.build ? ` · build ${s.build}` : ""}</div></div>`;
        row.querySelector(".slot-main").onclick = () => {
          if (confirm(`Overwrite “${s.name}”?`)) this.doSave(s.name);
        };
        list.appendChild(row);
      }
    }
    document.getElementById("sv-back").onclick = () => this.openPauseMenu();
  }

  doSave(name) {
    const res = SaveManager.save(name, window.game);
    if (res.ok) {
      this.toast(`Saved “${name}”`);
      if (window.game) window.game.log(`Game saved as “${name}”.`, "good", "system");
      this.openPauseMenu();
    } else {
      this.toast("Save failed: " + res.error);
      alert("Could not save the game.\n\n" + res.error +
        "\n\n(Browser storage may be full or disabled.)");
    }
  }

  // ---- LOAD DIALOG ----
  openLoadDialog() {
    const saves = SaveManager.list();
    const backTo = this.inGame ? () => this.openPauseMenu() : () => this.openMainMenu();
    this.show(`
      <div class="menu-card">
        <div class="menu-title" style="font-size:24px">📂 Load Game</div>
        <div class="menu-sub">Choose a save to resume</div>
        ${saves.length ? `<div class="slot-list" id="ld-list"></div>`
          : `<div class="menu-empty">No saved games yet.</div>`}
        <div class="menu-btns" style="margin-top:18px">
          <button class="menu-btn" id="ld-import"><span class="mi">📤</span><span>Import Save…</span></button>
          <button class="menu-btn ghost" id="ld-back"><span class="mi">←</span><span>Back</span></button>
        </div>
        <input type="file" accept="application/json,.json" id="ld-import-input" style="display:none">
      </div>`, "load");

    const list = document.getElementById("ld-list");
    if (list) {
      for (const s of saves) {
        const row = document.createElement("div");
        row.className = "slot" + (s.auto ? " auto" : "");
        row.innerHTML = `
          <div class="slot-main">
            <div class="slot-name">${s.name} ${s.auto ? '<span class="badge">auto</span>' : ""}</div>
            <div class="slot-meta">Day ${s.day} · ${s.pop} elves · ${SaveManager.timeAgo(s.savedAt)}${s.build ? ` · build ${s.build}` : ""}</div>
          </div>
          <button class="slot-export" title="Export to file">⬇</button>
          <button class="slot-del" title="Delete">🗑</button>`;
        row.querySelector(".slot-main").onclick = () => {
          const data = SaveManager.load(s.name);
          if (data) this.startGame(data);
          else this.toast("That save is corrupt.");
        };
        row.querySelector(".slot-export").onclick = (e) => {
          e.stopPropagation();
          this.exportSave(s.name);
        };
        row.querySelector(".slot-del").onclick = (e) => {
          e.stopPropagation();
          if (confirm(`Delete save “${s.name}”? This cannot be undone.`)) {
            SaveManager.delete(s.name);
            this.openLoadDialog();
          }
        };
        list.appendChild(row);
      }
    }
    document.getElementById("ld-back").onclick = backTo;
    document.getElementById("ld-import").onclick = () => document.getElementById("ld-import-input").click();
    document.getElementById("ld-import-input").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this.importFromFile(file);
    });
  }

  // ---- export / import (a save as a downloadable/uploadable .json file —
  // localStorage doesn't survive moving the game to a new host/origin) ----
  exportSave(name) {
    const raw = localStorage.getItem(SaveManager.key(name));
    if (!raw) { this.toast("Could not export — save missing."); return; }
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = name.replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-").toLowerCase() || "save";
    a.download = `elven-empire-${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  importFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (e) { this.toast("Not a valid save file."); return; }
      if (!data || !data.world || !data.dwarves) { this.toast("Not a valid Elven Empire save."); return; }
      const name = SaveManager.uniqueName((data.name || "Imported Save").trim() || "Imported Save");
      const res = SaveManager.saveRaw(name, data);
      if (res.ok) { this.toast(`Imported “${name}”`); this.openLoadDialog(); }
      else this.toast("Import failed: " + res.error);
    };
    reader.onerror = () => this.toast("Could not read that file.");
    reader.readAsText(file);
  }

  // ---- autosave ----
  autosave() {
    if (!this.inGame || !window.game || !window.game.running) return;
    const res = SaveManager.save(AUTOSAVE_NAME, window.game);
    if (res.ok) {
      this.toast("Autosaved");
      window.game.log("Autosaved.", "", "system");
    }
  }
}

window.addEventListener("load", () => { window.App = new App(); });
