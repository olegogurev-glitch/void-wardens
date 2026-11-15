// DOM HUD: top stats, tower dock, tower panel with upgrade choices, banners, overlays.
import { RESEARCH, CARDS, RULES, TOWERS, TOWER_ORDER, ENEMIES, START_LIVES, SELL_RATIO, WORLD_W, COLS, ROWS, ABILITIES, ABILITY_ORDER, DIFFICULTIES, DIFFICULTY_ORDER, towerStats, upgradeOptions, pathNames, waveHpMult } from './config.js';
import { drawTower, motion } from './render.js';
import { TARGET_MODES } from './game.js';

const ABILITY_ICONS = {
  firewall: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 6h16M4 12h16M4 18h16M8 6v6M16 6v6M12 12v6M6 18v0" stroke="currentColor" stroke-width="2" fill="none"/><rect x="3" y="3" width="18" height="18" stroke="currentColor" stroke-width="1" fill="none" opacity=".4"/></svg>',
  purge: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M13 2L5 14h6l-2 8 9-13h-6z" fill="currentColor"/><circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="1" fill="none" opacity=".4"/></svg>',
};

const TARGET_HINTS = {
  first: 'Furthest along the path',
  last: 'Newest arrival',
  strong: 'Most HP remaining',
  close: 'Nearest to the tower',
};

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CR = '<i class="cr"></i>';

export function statRows(s) {
  if (s.kind === 'aura') {
    const rows = [['FIELD', fmt(s.range)]];
    if (s.buffRate) rows.push(['RATE', `+${Math.round(s.buffRate * 100)}%`]);
    if (s.buffDmg) rows.push(['DMG', `+${Math.round(s.buffDmg * 100)}%`]);
    return rows;
  }
  if (s.kind === 'mines') return [['DMG', fmt(s.mineDmg)], ['MINES', `${s.maxMines} · ${s.rate.toFixed(2)}/s`], ['RANGE', fmt(s.range)]];
  const mult = s.kind === 'missile' && s.missiles > 1 ? ` ×${s.missiles}` : s.targets > 1 ? ` ×${s.targets}` : '';
  return [
    ['DMG', fmt(s.damage) + mult],
    ['RATE', (s.rate < 1 ? s.rate.toFixed(2) : s.rate.toFixed(1)) + '/s'],
    ['RANGE', fmt(s.range)],
  ];
}

export function statTags(s) {
  const t = [];
  if (s.kind === 'rail') t.push('Piercing beam');
  if (s.kind === 'lance') t.push('Instant hit');
  if (s.bounces) t.push(`Ricochet ×${s.bounces}`);
  if (s.execute) t.push(`Executes <${Math.round(s.execute * 100)}% HP`);
  if (s.vulnMark) t.push(`Marks +${Math.round(s.vulnMark * 100)}% dmg`);
  if (s.strip) t.push('Pops shields');
  if (s.kind === 'aura') t.push('Buffs towers in field');
  if (s.buffRange) t.push(`+${Math.round(s.buffRange * 100)}% range to field`);
  if (s.buffPierce) t.push('Field ignores armor');
  if (s.revealField) t.push('Exposes cloaked');
  if (s.mine) t.push(`+${s.mine} credits / 4s`);
  if (s.kind === 'mines') t.push(`Blast ${fmt(s.mineRadius)}`);
  if (s.mineStun) t.push(`Stun ${s.mineStun}s`);
  if (s.mineSlow) t.push(`Tar ${Math.round(s.mineSlow * 100)}% slow`);
  if (s.chain) t.push('Chain reaction');
  if (s.mineBurn) t.push(`Burn ${s.mineBurn}/s`);
  if (s.kind === 'chain') t.push(`Chains ×${s.chains}`);
  if (s.kind === 'nova') t.push('Hits all in range');
  if (s.kind === 'pulse') t.push(s.singularity ? 'Rollback pulse' : 'Area pulse');
  if (s.splash && s.kind !== 'pulse') t.push(`Splash ${fmt(s.splash)}`);
  if (s.slow) t.push(`Slow ${Math.round(s.slow * 100)}%`);
  if (s.freezeChance) t.push(`Freeze ${Math.round(s.freezeChance * 100)}%`);
  if (s.stunChance) t.push(`Stun ${Math.round(s.stunChance * 100)}%`);
  if (s.vuln) t.push(`+${Math.round(s.vuln * 100)}% dmg taken`);
  if (s.pull) t.push('Pulls back');
  if (s.cluster) t.push(`Cluster ×${s.cluster}`);
  if (s.burn) t.push(`Burn ${s.burn}/s`);
  if (s.pierceArmor) t.push('Ignores armor');
  if (s.spinUp) t.push(`Spin-up +${Math.round(s.spinUp * 100)}% rate`);
  if (s.echo) t.push(`Echo strike ${Math.round(s.echo * 100)}%`);
  if (s.hail) t.push(`Hail ×${s.hail}`);
  return t;
}

function diffLine(a, b) {
  const ra = statRows(a), rb = statRows(b);
  const out = [];
  for (let i = 0; i < ra.length; i++) {
    if (ra[i][1] !== rb[i][1]) out.push(`<span>${ra[i][0]} <s>${ra[i][1]}</s> → <b>${rb[i][1]}</b></span>`);
  }
  return out.join('');
}

// Small line icons for the upgrade cards (inline SVG, currentColor)
const ICON = {
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  chip: '<rect x="7" y="7" width="10" height="10"/><path d="M9 4v3M12 4v3M15 4v3M9 17v3M12 17v3M15 17v3M4 9h3M4 12h3M4 15h3M17 9h3M17 12h3M17 15h3"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  coin: '<path d="M12 3l8 9-8 9-8-9z"/><path d="M12 8l3.5 4L12 16l-3.5-4z"/>',
  core: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  cycle: '<path d="M19 12a7 7 0 1 1-2-4.9"/><path d="M19 4v4h-4"/>',
  wall: '<path d="M4 6h16v12H4zM4 12h16M10 6v6M14 12v6"/>',
  bolt: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  skull: '<path d="M6 10a6 6 0 1 1 12 0v4h-3v3H9v-3H6z"/><circle cx="9.5" cy="10.5" r="1.4"/><circle cx="14.5" cy="10.5" r="1.4"/>',
  tower: '<path d="M6 20h12M8 20V9h8v11M12 9V4M9 4h6"/>',
};
const CARD_ICON = { overclock: 'clock', zeroday: 'skull', precision: 'target', bounty: 'coin', firmware: 'chip', interest: 'coin', salvage: 'coin', cache: 'coin', patch: 'core', recharge: 'cycle', bastion: 'wall', deeppurge: 'bolt' };
// achievement icons reuse the card line icons
const ACH_ICON = { core: 'patch', skull: 'zeroday', target: 'precision', coin: 'bounty', cycle: 'recharge', bolt: 'deeppurge', wall: 'bastion', chip: 'firmware' };
const achIcon = (icon) => (icon === 'tower' ? cardIcon(null, true) : cardIcon(ACH_ICON[icon] || 'firmware'));

export function cardIcon(id, tower) {
  const k = CARD_ICON[id] || (tower ? 'tower' : 'chip');
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">${ICON[k]}</svg>`;
}

