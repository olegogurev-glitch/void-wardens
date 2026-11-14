// Bootstrap: wires the simulation, renderer, UI, audio and input together.
import { WORLD_W, WORLD_H, TILE, TOWERS, TOWER_ORDER, towerStats } from './config.js';
import { GameMap } from './map.js';
import { Game, TARGET_MODES } from './game.js';
import { Renderer } from './render.js';
import { UI, describeWave } from './ui.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { MAPS, mapById } from './maps.js';

const canvas = document.getElementById('game');
const viewportEl = document.getElementById('viewport');
const stage = document.getElementById('stage');

const store = {
  get(k) { try { return localStorage.getItem('voidwardens.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('voidwardens.' + k, v); } catch { /* storage unavailable */ } },
};

let mapDef = mapById(store.get('sector'));
const game = new Game(new GameMap(mapDef));
const sfx = new Sfx();
const music = new Music(sfx);
const renderer = new Renderer(canvas, game.map);

function loadSector(id) {
  const def = mapById(id);
  if (def === mapDef) return;
  mapDef = def;
  const map = new GameMap(def);
  game.setMap(map);
  renderer.setMap(map);
}

// Best result per sector: { stars } once secured, otherwise { wave } reached
function records() {
  const out = {};
  for (const m of MAPS) { try { const r = JSON.parse(store.get('best.' + m.id)); if (r) out[m.id] = r; } catch { /* ignore */ } }
  return out;
}
function saveRecord(result) {
  const prev = records()[mapDef.id];
  const better = !prev || (result.stars || 0) > (prev.stars || 0) || (!prev.stars && !result.stars && result.wave > prev.wave);
  if (better) store.set('best.' + mapDef.id, JSON.stringify(result));
}
const starsFor = (lives) => (lives >= 18 ? 3 : lives >= 10 ? 2 : 1);

const view = {
  placing: null, placingStats: null, hover: null, selected: null, previewStats: null,
  speed: 1, paused: false, started: false, muted: store.get('muted') === '1',
  musicOn: store.get('music') !== '0',
};

const ctl = {
  pickType(type) {
    if (!view.started || game.over) return;
    if (view.placing === type) { ctl.cancel(); return; }
    if (game.credits < TOWERS[type].cost) { sfx.play('error'); return; }
    view.placing = type;
    view.placingStats = towerStats(type, []);
    ctl.select(null);
    sfx.play('click');
  },
  cancel() { view.placing = null; view.placingStats = null; view.touchPending = null; },
  select(t) {
    view.selected = t;
    view.previewStats = null;
    view.sellArm = null;
  },
  upgrade(i) {
    const t = view.selected;
    if (!t) return;
    if (!game.upgrade(t, i)) sfx.play('error');
  },
  target(mode) {
    if (view.selected) game.setTargeting(view.selected, mode);
  },
  cycleTarget() {
    const t = view.selected;
    if (!t || t.stats.kind === 'pulse' || t.stats.kind === 'nova') return;
    game.setTargeting(t, TARGET_MODES[(TARGET_MODES.indexOf(t.targeting) + 1) % TARGET_MODES.length]);
  },
  // Selling takes two presses (button or S) within 2.5s, so a stray key can't wipe a tower.
  sell() {
    const t = view.selected;
    if (!t) return;
    const now = performance.now();
    if (view.sellArm && view.sellArm.id === t.id && now < view.sellArm.until) {
      game.sell(t);
      ctl.select(null);
    } else {
      view.sellArm = { id: t.id, until: now + 2500 };
      sfx.play('click');
    }
  },
  startWave() {
    if (!view.started || view.paused) return;
    if (game.startWave()) sfx.unlock();
  },
  toggleSpeed() {
    view.speed = view.speed === 1 ? 2 : view.speed === 2 ? 3 : 1;
    ui.els.speed.textContent = view.speed + '×';
    ui.els.speed.classList.toggle('on', view.speed > 1);
  },
  togglePause() {
    if (!view.started || game.over) return;
    view.paused = !view.paused;
    ui.els.pause.classList.toggle('on', view.paused);
    if (view.paused) ui.showOverlay('pause'); else ui.hideOverlay();
    music.duck(view.paused);
  },
  resume() { if (view.paused) ctl.togglePause(); },
  toggleMute() {
    view.muted = !view.muted;
    sfx.setMuted(view.muted);
    ui.els.mute.classList.toggle('off', view.muted);
    store.set('muted', view.muted ? '1' : '0');
  },
  toggleMusic() {
    view.musicOn = !view.musicOn;
    sfx.unlock();
    music.setOn(view.musicOn);
    ui.els.music.classList.toggle('off', !view.musicOn);
    store.set('music', view.musicOn ? '1' : '0');
  },
  // start a sector from the menu (id) or replay the current one
  start(id = mapDef.id) {
    sfx.unlock();
    music.setOn(view.musicOn);
    loadSector(id);
    store.set('sector', mapDef.id);
    ctl.restart();
  },
  restart() {
    game.reset();
    ui.reset();
    view.placing = null; view.selected = null; view.previewStats = null; view.paused = false;
    ui.els.pause.classList.remove('on');
    view.started = true;
    ui.hideOverlay();
    ui.banner(`${mapDef.name} · ${mapDef.title}`, 'Deploy towers, then run wave 1', mapDef.difficulty === 'Hard' ? '#ff2a6d' : '#00e5ff');
  },
  // back to sector select
  menu() {
    view.started = false; view.paused = false;
    view.placing = null; view.selected = null;
    ui.els.pause.classList.remove('on');
    music.duck(false);
    game.reset();
    ui.reset();
    ui.showOverlay('start', { maps: MAPS, records: records(), current: mapDef.id });
  },
  preview(id) {
    if (!view.started && id) loadSector(id);
  },
};

const ui = new UI(game, view, ctl);
sfx.setMuted(view.muted);
ui.els.mute.classList.toggle('off', view.muted);
ui.els.music.classList.toggle('off', !view.musicOn);

// ── Game events → presentation ───────────────────────────
game.on('sfx', (n) => sfx.play(n));
game.on('wave', (w) => {
  const final = w === game.waves.length;
  ui.banner(final ? 'Final wave' : `Wave ${String(w).padStart(2, '0')}`, final ? 'Leviathan.exe detected' : describeWave(game.waves, w) + ' inbound', final ? '#ff2a6d' : '#00e5ff');
});
game.on('cleared', ({ bonus }) => ui.banner('Wave purged', `+${bonus} credits`, '#3dff9e'));
game.on('bossDown', () => setTimeout(() => ui.banner('Leviathan.exe terminated', '', '#ffb800'), 1200));
game.on('win', () => {
  const stars = starsFor(game.lives);
  saveRecord({ stars, wave: game.wave });
  setTimeout(() => ui.showOverlay('win', { lives: game.lives, kills: game.kills, towers: game.towers.length, stars, sector: mapDef.name }), 1800);
});
game.on('lose', () => {
  view.placing = null; view.selected = null;
  saveRecord({ wave: game.wave });
  setTimeout(() => ui.showOverlay('lose', { wave: game.wave, kills: game.kills, sector: mapDef.name }), 1800);
});

// ── Layout ───────────────────────────────────────────────
function fit() {
  const r = stage.getBoundingClientRect();
  const s = Math.min(r.width / WORLD_W, r.height / WORLD_H);
  const w = Math.max(1, Math.floor(WORLD_W * s)), h = Math.max(1, Math.floor(WORLD_H * s));
  Object.assign(viewportEl.style, { width: w + 'px', height: h + 'px', left: Math.floor((r.width - w) / 2) + 'px', top: Math.floor((r.height - h) / 2) + 'px' });
  viewportEl.style.setProperty('--k', s);
  renderer.resize(w, h, Math.min(window.devicePixelRatio || 1, 2));
  ui.positionPanel();
}
new ResizeObserver(fit).observe(stage);
fit();

// ── Input ────────────────────────────────────────────────
function toWorld(ev) {
  const r = canvas.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * WORLD_W;
  const y = ((ev.clientY - r.top) / r.height) * WORLD_H;
  return { x, y, c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}

canvas.addEventListener('pointermove', (ev) => {
  view.hover = toWorld(ev);
  const t = game.towerAt(view.hover.c, view.hover.r);
  canvas.style.cursor = view.placing ? 'crosshair' : t ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => { if (!view.placing) view.hover = null; });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('pointerdown', (ev) => {
  if (!view.started || view.paused || game.over) return;
  sfx.unlock();
  const p = toWorld(ev);
  view.hover = p;
  if (ev.button === 2) { ctl.cancel(); ctl.select(null); return; }
  if (view.placing) {
    const type = view.placing;
    if (game.canPlace(type, p.c, p.r)) {
      // Touch has no hover: first tap previews (ghost + range), second tap on the same tile deploys.
      const key = p.c + ',' + p.r;
      if (ev.pointerType === 'touch' && view.touchPending !== key) {
        view.touchPending = key;
        sfx.play('click');
        return;
      }
      view.touchPending = null;
      game.place(type, p.c, p.r);
      if (!ev.shiftKey || game.credits < TOWERS[type].cost) ctl.cancel();
    } else {
      const existing = game.towerAt(p.c, p.r);
      if (existing) { ctl.cancel(); ctl.select(existing); } else sfx.play('error');
    }
    return;
  }
  const t = game.towerAt(p.c, p.r);
  ctl.select(t && t === view.selected ? null : t);
});

window.addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  const k = ev.key.toLowerCase();
  if (!view.started) { if (k === 'enter' || k === ' ') { ev.preventDefault(); ctl.start(); } return; }
  if (k === 'p' || k === 'escape' && view.paused) { ctl.togglePause(); return; }
  if (view.paused) return;
  const n = parseInt(k, 10);
  if (n >= 1 && n <= TOWER_ORDER.length) ctl.pickType(TOWER_ORDER[n - 1]);
  else if (k === 'escape') { ctl.cancel(); ctl.select(null); }
  else if (k === ' ') { ev.preventDefault(); ctl.startWave(); }
  else if (k === 'f') ctl.toggleSpeed();
  else if (k === 'm') ctl.toggleMute();
  else if (k === 'n') ctl.toggleMusic();
  else if (view.selected && k === 'q') ctl.upgrade(0);
  else if (view.selected && k === 'e') ctl.upgrade(1);
  else if (view.selected && k === 's') ctl.sell();
  else if (view.selected && k === 't') ctl.cycleTarget();
});

// ── Loop ─────────────────────────────────────────────────
let last = performance.now();
let realTime = 0;
function frame(now) {
  // Schedule first: an exception later in this frame must not freeze the game for good.
  requestAnimationFrame(frame);
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  realTime += real;
  if (view.started && !view.paused) {
    let remaining = real * view.speed;
    while (remaining > 1e-6) {
      const step = Math.min(remaining, 1 / 60);
      game.update(step);
      remaining -= step;
    }
  }
  music.setLevel(!view.started || game.state !== 'wave' ? 0 : game.boss ? 2 : 1);
  renderer.render(game, view, realTime);
  ui.update(real);
}
requestAnimationFrame(frame);

ui.showOverlay('start', { maps: MAPS, records: records(), current: mapDef.id });

if (new URLSearchParams(location.search).has('debug')) window.VW = { game, view, ctl, ui, renderer, sfx, music };
