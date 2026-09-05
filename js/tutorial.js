// ---- Tutorial: a short, skippable guided walkthrough for new colonies ------

const TUTORIAL_STEPS = [
  { icon: "🍃", title: "Welcome to Elven Empire", body:
    "Your seven elves have just arrived. Raise a thriving woodland empire — mine, build, research, and defend against the outbreak. This quick walkthrough covers the basics; skip it any time with the ✕, or reopen it later from the <b>❓</b> button." },
  { icon: "⛏️", title: "Designate work", body:
    "Open <b>Orders</b> (left toolbar) and drag over trees, bushes, or grey stone to mark them for chopping, gathering, or mining. Elves pick up marked jobs on their own." },
  { icon: "📦", title: "Stockpiles", body:
    "Open <b>Zones</b> and drag over open ground to mark a <b>Stockpile</b>. Elves with the Hauling labor carry loose logs, stone, and food there automatically." },
  { icon: "🧱", title: "Build", body:
    "Open <b>Build</b> to queue walls, floors, beds, and workshops — each consumes stone or wood from a stockpile. Beds let elves sleep, and give migrants somewhere to live." },
  { icon: "🛌", title: "Zones for living", body:
    "Paint a <b>Bedroom</b> zone over your beds and a <b>Dining</b> zone over a table (Zones menu) — resting or eating there lifts mood." },
  { icon: "📋", title: "Schedule & labors", body:
    "The <b>Schedule</b> tab (right panel) sets each elf's shift and which labors they'll take — not every elf needs to do everything." },
  { icon: "🔬", title: "Research", body:
    "The <b>Research</b> tab spends points (earned from Intelligence and Study zones) on techs that unlock Farms, Hospitals, and efficiency bonuses." },
  { icon: "🧟", title: "Defend the colony", body:
    "From around Day 4, the outbreak arrives — watch the 🦠 dread indicator (top bar); it worsens the more you research. Wall off your base, enlist soldiers, and get the infected into a Hospital fast." },
];

class Tutorial {
  constructor() {
    this.el = document.getElementById("tutorial-card");
    this.step = 0;
  }

  shouldAutoShow() {
    try { return localStorage.getItem("ee_tutorial_seen") !== "1"; } catch (e) { return true; }
  }

  markSeen() {
    try { localStorage.setItem("ee_tutorial_seen", "1"); } catch (e) {}
  }

  open() {
    if (!this.el) return;
    this.step = 0;
    this.el.classList.remove("hidden");
    this.render();
  }

  close() {
    if (!this.el) return;
    this.el.classList.add("hidden");
    this.el.innerHTML = "";
    this.markSeen();
  }

  render() {
    const s = TUTORIAL_STEPS[this.step];
    const last = this.step === TUTORIAL_STEPS.length - 1;
    const dots = TUTORIAL_STEPS.map((_, i) =>
      `<span class="tut-dot${i === this.step ? " on" : ""}"></span>`).join("");
    this.el.innerHTML = `
      <div class="tut-head"><span class="tut-icon">${s.icon}</span><span class="tut-title">${s.title}</span>
        <button class="tut-x" id="tut-close" title="Skip">✕</button></div>
      <div class="tut-body">${s.body}</div>
      <div class="tut-dots">${dots}</div>
      <div class="tut-nav">
        <button class="tut-btn" id="tut-back"${this.step === 0 ? " disabled" : ""}>Back</button>
        <button class="tut-btn" id="tut-next">${last ? "Let's go!" : "Next"}</button>
      </div>`;
    this.el.querySelector("#tut-close").onclick = () => this.close();
    this.el.querySelector("#tut-back").onclick = () => { if (this.step > 0) { this.step--; this.render(); } };
    this.el.querySelector("#tut-next").onclick = () => {
      if (last) this.close(); else { this.step++; this.render(); }
    };
  }
}

window.tutorial = new Tutorial();
