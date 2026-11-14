// Canvas renderer — cyber-grid theme (Tron / Blade Runner minimalism).
// Everything is procedural: neon line-art on near-black, no image assets.
import { WORLD_W, WORLD_H, TILE, COLS, ROWS, TOWERS } from './config.js';

const TAU = Math.PI * 2;
export const PAL = {
  bg: '#03050a',
  grid: '#00e5ff',
  hostile: '#ff2a6d',
  amber: '#ffb800',
  ok: '#3dff9e',
  ink: '#060a12',
};
const MONO = '"JetBrains Mono", ui-monospace, monospace';
// Set from the OS "reduce motion" preference: softer shake, no glitch slices, dimmer flashes.
export const motion = { reduced: false };

// ── Color + sprite helpers ──────────────────────────────────
const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    v = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
    rgbCache.set(hex, v);
  }
  return v;
}
export const rgba = (hex, a) => `rgba(${rgb(hex)},${a})`;

function makeSprite(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}
const glowCache = new Map();
const auraCache = new Map();
export function glow(color) {
  let c = glowCache.get(color);
  if (!c) {
    c = makeSprite([[0, 'rgba(255,255,255,0.95)'], [0.14, rgba(color, 0.9)], [0.4, rgba(color, 0.28)], [1, rgba(color, 0)]]);
    glowCache.set(color, c);
  }
  return c;
}
export function aura(color) {
  let c = auraCache.get(color);
  if (!c) {
    c = makeSprite([[0, rgba(color, 0.5)], [0.5, rgba(color, 0.13)], [1, rgba(color, 0)]]);
    auraCache.set(color, c);
  }
  return c;
}
// Multiplies with the current globalAlpha and restores it, so a translucent
// parent (e.g. the placement ghost) stays translucent.
function sprite(ctx, img, x, y, r, alpha = 1) {
  if (r <= 0 || alpha <= 0) return;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}
const add = (ctx) => (ctx.globalCompositeOperation = 'lighter');
const norm = (ctx) => (ctx.globalCompositeOperation = 'source-over');

// square with cut corners — the "chip" silhouette used everywhere
function chip(ctx, r, cut = r * 0.33) {
  ctx.beginPath();
  ctx.moveTo(-r + cut, -r); ctx.lineTo(r - cut, -r); ctx.lineTo(r, -r + cut); ctx.lineTo(r, r - cut);
  ctx.lineTo(r - cut, r); ctx.lineTo(-r + cut, r); ctx.lineTo(-r, r - cut); ctx.lineTo(-r, -r + cut);
  ctx.closePath();
}
function square(ctx, r) { ctx.beginPath(); ctx.rect(-r, -r, r * 2, r * 2); }
// HUD corner brackets around a box of half-size r
function brackets(ctx, r, len) {
  ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.moveTo(sx * r, sy * (r - len)); ctx.lineTo(sx * r, sy * r); ctx.lineTo(sx * (r - len), sy * r);
  }
}
// circuit-style lightning: orthogonal hops with a random elbow, re-rolled every frame
function circuitPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const f = 0.25 + Math.random() * 0.5;
    if (Math.random() < 0.5) {
      const mx = a.x + (b.x - a.x) * f;
      ctx.lineTo(mx, a.y + (Math.random() - 0.5) * 4); ctx.lineTo(mx, b.y);
    } else {
      const my = a.y + (b.y - a.y) * f;
      ctx.lineTo(a.x + (Math.random() - 0.5) * 4, my); ctx.lineTo(b.x, my);
    }
    ctx.lineTo(b.x, b.y);
  }
}
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };
const easeOut = (t) => 1 - (1 - t) * (1 - t);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

