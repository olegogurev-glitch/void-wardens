// Sector weather and the starfield backdrop. Presentation only (renderer-owned, real time).
//
//   rain     diagonal streaks + ground ripples        storm   heavier rain + lightning strikes
//   snow     slow swaying flakes                      embers  sparks rising from the smelters
//   glyphs   falling streams of hex characters        fog     slow banks of mist
//   dust     big soft motes drifting in the stacks    meteors streaks across a starfield
//   static   corruption blocks and periodic tears
//
// The renderer calls step(dt) every frame, drawGround() under the towers and drawFront()
// over everything. flash (0..1) and tear (0..1) feed the lighting and post passes.
import { WORLD_W, WORLD_H } from './config.js';
import { rgba, glow, aura, puff, circuitPath } from './render.js';

const W = WORLD_W, H = WORLD_H, TAU = Math.PI * 2;
const R = (a, b) => a + Math.random() * (b - a);
const GLYPHS = '0123456789ABCDEF<>/#*:=';
const BASE = { rain: 340, storm: 420, snow: 220, embers: 110, glyphs: 34, fog: 7, dust: 60, meteors: 0, static: 0 };

export class Weather {
  // type: one of the kinds above (or null); scale: 0..1 share from the quality tier
  constructor(type, scale = 1, opts = {}) {
    this.type = type || null;
    this.scale = scale;
    this.color = opts.color || '#3dff9e';
    this.autoStrike = opts.autoStrike !== false; // false: strikes come from the game (Lightning rule)
    this.parts = [];
    this.ripples = [];
    this.blocks = [];
    this.flash = 0;   // lightning envelope (storm)
    this.tear = 0;    // corruption tear envelope (static)
    this.thundered = false;
    this.bolt = null;
    this.meteor = null;
    this.nextStrike = R(3, 7);
    this.nextTear = R(2, 5);
    this.nextMeteor = R(1, 3);
    const n = Math.round((BASE[this.type] || 0) * scale);
    for (let i = 0; i < n; i++) this.parts.push(this.spawn(true));
  }