export function describeWave(game, w) {
  const counts = {};
  for (const [type, n] of game.waves[w - 1]) counts[type] = (counts[type] || 0) + game.scaledCount(type, n, w);
  const seen = new Set(game.waves.slice(0, w - 1).flat().map((g) => g[0]));
  return Object.entries(counts).map(([type, n]) => {
    const d = ENEMIES[type];
    const label = d.boss ? d.name : `${n} ${n > 1 ? d.plural : d.name}`;
    return !seen.has(type) && w > 1 && !d.boss ? `NEW: ${label} (${d.trait})` : label;
  }).join(' · ');
}

export class UI {
  constructor(game, view, ctl) {
    this.game = game;
    this.view = view;
    this.ctl = ctl;
    this.els = {
      credits: $('credits'), creditsStat: $('stat-credits'), waveNum: $('wave-num'), waveTotal: $('wave-total'), score: $('score'), scoreStat: $('stat-score'),
      lives: $('lives'), livesBar: $('lives-bar'), livesStat: $('stat-lives'),
      dock: $('dock'), panel: $('panel'), banner: $('banner'), cta: $('wave-cta'), overlay: $('overlay'),
      tooltip: $('tooltip'), speed: $('btn-speed'), pause: $('btn-pause'), mute: $('btn-mute'), music: $('btn-music'), viewport: $('viewport'),
    };
    this.cards = {};
    this.prev = {};
    this.panelKey = '';
    this.liveT = 0;
    // wave total is set per sector in update()
    this.buildDock();
    this.bind();
  }

  reset() {
    this.prev = {};
    this.panelKey = '';
    this.els.panel.hidden = true;
  }

  buildDock() {
    TOWER_ORDER.forEach((type, i) => {
      const def = TOWERS[type];
      const btn = document.createElement('button');
      btn.className = 'card hudbox';
      btn.style.setProperty('--c', def.color);
      btn.innerHTML = `<span class="key">${i + 1}</span><canvas width="112" height="112"></canvas>
        <span class="info"><span class="name">${def.name}</span><span class="cost">${CR}${def.cost}</span></span>`;
      const cv = btn.querySelector('canvas');
      const g = cv.getContext('2d');
      g.scale(2.3, 2.3);
      drawTower(g, { type, stats: towerStats(type, []), x: 24.3, y: 27, angle: -0.7, recoil: 0, spin: 0, level: 1, spawnT: 1, id: 1, cooldown: 0, barrel: 0, upgradeFlash: 0 }, 0.8);
      btn.addEventListener('click', () => this.ctl.pickType(type));
      btn.addEventListener('mouseenter', () => this.showTip(btn, type));
      btn.addEventListener('mouseleave', () => (this.els.tooltip.hidden = true));
      this.els.dock.appendChild(btn);
      this.cards[type] = btn;
    });

    // abilities, after a divider
    const sep = document.createElement('span');
    sep.className = 'dock-sep';
    this.els.dock.appendChild(sep);
    this.abilityBtns = {};
    for (const id of ABILITY_ORDER) {
      const a = ABILITIES[id];
      const btn = document.createElement('button');
      btn.className = 'ability hudbox';
      btn.style.setProperty('--c', a.color);
      btn.innerHTML = `<span class="key">${a.key}</span><span class="ab-icon">${ABILITY_ICONS[id]}</span>
        <span class="info"><span class="name">${a.name}</span><span class="ab-cd">Ready</span></span><span class="ab-sweep"></span>`;
      btn.addEventListener('click', () => this.ctl.ability(id));
      btn.addEventListener('mouseenter', () => this.showTipHtml(btn, a.color,
        `<div class="t-name">${a.name}</div><div class="t-desc">${a.desc}</div><div class="t-hint">Cooldown ${a.cooldown}s · key ${a.key}</div>`));
      btn.addEventListener('mouseleave', () => (this.els.tooltip.hidden = true));
      this.els.dock.appendChild(btn);
      this.abilityBtns[id] = btn;
    }
  }

  showTipHtml(btn, color, html) {
    const tip = this.els.tooltip;
    tip.style.setProperty('--c', color);
    tip.innerHTML = html;
    tip.hidden = false;
    const r = btn.getBoundingClientRect();
    tip.style.left = clamp(r.left + r.width / 2 - tip.offsetWidth / 2, 8, window.innerWidth - tip.offsetWidth - 8) + 'px';
    tip.style.top = r.top - tip.offsetHeight - 10 + 'px';
  }

  updateAbilities() {
    const g = this.game, v = this.view;
    for (const id of ABILITY_ORDER) {
      const btn = this.abilityBtns[id];
      const left = g.cooldowns[id], cd = g.abilityCooldown(id);
      const key = `${Math.ceil(left)}|${v.ability === id}|${v.started && !g.over}`;
      if (btn._key === key) continue;
      btn._key = key;
      const ready = left <= 0;
      btn.style.setProperty('--cd', ready ? 0 : left / cd);
      btn.classList.toggle('ready', ready && v.started && !g.over);
      btn.classList.toggle('active', v.ability === id);
      btn.querySelector('.ab-cd').textContent = v.ability === id ? 'Click the bus' : ready ? 'Ready' : `${Math.ceil(left)}s`;
    }
  }

  // dock cards for towers not unlocked yet: map type → sector that unlocks it (or null)
  setTowerLocks(locks) {
    this.towerLocks = locks;
    for (const type of TOWER_ORDER) this.cards[type].classList.toggle('locked', !!locks[type]);
  }