// ── Towers (exported: also used for dock icons) ─────────────
export function drawTower(ctx, t, time) {
  const s = t.stats, def = TOWERS[t.type];
  const base = def.color, col = s.color;
  const sc = t.spawnT < 1 ? Math.max(0.01, easeOutBack(t.spawnT)) : 1;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.scale(sc, sc);

  if (t.level >= 2) {
    add(ctx);
    sprite(ctx, aura(col), 0, 0, t.level >= 3 ? 32 : 25, 0.32 + 0.1 * Math.sin(time * 3 + t.id));
    norm(ctx);
  }
  if (t.level >= 3) {
    ctx.save();
    ctx.rotate(time * 0.5);
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    square(ctx, 19); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // chip platform with pins
  ctx.strokeStyle = rgba(base, 0.45); ctx.lineWidth = 1;
  ctx.beginPath();
  for (const o of [-7, 0, 7]) {
    ctx.moveTo(o, -15); ctx.lineTo(o, -18); ctx.moveTo(o, 15); ctx.lineTo(o, 18);
    ctx.moveTo(-15, o); ctx.lineTo(-18, o); ctx.moveTo(15, o); ctx.lineTo(18, o);
  }
  ctx.stroke();
  chip(ctx, 15, 5);
  ctx.fillStyle = PAL.ink; ctx.fill();
  ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(base, 0.9); ctx.stroke();
  chip(ctx, 11, 3.5);
  ctx.strokeStyle = rgba(base, 0.14); ctx.lineWidth = 1; ctx.stroke();

  switch (t.type) {
    case 'blaster': drawBlaster(ctx, t, s, col, time); break;
    case 'arc': drawArc(ctx, t, s, col, time); break;
    case 'cryo': drawCryo(ctx, t, s, col, time); break;
    case 'launcher': drawLauncher(ctx, t, s, col); break;
  }

  // level pips (little LEDs)
  ctx.fillStyle = col;
  for (let i = 0; i < t.level; i++) ctx.fillRect((i - (t.level - 1) / 2) * 5 - 1.5, 11, 3, 2);
  if (t.upgradeFlash > 0) {
    add(ctx);
    sprite(ctx, glow(col), 0, 0, 40 * t.upgradeFlash + 10, t.upgradeFlash);
    norm(ctx);
  }
  ctx.restore();
}

function barrel(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.rect(x, y - h / 2, w, h); ctx.fill(); ctx.stroke();
}

function drawBlaster(ctx, t, s, col, time) {
  ctx.save();
  ctx.rotate(t.angle);
  const rk = -t.recoil * 4;
  ctx.fillStyle = '#0b1220'; ctx.strokeStyle = col; ctx.lineWidth = 1;
  if (s.kind === 'rail') {
    barrel(ctx, rk, -4, 27, 3);
    barrel(ctx, rk, 4, 27, 3);
    add(ctx);
    ctx.strokeStyle = rgba(col, 0.55 + 0.45 * Math.sin(time * 9 + t.id)); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(4 + rk, 0); ctx.lineTo(27 + rk, 0); ctx.stroke();
    norm(ctx);
  } else if (s.gatling) {
    const baseA = ctx.globalAlpha;
    for (let i = 0; i < 3; i++) {
      const a = t.spin + (i * TAU) / 3;
      ctx.globalAlpha = baseA * (0.5 + 0.5 * (Math.cos(a) * 0.5 + 0.5));
      barrel(ctx, 4 + rk * 0.4, Math.sin(a) * 4, 18, 2.6);
    }
    ctx.globalAlpha = baseA;
    ctx.fillStyle = col; ctx.fillRect(14, -5.5, 2, 11);
    if (t.heat > 0.05) { // barrels glow as the array spins up
      add(ctx); sprite(ctx, glow('#ffb347'), 20, 0, 3 + 6 * t.heat, 0.8 * t.heat); norm(ctx);
    }
  } else if (s.scatter) {
    for (const a of [-0.35, 0, 0.35]) { ctx.save(); ctx.rotate(a); barrel(ctx, 4 + rk, 0, 16, 3); ctx.restore(); }
  } else if (s.twin) {
    barrel(ctx, 4 + (t.barrel === 0 ? rk : 0), -4, 17, 3);
    barrel(ctx, 4 + (t.barrel === 1 ? rk : 0), 4, 17, 3);
  } else {
    const h = s.boltSize > 1 ? 6 : 4;
    barrel(ctx, 4 + rk, 0, s.splash ? 13 : 17, h);
    if (s.splash) {
      barrel(ctx, 14 + rk, 0, 6, 9);
      add(ctx); sprite(ctx, glow(col), 20 + rk, 0, 5, 0.8); norm(ctx);
    } else if (s.boltSize > 1) {
      ctx.fillStyle = col;
      for (const x of [9, 13]) ctx.fillRect(x + rk, -3, 1.2, 6);
    }
  }
  chip(ctx, 8, 3);
  ctx.fillStyle = '#0a101c'; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.stroke();
  add(ctx);
  sprite(ctx, glow(col), 0, 0, 7.5 + Math.sin(time * 5 + t.id), 0.85);
  norm(ctx);
  ctx.restore();
}

function drawArc(ctx, t, s, col, time) {
  const oy = -12, orbY = oy - 10;
  const n = t.level + 1, R = 11;
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const a = time * 2.2 + (i * TAU) / n + t.id;
    nodes.push({ x: Math.cos(a) * R, y: oy + Math.sin(a) * R * 0.35, front: Math.sin(a) > 0 });
  }
  const drawNode = (nd) => { ctx.fillStyle = col; ctx.fillRect(nd.x - 1.5, nd.y - 1.5, 3, 3); };
  nodes.filter((nd) => !nd.front).forEach(drawNode);

  ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-9, 9); ctx.lineTo(0, oy); ctx.lineTo(9, 9); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, orbY); ctx.lineTo(5, oy + 2); ctx.lineTo(0, 8); ctx.lineTo(-5, oy + 2); ctx.closePath();
  ctx.fillStyle = '#0d0818'; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, orbY); ctx.lineTo(0, 8); ctx.strokeStyle = rgba(col, 0.35); ctx.stroke();
  ctx.strokeStyle = rgba(col, 0.75);
  for (const y of [oy + 6, oy + 11]) { ctx.beginPath(); ctx.moveTo(-5, y); ctx.lineTo(5, y); ctx.stroke(); }

  add(ctx);
  const ready = t.cooldown <= 0.05;
  sprite(ctx, glow(col), 0, orbY, 8 + Math.sin(time * 6 + t.id) * 1.5 + (ready ? 2 : 0), 1);
  if (s.kind === 'nova') {
    ctx.save(); ctx.translate(0, orbY); ctx.rotate(-time * 1.5);
    ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    square(ctx, 9); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }
  if (Math.random() < (ready ? 0.12 : 0.04)) {
    const a = Math.random() * TAU;
    ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 1;
    circuitPath(ctx, [{ x: 0, y: orbY }, { x: Math.cos(a) * 14, y: orbY + Math.sin(a) * 10 }]);
    ctx.stroke();
  }
  norm(ctx);
  nodes.filter((nd) => nd.front).forEach(drawNode);
}

function drawCryo(ctx, t, s, col, time) {
  const bob = Math.sin(time * 2 + t.id) * 1.5;
  const charge = Math.max(0, Math.min(1, 1 - Math.max(0, t.cooldown) * s.rate));
  // charge meter: segmented bar under the crystal
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i / 6 < charge ? rgba(col, 0.9) : rgba(col, 0.15);
    ctx.fillRect(-8.5 + i * 3, 6, 2, 2);
  }

  if (s.singularity) {
    const cy = -6 + bob;
    add(ctx); sprite(ctx, aura(col), 0, cy, 22, 0.8); norm(ctx);
    ctx.save(); ctx.translate(0, cy);
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i % 2 ? -1 : 1) * time * (1 + i * 0.7) + i);
      ctx.strokeStyle = rgba(col, 0.9 - i * 0.22); ctx.lineWidth = 1.2;
      square(ctx, 11 - i * 3); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#020106'; ctx.fillRect(-3.5, -3.5, 7, 7);
    add(ctx); sprite(ctx, glow(col), 0, 0, 5, 0.9); norm(ctx);
    ctx.restore();
    return;
  }

  const cy = -8 + bob;
  for (let i = 0; i < t.level - 1; i++) {
    const a = time * 1.6 + i * Math.PI;
    ctx.fillStyle = rgba(col, 0.9);
    ctx.fillRect(Math.cos(a) * 14 - 1.5, cy + Math.sin(a) * 4 - 1.5, 3, 3);
  }
  ctx.save(); ctx.translate(0, cy);
  ctx.beginPath();
  ctx.moveTo(0, -14); ctx.lineTo(6.5, -7); ctx.lineTo(6.5, 5); ctx.lineTo(0, 11); ctx.lineTo(-6.5, 5); ctx.lineTo(-6.5, -7); ctx.closePath();
  ctx.fillStyle = rgba(col, 0.12); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.strokeStyle = rgba(col, 0.45); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-6.5, -7); ctx.lineTo(0, -3); ctx.lineTo(6.5, -7); ctx.moveTo(0, -3); ctx.lineTo(0, 11); ctx.stroke();
  add(ctx); sprite(ctx, glow(col), 0, -2, 10, 0.3 + 0.5 * charge); norm(ctx);
  ctx.restore();
}

