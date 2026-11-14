// Bootstrap: wires the simulation, renderer, UI, audio and input together.
import { WORLD_W, WORLD_H, TILE, TOWERS, TOWER_ORDER, WAVES, towerStats } from './config.js';
import { GameMap } from './map.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { UI, describeWave } from './ui.js';
import { Sfx } from './audio.js';

const canvas = document.getElementById('game');
const viewportEl = document.getElementById('viewport');
const stage = document.getElementById('stage');

const map = new GameMap();
const game = new Game(map);
const sfx = new Sfx();
const renderer = new Renderer(canvas, map);

const store = {
  get(k) { try { return localStorage.getItem('voidwardens.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('voidwardens.' + k, v); } catch { /* storage unavailable */ } },
};

const view = {
  placing: null, placingStats: null, hover: null, selected: null, previewStats: null,
  speed: 1, paused: false, started: false, muted: store.get('muted') === '1',
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
  cancel() { view.placing = null; view.placingStats = null; },
  select(t) {
    view.selected = t;
    view.previewStats = null;
  },
  upgrade(i) {
    const t = view.selected;
    if (!t) return;
    if (!game.upgrade(t, i)) sfx.play('error');
  },
  sell() {
    if (!view.selected) return;
    game.sell(view.selected);
    ctl.select(null);
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
  },
  resume() { if (view.paused) ctl.togglePause(); },
  toggleMute() {
    view.muted = !view.muted;
    sfx.setMuted(view.muted);
    ui.els.mute.classList.toggle('off', view.muted);
    store.set('muted', view.muted ? '1' : '0');
  },
  start() {
    sfx.unlock();
    view.started = true;
    ui.hideOverlay();
    ui.banner('Defend the Core', 'Deploy towers, then run wave 1', '#00e5ff');
  },
  restart() {
    game.reset();
    ui.reset();
    view.placing = null; view.selected = null; view.previewStats = null; view.paused = false;
    ui.els.pause.classList.remove('on');
    view.started = true;
    ui.hideOverlay();
    ui.banner('Defend the Core', 'Deploy towers, then run wave 1', '#00e5ff');
  },
};

const ui = new UI(game, view, ctl);
sfx.setMuted(view.muted);
ui.els.mute.classList.toggle('off', view.muted);

// ── Game events → presentation ───────────────────────────
game.on('sfx', (n) => sfx.play(n));
game.on('wave', (w) => {
  const final = w === WAVES.length;
  ui.banner(final ? 'Final wave' : `Wave ${String(w).padStart(2, '0')}`, final ? 'Leviathan.exe detected' : describeWave(w) + ' inbound', final ? '#ff2a6d' : '#00e5ff');
});
game.on('cleared', ({ bonus }) => ui.banner('Wave purged', `+${bonus} credits`, '#3dff9e'));
game.on('bossDown', () => setTimeout(() => ui.banner('Leviathan.exe terminated', '', '#ffb800'), 1200));
game.on('win', () => setTimeout(() => ui.showOverlay('win', { lives: game.lives, kills: game.kills, towers: game.towers.length }), 1800));
game.on('lose', () => {
  view.placing = null; view.selected = null;
  setTimeout(() => ui.showOverlay('lose', { wave: game.wave, kills: game.kills }), 1800);
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
  else if (view.selected && k === 'q') ctl.upgrade(0);
  else if (view.selected && k === 'e') ctl.upgrade(1);
  else if (view.selected && k === 's') ctl.sell();
});

// ── Loop ─────────────────────────────────────────────────
let last = performance.now();
let realTime = 0;
function frame(now) {
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
  renderer.render(game, view, realTime);
  ui.update(real);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

ui.showOverlay('start');

if (new URLSearchParams(location.search).has('debug')) window.VW = { game, view, ctl, ui, renderer };
