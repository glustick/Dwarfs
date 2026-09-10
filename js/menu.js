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
    const helpBtn = document.getElementById("help-btn");
    if (helpBtn) helpBtn.addEventListener("click", () => { if (window.tutorial) window.tutorial.open(); });

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
  startGame(saveData) {
    if (window.game) window.game.running = false; // stop old loop
    window.game = new Game(saveData);
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
    if (this.panel === "pause") this.resumeGame();
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
          <button class="menu-btn" id="mm-load">
            <span class="mi">📂</span><span>Load Game ${saves.length ? `<span style="color:#9c8a64">(${saves.length})</span>` : ""}</span>
          </button>
        </div>
        <div id="update-status" class="menu-update" aria-live="polite"></div>
        <div class="menu-version">v${RELEASE_VERSION} · build ${BUILD_NUMBER}</div>
      </div>`, "main");

    if (recent) document.getElementById("mm-continue").onclick = () => this.startGame(SaveManager.load(recent.name));
    document.getElementById("mm-new").onclick = () => this.startGame(null);
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

  // ---- PAUSE / IN-GAME MENU ----
  openPauseMenu() {
    if (window.game) window.game.paused = true;
    if (window.game) window.game.updateStats();
    const g = window.game;
    const day = g ? Math.floor(g.time / DAY_LENGTH) + 1 : 1;
    this.show(`
      <div class="menu-card">
        <div class="menu-title" style="font-size:26px">⏸ Paused</div>
        <div class="menu-sub">Day ${day} · ${g ? g.dwarves.length : 0} elves</div>
        <div class="menu-btns">
          <button class="menu-btn primary" id="pm-resume"><span class="mi">▶</span><span>Resume</span></button>
          <button class="menu-btn" id="pm-save"><span class="mi">💾</span><span>Save Game</span></button>
          <button class="menu-btn" id="pm-load"><span class="mi">📂</span><span>Load Game</span></button>
          <button class="menu-btn" id="pm-new"><span class="mi">✨</span><span>New Game</span></button>
          <button class="menu-btn danger ghost" id="pm-main"><span class="mi">🚪</span><span>Quit to Main Menu</span></button>
        </div>
        <div class="menu-section-title">🎚 Audio</div>
        <div class="vol-row"><span>Music</span><input type="range" id="vol-music" min="0" max="100" value="${Math.round((window.sound ? window.sound.musicVol : 1) * 100)}"><span>SFX</span><input type="range" id="vol-sfx" min="0" max="100" value="${Math.round((window.sound ? window.sound.sfxVol : 1) * 100)}"></div>
        <div class="menu-version">v${RELEASE_VERSION} · build ${BUILD_NUMBER}</div>
      </div>`, "pause");

    document.getElementById("pm-resume").onclick = () => this.resumeGame();
    document.getElementById("pm-save").onclick = () => this.openSaveDialog();
    document.getElementById("pm-load").onclick = () => this.openLoadDialog();
    document.getElementById("pm-new").onclick = () => {
      if (confirm("Start a new game? Unsaved progress will be lost.")) this.startGame(null);
    };
    document.getElementById("pm-main").onclick = () => {
      if (confirm("Return to the main menu? Unsaved progress will be lost.")) this.quitToMainMenu();
    };
    const volMusic = document.getElementById("vol-music");
    if (volMusic) volMusic.addEventListener("input", (e) => { if (window.sound) window.sound.setMusicVolume(+e.target.value / 100); });
    const volSfx = document.getElementById("vol-sfx");
    if (volSfx) volSfx.addEventListener("input", (e) => { if (window.sound) window.sound.setSfxVolume(+e.target.value / 100); });
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