function drawLauncher(ctx, t, s, col) {
  ctx.save();
  ctx.rotate(t.angle);
  ctx.translate(-t.recoil * 3, 0);
  ctx.fillStyle = '#0b1220'; ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 1;
  ctx.fillRect(-14, -13, 9, 3); ctx.fillRect(-14, 10, 9, 3);
  chip(ctx, 11, 3);
  ctx.fillStyle = '#0a0f1b'; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(9, -6, 1.5, 12);

  const ready = t.cooldown < 0.4;
  let holes;
  if (s.missiles >= 6) holes = [[-4, -5], [-4, 0], [-4, 5], [3, -5], [3, 0], [3, 5]].map(([x, y]) => [x, y, 1.9]);
  else if (s.missiles >= 3) holes = [[0, -5.5, 2.4], [0, 0, 2.4], [0, 5.5, 2.4]];
  else holes = [[0, 0, 4.5]];
  for (const [x, y, r] of holes) {
    ctx.fillStyle = '#02030a'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 0.8; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
    if (ready) { add(ctx); sprite(ctx, glow(col), x, y, r * 2.2, 0.9); norm(ctx); }
  }
  ctx.restore();
}

// ── Enemies (hostile code) ──────────────────────────────────
function drawEnemy(ctx, e, time, map) {
  const col = e.def.color, r = e.radius;
  const sp = Math.min(1, e.age / 0.35);
  // occasional glitch displacement
  const g = hash(Math.floor(time * 12) + e.seed * 7);
  const jx = !motion.reduced && g < 0.08 ? (hash(g * 99) - 0.5) * 8 : 0;
  ctx.save();
  ctx.translate(e.x + jx, e.y);
  if (sp < 1) ctx.scale(sp, sp * 0.3 + 0.7 * sp);

  const cloaked = e.def.stealth && e.revealT <= 0;
  if (!cloaked) {
    add(ctx);
    sprite(ctx, aura(col), 0, 0, r * (e.def.boss ? 2.6 : 2.1), e.def.boss ? 0.7 : 0.45);
    norm(ctx);
  }

  if (e.type === 'scout') {
    ctx.save();
    ctx.rotate(e.angle);
    const w = 1 + Math.sin(time * 30 + e.seed) * 0.12;
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.lineTo(-7, -8 * w); ctx.lineTo(-3, 0); ctx.lineTo(-7, 8 * w); ctx.closePath();
    };
    // RGB split ghosts
    add(ctx); ctx.lineWidth = 1;
    ctx.translate(-1.6, 0); shape(); ctx.strokeStyle = 'rgba(0,229,255,0.55)'; ctx.stroke();
    ctx.translate(3.2, 0); shape(); ctx.strokeStyle = 'rgba(255,0,80,0.55)'; ctx.stroke();
    ctx.translate(-1.6, 0); norm(ctx);
    shape();
    ctx.fillStyle = '#10020b'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(1, -1.5, 4, 3);
    add(ctx); sprite(ctx, glow(col), 3, 0, 5, 1); norm(ctx);
    ctx.restore();
  } else if (e.type === 'brute') {
    const rot = time * 0.5 + e.seed;
    ctx.save(); ctx.rotate(rot);
    square(ctx, r * 0.82);
    ctx.fillStyle = '#12030a'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.85); ctx.lineWidth = 1.5;
    brackets(ctx, r, r * 0.45); ctx.stroke();
    ctx.rotate(-rot * 2.4);
    square(ctx, r * 0.42);
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    add(ctx);
    sprite(ctx, glow(col), 0, 0, r * 0.55 + Math.sin(time * 4 + e.seed) * 1.5, 1);
    norm(ctx);
  } else if (e.type === 'worm' || e.type === 'frag') {
    // Worm: chain of spinning segments trailing the head; Fragment: a lone segment
    // body segments follow the path behind the head, so the tail bends around corners
    const segs = e.type === 'worm' ? 4 : 1;
    const path = map && map.paths[e.path];
    for (let i = segs - 1; i >= 0; i--) {
      const sr = i ? r * (0.6 - i * 0.06) : r * 0.72;
      let ox = 0, oy = 0;
      if (i && path) {
        const p = path.posAt(Math.max(0, e.d - i * r * 0.85), e.lane + Math.sin(time * 9 - i * 1.1 + e.seed) * 2);
        ox = p.x - e.x; oy = p.y - e.y;
      }
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(time * 2.5 * (i % 2 ? -1 : 1) + e.seed);
      square(ctx, sr);
      ctx.fillStyle = '#150603'; ctx.fill();
      ctx.strokeStyle = i ? rgba(col, 0.75) : col; ctx.lineWidth = i ? 1.2 : 1.6; ctx.stroke();
      ctx.restore();
    }
    if (segs > 1) {
      ctx.save(); ctx.rotate(e.angle);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(r * 0.2, -3.5, 2, 2); ctx.fillRect(r * 0.2, 1.5, 2, 2);
      ctx.restore();
    }
    add(ctx); sprite(ctx, glow(col), 0, 0, r * 0.5, 0.9); norm(ctx);
  } else if (e.type === 'cipher') {
    ctx.save(); ctx.rotate(e.angle);
    ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(-r * 0.7, -r * 0.85); ctx.lineTo(-r * 0.7, r * 0.85); ctx.closePath();
    ctx.fillStyle = '#151102'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = col; ctx.fillRect(-4, -2, 4, 4); ctx.fillRect(0, -0.75, 5, 1.5); // key glyph
    ctx.restore();
    add(ctx); sprite(ctx, glow(col), 0, 0, r * 0.45, 0.8); norm(ctx);
    if (e.shieldUp) {
      ctx.save(); ctx.rotate(-time * 1.5);
      chip(ctx, r + 6, 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,150,0.08)'; ctx.fill();
      ctx.restore();
    } else {
      const f = 1 - Math.max(0, e.shieldT) / e.def.shield;
      ctx.strokeStyle = rgba(col, 0.45); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
      ctx.setLineDash([]);
    }
  } else if (e.type === 'rootkit') {
    // Cloaked: a faint flickering outline only. Revealed: solid, with a scan bracket.
    const baseA = ctx.globalAlpha;
    if (cloaked) ctx.globalAlpha = baseA * (hash(Math.floor(time * 9) + e.seed) > 0.85 ? 0.32 : 0.14);
    ctx.save(); ctx.rotate(Math.PI / 4 + Math.sin(time * 2 + e.seed) * 0.25);
    square(ctx, r * 0.78);
    ctx.fillStyle = '#12040b'; ctx.fill();
    if (cloaked) ctx.setLineDash([3, 3]);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([]);
    square(ctx, r * 0.36);
    ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    ctx.fillStyle = col; ctx.fillRect(-3, -1, 6, 2);
    if (!cloaked) {
      add(ctx); sprite(ctx, glow(col), 0, 0, r * 0.5, 0.9); norm(ctx);
      ctx.strokeStyle = 'rgba(127,233,255,0.8)'; ctx.lineWidth = 1;
      brackets(ctx, r + 5, 4); ctx.stroke();
    }
    ctx.globalAlpha = baseA;
  } else if (e.type === 'patcher') {
    ctx.save(); ctx.rotate(time * 0.8 + e.seed);
    const a = r * 0.95, b = r * 0.36;
    ctx.beginPath();
    ctx.moveTo(-b, -a); ctx.lineTo(b, -a); ctx.lineTo(b, -b); ctx.lineTo(a, -b); ctx.lineTo(a, b); ctx.lineTo(b, b);
    ctx.lineTo(b, a); ctx.lineTo(-b, a); ctx.lineTo(-b, b); ctx.lineTo(-a, b); ctx.lineTo(-a, -b); ctx.lineTo(-b, -b);
    ctx.closePath();
    ctx.fillStyle = '#17061a'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();
    const f = 1 - Math.max(0, e.healT) / e.def.heal.every;
    ctx.strokeStyle = rgba(col, 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    add(ctx); sprite(ctx, glow(col), 0, 0, r * 0.45 + f * 2, 0.9); norm(ctx);
  } else {
    // Leviathan.exe — nested rotating frames + orbiting shards + glitch slices
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate((i % 2 ? -1 : 1) * time * (0.35 + i * 0.35) + i * 0.4);
      const rr = r * (1.05 - i * 0.28);
      if (i === 0) { chip(ctx, rr, rr * 0.3); ctx.fillStyle = '#14020a'; ctx.fill(); }
      else square(ctx, rr);
      ctx.strokeStyle = i === 0 ? col : rgba(i === 1 ? '#ff6a8a' : '#ffffff', 0.8);
      ctx.lineWidth = i === 0 ? 2.4 : 1.4;
      ctx.stroke();
      ctx.restore();
    }
    add(ctx);
    sprite(ctx, glow(col), 0, 0, r * 0.6 + Math.sin(time * 3) * 3, 1);
    for (let i = 0; i < 4; i++) {
      const a = time * 1.3 + (i * TAU) / 4;
      ctx.fillStyle = col;
      ctx.fillRect(Math.cos(a) * r * 1.45 - 3, Math.sin(a) * r * 1.45 - 3, 6, 6);
    }
    for (let i = 0; i < 3; i++) {
      const hy = hash(Math.floor(time * 15) + i * 13);
      if (hy < 0.6) {
        ctx.fillStyle = i % 2 ? 'rgba(0,229,255,0.35)' : rgba(col, 0.45);
        ctx.fillRect(-r * 1.2 + (hash(hy * 7) - 0.5) * 20, (hy - 0.3) * r * 2.4, r * 2.4, 2 + hash(hy * 3) * 4);
      }
    }
    norm(ctx);
  }

  // status overlays
  if (e.flash > 0) {
    add(ctx); sprite(ctx, glow('#ffffff'), 0, 0, r * 1.2, (e.flash / 0.07) * 0.65); norm(ctx);
  }
  if (e.freezeT > 0) {
    chip(ctx, r + 4, 4);
    ctx.fillStyle = 'rgba(160,235,255,0.32)'; ctx.fill();
    ctx.strokeStyle = 'rgba(220,250,255,0.95)'; ctx.lineWidth = 1.2; ctx.stroke();
  } else if (e.slowAmt > 0) {
    ctx.strokeStyle = 'rgba(127,233,255,0.6)'; ctx.lineWidth = 1;
    brackets(ctx, r + 4, 4); ctx.stroke();
  }
  if (e.vulnT > 0) {
    ctx.save(); ctx.rotate(time * 2);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = 'rgba(195,160,255,0.85)'; ctx.lineWidth = 1.2;
    square(ctx, r + 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
  if (e.stunT > 0) {
    ctx.fillStyle = '#fff27a';
    for (let i = 0; i < 3; i++) {
      const a = time * 8 + (i * TAU) / 3;
      ctx.fillRect(Math.cos(a) * (r + 2) - 1.5, -r - 4 + Math.sin(a) * 3 - 1.5, 3, 3);
    }
  }
  ctx.restore();
}

// ── Renderer ────────────────────────────────────────────────
export class Renderer {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.map = map;
    this.k = 1;
    this.lastRt = 0;
    this.runners = Array.from({ length: 6 }, () => this.newRunner(true));
  }

  setMap(map) {
    this.map = map;
    if (this.dpr) this.buildStatic();
  }

  resize(cssW, cssH, dpr) {
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    this.k = this.canvas.width / WORLD_W;
    this.dpr = dpr;
    this.buildStatic();
  }

  layer(worldScale = true) {
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    if (worldScale) g.scale(this.k, this.k);
    return [c, g];
  }

  buildStatic() {
    const W = WORLD_W, H = WORLD_H;
    const rnd = mulberry32(11);

    // ── background: smog haze + grid + faint circuit traces
    const [bg, g] = this.layer();
    g.fillStyle = PAL.bg; g.fillRect(0, 0, W, H);
    add(g);
    for (const [x, y, r, col, a] of [
      [180, 640, 520, '#00e5ff', 0.07], [1120, 80, 560, '#ff2a6d', 0.06],
      [700, 380, 700, '#3a2aff', 0.05], [1200, 690, 380, '#ffb800', 0.035], [60, 60, 360, '#b967ff', 0.05],
    ]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    norm(g);
    g.lineWidth = 1;
    for (let i = 0; i <= COLS; i++) {
      g.strokeStyle = rgba(PAL.grid, i % 4 === 0 ? 0.1 : 0.045);
      g.beginPath(); g.moveTo(i * TILE + 0.5, 0); g.lineTo(i * TILE + 0.5, H); g.stroke();
    }
    for (let j = 0; j <= ROWS; j++) {
      g.strokeStyle = rgba(PAL.grid, j % 4 === 0 ? 0.1 : 0.045);
      g.beginPath(); g.moveTo(0, j * TILE + 0.5); g.lineTo(W, j * TILE + 0.5); g.stroke();
    }
    // tiny "+" marks on major intersections
    g.strokeStyle = rgba(PAL.grid, 0.3);
    for (let i = 0; i <= COLS; i += 4) for (let j = 0; j <= ROWS; j += 4) {
      g.beginPath(); g.moveTo(i * TILE - 3, j * TILE + 0.5); g.lineTo(i * TILE + 4, j * TILE + 0.5);
      g.moveTo(i * TILE + 0.5, j * TILE - 3); g.lineTo(i * TILE + 0.5, j * TILE + 4); g.stroke();
    }
    // circuit traces in open space
    for (let n = 0; n < 22; n++) {
      let c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * ROWS);
      if (!this.map.isBuildable(c, r)) continue;
      let x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
      g.strokeStyle = rgba(PAL.grid, 0.09); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y);
      g.fillStyle = rgba(PAL.grid, 0.16); g.fillRect(x - 2, y - 2, 4, 4);
      let horiz = rnd() < 0.5;
      for (let s = 0; s < 2 + Math.floor(rnd() * 3); s++) {
        const len = (1 + Math.floor(rnd() * 3)) * TILE * (rnd() < 0.5 ? -1 : 1);
        const nx = horiz ? x + len : x, ny = horiz ? y : y + len;
        const nc = Math.floor(nx / TILE), nr = Math.floor(ny / TILE);
        if (!this.map.isBuildable(nc, nr)) break;
        x = nx; y = ny; g.lineTo(x, y); horiz = !horiz;
      }
      g.stroke();
      g.strokeStyle = rgba(PAL.grid, 0.18); g.strokeRect(x - 3, y - 3, 6, 6);
    }
    this.bg = bg;

    // ── data bus (paths). Each layer is drawn for every path before the next layer,
    // so where routes merge the dark fill covers the inner edges → clean junctions.
    const [bus, b] = this.layer();
    const paths = this.map.paths;
    const stroke = (w, style) => {
      b.lineWidth = w; b.strokeStyle = style; b.lineJoin = 'miter'; b.lineCap = 'square';
      for (const path of paths) {
        b.beginPath(); path.points.forEach((p, i) => (i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y))); b.stroke();
      }
    };
    add(b);
    stroke(56, rgba(PAL.grid, 0.025 / paths.length));
    stroke(44, rgba(PAL.grid, 0.05 / paths.length));
    norm(b);
    stroke(35, rgba(PAL.grid, 0.85));
    stroke(32, '#03070d');
    stroke(32, rgba(PAL.grid, 0.03 / paths.length));
    // lane ticks along both edges (skipping positions inside another path's bus)
    b.strokeStyle = rgba(PAL.grid, 0.28); b.lineWidth = 1;
    const onOtherBus = (x, y, self) => paths.some((p) => p !== self && p.segs.some((s) => {
      const px = x - s.x0, py = y - s.y0, along = px * s.ux + py * s.uy;
      return along >= -17 && along <= s.len + 17 && Math.abs(px * -s.uy + py * s.ux) <= 17;
    }));
    for (const path of paths) for (const s of path.segs) {
      for (let d = 20; d < s.len; d += 20) {
        const x = s.x0 + s.ux * d, y = s.y0 + s.uy * d, px = -s.uy, py = s.ux;
        const big = Math.round(d / 20) % 2 === 0;
        for (const side of [-1, 1]) {
          const o1 = side * 15, o2 = side * (big ? 11 : 13);
          if (paths.length > 1 && onOtherBus(x + px * o1, y + py * o1, path)) continue;
          b.beginPath(); b.moveTo(x + px * o1, y + py * o1); b.lineTo(x + px * o2, y + py * o2); b.stroke();
        }
      }
    }
    // vias at the bends
    for (const path of paths) {
      const pts = path.points;
      for (let i = 1; i < pts.length - 1; i++) {
        b.fillStyle = rgba(PAL.grid, 0.9); b.fillRect(pts[i].x - 2, pts[i].y - 2, 4, 4);
        b.strokeStyle = rgba(PAL.grid, 0.35); b.strokeRect(pts[i].x - 6.5, pts[i].y - 6.5, 13, 13);
      }
    }
    this.bus = bus;

    // ── post: vignette + scanlines (screen space)
    const [post, p] = this.layer(false);
    const cw = post.width, ch = post.height;
    const vg = p.createRadialGradient(cw / 2, ch / 2, ch * 0.4, cw / 2, ch / 2, cw * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    p.fillStyle = vg; p.fillRect(0, 0, cw, ch);
    p.fillStyle = 'rgba(0,0,0,0.16)';
    const step = Math.max(3, Math.round(3 * (this.dpr || 1)));
    for (let y = 0; y < ch; y += step) p.fillRect(0, y, cw, Math.max(1, Math.round(this.dpr || 1)));
    this.post = post;
  }

  // ── light-cycle runners on the background grid ──
  newRunner(initial = false) {
    const cols = ['#00e5ff', '#00e5ff', '#00e5ff', '#ff2a6d', '#ffb800'];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const [dx, dy] = dirs[Math.floor(Math.random() * 4)];
    let x, y;
    if (initial) { x = Math.floor(Math.random() * COLS) * TILE; y = Math.floor(Math.random() * ROWS) * TILE; }
    else if (dx) { x = dx > 0 ? 0 : COLS * TILE; y = Math.floor(Math.random() * ROWS) * TILE; }
    else { y = dy > 0 ? 0 : ROWS * TILE; x = Math.floor(Math.random() * COLS) * TILE; }
    return { x, y, dx, dy, toNext: TILE, speed: 140 + Math.random() * 160, pts: [{ x, y }], col: cols[Math.floor(Math.random() * cols.length)], len: 160 + Math.random() * 160 };
  }

  stepRunners(dt) {
    for (let i = 0; i < this.runners.length; i++) {
      const r = this.runners[i];
      let move = r.speed * dt;
      while (move > 0) {
        const s = Math.min(move, r.toNext);
        r.x += r.dx * s; r.y += r.dy * s; r.toNext -= s; move -= s;
        if (r.toNext <= 1e-6) {
          r.toNext = TILE;
          if (Math.random() < 0.2) {
            r.pts.push({ x: r.x, y: r.y });
            [r.dx, r.dy] = Math.random() < 0.5 ? [-r.dy, r.dx] : [r.dy, -r.dx];
          }
        }
      }
      // trim old turn points
      let acc = 0, px = r.x, py = r.y;
      for (let j = r.pts.length - 1; j >= 0; j--) {
        acc += Math.abs(px - r.pts[j].x) + Math.abs(py - r.pts[j].y);
        if (acc > r.len && j > 0) { r.pts.splice(0, j); break; }
        px = r.pts[j].x; py = r.pts[j].y;
      }
      const m = r.len + 40;
      if (r.x < -m || r.y < -m || r.x > WORLD_W + m || r.y > WORLD_H + m) this.runners[i] = this.newRunner();
    }
  }

  drawRunners(ctx) {
    add(ctx);
    ctx.lineWidth = 1.6;
    for (const r of this.runners) {
      let ax = r.x, ay = r.y, acc = 0;
      for (let j = r.pts.length - 1; j >= 0 && acc < r.len; j--) {
        let bx = r.pts[j].x, by = r.pts[j].y;
        let seg = Math.abs(ax - bx) + Math.abs(ay - by);
        if (acc + seg > r.len) { const f = (r.len - acc) / seg; bx = ax + (bx - ax) * f; by = ay + (by - ay) * f; seg = r.len - acc; }
        const a0 = 1 - acc / r.len, a1 = 1 - (acc + seg) / r.len;
        if (seg > 0.5) {
          const gr = ctx.createLinearGradient(ax, ay, bx, by);
          gr.addColorStop(0, rgba(r.col, 0.55 * a0)); gr.addColorStop(1, rgba(r.col, 0.55 * a1));
          ctx.strokeStyle = gr;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
        acc += seg; ax = bx; ay = by;
      }
      sprite(ctx, glow(r.col), r.x, r.y, 5, 0.8);
    }
    norm(ctx);
  }

  render(game, view, rt) {
    const ctx = this.ctx, fx = game.fx, k = this.k;
    const time = game.time;
    const rdt = Math.min(0.1, Math.max(0, rt - this.lastRt));
    this.lastRt = rt;
    this.stepRunners(rdt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    norm(ctx);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    let sx = 0, sy = 0;
    const shake = fx.shakeMag * (motion.reduced ? 0.15 : 1);
    if (shake > 0) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);
    ctx.drawImage(this.bg, 0, 0, WORLD_W, WORLD_H);
    this.drawRunners(ctx);
    ctx.drawImage(this.bus, 0, 0, WORLD_W, WORLD_H);
    this.drawBusFlow(ctx, time);

    const multi = this.map.paths.length > 1;
    this.map.paths.forEach((p, i) => this.drawBreach(ctx, p.start, rt, game, multi ? 'BREACH ' + 'AB'[i] : 'BREACH'));
    this.drawCore(ctx, this.map.core, rt, game);

    if (view.placing) {
      ctx.strokeStyle = rgba(PAL.grid, 0.16); ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!this.map.isBuildable(c, r) || game.towerAt(c, r)) continue;
        const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
        ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
      }
      ctx.stroke();
    }

    // corrupted sectors (burn zones)
    add(ctx);
    for (const z of game.zones) {
      const a = Math.min(1, z.t / 0.6) * Math.min(1, (z.max - z.t) / 0.15);
      sprite(ctx, aura(z.color), z.x, z.y, z.r * 1.25, 0.6 * a);
      ctx.fillStyle = rgba(z.color, 0.22 * a);
      for (let i = 0; i < 7; i++) {
        const h = hash(Math.floor(time * 10) + i * 3.1 + z.x);
        const hx = (hash(h * 17) - 0.5) * z.r * 1.6, hy = (h - 0.5) * z.r * 1.6;
        ctx.fillRect(z.x + hx - 4, z.y + hy - 4, 8, 8);
      }
      ctx.strokeStyle = rgba(z.color, 0.4 * a); ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    norm(ctx);

    // selection / range
    const sel = view.selected;
    if (sel) {
      this.drawRange(ctx, sel.x, sel.y, sel.stats.range, sel.stats.color, !!view.previewStats);
      if (view.previewStats) this.drawRange(ctx, sel.x, sel.y, view.previewStats.range, view.previewStats.color, false, true);
      const pulse = 23 + Math.sin(rt * 5) * 2;
      ctx.save(); ctx.translate(sel.x, sel.y);
      ctx.strokeStyle = sel.stats.color; ctx.lineWidth = 1.6;
      brackets(ctx, pulse, 7); ctx.stroke();
      ctx.restore();
    }
    const hov = view.hover;
    if (!view.placing && hov) {
      const ht = game.towerAt(hov.c, hov.r);
      if (ht && ht !== sel) this.drawRange(ctx, ht.x, ht.y, ht.stats.range, ht.stats.color, true);
    }

    for (const t of game.towers) drawTower(ctx, t, time);
    for (const fw of game.firewalls) this.drawFirewall(ctx, fw, fw.t / fw.max, rt, 1);
    for (const e of game.enemies) drawEnemy(ctx, e, time, this.map);
    this.drawProjectiles(ctx, game, time);
    this.drawFX(ctx, fx);
    this.drawHpBars(ctx, game);

    // placement ghost
    if (view.placing && hov) {
      const ok = game.canPlace(view.placing, hov.c, hov.r);
      const def = TOWERS[view.placing];
      const x = hov.c * TILE + TILE / 2, y = hov.r * TILE + TILE / 2;
      const c = ok ? PAL.ok : PAL.hostile;
      ctx.fillStyle = rgba(c, 0.1); ctx.fillRect(hov.c * TILE + 1, hov.r * TILE + 1, TILE - 2, TILE - 2);
      ctx.save(); ctx.translate(x, y); ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = 1.5; brackets(ctx, 19, 6); ctx.stroke(); ctx.restore();
      if (this.map.isBuildable(hov.c, hov.r) && !game.towerAt(hov.c, hov.r)) {
        this.drawRange(ctx, x, y, view.placingStats.range, ok ? def.color : PAL.hostile, false);
        ctx.globalAlpha = ok ? 0.55 : 0.3;
        drawTower(ctx, { type: view.placing, stats: view.placingStats, x, y, angle: -Math.PI / 2, recoil: 0, spin: 0, level: 1, spawnT: 1, id: 0, cooldown: 0, barrel: 0, upgradeFlash: 0 }, time);
        ctx.globalAlpha = 1;
        if (ok && view.touchPending === hov.c + ',' + hov.r) {
          ctx.font = `700 10px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillStyle = PAL.ok;
          ctx.fillText('TAP AGAIN TO DEPLOY', x, y - 26);
        }
      }
    }

    // firewall placement ghost
    if (view.ability === 'firewall' && hov) {
      const spot = game.snapToBus(hov.x, hov.y);
      if (spot) this.drawFirewall(ctx, spot, 1, rt, 0.45);
      else {
        ctx.save(); ctx.translate(hov.x, hov.y);
        ctx.strokeStyle = rgba(PAL.hostile, 0.85); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke();
        ctx.font = `600 9px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = rgba(PAL.hostile, 0.9); ctx.fillText('PLACE ON THE BUS', 0, -12);
        ctx.restore();
      }
    }

    // floating texts
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of fx.texts) {
      ctx.font = `700 ${t.size}px ${MONO}`;
      ctx.globalAlpha = Math.min(1, t.life / 0.4);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,4,10,0.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    // ── screen-space post ──
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.shakeMag > 4.5 && !motion.reduced) this.glitch(ctx, fx.shakeMag);
    ctx.drawImage(this.post, 0, 0);
    if (fx.flashA > 0) {
      ctx.fillStyle = `rgba(${fx.flashRGB},${fx.flashA * (motion.reduced ? 0.15 : 0.45)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.drawBossBar(ctx, game, rt);
  }

  // Firewall barrier across the bus. life: 1 → 0 as it expires; alpha < 1 for the ghost.
  drawFirewall(ctx, fw, life, rt, alpha) {
    const col = '#00e5ff';
    const flicker = life < 0.25 && Math.sin(rt * 40) > 0 ? 0.45 : 1;
    ctx.save();
    ctx.translate(fw.x, fw.y);
    ctx.rotate(fw.angle);
    ctx.globalAlpha = alpha * flicker;
    add(ctx);
    ctx.fillStyle = rgba(col, 0.14);
    ctx.fillRect(-5, -19, 10, 38);
    // stacked "bricks" that scroll across the wall
    const off = (rt * 30) % 8;
    for (let y = -19 + off - 8; y < 19; y += 8) {
      const y0 = Math.max(-19, y), y1 = Math.min(19, y + 5);
      if (y1 > y0) { ctx.fillStyle = rgba(col, 0.75); ctx.fillRect(-2.5, y0, 5, y1 - y0); }
    }
    ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6, -20); ctx.lineTo(-6, 20); ctx.moveTo(6, -20); ctx.lineTo(6, 20); ctx.stroke();
    sprite(ctx, glow(col), 0, -20, 7, 0.9);
    sprite(ctx, glow(col), 0, 20, 7, 0.9);
    // remaining-time bar
    ctx.fillStyle = rgba(col, 0.9);
    ctx.fillRect(-9, -24, 18 * life, 2);
    norm(ctx);
    ctx.restore();
  }

  // horizontal slice displacement — fires on heavy impacts
  glitch(ctx, mag) {
    const c = this.canvas, n = 2 + Math.floor(mag / 5);
    for (let i = 0; i < n; i++) {
      const h = Math.max(2, Math.floor(Math.random() * 18 * this.k));
      const y = Math.floor(Math.random() * (c.height - h));
      const dx = Math.round((Math.random() - 0.5) * mag * 3 * this.k);
      ctx.drawImage(c, 0, y, c.width, h, dx, y, c.width, h);
    }
  }

  drawBusFlow(ctx, time) {
    const paths = this.map.paths;
    add(ctx);
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.strokeStyle = rgba(PAL.grid, 0.22 / Math.sqrt(paths.length)); ctx.lineWidth = 1;
    ctx.setLineDash([6, 14]); ctx.lineDashOffset = -time * 60;
    for (const path of paths) {
      ctx.beginPath(); path.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    ctx.setLineDash([]);
    const per = Math.ceil(9 / paths.length);
    paths.forEach((path, pi) => {
      const L = path.length;
      for (let i = 0; i < per; i++) {
        const d = (time * 150 + ((i + pi * 0.5) * L) / per) % L;
        const p = path.posAt(d);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.fillStyle = rgba(PAL.grid, 0.9); ctx.fillRect(-5, -1, 10, 2);
        ctx.restore();
        sprite(ctx, glow(PAL.grid), p.x, p.y, 8, 0.4);
      }
    });
    norm(ctx);
  }

  drawBreach(ctx, P, rt, game, label = 'BREACH') {
    const on = game.state === 'wave' ? 1 : 0.55;
    const col = PAL.hostile;
    ctx.save();
    ctx.translate(P.x, P.y);
    add(ctx);
    sprite(ctx, aura(col), 0, 0, 70, 0.6 * on);
    // the tear
    const h = 50 + Math.sin(rt * 3) * 3;
    ctx.fillStyle = rgba(col, 0.9);
    ctx.fillRect(-2, -h / 2, 4, h);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(-0.5, -h / 2 + 4, 1, h - 8);
    // glitch slices, re-rolled ~14×/s
    const tick = Math.floor(rt * 14);
    for (let i = 0; i < 8; i++) {
      const r1 = hash(tick * 1.3 + i * 7.7), r2 = hash(tick * 2.1 + i * 3.3), r3 = hash(tick * 0.7 + i * 5.1);
      if (r3 > 0.75 * on + 0.1) continue;
      ctx.fillStyle = r2 < 0.3 ? 'rgba(0,229,255,0.6)' : rgba(col, 0.75);
      ctx.fillRect(-4 + (r2 - 0.5) * 18, (r1 - 0.5) * h * 1.1, 4 + r3 * 26, 1.5 + r2 * 4);
    }
    norm(ctx);
    ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-12, -34); ctx.lineTo(-18, -34); ctx.lineTo(-18, 34); ctx.lineTo(-12, 34);
    ctx.moveTo(12, -34); ctx.lineTo(18, -34); ctx.lineTo(18, 34); ctx.lineTo(12, 34);
    ctx.stroke();
    ctx.font = `600 8px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(col, 0.85);
    ctx.fillText(label, 24, -30);
    ctx.restore();
  }

  drawCore(ctx, C, rt, game) {
    const health = game.lives / game.maxLives;
    const col = lerpColor(PAL.hostile, PAL.grid, health);
    const fl = game.coreFlash;
    ctx.save();
    ctx.translate(C.x, C.y);
    add(ctx);
    sprite(ctx, aura(col), 0, 0, 70 + Math.sin(rt * 2) * 5, 0.6 + fl * 0.4);
    norm(ctx);

    // targeting frame
    ctx.strokeStyle = rgba(col, 0.75); ctx.lineWidth = 1.3;
    brackets(ctx, 32, 9); ctx.stroke();
    ctx.save(); ctx.rotate(Math.PI / 4 + rt * 0.25);
    ctx.strokeStyle = rgba(col, 0.25 + fl * 0.6); ctx.lineWidth = 1;
    square(ctx, 22); ctx.stroke();
    ctx.restore();

    // rotating wireframe cube
    const s = 11, ay = rt * 0.9, ax = rt * 0.6 + 0.5;
    const v = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      let X = x * s, Y = y * s, Z = z * s;
      const X1 = X * Math.cos(ay) + Z * Math.sin(ay), Z1 = -X * Math.sin(ay) + Z * Math.cos(ay);
      const Y2 = Y * Math.cos(ax) - Z1 * Math.sin(ax), Z2 = Y * Math.sin(ax) + Z1 * Math.cos(ax);
      const f = 1 + Z2 / 120;
      v.push([X1 * f, Y2 * f]);
    }
    add(ctx);
    sprite(ctx, glow(col), 0, 0, 16 + Math.sin(rt * 3) * 2, 0.55);
    ctx.strokeStyle = col; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
      const d = i ^ j;
      if (d === 1 || d === 2 || d === 4) { ctx.moveTo(v[i][0], v[i][1]); ctx.lineTo(v[j][0], v[j][1]); }
    }
    ctx.stroke();
    for (const [x, y] of v) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, 2, 2); }
    if (fl > 0) sprite(ctx, glow(PAL.hostile), 0, 0, 50 * fl + 10, fl);
    norm(ctx);

    ctx.font = `600 8px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(col, 0.9);
    ctx.fillText(`CORE ${Math.round(health * 100)}%`, 0, 44);
    ctx.restore();
  }

  drawRange(ctx, x, y, r, color, faint, preview = false) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = rgba(color, faint ? 0.025 : 0.06); ctx.fill();
    ctx.strokeStyle = rgba(color, faint ? 0.25 : 0.65); ctx.lineWidth = preview ? 1.8 : 1.1;
    ctx.setLineDash(preview ? [8, 6] : [2, 4]);
    ctx.stroke(); ctx.setLineDash([]);
  }

  drawProjectiles(ctx, game, time) {
    add(ctx);
    ctx.lineCap = 'butt';
    for (const p of game.projectiles) {
      if (p.kind === 'bolt') {
        const nx = p.vx / p.speed, ny = p.vy / p.speed, len = 12 * p.size;
        ctx.strokeStyle = rgba(p.color, 0.9); ctx.lineWidth = 2.6 * p.size;
        ctx.beginPath(); ctx.moveTo(p.x - nx * len, p.y - ny * len); ctx.lineTo(p.x, p.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1 * p.size;
        ctx.beginPath(); ctx.moveTo(p.x - nx * len * 0.6, p.y - ny * len * 0.6); ctx.lineTo(p.x, p.y); ctx.stroke();
        sprite(ctx, glow(p.color), p.x, p.y, 6 * p.size, 0.8);
      } else if (p.kind === 'missile') {
        if (p.delay > 0) continue;
        const sc = p.small ? 0.75 : 1;
        sprite(ctx, glow(p.color), p.x - Math.cos(p.angle) * 7 * sc, p.y - Math.sin(p.angle) * 7 * sc, (6 + Math.random() * 3) * sc, 1);
        norm(ctx);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.scale(sc, sc);
        ctx.fillStyle = '#0a0f1b'; ctx.strokeStyle = p.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(3, -2.5); ctx.lineTo(-6, -2.5); ctx.lineTo(-6, 2.5); ctx.lineTo(3, 2.5); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
        add(ctx);
      } else if (p.kind === 'bomblet') {
        ctx.fillStyle = p.color;
        const s = 3 + Math.sin(time * 40) * 1;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        sprite(ctx, glow(p.color), p.x, p.y, 5, 0.6);
      }
    }
    norm(ctx);
  }

  drawFX(ctx, fx) {
    // normal-blend pass: smoke + debris
    for (const p of fx.parts) {
      if (p.kind === 'smoke') {
        const a = p.life / p.max, s = p.size * (1 + (1 - a) * 1.8);
        ctx.globalAlpha = a * 0.28;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
      } else if (p.kind === 'debris') {
        ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.strokeStyle = p.color; ctx.lineWidth = 1;
        ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    add(ctx);
    for (const p of fx.parts) {
      const a = p.life / p.max;
      if (p.kind === 'glow') {
        if (p.size <= 6) {
          // digital pixels
          const s = p.size * (0.5 + 0.5 * a) * 1.3;
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
        } else {
          ctx.globalAlpha = 1;
          sprite(ctx, glow(p.color), p.x, p.y, p.size * (0.4 + 0.6 * a) * 1.6, a);
        }
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const r of fx.rings) {
      const a = r.life / r.max, f = easeOut(1 - a);
      ctx.strokeStyle = rgba(r.color, a * 0.9);
      ctx.lineWidth = r.width * a + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0.1, r.r0 + (r.r1 - r.r0) * f), 0, TAU); ctx.stroke();
    }
    for (const b of fx.beams) {
      const a = b.life / b.max;
      ctx.strokeStyle = rgba(b.color, a);
      ctx.lineWidth = b.width * a;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    ctx.lineJoin = 'miter';
    for (const l of fx.arcs) {
      const a = l.life / l.max;
      circuitPath(ctx, l.points);
      ctx.strokeStyle = rgba(l.color, 0.4 * a); ctx.lineWidth = l.width * 3; ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.95 * a); ctx.lineWidth = l.width * 0.7; ctx.stroke();
      for (const p of l.points) { ctx.fillStyle = rgba(l.color, a); ctx.fillRect(p.x - 3, p.y - 3, 6, 6); }
    }
    norm(ctx);
  }

  drawHpBars(ctx, game) {
    for (const e of game.enemies) {
      if (e.def.boss || e.hp >= e.maxHp || e.dead || !game.visible(e)) continue;
      const w = e.radius * 2 + 4, x = Math.round(e.x - w / 2), y = Math.round(e.y - e.radius - 9);
      const f = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = 'rgba(2,4,10,0.8)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = f > 0.5 ? PAL.ok : f > 0.25 ? PAL.amber : PAL.hostile;
      ctx.fillRect(x, y, w * f, 3);
      ctx.fillStyle = 'rgba(2,4,10,0.9)';
      for (let sx = x + 4; sx < x + w; sx += 4) ctx.fillRect(sx, y, 1, 3);
    }
  }

  drawBossBar(ctx, game, rt) {
    const b = game.boss;
    if (!b || b.dead) return;
    const w = 440, x = (WORLD_W - w) / 2, y = 26;
    const f = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = 'rgba(3,4,10,0.85)';
    ctx.fillRect(x - 3, y - 3, w + 6, 16);
    ctx.strokeStyle = rgba(b.def.color, 0.5 + 0.3 * Math.sin(rt * 4)); ctx.lineWidth = 1;
    ctx.save(); ctx.translate(WORLD_W / 2, y + 5);
    ctx.beginPath(); ctx.rect(-w / 2 - 3, -8, w + 6, 16); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = b.def.color;
    ctx.fillRect(x, y, w * f, 10);
    ctx.fillStyle = 'rgba(3,4,10,0.9)';
    for (let sx = x + 8; sx < x + w; sx += 8) ctx.fillRect(sx, y, 2, 10);
    ctx.font = `700 10px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffd0d8';
    ctx.fillText('▲ ' + b.def.name.toUpperCase(), x, y - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(f * 100)}%`, x + w, y - 6);
  }
}
