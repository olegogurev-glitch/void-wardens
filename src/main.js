// Bootstrap: wires the simulation, renderer, UI, audio and input together.
import { WORLD_W, WORLD_H, TILE, TOWERS, TOWER_ORDER, DIFFICULTIES, DIFFICULTY_ORDER, RESEARCH, MEDALS, MEDAL_DATA, ACHIEVEMENTS, MUTATORS, DAILY_DIFFICULTY, dataEarned, towerStats } from './config.js';
import { GameMap } from './map.js';
import { Game, TARGET_MODES } from './game.js';
import { Renderer, motion } from './render.js';
import { UI, describeWave } from './ui.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { MAPS, mapById, TUTORIAL } from './maps.js';
import { Tutor } from './tutorial.js';
import { runIntro } from './intro.js';
import { dailyFor, dayKey, prevDayKey, isDayKey } from './modes.js';
import { t as T, fmt, count, setLang, translatePage } from './i18n.js';

translatePage();

const canvas = document.getElementById('game');
const viewportEl = document.getElementById('viewport');
const stage = document.getElementById('stage');
const dockEl = document.getElementById('dock');

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
const urlParams = new URLSearchParams(location.search);
const fxParam = urlParams.get('fx');
const renderer = new Renderer(canvas, game.map, { quality: fxParam || store.get('fx'), post: fxParam !== '2d' });
const FX_MODES = ['auto', 'high', 'medium', 'low'];
// comfort: screen shake and flash strength (0..1), remembered
try { Object.assign(renderer.comfort, JSON.parse(store.get('comfort')) || {}); } catch { /* defaults */ }
const COMFORT_PRESETS = { calm: { shake: 0.25, flash: 0.3 }, full: { shake: 1, flash: 1 } };
const pauseData = () => ({ fx: renderer.mode, tier: renderer.q.name, webgl: !!renderer.post, comfort: renderer.comfort });

