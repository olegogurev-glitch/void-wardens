// Training: a coach box that walks a new player through every mechanic on the training map
// (TUTORIAL in src/maps.js), one step at a time. Each step explains one thing and either waits
// for "Next" or for the player to actually do it (pick a tower, deploy it, run a wave…).
// While a step marked `freeze` is up during a wave, the simulation stands still so nothing
// slips past while the player reads. Bright frames ("spots") point at the HUD, the dock, the
// panel or tiles on the board.
import { WORLD_W, WORLD_H, TILE } from './config.js';
import { t as T } from './i18n.js';

const touchUI = () => !!window.matchMedia?.('(pointer: coarse)').matches;
const tile = (c, r) => ({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });

export class Tutor {
  constructor({ game, view, ui, ctl, canvas, viewport, sfx }) {
    Object.assign(this, { game, view, ui, ctl, canvas, viewport, sfx });
    this.i = -1;
    this.on = false;
    this.box = document.createElement('div');
    this.box.className = 'tutor hudbox';
    this.box.hidden = true;
    viewport.appendChild(this.box);
    this.box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tu]');
      if (!b) return;
      // a stale button (double click before the next step drew) must not skip a step
      if (b.dataset.tu === 'next' && +b.dataset.step === this.i) { this.sfx.play('click'); this.go(this.i + 1); }
      else if (b.dataset.tu === 'exit') this.ctl.menu();
    });
    this.spots = [];
    this.steps = this.buildSteps();
  }

  // ── what the coach says, step by step ──
  buildSteps() {
    const g = this.game, v = this.view, ui = this.ui;
    const tower = (type) => g.towers.find((t) => t.type === type);
    const at = (t) => t && { x: t.x, y: t.y, r: 0.9 };
    const el = (sel) => document.querySelector(sel);
    const cta = () => el('#wave-cta .cta');
    const preview = () => el('#wave-cta .next-wave');
    const grant = (n) => {
      if (g.credits >= n) return;
      const add = Math.ceil(n - g.credits);
      g.credits = n;
      g.fx.text(g.map.core.x, g.map.core.y - 50, T('+{n} training grant', { n: add }), '#ffb800', 14);
      this.sfx.play('coin');
    };
    const inWave = () => g.state === 'wave';
    const BREACH = tile(1, 4);
    return [
      { id: 'welcome', title: 'Welcome, Warden', next: true,
        body: 'Hostile code breaks in at the <b>breach</b> and runs along the <b>data bus</b> toward the Core. This training shows you every mechanic, one step at a time.',
        spots: () => [{ ...BREACH, r: 1.1 }] },
      { id: 'core', title: 'The Core', next: true,
        body: 'Malware that reaches the Core costs integrity. At zero the run is lost. (Training can\'t be lost — so experiment.)',
        spots: () => [{ x: g.map.core.x, y: g.map.core.y, r: 1.7 }, el('#stat-lives')] },
      { id: 'credits', title: 'Credits', next: true,
        body: 'Credits buy towers and upgrades. You earn them for every kill and every wave you clear.',
        spots: () => [el('#stat-credits')] },
      { id: 'pick', title: 'Build a tower',
        body: 'Pick the <b>Photon Blaster</b> in the dock (key <kbd>1</kbd>). It fires fast bolts at one target.',
        touch: 'Tap the <b>Photon Blaster</b> in the dock — or drag it straight onto the map.',
        spots: () => [ui.cards.blaster],
        done: () => v.placing === 'blaster' || !!tower('blaster') },
      { id: 'place', title: 'Deploy it',
        body: 'Click the marked tile. The circle shows the tower\'s range. Towers go on empty tiles, never on the bus.',
        touch: 'Tap the marked tile twice — once to preview, once to deploy. The circle shows the tower\'s range.',
        spots: () => [{ ...tile(12, 11), r: 0.75, sq: true }],
        done: () => !!tower('blaster'),
        back: () => (!v.placing && !tower('blaster') ? 'pick' : null) },
      { id: 'wave1', title: 'Run wave 1', wave: true,
        body: 'Press <b>Run wave</b> (<kbd>Space</kbd>) when you\'re ready. The strip above it shows what\'s coming.',
        spots: () => [cta(), preview()],
        done: inWave },
      { id: 'watch1', title: 'Towers fire on their own',
        body: 'Your Blaster aims and shoots by itself. Every kill drops credits into your balance.',
        spots: () => [at(tower('blaster'))],
        done: () => g.state === 'break' },
      { id: 'break', title: 'Wave purged', next: true,
        body: 'A cleared wave pays a bonus. Normally a short break then starts the next wave by itself — call it early for <b>+3 credits</b> per second skipped. In training the clock waits for you.',
        spots: () => [cta()] },
      { id: 'ice', title: 'Slow them down',
        body: 'Towers have different jobs. The <b>ICE Node</b> (key <kbd>2</kbd>) slows all malware in its pulse. Deploy one on the marked tile, under the Blaster.',
        enter: () => grant(70),
        spots: () => [tower('cryo') ? null : ui.cards.cryo, { ...tile(13, 12), r: 0.75, sq: true }],
        done: () => !!tower('cryo') },
      { id: 'select', title: 'Evolve',
        body: 'Armored <b>Trojans</b> come next. Get ready: click your <b>Photon Blaster</b> to open its panel.',
        touch: 'Armored <b>Trojans</b> come next. Get ready: tap your <b>Photon Blaster</b> to open its panel.',
        enter: () => grant(80),
        spots: () => [at(tower('blaster'))],
        done: () => v.selected?.type === 'blaster' || g.towers.some((t) => t.level > 1) },
      { id: 'upgrade', title: 'Choose a path',
        body: 'Every tower evolves twice, and each evolution is a choice between two paths — four final forms per tower. Pick one (<kbd>Q</kbd> / <kbd>E</kbd>).',
        touch: 'Every tower evolves twice, and each evolution is a choice between two paths — four final forms per tower. Pick one.',
        spots: () => [el('#panel:not([hidden]) .p-upgrades')],
        done: () => g.towers.some((t) => t.level > 1),
        back: () => (!v.selected ? 'select' : null) },
      { id: 'panel', title: 'Targeting and selling', next: true,
        body: 'The panel also sets what a tower aims at — <b>First</b>, <b>Last</b>, <b>Strong</b> or <b>Close</b> — and <b>sells</b> it for 70% of what you spent (press Sell twice).',
        spots: () => [el('#panel:not([hidden]) .p-target'), el('#panel:not([hidden]) .p-sell')] },
      { id: 'wave2', title: 'Armor', wave: true,
        enter: () => this.ctl.select(null),
        body: 'Here come the <b>Trojans</b>. Armor 3 takes 3 damage off every hit, and each one that leaks costs 2 integrity. Run wave 2.',
        spots: () => [preview(), cta()],
        done: inWave },
      { id: 'watch2', title: 'Slow + damage',
        body: 'Slowed by the ICE Node, the Trojans stay in the Blaster\'s range far longer.',
        spots: () => [at(tower('cryo'))],
        done: () => g.state === 'break' },
      { id: 'wave3', title: 'A big swarm', wave: true,
        body: 'Wave 3 is a swarm. Spend your credits first — another tower, or the <b>Arc Relay</b> (key <kbd>3</kbd>), whose lightning jumps between targets. Then run it: you\'ll also get two emergency abilities.',
        spots: () => [preview(), cta()],
        done: inWave },
      { id: 'firewall', title: 'Firewall', freeze: true,
        wait: () => g.enemies.length >= 5,
        skip: () => !inWave(),
        body: 'Time is frozen. Press <b>Firewall</b> (<kbd>Z</kbd>), then click the bus ahead of the swarm. It blocks malware for 5s and burns whatever presses on it.',
        touch: 'Time is frozen. Tap <b>Firewall</b>, then tap the bus ahead of the swarm. It blocks malware for 5s and burns whatever presses on it.',
        spots: () => [ui.abilityBtns.firewall, v.ability === 'firewall' ? { ...tile(10, 8), r: 0.8 } : null],
        done: () => g.cooldowns.firewall > 0 && ((this.t0 = g.time), true) },
      { id: 'purge', title: 'System Purge', freeze: true,
        wait: () => g.time - this.t0 > 2.5 && g.enemies.length >= 4,
        skip: () => !inWave() || !g.enemies.length,
        body: 'Now press <b>System Purge</b> (<kbd>X</kbd>). It hits every malware on the board for 15% of its health and stuns it for a second.',
        touch: 'Now tap <b>System Purge</b>. It hits every malware on the board for 15% of its health and stuns it for a second.',
        spots: () => [ui.abilityBtns.purge],
        done: () => g.cooldowns.purge > 0 },
      { id: 'cooldowns', title: 'Cooldowns', next: true,
        body: 'Both abilities recharge over time; the button counts down until each is ready again. Use them when a wave gets away from you.',
        spots: () => [ui.abilityBtns.firewall, ui.abilityBtns.purge],
        done: () => !!g.offer || g.state === 'break' },
      // the cache screen explains itself: just light up the cards, then explain after the pick
      { id: 'cards', quiet: true,
        wait: () => !!g.offer,
        skip: () => g.picked.length > 0,
        spots: () => [el('#cards:not([hidden]) .cards-row')],
        done: () => g.picked.length > 0 },
      { id: 'cache', title: 'Data cache', next: true,
        body: 'After every 3rd wave you recover a cache and keep one card for the rest of the run. Your picks collect in the top-left corner.',
        spots: () => [el('#picked')] },
      { id: 'controls', title: 'Speed and pause', next: true,
        body: 'Top right: game speed (<kbd>F</kbd>), pause (<kbd>P</kbd>), music and sound. The pause menu also holds graphics and comfort settings.',
        spots: () => [el('#btn-speed'), el('#btn-pause')] },
      { id: 'final', title: 'Final wave', wave: true,
        body: 'You\'re on your own now: build, evolve, then run the last wave. It brings <b>Worms</b> — they split into three when destroyed.',
        spots: () => [preview(), cta()],
        done: inWave },
      { id: 'free', silent: true, wave: true, done: () => false },
    ];
  }

  get active() { return this.on && this.game.mode === 'tutorial'; }
  get step() { return this.steps[this.i]; }
  // the simulation stands still while a freeze step is up mid-wave
  get frozen() {
    const s = this.active && this.step;
    return !!(s && s.freeze && !this.waiting && this.game.state === 'wave');
  }
  // waves start only when the coach asks for one (and freely at the end)
  allowsWave() { return !this.active || !!this.step?.wave; }

  start() {
    this.on = true;
    this.t0 = 0;
    this.game.holdBreak = true;
    this.go(0);
  }

  stop() {
    this.on = false;
    this.i = -1;
    this.box.hidden = true;
    this.game.holdBreak = false;
    for (const s of this.spots) s.hidden = true;
  }

  go(i) {
    this.i = Math.min(i, this.steps.length - 1);
    this.entered = false;
    this.key = '';
  }

  // called every frame
  update() {
    if (!this.active) return;
    let s = this.step;
    // advance through anything already done or no longer possible (at most a few per frame)
    for (let n = 0; n < 4 && s; n++) {
      if (!this.entered && !(s.wait && !s.wait())) { this.entered = true; s.enter?.(); }
      const back = this.entered && s.back?.();
      if (back) { this.go(this.steps.findIndex((x) => x.id === back)); s = this.step; continue; }
      if ((s.skip && s.skip()) || (this.entered && s.done && s.done())) { this.go(this.i + 1); s = this.step; continue; }
      break;
    }
    this.waiting = !this.entered;
    const live = !this.waiting && !s.silent && !this.view.paused && !this.game.over;
    const show = live && !s.quiet; // a quiet step lights its targets without the coach box
    this.render(s, show);
    this.place(live ? (s.spots?.() || []) : [], s, show);
  }

  render(s, show) {
    const key = `${this.i}|${show}|${this.frozen}`;
    if (key === this.key) return;
    this.key = key;
    this.box.hidden = !show;
    if (!show) return;
    const shown = this.steps.filter((x) => !x.silent && !x.quiet);
    const total = shown.length, n = shown.indexOf(s) + 1;
    const body = touchUI() && s.touch ? s.touch : s.body;
    this.box.innerHTML = `<div class="tu-head"><span class="tu-kick">${T('Training · {n}/{m}', { n, m: total })}${this.frozen ? ` <em>${T('· time frozen')}</em>` : ''}</span>
        <button class="tu-exit" data-tu="exit">${T('Exit')}</button></div>
      <div class="tu-title">${T(s.title)}</div>
      <div class="tu-body">${T(body)}</div>
      <div class="tu-foot">${s.next ? `<button class="tu-next hudbox" data-tu="next" data-step="${this.i}">${T('Next ▸')}</button>` : `<span class="tu-wait">${T('▸ Your move')}</span>`}</div>`;
    this.ui.bump(this.box, 'pop');
  }

  // positions the coach box away from what it points at, and the spots over their targets
  place(targets, s, show) {
    const cr = this.canvas.getBoundingClientRect(), vr = this.viewport.getBoundingClientRect();
    const k = cr.width / WORLD_W;
    const rects = [];
    for (const t of targets) {
      if (!t) continue;
      if (t instanceof Element) {
        const r = t.getBoundingClientRect();
        if (r.width && r.height) rects.push({ x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8, round: false });
      } else {
        const rad = (t.r || 0.9) * TILE * k;
        const x = cr.left + (t.x / WORLD_W) * cr.width, y = cr.top + (t.y / WORLD_H) * cr.height;
        rects.push({ x: x - rad, y: y - rad, w: rad * 2, h: rad * 2, round: !t.sq });
      }
    }
    while (this.spots.length < rects.length) {
      const d = document.createElement('div');
      d.className = 'tut-spot';
      document.body.appendChild(d);
      this.spots.push(d);
    }
    this.spots.forEach((d, i) => {
      const r = rects[i];
      d.hidden = !r;
      if (!r) return;
      Object.assign(d.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      d.classList.toggle('round', r.round);
    });
    if (!show) return;
    // coach on the side away from the targets that sit on the board
    const inside = rects.filter((r) => r.x + r.w / 2 > vr.left && r.x + r.w / 2 < vr.right && r.y + r.h / 2 > vr.top && r.y + r.h / 2 < vr.bottom);
    const cx = inside.length ? inside.reduce((a, r) => a + r.x + r.w / 2, 0) / inside.length - vr.left : 0;
    const right = inside.length > 0 && cx < vr.width / 2;
    this.box.classList.toggle('r', right);
  }
}
