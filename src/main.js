// Bootstrap: wires the simulation, renderer, UI, audio and input together.
import { WORLD_W, WORLD_H, TILE, TOWERS, TOWER_ORDER, DIFFICULTIES, towerStats } from './config.js';
import { GameMap } from './map.js';
import { Game, TARGET_MODES } from './game.js';
import { Renderer, motion } from './render.js';
import { UI, describeWave } from './ui.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { MAPS, mapById } from './maps.js';
import { runIntro } from './intro.js';

const canvas = document.getElementById('game');
const viewportEl = document.getElementById('viewport');
const stage = document.getElementById('stage');

const store = {
  get(k) { try { return localStorage.getItem('voidwardens.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('voidwardens.' + k, v); } catch { /* storage unavailable */ } },
};

let mapDef = mapById(store.get('sector'));
const game = new Game(new GameMap(mapDef), DIFFICULTIES[store.get('difficulty')] ? store.get('difficulty') : 'normal');
const sfx = new Sfx();
const music = new Music(sfx);
// Graphics: the pause menu (or G) picks Auto / High / Medium / Low and it's remembered.
// ?fx=low|medium|high overrides it for one visit; ?fx=2d skips WebGL post-processing entirely.
const fxParam = new URLSearchParams(location.search).get('fx');
const renderer = new Renderer(canvas, game.map, { quality: fxParam || store.get('fx'), post: fxParam !== '2d' });
const FX_MODES = ['auto', 'high', 'medium', 'low'];
// comfort: screen shake and flash strength (0..1), remembered
try { Object.assign(renderer.comfort, JSON.parse(store.get('comfort')) || {}); } catch { /* defaults */ }
const COMFORT_PRESETS = { calm: { shake: 0.25, flash: 0.3 }, full: { shake: 1, flash: 1 } };
const pauseData = () => ({ fx: renderer.mode, tier: renderer.q.name, webgl: !!renderer.post, comfort: renderer.comfort });

function loadSector(id) {
  const def = mapById(id);
  if (def === mapDef) return;
  mapDef = def;
  const map = new GameMap(def);
  game.setMap(map);
  renderer.setMap(map);
}

// Best result per sector and difficulty: { stars } once secured, otherwise { wave } reached.
// Records saved before difficulties existed (key without a difficulty) count as Normal.
const recordKey = (id, diff) => `best.${id}.${diff}`;
function records(diff = game.difficulty) {
  const out = {};
  for (const m of MAPS) {
    let raw = store.get(recordKey(m.id, diff));
    if (!raw && diff === 'normal') raw = store.get('best.' + m.id);
    try { const r = JSON.parse(raw); if (r) out[m.id] = r; } catch { /* ignore */ }
  }
  return out;
}
function saveRecord(result) {
  const prev = records()[mapDef.id];
  const better = !prev || (result.stars || 0) > (prev.stars || 0) || (!prev.stars && !result.stars && result.wave > prev.wave);
  if (better) store.set(recordKey(mapDef.id, game.difficulty), JSON.stringify(result));
}
// stars by share of Core integrity left (difficulties have different maximums)
const starsFor = (lives, max) => (lives >= max * 0.9 ? 3 : lives >= max * 0.5 ? 2 : 1);
const menuData = () => ({ maps: MAPS, records: records(), current: mapDef.id, difficulty: game.difficulty });

// Framed share image: the battlefield plus a title band with sector, difficulty, stars and stats.
function shareCard(shot, r) {
  const W = 1600, H = 1000, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#03050a'; g.fillRect(0, 0, W, H);
  const pad = 28, iw = W - pad * 2, ih = Math.round(iw * shot.height / shot.width);
  g.drawImage(shot, pad, pad, iw, ih);
  const by = pad + ih;
  const band = g.createLinearGradient(0, by, 0, H);
  band.addColorStop(0, 'rgba(0,229,255,0.10)'); band.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = band; g.fillRect(0, by, W, H - by);
  g.strokeStyle = 'rgba(0,229,255,0.35)'; g.lineWidth = 2; g.strokeRect(pad, pad, iw, ih);
  g.strokeStyle = '#00e5ff'; g.lineWidth = 4;
  for (const [x, y, sx, sy] of [[pad, pad, 1, 1], [pad + iw, pad, -1, 1], [pad, pad + ih, 1, -1], [pad + iw, pad + ih, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + sy * 34); g.lineTo(x, y); g.lineTo(x + sx * 34, y); g.stroke();
  }
  const cy = by + (H - by) / 2 + 4;
  g.textBaseline = 'middle';
  g.font = '700 46px "Chakra Petch", sans-serif'; g.textAlign = 'left';
  g.fillStyle = '#eafcff'; g.shadowColor = '#00e5ff'; g.shadowBlur = 18;
  g.fillText('VOID', pad + 6, cy);
  let x = pad + 6 + g.measureText('VOID').width;
  g.fillStyle = '#ff2a6d'; g.shadowColor = '#ff2a6d'; g.fillText('//', x, cy); x += g.measureText('//').width;
  g.fillStyle = '#eafcff'; g.shadowColor = '#00e5ff'; g.fillText('WARDENS', x, cy);
  g.shadowBlur = 0;
  g.textAlign = 'center';
  g.font = '600 22px "JetBrains Mono", monospace'; g.fillStyle = '#9fdcec';
  g.fillText(`${r.sector} · ${r.title}`.toUpperCase(), W / 2, cy - 18);
  g.fillStyle = r.diff.color || '#ffb800';
  g.fillText(`${r.diff.name.toUpperCase()} · CORE ${r.lives}/${r.maxLives} · ${r.kills} KILLS`, W / 2, cy + 18);
  g.textAlign = 'right';
  g.font = '700 44px "Chakra Petch", sans-serif';
  g.fillStyle = '#ffb800'; g.shadowColor = '#ffb800'; g.shadowBlur = 14;
  g.fillText('★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), W - pad - 6, cy);
  g.shadowBlur = 0;
  return c;
}

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
  cancel() { view.placing = null; view.placingStats = null; view.touchPending = null; view.ability = null; },
  // Purge fires instantly; Firewall enters a click-to-place mode
  ability(id) {
    if (!view.started || view.paused || game.over) return;
    if (view.ability === id) { view.ability = null; return; }
    if (!game.abilityReady(id)) { sfx.play('error'); return; }
    if (id === 'purge') { if (!game.usePurge()) sfx.play('error'); return; }
    ctl.cancel();
    ctl.select(null);
    view.ability = id;
    sfx.play('click');
  },
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
    sfx.setPaused(view.paused);
    if (view.paused) ui.showOverlay('pause', pauseData()); else ui.hideOverlay();
    music.duck(view.paused);
  },
  resume() { if (view.paused) ctl.togglePause(); },
  // win screen: framed screenshot → native share sheet where supported, otherwise a PNG download
  async share() {
    if (!lastWin) return;
    sfx.play('click');
    const card = shareCard(renderer.snapshot(game, view), lastWin);
    const blob = await new Promise((res) => card.toBlob(res, 'image/png'));
    if (!blob) return;
    const name = `void-wardens-${mapDef.id}-${game.difficulty}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Void Wardens', text: `${lastWin.sector} cleared on ${lastWin.diff.name} — ${'★'.repeat(lastWin.stars)}` }); } catch { /* cancelled */ }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  setComfort(key, v) {
    if (!(key in renderer.comfort)) return;
    renderer.comfort[key] = Math.max(0, Math.min(1, +v || 0));
    store.set('comfort', JSON.stringify(renderer.comfort));
  },
  comfortPreset(name) {
    const p = COMFORT_PRESETS[name];
    if (!p) return;
    Object.assign(renderer.comfort, p);
    store.set('comfort', JSON.stringify(renderer.comfort));
    sfx.play('click');
    if (view.paused) ui.showOverlay('pause', pauseData());
  },
  setFx(mode) {
    if (!FX_MODES.includes(mode)) return;
    renderer.setMode(mode);
    store.set('fx', mode);
    sfx.play('click');
    if (view.paused) ui.showOverlay('pause', pauseData());
  },
  cycleFx() {
    ctl.setFx(FX_MODES[(FX_MODES.indexOf(renderer.mode) + 1) % FX_MODES.length]);
    if (!view.paused) ui.banner('Graphics · ' + renderer.mode, renderer.mode === 'auto' ? 'adapts to your device' : '', '#00e5ff');
  },
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
    renderer.transition('power');
    sfx.setPaused(false);
    sfx.play('power');
    ui.banner(`${mapDef.name} · ${mapDef.title}`, `${game.diff.name} · Deploy towers, then run wave 1`, game.diff.color);
  },
  // pick a difficulty on the start screen
  difficulty(key) {
    if (view.started || !DIFFICULTIES[key] || key === game.difficulty) return;
    game.setDifficulty(key);
    store.set('difficulty', key);
    sfx.unlock();
    sfx.play('click');
    ui.showOverlay('start', menuData());
  },
  // back to sector select
  menu() {
    view.started = false; view.paused = false;
    view.placing = null; view.selected = null;
    ui.els.pause.classList.remove('on');
    music.duck(false);
    game.reset();
    ui.reset();
    renderer.transition('glitch');
    sfx.setPaused(false);
    sfx.play('wipe');
    ui.showOverlay('start', menuData());
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
game.on('sfx', (n) => (typeof n === 'string' ? sfx.play(n) : sfx.play(n.name, n.x)));
// Boss entrance: slow-mo, push-in on the breach, letterbox, alarm and a name card
game.on('boss', (e) => {
  slowMo(0.2, 2.6);
  renderer.cinematic(e.x, e.y, 2.8);
  ui.bossCard(e.def.name, 'Class-Ω threat · breach integrity failing');
  sfx.play('siren');
});
ui.onCoin = () => sfx.play('coin');

// phone vibration on the big hits (Android; iOS ignores it), off when shake comfort is 0
const haptic = (pattern) => {
  if (navigator.vibrate && renderer.comfort.shake > 0 && window.matchMedia?.('(pointer: coarse)').matches) navigator.vibrate(pattern);
};
game.on('leak', (e) => haptic(e.def.boss ? 220 : 45));
game.on('bossDown', () => haptic([30, 40, 90]));
game.on('lose', () => haptic([80, 60, 220]));
// soft tick when the pointer lands on a control
let hovered = null;
document.addEventListener('pointerover', (ev) => {
  const b = ev.target.closest && ev.target.closest('button, .card, .ability');
  if (b !== hovered) { hovered = b; if (b && ev.pointerType === 'mouse') sfx.play('hover'); }
});
game.on('wave', (w) => {
  const final = w === game.waves.length;
  ui.banner(final ? 'Final wave' : `Wave ${String(w).padStart(2, '0')}`, final ? 'Leviathan.exe detected' : describeWave(game, w) + ' inbound', final ? '#ff2a6d' : '#00e5ff');
});
game.on('cleared', ({ bonus }) => ui.banner('Wave purged', `+${bonus} credits`, '#3dff9e'));
game.on('bossDown', (e) => {
  slowMo(0.3, 1.1);
  if (e) renderer.focus(e.x, e.y, 0.14, 1.3);
  setTimeout(() => ui.banner('Leviathan.exe terminated', '', '#ffb800'), 1200);
});
// the kill that clears a wave lands in slow motion with a push-in on the target
game.on('finalKill', (e) => {
  slowMo(0.25, 0.75);
  renderer.focus(e.x, e.y, 0.1, 0.9);
});
// credits fly from the kill to the HUD counter
game.on('reward', ({ x, y, amount }) => {
  const r = canvas.getBoundingClientRect();
  ui.flyCredits(r.left + (x / WORLD_W) * r.width, r.top + (y / WORLD_H) * r.height, amount);
});
let lastWin = null;
game.on('win', () => {
  slowMo(0.5, 1.2);
  const stars = starsFor(game.lives, game.maxLives);
  saveRecord({ stars, wave: game.wave });
  lastWin = { lives: game.lives, maxLives: game.maxLives, kills: game.kills, towers: game.towers.length, stars, sector: mapDef.name, title: mapDef.title, diff: game.diff };
  setTimeout(() => ui.showOverlay('win', lastWin), 1800);
});
game.on('lose', () => {
  slowMo(0.35, 1.8);
  view.placing = null; view.selected = null;
  saveRecord({ wave: game.wave });
  setTimeout(() => ui.showOverlay('lose', { wave: game.wave, kills: game.kills, sector: mapDef.name, diff: game.diff }), 1800);
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
  canvas.style.cursor = view.placing || view.ability ? 'crosshair' : t ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => { if (!view.placing) view.hover = null; });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('pointerdown', (ev) => {
  if (!view.started || view.paused || game.over) return;
  sfx.unlock();
  const p = toWorld(ev);
  view.hover = p;
  if (ev.button === 2) { ctl.cancel(); ctl.select(null); return; }
  if (view.ability === 'firewall') {
    if (game.useFirewall(p.x, p.y)) view.ability = null; else sfx.play('error');
    return;
  }
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
  if (ev.repeat || view.intro) return;
  const k = ev.key.toLowerCase();
  if (!view.started) { if (k === 'enter' || k === ' ') { ev.preventDefault(); ctl.start(); } return; }
  if (k === 'p' || k === 'escape' && view.paused) { ctl.togglePause(); return; }
  if (k === 'g') { ctl.cycleFx(); return; }
  if (view.paused) return;
  const n = parseInt(k, 10);
  if (n >= 1 && n <= TOWER_ORDER.length) ctl.pickType(TOWER_ORDER[n - 1]);
  else if (k === 'escape') { ctl.cancel(); ctl.select(null); }
  else if (k === ' ') { ev.preventDefault(); ctl.startWave(); }
  else if (k === 'f') ctl.toggleSpeed();
  else if (k === 'm') ctl.toggleMute();
  else if (k === 'n') ctl.toggleMusic();
  else if (k === 'z') ctl.ability('firewall');
  else if (k === 'x') ctl.ability('purge');
  else if (view.selected && k === 'q') ctl.upgrade(0);
  else if (view.selected && k === 'e') ctl.upgrade(1);
  else if (view.selected && k === 's') ctl.sell();
  else if (view.selected && k === 't') ctl.cycleTarget();
});

// ── Loop ─────────────────────────────────────────────────
let last = performance.now();
let realTime = 0;
let lastCount = 0;
// Slow motion: hold `scale` for the first half, then ease back to full speed.
const slow = { t: 0, dur: 0, scale: 1 };
function slowMo(scale, dur) { Object.assign(slow, { t: 0, dur, scale }); }
function timeScale(real) {
  if (slow.t >= slow.dur) return 1;
  slow.t += real;
  const p = Math.min(1, slow.t / slow.dur);
  return p < 0.5 ? slow.scale : slow.scale + (1 - slow.scale) * ((p - 0.5) / 0.5) ** 2;
}
function frame(now) {
  // Schedule first: an exception later in this frame must not freeze the game for good.
  requestAnimationFrame(frame);
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  realTime += real;
  if (view.started && !view.paused) {
    let remaining = real * view.speed * timeScale(real);
    while (remaining > 1e-6) {
      const step = Math.min(remaining, 1 / 60);
      game.update(step);
      remaining -= step;
    }
  }
  music.setLevel(!view.started || game.state !== 'wave' ? 0 : game.boss ? 2 : 1);
  renderer.beat = view.paused ? 0 : music.pulse();
  // final-wave countdown ticks
  const cd = view.started && game.state === 'break' && game.wave === game.waves.length - 1 && game.breakTimer <= 3 ? Math.ceil(game.breakTimer) : 0;
  if (cd && cd !== lastCount) sfx.play('tick');
  lastCount = cd;
  renderer.render(game, view, realTime);
  ui.update(real);
}
requestAnimationFrame(frame);

ui.showOverlay('start', menuData());

// ── Boot console → "Deploy the protection?" → fullscreen, landscape ──
// Fullscreen and orientation lock are only allowed inside a user gesture, so they run
// synchronously in the YES click. Orientation lock works on Android (in fullscreen);
// iPhone Safari can't lock, so a rotate prompt covers portrait instead.
function enterFullscreenLandscape() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
  try {
    Promise.resolve(req.call(el, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => { /* not allowed here (iframe without allowfullscreen, iOS) — play windowed */ });
  } catch { /* old browsers */ }
}
function deploy() {
  enterFullscreenLandscape();
  view.intro = false;
  document.body.classList.add('deployed');
  sfx.unlock();
  sfx.play('power');
  music.setOn(view.musicOn);
  renderer.transition('power');
}
view.intro = new URLSearchParams(location.search).get('intro') !== '0';
if (view.intro) runIntro({ onDeploy: deploy, reduced: motion.reduced });
else document.body.classList.add('deployed');

// Phones in portrait: the rotate prompt covers the game (CSS), and a running wave pauses.
const portraitMq = window.matchMedia?.('(orientation: portrait) and (pointer: coarse)');
portraitMq?.addEventListener?.('change', (e) => {
  if (e.matches && view.started && !view.paused && !game.over) ctl.togglePause();
});

if (new URLSearchParams(location.search).has('debug')) window.VW = { game, view, ctl, ui, renderer, sfx, music };

// Respect the OS "reduce motion" setting (and follow it if it changes mid-session)
const reduceMq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
if (reduceMq) {
  motion.reduced = reduceMq.matches;
  reduceMq.addEventListener?.('change', (e) => (motion.reduced = e.matches));
}