function loadSector(id) { loadDef(mapById(id)); }
function loadDef(def) {
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

// ── Campaign: sectors unlock in order; one clear on any difficulty opens the next ──
const unlockAll = new URLSearchParams(location.search).has('unlock');
function cleared(id) {
  return DIFFICULTY_ORDER.some((d) => {
    let raw = store.get(recordKey(id, d));
    if (!raw && d === 'normal') raw = store.get('best.' + id);
    try { const r = JSON.parse(raw); return !!(r && r.stars); } catch { return false; }
  });
}
const isUnlocked = (id) => {
  const i = MAPS.findIndex((m) => m.id === id);
  return unlockAll || i <= 0 || cleared(MAPS[i - 1].id);
};
const menuData = () => {
  const unlocked = {}, done = {}, endlessOpen = {};
  for (const m of MAPS) { unlocked[m.id] = isUnlocked(m.id); done[m.id] = cleared(m.id); endlessOpen[m.id] = unlockAll || done[m.id]; }
  const d = dailyToday();
  return { mode: view.mode, tutNew: store.get('tutorial') !== '1', tutorialMap: TUTORIAL, maps: MAPS, records: records(), current: view.menuSel || mapDef.id, difficulty: menuDifficulty(), unlocked, cleared: done, data: research.data, labNew: RESEARCH.some((b) => b.nodes.some((n) => research.canBuy(n.id))),
    medals: Object.fromEntries(MAPS.map((m) => [m.id, medalsOf(m.id)])), medalDefs: MEDALS, ach: [achOwned().length, ACHIEVEMENTS.length],
    endless: endlessRecords(), endlessOpen,
    daily: { ...d, map: mapById(d.sectorId), mut: MUTATORS[d.mutator], diff: DIFFICULTIES[DAILY_DIFFICULTY], rec: dailyRecord() } };
};
// the difficulty picked on the start screen (the Daily plays its own fixed one meanwhile)
const menuDifficulty = () => (DIFFICULTIES[store.get('difficulty')] ? store.get('difficulty') : 'normal');

// ── Pixo (pixoarcade.com) runs the game in a frame and puts Endless runs (one board per
// difficulty) and Daily runs (its daily board, with the day played) on its leaderboards: tell it
// when a run starts and ends. Does nothing when the game runs on its own.
function pixoRun(type, data, board = `endless-${game.difficulty}`) {
  if (window.parent === window) return;
  try { window.parent.postMessage({ pixo: type, board, ...data }, location.origin); } catch (e) { /* not hosted */ }
}

// ── Endless: best wave (then score) per sector and difficulty ──
const endlessKey = (id, diff) => `endless.${id}.${diff}`;
const endlessRecords = (diff = menuDifficulty()) => Object.fromEntries(MAPS.map((m) => [m.id, readJSON(endlessKey(m.id, diff), null)]).filter(([, r]) => r));
function saveEndless(rec) {
  const prev = readJSON(endlessKey(mapDef.id, game.difficulty), null);
  const better = !prev || rec.wave > prev.wave || (rec.wave === prev.wave && rec.score > prev.score);
  if (better) store.set(endlessKey(mapDef.id, game.difficulty), JSON.stringify(rec));
  return { prev, better };
}

// ── Daily challenge: today's best score, runs, and the day streak ──
// { day, best, runs, streak, last } — `last` is the last day a run was finished.
// Days are UTC days. Pixo opens the game with ?daily=<day> to play that day's challenge.
const askedDay = isDayKey(urlParams.get('daily')) ? urlParams.get('daily') : null;
const todayKey = () => askedDay || dayKey();
const dailyToday = () => dailyFor(todayKey());
// Saves from before the switch to UTC days may carry a local day up to a day ahead of the UTC one
// (players east of Greenwich after their midnight): that day counts as today, so nobody loses a
// record or a streak over the switch.
function dailySaved() {
  const r = readJSON('daily', {}), today = todayKey();
  const clamp = (d) => (typeof d === 'string' && d > today ? today : d);
  return { r: { ...r, day: clamp(r.day), last: clamp(r.last) }, today };
}
function dailyRecord() {
  const { r, today } = dailySaved();
  const streak = r.last === today || r.last === prevDayKey(today) ? r.streak || 0 : 0; // a missed day breaks it
  return r.day === today ? { best: r.best || 0, runs: r.runs || 0, streak } : { best: 0, runs: 0, streak };
}
function saveDaily(score) {
  const { r, today } = dailySaved();
  const fresh = r.day !== today;
  const prevBest = fresh ? 0 : r.best || 0;
  const streak = r.last === today ? r.streak || 1 : r.last === prevDayKey(today) ? (r.streak || 0) + 1 : 1;
  const next = { day: today, best: Math.max(prevBest, score), runs: (fresh ? 0 : r.runs || 0) + 1, streak, last: today };
  store.set('daily', JSON.stringify(next));
  return { ...next, prevBest, newBest: score > prevBest, firstToday: r.last !== today };
}
// ── Research: Data balance + owned nodes, remembered; perks apply when a run starts ──
const research = {
  get data() { return Math.max(0, parseInt(store.get('data'), 10) || 0); },
  set data(v) { store.set('data', String(Math.max(0, Math.round(v)))); },
  get owned() { try { return JSON.parse(store.get('research')) || []; } catch { return []; } },
  set owned(list) { store.set('research', JSON.stringify(list)); },
  perks() {
    const out = {}, own = new Set(this.owned);
    for (const b of RESEARCH) for (const n of b.nodes) if (own.has(n.id)) Object.assign(out, n.perk);
    return out;
  },
  // a node is buyable when the one before it in its branch is owned
  canBuy(id) {
    const own = new Set(this.owned);
    for (const b of RESEARCH) {
      const i = b.nodes.findIndex((n) => n.id === id);
      if (i >= 0) return !own.has(id) && (i === 0 || own.has(b.nodes[i - 1].id)) && this.data >= b.nodes[i].cost;
    }
    return false;
  },
};
const labData = () => ({ data: research.data, owned: research.owned });
function payData(won, stars = 0) {
  const earned = dataEarned({ wavesCleared: won ? game.totalWaves : Math.max(0, game.wave - 1), won, stars, difficulty: game.difficulty, sectorIndex: MAPS.indexOf(mapDef) });
  research.data = research.data + earned;
  return { earned, total: research.data };
}

// ── Medals, lifetime stats and achievements (all remembered) ──
const readJSON = (k, d) => { try { return JSON.parse(store.get(k)) ?? d; } catch { return d; } };
const medalsOf = (id) => readJSON('medals', {})[id] || [false, false, false];
const medalCount = () => Object.values(readJSON('medals', {})).reduce((n, a) => n + a.filter(Boolean).length, 0);
const STATS0 = { kills: 0, cards: 0, types: [], bosses: 0, evolved: 0, purgeBest: 0, wins: 0, nightmareWins: 0, endlessBest: 0, dailies: 0, streakBest: 0 };
const stats = () => ({ ...STATS0, ...readJSON('stats', {}) });
// lifetime stats plus the run in progress (folded in once, when the run ends)
function liveStats() {
  const s = stats(), r = game.run;
  if (!r || r.committed) return s;
  return { ...s, kills: s.kills + game.kills, cards: s.cards + game.picked.length, types: [...new Set([...s.types, ...r.types])],
    bosses: s.bosses + (r.bosses || 0), evolved: s.evolved + (r.maxLevel >= 3 ? 1 : 0), purgeBest: Math.max(s.purgeBest, r.purgeKills) };
}
function commitRun(result) {
  const r = game.run;
  if (game.mode === 'tutorial') return; // training keeps no stats
  if (!view.started || !r || r.committed) return;
  const s = liveStats();
  if (result && result.won) { s.wins++; if (result.difficulty === 'nightmare') s.nightmareWins++; }
  if (result && result.endlessWave) s.endlessBest = Math.max(s.endlessBest, result.endlessWave);
  if (result && result.daily) { if (result.daily.firstToday) s.dailies++; s.streakBest = Math.max(s.streakBest, result.daily.streak); }
  r.committed = true;
  store.set('stats', JSON.stringify(s));
}
const achOwned = () => readJSON('ach', []);
function achContext(result = null) {
  const sectors = {};
  for (const m of MAPS) sectors[m.id] = cleared(m.id);
  return { stats: liveStats(), run: game.run || {}, result, cleared: Object.values(sectors).filter(Boolean).length, sectors, medals: medalCount(), research: research.owned.length };
}
// unlock anything newly true; each fires a toast
function checkAchievements(result = null) {
  if (game.mode === 'tutorial') return;
  const owned = new Set(achOwned()), c = achContext(result);
  const fresh = ACHIEVEMENTS.filter((a) => !owned.has(a.id) && a.check(c));
  if (!fresh.length) return;
  store.set('ach', JSON.stringify([...owned, ...fresh.map((a) => a.id)]));
  fresh.forEach((a, i) => setTimeout(() => { ui.toast(a); sfx.play('achieve'); }, i * 900));
}
// medals: checked on a win (Normal or harder); new ones pay Data
function awardMedals() {
  if (game.difficulty === 'easy' || !mapDef.medals) return [];
  const r = game.run, run = { leaks: game.leaks, maxTowers: r.maxTowers, types: r.types.size, maxLevel: r.maxLevel, abilities: r.abilities, autoStarts: r.autoStarts };
  const all = readJSON('medals', {}), had = all[mapDef.id] || [false, false, false];
  const now = mapDef.medals.map(([k, n], i) => had[i] || MEDALS[k].check(run, n));
  const fresh = now.map((v, i) => v && !had[i]);
  all[mapDef.id] = now;
  store.set('medals', JSON.stringify(all));
  const gained = fresh.filter(Boolean).length;
  if (gained) research.data = research.data + gained * MEDAL_DATA;
  return mapDef.medals.map(([k, n], i) => ({ name: MEDALS[k].name, desc: MEDALS[k].desc(n), earned: now[i], fresh: fresh[i] }));
}
const achData = () => {
  const owned = new Set(achOwned()), c = achContext();
  return { list: ACHIEVEMENTS.map((a) => ({ ...a, done: owned.has(a.id), prog: a.goal ? Math.min(a.goal, a.progress(c)) : null })) };
};

// towers from the campaign unlock once their sector has been cleared (any difficulty)
const towerOpen = (type) => unlockAll || game.mode === 'daily' || !TOWERS[type].unlock || cleared(TOWERS[type].unlock);
function refreshTowerLocks() {
  const locks = {};
  for (const t of TOWER_ORDER) locks[t] = towerOpen(t) ? null : mapById(TOWERS[t].unlock);
  ui.setTowerLocks(locks);
}
// a remembered sector that is no longer open (e.g. cleared storage) falls back to the furthest open one
if (!isUnlocked(mapDef.id)) loadSector([...MAPS].reverse().find((m) => isUnlocked(m.id)).id);

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
  g.font = '700 46px "Chakra Petch", "Exo 2", sans-serif'; g.textAlign = 'left';
  g.fillStyle = '#eafcff'; g.shadowColor = '#00e5ff'; g.shadowBlur = 18;
  g.fillText('VOID', pad + 6, cy);
  let x = pad + 6 + g.measureText('VOID').width;
  g.fillStyle = '#ff2a6d'; g.shadowColor = '#ff2a6d'; g.fillText('//', x, cy); x += g.measureText('//').width;
  g.fillStyle = '#eafcff'; g.shadowColor = '#00e5ff'; g.fillText('WARDENS', x, cy);
  g.shadowBlur = 0;
  g.textAlign = 'center';
  g.font = '600 22px "JetBrains Mono", monospace'; g.fillStyle = '#9fdcec';
  g.fillText(r.top.toUpperCase(), W / 2, cy - 18);
  g.fillStyle = r.color || '#ffb800';
  g.fillText(r.bottom.toUpperCase(), W / 2, cy + 18);
  g.textAlign = 'right';
  g.font = `700 ${r.badge.length > 8 ? 36 : 44}px "Chakra Petch", "Exo 2", sans-serif`;
  g.fillStyle = '#ffb800'; g.shadowColor = '#ffb800'; g.shadowBlur = 14;
  g.fillText(r.badge, W - pad - 6, cy);
  g.shadowBlur = 0;
  return c;
}

