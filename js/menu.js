// ---- App: menus, save/load flow, autosave -----------------------------------

const AUTOSAVE_MINUTES = 10;

class App {
  constructor() {
    this.overlay = document.getElementById("overlay");
    this.inGame = false;     // a game is active (vs. sitting on the main menu)
    this.panel = "main";     // main | pause | save | load
    window.appMenuOpen = true;

    document.getElementById("menu-btn").addEventListener("click", () => {
      if (this.inGame) this.openPauseMenu();
    });

    // Autosave loop (real time).
    setInterval(() => this.autosave(), AUTOSAVE_MINUTES * 60 * 1000);

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
    this.toast(saveData ? "Game loaded" : "New fortress founded — strike the earth!");
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
        <div class="menu-title">⛏️ <span class="pick">Dwarf Fortress</span></div>
        <div class="menu-sub">Graphical edition — carve a home from the mountain</div>
        <div class="menu-btns">
          ${recent ? `<button class="menu-btn primary" id="mm-continue">
            <span class="mi">▶</span>
            <span>Continue<br><span style="font-size:12px;color:#b7a988">${recent.name} · Day ${recent.day} · ${recent.pop} dwarves · ${SaveManager.timeAgo(recent.savedAt)}</span></span>
          </button>` : ``}
          <button class="menu-btn" id="mm-new"><span class="mi">✨</span><span>New Game</span></button>
          <button class="menu-btn ${saves.length ? "" : ""}" id="mm-load" ${saves.length ? "" : "disabled"}>
            <span class="mi">📂</span><span>Load Game ${saves.length ? `<span style="color:#9c8a64">(${saves.length})</span>` : ""}</span>
          </button>
        </div>
      </div>`, "main");

    if (recent) document.getElementById("mm-continue").onclick = () => this.startGame(SaveManager.load(recent.name));
    document.getElementById("mm-new").onclick = () => this.startGame(null);
    const load = document.getElementById("mm-load");
    if (load && saves.length) load.onclick = () => this.openLoadDialog();
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
        <div class="menu-sub">Day ${day} · ${g ? g.dwarves.length : 0} dwarves</div>
        <div class="menu-btns">
          <button class="menu-btn primary" id="pm-resume"><span class="mi">▶</span><span>Resume</span></button>
          <button class="menu-btn" id="pm-save"><span class="mi">💾</span><span>Save Game</span></button>
          <button class="menu-btn" id="pm-load"><span class="mi">📂</span><span>Load Game</span></button>
          <button class="menu-btn" id="pm-new"><span class="mi">✨</span><span>New Game</span></button>
          <button class="menu-btn danger ghost" id="pm-main"><span class="mi">🚪</span><span>Quit to Main Menu</span></button>
        </div>
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
  }

  // ---- SAVE DIALOG ----
  openSaveDialog() {
    const g = window.game;
    const day = Math.floor(g.time / DAY_LENGTH) + 1;
    const suggested = `Fortress Day ${day}`;
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
          <div class="slot-meta">Day ${s.day} · ${s.pop} dwarves · ${SaveManager.timeAgo(s.savedAt)}</div></div>`;
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
      if (window.game) window.game.log(`Game saved as “${name}”.`, "good");
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
          <button class="menu-btn ghost" id="ld-back"><span class="mi">←</span><span>Back</span></button>
        </div>
      </div>`, "load");

    const list = document.getElementById("ld-list");
    if (list) {
      for (const s of saves) {
        const row = document.createElement("div");
        row.className = "slot" + (s.auto ? " auto" : "");
        row.innerHTML = `
          <div class="slot-main">
            <div class="slot-name">${s.name} ${s.auto ? '<span class="badge">auto</span>' : ""}</div>
            <div class="slot-meta">Day ${s.day} · ${s.pop} dwarves · ${SaveManager.timeAgo(s.savedAt)}</div>
          </div>
          <button class="slot-del" title="Delete">🗑</button>`;
        row.querySelector(".slot-main").onclick = () => {
          const data = SaveManager.load(s.name);
          if (data) this.startGame(data);
          else this.toast("That save is corrupt.");
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
  }

  // ---- autosave ----
  autosave() {
    if (!this.inGame || !window.game || !window.game.running) return;
    const res = SaveManager.save(AUTOSAVE_NAME, window.game);
    if (res.ok) {
      this.toast("Autosaved");
      window.game.log("Autosaved.", "");
    }
  }
}

window.addEventListener("load", () => { window.App = new App(); });
