// Canvas renderer — cyber-grid theme (Tron / Blade Runner minimalism).
// Everything is procedural: neon line-art on near-black, no image assets.
import { WORLD_W, WORLD_H, TILE, COLS, ROWS, TOWERS } from './config.js';
import { Post } from './post.js';

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

function makeSprite(stops, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const h = size / 2;
  const gr = g.createRadialGradient(h, h, 0, h, h, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
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
// soft light falloff used by the lighting pass (bigger texture: it gets scaled up a lot)
const lightCache = new Map();
export function light(color) {
  let c = lightCache.get(color);
  if (!c) {
    c = makeSprite([[0, rgba(color, 1)], [0.18, rgba(color, 0.6)], [0.5, rgba(color, 0.17)], [1, rgba(color, 0)]], 128);
    lightCache.set(color, c);
  }
  return c;
}
// soft volumetric puff for smoke (normal blend)
const puffCache = new Map();
function puff(color) {
  let c = puffCache.get(color);
  if (!c) {
    c = makeSprite([[0, rgba(color, 0.55)], [0.45, rgba(color, 0.28)], [1, rgba(color, 0)]]);
    puffCache.set(color, c);
  }
  return c;
}
// contact shadow under towers and enemies
let shadowSpr = null;
const shadow = () => shadowSpr || (shadowSpr = makeSprite([[0, 'rgba(0,0,0,0.8)'], [0.45, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]));
// brushed-metal plate fill, in tower-local coordinates (reused for every tower)
let plateGrad = null;
function plateFill(ctx) {
  if (!plateGrad) {
    plateGrad = ctx.createLinearGradient(-15, -15, 15, 15);
    plateGrad.addColorStop(0, '#1b2738');
    plateGrad.addColorStop(0.42, '#0c1320');
    plateGrad.addColorStop(1, '#03060b');
  }
  return plateGrad;
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
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
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
// opts.angle: displayed turret angle (spring-smoothed by the renderer); opts.reflect: floor-reflection pass
export function drawTower(ctx, t, time, opts = {}) {
  const s = t.stats, def = TOWERS[t.type];
  const ang = opts.angle ?? t.angle;
  const base = def.color, col = s.color;
  const sc = !opts.noPop && t.spawnT < 1 ? Math.max(0.01, easeOutBack(t.spawnT)) : 1;
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

  // contact shadow + chip platform with pins
  if (!opts.reflect) sprite(ctx, shadow(), 3, 7, 28, 0.9);
  // slab depth: the block's front face peeks out under the top plate
  ctx.save(); ctx.translate(0, 4);
  chip(ctx, 15, 5);
  ctx.fillStyle = '#03060a'; ctx.fill();
  ctx.strokeStyle = rgba(base, 0.35); ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = rgba(base, 0.22);
  ctx.beginPath(); ctx.moveTo(-15, 10); ctx.lineTo(-15, 14); ctx.moveTo(15, 10); ctx.lineTo(15, 14);
  ctx.moveTo(-10, 15); ctx.lineTo(-10, 19); ctx.moveTo(10, 15); ctx.lineTo(10, 19); ctx.stroke();
  ctx.strokeStyle = rgba(base, 0.45); ctx.lineWidth = 1;
  ctx.beginPath();
  for (const o of [-7, 0, 7]) {
    ctx.moveTo(o, -15); ctx.lineTo(o, -18); ctx.moveTo(o, 15); ctx.lineTo(o, 18);
    ctx.moveTo(-15, o); ctx.lineTo(-18, o); ctx.moveTo(15, o); ctx.lineTo(18, o);
  }
  ctx.stroke();
  ctx.fillStyle = rgba(base, 0.9);
  for (const o of [-7, 0, 7]) { ctx.fillRect(o - 0.75, -18.6, 1.5, 1.2); ctx.fillRect(o - 0.75, 17.4, 1.5, 1.2); ctx.fillRect(-18.6, o - 0.75, 1.2, 1.5); ctx.fillRect(17.4, o - 0.75, 1.2, 1.5); }
  chip(ctx, 15, 5);
  ctx.fillStyle = plateFill(ctx); ctx.fill();
  ctx.lineWidth = 1.3; ctx.strokeStyle = rgba(base, 0.9); ctx.stroke();
  // bevel: lit top-left edge, shaded bottom-right
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath(); ctx.moveTo(-13.7, 7); ctx.lineTo(-13.7, -9.6); ctx.lineTo(-9.6, -13.7); ctx.lineTo(7, -13.7); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.moveTo(13.7, -7); ctx.lineTo(13.7, 9.6); ctx.lineTo(9.6, 13.7); ctx.lineTo(-7, 13.7); ctx.stroke();
  // periodic light sheen sweeping across the plate
  const ph = (time * 0.2 + (t.id || 0) * 0.137) % 1;
  if (ph < 0.16) {
    ctx.save();
    chip(ctx, 14.3, 4.6); ctx.clip();
    ctx.rotate(-0.65);
    const x = -26 + (ph / 0.16) * 52;
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x - 7, -30, 14, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.11)'; ctx.fillRect(x - 1.2, -30, 2.4, 60);
    ctx.restore();
  }
  chip(ctx, 11, 3.5);
  ctx.strokeStyle = rgba(base, 0.18); ctx.lineWidth = 1; ctx.stroke();

  switch (t.type) {
    case 'blaster': drawBlaster(ctx, t, s, col, time, ang); break;
    case 'arc': drawArc(ctx, t, s, col, time); break;
    case 'cryo': drawCryo(ctx, t, s, col, time); break;
    case 'launcher': drawLauncher(ctx, t, s, col, ang); break;
  }

  // level pips (little LEDs)
  ctx.fillStyle = col;
  for (let i = 0; i < t.level; i++) ctx.fillRect((i - (t.level - 1) / 2) * 5 - 1.5, 11, 3, 2);
  if (t.upgradeFlash > 0 && !opts.reflect) {
    add(ctx);
    sprite(ctx, glow(col), 0, 0, 34 * t.upgradeFlash + 8, t.upgradeFlash * 0.5);
    norm(ctx);
  }
  ctx.restore();
}

function barrel(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.rect(x, y - h / 2, w, h); ctx.fill(); ctx.stroke();
}

function drawBlaster(ctx, t, s, col, time, ang) {
  ctx.save();
  ctx.rotate(ang);
  const rk = -t.recoil * 4;
  ctx.fillStyle = '#0b1220'; ctx.strokeStyle = col; ctx.lineWidth = 1;
  if (s.kind === 'rail') {
    barrel(ctx, rk, -4, 27, 3);
    barrel(ctx, rk, 4, 27, 3);
    add(ctx);
    const ch = clamp01(1 - Math.max(0, t.cooldown) * s.rate);
    ctx.strokeStyle = rgba(col, (0.2 + 0.8 * ch) * (0.7 + 0.3 * Math.sin(time * 9 + t.id))); ctx.lineWidth = 1.4;
    if (ch > 0.9) sprite(ctx, glow(col), 27 + rk, 0, 3 + (ch - 0.9) * 40, 0.8);
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
  const ch = clamp01(1 - Math.max(0, t.cooldown) * s.rate);
  sprite(ctx, glow(col), 0, orbY, 5 + ch * 4 + Math.sin(time * 6 + t.id) * 1.5 + (ready ? 2 : 0), 1);
  if (ch > 0.55 && !ready) {
    const k = (ch - 0.55) / 0.45, d = 3 + 13 * (1 - k);
    ctx.fillStyle = rgba(col, 0.4 + 0.6 * k);
    for (let i = 0; i < 4; i++) {
      const a = time * 7 + (i * TAU) / 4 + t.id;
      ctx.fillRect(Math.cos(a) * d - 1, orbY + Math.sin(a) * d * 0.6 - 1, 2, 2);
    }
  }
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

function drawLauncher(ctx, t, s, col, ang) {
  ctx.save();
  ctx.rotate(ang);
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
  const open = smooth(clamp01((1 - Math.max(0, t.cooldown) * s.rate - 0.6) / 0.4));
  for (const [x, y, r] of holes) {
    ctx.fillStyle = '#02030a'; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 0.8; ctx.strokeRect(x - r, y - r, r * 2, r * 2);
    if (ready) { add(ctx); sprite(ctx, glow(col), x, y, r * 2.2, 0.9 * open); norm(ctx); }
    // hatch halves
    const w = r * (1 - open);
    if (w > 0.15) {
      ctx.fillStyle = '#16202e'; ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 0.6;
      ctx.fillRect(x - r, y - r, w, r * 2); ctx.strokeRect(x - r, y - r, w, r * 2);
      ctx.fillRect(x + r - w, y - r, w, r * 2); ctx.strokeRect(x + r - w, y - r, w, r * 2);
    }
  }
  ctx.restore();
}

// ── Enemies (hostile code) ──────────────────────────────────
// opts.ghost: bare silhouette (no shadow, no status overlays) for reflections and derez slices
function drawEnemy(ctx, e, time, map, opts = {}) {
  const col = e.def.color, r = e.radius;
  const sp = Math.min(1, e.age / 0.35);
  // occasional glitch displacement
  const g = hash(Math.floor(time * 12) + e.seed * 7);
  const jx = !motion.reduced && g < 0.08 ? (hash(g * 99) - 0.5) * 8 : 0;
  // spawn-in: the sprite is "printed" top to bottom behind a bright scanline
  const reveal = sp < 1 && !motion.reduced, RR = r * 2.4, rp = easeOut(sp);
  ctx.save();
  ctx.translate(e.x + jx + (opts.kx || 0), e.y + (opts.ky || 0));
  if (opts.sq) ctx.scale(1 + opts.sq * 0.16, 1 - opts.sq * 0.12);
  if (reveal) { ctx.beginPath(); ctx.rect(-RR, -RR, RR * 2, RR * 2 * rp); ctx.clip(); }
  else if (sp < 1) ctx.scale(sp, sp * 0.3 + 0.7 * sp);

  const cloaked = e.def.stealth && e.revealT <= 0;
  if (!cloaked) {
    if (!opts.ghost) sprite(ctx, shadow(), 2, 4, r * 1.6, 0.75);
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
  if (!opts.ghost) {
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
  }
  ctx.restore();
  if (reveal && !opts.ghost) {
    const y = e.y - RR + RR * 2 * rp;
    add(ctx);
    ctx.fillStyle = rgba(col, 0.25 + 0.5 * (1 - sp)); ctx.fillRect(e.x - RR, y - 1.5, RR * 2, 3);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - sp)})`; ctx.fillRect(e.x - RR * 0.8, y - 0.5, RR * 1.6, 1);
    norm(ctx);
  }
}

// ── Renderer ────────────────────────────────────────────────
// Quality tiers. In auto mode the renderer starts high on desktop, medium on phones, and steps
// down on its own if frames run slow. Each tier says exactly what it draws:
//   dpr          resolution cap (device pixels per CSS pixel)
//   bloom        WebGL bloom + streaks (off = composite only)
//   dirt         lens dirt (costs 9 extra texture reads per pixel)
//   lights       dynamic grid lighting (two extra full-screen passes)
//   reflections  glossy-floor pass (redraws every tower and enemy)
//   city         live traffic and beacons in the city below (the static city stays)
//   rain         share of the sector's rain
//   ambient      share of drifting motes; bokeh only when 1
//   slices       slices in the derez death effect
const QUALITY = [
  { name: 'low', dpr: 1, bloom: false, dirt: false, lights: false, reflections: false, city: false, rain: 0.35, ambient: 0, slices: 3 },
  { name: 'medium', dpr: 1.25, bloom: true, dirt: false, lights: true, reflections: false, city: true, rain: 0.7, ambient: 0.5, slices: 5 },
  { name: 'high', dpr: 2, bloom: true, dirt: true, lights: true, reflections: true, city: true, rain: 1, ambient: 1, slices: 7 },
];
// phones and small tablets start one tier lower in auto mode
const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
const AUTO_START = () => (isPhone() ? 1 : QUALITY.length - 1);

export class Renderer {
  // opts.quality: 'low' | 'medium' | 'high' pins a tier (no auto-downgrade); opts.post=false forces plain 2D
  constructor(canvas, map, opts = {}) {
    this.view = canvas;
    this.post = opts.post === false ? null : Post.create(canvas);
    // With WebGL, the scene is drawn to an offscreen 2D canvas and composited onto the visible one.
    this.canvas = this.post ? document.createElement('canvas') : canvas;
    this.ctx = this.canvas.getContext('2d');
    this.map = map;
    this.k = 1;
    this.lastRt = 0;
    this.runners = Array.from({ length: 6 }, () => this.newRunner(true));
    this.motes = Array.from({ length: 70 }, () => this.newMote(true));
    this.bokeh = Array.from({ length: 9 }, () => this.newBokeh(true));
    this.trails = new Map();
    this.frameNo = 0;
    this.aim = new Map();     // tower → spring-smoothed turret angle
    this.derez = [];          // killed enemies dissolving into slices
    this.focusFx = null;      // slow-mo push-in on a world point
    this.beat = 0;            // music drum envelope, set each frame by main.js
    this.forms = new Map();   // tower → { level, stats, t0 } for build-in and upgrade morphs
    this.morphs = [];
    this.hbPhase = 0;         // Core heartbeat phase (speeds up as integrity drops)
    this.mood = { sat: 1, con: 1, lift: [0, 0, 0], gain: [1, 1, 1] };
    this.power = 1;           // CRT power-on transition progress
    this.comfort = { shake: 1, flash: 1 }; // player comfort scaling (pause menu)
    this.cine = null;         // boss entrance: letterbox + alarm
    this.rain = [];
    this.ripples = [];
    this.traffic = [];
    this.shatters = [];       // Cipher shields breaking apart
    this.nums = [];           // floating damage numbers
    this.wipe = 0;            // glitch-wipe transition envelope
    const fixed = QUALITY.findIndex((q) => q.name === opts.quality);
    this.quality = fixed >= 0 ? fixed : AUTO_START();
    this.autoQuality = fixed < 0;
    this.mode = fixed >= 0 ? QUALITY[fixed].name : 'auto';
    this.perf = { warm: 0, acc: 0, n: 0 };
    this.flashRGB = { key: '', v: [1, 1, 1] };
  }

  get q() { return QUALITY[this.quality]; }

  get theme() { return (this.map && this.map.def && this.map.def.theme) || {}; }

  setMap(map) {
    this.map = map;
    if (this.dpr) this.buildStatic();
  }

  resize(cssW, cssH, dpr) {
    this.cssSize = [cssW, cssH, dpr];
    const d = Math.min(dpr, this.q.dpr);
    const w = Math.max(1, Math.round(cssW * d)), h = Math.max(1, Math.round(cssH * d));
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.post) this.post.resize(w, h);
    this.k = w / WORLD_W;
    this.dpr = d;
    this.buildStatic();
  }

  // 'auto' (start high, step down when slow) or a pinned tier: 'high' | 'medium' | 'low'
  setMode(mode) {
    const i = QUALITY.findIndex((q) => q.name === mode);
    this.mode = i >= 0 ? mode : 'auto';
    this.autoQuality = i < 0;
    this.perf = { warm: 0, acc: 0, n: 0 };
    this.setQuality(i >= 0 ? i : AUTO_START());
  }

  setQuality(i) {
    this.quality = Math.max(0, Math.min(QUALITY.length - 1, i));
    if (this.cssSize) this.resize(...this.cssSize);
  }

  // Step down a tier when frames average under ~40 fps for a 2-second window.
  govern(rdt) {
    if (!this.autoQuality || this.quality === 0 || rdt <= 0 || rdt > 0.25) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    const P = this.perf;
    P.warm += rdt;
    if (P.warm < 2.5) return;
    P.acc += rdt; P.n++;
    if (P.acc < 1.5) return;
    const avg = P.acc / P.n;
    P.acc = 0; P.n = 0;
    if (avg > 1 / 40) {
      this.setQuality(this.quality - 1);
      P.warm = 0;
      console.info(`[render] frames slow (${(1000 * avg).toFixed(1)} ms) → quality ${this.q.name}`);
    }
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
    // lit: the same linework at full brightness — the lighting pass reveals it near light sources
    const [lit, lg] = this.layer();
    // fine sub-grid (half tiles) for texture; only visible where light falls
    lg.lineWidth = 0.6; lg.strokeStyle = 'rgba(127,240,255,0.22)';
    lg.beginPath();
    for (let i = 0; i < COLS; i++) { lg.moveTo(i * TILE + TILE / 2 + 0.5, 0); lg.lineTo(i * TILE + TILE / 2 + 0.5, H); }
    for (let j = 0; j < ROWS; j++) { lg.moveTo(0, j * TILE + TILE / 2 + 0.5); lg.lineTo(W, j * TILE + TILE / 2 + 0.5); }
    lg.stroke();
    const both = (fn) => { fn(g, 1); fn(lg, 0); };
    both((c, dim) => {
      c.lineWidth = 1;
      for (let i = 0; i <= COLS; i++) {
        c.strokeStyle = dim ? rgba(PAL.grid, i % 4 === 0 ? 0.1 : 0.045) : `rgba(140,245,255,${i % 4 === 0 ? 0.95 : 0.55})`;
        c.beginPath(); c.moveTo(i * TILE + 0.5, 0); c.lineTo(i * TILE + 0.5, H); c.stroke();
      }
      for (let j = 0; j <= ROWS; j++) {
        c.strokeStyle = dim ? rgba(PAL.grid, j % 4 === 0 ? 0.1 : 0.045) : `rgba(140,245,255,${j % 4 === 0 ? 0.95 : 0.55})`;
        c.beginPath(); c.moveTo(0, j * TILE + 0.5); c.lineTo(W, j * TILE + 0.5); c.stroke();
      }
      // tiny "+" marks on major intersections
      c.strokeStyle = dim ? rgba(PAL.grid, 0.3) : '#ffffff';
      for (let i = 0; i <= COLS; i += 4) for (let j = 0; j <= ROWS; j += 4) {
        c.beginPath(); c.moveTo(i * TILE - 3, j * TILE + 0.5); c.lineTo(i * TILE + 4, j * TILE + 0.5);
        c.moveTo(i * TILE + 0.5, j * TILE - 3); c.lineTo(i * TILE + 0.5, j * TILE + 4); c.stroke();
      }
    });
    // circuit traces in open space
    for (let n = 0; n < 22; n++) {
      let c = Math.floor(rnd() * COLS), r = Math.floor(rnd() * ROWS);
      if (!this.map.isBuildable(c, r)) continue;
      let x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
      const pts = [{ x, y }];
      let horiz = rnd() < 0.5;
      for (let s = 0; s < 2 + Math.floor(rnd() * 3); s++) {
        const len = (1 + Math.floor(rnd() * 3)) * TILE * (rnd() < 0.5 ? -1 : 1);
        const nx = horiz ? x + len : x, ny = horiz ? y : y + len;
        const nc = Math.floor(nx / TILE), nr = Math.floor(ny / TILE);
        if (!this.map.isBuildable(nc, nr)) break;
        x = nx; y = ny; pts.push({ x, y }); horiz = !horiz;
      }
      both((cx, dim) => {
        cx.strokeStyle = dim ? rgba(PAL.grid, 0.09) : 'rgba(140,245,255,0.8)'; cx.lineWidth = 1.2;
        cx.beginPath(); pts.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.stroke();
        cx.fillStyle = dim ? rgba(PAL.grid, 0.16) : '#ffffff'; cx.fillRect(pts[0].x - 2, pts[0].y - 2, 4, 4);
        cx.strokeStyle = dim ? rgba(PAL.grid, 0.18) : 'rgba(200,250,255,0.95)'; cx.strokeRect(x - 3, y - 3, 6, 6);
      });
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
    stroke(32, '#08131d');
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
    // trench depth (light from the top-left), masked to the bus interior
    const [tr, tg] = this.layer();
    for (const path of paths) path.segs.forEach((sg, si) => {
      const nx = -sg.uy, ny = sg.ux;
      const prev = path.segs[si - 1], next = path.segs[si + 1];
      for (const side of [-1, 1]) {
        const ox = nx * side, oy = ny * side;
        const facing = (-ox - oy) / Math.SQRT2;
        if (Math.abs(facing) < 0.3) continue;
        // at a bend the wall on the inside of the turn stops short; the outside wall wraps the corner
        const e0 = prev ? 16 * (ox * prev.ux + oy * prev.uy) : 18;
        const e1 = next ? -16 * (ox * next.ux + oy * next.uy) : 18;
        const ax = sg.x0 - sg.ux * e0, ay = sg.y0 - sg.uy * e0;
        const bx = sg.x0 + sg.ux * (sg.len + e1), by = sg.y0 + sg.uy * (sg.len + e1);
        const inner = facing > 0 ? 7 : 13.5;
        if (facing > 0) {
          const gr = tg.createLinearGradient(sg.x0 + ox * 16, sg.y0 + oy * 16, sg.x0 + ox * inner, sg.y0 + oy * inner);
          gr.addColorStop(0, 'rgba(0,0,0,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          tg.fillStyle = gr;
        } else tg.fillStyle = rgba(PAL.grid, 0.13);
        tg.beginPath();
        tg.moveTo(ax + ox * 16, ay + oy * 16); tg.lineTo(bx + ox * 16, by + oy * 16);
        tg.lineTo(bx + ox * inner, by + oy * inner); tg.lineTo(ax + ox * inner, ay + oy * inner);
        tg.closePath(); tg.fill();
      }
    });
    tg.globalCompositeOperation = 'destination-in';
    tg.lineJoin = 'miter'; tg.lineCap = 'square'; tg.lineWidth = 32; tg.strokeStyle = '#fff';
    for (const path of paths) { tg.beginPath(); path.points.forEach((p, i) => (i ? tg.lineTo(p.x, p.y) : tg.moveTo(p.x, p.y))); tg.stroke(); }
    b.drawImage(tr, 0, 0, W, H);

    // vias at the bends
    for (const path of paths) {
      const pts = path.points;
      for (let i = 1; i < pts.length - 1; i++) {
        b.fillStyle = rgba(PAL.grid, 0.9); b.fillRect(pts[i].x - 2, pts[i].y - 2, 4, 4);
        b.strokeStyle = rgba(PAL.grid, 0.35); b.strokeRect(pts[i].x - 6.5, pts[i].y - 6.5, 13, 13);
      }
    }
    this.bus = bus;

    // lit layer: no grid inside the bus, but its two edge rails catch the light
    lg.lineJoin = 'miter'; lg.lineCap = 'square';
    const litStroke = (w, style) => {
      lg.lineWidth = w; lg.strokeStyle = style;
      for (const path of paths) { lg.beginPath(); path.points.forEach((p, i) => (i ? lg.lineTo(p.x, p.y) : lg.moveTo(p.x, p.y))); lg.stroke(); }
    };
    lg.globalCompositeOperation = 'destination-out'; litStroke(37, '#000');
    lg.globalCompositeOperation = 'source-over'; litStroke(36, 'rgba(200,250,255,0.5)');
    lg.globalCompositeOperation = 'destination-out'; litStroke(33, '#000');
    lg.globalCompositeOperation = 'source-over';
    this.litGrid = lit;
    [this.lightCv, this.lctx] = this.layer(false);
    // floor reflections render at 1/3 resolution; upscaling softens them for free
    this.reflCv = document.createElement('canvas');
    this.reflCv.width = Math.max(1, Math.ceil(this.canvas.width / 3));
    this.reflCv.height = Math.max(1, Math.ceil(this.canvas.height / 3));
    this.rctx = this.reflCv.getContext('2d');
    this.reflFade = null;

    // ── 2D fallback post: vignette + scanlines (screen space). The WebGL path does this in a shader.
    const [post, p] = this.layer(false);
    const cw = post.width, ch = post.height;
    const vg = p.createRadialGradient(cw / 2, ch / 2, ch * 0.4, cw / 2, ch / 2, cw * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    p.fillStyle = vg; p.fillRect(0, 0, cw, ch);
    p.fillStyle = 'rgba(0,0,0,0.16)';
    const step = Math.max(3, Math.round(3 * (this.dpr || 1)));
    for (let y = 0; y < ch; y += step) p.fillRect(0, y, cw, Math.max(1, Math.round(this.dpr || 1)));
    this.vignette = post;

    // ── far below the glass grid: a city at night (parallax layer, half resolution = soft focus)
    const th = this.theme;
    this.city = null;
    if (th.city) {
      const M = 60, cs = this.k / 2;
      const c = document.createElement('canvas');
      c.width = Math.ceil((W + M * 2) * cs); c.height = Math.ceil((H + M * 2) * cs);
      const cg = c.getContext('2d');
      cg.scale(cs, cs); cg.translate(M, M);
      const rr = mulberry32(th.city.seed || 5), cols = th.city.colors, dens = th.city.density;
      cg.globalCompositeOperation = 'lighter';
      // streets: a skewed block grid with light streams along the avenues
      const streetsX = [], streetsY = [];
      for (let x = -M; x < W + M; x += 70 + rr() * 60) streetsX.push(x);
      for (let y = -M; y < H + M; y += 60 + rr() * 50) streetsY.push(y);
      cg.lineWidth = 2;
      for (const x of streetsX) { cg.strokeStyle = rgba(cols[0], 0.05 + rr() * 0.06 * dens); cg.beginPath(); cg.moveTo(x, -M); cg.lineTo(x + 30, H + M); cg.stroke(); }
      for (const y of streetsY) { cg.strokeStyle = rgba(cols[1 % cols.length], 0.05 + rr() * 0.06 * dens); cg.beginPath(); cg.moveTo(-M, y); cg.lineTo(W + M, y + 12); cg.stroke(); }
      // windows: clusters of tiny lights inside blocks
      const n = Math.round(1800 * dens);
      for (let i = 0; i < n; i++) {
        const bx = -M + rr() * (W + M * 2), by = -M + rr() * (H + M * 2);
        const col = cols[Math.floor(rr() * cols.length)];
        cg.fillStyle = rgba(col, 0.15 + rr() * 0.45);
        const sz = 1 + rr() * 2.2;
        cg.fillRect(bx, by, sz, sz);
      }
      // signage glows
      for (let i = 0; i < 14 * dens + 4; i++) {
        const x = -M + rr() * (W + M * 2), y = -M + rr() * (H + M * 2), r = 20 + rr() * 50;
        sprite(cg, aura(cols[Math.floor(rr() * cols.length)]), x, y, r, 0.35 + rr() * 0.35);
      }
      this.city = c;
      this.cityStreets = { x: streetsX, y: streetsY };
      this.traffic = Array.from({ length: Math.round(26 * dens) + 6 }, () => this.newCar(rr));
      this.beacons = Array.from({ length: 6 }, () => ({ x: rr() * W, y: rr() * H, ph: rr() * TAU }));
    }
    const drops = th.rain ? Math.round(340 * th.rain * this.q.rain * (motion.reduced ? 0.5 : 1)) : 0;
    this.rain = Array.from({ length: drops }, () => this.newDrop(true));
    this.ripples = [];
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

  // ── ambient atmosphere: drifting data motes (background) + soft bokeh (foreground) ──
  newMote(initial = false) {
    return {
      x: Math.random() * WORLD_W, y: initial ? Math.random() * WORLD_H : WORLD_H + 8,
      vx: (Math.random() - 0.5) * 8, vy: -(5 + Math.random() * 14),
      s: 0.8 + Math.random() * 1.5, ph: Math.random() * TAU, a: 0.18 + Math.random() * 0.4,
      col: Math.random() < 0.78 ? '#7fe9ff' : Math.random() < 0.6 ? '#ff5c8a' : '#ffcf5c',
    };
  }

  newBokeh(initial = false) {
    return {
      x: Math.random() * WORLD_W, y: initial ? Math.random() * WORLD_H : WORLD_H + 40,
      vx: (Math.random() - 0.5) * 6, vy: -(3 + Math.random() * 6),
      r: 10 + Math.random() * 22, ph: Math.random() * TAU, a: 0.05 + Math.random() * 0.07,
      col: Math.random() < 0.65 ? '#00e5ff' : '#ff2a6d',
    };
  }

  newDrop(initial = false) {
    const life = 0.25 + Math.random() * 1.1;
    const vy = 820 + Math.random() * 260, vx = vy * 0.17;
    // spawn so that it lands somewhere on the board after `life` seconds
    const lx = Math.random() * (WORLD_W + 80) - 40, ly = Math.random() * WORLD_H;
    const t0 = initial ? Math.random() * life : life;
    return { x: lx - vx * t0, y: ly - vy * t0, vx, vy, life: t0, len: 10 + Math.random() * 12, a: Math.random() < 0.25 ? 0.3 : 0.14 };
  }

  newCar(rr = Math.random) {
    const S = this.cityStreets, horiz = rr() < 0.5;
    const lane = horiz ? S.y[Math.floor(rr() * S.y.length)] : S.x[Math.floor(rr() * S.x.length)];
    const dir = rr() < 0.5 ? 1 : -1;
    return { horiz, lane, p: rr() * (horiz ? WORLD_W + 120 : WORLD_H + 120) - 60, v: dir * (30 + rr() * 50), col: rr() < 0.5 ? '#ffffff' : '#ff3b3b' };
  }

  stepWeather(dt) {
    for (let i = 0; i < this.rain.length; i++) {
      const d = this.rain[i];
      d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt;
      if (d.life <= 0) {
        if (this.ripples.length < 70) this.ripples.push({ x: d.x, y: d.y, t: 0 });
        this.rain[i] = this.newDrop();
      }
    }
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 0.42);
    for (const c of this.traffic) {
      c.p += c.v * dt;
      const L = c.horiz ? WORLD_W + 120 : WORLD_H + 120;
      if (c.p > L - 60) c.p -= L; else if (c.p < -60) c.p += L;
    }
  }

  // city far below: parallax at 40% of the camera motion, slow drift, blinking beacons, traffic
  drawCity(ctx, rt, sx, sy, zoom) {
    if (!this.city) return;
    const M = 60, W = WORLD_W, H = WORLD_H, k = this.k;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const pz = 1 + (zoom - 1) * 0.4;
    ctx.translate(W / 2 + sx * 0.4 + Math.sin(rt * 0.03) * 14, H / 2 + sy * 0.4 + Math.cos(rt * 0.023) * 9);
    ctx.scale(pz * 0.97, pz * 0.97);
    ctx.translate(-W / 2, -H / 2);
    add(ctx);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(this.city, -M, -M, W + M * 2, H + M * 2);
    ctx.globalAlpha = 1;
    if (!this.q.city) { norm(ctx); ctx.restore(); return; }
    for (const c of this.traffic) {
      const x = c.horiz ? c.p : c.lane + (c.p / H) * 30, y = c.horiz ? c.lane + (c.p / W) * 12 : c.p;
      ctx.fillStyle = rgba(c.col, 0.55); ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    for (const b of this.beacons) {
      const on = Math.sin(rt * 2.2 + b.ph) > 0.82;
      if (on) sprite(ctx, glow('#ff3b3b'), b.x, b.y, 7, 0.9);
    }
    norm(ctx);
    ctx.restore();
  }

  drawRipples(ctx) {
    if (!this.ripples.length) return;
    add(ctx);
    ctx.lineWidth = 0.8;
    for (const r of this.ripples) {
      const p = r.t / 0.42;
      ctx.strokeStyle = `rgba(190,225,255,${0.32 * (1 - p)})`;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 1 + p * 8, (1 + p * 8) * 0.45, 0, 0, TAU); ctx.stroke();
    }
    norm(ctx);
  }

  drawRain(ctx) {
    if (!this.rain.length) return;
    add(ctx);
    ctx.lineWidth = 1;
    for (const a of [0.14, 0.3]) {
      ctx.strokeStyle = `rgba(190,220,255,${a})`;
      ctx.beginPath();
      for (const d of this.rain) {
        if (d.a !== a) continue;
        const f = d.len / d.vy;
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.vx * f, d.y - d.len);
      }
      ctx.stroke();
    }
    norm(ctx);
  }

  // Boss entrance: letterbox bars + red alarm sweep; main.js adds the slow-mo, push-in and name card.
  cinematic(x, y, dur = 2.8) {
    this.cine = { t: 0, dur };
    this.focus(x, y, 0.22, dur * 0.9);
  }

  drawLetterbox(ctx) {
    const C = this.cine;
    if (!C) return;
    const p = C.t / C.dur;
    if (p >= 1) { this.cine = null; return; }
    const env = p < 0.12 ? easeOut(p / 0.12) : p > 0.82 ? 1 - smooth((p - 0.82) / 0.18) : 1;
    const h = WORLD_H * 0.1 * env;
    ctx.fillStyle = '#000';
    ctx.fillRect(-20, -20, WORLD_W + 40, h + 20);
    ctx.fillRect(-20, WORLD_H - h, WORLD_W + 40, h + 20);
    add(ctx);
    ctx.fillStyle = rgba(PAL.hostile, 0.6 * env);
    ctx.fillRect(0, h - 1, WORLD_W, 1); ctx.fillRect(0, WORLD_H - h, WORLD_W, 1);
    norm(ctx);
  }

  // ── max-level signatures: each tower type gets its own ambient effect ──
  drawSignature(ctx, t, time) {
    const col = t.stats.color, id = t.id || 0;
    ctx.save(); ctx.translate(t.x, t.y);
    add(ctx);
    if (t.type === 'blaster') {
      // heat shimmer + embers rising off the barrels
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        let px = (i - 1) * 5, py = -8;
        for (let j = 1; j <= 8; j++) {
          const y = -8 - j * 4.5;
          const x = (i - 1) * 5 + Math.sin(y * 0.28 + time * 6 + i * 2) * 2.6 * (j / 8);
          ctx.strokeStyle = rgba('#ffb347', 0.38 * (1 - j / 8));
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          px = x; py = y;
        }
      }
      for (let k = 0; k < 4; k++) {
        const p = (time * 0.55 + k / 4 + id * 0.13) % 1, a = Math.sin(p * Math.PI);
        const x = Math.sin(p * 9 + k * 2) * 7, y = -10 - p * 38;
        ctx.fillStyle = rgba('#ffd27a', 0.8 * a); ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
        sprite(ctx, glow('#ff8a3d'), x, y, 4, 0.5 * a);
      }
    } else if (t.type === 'launcher') {
      // fragments orbiting on a tilted ring (back half dimmer)
      for (let i = 0; i < 5; i++) {
        const a = time * 1.4 + (i * TAU) / 5 + id;
        const x = Math.cos(a) * 25, y = Math.sin(a) * 25 * 0.42 - 4, front = Math.sin(a) > 0;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a * 2 + i);
        ctx.globalAlpha = front ? 1 : 0.4;
        ctx.beginPath(); ctx.moveTo(3.2, 0); ctx.lineTo(-2, 2); ctx.lineTo(-1.2, -2.2); ctx.closePath();
        ctx.fillStyle = rgba(col, 0.35); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.restore();
        sprite(ctx, glow(col), x, y, 4, front ? 0.5 : 0.2);
      }
    } else if (t.type === 'cryo') {
      // frost mist curling off the base, ice glints
      norm(ctx);
      for (let i = 0; i < 6; i++) {
        const p = (time * 0.22 + i / 6 + id * 0.07) % 1;
        const a = i * 1.3 + id, r = 10 + p * 24;
        sprite(ctx, puff('#bfe8ff'), Math.cos(a) * r, Math.sin(a) * r * 0.55 + 6, 8 + p * 12, 0.42 * Math.sin(p * Math.PI));
      }
      add(ctx);
      ctx.strokeStyle = 'rgba(230,250,255,0.9)'; ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const tw = Math.max(0, Math.sin(time * 3 + i * 1.9 + id));
        if (tw < 0.2) continue;
        const x = (hash(i * 3.1 + id) - 0.5) * 40, y = (hash(i * 5.7 + id) - 0.5) * 34, s = 2.5 * tw;
        ctx.globalAlpha = tw;
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (t.type === 'arc') {
      // constant crackle around the coil
      for (let i = 0; i < 3; i++) {
        const a1 = Math.random() * TAU, a2 = a1 + 0.6 + Math.random() * 1.6, r = 20 + Math.random() * 5;
        const p1 = { x: Math.cos(a1) * r, y: Math.sin(a1) * r * 0.8 - 6 }, p2 = { x: Math.cos(a2) * r, y: Math.sin(a2) * r * 0.8 - 6 };
        circuitPath(ctx, [p1, p2]);
        ctx.strokeStyle = rgba(col, 0.25); ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.5 + Math.random() * 0.4); ctx.lineWidth = 0.8; ctx.stroke();
        sprite(ctx, glow(col), p2.x, p2.y, 4, 0.7);
      }
      ctx.fillStyle = rgba(col, 0.8);
      for (let i = 0; i < 6; i++) {
        const a = time * 0.8 + (i * TAU) / 6;
        ctx.fillRect(Math.cos(a) * 22 - 1, Math.sin(a) * 22 * 0.8 - 7, 2, 2);
      }
    }
    norm(ctx);
    ctx.restore();
  }

  stepAmbient(dt) {
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.y < -8 || m.x < -8 || m.x > WORLD_W + 8) this.motes[i] = this.newMote();
    }
    for (let i = 0; i < this.bokeh.length; i++) {
      const b = this.bokeh[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y < -40 || b.x < -40 || b.x > WORLD_W + 40) this.bokeh[i] = this.newBokeh();
    }
  }

  drawMotes(ctx, rt) {
    const n = Math.round(this.motes.length * this.q.ambient);
    if (!n) return;
    add(ctx);
    for (let i = 0; i < n; i++) {
      const m = this.motes[i];
      const a = m.a * (0.45 + 0.55 * Math.sin(rt * 1.7 + m.ph) ** 2);
      ctx.fillStyle = rgba(m.col, a);
      ctx.fillRect(m.x - m.s / 2, m.y - m.s / 2, m.s, m.s);
    }
    norm(ctx);
  }

  drawBokeh(ctx, rt) {
    if (this.q.ambient < 1) return;
    add(ctx);
    for (const b of this.bokeh) sprite(ctx, aura(b.col), b.x, b.y, b.r, b.a * (0.6 + 0.4 * Math.sin(rt * 0.9 + b.ph)));
    norm(ctx);
  }

  // ── dynamic lighting: every emitter lights the grid around it ──
  // Lights accumulate in an offscreen buffer, which is then masked by the bright grid layer
  // (destination-in) and added onto the scene, so grid lines glow near towers, enemies and blasts.
  drawLighting(ctx, game, rt, coreCol) {
    const L = this.lctx, k = this.k, fx = game.fx, W = WORLD_W, H = WORLD_H;
    L.setTransform(1, 0, 0, 1, 0, 0);
    L.globalCompositeOperation = 'source-over';
    L.globalAlpha = 1;
    L.clearRect(0, 0, this.lightCv.width, this.lightCv.height);
    L.setTransform(k, 0, 0, k, 0, 0);
    L.globalCompositeOperation = 'lighter';
    // ambient pools drifting across the board
    const amb = this.theme.ambient || ['#00e5ff', '#ff2a6d', '#b967ff'];
    sprite(L, light(amb[0]), W * (0.5 + 0.4 * Math.sin(rt * 0.07)), H * (0.5 + 0.38 * Math.sin(rt * 0.11 + 1)), 440, 0.2);
    sprite(L, light(amb[1]), W * (0.5 + 0.42 * Math.cos(rt * 0.05 + 2)), H * (0.5 + 0.4 * Math.sin(rt * 0.083)), 380, 0.15);
    sprite(L, light(amb[2]), W * (0.5 + 0.35 * Math.sin(rt * 0.045 + 4)), H * (0.5 + 0.3 * Math.cos(rt * 0.06)), 340, 0.12);
    // slow holographic scan band sweeping down the grid
    const by = ((rt * 62) % (H + 520)) - 260;
    const sg = L.createLinearGradient(0, by - 80, 0, by + 80);
    sg.addColorStop(0, 'rgba(0,229,255,0)'); sg.addColorStop(0.5, 'rgba(0,229,255,0.32)'); sg.addColorStop(1, 'rgba(0,229,255,0)');
    L.fillStyle = sg; L.fillRect(0, by - 80, W, 160);
    // the whole grid breathes on the music's kick and snare
    const cf = this.comfort.flash;
    if (this.beat > 0.02) { L.fillStyle = rgba(amb[0], 0.15 * this.beat * cf * (motion.reduced ? 0.4 : 1)); L.fillRect(0, 0, W, H); }
    // boss entrance: red alarm sweeping across the grid
    const fa = this.finalAlarm(game);
    if (fa > 0) {
      const C0 = this.map.core;
      for (let b = 0; b < 2; b++) {
        const a = rt * 1.7 + b * Math.PI;
        const lg = L.createRadialGradient(C0.x, C0.y, 0, C0.x, C0.y, 1100);
        lg.addColorStop(0, rgba(PAL.hostile, 0.95 * fa * cf)); lg.addColorStop(1, rgba(PAL.hostile, 0.1 * fa * cf));
        L.fillStyle = lg;
        L.beginPath(); L.moveTo(C0.x, C0.y); L.arc(C0.x, C0.y, 1400, a - 0.26, a + 0.26); L.closePath(); L.fill();
      }
    }
    if (this.cine) {
      L.fillStyle = rgba(PAL.hostile, 0.24 * cf * (0.5 + 0.5 * Math.sin(this.cine.t * 12)));
      L.fillRect(0, 0, W, H);
    }
    // Core integrity critical: the grid pulses red
    if (game.state === 'wave' && game.lives <= game.maxLives * 0.3) {
      L.fillStyle = rgba(PAL.hostile, 0.16 * cf * (0.5 + 0.5 * Math.sin(rt * 7)));
      L.fillRect(0, 0, W, H);
    }
    // fixed emitters
    const live = game.state === 'wave' ? 1 : 0.55;
    for (const p of this.map.paths) sprite(L, light(PAL.hostile), p.start.x, p.start.y, 170, 0.6 * live);
    const C = this.map.core;
    sprite(L, light(coreCol), C.x, C.y, 210 + this.beat * 50, Math.min(1, 0.75 + game.coreFlash + this.beat * 0.25));
    for (const r of this.runners) sprite(L, light(r.col), r.x, r.y, 46, 0.5);
    // dynamic emitters
    for (const t of game.towers) sprite(L, light(t.stats.color), t.x, t.y, 64 + t.level * 8, Math.min(1, 0.42 + t.recoil * 0.45 + t.upgradeFlash));
    for (const e of game.enemies) {
      if (e.def.stealth && e.revealT <= 0) continue;
      sprite(L, light(e.def.color), e.x, e.y, e.radius * (e.def.boss ? 6 : 4.5), e.def.boss ? 0.9 : 0.6);
    }
    for (const p of game.projectiles) if (!(p.delay > 0)) sprite(L, light(p.color), p.x, p.y, 42, 0.55);
    for (const z of game.zones) sprite(L, light(z.color), z.x, z.y, z.r * 1.8, 0.55 * Math.min(1, z.t / 0.3));
    for (const p of fx.parts) if (p.kind === 'glow' && p.size > 6) sprite(L, light(p.color), p.x, p.y, p.size * 3.5, p.life / p.max);
    for (const r of fx.rings) {
      if (r.r1 <= r.r0) continue;
      const a = r.life / r.max;
      sprite(L, light(r.color), r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(1 - a) + 30, a * 0.8);
    }
    for (const b of fx.beams) sprite(L, light(b.color), (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2, Math.hypot(b.x2 - b.x1, b.y2 - b.y1) * 0.6 + 30, b.life / b.max);
    // keep only the light that falls on grid lines
    L.globalCompositeOperation = 'destination-in';
    L.drawImage(this.litGrid, 0, 0, W, H);
    L.globalCompositeOperation = 'source-over';
    add(ctx);
    ctx.drawImage(this.lightCv, 0, 0, W, H);
    // the searchlights are also faintly visible as beams in the air
    if (fa > 0) {
      const C0 = this.map.core;
      for (let b = 0; b < 2; b++) {
        const a = rt * 1.7 + b * Math.PI;
        const bg = ctx.createRadialGradient(C0.x, C0.y, 0, C0.x, C0.y, 900);
        bg.addColorStop(0, rgba(PAL.hostile, 0.16 * fa * cf)); bg.addColorStop(1, rgba(PAL.hostile, 0));
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.moveTo(C0.x, C0.y); ctx.arc(C0.x, C0.y, 1400, a - 0.22, a + 0.22); ctx.closePath(); ctx.fill();
      }
    }
    norm(ctx);
  }

  // soft colored pools on the floor under towers (drawn before the towers themselves)
  drawPools(ctx, game) {
    add(ctx);
    for (const t of game.towers) sprite(ctx, light(t.stats.color), t.x, t.y, 46 + t.level * 6, 0.09 + t.recoil * 0.12 + t.upgradeFlash * 0.3);
    norm(ctx);
  }

  // ── enemy motion trails (positions sampled in sim time, so pausing freezes them) ──
  updateTrails(game) {
    const f = ++this.frameNo, now = game.time;
    const gdt = Math.max(0, Math.min(0.1, now - (this.trailT ?? now)));
    this.trailT = now;
    const K = 520, C = 2 * 0.38 * Math.sqrt(K);
    for (const e of game.enemies) {
      let tr = this.trails.get(e);
      if (!tr) { tr = { pts: [] }; this.trails.set(e, tr); }
      tr.seen = f;
      // hit reaction: knocked back along the path (bigger hits push harder), then springs home
      if (tr.hp === undefined) Object.assign(tr, { hp: e.hp, kx: 0, ky: 0, vx: 0, vy: 0, sq: 0 });
      // Cipher shield just broke → shatter it
      if (tr.shield && !e.shieldUp && this.shatters.length < 20) this.shatters.push({ x: e.x, y: e.y, r: e.radius + 6, t0: now });
      tr.shield = !!e.shieldUp;
      const lost = tr.hp - e.hp;
      // damage numbers: hits on one enemy merge for a quarter second, then float up as one number
      if (lost > 0) {
        if (!tr.acc) tr.accT = now;
        tr.acc = (tr.acc || 0) + lost;
      }
      if (tr.acc && now - tr.accT > 0.25) { this.pushNum(e, tr.acc); tr.acc = 0; }
      tr.hp = e.hp;
      if (lost > 0 && !motion.reduced) {
        const m = Math.min(1, Math.max(0.15, (lost / e.maxHp) * 6)) * (e.def.boss ? 0.25 : 1);
        const a = e.angle + Math.PI + (Math.random() - 0.5) * 1.2;
        tr.vx += Math.cos(a) * 210 * m; tr.vy += Math.sin(a) * 210 * m;
        tr.sq = Math.min(1, tr.sq + m);
      }
      if (gdt > 0) {
        const n = Math.ceil(gdt * 120), h = gdt / n;
        for (let i = 0; i < n; i++) {
          tr.vx += (-tr.kx * K - tr.vx * C) * h; tr.vy += (-tr.ky * K - tr.vy * C) * h;
          tr.kx += tr.vx * h; tr.ky += tr.vy * h;
        }
        tr.sq *= Math.exp(-14 * gdt);
      }
      const pts = tr.pts, last = pts[pts.length - 1];
      if (last && now < last.t) pts.length = 0;
      if (!last || Math.abs(e.x - last.x) + Math.abs(e.y - last.y) > 3) pts.push({ x: e.x, y: e.y, t: now });
      const maxAge = e.def.boss ? 0.45 : 0.26;
      while (pts.length > 1 && now - pts[0].t > maxAge) pts.shift();
    }
    for (const [e, tr] of this.trails) {
      if (tr.seen === f) continue;
      if (e.dead && !e.leaked) {
        const v = (tr.acc || 0) + Math.max(0, tr.hp ?? 0);
        if (v > 0) this.pushNum(e, v);
      }
      if (e.dead && !e.leaked && !e.def.boss && this.derez.length < 40) this.derez.push({ e, t0: now });
      this.trails.delete(e);
    }
  }

  drawTrails(ctx, game) {
    add(ctx);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const e of game.enemies) {
      const tr = this.trails.get(e);
      if (!tr || tr.pts.length < 2 || (e.def.stealth && e.revealT <= 0)) continue;
      const pts = tr.pts, n = pts.length, col = e.def.color;
      const w0 = e.radius * (e.def.boss ? 1.1 : 0.85), age = e.def.boss ? 0.45 : 0.26;
      let px = e.x, py = e.y;
      for (let i = n - 1; i >= 0; i--) {
        const f = Math.max(0, 1 - (game.time - pts[i].t) / age);
        if (f <= 0) break;
        ctx.strokeStyle = rgba(col, 0.22 * f * f);
        ctx.lineWidth = w0 * (0.25 + 0.75 * f);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
        px = pts[i].x; py = pts[i].y;
      }
    }
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    norm(ctx);
  }

  // Slow-mo push-in toward a world point (called from main.js on wave-ending and boss kills).
  focus(x, y, amt, dur) { this.focusFx = { x, y, amt, dur, t: 0 }; }

  // ── turret aim: an underdamped spring chases the sim's angle, so turrets swing with a little
  // overshoot, kick when they fire, and slowly scan the field while idle. Runs on sim time.
  updateAim(game) {
    const now = game.time, f = this.frameNo;
    let dt = now - (this.aimT ?? now);
    this.aimT = now;
    dt = Math.max(0, Math.min(0.1, dt));
    const K = 300, C = 2 * 0.55 * Math.sqrt(K); // ω ≈ 17 rad/s, ζ = 0.55
    for (const t of game.towers) {
      if (t.type !== 'blaster' && t.type !== 'launcher') continue;
      let a = this.aim.get(t);
      if (!a) { a = { a: t.angle, v: 0, idle: 0, base: t.angle, rec: 0 }; this.aim.set(t, a); }
      a.seen = f;
      let goal;
      if (t.target) { a.idle = 0; a.base = goal = t.angle; }
      else {
        a.idle += dt;
        const s = Math.max(0, a.idle - 1.2);
        goal = a.base + Math.sin(s * 0.7) * 0.6 * Math.min(1, s);
      }
      if (t.recoil > a.rec + 0.5 && !motion.reduced) a.v += (Math.random() - 0.5) * 5;
      a.rec = t.recoil;
      if (dt > 0) {
        const n = Math.ceil(dt * 120), h = dt / n;
        for (let i = 0; i < n; i++) {
          const d = Math.atan2(Math.sin(goal - a.a), Math.cos(goal - a.a));
          a.v += (d * K - a.v * C) * h;
          a.a += a.v * h;
        }
      }
    }
    for (const [t, a] of this.aim) if (a.seen !== f) this.aim.delete(t);
  }

  aimAngle(t) { const a = this.aim.get(t); return a ? a.a : t.angle; }

  // ── glossy floor: towers and enemies mirrored below their base, squashed, soft and additive ──
  drawReflections(ctx, game, time) {
    const R = this.rctx, s = this.k / 3;
    R.setTransform(1, 0, 0, 1, 0, 0);
    R.globalCompositeOperation = 'source-over';
    R.globalAlpha = 1;
    R.clearRect(0, 0, this.reflCv.width, this.reflCv.height);
    R.setTransform(s, 0, 0, s, 0, 0);
    const mirror = (yb) => { R.translate(0, yb); R.scale(1, -0.55); R.translate(0, -yb); };
    if (!this.reflFade) {
      // erase mask in object-local coords: the reflection dies out with distance from the base
      this.reflFade = R.createLinearGradient(0, 0, 0, 24);
      this.reflFade.addColorStop(0, 'rgba(0,0,0,0.15)'); this.reflFade.addColorStop(1, 'rgba(0,0,0,1)');
    }
    const fade = (x, yb, w) => {
      R.save(); R.translate(x, yb);
      R.globalCompositeOperation = 'destination-out';
      R.fillStyle = this.reflFade; R.fillRect(-w, 0, w * 2, 40);
      R.restore();
    };
    for (const t of game.towers) {
      R.save(); mirror(t.y + 20);
      drawTower(R, t, time, { angle: this.aimAngle(t), reflect: true });
      R.restore();
      fade(t.x, t.y + 20, 40);
    }
    for (const e of game.enemies) {
      if (e.def.stealth && e.revealT <= 0) continue;
      R.save(); mirror(e.y + e.radius + 3);
      drawEnemy(R, e, time, this.map, { ghost: true });
      R.restore();
      fade(e.x, e.y + e.radius + 3, e.radius * 3);
    }
    add(ctx);
    ctx.globalAlpha = 0.42;
    ctx.drawImage(this.reflCv, 0, 0, WORLD_W, WORLD_H);
    ctx.globalAlpha = 1;
    norm(ctx);
  }

  // ── derez: a killed enemy splits into horizontal slices that shear apart and collapse ──
  pushNum(e, v) {
    if (this.nums.length > 80) this.nums.shift();
    const ref = e.def.boss ? e.maxHp * 0.05 : e.maxHp;
    this.nums.push({ x: e.x + e.radius + 8 + Math.random() * 6, y: e.y - e.radius * 0.5 + (Math.random() - 0.5) * 6, v, f: v / ref, t0: this.trailT ?? 0 });
  }

  // merged damage numbers: bigger hits pop bigger and warmer
  drawNums(ctx, game) {
    if (!this.nums.length) return;
    const now = game.time, D = 0.8;
    this.nums = this.nums.filter((n) => now >= n.t0 && now - n.t0 < D);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of this.nums) {
      const p = (now - n.t0) / D;
      const tier = n.f >= 0.5 ? 3 : n.f >= 0.25 ? 2 : n.f >= 0.05 ? 1 : 0;
      const size = [8, 10, 13, 16][tier];
      const col = ['#8fb3c4', '#e8f6ff', '#ffb347', '#ff6a3d'][tier];
      const pop = tier >= 2 && p < 0.25 ? easeOutBack(p / 0.25) : 1;
      ctx.save();
      ctx.translate(n.x, n.y - easeOut(p) * (14 + tier * 4));
      ctx.scale(pop, pop);
      ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      ctx.font = `700 ${size}px ${MONO}`;
      const txt = n.v >= 10 ? String(Math.round(n.v)) : n.v.toFixed(1);
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(2,4,10,0.85)'; ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = col; ctx.fillText(txt, 0, 0);
      ctx.restore();
    }
  }

  // Cipher shield shards flying off the hexagonal plate
  drawShatters(ctx, game) {
    if (!this.shatters.length) return;
    const now = game.time, D = 0.45;
    this.shatters = this.shatters.filter((s) => now >= s.t0 && now - s.t0 < D);
    add(ctx);
    for (const s of this.shatters) {
      const p = (now - s.t0) / D, ep = easeOut(p);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + hash(i + s.x) * 0.4, d = s.r + ep * (26 + hash(i * 7 + s.y) * 24);
        ctx.save(); ctx.translate(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d); ctx.rotate(a + p * 6 * (i % 2 ? 1 : -1));
        ctx.globalAlpha = 1 - p;
        ctx.beginPath(); ctx.moveTo(3.5, 0); ctx.lineTo(-2.5, 2.2); ctx.lineTo(-1.5, -2.5); ctx.closePath();
        ctx.fillStyle = 'rgba(255,240,170,0.35)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = `rgba(255,245,200,${0.7 * (1 - p)})`; ctx.lineWidth = 2 * (1 - p) + 0.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r + ep * 10, 0, TAU); ctx.stroke();
    }
    norm(ctx);
  }

  drawDerez(ctx, game, time) {
    if (!this.derez.length) return;
    const D = 0.42, now = game.time;
    this.derez = this.derez.filter((d) => now >= d.t0 && now - d.t0 < D);
    for (const d of this.derez) {
      const e = d.e, p = (now - d.t0) / D, ep = easeOut(p);
      if (e.type === 'worm') { this.derezWorm(ctx, e, p, ep); continue; }
      if (e.type === 'rootkit') { this.derezStatic(ctx, e, p); continue; }
      if (e.type === 'patcher') { this.derezImplode(ctx, e, time, p); continue; }
      const R = e.radius + 8, n = this.q.slices, h = (2 * R) / n;
      const shear = (i) => (i % 2 ? 1 : -1) * (0.4 + hash(i * 3.7 + e.seed)) * ep * R * 1.8;
      for (let i = 0; i < n; i++) {
        const dx = shear(i);
        ctx.save();
        ctx.globalAlpha = (1 - p) ** 1.4;
        ctx.beginPath(); ctx.rect(e.x - R * 1.6 + dx, e.y - R + i * h, R * 3.2, h * (1 - p * 0.75)); ctx.clip();
        ctx.translate(dx, 0);
        drawEnemy(ctx, e, time, this.map, { ghost: true });
        ctx.restore();
      }
      // bright seams between the slices
      add(ctx);
      for (let i = 1; i < n; i++) {
        const w = 2 * R * (1 - p);
        ctx.fillStyle = rgba(i % 2 ? '#00e5ff' : e.def.color, 0.8 * (1 - p));
        ctx.fillRect(e.x - w / 2 + shear(i) * 0.5, e.y - R + i * h - 0.5, w, 1);
      }
      norm(ctx);
    }
  }

  // Worm: the body segments come apart and tumble away
  derezWorm(ctx, e, p, ep) {
    const col = e.def.color, r = e.radius;
    add(ctx);
    for (let i = 0; i < 4; i++) {
      const bx = e.x - Math.cos(e.angle) * i * r * 0.85, by = e.y - Math.sin(e.angle) * i * r * 0.85;
      const a = e.angle + Math.PI / 2 * (i % 2 ? 1 : -1) + (hash(i + e.seed) - 0.5) * 1.4;
      const d = ep * (24 + hash(i * 3 + e.seed) * 20);
      const sr = (i ? r * (0.6 - i * 0.06) : r * 0.72) * (1 - p * 0.5);
      ctx.save(); ctx.translate(bx + Math.cos(a) * d, by + Math.sin(a) * d); ctx.rotate(p * 9 * (i % 2 ? 1 : -1) + e.seed);
      ctx.globalAlpha = 1 - p;
      square(ctx, sr); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
      sprite(ctx, glow(col), bx + Math.cos(a) * d, by + Math.sin(a) * d, sr * 1.4, 0.6 * (1 - p));
    }
    norm(ctx);
  }

  // Rootkit: collapses into a cloud of static that scatters and blinks out
  derezStatic(ctx, e, p) {
    const col = e.def.color, R = e.radius * (1 + p * 1.8), tick = Math.floor((this.trailT || 0) * 40);
    add(ctx);
    for (let i = 0; i < 46; i++) {
      if (hash(i * 1.3 + tick) < p * 0.9) continue;
      const a = hash(i * 7.7 + e.seed) * TAU, d = Math.sqrt(hash(i * 3.1 + e.seed)) * R;
      const s = 1 + hash(i + tick) * 2;
      ctx.fillStyle = hash(i * 9 + tick) < 0.5 ? rgba(col, 0.9 * (1 - p)) : `rgba(220,240,255,${0.8 * (1 - p)})`;
      ctx.fillRect(e.x + Math.cos(a) * d - s / 2, e.y + Math.sin(a) * d - s / 2, s, s);
    }
    norm(ctx);
  }

  // Patcher: implodes to a point, a ring rushes inward, then a flash
  derezImplode(ctx, e, time, p) {
    const col = e.def.color;
    if (p < 0.55) {
      const k = 1 - p / 0.55;
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(p * 8); ctx.scale(k * k, k * k); ctx.translate(-e.x, -e.y);
      drawEnemy(ctx, e, time, this.map, { ghost: true });
      ctx.restore();
    }
    add(ctx);
    const rr = (e.radius + 26) * (1 - easeOut(Math.min(1, p / 0.55)));
    ctx.strokeStyle = rgba(col, 0.8 * (1 - p)); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(e.x, e.y, Math.max(0.5, rr), 0, TAU); ctx.stroke();
    if (p > 0.5) sprite(ctx, glow(col), e.x, e.y, 10 + (p - 0.5) * 50, (1 - p) * 1.6);
    norm(ctx);
  }

  // ── final wave: red searchlights sweep from the Core, then a 3-2-1 countdown ──
  finalAlarm(game) {
    const last = game.waves.length;
    if (game.state === 'break' && game.wave === last - 1) return 1;
    if (game.state === 'wave' && game.wave === last && game.waveTime < 4) return 1 - game.waveTime / 4;
    return 0;
  }

  drawCountdown(ctx, game) {
    if (!(game.state === 'break' && game.wave === game.waves.length - 1 && game.breakTimer <= 3 && game.breakTimer > 0)) return;
    const n = Math.ceil(game.breakTimer), f = game.breakTimer - (n - 1); // 1 → 0 within each second
    const sc = 1 + (1 - easeOut(Math.min(1, (1 - f) * 4))) * 0.5;
    ctx.save();
    ctx.translate(WORLD_W / 2, WORLD_H / 2); ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(1, f * 2.5);
    ctx.font = `700 150px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(2,4,10,0.75)'; ctx.strokeText(n, 0, 0);
    ctx.fillStyle = PAL.hostile; ctx.fillText(n, 0, 0);
    add(ctx);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(n, 0, 0);
    ctx.strokeStyle = rgba(PAL.hostile, 0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 110, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke();
    norm(ctx);
    ctx.restore();
  }

  // copy of the current frame (rendered fresh, so it works with the WebGL canvas too)
  snapshot(game, view) {
    this.render(game, view, this.lastRt);
    const c = document.createElement('canvas');
    c.width = this.view.width; c.height = this.view.height;
    c.getContext('2d').drawImage(this.view, 0, 0);
    return c;
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
    const rawDt = rt - this.lastRt;
    const rdt = Math.min(0.1, Math.max(0, rawDt));
    this.lastRt = rt;
    this.govern(rawDt);
    this.stepRunners(rdt);
    this.stepAmbient(rdt);
    this.stepWeather(rdt);
    if (this.cine) this.cine.t += rdt;
    this.updateTrails(game);
    this.updateAim(game);
    this.updateForms(game);
    this.rdt = rdt;
    this.viewStarted = view.started;
    this.curGame = game;
    this.hbPhase += rdt * (0.55 + (1 - game.lives / game.maxLives) * 1.6);
    if (this.power < 1) this.power = Math.min(1, this.power + rdt / 0.65);
    this.wipe = Math.max(0, this.wipe - rdt / 0.4);
    const reduced = motion.reduced;
    const coreCol = lerpColor(PAL.hostile, PAL.grid, game.lives / game.maxLives);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    norm(ctx);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // camera: smooth noise-driven shake with a touch of roll, plus a zoom punch on big hits
    const cs = this.comfort.shake;
    const shake = fx.shakeMag * (reduced ? 0.15 : 1) * cs;
    const sx = shake * 0.55 * (Math.sin(rt * 61.3) * 0.6 + Math.sin(rt * 37.1 + 1.7) * 0.4);
    const sy = shake * 0.55 * (Math.sin(rt * 53.7 + 0.6) * 0.6 + Math.sin(rt * 29.3 + 2.9) * 0.4);
    const roll = reduced ? 0 : shake * 0.0011 * Math.sin(rt * 41.9 + 0.3);
    const zoom = reduced ? 1 : 1 + Math.min(0.03, fx.shakeMag * 0.0013) * cs;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.translate(WORLD_W / 2 + sx, WORLD_H / 2 + sy);
    ctx.rotate(roll);
    ctx.scale(zoom, zoom);
    ctx.translate(-WORLD_W / 2, -WORLD_H / 2);
    const F = this.focusFx;
    if (F) {
      F.t += rdt;
      const p = F.t / F.dur;
      if (p >= 1 || reduced) this.focusFx = null;
      else {
        // fast push-in, brief hold, smooth release (zooming in about a world point never reveals off-board space)
        const env = p < 0.18 ? easeOut(p / 0.18) : p < 0.5 ? 1 : 1 - smooth((p - 0.5) / 0.5);
        const z = 1 + F.amt * env * Math.max(0.3, cs);
        ctx.translate(F.x, F.y); ctx.scale(z, z); ctx.translate(-F.x, -F.y);
      }
    }
    const cam = ctx.getTransform();

    ctx.drawImage(this.bg, 0, 0, WORLD_W, WORLD_H);
    this.drawCity(ctx, rt, sx, sy, zoom);
    this.drawMotes(ctx, rt);
    this.drawRunners(ctx);
    ctx.drawImage(this.bus, 0, 0, WORLD_W, WORLD_H);
    if (this.q.lights) this.drawLighting(ctx, game, rt, coreCol);
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

    if (this.q.reflections) this.drawReflections(ctx, game, time);
    this.drawRipples(ctx);
    this.drawPools(ctx, game);
    for (const t of game.towers) this.drawTowerAnimated(ctx, t, time);
    for (const fw of game.firewalls) this.drawFirewall(ctx, fw, fw.t / fw.max, rt, 1);
    this.drawTrails(ctx, game);
    for (const e of game.enemies) {
      const tr = this.trails.get(e);
      drawEnemy(ctx, e, time, this.map, tr && tr.hp !== undefined ? { kx: tr.kx, ky: tr.ky, sq: tr.sq } : undefined);
    }
    this.drawDerez(ctx, game, time);
    this.drawShatters(ctx, game);
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
        // hologram: flickering, occasionally jittering projection with rolling scanlines
        const hc = ok ? def.color : PAL.hostile;
        const flick = !motion.reduced && hash(Math.floor(rt * 20)) < 0.08 ? 0.45 : 1;
        const jx = !motion.reduced && hash(Math.floor(rt * 13) + 5) < 0.06 ? (hash(Math.floor(rt * 13)) - 0.5) * 5 : 0;
        ctx.globalAlpha = (ok ? 0.62 : 0.3) * flick;
        drawTower(ctx, { type: view.placing, stats: view.placingStats, x: x + jx, y, angle: -Math.PI / 2, recoil: 0, spin: 0, level: 1, spawnT: 1, id: 0, cooldown: 0, barrel: 0, upgradeFlash: 0 }, time, { reflect: true });
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.beginPath(); ctx.rect(x - 22, y - 26, 44, 48); ctx.clip();
        add(ctx);
        ctx.fillStyle = rgba(hc, 0.1);
        for (let yy = y - 26 + ((rt * 24) % 4); yy < y + 22; yy += 4) ctx.fillRect(x - 22, yy, 44, 1);
        ctx.fillStyle = rgba(hc, 0.28);
        ctx.fillRect(x - 22, y - 26 + ((rt * 46) % 48), 44, 2);
        // projector glow rising from the tile
        const pg = ctx.createLinearGradient(0, y + 22, 0, y - 10);
        pg.addColorStop(0, rgba(hc, 0.22)); pg.addColorStop(1, rgba(hc, 0));
        ctx.fillStyle = pg; ctx.fillRect(x - 18, y - 10, 36, 32);
        norm(ctx);
        ctx.restore();
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

    this.drawNums(ctx, game);
    this.drawCountdown(ctx, game);
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
    this.drawRain(ctx);
    this.drawBokeh(ctx, rt);
    this.drawLetterbox(ctx);

    if (this.post && !this.post.lost) {
      // boss bar goes into the scene so it blooms too; the shader does vignette/scanlines/flash/glitch
      ctx.setTransform(k, 0, 0, k, 0, 0);
      this.drawBossBar(ctx, game, rt);
      this.composite(game, rt, cam, zoom);
      return;
    }

    // ── 2D fallback screen-space post ──
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.shakeMag > 4.5 && !reduced) this.glitch(ctx, fx.shakeMag);
    ctx.drawImage(this.vignette, 0, 0);
    if (fx.flashA > 0) {
      ctx.fillStyle = `rgba(${fx.flashRGB},${fx.flashA * (reduced ? 0.15 : 0.45) * this.comfort.flash})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    this.drawBossBar(ctx, game, rt);
  }

  // Hand the finished scene to the WebGL post pass.
  composite(game, rt, cam, zoom) {
    const fx = game.fx, reduced = motion.reduced;
    const cw = this.canvas.width, ch = this.canvas.height;
    if (this.flashRGB.key !== fx.flashRGB) {
      this.flashRGB = { key: fx.flashRGB, v: fx.flashRGB.split(',').map((n) => +n / 255) };
    }
    const waves = [];
    if (!reduced) {
      const sc = this.k * zoom / ch;
      for (const w of fx.waves) {
        const a = w.life / w.max;
        const r = w.r0 + (w.r1 - w.r0) * easeOut(1 - a);
        const p = cam.transformPoint({ x: w.x, y: w.y });
        waves.push({ x: p.x / cw, y: 1 - p.y / ch, r: r * sc, w: (10 + r * 0.16) * sc, amp: w.amp * a * 0.03 * this.comfort.shake });
      }
      waves.sort((a, b) => b.amp - a.amp);
    }
    const shake = fx.shakeMag * this.comfort.shake, cf = this.comfort.flash;
    this.post.render(this.canvas, {
      time: rt,
      bloom: this.q.bloom,
      dirtI: this.q.dirt ? 3 : 0,
      thr: 0.5,
      bloomI: 0.78 * (1 + 0.3 * this.beat),
      streakI: 0.55,
      ca: reduced ? 0.0004 : 0.0005 + Math.min(0.006, shake * 0.0004) + fx.flashA * 0.005 * cf + this.wipe * 0.008 * cf,
      glitch: reduced ? 0 : Math.min(1, Math.max(shake > 4.5 ? (shake - 4.5) / 12 : 0, this.wipe * Math.min(1, cf + 0.2))),
      grain: 0.032,
      vig: 0.62,
      scanP: Math.max(2, Math.round(3 * this.dpr)),
      scanH: Math.max(1, Math.round(this.dpr)),
      scanA: 0.1,
      flashA: fx.flashA * (reduced ? 0.15 : 0.42) * cf,
      flashC: this.flashRGB.v,
      waves,
      mood: this.updateMood(game, rt),
      power: reduced ? 1 : this.power,
    });
  }

  // Colour grade follows the moment: cool between waves, hot during the boss, grey on a loss,
  // warm on a win, a red pulse when the Core is critical. Eases toward the target.
  updateMood(game, rt) {
    let sat = 1, con = 1, lift = [0, 0, 0], gain = [1, 1, 1];
    if (game.state === 'lost') { sat = 0.12; con = 1.08; gain = [0.88, 0.9, 0.96]; }
    else if (game.state === 'won') { sat = 1.06; gain = [1.07, 1.02, 0.93]; lift = [0.01, 0.006, 0]; }
    else if (game.boss) { sat = 1.12; con = 1.06; gain = [1.07, 0.97, 1]; lift = [0.012, 0, 0.006]; }
    else if (!this.viewStarted || game.state !== 'wave') { sat = 0.9; gain = [0.95, 1, 1.05]; lift = [0, 0.006, 0.014]; }
    if (game.state === 'wave' && game.lives <= game.maxLives * 0.3) {
      const p = 0.5 + 0.5 * Math.sin(rt * 7);
      lift = [lift[0] + 0.02 * p, lift[1], lift[2]];
      gain = [gain[0] + 0.05 * p, gain[1] - 0.02 * p, gain[2] - 0.02 * p];
    }
    const gr = this.theme.grade;
    if (gr) {
      lift = lift.map((v, i) => v + gr.lift[i]);
      gain = gain.map((v, i) => v * gr.gain[i]);
    }
    const m = this.mood, k = 1 - Math.exp(-(this.rdt || 0.016) * 2.2);
    m.sat += (sat - m.sat) * k; m.con += (con - m.con) * k;
    for (let i = 0; i < 3; i++) { m.lift[i] += (lift[i] - m.lift[i]) * k; m.gain[i] += (gain[i] - m.gain[i]) * k; }
    return m;
  }

  // Screen transitions (WebGL path only): 'power' = CRT power-on, 'glitch' = glitch wipe.
  transition(kind) {
    if (kind === 'power') this.power = 0;
    else if (kind === 'glitch') this.wipe = 1;
  }

  // ── towers: build-in on placement, morph on upgrade ──
  updateForms(game) {
    const f = this.frameNo, now = game.time;
    for (const t of game.towers) {
      let F = this.forms.get(t);
      if (!F) { F = { level: t.level, stats: t.stats, t0: t.spawnT < 1 ? now : -1 }; this.forms.set(t, F); }
      if (t.level > F.level) this.morphs.push({ t, stats: F.stats, level: F.level, t0: now });
      F.level = t.level; F.stats = t.stats; F.seen = f;
    }
    for (const [t, F] of this.forms) if (F.seen !== f) this.forms.delete(t);
    this.morphs = this.morphs.filter((m) => now >= m.t0 && now - m.t0 < 0.5 && this.forms.has(m.t));
  }

  drawTowerAnimated(ctx, t, time) {
    const F = this.forms.get(t), now = this.trailT ?? 0, ang = this.aimAngle(t);
    const b = F && F.t0 >= 0 && !motion.reduced ? clamp01((now - F.t0) / 0.6) : 1;
    if (b < 1) { this.drawBuilding(ctx, t, time, b, ang); return; }
    const m = motion.reduced ? null : this.morphs.find((x) => x.t === t);
    if (m) { this.drawMorph(ctx, t, time, (now - m.t0) / 0.5, m, ang); return; }
    drawTower(ctx, t, time, { angle: ang });
    if (t.level >= 3) this.drawSignature(ctx, t, time);
  }

  // outline traces itself, a scan bar prints the body, then it flickers on with a flash
  drawBuilding(ctx, t, time, b, ang) {
    const col = TOWERS[t.type].color;
    const fa = clamp01((b - 0.3) / 0.45);
    if (fa > 0) {
      const flick = fa < 1 && hash(Math.floor(time * 40) + t.id * 3.1) < 0.4 ? 0.25 : 1;
      ctx.save(); ctx.globalAlpha = fa * flick;
      drawTower(ctx, t, time, { angle: ang, noPop: true });
      ctx.restore();
    }
    const po = clamp01(b / 0.45), fade = 1 - clamp01((b - 0.7) / 0.3);
    ctx.save(); ctx.translate(t.x, t.y);
    add(ctx);
    ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(col, 0.95 * fade);
    ctx.setLineDash([109 * po, 400]); chip(ctx, 15, 5); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = rgba(col, 0.6 * fade);
    ctx.setLineDash([80 * clamp01((b - 0.1) / 0.4), 400]); chip(ctx, 11, 3.5); ctx.stroke();
    ctx.setLineDash([]);
    if (b < 0.8) {
      const sy = -20 + (b / 0.8) * 40;
      ctx.fillStyle = rgba(col, 0.5 * fade); ctx.fillRect(-21, sy - 1, 42, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(-16, sy - 0.5, 32, 1);
    }
    ctx.strokeStyle = rgba(col, 0.8 * fade); ctx.lineWidth = 1.2;
    brackets(ctx, 27 - easeOut(po) * 8, 5); ctx.stroke();
    if (b > 0.7) sprite(ctx, glow(col), 0, 0, 32, (1 - (b - 0.7) / 0.3) * 0.85);
    norm(ctx);
    ctx.restore();
  }

  // the old form tears apart in slices while the new one flickers in behind a rising scan line
  drawMorph(ctx, t, time, p, m, ang) {
    const old = { ...t, stats: m.stats, level: m.level, upgradeFlash: 0 };
    const ep = easeOut(p);
    for (let i = 0; i < 4; i++) {
      const dx = (i % 2 ? 1 : -1) * ep * 14 * (0.5 + hash(i + t.id));
      ctx.save();
      ctx.globalAlpha = (1 - p) ** 1.5 * (hash(Math.floor(time * 30) + i) < 0.2 ? 0.3 : 1);
      ctx.beginPath(); ctx.rect(t.x - 30 + dx, t.y - 22 + i * 11, 60, 11 * (1 - p * 0.6)); ctx.clip();
      ctx.translate(dx, 0);
      drawTower(ctx, old, time, { angle: ang, noPop: true, reflect: true });
      ctx.restore();
    }
    const na = clamp01((p - 0.15) / 0.5);
    if (na > 0) {
      ctx.save();
      ctx.globalAlpha = na * (na < 1 && hash(Math.floor(time * 40) + t.id) < 0.35 ? 0.3 : 1);
      drawTower(ctx, t, time, { angle: ang });
      ctx.restore();
    }
    const col = t.stats.color, sy = t.y + 22 - p * 50;
    add(ctx);
    ctx.fillStyle = rgba(col, 0.6 * (1 - p)); ctx.fillRect(t.x - 24, sy - 1.5, 48, 3);
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - p)})`; ctx.fillRect(t.x - 18, sy - 0.5, 36, 1);
    norm(ctx);
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
        if (!this.tailGrad) {
          this.tailGrad = ctx.createLinearGradient(-34, 0, -3, 0);
          this.tailGrad.addColorStop(0, rgba(PAL.grid, 0)); this.tailGrad.addColorStop(1, rgba(PAL.grid, 0.55));
        }
        ctx.fillStyle = this.tailGrad; ctx.fillRect(-34, -1, 31, 2);
        ctx.fillStyle = rgba(PAL.grid, 0.95); ctx.fillRect(-5, -1, 10, 2);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(1, -0.6, 4, 1.2);
        ctx.restore();
        sprite(ctx, glow(PAL.grid), p.x, p.y, 8, 0.45);
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
    sprite(ctx, aura(col), 0, 0, 70 + Math.sin(rt * 2) * 5 + this.beat * 14, Math.min(1, 0.6 + fl * 0.4 + this.beat * 0.3));
    norm(ctx);

    // heartbeat: a square pulse expanding off the core
    for (let i = 0; i < 2; i++) {
      const hb = (this.hbPhase + i * 0.5) % 1;
      ctx.save(); ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = rgba(col, 0.45 * (1 - hb) ** 2); ctx.lineWidth = 0.6 + 1.4 * (1 - hb);
      square(ctx, 20 + hb * 52); ctx.stroke();
      ctx.restore();
    }
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

    // damage states: fractures spread across the housing and the Core starts to glitch
    const dmg = 1 - health;
    if (dmg > 0.25) {
      const cracks = Math.ceil((dmg - 0.25) * 9);
      add(ctx);
      ctx.lineWidth = 1; ctx.lineJoin = 'miter';
      for (let c = 0; c < cracks; c++) {
        const flick = hash(Math.floor(rt * 12) + c * 5.3) < 0.15 ? 0.25 : 1;
        ctx.strokeStyle = rgba(c % 3 ? PAL.hostile : '#ffffff', (0.35 + 0.35 * dmg) * flick);
        let a = hash(c * 7.1 + 1) * TAU, x = Math.cos(a) * 9, y = Math.sin(a) * 9;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 1; k <= 3; k++) {
          a += (hash(c * 3.3 + k) - 0.5) * 1.6;
          const r = 9 + k * (3 + dmg * 3.5);
          x = Math.cos(a) * r; y = Math.sin(a) * r;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      if (dmg > 0.55) {
        const tick = Math.floor(rt * 16);
        for (let i = 0; i < 4; i++) {
          const h1 = hash(tick * 1.7 + i * 9.1);
          if (h1 > dmg - 0.3) continue;
          ctx.fillStyle = i % 2 ? 'rgba(0,229,255,0.35)' : rgba(PAL.hostile, 0.5);
          ctx.fillRect(-30 + (hash(h1 * 13) - 0.5) * 16, (h1 - 0.5) * 60, 30 + hash(h1 * 5) * 30, 1.5 + hash(h1 * 3) * 3);
        }
      }
      norm(ctx);
    }

    ctx.font = `600 8px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(col, 0.9);
    ctx.fillText(`CORE ${Math.round(health * 100)}%`, 0, 44);
    ctx.restore();
  }

  // Range readout: edge-weighted fill, solid ring and — when active — bearing ticks, a radar
  // sweep, and pings on enemies the sweep passes over. preview = dashed upgrade range.
  drawRange(ctx, x, y, r, color, faint, preview = false) {
    if (preview) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
      ctx.strokeStyle = rgba(color, 0.65); ctx.lineWidth = 1.8;
      ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      return;
    }
    const fg = ctx.createRadialGradient(x, y, 0, x, y, r);
    fg.addColorStop(0, rgba(color, 0)); fg.addColorStop(0.72, rgba(color, faint ? 0.012 : 0.025)); fg.addColorStop(1, rgba(color, faint ? 0.05 : 0.11));
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = rgba(color, faint ? 0.3 : 0.75); ctx.lineWidth = faint ? 1 : 1.3; ctx.stroke();
    if (faint) return;
    const rt = this.lastRt, a0 = (rt * 1.7) % TAU;
    // bearing ticks
    ctx.strokeStyle = rgba(color, 0.5); ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU, l = i % 4 === 0 ? 6 : 3;
      ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(a) * (r - l), y + Math.sin(a) * (r - l));
    }
    ctx.stroke();
    if (motion.reduced) return;
    // sweep: bright leading edge with a fading trail behind it
    add(ctx);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0 - 1.1, a0); ctx.closePath();
    if (ctx.createConicGradient) {
      const cg = ctx.createConicGradient(a0 - 1.1, x, y);
      cg.addColorStop(0, rgba(color, 0)); cg.addColorStop(1.1 / TAU, rgba(color, 0.32)); cg.addColorStop(Math.min(1, 1.1 / TAU + 0.001), rgba(color, 0));
      ctx.fillStyle = cg;
    } else ctx.fillStyle = rgba(color, 0.06);
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.7); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r); ctx.stroke();
    // pings: enemies the sweep just crossed
    const g = this.curGame;
    if (g) for (const e of g.enemies) {
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy > r * r || (e.def.stealth && e.revealT <= 0)) continue;
      const behind = (a0 - Math.atan2(dy, dx) + TAU * 2) % TAU;
      if (behind > 1.2) continue;
      const k = 1 - behind / 1.2;
      ctx.strokeStyle = rgba(color, 0.8 * k); ctx.lineWidth = 1;
      ctx.save(); ctx.translate(e.x, e.y); brackets(ctx, e.radius + 4 + (1 - k) * 6, 3); ctx.stroke(); ctx.restore();
    }
    norm(ctx);
  }

  drawProjectiles(ctx, game, time) {
    add(ctx);
    ctx.lineCap = 'butt';
    for (const p of game.projectiles) {
      if (p.kind === 'bolt') {
        const nx = p.vx / p.speed, ny = p.vy / p.speed, len = 12 * p.size;
        ctx.strokeStyle = rgba(p.color, 0.22); ctx.lineWidth = 1.4 * p.size;
        ctx.beginPath(); ctx.moveTo(p.x - nx * len * 2.6, p.y - ny * len * 2.6); ctx.lineTo(p.x, p.y); ctx.stroke();
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
        const a = p.life / p.max, s = p.size * (1 + (1 - a) * 2.2);
        ctx.globalAlpha = 1;
        sprite(ctx, puff(p.color), p.x, p.y, s * 1.9, a * 0.7);
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
      } else if (p.kind === 'shard') {
        // glowing triangular fragment, tumbling
        const s = p.size;
        ctx.globalAlpha = Math.min(1, a * 1.4);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, s * 0.55); ctx.lineTo(-s * 0.35, -s * 0.6); ctx.closePath();
        ctx.fillStyle = rgba(p.color, 0.3); ctx.fill();
        ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'ember') {
        // hot flickering speck with a soft halo
        const fl = 0.55 + 0.45 * Math.sin(p.rot * 2.3);
        ctx.globalAlpha = a * fl;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.7, p.size * 0.7);
        ctx.globalAlpha = 1;
        sprite(ctx, glow(p.color), p.x, p.y, p.size * 3, a * fl * 0.7);
      }
    }
    ctx.globalAlpha = 1;
    for (const r of fx.rings) {
      const a = r.life / r.max, f = easeOut(1 - a);
      const w = r.width * a + 0.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0.1, r.r0 + (r.r1 - r.r0) * f), 0, TAU);
      ctx.strokeStyle = rgba(r.color, a * 0.2); ctx.lineWidth = w * 3.5; ctx.stroke();
      ctx.strokeStyle = rgba(r.color, a * 0.9); ctx.lineWidth = w; ctx.stroke();
      if (a > 0.5) { ctx.strokeStyle = rgba('#ffffff', (a - 0.5) * 1.6); ctx.lineWidth = Math.max(0.6, w * 0.35); ctx.stroke(); }
    }
    ctx.lineCap = 'round';
    for (const b of fx.beams) {
      const a = b.life / b.max;
      ctx.strokeStyle = rgba(b.color, a * 0.22); ctx.lineWidth = b.width * a * 2.6;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = rgba(b.color, a);
      ctx.lineWidth = b.width * a;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    }
    ctx.lineCap = 'butt';
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