  spawn(initial) {
    switch (this.type) {
      case 'rain': case 'storm': {
        // aimed so each drop lands somewhere on the board when its life runs out
        const life = R(0.25, 1.35), vy = R(820, 1080) * (this.type === 'storm' ? 1.15 : 1), vx = vy * (this.type === 'storm' ? 0.26 : 0.17);
        const lx = R(-40, W + 40), ly = R(0, H), t0 = initial ? Math.random() * life : life;
        return { x: lx - vx * t0, y: ly - vy * t0, vx, vy, life: t0, len: R(10, 22), a: Math.random() < 0.25 ? 0.3 : 0.14 };
      }
      case 'snow':
        return { x: R(-20, W + 20), y: initial ? R(0, H) : -10, vy: R(18, 52), sway: R(6, 22), ph: R(0, TAU), s: R(1, 2.8), a: R(0.3, 0.8) };
      case 'embers':
        return { x: R(0, W), y: initial ? R(0, H) : H + 10, vy: -R(22, 75), sway: R(8, 26), ph: R(0, TAU), s: R(1, 2.6), a: R(0.35, 0.9), hot: Math.random() < 0.35 };
      case 'glyphs': {
        const n = Math.floor(R(5, 11));
        return { x: Math.round(R(0, W) / 16) * 16 + 8, y: initial ? R(-200, H) : R(-260, -40), vy: R(70, 170), n, chars: Array.from({ length: n }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]), swap: 0 };
      }
      case 'fog':
        return { x: R(-300, W + 300), y: R(0, H), r: R(200, 380), vx: R(5, 16) * (Math.random() < 0.5 ? 1 : -1), a: R(0.1, 0.19) };
      case 'dust':
        return { x: R(0, W), y: R(0, H), vx: R(-6, 6), vy: R(-8, -2), s: R(2, 4.5), ph: R(0, TAU), a: R(0.12, 0.35) };
      default:
        return {};
    }
  }

  step(dt, rt) {
    if (!this.type) return;
    const P = this.parts;
    switch (this.type) {
      case 'rain': case 'storm':
        for (let i = 0; i < P.length; i++) {
          const d = P[i];
          d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt;
          if (d.life <= 0) {
            if (this.ripples.length < 80) this.ripples.push({ x: d.x, y: d.y, t: 0 });
            P[i] = this.spawn(false);
          }
        }
        break;
      case 'snow':
        for (let i = 0; i < P.length; i++) {
          const f = P[i];
          f.y += f.vy * dt; f.x += (Math.sin(rt * 0.9 + f.ph) * f.sway + 8) * dt;
          if (f.y > H + 10 || f.x > W + 30) P[i] = this.spawn(false);
        }
        break;
      case 'embers':
        for (let i = 0; i < P.length; i++) {
          const e = P[i];
          e.y += e.vy * dt; e.x += Math.sin(rt * 1.7 + e.ph) * e.sway * dt;
          if (e.y < -10) P[i] = this.spawn(false);
        }
        break;
      case 'glyphs':
        for (let i = 0; i < P.length; i++) {
          const g = P[i];
          g.y += g.vy * dt;
          if ((g.swap -= dt) <= 0) { g.swap = R(0.05, 0.2); g.chars[Math.floor(Math.random() * g.n)] = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
          if (g.y - g.n * 13 > H) P[i] = this.spawn(false);
        }
        break;
      case 'fog':
        for (const b of P) {
          b.x += b.vx * dt;
          if (b.x > W + b.r) b.x = -b.r; else if (b.x < -b.r) b.x = W + b.r;
        }
        break;
      case 'dust':
        for (let i = 0; i < P.length; i++) {
          const m = P[i];
          m.x += (m.vx + Math.sin(rt * 0.5 + m.ph) * 4) * dt; m.y += m.vy * dt;
          if (m.y < -10 || m.x < -10 || m.x > W + 10) { P[i] = this.spawn(false); P[i].y = H + 8; }
        }
        break;
      case 'meteors':
        if (this.meteor) {
          const m = this.meteor;
          m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt;
          if (m.t > m.dur) this.meteor = null;
        } else if ((this.nextMeteor -= dt) <= 0) {
          this.nextMeteor = R(1.5, 5);
          const sp = R(520, 760);
          this.meteor = { x: R(W * 0.3, W + 100), y: R(-60, H * 0.4), vx: -sp, vy: sp * R(0.3, 0.5), t: 0, dur: R(0.8, 1.4), len: R(90, 170) };
        }
        break;
      case 'static':
        for (const b of this.blocks) b.life -= dt;
        this.blocks = this.blocks.filter((b) => b.life > 0);
        if (Math.random() < dt * 18 * this.scale && this.blocks.length < 24) {
          this.blocks.push({ x: R(0, W), y: R(0, H), w: R(20, 140), h: R(4, 26), life: R(0.05, 0.22), seed: Math.random() * 100 });
        }
        if ((this.nextTear -= dt) <= 0) { this.nextTear = R(2.5, 6); this.tearT = 0; }
        if (this.tearT !== undefined) {
          this.tearT += dt;
          this.tear = this.tearT < 0.14 ? 1 - this.tearT / 0.14 : 0;
          if (this.tearT > 0.14) this.tearT = undefined;
        }
        break;
    }
    for (const r of this.ripples) r.t += dt;
    if (this.ripples.length) this.ripples = this.ripples.filter((r) => r.t < 0.42);

    // storm: lightning — a forked bolt, a double flicker, then thunder (the renderer forwards it)
    if (this.type === 'storm') {
      if (this.bolt) {
        const b = this.bolt;
        b.t += dt;
        const t = b.t;
        this.flash = t < 0.07 ? 1 : t < 0.13 ? 0.25 : t < 0.2 ? 0.85 : Math.max(0, 0.6 * (1 - (t - 0.2) / 0.35));
        if (t > 0.6) { this.bolt = null; this.flash = 0; }
      } else if (this.autoStrike && (this.nextStrike -= dt) <= 0) {
        this.nextStrike = R(4, 10);
        this.bolt = { t: 0, ...this.makeBolt() };
        this.thundered = true;
      }
    }
  }

  // a strike on a chosen spot (game-driven)
  strikeAt(x, y) {
    this.bolt = { t: 0, ...this.makeBolt(x, y) };
    this.thundered = true;
  }

  makeBolt(tx, ty) {
    const x1 = tx ?? R(W * 0.1, W * 0.9), y1 = ty ?? R(H * 0.45, H * 0.95), x0 = x1 + R(-200, 200);
    const main = [{ x: x0, y: -20 }];
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      main.push({ x: x0 + (x1 - x0) * f + (i < steps ? R(-40, 40) : 0), y: -20 + (y1 + 20) * f });
    }
    const forks = [];
    for (let k = 0; k < 2; k++) {
      const from = main[2 + Math.floor(Math.random() * 3)];
      const dir = Math.random() < 0.5 ? -1 : 1;
      forks.push([from, { x: from.x + dir * R(40, 90), y: from.y + R(40, 80) }, { x: from.x + dir * R(80, 160), y: from.y + R(90, 150) }]);
    }
    return { main, forks };
  }

  drawGround(ctx) {
    if (!this.ripples.length) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 0.8;
    for (const r of this.ripples) {
      const p = r.t / 0.42;
      ctx.strokeStyle = `rgba(190,225,255,${0.32 * (1 - p)})`;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 1 + p * 8, (1 + p * 8) * 0.45, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawFront(ctx, rt) {
    if (!this.type) return;
    const P = this.parts;
    const lighter = () => (ctx.globalCompositeOperation = 'lighter');
    const normal = () => (ctx.globalCompositeOperation = 'source-over');
    switch (this.type) {
      case 'rain': case 'storm': {
        lighter();
        ctx.lineWidth = 1;
        for (const a of [0.14, 0.3]) {
          ctx.strokeStyle = `rgba(190,220,255,${a})`;
          ctx.beginPath();
          for (const d of P) {
            if (d.a !== a) continue;
            const f = d.len / d.vy;
            ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.vx * f, d.y - d.len);
          }
          ctx.stroke();
        }
        if (this.bolt) {
          const e = this.flash;
          const stroke = (pts, w, style) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); };
          ctx.lineJoin = 'round';
          for (const pts of [this.bolt.main, ...this.bolt.forks]) {
            const main = pts === this.bolt.main;
            stroke(pts, main ? 9 : 5, `rgba(170,150,255,${0.18 * e})`);
            stroke(pts, main ? 2.4 : 1.4, `rgba(240,235,255,${0.95 * e})`);
          }
          ctx.lineJoin = 'miter';
        }
        normal();
        break;
      }
      case 'snow':
        for (const f of P) {
          ctx.fillStyle = `rgba(235,248,255,${f.a})`;
          ctx.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s);
        }
        lighter();
        for (let i = 0; i < P.length; i += 7) { const f = P[i]; ctx.globalAlpha = f.a * 0.5; ctx.drawImage(glow('#bfe8ff'), f.x - f.s * 2.5, f.y - f.s * 2.5, f.s * 5, f.s * 5); }
        ctx.globalAlpha = 1;
        normal();
        break;
      case 'embers':
        lighter();
        for (const e of P) {
          const fl = 0.55 + 0.45 * Math.sin(rt * 9 + e.ph * 3);
          ctx.fillStyle = e.hot ? `rgba(255,220,150,${e.a * fl})` : `rgba(255,120,40,${e.a * fl})`;
          ctx.fillRect(e.x - e.s / 2, e.y - e.s / 2, e.s, e.s);
          if (e.hot) { ctx.globalAlpha = e.a * fl * 0.6; ctx.drawImage(glow('#ff8a3d'), e.x - 6, e.y - 6, 12, 12); ctx.globalAlpha = 1; }
        }
        normal();
        break;
      case 'glyphs':
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        lighter();
        for (const g of P) {
          for (let k = 0; k < g.n; k++) {
            const y = g.y - k * 13;
            if (y < -12 || y > H + 12) continue;
            ctx.fillStyle = k === 0 ? 'rgba(255,235,250,0.75)' : rgba('#ff4fd8', 0.45 * (1 - k / g.n));
            ctx.fillText(g.chars[k], g.x, y);
          }
        }
        normal();
        break;
      case 'fog':
        for (const b of P) {
          ctx.globalAlpha = b.a;
          const im = puff('#8fb3c4');
          ctx.drawImage(im, b.x - b.r, b.y - b.r * 0.6, b.r * 2, b.r * 1.2);
        }
        ctx.globalAlpha = 1;
        break;
      case 'dust':
        lighter();
        for (const m of P) {
          ctx.globalAlpha = m.a * (0.5 + 0.5 * Math.sin(rt * 1.3 + m.ph));
          ctx.drawImage(aura(this.color), m.x - m.s * 2.5, m.y - m.s * 2.5, m.s * 5, m.s * 5);
        }
        ctx.globalAlpha = 1;
        normal();
        break;
      case 'meteors':
        if (this.meteor) {
          const m = this.meteor, a = Math.sin(Math.min(1, m.t / m.dur) * Math.PI);
          const sp = Math.hypot(m.vx, m.vy), tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
          lighter();
          const gr = ctx.createLinearGradient(m.x, m.y, tx, ty);
          gr.addColorStop(0, `rgba(230,245,255,${0.9 * a})`); gr.addColorStop(1, 'rgba(120,200,255,0)');
          ctx.strokeStyle = gr; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.globalAlpha = a; ctx.drawImage(glow('#bfe8ff'), m.x - 8, m.y - 8, 16, 16); ctx.globalAlpha = 1;
          normal();
        }
        break;
      case 'static':
        lighter();
        for (const b of this.blocks) {
          const a = Math.min(1, b.life / 0.08);
          for (let k = 0; k < 5; k++) {
            const h = (b.seed * (k + 1) * 9.13) % 1;
            ctx.fillStyle = h < 0.3 ? `rgba(255,255,255,${0.35 * a})` : rgba('#ff1f3d', 0.4 * a);
            ctx.fillRect(b.x + h * b.w * 0.3, b.y + (k / 5) * b.h, b.w * (0.4 + h * 0.6), Math.max(1, b.h / 8));
          }
        }
        normal();
        break;
    }
  }
}