  showTip(btn, type) {
    const def = TOWERS[type], s = this.game.statsFor(type, []);
    const tip = this.els.tooltip;
    tip.style.setProperty('--c', def.color);
    const lock = this.towerLocks && this.towerLocks[type];
    if (lock) {
      tip.innerHTML = `<div class="t-name">${def.name}</div><div class="t-desc">${def.desc}</div>
        <div class="t-hint">Locked · clear ${lock.name} · ${lock.title} to unlock</div>`;
      tip.hidden = false;
      const r = btn.getBoundingClientRect();
      tip.style.left = clamp(r.left + r.width / 2 - tip.offsetWidth / 2, 8, window.innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = r.top - tip.offsetHeight - 10 + 'px';
      return;
    }
    tip.innerHTML = `<div class="t-name">${def.name}</div><div class="t-desc">${def.desc}</div>
      <div class="t-stats">${statRows(s).map(([k, v]) => `<span><label>${k}</label>${v}</span>`).join('')}</div>
      <div class="t-tags">${statTags(s).map((x) => `<span class="tag">${x}</span>`).join('')}</div>
      <div class="t-hint">2 evolution paths · 4 final forms</div>`;
    tip.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
    tip.style.top = r.top - h - 10 + 'px';
  }

  bind() {
    const e = this.els;
    e.speed.onclick = () => this.ctl.toggleSpeed();
    e.pause.onclick = () => this.ctl.togglePause();
    e.mute.onclick = () => this.ctl.toggleMute();
    e.music.onclick = () => this.ctl.toggleMusic();
    e.cta.addEventListener('click', (ev) => { if (ev.target.closest('[data-act="wave"]')) this.ctl.startWave(); });
    // comfort sliders update live without re-rendering the overlay (keeps the drag going)
    e.overlay.addEventListener('input', (ev) => {
      const r = ev.target.closest('[data-comfort]');
      if (!r) return;
      this.ctl.setComfort?.(r.dataset.comfort, r.value / 100);
      const out = r.parentElement.querySelector('b');
      if (out) out.textContent = r.value + '%';
    });
    e.overlay.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (b) this.ctl[b.dataset.act]?.(b.dataset.arg);
    });
    // sector cards tilt toward the pointer, with a glare that follows it
    e.overlay.addEventListener('pointermove', (ev) => {
      const card = ev.target.closest('.sector');
      if (!card || motion.reduced) return;
      const r = card.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      card.style.setProperty('--ry', ((x - 0.5) * 14).toFixed(2) + 'deg');
      card.style.setProperty('--rx', ((0.5 - y) * 10).toFixed(2) + 'deg');
      card.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (y * 100).toFixed(1) + '%');
    });
    e.overlay.addEventListener('pointerout', (ev) => {
      const card = ev.target.closest('.sector');
      if (card && !card.contains(ev.relatedTarget)) { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); }
    });
    // hovering a sector card previews its map behind the menu
    e.overlay.addEventListener('pointerover', (ev) => {
      if (!this.els.overlay.classList.contains('start')) return;
      const card = ev.target.closest('.node');
      this.ctl.preview?.(card ? card.dataset.arg : this.view.menuSel);
    });
    e.panel.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'upgrade') this.ctl.upgrade(+b.dataset.i);
      else if (act === 'sell') this.ctl.sell();
      else if (act === 'target') this.ctl.target(b.dataset.mode);
      else if (act === 'close') this.ctl.select(null);
    });
    e.panel.addEventListener('pointerover', (ev) => {
      const b = ev.target.closest('[data-act="upgrade"]');
      const t = this.view.selected;
      this.view.previewStats = b && t ? this.game.statsFor(t.type, [...t.path, +b.dataset.i]) : null;
    });
    e.panel.addEventListener('pointerleave', () => (this.view.previewStats = null));
  }

  // Stat readouts count up from zero when the tower panel opens.
  countUp(root) {
    if (motion.reduced) return;
    const els = [...root.querySelectorAll('.ps b')].map((el) => {
      const m = el.textContent.match(/^([\d.]+)(.*)$/s);
      return m ? { el, v: parseFloat(m[1]), dec: (m[1].split('.')[1] || '').length, rest: m[2] } : null;
    }).filter(Boolean);
    const t0 = performance.now(), D = 380;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / D), k = 1 - (1 - p) ** 3;
      for (const x of els) if (x.el.isConnected) x.el.textContent = (x.v * k).toFixed(x.dec) + x.rest;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Live mini-maps on the sector cards: the bus routes with data packets running along them.
  startMiniMaps(maps) {
    const cvs = [...this.els.overlay.querySelectorAll('canvas.s-map')];
    const defs = new Map(maps.map((m) => [m.id, m]));
    const routes = cvs.map((c) => {
      const def = defs.get(c.dataset.map);
      if (!def) return null;
      const pts = def.paths.map((w) => w.map(([cc, rr]) => [(cc + 0.5) / COLS, (rr + 0.5) / ROWS]));
      const lens = pts.map((ps) => ps.slice(1).reduce((acc, q, i) => acc + Math.hypot(q[0] - ps[i][0], (q[1] - ps[i][1]) * ROWS / COLS), 0));
      return { c, pts, lens };
    }).filter(Boolean);
    const draw = (now) => {
      if (!this.els.overlay.classList.contains('start')) return;
      for (const r of routes) {
        const c = r.c, dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
        if (!w || !h) continue;
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const g = c.getContext('2d'), col = getComputedStyle(c).getPropertyValue('--c').trim() || '#00e5ff';
        // fit the board (COLS × ROWS) into the card, centred
        const s = Math.min(w / COLS, h / ROWS), ox = (w - s * COLS) / 2, oy = (h - s * ROWS) / 2;
        const X = (u) => ox + u * COLS * s, Y = (v) => oy + v * ROWS * s;
        g.clearRect(0, 0, w, h);
        g.fillStyle = 'rgba(0,229,255,0.18)';
        for (let i = 0; i <= COLS; i += 2) for (let j = 0; j <= ROWS; j += 2) g.fillRect(ox + i * s - 0.5, oy + j * s - 0.5, 1, 1);
        g.lineJoin = 'miter'; g.lineCap = 'square';
        for (const ps of r.pts) {
          g.beginPath(); ps.forEach(([u, v], i) => (i ? g.lineTo(X(u), Y(v)) : g.moveTo(X(u), Y(v))));
          g.strokeStyle = col; g.globalAlpha = 0.22; g.lineWidth = s * 0.9; g.stroke();
          g.globalAlpha = 0.85; g.lineWidth = Math.max(1, s * 0.12); g.stroke();
          g.globalAlpha = 1;
        }
        // packets
        r.pts.forEach((ps, pi) => {
          for (let k = 0; k < 3; k++) {
            let d = (((motion.reduced ? 0 : now / 1000) * 0.18 + k / 3 + pi * 0.17) % 1) * r.lens[pi];
            for (let i = 1; i < ps.length; i++) {
              const a = ps[i - 1], b = ps[i], L = Math.hypot(b[0] - a[0], (b[1] - a[1]) * ROWS / COLS);
              if (d <= L) {
                const f = d / L, x = X(a[0] + (b[0] - a[0]) * f), y = Y(a[1] + (b[1] - a[1]) * f);
                g.fillStyle = '#ffffff'; g.shadowColor = col; g.shadowBlur = 6 * dpr;
                g.fillRect(x - 1.5 * dpr, y - 1.5 * dpr, 3 * dpr, 3 * dpr); g.shadowBlur = 0;
                break;
              }
              d -= L;
            }
          }
          const st = ps[0];
          g.fillStyle = '#ff2a6d'; g.fillRect(X(st[0]) - 2 * dpr, Y(st[1]) - 4 * dpr, 4 * dpr, 8 * dpr);
        });
        const core = r.pts[0][r.pts[0].length - 1];
        g.strokeStyle = '#ffffff'; g.lineWidth = 1.2 * dpr; g.strokeRect(X(core[0]) - 4 * dpr, Y(core[1]) - 4 * dpr, 8 * dpr, 8 * dpr);
      }
      if (!motion.reduced) requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  // Glowing credit chips arc from a kill (client coords) into the HUD counter.
  flyCredits(x, y, amount) {
    if (motion.reduced || document.hidden) return;
    this.flyers = this.flyers || 0;
    const n = amount >= 50 ? 5 : amount >= 15 ? 2 : 1;
    const glyph = this.els.creditsStat.querySelector('.cr') || this.els.creditsStat;
    const tr = glyph.getBoundingClientRect();
    const tx = tr.left + tr.width / 2 - 4.5, ty = tr.top + tr.height / 2 - 4.5;
    for (let i = 0; i < n && this.flyers < 18; i++) {
      this.flyers++;
      const el = document.createElement('i');
      el.className = 'coin';
      document.body.appendChild(el);
      const sx = x - 4.5 + (Math.random() - 0.5) * 14, sy = y - 4.5 + (Math.random() - 0.5) * 14;
      const mx = sx + (Math.random() - 0.5) * 120, my = Math.min(sy, ty) - 30 - Math.random() * 60;
      const at = (px, py, s) => `translate(${px}px, ${py}px) rotate(45deg) scale(${s})`;
      const anim = el.animate([
        { transform: at(sx, sy, 0.2), opacity: 0 },
        { transform: at(sx, sy - 10, 1.25), opacity: 1, offset: 0.12 },
        { transform: at(mx, my, 1), opacity: 1, offset: 0.5 },
        { transform: at(tx, ty, 0.6), opacity: 0.9 },
      ], { duration: 620 + Math.random() * 220, delay: i * 70, easing: 'cubic-bezier(.45,0,.8,.6)', fill: 'backwards' });
      anim.onfinish = anim.oncancel = () => {
        el.remove();
        this.flyers--;
        this.bump(this.els.creditsStat, 'catch');
        this.onCoin?.();
      };
    }
  }

  // ── Upgrade cards ──
  // Three cards dealt face-down, flipping up one after another. Rarity colours the frame;
  // tower cards show the tower itself, the rest an icon.
  showCards(offer) {
    let box = document.getElementById('cards');
    if (!box) {
      box = document.createElement('div');
      box.id = 'cards'; box.className = 'cards';
      this.els.viewport.appendChild(box);
      box.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-reroll]')) { this.ctl.rerollCards?.(); return; }
        const b = ev.target.closest('.ucard');
        if (b && !box.classList.contains('picking')) this.ctl.chooseCard?.(+b.dataset.i);
      });
      box.addEventListener('pointermove', (ev) => {
        const b = ev.target.closest('.ucard');
        if (!b || motion.reduced) return;
        const r = b.getBoundingClientRect();
        b.style.setProperty('--ry', (((ev.clientX - r.left) / r.width - 0.5) * 16).toFixed(1) + 'deg');
        b.style.setProperty('--rx', ((0.5 - (ev.clientY - r.top) / r.height) * 12).toFixed(1) + 'deg');
      });
      box.addEventListener('pointerout', (ev) => {
        const b = ev.target.closest('.ucard');
        if (b && !b.contains(ev.relatedTarget)) { b.style.removeProperty('--rx'); b.style.removeProperty('--ry'); }
      });
    }
    const RAR = { common: '#7fe9ff', rare: '#c561ff', epic: '#ffb800' };
    const rr = this.game.rerolls > 0 ? `<button class="cards-reroll" data-reroll="1">⟳ Reroll · ${this.game.rerolls} left</button>` : '';
    box.innerHTML = `<div class="cards-head"><span class="ck">Data cache recovered</span><b>Choose one upgrade</b><span class="ch">for the rest of this run · ${offer.map((_, i) => i + 1).join(' · ')}</span></div>
      <div class="cards-row">${offer.map((c, i) => `<button class="ucard ${c.rarity}" data-i="${i}" style="--r:${RAR[c.rarity]};--c:${c.tower ? TOWERS[c.tower].color : RAR[c.rarity]};--d:${i * 120}ms">
        <span class="uc-rar">${c.rarity}</span><span class="uc-key">${i + 1}</span>
        <span class="uc-art">${c.tower ? '<canvas width="120" height="120"></canvas>' : cardIcon(c.id)}</span>
        <span class="uc-name">${c.name}</span><span class="uc-desc">${c.desc}</span>
        ${c.tower ? `<span class="uc-tag">${TOWERS[c.tower].name}</span>` : ''}
      </button>`).join('')}</div>${rr}`;
    box.querySelectorAll('.ucard').forEach((b, i) => {
      const c = offer[i], cv = b.querySelector('canvas');
      if (!cv || !c.tower) return;
      const g = cv.getContext('2d');
      g.scale(2.6, 2.6);
      drawTower(g, { type: c.tower, stats: towerStats(c.tower, [0, 0]), x: 23, y: 22, angle: -0.8, recoil: 0, spin: 0, level: 3, spawnT: 1, id: 2, cooldown: 0, barrel: 0, upgradeFlash: 0, layT: 0 }, 1.2);
    });
    box.classList.remove('picking');
    box.hidden = false;
    this.bump(box, 'show');
  }

  // the chosen card lifts and flies to the strip; the others drop away
  pickCard(i, picked) {
    const box = document.getElementById('cards');
    if (box && !box.hidden) {
      box.classList.add('picking');
      box.querySelectorAll('.ucard').forEach((b, k) => b.classList.add(k === i ? 'chosen' : 'gone'));
      setTimeout(() => { box.hidden = true; box.classList.remove('show', 'picking'); }, motion.reduced ? 50 : 650);
    }
    this.renderPicked(picked);
  }

  hideCards() {
    const box = document.getElementById('cards');
    if (box) { box.hidden = true; box.classList.remove('show', 'picking'); }
  }

  // strip of upgrades taken this run (stacked by card), top-left of the board
  renderPicked(picked = []) {
    let strip = document.getElementById('picked');
    if (!strip) {
      strip = document.createElement('div');
      strip.id = 'picked'; strip.className = 'picked';
      this.els.viewport.appendChild(strip);
    }
    const counts = {};
    for (const id of picked) counts[id] = (counts[id] || 0) + 1;
    const RAR = { common: '#7fe9ff', rare: '#c561ff', epic: '#ffb800' };
    strip.innerHTML = Object.entries(counts).map(([id, n]) => {
      const c = CARDS.find((x) => x.id === id);
      return `<span class="pk" style="--r:${RAR[c.rarity]};--c:${c.tower ? TOWERS[c.tower].color : RAR[c.rarity]}" title="${c.name} — ${c.desc}">${cardIcon(c.id, c.tower)}${n > 1 ? `<i>×${n}</i>` : ''}</span>`;
    }).join('');
    strip.hidden = !picked.length;
  }

  // achievement unlocked: a toast slides in at the top right
  toast(a) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast hudbox';
    el.innerHTML = `<span class="ach-ic">${achIcon(a.icon)}</span>
      <span class="ach-t"><em>Achievement unlocked</em><b>${a.name}</b><span>${a.desc}</span></span>`;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  // the active sector rule, as a chip in the corner of the board (hover/tap for the details)
  setRule(rule) {
    let chip = document.getElementById('rule-chip');
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'rule-chip'; chip.className = 'rule-chip';
      this.els.viewport.appendChild(chip);
    }
    chip.hidden = !rule;
    if (!rule) return;
    chip.style.setProperty('--r', rule.color);
    chip.innerHTML = `<b>${rule.name}</b><span>${rule.desc}</span>`;
    chip.title = rule.desc;
  }

  bump(el, cls = 'bump') {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  update(dt) {
    const g = this.game, v = this.view, e = this.els;

    const cr = Math.floor(g.credits);
    if (cr !== this.prev.credits) {
      if (this.prev.credits === undefined) this.shownCr = cr;
      else if (cr > this.prev.credits) this.bump(e.creditsStat);
      this.prev.credits = cr;
      for (const type of TOWER_ORDER) this.cards[type].classList.toggle('disabled', cr < TOWERS[type].cost);
    }
    // the readout rolls toward the real balance instead of jumping
    if (this.shownCr !== cr || this.shownTxt === undefined) {
      const d = cr - this.shownCr;
      this.shownCr = Math.abs(d) < 1 ? cr : this.shownCr + d * Math.min(1, dt * 11);
      const v = Math.round(this.shownCr);
      if (v !== this.shownTxt) { e.credits.textContent = fmt(v); this.shownTxt = v; }
    }
    if (g.wave !== this.prev.wave) { e.waveNum.textContent = g.wave; this.prev.wave = g.wave; }
    const tot = g.endless ? '∞' : g.totalWaves;
    if (tot !== this.prev.totalWaves) { e.waveTotal.textContent = tot; this.prev.totalWaves = tot; }
    const tagKey = g.difficulty + g.mode;
    if (tagKey !== this.prev.difficulty) {
      const d = g.diff, tag = g.mode === 'daily' ? ['Daily', g.mut.color || d.color] : [g.endless ? 'Endless · ' + d.name : d.name, d.color];
      e.waveNum.closest('.stat').querySelector('label').innerHTML = `Wave <span class="diff-tag" style="--c:${tag[1]}">${tag[0]}</span>`;
      e.scoreStat.hidden = g.mode === 'campaign';
      this.prev.difficulty = tagKey;
    }
    if (g.mode !== 'campaign' && g.score !== this.prev.score) {
      e.score.textContent = Math.round(g.score).toLocaleString('en-US');
      this.prev.score = g.score;
    }
    if (g.lives !== this.prev.lives) {
      if (this.prev.lives !== undefined && g.lives < this.prev.lives) this.bump(e.livesStat, 'hit');
      e.lives.textContent = g.lives;
      e.livesBar.style.width = (g.lives / g.maxLives) * 100 + '%';
      e.livesStat.classList.toggle('low', g.lives <= g.maxLives * 0.3);
      this.prev.lives = g.lives;
    }
    this.updateAbilities();
    if (v.placing !== this.prev.placing) {
      for (const type of TOWER_ORDER) this.cards[type].classList.toggle('active', v.placing === type);
      this.prev.placing = v.placing;
    }

    // wave call-to-action
    let key;
    if (!v.started || g.over) key = 'none';
    else if (g.state === 'ready') key = 'ready';
    else if (g.state === 'break') key = 'break' + Math.ceil(g.breakTimer);
    else key = 'wave' + g.hostilesLeft;
    if (key !== this.prev.cta) {
      this.prev.cta = key;
      const next = g.wave + 1;
      if (key === 'none') e.cta.innerHTML = '';
      else if (g.state === 'ready') e.cta.innerHTML = this.nextWavePreview(next) + `<button class="cta hudbox pulse" data-act="wave"><span class="tri"></span>Run wave ${next}<kbd>Space</kbd></button>`;
      else if (g.state === 'break') {
        const s = Math.ceil(g.breakTimer);
        e.cta.innerHTML = this.nextWavePreview(next) + `<button class="cta hudbox" data-act="wave"><span class="tri"></span>Wave ${next} in ${s}s · Run now <span class="bonus">+${s * 3}${CR}</span></button>`;
      } else e.cta.innerHTML = `<div class="cta-info"><span class="dot"></span>Wave ${g.wave} · <b>${g.hostilesLeft}</b> threats</div>`;
    }

    this.updatePanel(dt);
  }

  // What's coming next — shown between waves so saving vs. upgrading is an informed choice
  nextWavePreview(w) {
    if (w > this.game.waves.length) return '';
    const counts = {};
    for (const [type, n] of this.game.waves[w - 1]) counts[type] = (counts[type] || 0) + this.game.scaledCount(type, n, w);
    const items = Object.entries(counts).map(([type, n]) => {
      const d = ENEMIES[type];
      const label = d.boss ? d.name : `<b>${n}</b> ${n > 1 ? d.plural : d.name}`;
      return `<span class="nw-item" style="--c:${d.color}"><i class="ico ${type}"></i>${label}<em>${d.trait}</em></span>`;
    }).join('');
    const hp = waveHpMult(w, this.game.map.def.hpCurve) * this.game.diffFactor('hp', w);
    return `<div class="next-wave"><span class="nw-label">Next</span>${items}${hp > 1.05 ? `<span class="nw-hp">HP ×${hp.toFixed(1)}</span>` : ''}</div>`;
  }

  // ── Tower panel ─────────────────────────────────────────
  updatePanel(dt) {
    const t = this.view.selected, p = this.els.panel;
    if (!t || !this.game.towers.includes(t)) {
      if (t) this.view.selected = null;
      if (this.panelKey) { p.hidden = true; this.panelKey = ''; }
      return;
    }
    const opts = upgradeOptions(t.type, t.path);
    const arm = this.view.sellArm;
    if (arm && performance.now() > arm.until) this.view.sellArm = null;
    const armed = !!(this.view.sellArm && this.view.sellArm.id === t.id);
    const key = t.id + ':' + t.level + ':' + opts.map((o) => (this.game.credits >= this.game.costOf(o, t) ? 1 : 0)).join('') + ':' + (armed ? 'A' : '') + ':' + t.targeting;
    if (key !== this.panelKey) {
      const isNew = !this.panelKey.startsWith(t.id + ':');
      const keepPreview = !isNew && this.panelKey.split(':')[1] === String(t.level);
      this.panelKey = key;
      this.renderPanel(t, opts, armed);
      if (isNew) { this.bump(p, 'pop'); this.countUp(p); }
      if (!keepPreview) this.view.previewStats = null;
      this.positionPanel();
    }
    this.liveT -= dt;
    if (this.liveT <= 0) {
      this.liveT = 0.25;
      const d = p.querySelector('[data-live="dealt"]'), k = p.querySelector('[data-live="kills"]');
      if (d) d.textContent = fmt(t.dealt);
      if (k) k.textContent = fmt(t.kills);
    }
  }

  renderPanel(t, opts, armed = false) {
    const s = t.stats, def = TOWERS[t.type], p = this.els.panel;
    const names = pathNames(t.type, t.path);
    const crumbs = [`<span>Lv ${t.level}</span>`, ...names.map((n) => `<span>${n}</span>`)].join('<i>›</i>');
    let up;
    if (opts.length) {
      up = `<div class="p-sec">Evolve to level ${t.level + 1} <em>choose one path</em></div><div class="p-upgrades">` +
        opts.map((o, i) => {
          const ns = this.game.statsFor(t.type, [...t.path, i]);
          const diff = diffLine(s, ns);
          const ok = this.game.credits >= this.game.costOf(o, t);
          return `<button class="upg hudbox${ok ? '' : ' locked'}" data-act="upgrade" data-i="${i}" style="--c:${o.color}">
            <span class="u-key">${i === 0 ? 'Q' : 'E'}</span>
            <span class="u-name">${o.name}</span><span class="u-desc">${o.desc}</span>
            ${diff ? `<span class="u-diff">${diff}</span>` : ''}
            <span class="u-cost">${CR}${this.game.costOf(o, t)}</span></button>`;
        }).join('') + '</div>';
    } else {
      up = `<div class="p-max"><span>★</span> Fully evolved</div>`;
    }
    p.style.setProperty('--c', s.color);
    p.innerHTML = `
      <div class="p-head">
        <div class="p-title"><div class="p-name">${def.name}</div><div class="p-crumbs">${crumbs}</div></div>
        <button class="p-close" data-act="close" aria-label="Close">✕</button>
      </div>
      <div class="p-stats">${statRows(s).map(([k, v]) => `<div class="ps"><label>${k}</label><b>${v}</b></div>`).join('')}</div>
      <div class="p-tags">${statTags(s).map((x) => `<span class="tag">${x}</span>`).join('')}</div>
      ${s.kind === 'pulse' || s.kind === 'nova' ? '' : `<div class="p-target"><label>Target<kbd>T</kbd></label><div class="seg">${TARGET_MODES.map((m) =>
        `<button data-act="target" data-mode="${m}" class="${t.targeting === m ? 'on' : ''}" title="${TARGET_HINTS[m]}">${m}</button>`).join('')}</div></div>`}
      <div class="p-meter">Damage dealt <b data-live="dealt">${fmt(t.dealt)}</b> · Kills <b data-live="kills">${fmt(t.kills)}</b></div>
      ${up}
      ${armed
        ? `<button class="p-sell armed" data-act="sell">Confirm sell <b>+${Math.floor(t.invested * this.game.sellRatio)}${CR}</b><kbd>S</kbd></button>`
        : `<button class="p-sell" data-act="sell">Sell <b>+${Math.floor(t.invested * this.game.sellRatio)}${CR}</b><kbd>S</kbd></button>`}`;
    p.hidden = false;
  }

  positionPanel() {
    const t = this.view.selected, p = this.els.panel;
    if (!t || p.hidden) return;
    if (window.innerWidth < 760) { p.style.left = ''; p.style.top = ''; return; }
    const vp = this.els.viewport;
    const k = vp.clientWidth / WORLD_W;
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const x = t.x * k, y = t.y * k, gap = 30 * k;
    let left = x + gap;
    if (left + pw > vp.clientWidth - 8) left = x - gap - pw;
    p.style.left = clamp(left, 8, vp.clientWidth - pw - 8) + 'px';
    p.style.top = clamp(y - ph / 2, 8, Math.max(8, vp.clientHeight - ph - 8)) + 'px';
  }

  // ── Banners & overlays ──────────────────────────────────
  // Boss name card: same banner slot, bigger, with a warning kicker
  bossCard(name, sub) {
    const b = this.els.banner;
    b.classList.add('boss');
    b.style.setProperty('--bc', '#ff2a6d');
    b.innerHTML = `<div class="b-rule"></div><div class="b-kicker">⚠ Hostile process escalated</div>
      <div class="b-title glitch" data-text="${name}">${name}</div><div class="b-sub">${sub}</div><div class="b-rule"></div>`;
    this.bump(b, 'show');
  }

  banner(title, sub = '', color = '#8b6cff') {
    const b = this.els.banner;
    b.classList.remove('boss');
    b.style.setProperty('--bc', color);
    b.innerHTML = `<div class="b-rule"></div><div class="b-title">${title}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}<div class="b-rule"></div>`;
    this.bump(b, 'show');
  }

  showOverlay(kind, data = {}) {
    const o = this.els.overlay;
    let html = '';
    const stars = (n) => `<span class="stars">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
    const again = `<div class="ov-actions"><button class="btn-primary hudbox" data-act="restart">%s</button>
        <button class="btn-ghost" data-act="menu">Sectors</button></div>`;
    if (kind === 'start') {
      const { maps, records = {}, current, difficulty = 'normal', unlocked = {}, cleared = {} } = data;
      const mode = data.mode || 'campaign', endless = mode === 'endless';
      const D = DIFFICULTIES[difficulty];
      const tabs = `<div class="mode-tabs" role="tablist">${[['campaign', 'Campaign', 'Ten sectors'], ['endless', 'Endless', 'No last wave'], ['daily', 'Daily', 'Same for everyone']]
        .map(([k, n, sub]) => `<button class="mt${k === mode ? ' on' : ''}" role="tab" aria-selected="${k === mode}" data-act="mode" data-arg="${k}"><b>${n}</b><span>${sub}</span></button>`).join('')}</div>`;
      const picker = `<div class="diff-pick">
          <div class="dp-seg">${DIFFICULTY_ORDER.map((k) => `<button class="dp${k === difficulty ? ' on' : ''}" data-act="difficulty" data-arg="${k}" style="--c:${DIFFICULTIES[k].color}">${DIFFICULTIES[k].name}</button>`).join('')}</div>
          <div class="dp-desc" style="--c:${D.color}">${D.desc}</div>
        </div>`;
      const accent = (m) => (m.theme && m.theme.ambient && m.theme.ambient[0]) || '#00e5ff';
      const nDone = maps.filter((m) => cleared[m.id]).length;
      const head = `<div class="camp-head"><span>${mode === 'daily' ? 'Daily' : endless ? 'Endless' : 'Campaign'}</span><i class="camp-bar"><i style="width:${(nDone / maps.length) * 100}%"></i></i><b>${nDone}/${maps.length} sectors secured</b>
          <button class="lab-btn${data.labNew ? ' new' : ''}" data-act="lab"><i class="dt"></i>${data.data ?? 0} Data · Research</button>
          <button class="lab-btn ach-btn" data-act="achievements">★ ${data.ach ? data.ach[0] : 0}/${data.ach ? data.ach[1] : 0}</button></div>`;
      let body;
      if (mode === 'daily') {
        const d = data.daily, m = d.map, rec = d.rec, mut = d.mut, rule = m.rule && RULES[m.rule];
        const now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const left = Math.max(0, mid - now), hh = Math.floor(left / 3600e3), mm = Math.floor((left % 3600e3) / 60e3);
        body = `<div class="camp-detail daily hudbox" style="--c:${mut.color}">
          <canvas class="s-map big" data-map="${m.id}" aria-hidden="true"></canvas>
          <div class="cd-body">
            <div class="s-top"><span class="s-name">Daily challenge</span><span class="s-diff">${d.key}</span></div>
            <div class="cd-title">${m.name} · ${m.title}</div>
            <div class="cd-rule" style="--r:${mut.color}"><b>Today's twist · ${mut.name}</b>${mut.desc}</div>
            ${rule ? `<div class="cd-rule" style="--r:${rule.color}"><b>Rule · ${rule.name}</b>${rule.desc}</div>` : ''}
            <div class="s-meta"><b style="color:${d.diff.color}">${d.diff.name}</b> · ${m.waves.length} waves · every tower open · research off · same cards for everyone</div>
            <div class="s-meta">Score: kills, cleared waves, early calls, and a bonus for every Core integrity left on a win.</div>
            <div class="daily-stats">
              <div><label>Best today</label><b>${rec.best ? rec.best.toLocaleString('en-US') : '—'}</b></div>
              <div><label>Runs today</label><b>${rec.runs}</b></div>
              <div><label>Streak</label><b>${rec.streak} day${rec.streak === 1 ? '' : 's'}</b></div>
            </div>
            <div class="cd-foot">
              <span class="s-rec"><span>New challenge in ${hh}h ${String(mm).padStart(2, '0')}m</span></span>
              <button class="btn-primary hudbox cd-go" data-act="start">${rec.runs ? 'Run it again ▸' : 'Run today ▸'}</button>
            </div>
          </div>
        </div>`;
      } else {
        const erec = data.endless || {}, eopen = data.endlessOpen || {};
        // sector nodes: number, title, then stars/medals (campaign) or best wave (endless), or a lock
        const nodes = maps.map((m, i) => {
          const seen = unlocked[m.id], open = endless ? eopen[m.id] : seen, rec = endless ? erec[m.id] : records[m.id];
          const cls = `sector node hudbox${m.id === current ? ' sel' : ''}${open ? '' : ' locked'}${cleared[m.id] ? ' done' : ''}`;
          const recHtml = !open ? '<i class="lock"></i>' : endless ? (rec ? `<span class="n-wave">w${rec.wave}</span>` : '')
            : rec && rec.stars ? stars(rec.stars) : cleared[m.id] ? '<span class="n-clear">cleared</span>' : rec ? `<span class="n-wave">w${rec.wave}</span>` : '';
          return `<button class="${cls}" data-act="pick" data-arg="${m.id}" style="--c:${open ? accent(m) : '#3d5866'}" aria-label="${m.name} ${m.title}${open ? '' : ' (locked)'}">
          <canvas class="s-map" data-map="${m.id}" aria-hidden="true"></canvas>
          <span class="n-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="n-title">${seen ? m.title : 'Locked'}</span>
          ${open && !endless ? `<span class="n-medals">${(data.medals?.[m.id] || []).map((x) => `<i class="${x ? 'on' : ''}"></i>`).join('')}</span>` : ''}
          <span class="n-rec">${recHtml}</span>
        </button>`;
        }).join('');
        // detail of the selected sector
        const sel = maps.find((m) => m.id === current) || maps[0];
        const si = maps.indexOf(sel), open = endless ? eopen[sel.id] : unlocked[sel.id], rec = endless ? erec[sel.id] : records[sel.id];
        const types = [...new Set(sel.waves.flat().map((g) => g[0]))].filter((t) => ENEMIES[t]);
        const threats = types.map((t) => `<span class="nw-item" style="--c:${ENEMIES[t].color}" title="${ENEMIES[t].trait}"><i class="ico ${t}"></i>${ENEMIES[t].plural}</span>`).join('');
        const recHtml = endless ? (rec ? `<span>Best on ${D.name}: <b>wave ${rec.wave}</b> · ${rec.score.toLocaleString('en-US')} pts</span>` : '<span class="s-none">No Endless run on ' + D.name + '</span>')
          : !rec ? '<span class="s-none">No record on ' + D.name + '</span>'
          : rec.stars ? `${stars(rec.stars)}<span>Secured on ${D.name}</span>` : `<span>Best on ${D.name}: wave ${rec.wave}/${sel.waves.length}</span>`;
        const lockHtml = endless ? `<i class="lock"></i><span>Clear ${sel.name} · ${unlocked[sel.id] ? sel.title : 'this sector'} in the campaign to open its Endless run</span>`
          : `<i class="lock"></i><span>Clear ${maps[si - 1]?.name} · ${maps[si - 1]?.title} to unlock</span>`;
        const meta = endless ? `${sel.paths.length} breach${sel.paths.length > 1 ? 'es' : ''} · its ${sel.waves.length} waves, then it never stops · a Leviathan every 5th wave beyond`
          : `${sel.paths.length} breach${sel.paths.length > 1 ? 'es' : ''} · ${sel.waves.length} waves${types.includes('boss') ? ' · <b class="cd-boss">boss</b>' : ''}`;
        const detail = `<div class="camp-detail hudbox${open ? '' : ' locked'}${endless ? ' endless' : ''}" style="--c:${open ? accent(sel) : '#3d5866'}">
          <canvas class="s-map big" data-map="${sel.id}" aria-hidden="true"></canvas>
          <div class="cd-body">
            <div class="s-top"><span class="s-name">${sel.name}</span><span class="s-diff">${endless ? 'Endless' : sel.difficulty}</span></div>
            <div class="cd-title">${unlocked[sel.id] ? sel.title : 'Locked'}</div>
            <div class="s-desc">${endless ? 'Hold the line as long as you can. Waves keep coming, denser and tougher, until the Core falls. Score: kills, waves and early calls.' : sel.desc}</div>
            ${sel.rule && RULES[sel.rule] ? `<div class="cd-rule" style="--r:${RULES[sel.rule].color}"><b>Rule · ${RULES[sel.rule].name}</b>${RULES[sel.rule].desc}</div>` : ''}
            <div class="s-meta">${meta}</div>
            <div class="cd-threats">${threats}</div>
            ${!endless && sel.medals && open ? `<div class="cd-medals">${sel.medals.map(([k, n], i) => { const got = data.medals?.[sel.id]?.[i]; return `<span class="cdm${got ? ' on' : ''}" title="${data.medalDefs[k].desc(n)}"><i></i><b>${data.medalDefs[k].name}</b> ${data.medalDefs[k].desc(n)}</span>`; }).join('')}<span class="cdm-note">Normal or harder · +15 Data each</span></div>` : ''}
            ${endless ? '' : TOWER_ORDER.filter((t) => TOWERS[t].unlock === sel.id).map((t) => `<div class="cd-reward" style="--r:${TOWERS[t].color}">Clear to unlock · <b>${TOWERS[t].name}</b></div>`).join('')}
            <div class="cd-foot">
              <span class="s-rec">${open ? recHtml : lockHtml}</span>
              ${open ? `<button class="btn-primary hudbox cd-go" data-act="start" data-arg="${sel.id}">${endless ? 'Enter the void ▸' : 'Jack in ▸'}</button>` : ''}
            </div>
          </div>
        </div>`;
        body = `<div class="camp-grid">${nodes}</div>${detail}`;
      }
      html = `<div class="ov-card campaign mode-${mode}">
        <div class="ov-kicker">Pixo Arcade // Tower Defense</div>
        <h1 class="ov-title glitch" data-text="VOID//WARDENS">VOID<span class="sl">//</span>WARDENS</h1>
        <p class="ov-tag">A breach has opened in the grid. Hostile code is pouring through. Keep it away from the Core.</p>
        ${tabs}
        ${mode === 'daily' ? '' : picker}
        ${head}
        ${body}
        <div class="ov-help">
          <div><b>1–7</b> Pick a tower, click an empty tile to deploy</div>
          <div><b>Evolve</b> Every upgrade is a choice between two paths</div>
          <div><b>Space</b> Run waves early for bonus credits</div>
        </div></div>`;
    } else if (kind === 'pause') {
      html = `<div class="ov-card"><div class="ov-kicker">Process suspended</div><h2 class="ov-h2 glitch" data-text="Paused">Paused</h2>
        <button class="btn-primary hudbox" data-act="resume">Resume</button>
        <div class="ov-actions"><button class="btn-ghost" data-act="restart">Restart</button><button class="btn-ghost" data-act="menu">Sectors</button></div>
        <div class="diff-pick fx-pick"><div class="fx-label">Graphics <kbd>G</kbd></div>
          <div class="dp-seg">${['auto', 'high', 'medium', 'low'].map((m) => `<button class="dp${m === data.fx ? ' on' : ''}" data-act="setFx" data-arg="${m}" style="--c:#00e5ff">${m}</button>`).join('')}</div>
          <div class="dp-desc" style="--c:#00e5ff">${!data.webgl ? 'WebGL unavailable · bloom and post effects off' : data.fx === 'auto' ? `Adapts to your device · now ${data.tier}` : { high: 'Full resolution · bloom, lighting, reflections, lens dirt', medium: 'Lower resolution · bloom and lighting, no reflections', low: 'Base resolution · no bloom, lighting or reflections, light weather' }[data.fx]}</div>
        </div>
        <div class="comfort"><div class="fx-label">Comfort</div>
          ${[['shake', 'Screen shake'], ['flash', 'Flashes']].map(([k, label]) => {
            const v = Math.round((data.comfort?.[k] ?? 1) * 100);
            return `<label class="slider"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${v}" data-comfort="${k}"><b>${v}%</b></label>`;
          }).join('')}
          <div class="comfort-presets"><button class="btn-ghost" data-act="comfortPreset" data-arg="calm">Calm</button><button class="btn-ghost" data-act="comfortPreset" data-arg="full">Full</button></div>
        </div></div>`;
    } else if (kind === 'win') {
      const nx = data.next;
      const unlockLine = nx ? `<div class="ov-unlock${nx.fresh ? ' fresh' : ''}">${nx.fresh ? '▸ New sector unlocked' : '▸ Up next'} · <b>${nx.name} · ${nx.title}</b></div>`
        : data.final ? '<div class="ov-unlock fresh">▸ Campaign complete · <b>the grid is secure</b></div>' : '';
      html = `<div class="ov-card win"><div class="ov-kicker">${data.sector} · ${data.diff.name} · Breach sealed</div><h2 class="ov-h2 glitch" data-text="${data.final ? 'Kernel secured' : 'System secure'}">${data.final ? 'Kernel secured' : 'System secure'}</h2>
        <div class="ov-stars">${stars(data.stars)}</div>
        <div class="ov-stats"><div><label>Core</label><b>${data.lives}/${data.maxLives}</b></div><div><label>Kills</label><b>${data.kills}</b></div><div><label>Towers</label><b>${data.towers}</b></div></div>
        ${data.medals && data.medals.length ? `<div class="ov-medals">${data.medals.map((m) => `<span class="om${m.earned ? ' on' : ''}${m.fresh ? ' fresh' : ''}" title="${m.desc}"><i></i>${m.name}</span>`).join('')}</div>`
          : data.diff && data.diff.name === 'Easy' ? '<div class="ov-medals note">Medals need Normal or harder</div>' : ''}
        ${data.data ? `<div class="ov-data"><i class="dt"></i>+${data.data.earned + (data.data.medals || 0)} Data${data.data.medals ? ` <span>(${data.data.medals} from medals)</span>` : ''} <span>· ${data.data.total} total</span></div>` : ''}
        ${unlockLine}
        ${(data.newTowers || []).map((n) => `<div class="ov-unlock fresh tower">▸ New tower unlocked · <b>${n}</b></div>`).join('')}
        ${data.endlessNew ? `<div class="ov-unlock fresh endless">▸ Endless opened · <b>${data.endlessNew}</b></div>` : ''}
        ${nx ? `<div class="ov-actions"><button class="btn-primary hudbox" data-act="start" data-arg="${nx.id}">Next sector ▸</button>
          <button class="btn-ghost" data-act="restart">Play again</button><button class="btn-ghost" data-act="menu">Sectors</button></div>` : again.replace('%s', 'Play again')}
        <button class="btn-ghost share" data-act="share">Share screenshot</button></div>`;
    } else if (kind === 'ach') {
      const done = data.list.filter((a) => a.done).length;
      html = `<div class="ov-card achs"><div class="ov-kicker">Warden service record</div>
        <h2 class="ov-h2">Achievements</h2>
        <div class="lab-bal"><b>${done}</b>/ ${data.list.length} unlocked</div>
        <div class="ach-grid">${data.list.map((a) => `<div class="ach${a.done ? ' done' : ''}">
          <span class="ach-ic">${achIcon(a.icon)}</span>
          <span class="ach-t"><b>${a.name}</b><span>${a.desc}</span>${a.goal && !a.done ? `<i class="ach-bar"><i style="width:${(a.prog / a.goal) * 100}%"></i></i><em>${a.prog} / ${a.goal}</em>` : ''}</span>
        </div>`).join('')}</div>
        <button class="btn-ghost" data-act="labBack">◂ Back to campaign</button></div>`;
    } else if (kind === 'lab') {
      const own = new Set(data.owned || []);
      const cols = RESEARCH.map((b) => `<div class="lab-col" style="--c:${b.color}"><div class="lab-branch">${b.branch}</div>
        ${b.nodes.map((n, i) => {
          const has = own.has(n.id), prev = i === 0 || own.has(b.nodes[i - 1].id), afford = data.data >= n.cost;
          const st = has ? 'owned' : !prev ? 'locked' : afford ? 'ready' : 'poor';
          return `<button class="lab-node hudbox ${st}${n.id === data.fresh ? ' fresh' : ''}" data-act="buy" data-arg="${n.id}" ${has || st === 'locked' ? 'disabled' : ''}>
            <span class="ln-tier">T${i + 1}</span><span class="ln-name">${n.name}</span><span class="ln-desc">${n.desc}</span>
            <span class="ln-cost">${has ? '✓ Installed' : st === 'locked' ? 'Requires ' + b.nodes[i - 1].name : `<i class="dt"></i>${n.cost}`}</span></button>`;
        }).join('<i class="lab-link"></i>')}</div>`).join('');
      html = `<div class="ov-card lab"><div class="ov-kicker">Warden research lab</div>
        <h2 class="ov-h2">Research</h2>
        <div class="lab-bal"><i class="dt"></i><b>${data.data}</b> Data <span>· earned every run — more for waves cleared, wins, stars and harder difficulties</span></div>
        <div class="lab-grid">${cols}</div>
        <button class="btn-ghost" data-act="labBack">◂ Back to campaign</button></div>`;
    } else if (kind === 'endless') {
      html = `<div class="ov-card lose endless-res"><div class="ov-kicker">Endless · ${data.sector} · ${data.title} · ${data.diff.name}</div>
        <h2 class="ov-h2 glitch" data-text="Signal lost">Signal lost</h2>
        <div class="ov-score"><label>Fell on</label><b>Wave ${data.wave}</b>${data.better ? '<em>New best</em>' : data.prev ? `<span>Best: wave ${data.prev.wave}</span>` : '<em>First run</em>'}</div>
        <div class="ov-stats"><div><label>Score</label><b>${data.score.toLocaleString('en-US')}</b></div><div><label>Kills</label><b>${data.kills}</b></div><div><label>Past the campaign</label><b>${data.beyond} wave${data.beyond === 1 ? '' : 's'}</b></div></div>
        ${data.data ? `<div class="ov-data"><i class="dt"></i>+${data.data.earned} Data <span>· ${data.data.total} total</span></div>` : ''}
        ${again.replace('%s', 'Go again')}
        <button class="btn-ghost share" data-act="share">Share screenshot</button></div>`;
    } else if (kind === 'daily') {
      html = `<div class="ov-card ${data.won ? 'win' : 'lose'} daily-res" style="--mc:${data.mut.color}"><div class="ov-kicker">Daily · ${data.day} · ${data.sector} · ${data.title}</div>
        <h2 class="ov-h2 glitch" data-text="${data.won ? 'Daily secured' : 'Daily breached'}">${data.won ? 'Daily secured' : 'Daily breached'}</h2>
        <div class="ov-score"><label>Score</label><b>${data.score.toLocaleString('en-US')}</b>${data.newBest ? '<em>New best today</em>' : data.runs > 1 ? `<span>Best today: ${data.best.toLocaleString('en-US')}</span>` : ''}</div>
        ${data.won ? `<div class="ov-stars">${stars(data.stars)}</div>` : ''}
        <div class="ov-stats"><div><label>${data.won ? 'Core' : 'Reached'}</label><b>${data.won ? `${data.lives}/${data.maxLives}` : `Wave ${data.wave}`}</b></div><div><label>Kills</label><b>${data.kills}</b></div><div><label>Streak</label><b>${data.streak} day${data.streak === 1 ? '' : 's'}</b></div></div>
        <div class="ov-unlock" style="--r:${data.mut.color}">Twist · <b>${data.mut.name}</b></div>
        ${data.data ? `<div class="ov-data"><i class="dt"></i>+${data.data.earned} Data <span>· ${data.data.total} total</span></div>` : ''}
        ${again.replace('%s', 'Run it again')}
        <button class="btn-ghost share" data-act="share">Share score</button></div>`;
    } else if (kind === 'lose') {
      html = `<div class="ov-card lose"><div class="ov-kicker">${data.sector} · ${data.diff.name} · Core compromised</div><h2 class="ov-h2 glitch" data-text="System breached">System breached</h2>
        <div class="ov-stats"><div><label>Reached</label><b>Wave ${data.wave}</b></div><div><label>Kills</label><b>${data.kills}</b></div></div>
        ${data.data ? `<div class="ov-data"><i class="dt"></i>+${data.data.earned} Data <span>· ${data.data.total} total</span></div>` : ''}
        ${again.replace('%s', 'Reboot')}</div>`;
    }
    o.innerHTML = html;
    o.className = 'overlay show ' + kind;
    if (kind === 'start') this.startMiniMaps(data.maps || []);
  }

  hideOverlay() { this.els.overlay.className = 'overlay'; }
}
