// ---- Audio: procedural music + sound effects (Web Audio API) ----------------
// Everything is synthesized at runtime — no .mp3/.ogg asset files — so it works
// straight from file:// like the rest of the game. A gentle generative ambient
// score plays under a set of short, procedurally-built sound effects. Browsers
// block audio until the first user gesture, so the context is created/resumed on
// the first click or key press.

const SOUND_PREF_KEY = "ee_sound_on";
const MUSIC_VOL_KEY = "ee_music_vol";
const SFX_VOL_KEY = "ee_sfx_vol";
const MUSIC_BASE_GAIN = 0.32; // "100%" reference gains — day baseline
const SFX_BASE_GAIN = 0.6;

// A-minor-pentatonic scale (A C D E G) — calm and "woodland". Semitone offsets
// from A used to build note frequencies across octaves.
const PENTA = [0, 3, 5, 7, 10];
const A2 = 110; // Hz
// `degree` carries across octaves (e.g. 7 is one octave above degree 2), and
// wraps correctly for negative degrees too — without this, anything past the
// 5th degree just repeated the same pitch instead of climbing higher.
function pentaFreq(octave, degree) {
  const idx = ((degree % PENTA.length) + PENTA.length) % PENTA.length;
  const octShift = Math.floor(degree / PENTA.length);
  return A2 * Math.pow(2, octave + octShift + PENTA[idx] / 12);
}

// A short root-degree progression the bass drone cycles through (one chord
// per 16 steps), plus a melodic contour (relative scale degrees) replayed
// each chord, transposed to the current root — instead of an unconstrained
// random walk. A single fixed progression/phrase pair loops in ~16-20s,
// which is fine for a minute but turns into an obvious treadmill over a
// long play session — so several of each are defined here, and the
// generator rerolls to a different (progression, phrase) pair every time a
// full cycle completes (see `_rerollSection`), instead of looping the same
// one forever.
const CHORD_PROGRESSIONS = [
  [0, 2, 3, 4], // i - iv - v - VII
  [0, 3, 2, 4], // i - v - iv - VII
  [0, 4, 3, 2], // i - VII - v - iv
  [2, 0, 4, 3], // iv - i - VII - v
];
const PHRASE_SHAPES = [
  [0, 1, 2, 1, 3, 2, 1, 0],
  [0, 2, 1, 3, 2, 0, 1, -1],
  [3, 2, 1, 0, 1, 2, 3, 4],
  [0, 0, 1, 2, 2, 1, 0, -1],
];
// Chord tones (relative to the root) the arpeggio layer arpeggiates through.
const ARP_PATTERN = [0, 2, 4, 2];

// Per-season musical colour: tempo (ms per step), how bright the score sits
// (low-pass cutoff, Hz), which octave the melody sings in, and whether a low
// drone fifth hums underneath. Winter is darker and slower, summer brighter
// and brisker — the score tracks the turning of the year.
const SEASON_MUSIC = [
  { stepMs: 250, filter: 1500, oct: 2, drone: false }, // Spring
  { stepMs: 220, filter: 1900, oct: 2, drone: false }, // Summer
  { stepMs: 265, filter: 1300, oct: 1, drone: true },  // Autumn
  { stepMs: 300, filter: 950,  oct: 1, drone: true },  // Winter
];

class SoundManager {
  constructor() {
    this.enabled = this._loadPref();
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.musicFilter = null;
    this.sfxGain = null;
    this.noiseBuf = null;
    this.musicOn = false;
    this._musicTimer = null;
    this._step = 0;
    this._melIdx = 4;                 // current melody scale degree (random walk)
    this._stepMs = 260;               // ambient tempo
    this._prog = CHORD_PROGRESSIONS[0];   // current chord progression (rerolled each cycle)
    this._phrase = PHRASE_SHAPES[0];      // current melodic phrase (rerolled each cycle)
    this._last = Object.create(null); // per-sound throttle timestamps
    this.musicVol = this._loadVol(MUSIC_VOL_KEY);
    this.sfxVol = this._loadVol(SFX_VOL_KEY);

    // Browsers require a user gesture before audio can start.
    const kick = () => {
      this._ensure();
      if (this.enabled) this.startMusic();
    };
    window.addEventListener("pointerdown", kick, { passive: true });
    window.addEventListener("keydown", kick);

    // A soft click on any real button press — covers the whole UI in one place.
    document.addEventListener("click", (e) => {
      if (e.target && e.target.closest && e.target.closest("button")) this.play("click");
    }, true);

    this._wireToggle();
    this._reflectToggle();
  }

