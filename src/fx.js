// Visual effects state (pure data — the renderer draws it).
// Lives in the simulation so pausing freezes effects too.

const TAU = Math.PI * 2;
const MAX_PARTS = 2200;

export class FX {
  constructor() { this.clear(); }

  clear() {
    this.parts = [];   // particles: glow | spark | smoke | debris | shard | ember
    this.rings = [];   // expanding shockwaves
    this.waves = [];   // screen refraction that rides along big expanding rings (WebGL post)
    this.beams = [];   // straight energy beams
    this.arcs = [];    // lightning polylines
    this.texts = [];   // floating numbers
    this.timers = [];  // delayed callbacks
    this.shakeMag = 0;
    this.flashA = 0;
    this.flashRGB = '255,255,255';
  }

  add(p) {
    if (this.parts.length >= MAX_PARTS) return;
    p.max = p.life;
    this.parts.push(p);
  }

  burst(x, y, color, n = 12, speed = 120, size = 3, life = 0.5, kind = 'glow', drag = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = speed * (0.25 + Math.random() * 0.75);
      this.add({
        kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.5 + Math.random() * 0.7), size: size * (0.6 + Math.random() * 0.8),
        color, drag, rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  ring(x, y, r0, r1, life, color, width = 3) {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
    if (r1 >= 40 && r1 > r0) {
      if (this.waves.length >= 24) this.waves.shift();
      this.waves.push({ x, y, r0, r1, life, max: life, amp: Math.min(1.5, width / 4) * Math.min(1, (r1 - r0) / 60) });
    }
  }
  beam(x1, y1, x2, y2, color, width, life) { this.beams.push({ x1, y1, x2, y2, color, width, life, max: life }); }
  lightning(points, color, width = 2, life = 0.16) { this.arcs.push({ points, color, width, life, max: life }); }
  text(x, y, str, color = '#fff', size = 13) { this.texts.push({ x, y, str, color, size, life: 0.9, max: 0.9 }); }
  shake(m) { this.shakeMag = Math.min(22, Math.max(this.shakeMag, m)); }
  flash(rgb, a) { this.flashRGB = rgb; this.flashA = Math.max(this.flashA, a); }
  after(delay, fn) { this.timers.push({ t: delay, fn }); }

  update(dt) {
    const P = this.parts;
    let j = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      if (p.grav) p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.rot += p.spin * dt;
      P[j++] = p;
    }
    P.length = j;

    const tick = (arr) => { let k = 0; for (const o of arr) { o.life -= dt; if (o.life > 0) arr[k++] = o; } arr.length = k; };
    tick(this.rings); tick(this.waves); tick(this.beams); tick(this.arcs);
    for (const t of this.texts) t.y -= 30 * dt;
    tick(this.texts);

    if (this.timers.length) {
      const due = [];
      this.timers = this.timers.filter((t) => { t.t -= dt; if (t.t <= 0) { due.push(t); return false; } return true; });
      for (const t of due) t.fn();
    }

    this.shakeMag *= Math.exp(-9 * dt);
    if (this.shakeMag < 0.1) this.shakeMag = 0;
    this.flashA = Math.max(0, this.flashA - dt * 1.6);
  }
}
