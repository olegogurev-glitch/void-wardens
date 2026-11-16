// Endless and Daily modes: pure helpers, no DOM (the simulation and the bot sim can use them).
import { MAPS } from './maps.js';
import { MUTATORS, ENDLESS } from './config.js';

// Small seeded PRNG (mulberry32): same seed → same sequence, on every device.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash → 32-bit seed
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// UTC calendar day, e.g. "2026-11-15": the Daily rolls over at 00:00 UTC for everyone, so every
// player in the world gets the same challenge on the same day (Pixo's daily boards use the same day).
// It used to roll over at the player's local midnight; saves from then still read fine (main.js).
export function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
export function prevDayKey(key) {
  return dayKey(new Date(Date.parse(key + 'T00:00:00Z') - 86400000));
}
export function isDayKey(s) {
  const t = typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s + 'T00:00:00Z') : NaN;
  return Number.isFinite(t) && dayKey(new Date(t)) === s;
}

// Today's challenge: one sector and one twist, picked from the date alone, so everyone
// who plays on the same day gets the same board, rule, twist and card seed.
export function dailyFor(key = dayKey()) {
  const seed = hash('void-wardens/' + key);
  const r = mulberry32(seed);
  const map = MAPS[Math.floor(r() * MAPS.length)];
  const ids = Object.keys(MUTATORS);
  const mutator = ids[Math.floor(r() * ids.length)];
  return { key, seed, sectorId: map.id, mutator };
}

// Endless: the sector's own waves first, then generated ones that never stop. Generated
// waves cycle through the sector's last few campaign waves (their timings fit its routes),
// with more malware in the same window each time, and a Leviathan every few waves.
// Deterministic — wave 30 of a sector is the same for everyone.
export function endlessWave(def, w) {
  const L = def.waves.length;
  if (w <= L) return def.waves[w - 1];
  const k = w - L;
  const tpls = def.waves.slice(-ENDLESS.templates);
  let tpl = tpls[(k - 1) % tpls.length].filter((g) => g[0] !== 'boss');
  if (!tpl.length) tpl = def.waves[0];
  const grow = 1 + ENDLESS.countGrowth * k;
  const out = tpl.map(([type, count, interval, delay, path]) => {
    const n = Math.max(1, Math.round(count * grow));
    return [type, n, (interval * count) / n, delay, path];
  });
  // Watchdogs shrug off freezes, stuns and rollback: past the campaign, a growing pack joins every wave
  const span = Math.max(...out.map(([, n, interval, delay]) => delay + n * interval), 4);
  const dogs = Math.round(ENDLESS.watchdogs.base + ENDLESS.watchdogs.per * k);
  out.push(['watchdog', dogs, Math.max(0.4, (span * 0.8) / dogs), 1, 'alt']);
  if (k % ENDLESS.bossEvery === 0) out.unshift(['boss', 1 + Math.floor(k / (ENDLESS.bossEvery * 2)), 6, 1.5, 'alt']);
  return out;
}