  // ---- preference / context ----
  _loadPref() {
    try {
      const v = localStorage.getItem(SOUND_PREF_KEY);
      return v === null ? true : v === "1";
    } catch (e) { return true; }
  }
  _savePref() {
    try { localStorage.setItem(SOUND_PREF_KEY, this.enabled ? "1" : "0"); } catch (e) {}
  }

  _loadVol(key) {
    try {
      const v = parseFloat(localStorage.getItem(key));
      return isNaN(v) ? 1 : clamp(v, 0, 1);
    } catch (e) { return 1; }
  }

  setMusicVolume(v) {
    this.musicVol = clamp(v, 0, 1);
    try { localStorage.setItem(MUSIC_VOL_KEY, String(this.musicVol)); } catch (e) {}
  }
  setSfxVolume(v) {
    this.sfxVol = clamp(v, 0, 1);
    try { localStorage.setItem(SFX_VOL_KEY, String(this.sfxVol)); } catch (e) {}
    if (this.sfxGain) this.sfxGain.gain.value = SFX_BASE_GAIN * this.sfxVol;
  }

  _ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") { try { this.ctx.resume(); } catch (e) {} }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0.0001;
    // A gentle limiter on the master bus keeps the fuller mix (pad + drone +
    // melody + weather ambience + stacked combat effects) from clipping when
    // several voices land on the same beat.
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.18;
    this.master.connect(this.limiter);
    this.limiter.connect(this.ctx.destination);

    // Music runs through a warm low-pass so it sits behind the effects.
    this.musicFilter = this.ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 1400;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.32;
    this.musicFilter.connect(this.musicGain);
    this.musicGain.connect(this.master);

    // A synthetic hall reverb (noise shaped into an exponential decay, no
    // asset file needed) run in parallel with the dry signal — this is what
    // actually separates "atmospheric" from "dry bleeps." Music only; SFX
    // stay crisp/dry for punchy feedback.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeReverbIR(2.4, 3.2);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.18;
    this.musicFilter.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = SFX_BASE_GAIN * this.sfxVol;
    this.sfxGain.connect(this.master);

    // Short noise buffer reused for percussive/impact effects.
    const n = Math.floor(this.ctx.sampleRate * 0.4);
    this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;

