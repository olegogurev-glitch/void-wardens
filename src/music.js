// Procedural synthwave soundtrack (WebAudio, no files).
// Am – F – C – G at 96 BPM, with three intensity layers that follow the game:
//   0  build / between waves : reverb-soaked pads, slow bass, sparse echoing arp
//   1  wave in progress      : + drums, driving 8th-note bass, full 16th arp
//   2  boss alive            : four-on-the-floor, 16th bass, filters wide open
const BPM = 96;
const STEP = 60 / BPM / 4; // one 16th note
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const BASS = [33, 29, 36, 31];
const ARP = [0, 1, 2, 1, 0, 2, 3, 2];
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
  }
  return buf;
}

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.on = true;
    this.level = 0;
    this.timer = null;
    this.volume = 0.32;
    this.hits = []; // scheduled drum hits { t, amt } — read back by pulse() to sync visuals
  }

  // 0..1 envelope of the most recent audible kick/snare, for beat-synced visuals
  pulse() {
    const c = this.sfx.ctx;
    if (!c || !this.timer || this.sfx.muted || !this.hits.length) return 0;
    const now = c.currentTime - (c.outputLatency || c.baseLatency || 0);
    let v = 0;
    for (const h of this.hits) {
      const dt = now - h.t;
      if (dt >= 0 && dt < 0.6) v = Math.max(v, h.amt * Math.exp(-dt * 7));
    }
    return v * (this.ducked ? 0.3 : 1);
  }

  mark(t, amt) {
    this.hits.push({ t, amt });
    if (this.hits.length > 12) this.hits.shift();
  }

  init() {
    const c = this.sfx.ctx;
    if (!c || this.bus) return;
    this.bus = c.createGain();
    this.bus.gain.value = 0;
    this.duckGain = c.createGain();
    this.dry = c.createGain();
    this.verb = c.createConvolver();
    this.verb.buffer = impulse(c, 3, 2.4);
    this.verbIn = c.createGain();
    this.delay = c.createDelay(1.5);
    this.delay.delayTime.value = STEP * 3;
    const fb = c.createGain();
    fb.gain.value = 0.38;
    const dl = c.createBiquadFilter();
    dl.type = 'lowpass'; dl.frequency.value = 2600;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay);
    this.delayIn = c.createGain();
    this.delayIn.connect(this.delay);
    this.verbIn.connect(this.verb);
    this.dry.connect(this.duckGain);
    this.verb.connect(this.duckGain);
    dl.connect(this.duckGain);
    this.duckGain.connect(this.bus);
    this.bus.connect(this.sfx.master);
  }

  start() {
    if (!this.sfx.ctx || this.timer || !this.on) return;
    this.init();
    const c = this.sfx.ctx;
    this.bus.gain.cancelScheduledValues(c.currentTime);
    this.bus.gain.setTargetAtTime(this.volume, c.currentTime, 0.8);
    this.step = 0;
    this.next = c.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 25);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    if (this.bus) this.bus.gain.setTargetAtTime(0, this.sfx.ctx.currentTime, 0.3);
  }

  setOn(on) {
    this.on = on;
    if (on) this.start(); else this.stop();
  }

  setLevel(level) { this.level = level; }

  duck(down) {
    this.ducked = down;
    if (!this.duckGain) return;
    this.duckGain.gain.setTargetAtTime(down ? 0.25 : 1, this.sfx.ctx.currentTime, 0.15);
  }

  tick() {
    const c = this.sfx.ctx;
    if (c.state !== 'running') return;
    // after a throttled background tab, skip ahead instead of firing a burst of old notes
    if (this.next < c.currentTime - 0.05) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.12) {
      this.playStep(this.step, this.next);
      this.next += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t) {
    const L = this.level;
    const bar = Math.floor(step / 16), s = step % 16;
    const chord = CHORDS[bar], root = BASS[bar];
    const open = L >= 2 ? 1 : L >= 1 ? 0.6 : 0.3;

    // pads — long, detuned, drenched in reverb
    if (s === 0) {
      for (const n of chord) {
        for (const det of [-9, 9]) {
          this.voice({ type: 'sawtooth', freq: mtof(n), detune: det, t, dur: STEP * 16 + 0.8, gain: 0.022, attack: 0.9, release: 1.1, cutoff: 700 + 900 * open, verb: 0.9 });
        }
      }
    }

    // bass
    const bassEvery = L >= 2 ? 1 : L >= 1 ? 2 : 4;
    if (s % bassEvery === 0) {
      const oct = L >= 1 && (s / bassEvery) % 2 === 1 ? 12 : 0;
      this.voice({ type: 'sawtooth', freq: mtof(root + oct), t, dur: STEP * bassEvery * 0.9, gain: L >= 1 ? 0.1 : 0.08, attack: 0.005, release: 0.06, cutoff: 260 + 500 * open, q: 4 });
    }

    // arpeggio
    const arpEvery = L >= 1 ? 1 : 2;
    if (s % arpEvery === 0 && (L >= 1 || s % 4 !== 2)) {
      const notes = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24];
      const n = notes[ARP[(s / arpEvery) % ARP.length]];
      this.voice({ type: L >= 1 ? 'square' : 'triangle', freq: mtof(n), t, dur: STEP * 0.9, gain: L >= 1 ? 0.022 : 0.03, attack: 0.004, release: 0.08, cutoff: 1400 + 2400 * open, delay: 0.55, verb: 0.25 });
    }

    // drums
    if (L >= 1) {
      if (s === 0 || s === 8 || (L >= 2 && (s === 4 || s === 12))) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (L >= 2 ? true : s % 4 === 2) this.hat(t, s % 4 === 2 ? 0.05 : 0.025);
    } else if (s === 0 && bar % 2 === 0) {
      this.kick(t, 0.25);
    }
  }

  voice({ type, freq, t, dur, gain, attack = 0.01, release = 0.1, cutoff = 0, q = 1, detune = 0, verb = 0, delay = 0 }) {
    const c = this.sfx.ctx;
    const o = c.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = c.createGain();
    const sustainEnd = t + Math.max(attack, dur - release);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, sustainEnd);
    g.gain.linearRampToValueAtTime(0, t + dur);
    let node = o;
    if (cutoff) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = q;
      o.connect(f); node = f;
    }
    node.connect(g);
    g.connect(this.dry);
    if (verb) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.verbIn); }
    if (delay) { const s = c.createGain(); s.gain.value = delay; g.connect(s); s.connect(this.delayIn); }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(t, gain = 0.5) {
    this.mark(t, gain / 0.5);
    const c = this.sfx.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g); g.connect(this.dry);
    o.start(t); o.stop(t + 0.35);
  }

  noiseHit(t, { gain, dur, type, freq, q = 1, verb = 0 }) {
    const c = this.sfx.ctx;
    const s = c.createBufferSource();
    s.buffer = this.sfx.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.dry);
    if (verb) { const v = c.createGain(); v.gain.value = verb; g.connect(v); v.connect(this.verbIn); }
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
  }

  snare(t) {
    this.mark(t, 0.45);
    this.noiseHit(t, { gain: 0.16, dur: 0.22, type: 'bandpass', freq: 1900, q: 0.8, verb: 0.6 });
    this.voice({ type: 'triangle', freq: 190, t, dur: 0.1, gain: 0.08, attack: 0.002, release: 0.08 });
  }

  hat(t, gain) {
    this.noiseHit(t, { gain, dur: 0.05, type: 'highpass', freq: 7500 });
  }
}