const MENU_TABS = ['training', 'campaign', 'endless', 'daily'];
const view = {
  placing: null, placingStats: null, hover: null, selected: null, previewStats: null,
  speed: 1, paused: false, started: false, muted: store.get('muted') === '1',
  musicOn: store.get('music') !== '0',
  // start-screen tab (opened with ?daily from Pixo's "Challenge of the day": the Daily tab)
  // a newcomer (no tab picked yet, training never finished) lands on Training
  mode: askedDay ? 'daily' : MENU_TABS.includes(store.get('mode')) ? store.get('mode') : store.get('tutorial') === '1' ? 'campaign' : 'training',
};

const ctl = {
  pickType(type) {
    if (!view.started || game.over) return;
    if (!towerOpen(type)) { sfx.play('error'); return; }
    if (view.placing === type) { ctl.cancel(); return; }
    if (game.credits < TOWERS[type].cost) { sfx.play('error'); return; }
    view.placing = type;
    view.placingStats = game.statsFor(type, []);
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
    if (!tutor.allowsWave()) { sfx.play('error'); return; } // training: the coach calls the waves
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
  // research lab (from the campaign screen)
  lab() {
    if (view.started) return;
    sfx.unlock(); sfx.play('click');
    ui.showOverlay('lab', labData());
  },
  labBack() { sfx.play('click'); ui.showOverlay('start', menuData()); },
  achievements() { if (view.started) return; sfx.unlock(); sfx.play('click'); ui.showOverlay('ach', achData()); },
  buy(id) {
    if (view.started || !research.canBuy(id)) { sfx.play('error'); return; }
    const node = RESEARCH.flatMap((b) => b.nodes).find((n) => n.id === id);
    research.data = research.data - node.cost;
    research.owned = [...research.owned, id];
    sfx.play('upgrade');
    ui.showOverlay('lab', { ...labData(), fresh: id });
    checkAchievements();
  },
  rerollCards() {
    if (!view.started || view.paused || !game.reroll()) sfx.play('error');
  },
  chooseCard(i) {
    if (!view.started || view.paused || !game.offer) return;
    game.choose(i);
  },
  // result screens: framed screenshot → native share sheet where supported, otherwise a PNG download
  async share() {
    const sh = lastWin && lastWin.share;
    if (!sh) return;
    sfx.play('click');
    const card = shareCard(renderer.snapshot(game, view), sh);
    const blob = await new Promise((res) => card.toBlob(res, 'image/png'));
    if (!blob) return;
    const name = `void-wardens-${sh.file}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Void Wardens', text: sh.text }); } catch { /* cancelled */ }
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
    if (!view.paused) ui.banner(T('Graphics · {mode}', { mode: T(renderer.mode) }), renderer.mode === 'auto' ? T('adapts to your device') : '', '#00e5ff');
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
  // Training: the guided run on its own little map (menu button)
  tutorial() {
    if (view.started) return;
    sfx.unlock(); sfx.play('click');
    view.menuSel = view.menuSel || (mapDef === TUTORIAL ? MAPS[0].id : mapDef.id);
    Object.assign(game, { mode: 'tutorial', mutator: null, seed: null, difficulty: 'easy' });
    music.setOn(view.musicOn);
    loadDef(TUTORIAL);
    ctl.restart();
  },
  // training finished → straight into Sector 01
  campaign() {
    view.mode = 'campaign';
    store.set('mode', 'campaign');
    ctl.start(MAPS[0].id, 'campaign');
  },
  // start-screen tabs: Campaign · Endless · Daily
  mode(m) {
    if (view.started || !MENU_TABS.includes(m) || m === view.mode) return;
    view.mode = m;
    store.set('mode', m);
    sfx.unlock(); sfx.play('click');
    view.menuSel = view.menuSel || (mapDef === TUTORIAL ? MAPS[0].id : mapDef.id);
    if (m === 'training') loadDef(TUTORIAL); // its map shows behind the menu
    else if (m === 'daily') { view.menuSel = view.menuSel || mapDef.id; loadSector(dailyToday().sectorId); }
    else if (isUnlocked(view.menuSel || mapDef.id)) loadSector(view.menuSel || mapDef.id);
    ui.showOverlay('start', menuData());
  },
  // start a run from the menu (the tab decides the mode) or from a result screen ("Next sector": a campaign id)
  start(id, mode) {
    mode = mode || (view.started ? game.mode : view.mode);
    if (mode === 'training' || mode === 'tutorial') { ctl.tutorial(); return; }
    sfx.unlock();
    if (mode === 'daily') {
      const d = dailyToday();
      id = d.sectorId;
      Object.assign(game, { mode, mutator: d.mutator, seed: d.seed, difficulty: DAILY_DIFFICULTY });
    } else {
      id = id || view.menuSel || mapDef.id;
      const open = mode === 'endless' ? unlockAll || cleared(id) : isUnlocked(id);
      if (!open) { sfx.play('error'); return; }
      view.menuSel = id;
      Object.assign(game, { mode, mutator: null, seed: null, difficulty: menuDifficulty() });
      store.set('sector', id);
    }
    music.setOn(view.musicOn);
    loadSector(id);
    ctl.restart();
  },
  restart() {
    commitRun(null);
    game.perks = game.mode === 'daily' || game.mode === 'tutorial' ? {} : research.perks(); // the Daily is the same for everyone
    game.reset();
    if (game.mode === 'tutorial') tutor.start(); else tutor.stop();
    refreshTowerLocks();
    ui.reset();
    view.placing = null; view.selected = null; view.previewStats = null; view.paused = false;
    ui.els.pause.classList.remove('on');
    view.started = true;
    if (game.endless) pixoRun('run-start');
    else if (game.mode === 'daily') pixoRun('run-start', { day: dailyToday().key }, 'daily');
    ui.hideOverlay();
    renderer.transition('power');
    sfx.setPaused(false);
    sfx.play('power');
    const rule = game.rule;
    ui.setRule(rule);
    ui.hideCards();
    ui.renderPicked([]);
    if (game.mode === 'daily') ui.banner(T('Daily · {title}', { title: mapDef.title }), T('Twist: {name} — {desc}', game.mut), game.mut.color);
    else if (game.mode === 'tutorial') ui.banner(T('Training'), T('Follow the coach · every mechanic, step by step'), '#ffb800');
    else {
      const where = `${mapDef.name} · ${mapDef.title}`;
      const how = rule ? T('Rule: {name} — {desc}', rule) : T(game.endless ? 'The waves never stop · how far can you hold?' : 'Deploy towers, then run wave 1');
      ui.banner(game.endless ? T('Endless · {name}', { name: where }) : where, `${game.diff.name} · ${how}`, game.diff.color);
    }
  },
  // language (start screen only: switching reloads the page)
  lang(l) { if (!view.started) setLang(l); },
  // pick a difficulty on the start screen
  difficulty(key) {
    if (view.started || !DIFFICULTIES[key] || (key === menuDifficulty() && key === game.difficulty)) return;
    game.setDifficulty(key);
    store.set('difficulty', key);
    sfx.unlock();
    sfx.play('click');
    ui.showOverlay('start', menuData());
  },
  // back to sector select
  menu() {
    commitRun(null);
    tutor.stop();
    view.started = false; view.paused = false;
    view.placing = null; view.selected = null;
    ui.els.pause.classList.remove('on');
    music.duck(false);
    Object.assign(game, { mode: 'campaign', mutator: null, seed: null, difficulty: menuDifficulty() });
    if (view.mode === 'training') loadDef(TUTORIAL);
    else if (mapDef === TUTORIAL) loadSector(view.mode === 'daily' ? dailyToday().sectorId : view.menuSel || store.get('sector'));
    if (view.mode !== 'daily' && view.mode !== 'training' && game.map.def.id !== (view.menuSel || mapDef.id) && isUnlocked(view.menuSel || mapDef.id)) loadSector(view.menuSel || mapDef.id);
    game.reset();
    refreshTowerLocks();
    ui.reset();
    renderer.transition('glitch');
    ui.setRule(null);
    ui.hideCards();
    ui.renderPicked([]);
    sfx.setPaused(false);
    sfx.play('wipe');
    ui.showOverlay('start', menuData());
  },
  // hovering a sector shows its map behind the menu (locked ones stay dark)
  preview(id) {
    if (!view.started && view.mode !== 'daily' && view.mode !== 'training' && id && isUnlocked(id)) loadSector(id);
  },
  // select a sector on the campaign screen (locked ones show what it takes to open them)
  pick(id) {
    if (view.started || !mapById(id) || view.menuSel === id) return;
    view.menuSel = id;
    sfx.unlock();
    sfx.play('click');
    if (isUnlocked(id)) { loadSector(id); store.set('sector', id); }
    ui.showOverlay('start', menuData());
  },
};

const ui = new UI(game, view, ctl);
const tutor = new Tutor({ game, view, ui, ctl, canvas, viewport: viewportEl, sfx });
sfx.setMuted(view.muted);
ui.els.mute.classList.toggle('off', view.muted);
ui.els.music.classList.toggle('off', !view.musicOn);

// ── Game events → presentation ───────────────────────────
game.on('sfx', (n) => (typeof n === 'string' ? sfx.play(n) : sfx.play(n.name, n.x)));
// Boss entrance: slow-mo, push-in on the breach, letterbox, alarm and a name card
game.on('boss', (e) => {
  slowMo(0.2, 2.6);
  renderer.cinematic(e.x, e.y, 2.8);
  ui.bossCard(e.def.name, T('Class-Ω threat · breach integrity failing'));
  sfx.play('siren');
});
ui.onCoin = () => sfx.play('coin');
// storm lightning → thunder rolls in a moment later
renderer.onThunder = () => setTimeout(() => sfx.play('thunder'), 250 + Math.random() * 900);
game.on('strike', ({ x, y }) => renderer.strike(x, y));
// upgrade cards: deal the offer, then animate the chosen one into the strip
let lastOffer = [];
game.on('offer', (offer) => { lastOffer = offer; ctl.cancel(); ui.showCards(offer); sfx.play('deal'); });
game.on('picked', (card) => ui.pickCard(lastOffer.indexOf(card), game.picked));
// live achievement moments
game.on('bossDown', () => { game.run.bosses = (game.run.bosses || 0) + 1; checkAchievements(); });
game.on('evolved', () => checkAchievements());
game.on('purged', () => checkAchievements());
game.on('picked', () => checkAchievements());
game.on('failsafe', () => { ui.banner(T('Failsafe engaged'), T('Core held at 1 · all malware stunned'), '#00e5ff'); haptic([60, 40, 60]); });

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
  const final = w === game.lastWave;
  const bosses = game.waves[w - 1].filter((g) => g[0] === 'boss').reduce((n, g) => n + g[1], 0);
  const sub = bosses > 1 ? T('{n} Leviathans detected', { n: bosses }) : bosses ? T('Leviathan.exe detected') : T('{list} inbound', { list: describeWave(game, w) });
  const beyond = game.endless && w > game.totalWaves; // past the sector's own waves
  const into = w === game.totalWaves + 1 && game.endless;
  ui.banner(final ? T('Final wave') : into ? T('Into the void') : T('Wave {n}', { n: String(w).padStart(2, '0') }),
    into ? T('Past the last known wave · it only gets worse') : sub, final ? '#ff2a6d' : beyond ? '#b967ff' : '#00e5ff');
});
game.on('cleared', ({ bonus }) => ui.banner(T('Wave purged'), '+' + count(bonus, 'credit', 'credits'), '#3dff9e'));
game.on('bossDown', (e) => {
  slowMo(0.3, 1.1);
  if (e) renderer.focus(e.x, e.y, 0.14, 1.3);
  setTimeout(() => ui.banner(T('Leviathan.exe terminated'), '', '#ffb800'), 1200);
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
const fmtN = fmt;
// Daily result (win or loss): score, today's best, streak, Data
function finishDaily(won) {
  const stars = won ? starsFor(game.lives, game.maxLives) : 0;
  const d = dailyToday(), rec = saveDaily(game.score);
  // Pixo's daily board: score ranks; `core` is the integrity left (0 = breached)
  pixoRun('run-end', { score: Math.round(game.score), wave: game.wave, detail: { kills: game.kills, core: won ? game.lives : 0 } }, 'daily');
  const data = payData(won, stars);
  commitRun({ won, difficulty: game.difficulty, daily: rec });
  setTimeout(() => checkAchievements(won ? { won, stars, lives: game.lives, difficulty: game.difficulty } : null), 2300);
  lastWin = {
    won, day: d.key, score: game.score, best: rec.best, newBest: rec.newBest && rec.runs > 1, runs: rec.runs, streak: rec.streak, stars,
    wave: game.wave, lives: game.lives, maxLives: game.maxLives, kills: game.kills, sector: mapDef.name, title: mapDef.title, mut: game.mut, data,
    share: { top: T('Daily · {key} · {title}', { key: d.key, title: mapDef.title }), bottom: `${game.mut.name} · ${won ? T('core {l}/{m}', { l: game.lives, m: game.maxLives }) : T('fell on wave {n}', { n: game.wave })} · ${count(game.kills, 'kill', 'kills')}`,
      color: game.mut.color, badge: fmtN(game.score), file: `daily-${d.key}`, text: T('Void Wardens daily {key}: {s}', { key: d.key, s: count(game.score, 'point', 'points') }) },
  };
  setTimeout(() => ui.showOverlay('daily', lastWin), 1800);
}
// Endless result: the run always ends in a breach
function finishEndless() {
  const { prev, better } = saveEndless({ wave: game.wave, score: game.score, kills: game.kills });
  pixoRun('run-end', { score: Math.round(game.score), wave: game.wave, detail: { sector: 'Sector ' + mapDef.id.slice(-2), kills: game.kills } }); // English on every board, whatever the game's language
  const data = payData(false);
  commitRun({ won: false, endlessWave: game.wave });
  setTimeout(() => checkAchievements(), 2300);
  lastWin = {
    wave: game.wave, score: game.score, kills: game.kills, sector: mapDef.name, title: mapDef.title, diff: game.diff, data,
    beyond: Math.max(0, game.wave - 1 - game.totalWaves), prev, better: better && !!prev,
    share: { top: T('Endless · {name} · {title}', mapDef), bottom: `${game.diff.name} · ${count(game.score, 'point', 'points')} · ${count(game.kills, 'kill', 'kills')}`,
      color: game.diff.color, badge: T('WAVE {n}', { n: game.wave }), file: `endless-${mapDef.id}-${game.difficulty}`, text: T('Void Wardens endless: wave {n} on {title}', { n: game.wave, title: mapDef.title }) },
  };
  setTimeout(() => ui.showOverlay('endless', lastWin), 1800);
}
game.on('win', () => {
  slowMo(0.5, 1.2);
  if (game.mode === 'daily') { finishDaily(true); return; }
  if (game.mode === 'tutorial') {
    store.set('tutorial', '1');
    view.mode = 'campaign'; // back on the menu, the campaign is what's next
    store.set('mode', 'campaign');
    tutor.stop();
    setTimeout(() => ui.showOverlay('tutorial'), 1800);
    return;
  }
  const stars = starsFor(game.lives, game.maxLives);
  const idx = MAPS.indexOf(mapDef), next = MAPS[idx + 1] || null;
  const wasOpen = next ? isUnlocked(next.id) : true;
  const lockedBefore = TOWER_ORDER.filter((t) => !towerOpen(t));
  const wasCleared = cleared(mapDef.id);
  saveRecord({ stars, wave: game.wave });
  const newTowers = lockedBefore.filter((t) => towerOpen(t)).map((t) => TOWERS[t].name);
  refreshTowerLocks();
  lastWin = {
    lives: game.lives, maxLives: game.maxLives, kills: game.kills, towers: game.towers.length, stars, sector: mapDef.name, title: mapDef.title, diff: game.diff,
    next: next && { id: next.id, name: next.name, title: next.title, fresh: !wasOpen },
    newTowers,
    final: !next,
    endlessNew: wasCleared ? null : mapDef.title,
    share: { top: `${mapDef.name} · ${mapDef.title}`, bottom: `${game.diff.name} · ${T('core {l}/{m}', { l: game.lives, m: game.maxLives })} · ${count(game.kills, 'kill', 'kills')}`, color: game.diff.color,
      badge: '★'.repeat(stars) + '☆'.repeat(3 - stars), file: `${mapDef.id}-${game.difficulty}`, text: T('{name} cleared on {diff} — {stars}', { name: mapDef.name, diff: game.diff.name, stars: '★'.repeat(stars) }) },
  };
  if (next) view.menuSel = next.id;
  lastWin.medals = awardMedals();
  const medalData = lastWin.medals.filter((m) => m.fresh).length * MEDAL_DATA;
  lastWin.data = payData(true, stars);
  lastWin.data.medals = medalData;
  lastWin.data.total = research.data;
  commitRun({ won: true, difficulty: game.difficulty });
  setTimeout(() => checkAchievements({ won: true, stars, lives: game.lives, difficulty: game.difficulty }), 2300);
  setTimeout(() => ui.showOverlay('win', lastWin), 1800);
});
game.on('lose', () => {
  slowMo(0.35, 1.8);
  view.placing = null; view.selected = null;
  if (game.mode === 'daily') { finishDaily(false); return; }
  if (game.endless) { finishEndless(); return; }
  saveRecord({ wave: game.wave });
  const data = payData(false);
  commitRun({ won: false });
  setTimeout(() => checkAchievements(), 2300);
  setTimeout(() => ui.showOverlay('lose', { wave: game.wave, kills: game.kills, sector: mapDef.name, diff: game.diff, data }), 1800);
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
  if (drag) return; // a touch drag positions the ghost itself (lifted above the finger)
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
    // touch: wait for the finger to either lift (a tap) or move (a drag with a lifted ghost)
    if (ev.pointerType === 'touch') { beginDrag(ev, 'map', view.placing); return; }
    tapPlace(p, ev);
    return;
  }
  // a fingertip is wider than a tile: on touch, a tap near a tower selects it
  const t = game.towerAt(p.c, p.r) || (ev.pointerType === 'touch' ? nearestTower(p) : null);
  ctl.select(t && t === view.selected ? null : t);
});

function tapPlace(p, ev) {
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
}

// CSS px → world units at the current board scale
const worldPerPx = () => WORLD_W / canvas.getBoundingClientRect().width;

// closest tower within about a fingertip (≥ ~0.9 tile) of a touch point
function nearestTower(p) {
  const reach = Math.max(TILE * 0.9, 22 * worldPerPx());
  let best = null, bd = reach * reach;
  for (const t of game.towers) {
    const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

// ── Touch: drag a tower onto the map ─────────────────────
// Drag a dock card (or, while placing, drag on the map) and the ghost + range float above
// the fingertip, so the finger never hides the tile it is about to land on; lifting the
// finger deploys there. Taps keep working as before (tap a card, then tap a tile twice).
const DRAG_LIFT_PX = 44;   // how far above the fingertip the ghost sits, in CSS px
const DRAG_START_PX = 8;   // travel before a press counts as a drag
let drag = null;           // { id, from: 'dock' | 'map', type, x0, y0, moved }
let swallowClick = false;  // the click that follows a dock drag must not toggle the card

function liftedPoint(ev) {
  const f = toWorld(ev);
  const lift = DRAG_LIFT_PX * worldPerPx();
  // near the bottom edge the lift shrinks, so the last rows stay reachable
  const room = WORLD_H - f.y;
  const l = room >= lift ? lift : TILE * 0.4 + (lift - TILE * 0.4) * Math.max(0, room) / lift;
  const y = f.y - l;
  return { x: f.x, y, c: Math.floor(f.x / TILE), r: Math.floor(y / TILE), finger: { x: f.x, y: f.y } };
}

function beginDrag(ev, from, type) {
  drag = { id: ev.pointerId, from, type, x0: ev.clientX, y0: ev.clientY, moved: false };
}

function endDrag() { drag = null; view.finger = null; }

window.addEventListener('pointermove', (ev) => {
  if (!drag || ev.pointerId !== drag.id) return;
  if (!drag.moved) {
    if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < DRAG_START_PX) return;
    if (!view.started || view.paused || game.over) { endDrag(); return; }
    if (drag.from === 'dock' && view.placing !== drag.type) ctl.pickType(drag.type);
    if (view.placing !== drag.type) { endDrag(); return; } // locked or too expensive
    drag.moved = true;
    view.touchPending = null;
    ui.els.tooltip.hidden = true;
  }
  const p = liftedPoint(ev);
  const inside = p.x >= 0 && p.x < WORLD_W && p.y >= 0 && p.y < WORLD_H;
  view.hover = inside ? p : null;
  view.finger = inside ? p.finger : null;
});

window.addEventListener('pointerup', (ev) => {
  if (!drag || ev.pointerId !== drag.id) return;
  const d = drag;
  endDrag();
  if (!d.moved) {
    // a tap: dock taps are handled by the card's click; map taps use the two-tap flow
    if (d.from === 'map' && view.placing) tapPlace(toWorld(ev), ev);
    return;
  }
  if (d.from === 'dock') { swallowClick = true; setTimeout(() => (swallowClick = false), 400); }
  const p = view.hover;
  view.hover = null;
  if (p && view.placing && game.canPlace(view.placing, p.c, p.r)) {
    game.place(view.placing, p.c, p.r);
    ctl.cancel();
  } else if (p) {
    sfx.play('error'); // dropped on a path / another tower: keep placing, try again
  } else if (d.from === 'dock') {
    ctl.cancel();      // dragged back off the map: never mind
  }
});
window.addEventListener('pointercancel', (ev) => {
  if (drag && ev.pointerId === drag.id) { endDrag(); view.hover = null; }
});

dockEl.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType !== 'touch' || !view.started || view.paused || game.over) return;
  const card = ev.target.closest('.card');
  const type = card && TOWER_ORDER.find((k) => ui.cards[k] === card);
  if (type) beginDrag(ev, 'dock', type);
});
dockEl.addEventListener('click', (ev) => {
  if (swallowClick) { swallowClick = false; ev.stopPropagation(); ev.preventDefault(); }
}, true);

window.addEventListener('keydown', (ev) => {
  if (ev.repeat || view.intro) return;
  // an open data cache takes 1–3 before the tower hotkeys do
  if (view.started && !view.paused && game.offer) {
    const c = parseInt(ev.key, 10);
    if (c >= 1 && c <= game.offer.length) { ctl.chooseCard(c - 1); return; }
  }
  // hotkeys follow the key's printed letter, but a non-Latin layout (e.g. Russian ЙЦУКЕН) falls
  // back to the physical key, so Q/E/S/T/Z/X… still work without switching layouts
  let k = ev.key.toLowerCase();
  if (/^[^\x00-\x7f]$/.test(k) && /^Key[A-Z]$/.test(ev.code)) k = ev.code.slice(3).toLowerCase();
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
  tutor.update();
  if (view.started && !view.paused && !tutor.frozen) {
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
  const cd = view.started && game.state === 'break' && game.wave === game.lastWave - 1 && game.breakTimer <= 3 ? Math.ceil(game.breakTimer) : 0;
  if (cd && cd !== lastCount) sfx.play('tick');
  lastCount = cd;
  renderer.render(game, view, realTime);
  ui.update(real);
}
requestAnimationFrame(frame);

// opening on the Daily tab shows today's board behind the menu (the remembered sector stays selected)
if (view.mode === 'daily') { view.menuSel = mapDef.id; loadSector(dailyToday().sectorId); }
else if (view.mode === 'training') { view.menuSel = mapDef.id; loadDef(TUTORIAL); }
ui.showOverlay('start', menuData());
refreshTowerLocks();

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
if (view.intro) runIntro({ onDeploy: deploy, reduced: motion.reduced, sfx });
else document.body.classList.add('deployed');

// Phones in portrait: the rotate prompt covers the game (CSS), and a running wave pauses.
const portraitMq = window.matchMedia?.('(orientation: portrait) and (pointer: coarse)');
portraitMq?.addEventListener?.('change', (e) => {
  if (e.matches && view.started && !view.paused && !game.over) ctl.togglePause();
});

if (new URLSearchParams(location.search).has('debug')) window.VW = { game, view, ctl, ui, renderer, sfx, music, tutor };

// Respect the OS "reduce motion" setting (and follow it if it changes mid-session)
const reduceMq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
if (reduceMq) {
  motion.reduced = reduceMq.matches;
  reduceMq.addEventListener?.('change', (e) => (motion.reduced = e.matches));
}
