// Tiny WebAudio synth — every sound is generated, no audio files.
import { WORLD_W } from './config.js';

// how much of each sound goes to the shared reverb
const SEND = { breach: 0.4, doom: 0.6, prompt: 0.5, lock: 0.35, warn: 0.25, info: 0.3, confirm: 0.3, thunder: 0.7, boom: 0.22, bigboom: 0.5, upgrade: 0.35, purge: 0.5, boss: 0.6, siren: 0.45, win: 0.4, lose: 0.5, power: 0.3, wave: 0.3, hurt: 0.3, firewall: 0.25, gravity: 0.3, clear: 0.3 };
const GAPS = { key: 24, blip: 20, achieve: 400, deal: 300, pick: 200, lance: 60, mineLay: 80, thunder: 1500, hover: 40, coin: 45, hail: 40, shield: 60, heal: 250, shoot: 45, thump: 60, zap: 55, frost: 80, gravity: 120, pop: 35, pop2: 50, boom: 70, bigboom: 150, launch: 70, rail: 60, emp: 90 };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.45;
    this.last = Object.create(null);
  }

  // Call from a user gesture. (Calling it earlier just creates a suspended context, which a
  // later gesture resumes — the boot console does that so it can tell whether sound is live.)
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') { this.resumeAt = performance.now(); this.ctx.resume(); }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6;
    // master → pause muffle (low-pass) → compressor → out; a shared reverb returns into master
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.7;
    this.master.connect(this.muffle);
    this.muffle.connect(comp);
    comp.connect(c.destination);
    this.verb = c.createConvolver();
    const ir = c.createBuffer(2, Math.floor(c.sampleRate * 2.2), c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2.6;
    }
    this.verb.buffer = ir;
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.55;
    this.verbIn.connect(this.verb); this.verb.connect(this.master);
    this.out = this.master;
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // muffle everything (music included) while the game is paused
  setPaused(p) {
    if (this.muffle) this.muffle.frequency.setTargetAtTime(p ? 650 : 20000, this.ctx.currentTime, 0.08);
  }

  // per-sound output: optional stereo pan from the world x, optional reverb send
  route(x, send) {
    const c = this.ctx;
    let node = this.master;
    if (x !== undefined && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, (x / WORLD_W) * 2 - 1)) * 0.75;
      p.connect(node); node = p;
    }
    if (send) {
      const o = c.createGain(), v = c.createGain();
      v.gain.value = send;
      o.connect(node); o.connect(v); v.connect(this.verbIn);
      node = o;
    }
    return node;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  tone({ type = 'sine', f0, f1 = f0, dur = 0.1, gain = 0.1, delay = 0, attack = 0.005 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur = 0.2, gain = 0.1, filter = 'lowpass', f0 = 2000, f1 = f0, q = 1, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const fl = c.createBiquadFilter();
    fl.type = filter; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name, x) {
    if (!this.ctx || this.muted) return;
    // a resume asked for in this gesture is still pending: schedule anyway, it plays on resume
    if (this.ctx.state !== 'running' && !(this.ctx.state === 'suspended' && performance.now() - (this.resumeAt || -1e9) < 300)) return;
    const now = performance.now();
    if (now - (this.last[name] || 0) < (GAPS[name] ?? 25)) return;
    this.last[name] = now;
    this.out = this.route(x, SEND[name] || 0);
    try { this.voice(name, Math.random()); } finally { this.out = this.master; }
  }

  // Boot-console threat drone: detuned low saws through a resonant low-pass, with an alarm
  // tremolo; set(v) with v in 0..1 opens the filter, raises the pitch and speeds the pulse.
  drone() {
    const c = this.ctx;
    if (!c) return null;
    const t = c.currentTime;
    const out = this.route(undefined, 0.35);
    const g = c.createGain(); g.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 5;
    lp.connect(g); g.connect(out);
    const oscs = [['sawtooth', 55], ['sawtooth', 55.4], ['sine', 27.5]].map(([type, f]) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.connect(lp); o.start(t); return o;
    });
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 0.5; depth.gain.value = 0;
    lfo.connect(depth); depth.connect(g.gain); lfo.start(t);
    let stopped = false;
    return {
      set(v) {
        if (stopped) return;
        const n = c.currentTime;
        g.gain.setTargetAtTime(0.02 + v * 0.06, n, 0.4);
        depth.gain.setTargetAtTime(v * v * 0.045, n, 0.4);
        lfo.frequency.setTargetAtTime(0.5 + v * 3.5, n, 0.4);
        lp.frequency.setTargetAtTime(160 + v * v * 1100, n, 0.4);
        oscs.forEach((o, i) => o.frequency.setTargetAtTime((i === 2 ? 27.5 : i ? 55.4 : 55) * (1 + v * 0.18), n, 0.6));
      },
      stop(fade = 0.25) {
        if (stopped) return;
        stopped = true;
        const n = c.currentTime;
        g.gain.cancelScheduledValues(n); depth.gain.cancelScheduledValues(n);
        depth.gain.setValueAtTime(0, n);
        g.gain.setTargetAtTime(0, n, fade / 3);
        lp.frequency.setTargetAtTime(60, n, fade / 2);
        [...oscs, lfo].forEach((o) => o.stop(n + fade * 2));
      },
    };
  }

  voice(name, r) {
    switch (name) {
      case 'shoot': this.tone({ type: 'square', f0: 1100 + r * 250, f1: 380, dur: 0.07, gain: 0.03 }); break;
      case 'thump': this.tone({ type: 'triangle', f0: 520, f1: 140, dur: 0.12, gain: 0.08 }); break;
      case 'rail':
        this.tone({ type: 'sawtooth', f0: 2400, f1: 90, dur: 0.35, gain: 0.06 });
        this.noise({ dur: 0.25, gain: 0.07, filter: 'highpass', f0: 3000 });
        break;
      case 'zap':
        this.noise({ dur: 0.14, gain: 0.11, filter: 'bandpass', f0: 2500 + r * 1500, q: 2 });
        this.tone({ type: 'square', f0: 180, f1: 60, dur: 0.1, gain: 0.025 });
        break;
      case 'emp':
        this.tone({ type: 'sawtooth', f0: 120, f1: 1200, dur: 0.25, gain: 0.05 });
        this.noise({ dur: 0.3, gain: 0.09, filter: 'bandpass', f0: 1800, q: 1.5 });
        break;
      case 'frost':
        this.tone({ type: 'sine', f0: 1500, f1: 2600, dur: 0.18, gain: 0.025 });
        this.tone({ type: 'sine', f0: 2200, f1: 3400, dur: 0.15, gain: 0.018, delay: 0.03 });
        break;
      case 'gravity': this.tone({ type: 'sine', f0: 220, f1: 45, dur: 0.45, gain: 0.12 }); break;
      case 'launch': this.noise({ dur: 0.3, gain: 0.06, filter: 'bandpass', f0: 600, f1: 2400, q: 1 }); break;
      case 'pop':
        this.tone({ type: 'triangle', f0: 600 + r * 300, f1: 90, dur: 0.1, gain: 0.055 });
        this.noise({ dur: 0.08, gain: 0.035, filter: 'highpass', f0: 2000 });
        // derez crackle
        this.noise({ dur: 0.05, gain: 0.03, filter: 'highpass', f0: 5000, delay: 0.03 });
        this.tone({ type: 'square', f0: 3000, f1: 700, dur: 0.05, gain: 0.01, delay: 0.02 });
        break;
      case 'pop2': this.noise({ dur: 0.18, gain: 0.08, filter: 'lowpass', f0: 1800, f1: 200 }); break;
      case 'boom':
        this.noise({ dur: 0.45, gain: 0.2, filter: 'lowpass', f0: 1200, f1: 80 });
        this.tone({ type: 'sine', f0: 140, f1: 40, dur: 0.35, gain: 0.14 });
        this.tone({ type: 'sine', f0: 62, f1: 32, dur: 0.45, gain: 0.2, attack: 0.01 }); // sub thump
        break;
      case 'bigboom':
        this.noise({ dur: 1.2, gain: 0.32, filter: 'lowpass', f0: 900, f1: 40 });
        this.tone({ type: 'sine', f0: 90, f1: 25, dur: 1, gain: 0.28 });
        this.tone({ type: 'sine', f0: 48, f1: 20, dur: 1.4, gain: 0.38, attack: 0.02 }); // sub
        this.noise({ dur: 0.12, gain: 0.12, filter: 'highpass', f0: 3000 }); // crack
        break;
      case 'place':
        this.tone({ type: 'sine', f0: 520, dur: 0.08, gain: 0.08 });
        this.tone({ type: 'sine', f0: 780, dur: 0.14, gain: 0.08, delay: 0.07 });
        // build-in: rising hum + scanning sweep, lands as the hologram powers on
        this.tone({ type: 'sawtooth', f0: 110, f1: 440, dur: 0.5, gain: 0.018, attack: 0.05 });
        this.noise({ dur: 0.45, gain: 0.035, filter: 'bandpass', f0: 400, f1: 3500, q: 3 });
        this.tone({ type: 'sine', f0: 1320, dur: 0.12, gain: 0.04, delay: 0.42 });
        break;
      case 'upgrade':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.18, gain: 0.07, delay: i * 0.06 }));
        this.noise({ dur: 0.5, gain: 0.04, filter: 'highpass', f0: 4000, delay: 0.1 });
        break;
      case 'sell': this.tone({ type: 'sine', f0: 880, f1: 440, dur: 0.18, gain: 0.07 }); break;
      case 'hurt':
        this.tone({ type: 'sine', f0: 160, f1: 40, dur: 0.5, gain: 0.25 });
        this.noise({ dur: 0.3, gain: 0.12, filter: 'lowpass', f0: 600 });
        break;
      case 'wave':
        this.tone({ type: 'sawtooth', f0: 110, f1: 440, dur: 0.7, gain: 0.045 });
        this.tone({ type: 'sawtooth', f0: 165, f1: 660, dur: 0.7, gain: 0.035 });
        break;
      case 'clear': [784, 988, 1175].forEach((f, i) => this.tone({ type: 'sine', f0: f, dur: 0.25, gain: 0.07, delay: i * 0.08 })); break;
      case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.4, gain: 0.08, delay: i * 0.12 })); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.45, gain: 0.1, delay: i * 0.18 })); break;
      case 'boss':
        this.tone({ type: 'sawtooth', f0: 55, f1: 38, dur: 1.6, gain: 0.14 });
        this.tone({ type: 'sawtooth', f0: 82, f1: 57, dur: 1.6, gain: 0.1 });
        this.noise({ dur: 1.2, gain: 0.1, filter: 'lowpass', f0: 400, f1: 60 });
        break;
      case 'shield':
        this.tone({ type: 'square', f0: 2200, f1: 700, dur: 0.09, gain: 0.03 });
        this.noise({ dur: 0.07, gain: 0.04, filter: 'highpass', f0: 5000 });
        break;
      case 'heal':
        this.tone({ type: 'sine', f0: 520, f1: 880, dur: 0.25, gain: 0.035 });
        this.tone({ type: 'sine', f0: 780, f1: 1320, dur: 0.25, gain: 0.02, delay: 0.05 });
        break;
      case 'hail':
        this.noise({ dur: 0.12, gain: 0.06, filter: 'highpass', f0: 3500 });
        this.tone({ type: 'triangle', f0: 1800, f1: 600, dur: 0.1, gain: 0.025 });
        break;
      case 'firewall':
        [330, 440, 660].forEach((f, i) => this.tone({ type: 'square', f0: f, f1: f * 2, dur: 0.25, gain: 0.04, delay: i * 0.04 }));
        this.noise({ dur: 0.4, gain: 0.06, filter: 'bandpass', f0: 1200, f1: 4000, q: 2 });
        break;
      case 'firewallDown': this.tone({ type: 'sawtooth', f0: 600, f1: 80, dur: 0.35, gain: 0.06 }); break;
      case 'purge':
        this.tone({ type: 'sawtooth', f0: 60, f1: 1600, dur: 0.6, gain: 0.08 });
        this.noise({ dur: 0.9, gain: 0.22, filter: 'lowpass', f0: 6000, f1: 200 });
        this.tone({ type: 'sine', f0: 110, f1: 30, dur: 0.9, gain: 0.25, delay: 0.1 });
        break;
      case 'hover': this.tone({ type: 'sine', f0: 2300 + r * 200, dur: 0.025, gain: 0.012, attack: 0.002 }); break;
      case 'coin': this.tone({ type: 'triangle', f0: 1700 + r * 500, f1: 2700, dur: 0.07, gain: 0.022 }); break;
      case 'power': // CRT power-on: thunk, flyback whine, static
        this.tone({ type: 'sine', f0: 70, f1: 130, dur: 0.25, gain: 0.16 });
        this.tone({ type: 'sine', f0: 9000, f1: 12500, dur: 0.6, gain: 0.008, attack: 0.05 });
        this.noise({ dur: 0.35, gain: 0.05, filter: 'highpass', f0: 5000, f1: 9000 });
        break;
      case 'wipe':
        this.noise({ dur: 0.3, gain: 0.08, filter: 'bandpass', f0: 500, f1: 6000, q: 1.5 });
        this.tone({ type: 'square', f0: 140, f1: 55, dur: 0.22, gain: 0.03 });
        break;
      case 'siren': // two-tone alarm for the boss entrance
        for (let i = 0; i < 4; i++) this.tone({ type: 'triangle', f0: i % 2 ? 880 : 620, dur: 0.24, gain: 0.07, delay: i * 0.26, attack: 0.02 });
        this.tone({ type: 'sawtooth', f0: 41, dur: 1.1, gain: 0.08, attack: 0.1 });
        break;
      case 'achieve': // short triumphant fanfare
        [523, 659, 784].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.16, gain: 0.06, delay: i * 0.07 }));
        this.tone({ type: 'triangle', f0: 1047, dur: 0.5, gain: 0.07, delay: 0.21 });
        this.noise({ dur: 0.5, gain: 0.04, filter: 'highpass', f0: 6000, delay: 0.2 });
        break;
      case 'deal': // three cards flicking onto the table
        for (let i = 0; i < 3; i++) {
          this.noise({ dur: 0.08, gain: 0.05, filter: 'bandpass', f0: 2600, f1: 900, q: 1.2, delay: i * 0.12 });
          this.tone({ type: 'triangle', f0: 660 + i * 220, dur: 0.12, gain: 0.03, delay: i * 0.12 + 0.03 });
        }
        break;
      case 'pick':
        [784, 988, 1319, 1568].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.22, gain: 0.05, delay: i * 0.05 }));
        this.noise({ dur: 0.4, gain: 0.04, filter: 'highpass', f0: 5000, delay: 0.05 });
        break;
      case 'lance': // supersonic crack with a falling whine
        this.noise({ dur: 0.07, gain: 0.09, filter: 'highpass', f0: 4200 });
        this.tone({ type: 'sawtooth', f0: 3400, f1: 380, dur: 0.16, gain: 0.04 });
        this.tone({ type: 'sine', f0: 180, f1: 70, dur: 0.12, gain: 0.08 });
        break;
      case 'mineLay':
        this.tone({ type: 'triangle', f0: 900, f1: 1400, dur: 0.06, gain: 0.03 });
        this.tone({ type: 'square', f0: 2200, dur: 0.02, gain: 0.012, delay: 0.42 });
        break;
      case 'thunder': // distant roll, then the crack's tail
        this.noise({ dur: 2.4, gain: 0.3, filter: 'lowpass', f0: 520, f1: 50 });
        this.tone({ type: 'sine', f0: 52, f1: 24, dur: 2, gain: 0.26, attack: 0.08 });
        this.noise({ dur: 0.5, gain: 0.08, filter: 'bandpass', f0: 1400, f1: 300, q: 0.8, delay: 0.05 });
        break;
      case 'tick': // final-wave countdown
        this.tone({ type: 'square', f0: 1250, dur: 0.05, gain: 0.04 });
        this.tone({ type: 'sine', f0: 90, f1: 50, dur: 0.25, gain: 0.18 });
        break;
      // ── boot console ──
      case 'bootup': // relay clack, drive spin-up, ready chirp
        this.noise({ dur: 0.04, gain: 0.12, filter: 'bandpass', f0: 1800, q: 2 });
        this.tone({ type: 'sine', f0: 60, f1: 180, dur: 0.6, gain: 0.06, attack: 0.1 });
        this.noise({ dur: 0.7, gain: 0.03, filter: 'bandpass', f0: 300, f1: 2400, q: 4, delay: 0.05 });
        this.tone({ type: 'square', f0: 1046, dur: 0.06, gain: 0.025, delay: 0.55 });
        break;
      case 'key': // terminal keystroke
        this.noise({ dur: 0.018, gain: 0.045 + r * 0.03, filter: 'bandpass', f0: 3000 + r * 2600, q: 3 });
        this.tone({ type: 'square', f0: 150 + r * 70, f1: 70, dur: 0.018, gain: 0.018 });
        break;
      case 'ok':
        this.tone({ type: 'square', f0: 1568, dur: 0.05, gain: 0.028 });
        this.tone({ type: 'square', f0: 2093, dur: 0.07, gain: 0.028, delay: 0.06 });
        break;
      case 'scan': // sonar sweep across the perimeter
        this.tone({ type: 'sine', f0: 400, f1: 2400, dur: 0.3, gain: 0.035 });
        this.noise({ dur: 0.3, gain: 0.035, filter: 'bandpass', f0: 600, f1: 5000, q: 6 });
        break;
      case 'warn':
        [988, 740].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.16, gain: 0.07, delay: i * 0.15 }));
        this.tone({ type: 'sawtooth', f0: 98, dur: 0.4, gain: 0.03, attack: 0.02 });
        break;
      case 'breach': // klaxon whoops + glitch burst + sub hit
        for (let i = 0; i < 3; i++) {
          this.tone({ type: 'sawtooth', f0: 330, f1: 660, dur: 0.22, gain: 0.055, delay: i * 0.24, attack: 0.01 });
          this.tone({ type: 'square', f0: 165, f1: 330, dur: 0.22, gain: 0.025, delay: i * 0.24 });
        }
        this.noise({ dur: 0.35, gain: 0.1, filter: 'bandpass', f0: 900, f1: 3000, q: 1 });
        this.tone({ type: 'sine', f0: 55, f1: 30, dur: 0.8, gain: 0.2 });
        break;
      case 'alert': // dissonant error buzz, pulsed with the row flash
        for (let i = 0; i < 3; i++) {
          this.tone({ type: 'square', f0: 440, f1: 415, dur: 0.09, gain: 0.045, delay: i * 0.18 });
          this.tone({ type: 'sawtooth', f0: 466, f1: 440, dur: 0.09, gain: 0.03, delay: i * 0.18 });
          this.noise({ dur: 0.04, gain: 0.035, filter: 'highpass', f0: 4000, delay: i * 0.18 });
        }
        break;
      case 'blip': this.tone({ type: 'square', f0: 900 + r * 700, dur: 0.022, gain: 0.018 }); break; // data counter
      case 'trace': // accelerating seek beeps
        [0, 0.08, 0.15, 0.2, 0.24, 0.27, 0.3].forEach((d, i) => this.tone({ type: 'square', f0: 1200 + i * 80, dur: 0.03, gain: 0.03, delay: d }));
        break;
      case 'lock': // target acquired
        this.tone({ type: 'square', f0: 1760, dur: 0.35, gain: 0.035 });
        this.tone({ type: 'sine', f0: 880, dur: 0.45, gain: 0.05 });
        this.tone({ type: 'sine', f0: 70, f1: 40, dur: 0.5, gain: 0.18 });
        break;
      case 'doom': // ominous low cluster for the integrity forecast
        [55, 58.3, 82.4].forEach((f) => this.tone({ type: 'sawtooth', f0: f, f1: f * 0.94, dur: 1.4, gain: 0.06, attack: 0.02 }));
        this.noise({ dur: 1, gain: 0.08, filter: 'lowpass', f0: 500, f1: 60 });
        break;
      case 'info':
        this.tone({ type: 'sine', f0: 660, dur: 0.2, gain: 0.05 });
        this.tone({ type: 'sine', f0: 990, dur: 0.3, gain: 0.04, delay: 0.1 });
        break;
      case 'prompt': // the question: a resonant ping
        this.tone({ type: 'sine', f0: 1320, dur: 0.7, gain: 0.06 });
        this.tone({ type: 'sine', f0: 1980, dur: 0.5, gain: 0.025, delay: 0.12 });
        this.tone({ type: 'triangle', f0: 660, dur: 0.6, gain: 0.04, delay: 0.12 });
        break;
      case 'skip': // tape scrub when the log is fast-forwarded
        this.noise({ dur: 0.2, gain: 0.07, filter: 'bandpass', f0: 4000, f1: 500, q: 2 });
        this.tone({ type: 'sawtooth', f0: 1600, f1: 200, dur: 0.18, gain: 0.03 });
        break;
      case 'confirm': // access granted, then the console collapses
        [784, 1175, 1568].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.09, gain: 0.032, delay: i * 0.06 }));
        this.tone({ type: 'sawtooth', f0: 2000, f1: 50, dur: 0.55, gain: 0.022, delay: 0.2 });
        break;
      case 'error': this.tone({ type: 'square', f0: 160, f1: 120, dur: 0.12, gain: 0.045 }); break;
      case 'click': this.tone({ type: 'sine', f0: 900, dur: 0.04, gain: 0.04 }); break;
    }
  }
}