// Starfield backdrop for orbital sectors: stars, nebula haze and the rim of a planet far below.
export function makeStarfield(cw, ch, M, scale, seed = 9) {
  const c = document.createElement('canvas');
  c.width = Math.ceil((cw + M * 2) * scale); c.height = Math.ceil((ch + M * 2) * scale);
  const g = c.getContext('2d');
  g.scale(scale, scale); g.translate(M, M);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, r, col, a] of [[cw * 0.2, ch * 0.3, 420, '#6a3cff', 0.12], [cw * 0.7, ch * 0.2, 360, '#00a0ff', 0.08], [cw * 0.45, ch * 0.75, 380, '#ff2a6d', 0.05]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(-M, -M, cw + M * 2, ch + M * 2);
  }
  for (let i = 0; i < 900; i++) {
    const x = -M + rnd() * (cw + M * 2), y = -M + rnd() * (ch + M * 2), sz = rnd() < 0.92 ? 0.6 + rnd() * 1.1 : 1.6 + rnd() * 1.4;
    const pick = rnd();
    g.fillStyle = pick < 0.75 ? `rgba(255,255,255,${0.25 + rnd() * 0.7})` : pick < 0.9 ? `rgba(160,220,255,${0.3 + rnd() * 0.6})` : `rgba(255,170,210,${0.3 + rnd() * 0.5})`;
    g.fillRect(x, y, sz, sz);
  }
  // planet rim, lower right
  const px = cw * 0.86, py = ch * 1.32, pr = cw * 0.5;
  const atm = g.createRadialGradient(px, py, pr * 0.94, px, py, pr * 1.12);
  atm.addColorStop(0, 'rgba(0,229,255,0)'); atm.addColorStop(0.35, 'rgba(0,229,255,0.35)'); atm.addColorStop(0.55, 'rgba(120,200,255,0.18)'); atm.addColorStop(1, 'rgba(0,229,255,0)');
  g.fillStyle = atm; g.fillRect(-M, -M, cw + M * 2, ch + M * 2);
  return c;
}
