// Tiny WebAudio synth — every sound is generated, no audio files.
const GAPS = { hail: 40, shield: 60, heal: 250, shoot: 45, thump: 60, zap: 55, frost: 80, gravity: 120, pop: 35, pop2: 50, boom: 70, bigboom: 150, launch: 70, rail: 60, emp: 90 };

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.45;
    this.last = Object.create(null);
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
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
    o.connect(g); g.connect(this.master);
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
    s.connect(fl); fl.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.last[name] || 0) < (GAPS[name] ?? 25)) return;
    this.last[name] = now;
    const r = Math.random();
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
        break;
      case 'pop2': this.noise({ dur: 0.18, gain: 0.08, filter: 'lowpass', f0: 1800, f1: 200 }); break;
      case 'boom':
        this.noise({ dur: 0.45, gain: 0.2, filter: 'lowpass', f0: 1200, f1: 80 });
        this.tone({ type: 'sine', f0: 140, f1: 40, dur: 0.35, gain: 0.14 });
        break;
      case 'bigboom':
        this.noise({ dur: 1.2, gain: 0.32, filter: 'lowpass', f0: 900, f1: 40 });
        this.tone({ type: 'sine', f0: 90, f1: 25, dur: 1, gain: 0.28 });
        break;
      case 'place':
        this.tone({ type: 'sine', f0: 520, dur: 0.08, gain: 0.08 });
        this.tone({ type: 'sine', f0: 780, dur: 0.14, gain: 0.08, delay: 0.07 });
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
      case 'error': this.tone({ type: 'square', f0: 160, f1: 120, dur: 0.12, gain: 0.045 }); break;
      case 'click': this.tone({ type: 'sine', f0: 900, dur: 0.04, gain: 0.04 }); break;
    }
  }
}