    // Weather ambience: one seamlessly-looping noise bed, re-shaped each music
    // step to match the current weather. Its own gain so it can sit quietly
    // under the score (see _ambienceStep).
    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.0001;
    this.ambienceFilter = this.ctx.createBiquadFilter();
    this.ambienceFilter.type = "lowpass";
    this.ambienceFilter.frequency.value = 900;
    this.ambienceFilter.Q.value = 0.6;
    const amb = this.ctx.createBufferSource();
    amb.buffer = this._makeNoiseBuffer(2.0);
    amb.loop = true;
    amb.connect(this.ambienceFilter);
    this.ambienceFilter.connect(this.ambienceGain);
    this.ambienceGain.connect(this.master);
    try { amb.start(); } catch (e) {}
    this.ambience = amb;
  }

  // Procedural impulse response for the music reverb: stereo noise shaped by
  // an exponential decay curve. No file, cheap to generate once per session.
  _makeReverbIR(duration, decay) {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const buf = this.ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buf;
  }

  // A seamlessly-loopable white-noise buffer for the ambience bed: the tail is
  // cross-faded into the head so the 2s loop has no click at the seam.
  _makeNoiseBuffer(dur) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const fade = Math.min(4000, Math.floor(len * 0.08));
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k;
    }
    return buf;
  }

  // ---- primitive voices ----
  // `pan` (-1..1) routes through a StereoPannerNode when given — used to
  // spread the arpeggio/melody across the stereo field instead of every
  // music voice stacking up dead-center mono, which read as flat/narrow.
  _tone(freq, dur, opts = {}) {
    if (!this.ctx) return;
    const { type = "sine", gain = 0.2, attack = 0.008, detune = 0, dest = this.sfxGain, glideTo = null, pan = null } = opts;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
    osc.detune.value = detune;
    let out = g;
    if (pan != null && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p); out = p;
    }
    osc.connect(g); out.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise(dur, opts = {}) {
    if (!this.ctx || !this.noiseBuf) return;
    const { gain = 0.25, type = "lowpass", freq = 1200, q = 1, dest = this.sfxGain } = opts;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ---- named sound effects ----
  play(name, minGapMs = 60) {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();
    if (this._last[name] && now - this._last[name] < minGapMs) return;
    this._last[name] = now;
    switch (name) {
      case "click":
        this._tone(660, 0.05, { type: "triangle", gain: 0.06 });
        break;
      case "mine": // low earthy thud
        this._noise(0.16, { freq: 260, q: 0.7, gain: 0.3 });
        this._tone(90, 0.16, { type: "sine", gain: 0.2, glideTo: 55 });
        break;
      case "chop": // woody knock
        this._tone(180, 0.12, { type: "square", gain: 0.12, glideTo: 110 });
        this._noise(0.08, { freq: 800, q: 0.8, gain: 0.14 });
        break;
      case "gather": // soft pluck
        this._tone(520, 0.18, { type: "triangle", gain: 0.12, glideTo: 660 });
        break;
      case "build": // stony clunk
        this._noise(0.12, { freq: 400, q: 0.6, gain: 0.28 });
        this._tone(130, 0.14, { type: "square", gain: 0.1 });
        break;
      case "craft": // forge: metallic clang (two detuned squares)
        this._tone(740, 0.28, { type: "square", gain: 0.09 });
        this._tone(742, 0.28, { type: "square", gain: 0.09, detune: 12 });
        this._noise(0.06, { type: "bandpass", freq: 3000, q: 2, gain: 0.1 });
        break;
      case "craftSmelter": // fiery whoosh + low rumble
        this._noise(0.22, { type: "highpass", freq: 2000, q: 0.5, gain: 0.14 });
        this._tone(140, 0.3, { type: "sawtooth", gain: 0.12, glideTo: 70 });
        break;
      case "craftWell": // watery drip/splash
        this._tone(700, 0.1, { type: "sine", gain: 0.1, glideTo: 380 });
        this._later(0.08, () => this._tone(520, 0.14, { type: "sine", gain: 0.08, glideTo: 260 }));
        break;
      case "craftBrewery": // bubbly glug
        this._tone(220, 0.08, { type: "sine", gain: 0.1, glideTo: 340 });
        this._later(0.09, () => this._tone(240, 0.08, { type: "sine", gain: 0.09, glideTo: 360 }));
        this._later(0.18, () => this._tone(260, 0.08, { type: "sine", gain: 0.08, glideTo: 380 }));
        break;
      case "levelup": // bright rising arpeggio
        this._arp([523, 659, 784, 1047], 0.09, { type: "triangle", gain: 0.16 });
        break;
      case "tech": // shimmering discovery chime
        this._arp([659, 880, 1319], 0.12, { type: "sine", gain: 0.16 });
        break;
      case "migrant": // welcoming two-note chime
        this._tone(587, 0.22, { type: "triangle", gain: 0.16 });
        this._later(0.14, () => this._tone(880, 0.28, { type: "triangle", gain: 0.16 }));
        break;
      case "combat": // short blade/impact
        this._noise(0.09, { type: "highpass", freq: 1800, q: 0.7, gain: 0.22 });
        this._tone(300, 0.06, { type: "sawtooth", gain: 0.08, glideTo: 160 });
        break;
      case "bow": // string pluck + airy release
        this._tone(880, 0.05, { type: "triangle", gain: 0.1, glideTo: 440 });
        this._noise(0.12, { type: "bandpass", freq: 2600, q: 1.4, gain: 0.12 });
        break;
      case "gun": // sharp crack + mechanical clack
        this._noise(0.08, { type: "highpass", freq: 900, q: 0.5, gain: 0.3 });
        this._tone(180, 0.07, { type: "square", gain: 0.1, glideTo: 60 });
        break;
      case "laser": // descending sci-fi zap
        this._tone(1600, 0.16, { type: "sawtooth", gain: 0.09, glideTo: 320 });
        this._tone(2400, 0.1, { type: "sine", gain: 0.05, glideTo: 800 });
        break;
      case "enemyDown": // descending defeat
        this._tone(330, 0.3, { type: "sawtooth", gain: 0.14, glideTo: 110 });
        break;
      case "raid": // low ominous horn
        this._tone(110, 0.6, { type: "sawtooth", gain: 0.16, glideTo: 98 });
        this._tone(146, 0.6, { type: "sawtooth", gain: 0.1 });
        break;
      case "death": // somber fall
        this._tone(220, 0.7, { type: "sine", gain: 0.16, glideTo: 82 });
        break;
      case "eat": // muffled crunch
        this._noise(0.09, { type: "bandpass", freq: 900, q: 1.2, gain: 0.12 });
        this._later(0.07, () => this._noise(0.07, { type: "bandpass", freq: 1400, q: 1.5, gain: 0.09 }));
        break;
      case "drink": // two-part gulp
        this._tone(300, 0.10, { type: "sine", gain: 0.12, glideTo: 180 });
        this._later(0.12, () => this._tone(260, 0.09, { type: "sine", gain: 0.09, glideTo: 150 }));
        break;
      case "door": // wooden swing + latch
        this._noise(0.16, { type: "lowpass", freq: 700, q: 0.6, gain: 0.14 });
        this._later(0.1, () => this._tone(220, 0.07, { type: "triangle", gain: 0.08, glideTo: 160 }));
        break;
      case "digStairs": // heavy rock shovel
        this._noise(0.22, { freq: 220, q: 0.6, gain: 0.32 });
        this._tone(80, 0.22, { type: "sine", gain: 0.22, glideTo: 48 });
        break;
      case "ramp": // lighter scrape
        this._noise(0.18, { type: "bandpass", freq: 600, q: 0.8, gain: 0.18 });
        break;
      case "drain": // water running away
        this._noise(0.5, { type: "lowpass", freq: 700, q: 0.5, gain: 0.16 });
        this._tone(420, 0.4, { type: "sine", gain: 0.08, glideTo: 140 });
        break;
      case "plant": // soft pat of soil
        this._noise(0.1, { type: "lowpass", freq: 500, q: 0.7, gain: 0.14 });
        break;
      case "harvest": // bright pluck + rustle
        this._tone(520, 0.16, { type: "triangle", gain: 0.11, glideTo: 700 });
        this._noise(0.12, { type: "highpass", freq: 2200, q: 0.6, gain: 0.09 });
        break;
      case "tame": // warm rising pair
        this._tone(523, 0.18, { type: "triangle", gain: 0.13 });
        this._later(0.12, () => this._tone(784, 0.24, { type: "triangle", gain: 0.13 }));
        break;
      case "heal": // gentle shimmer
        this._arp([784, 988, 1175], 0.07, { type: "sine", gain: 0.1 });
        break;
      case "bite": // nasty chomp
        this._noise(0.1, { type: "bandpass", freq: 500, q: 1.6, gain: 0.22 });
        this._tone(160, 0.12, { type: "sawtooth", gain: 0.1, glideTo: 70 });
        break;
      case "vampire": // ominous sting
        this._tone(196, 0.5, { type: "sawtooth", gain: 0.12, glideTo: 130 });
        this._tone(233, 0.5, { type: "sine", gain: 0.08 });
        break;
      case "caveIn": // deep rumble
        this._noise(0.7, { type: "lowpass", freq: 180, q: 0.4, gain: 0.34 });
        this._tone(60, 0.6, { type: "sine", gain: 0.2, glideTo: 40 });
        break;
      case "flood": // rushing water
        this._noise(0.6, { type: "lowpass", freq: 1100, q: 0.5, gain: 0.24 });
        this._tone(300, 0.5, { type: "sine", gain: 0.1, glideTo: 120 });
        break;
      case "thunder": // storm crack + long rumble
        this._noise(0.14, { type: "highpass", freq: 1200, q: 0.5, gain: 0.28 });
        this._noise(1.2, { type: "lowpass", freq: 260, q: 0.4, gain: 0.3 });
        this._tone(50, 1.0, { type: "sine", gain: 0.16, glideTo: 32 });
        break;
      case "milestone": // little fanfare
        this._arp([523, 659, 784, 1047, 1319], 0.11, { type: "triangle", gain: 0.17 });
        break;
      case "undo": // quick reverse blip
        this._tone(500, 0.12, { type: "triangle", gain: 0.1, glideTo: 240 });
        break;
      case "zone": // soft stamp when painting a zone/order
        this._tone(330, 0.07, { type: "triangle", gain: 0.07 });
        this._noise(0.06, { type: "lowpass", freq: 800, q: 0.6, gain: 0.08 });
        break;
      case "autosave": // quiet confirmation
        this._tone(880, 0.08, { type: "sine", gain: 0.07 });
        break;
      case "load": // warm swell
        this._tone(392, 0.3, { type: "triangle", gain: 0.12, glideTo: 523 });
        break;
      case "equip": // clink of gear
        this._tone(1040, 0.06, { type: "square", gain: 0.07 });
        this._tone(1560, 0.06, { type: "square", gain: 0.05 });
        break;
      case "coin": // trade coin
        this._tone(1320, 0.07, { type: "triangle", gain: 0.1 });
        this._later(0.06, () => this._tone(1760, 0.1, { type: "triangle", gain: 0.08 }));
        break;
    }
  }

  _arp(freqs, step, opts) {
    freqs.forEach((f, i) => this._later(i * step, () => this._tone(f, step + 0.18, opts)));
  }

  _later(sec, fn) {
    setTimeout(fn, Math.max(0, sec * 1000));
  }

  // ---- generative ambient music ----
  startMusic() {
    this._ensure();
    if (!this.ctx || this.musicOn || !this.enabled) return;
    this.musicOn = true;
    const tick = () => {
      if (!this.musicOn) return;
      try { this._musicStep(); } catch (e) {}
      this._musicTimer = setTimeout(tick, this._stepMs);
    };
    tick();
  }

  stopMusic() {
    this.musicOn = false;
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
  }

  // Picks a new (different, when possible) chord progression + melodic
  // phrase pair once the current one has played all the way through — this
  // is what keeps a long play session from wearing the same ~16-20s loop
  // into the ground instead of it just sounding "more in tune."
  _rerollSection() {
    const pick = (arr, cur) => {
      if (arr.length < 2) return arr[0];
      let choice;
      do { choice = arr[Math.floor(Math.random() * arr.length)]; } while (choice === cur);
      return choice;
    };
    this._prog = pick(CHORD_PROGRESSIONS, this._prog);
    this._phrase = pick(PHRASE_SHAPES, this._phrase);
  }

  _musicStep() {
    const s = this._step++;

    // Day/night colour: darker & quieter at night, brighter by day. Combat
    // overrides both — darker, louder, faster — for a rising sense of tension.
    // Mood: day/night colour, combat override, season colour, and a "festive"
    // lift when the colony is thriving or a caravan is trading.
    let night = false, inCombat = false, season = 0, festive = false;
    try {
      const g = window.game;
      if (g) {
        if (typeof g.dayFraction === "function") {
          const f = g.dayFraction();
          night = (f < 0.25 || f > 0.78);
        }
        if (typeof g.seasonIndex === "function") season = g.seasonIndex() || 0;
        inCombat = !!(g.enemies && g.enemies.length);
        festive = !inCombat && ((g.caravans && g.caravans.some(c => c.state === "trading"))
          || (typeof g.avgHappiness === "function" && g.avgHappiness() > 68));
      }
    } catch (e) {}
    const sea = SEASON_MUSIC[season] || SEASON_MUSIC[0];
    const t = this.ctx.currentTime;
    const mv = this.musicVol;
    const dry = (inCombat ? 0.4 : (night ? 0.22 : festive ? 0.36 : 0.32)) * mv;
    const bright = inCombat ? 650 : Math.round(sea.filter * (night ? 0.6 : 1) * (festive ? 1.15 : 1));
    this.musicFilter.frequency.setTargetAtTime(bright, t, 0.8);
    this.musicGain.gain.setTargetAtTime(dry, t, 0.8);
    this.reverbGain.gain.setTargetAtTime(dry * 0.55, t, 0.8); // wet path tracks the dry level
    // faster tempo ramps the tension; season and night stretch or quicken it
    this._stepMs = inCombat ? 160 : Math.round(sea.stepMs * (night ? 1.12 : festive ? 0.92 : 1));

    // Harmony: a chord progression, one chord per 16 steps. A full pass
    // through the progression rerolls to a different (progression, phrase)
    // pair — see _rerollSection — instead of looping the same one forever.
    const CHORD_LEN = 16;
    const cycleLen = CHORD_LEN * this._prog.length;
    if (s > 0 && s % cycleLen === 0) this._rerollSection();
    const chordIdx = Math.floor(s / CHORD_LEN) % this._prog.length;
    const chordRoot = this._prog[chordIdx];

    // Small per-note timing jitter (a few ms) and gain jitter for the
    // melody/arpeggio below, so the grid doesn't feel perfectly quantized —
    // the harmony pad itself stays exactly on the beat since it's the anchor.
    const jitter = () => Math.random() * 0.02;
    const humanGain = (g) => g * (0.85 + Math.random() * 0.3);

    if (s % CHORD_LEN === 0) {
      const root = pentaFreq(0, chordRoot);
      this._tone(root, 4.0, { type: "sine", gain: 0.16 * mv, attack: 0.6, dest: this.musicFilter });
      // a colour tone a scale-step above the root, panned left, gives the
      // chord real harmonic colour instead of a bare root
      this._tone(pentaFreq(1, chordRoot + 1), 4.0, { type: "triangle", gain: 0.05 * mv, attack: 0.7, detune: -5, dest: this.musicFilter, pan: -0.2 });
      // a quiet fifth above (just-intonation ratio, not scale-locked) fills
      // the chord out without needing a full harmony engine — panned right
      this._tone(pentaFreq(1, chordRoot) * 1.5, 3.6, { type: "sine", gain: 0.035 * mv, attack: 0.9, dest: this.musicFilter, pan: 0.2 });
      // a soft detuned pad swells behind the chord
      this._tone(pentaFreq(1, chordRoot) * 1.002, 4.4, { type: "sawtooth", gain: 0.028 * mv, attack: 1.2, dest: this.musicFilter });
      // autumn/winter add a low drone beneath it all
      if (sea.drone) this._tone(root * 0.5, 4.6, { type: "sine", gain: 0.09 * mv, attack: 1.0, dest: this.musicFilter });
    }

    // A tense low throb under combat, on top of the regular drone.
    if (inCombat && s % 4 === 0) {
      this._tone(55, 0.35, { type: "sawtooth", gain: 0.1 * mv, attack: 0.02, dest: this.musicFilter });
    }

    // Melody: a short contour (this._phrase) replayed each chord, transposed
    // to the current root, with an occasional passing-tone nudge or rest so
    // it breathes instead of repeating identically — chord-tone-anchored
    // instead of an unconstrained random walk, so it always resolves back
    // to something that belongs with the harmony underneath.
    if (s % 2 === 0) {
      const slot = Math.floor((s % CHORD_LEN) / 2); // 0..7 within the chord
      const rest = Math.random() < 0.15;
      if (!rest) {
        let shape = this._phrase[slot % this._phrase.length];
        if (Math.random() < 0.25) shape += Math.random() < 0.5 ? 1 : -1;
        this._melIdx = chordRoot + shape;
        const oct = night ? Math.max(1, sea.oct - 1) : sea.oct;
        const dur = (slot === 0 || slot === 4) ? 0.75 : 0.42; // linger on phrase downbeats
        const pan = slot % 2 === 0 ? -0.18 : 0.18; // slight spread instead of dead-center mono
        this._later(jitter(), () => this._tone(pentaFreq(oct, this._melIdx), dur, {
          type: "triangle", gain: humanGain(0.12 * mv), attack: 0.02, dest: this.musicFilter, pan,
        }));
      }
    }

    // Arpeggio: a soft plucked layer stepping through the current chord's
    // tones (root/3rd/5th-equivalent), interleaved with the melody's steps
    // and panned opposite it — fills out the texture and widens the stereo
    // image, which was otherwise fully mono (every voice landing dead center).
    if (s % 2 === 1 && !inCombat) {
      const arpDeg = chordRoot + ARP_PATTERN[Math.floor(s / 2) % ARP_PATTERN.length];
      const pan = Math.floor(s / 2) % 2 === 0 ? 0.3 : -0.3;
      this._later(jitter(), () => this._tone(pentaFreq(2, arpDeg), 0.3, {
        type: "sine", gain: humanGain(0.06 * mv), attack: 0.01, dest: this.musicFilter, pan,
      }));
    }

    // Festive counter-melody: a bright plucked line an octave above the
    // arpeggio when the colony is thriving or a caravan is trading.
    if (festive && s % 2 === 1) {
      const pan = Math.floor(s / 2) % 2 === 0 ? -0.3 : 0.3;
      this._later(jitter(), () => this._tone(
        pentaFreq(3, chordRoot + ARP_PATTERN[Math.floor(s / 2) % ARP_PATTERN.length]), 0.22,
        { type: "triangle", gain: humanGain(0.05 * mv), attack: 0.008, dest: this.musicFilter, pan }));
    }

    // Occasional high sparkle by day.
    if (!night && s % 8 === 3 && Math.random() < 0.4) {
      this._tone(pentaFreq(3, this._melIdx), 0.6, { type: "sine", gain: 0.05 * mv, dest: this.musicFilter });
    }

    // Ambient birdsong — sparse daytime chirps, silent once a fight starts.
    // Panned to a random spot instead of dead-center, like a real bird would be.
    if (!night && !inCombat && Math.random() < 0.025) {
      const base = 1800 + Math.random() * 1400;
      const pan = Math.random() * 1.6 - 0.8;
      this._tone(base, 0.09, { type: "sine", gain: 0.05 * mv, attack: 0.005, glideTo: base * 1.3, dest: this.musicFilter, pan });
      this._later(0.1, () => this._tone(base * 1.15, 0.07, { type: "sine", gain: 0.04 * mv, attack: 0.005, dest: this.musicFilter, pan }));
    }

    // Weather ambience bed follows the weather (surface only).
    this._ambienceStep(t, mv);
  }

  // Weather ambience: re-shape the looping noise bed toward the current
  // weather. Clear/fog are near-silent; rain hisses; a storm adds a low rumble
  // and the odd thunder crack; a blizzard howls; a heatwave shimmers. The
  // weather is surface-only, so underground the bed falls silent.
  _ambienceStep(t, mv) {
    if (!this.ambienceGain || !this.ambienceFilter) return;
    let weather = "clear", surface = true;
    try {
      const g = window.game;
      if (g) {
        weather = g.weather || "clear";
        if (typeof g.viewZ === "number") surface = g.viewZ === 0;
      }
    } catch (e) {}
    if (!surface) weather = "clear";
    const shapes = {
      clear:    { gain: 0.0001, freq: 900,  q: 0.6, type: "lowpass" },
      rain:     { gain: 0.10,   freq: 1400, q: 0.5, type: "lowpass" },
      storm:    { gain: 0.16,   freq: 900,  q: 0.4, type: "lowpass" },
      fog:      { gain: 0.045,  freq: 500,  q: 0.7, type: "lowpass" },
      blizzard: { gain: 0.13,   freq: 620,  q: 1.1, type: "bandpass" },
      heatwave: { gain: 0.03,   freq: 2600, q: 1.4, type: "highpass" },
    };
    const target = shapes[weather] || shapes.clear;
    this.ambienceGain.gain.setTargetAtTime(Math.max(0.0001, target.gain * mv), t, 1.6);
    this.ambienceFilter.frequency.setTargetAtTime(target.freq, t, 1.6);
    this.ambienceFilter.Q.setTargetAtTime(target.q, t, 1.6);
    this.ambienceFilter.type = target.type;
    if (weather === "storm" && Math.random() < 0.02) this.play("thunder", 800);
  }

  // ---- gameplay event -> sound (called from game.log) ----
  onLog(cat, cls, msg) {
    if (!this.enabled) return;
    const m = (msg || "").toLowerCase();
    switch (cat) {
      case "labor":
        if (m.includes("struck an aquifer")) this.play("flood", 400);
        else if (m.includes("carved a stairwell")) this.play("digStairs", 130);
        else if (m.includes("carved a ramp")) this.play("ramp", 130);
        else if (m.includes("drained")) this.play("drain", 200);
        else if (m.includes("mined")) this.play("mine", 130);
        else if (m.includes("felled")) this.play("chop", 130);
        else if (m.includes("gathered")) this.play("gather", 130);
        else if (m.includes("harvested")) this.play("harvest", 130);
        else if (m.includes("planted")) this.play("plant", 130);
        else if (m.includes("treated")) this.play("heal", 200);
        break;
      case "build": this.play("build", 120); break;
      case "craft":
        if (m.includes("smelter")) this.play("craftSmelter", 150);
        else if (m.includes("well")) this.play("craftWell", 150);
        else if (m.includes("brewery")) this.play("craftBrewery", 150);
        else this.play("craft", 150); // forge (default)
        break;
      case "skill": this.play(m.includes("researched") ? "tech" : "levelup", 200); break;
      case "combat":
        if (m.includes("raid") || m.includes("outbreak")) this.play("raid", 500);
        else if (m.includes("vampire") || m.includes("turned")) this.play("vampire", 500);
        else if (m.includes("bitten")) this.play("bite", 300);
        else if (m.includes("wounded")) this.play("bite", 200);
        else if (m.includes("trap springs")) this.play("enemyDown", 200);
        else if (m.includes("slew") || m.includes("slain")) this.play("enemyDown", 120);
        else if (m.includes("equips")) this.play("equip", 120);
        break;
      case "colony":
        if (m.includes("weather turns")) this.play((m.includes("storm") || m.includes("blizzard")) ? "thunder" : "zone", 600);
        else if (m.includes("milestone")) this.play("milestone", 800);
        else if (m.includes("cave-in")) this.play("caveIn", 500);
        else if (m.includes("tamed")) this.play("tame", 300);
        else if (m.includes("migrant") || m.includes("arrived")) this.play("migrant", 300);
        else if (m.includes("cured") || m.includes("recovered") || m.includes("fought off")) this.play("heal", 300);
        else if (m.includes("roof settles")) this.play("build", 300);
        else if (cls === "bad") this.play("death", 300);
        break;
      case "faction":
        if (m.includes("raid") || m.includes("attack")) this.play("raid", 400);
        else if (m.includes("traded")) this.play("coin", 300);
        else if (m.includes("caravan") || m.includes("gift")) this.play("migrant", 200);
        break;
      case "story":
        if (m.includes("blight") || m.includes("vermin") || m.includes("withers")) this.play("bite", 300);
        else if (cls === "bad") this.play("death", 250); else this.play("migrant", 150);
        break;
      case "order":
        if (m.includes("undid") || m.includes("undo")) this.play("undo", 200);
        else if (m.includes("door")) this.play("door", 200);
        else this.play("zone", 90);
        break;
      case "system":
        if (m.includes("loaded")) this.play("load", 400);
        else if (m.includes("save")) this.play("autosave", 600);
        else if (m.includes("paused") || m.includes("resumed")) this.play("click", 200);
        break;
    }
  }

  // ---- mute toggle ----
  toggle() {
    this.enabled = !this.enabled;
    this._savePref();
    this._ensure();
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.enabled ? 0.9 : 0.0001, t, 0.05);
    }
    if (this.enabled) this.startMusic(); else this.stopMusic();
    this._reflectToggle();
  }

  _wireToggle() {
    const btn = document.getElementById("sound-btn");
    if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); this.toggle(); });
  }

  _reflectToggle() {
    const btn = document.getElementById("sound-btn");
    if (btn) {
      btn.textContent = this.enabled ? "🔊" : "🔇";
      btn.title = this.enabled ? "Sound on — click to mute" : "Sound off — click to unmute";
      btn.classList.toggle("off", !this.enabled);
    }
  }
}

window.sound = new SoundManager();
