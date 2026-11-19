// DOM HUD: top stats, tower dock, tower panel with upgrade choices, banners, overlays.
import { RESEARCH, CARDS, RULES, TOWERS, TOWER_ORDER, ENEMIES, START_LIVES, SELL_RATIO, WORLD_W, COLS, ROWS, ABILITIES, ABILITY_ORDER, DIFFICULTIES, DIFFICULTY_ORDER, ENDLESS, towerStats, upgradeOptions, pathNames, waveHpMult } from './config.js';
import { drawTower, motion } from './render.js';
import { TARGET_MODES } from './game.js';
import { t as T, fmt, count, enemyNoun, lang, LANGS } from './i18n.js';

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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// must match the landscape-phone media query in style.css
const PHONE_LANDSCAPE = window.matchMedia?.('(orientation: landscape) and (max-height: 520px)');
const CR = '<i class="cr"></i>';

export function statRows(s) {
  if (s.kind === 'aura') {
    const rows = [[T('FIELD'), fmt(s.range)]];
    if (s.buffRate) rows.push([T('RATE'), `+${Math.round(s.buffRate * 100)}%`]);
    if (s.buffDmg) rows.push([T('DMG'), `+${Math.round(s.buffDmg * 100)}%`]);
    return rows;
  }
  if (s.kind === 'mines') return [[T('DMG'), fmt(s.mineDmg)], [T('MINES'), `${s.maxMines} · ${T('{n}/s', { n: s.rate.toFixed(2) })}`], [T('RANGE'), fmt(s.range)]];
  const mult = s.kind === 'missile' && s.missiles > 1 ? ` ×${s.missiles}` : s.targets > 1 ? ` ×${s.targets}` : '';
  return [
    [T('DMG'), fmt(s.damage) + mult],
    [T('RATE'), T('{n}/s', { n: s.rate < 1 ? s.rate.toFixed(2) : s.rate.toFixed(1) })],
    [T('RANGE'), fmt(s.range)],
  ];
}

const pct = (v) => Math.round(v * 100);
export function statTags(s) {
  const t = [];
  const add = (text, n) => t.push(T(text, { n }));
  if (s.kind === 'rail') add('Piercing beam');
  if (s.kind === 'lance') add('Instant hit');
  if (s.bounces) add('Ricochet ×{n}', s.bounces);
  if (s.execute) add('Executes <{n}% HP', pct(s.execute));
  if (s.vulnMark) add('Marks +{n}% dmg', pct(s.vulnMark));
  if (s.strip) add('Pops shields');
  if (s.kind === 'aura') add('Buffs towers in field');
  if (s.buffRange) add('+{n}% range to field', pct(s.buffRange));
  if (s.buffPierce) add('Field ignores armor');
  if (s.revealField) add('Exposes cloaked');
  if (s.mine) add('+{n} credits / 4s', s.mine);
  if (s.kind === 'mines') add('Blast {n}', fmt(s.mineRadius));
  if (s.mineStun) add('Stun {n}s', s.mineStun);
  if (s.mineSlow) add('Tar {n}% slow', pct(s.mineSlow));
  if (s.chain) add('Chain reaction');
  if (s.mineBurn) add('Burn {n}/s', s.mineBurn);
  if (s.kind === 'chain') add('Chains ×{n}', s.chains);
  if (s.kind === 'nova') add('Hits all in range');
  if (s.kind === 'pulse') add(s.singularity ? 'Rollback pulse' : 'Area pulse');
  if (s.splash && s.kind !== 'pulse') add('Splash {n}', fmt(s.splash));
  if (s.slow) add('Slow {n}%', pct(s.slow));
  if (s.freezeChance) add('Freeze {n}%', pct(s.freezeChance));
  if (s.stunChance) add('Stun {n}%', pct(s.stunChance));
  if (s.vuln) add('+{n}% dmg taken', pct(s.vuln));
  if (s.pull) add('Pulls back');
  if (s.cluster) add('Cluster ×{n}', s.cluster);
  if (s.burn) add('Burn {n}/s', s.burn);
  if (s.pierceArmor) add('Ignores armor');
  if (s.spinUp) add('Spin-up +{n}% rate', pct(s.spinUp));
  if (s.echo) add('Echo strike {n}%', pct(s.echo));
  if (s.hail) add('Hail ×{n}', s.hail);
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
    const label = d.boss ? d.name : `${n} ${enemyNoun(d, n)}`;
    return !seen.has(type) && w > 1 && !d.boss ? T('NEW: {label} ({trait})', { label, trait: d.trait }) : label;
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
        <span class="info"><span class="name">${a.name}</span><span class="ab-cd">${T('Ready')}</span></span><span class="ab-sweep"></span>`;
      btn.addEventListener('click', () => this.ctl.ability(id));
      btn.addEventListener('mouseenter', () => this.showTipHtml(btn, a.color,
        `<div class="t-name">${a.name}</div><div class="t-desc">${a.desc}</div><div class="t-hint">${T('Cooldown {n}s · key {k}', { n: a.cooldown, k: a.key })}</div>`));
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
      btn.querySelector('.ab-cd').textContent = v.ability === id ? T('Click the bus') : ready ? T('Ready') : T('{n}s', { n: Math.ceil(left) });
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
        <div class="t-hint">${T('Locked · clear {sector} · {title} to unlock', { sector: lock.name, title: lock.title })}</div>`;
      tip.hidden = false;
      const r = btn.getBoundingClientRect();
      tip.style.left = clamp(r.left + r.width / 2 - tip.offsetWidth / 2, 8, window.innerWidth - tip.offsetWidth - 8) + 'px';
      tip.style.top = r.top - tip.offsetHeight - 10 + 'px';
      return;
    }
    tip.innerHTML = `<div class="t-name">${def.name}</div><div class="t-desc">${def.desc}</div>
      <div class="t-stats">${statRows(s).map(([k, v]) => `<span><label>${k}</label>${v}</span>`).join('')}</div>
      <div class="t-tags">${statTags(s).map((x) => `<span class="tag">${x}</span>`).join('')}</div>
      <div class="t-hint">${T('2 evolution paths · 4 final forms')}</div>`;
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
    const rr = this.game.rerolls > 0 ? `<button class="cards-reroll" data-reroll="1">${T('⟳ Reroll · {n} left', { n: this.game.rerolls })}</button>` : '';
    box.innerHTML = `<div class="cards-head"><span class="ck">${T('Data cache recovered')}</span><b>${T('Choose one upgrade')}</b><span class="ch">${T('for the rest of this run · {keys}', { keys: offer.map((_, i) => i + 1).join(' · ') })}</span></div>
      <div class="cards-row">${offer.map((c, i) => `<button class="ucard ${c.rarity}" data-i="${i}" style="--r:${RAR[c.rarity]};--c:${c.tower ? TOWERS[c.tower].color : RAR[c.rarity]};--d:${i * 120}ms">
        <span class="uc-rar">${T(c.rarity)}</span><span class="uc-key">${i + 1}</span>
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
      <span class="ach-t"><em>${T('Achievement unlocked')}</em><b>${a.name}</b><span>${a.desc}</span></span>`;
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
      const d = g.diff, tag = g.mode === 'daily' ? [T('Daily'), g.mut.color || d.color] : g.mode === 'tutorial' ? [T('Training'), '#ffb800'] : [g.endless ? T('Endless · {name}', { name: d.name }) : d.name, d.color];
      e.waveNum.closest('.stat').querySelector('label').innerHTML = `${T('Wave')} <span class="diff-tag" style="--c:${tag[1]}">${tag[0]}</span>`;
      e.scoreStat.hidden = g.mode !== 'endless' && g.mode !== 'daily';
      this.prev.difficulty = tagKey;
    }
    if (g.mode !== 'campaign' && g.score !== this.prev.score) {
      e.score.textContent = fmt(g.score);
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
      else if (g.state === 'ready') e.cta.innerHTML = this.nextWavePreview(next) + `<button class="cta hudbox pulse" data-act="wave"><span class="tri"></span>${T('Run wave {n}', { n: next })}<kbd>${T('Space')}</kbd></button>`;
      else if (g.state === 'break') {
        const s = Math.ceil(g.breakTimer);
        e.cta.innerHTML = this.nextWavePreview(next) + `<button class="cta hudbox" data-act="wave"><span class="tri"></span>${T('Wave {n} in {s} · Run now', { n: next, s: T('{n}s', { n: s }) })} <span class="bonus">+${s * 3}${CR}</span></button>`;
      } else e.cta.innerHTML = `<div class="cta-info"><span class="dot"></span>${T('Wave {w} · {n} threats', { w: g.wave, n: `<b>${g.hostilesLeft}</b>` })}</div>`;
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
      const label = d.boss ? d.name : `<b>${n}</b> ${enemyNoun(d, n)}`;
      return `<span class="nw-item" style="--c:${d.color}"><i class="ico ${type}"></i>${label}<em>${d.trait}</em></span>`;
    }).join('');
    const hp = waveHpMult(w, this.game.map.def.hpCurve) * this.game.diffFactor('hp', w);
    // Endless past the campaign: malware gets faster and shrugs off more crowd control
    const k = this.game.endless ? w - this.game.map.def.waves.length : 0;
    const spd = Math.round(100 * Math.min(ENDLESS.speedCap, ENDLESS.speedGrowth * k));
    const res = Math.round(100 * Math.min(ENDLESS.ccCap, ENDLESS.ccGrowth * k));
    const adapt = k > 0 ? `<span class="nw-hp" title="${T('Malware adapts: +{s}% speed, {c}% crowd-control resistance', { s: spd, c: res })}">${T('SPD +{n}%', { n: spd })}</span>` : '';
    return `<div class="next-wave"><span class="nw-label">${T('Next')}</span>${items}${hp > 1.05 ? `<span class="nw-hp">HP ×${hp.toFixed(1)}</span>` : ''}${adapt}</div>`;
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
    const crumbs = [`<span>${T('Lv {n}', { n: t.level })}</span>`, ...names.map((n) => `<span>${n}</span>`)].join('<i>›</i>');
    let up;
    if (opts.length) {
      up = `<div class="p-sec">${T('Evolve to level {n}', { n: t.level + 1 })} <em>${T('choose one path')}</em></div><div class="p-upgrades">` +
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
      up = `<div class="p-max"><span>★</span> ${T('Fully evolved')}</div>`;
    }
    p.style.setProperty('--c', s.color);
    p.innerHTML = `
      <div class="p-head">
        <div class="p-title"><div class="p-name">${def.name}</div><div class="p-crumbs">${crumbs}</div></div>
        <button class="p-close" data-act="close" aria-label="${T('Close')}">✕</button>
      </div>
      <div class="p-stats">${statRows(s).map(([k, v]) => `<div class="ps"><label>${k}</label><b>${v}</b></div>`).join('')}</div>
      <div class="p-tags">${statTags(s).map((x) => `<span class="tag">${x}</span>`).join('')}</div>
      ${s.kind === 'pulse' || s.kind === 'nova' ? '' : `<div class="p-target"><label>${T('Target')}<kbd>T</kbd></label><div class="seg">${TARGET_MODES.map((m) =>
        `<button data-act="target" data-mode="${m}" class="${t.targeting === m ? 'on' : ''}" title="${T(TARGET_HINTS[m])}">${T(m)}</button>`).join('')}</div></div>`}
      <div class="p-meter">${T('Damage dealt')} <b data-live="dealt">${fmt(t.dealt)}</b> · ${T('Kills')} <b data-live="kills">${fmt(t.kills)}</b></div>
      ${up}
      ${armed
        ? `<button class="p-sell armed" data-act="sell">${T('Confirm sell')} <b>+${Math.floor(t.invested * this.game.sellRatio)}${CR}</b><kbd>S</kbd></button>`
        : `<button class="p-sell" data-act="sell">${T('Sell')} <b>+${Math.floor(t.invested * this.game.sellRatio)}${CR}</b><kbd>S</kbd></button>`}`;
    p.hidden = false;
  }

  positionPanel() {
    const t = this.view.selected, p = this.els.panel;
    if (!t || p.hidden) return;
    // landscape phones: CSS makes it a full-height side sheet; open it on the half away from the tower
    if (PHONE_LANDSCAPE?.matches) {
      p.style.left = ''; p.style.top = '';
      p.classList.toggle('side-l', t.x > WORLD_W / 2);
      return;
    }
    p.classList.remove('side-l');
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
    b.innerHTML = `<div class="b-rule"></div><div class="b-kicker">${T('⚠ Hostile process escalated')}</div>
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
        <button class="btn-ghost" data-act="menu">${T('Sectors')}</button></div>`;
    if (kind === 'start') {
      const { maps, records = {}, current, difficulty = 'normal', unlocked = {}, cleared = {} } = data;
      const mode = data.mode || 'campaign', endless = mode === 'endless';
      const D = DIFFICULTIES[difficulty];
      const tabs = `<div class="mode-tabs" role="tablist">${[['training', 'Training', 'Learn the basics'], ['campaign', 'Campaign', 'Ten sectors'], ['endless', 'Endless', 'No last wave'], ['daily', 'Daily', 'Same for everyone']]
        .map(([k, n, sub]) => `<button class="mt${k === mode ? ' on' : ''}${k === 'training' && data.tutNew ? ' new' : ''}" role="tab" aria-selected="${k === mode}" data-act="mode" data-arg="${k}"><b>${T(n)}</b><span>${T(sub)}</span></button>`).join('')}</div>`;
      // language names stay in their own language
      const langs = `<div class="lang-pick" role="group" aria-label="${T('Language')}">${LANGS.map((l) => `<button class="${l === lang ? 'on' : ''}" data-act="lang" data-arg="${l}" lang="${l}" title="${{ en: 'English', ru: 'Русский' }[l]}">${l.toUpperCase()}</button>`).join('')}</div>`;
      const picker = `<div class="diff-pick">
          <div class="dp-seg">${DIFFICULTY_ORDER.map((k) => `<button class="dp${k === difficulty ? ' on' : ''}" data-act="difficulty" data-arg="${k}" style="--c:${DIFFICULTIES[k].color}">${DIFFICULTIES[k].name}</button>`).join('')}</div>
          <div class="dp-desc" style="--c:${D.color}">${D.desc}</div>
        </div>`;
      const accent = (m) => (m.theme && m.theme.ambient && m.theme.ambient[0]) || '#00e5ff';
      const nDone = maps.filter((m) => cleared[m.id]).length;
      const head = `<div class="camp-head"><span>${T(mode === 'daily' ? 'Daily' : mode === 'training' ? 'Training' : endless ? 'Endless' : 'Campaign')}</span><i class="camp-bar"><i style="width:${(nDone / maps.length) * 100}%"></i></i><b>${T('{n}/{m} sectors secured', { n: nDone, m: maps.length })}</b>
          <button class="lab-btn${data.labNew ? ' new' : ''}" data-act="lab"><i class="dt"></i>${T('{n} Data · Research', { n: fmt(data.data ?? 0) })}</button>
          <button class="lab-btn ach-btn" data-act="achievements">★ ${data.ach ? data.ach[0] : 0}/${data.ach ? data.ach[1] : 0}</button></div>`;
      let body;
      if (mode === 'training') {
        const tm = data.tutorialMap;
        const lessons = ['Build and deploy', 'Waves and credits', 'Slowing', 'Evolution paths', 'Targeting and selling', 'Armor', 'Firewall and Purge', 'Data caches'];
        body = `<div class="camp-detail training hudbox" style="--c:#ffb800">
          <canvas class="s-map big" data-map="${tm.id}" aria-hidden="true"></canvas>
          <div class="cd-body">
            <div class="s-top"><span class="s-name">${T('Training')}</span><span class="s-diff">${T(data.tutNew ? 'Start here' : 'Completed')}</span></div>
            <div class="cd-title">${T('Grid basics')}</div>
            <div class="s-desc">${T('New to Void Wardens? A coach walks you through every mechanic on a small practice map — one step at a time, at your own pace.')}</div>
            <div class="tr-lessons">${lessons.map((x) => `<span>${T(x)}</span>`).join('')}</div>
            <div class="s-meta">${T('About 5 minutes · can\'t be lost · doesn\'t touch your progress')}</div>
            <div class="cd-foot">
              <span class="s-rec">${data.tutNew ? '' : `<span>${T('✓ Completed')}</span>`}</span>
              <button class="btn-primary hudbox cd-go" data-act="start">${T(data.tutNew ? 'Start training ▸' : 'Train again ▸')}</button>
            </div>
          </div>
        </div>`;
      } else if (mode === 'daily') {
        const d = data.daily, m = d.map, rec = d.rec, mut = d.mut, rule = m.rule && RULES[m.rule];
        const now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const left = Math.max(0, mid - now), hh = Math.floor(left / 3600e3), mm = Math.floor((left % 3600e3) / 60e3);
        body = `<div class="camp-detail daily hudbox" style="--c:${mut.color}">
          <canvas class="s-map big" data-map="${m.id}" aria-hidden="true"></canvas>
          <div class="cd-body">
            <div class="s-top"><span class="s-name">${T('Daily challenge')}</span><span class="s-diff">${d.key}</span></div>
            <div class="cd-title">${m.name} · ${m.title}</div>
            <div class="cd-rule" style="--r:${mut.color}"><b>${T("Today's twist · {name}", { name: mut.name })}</b>${mut.desc}</div>
            ${rule ? `<div class="cd-rule" style="--r:${rule.color}"><b>${T('Rule · {name}', { name: rule.name })}</b>${rule.desc}</div>` : ''}
            <div class="s-meta"><b style="color:${d.diff.color}">${d.diff.name}</b> · ${count(m.waves.length, 'wave', 'waves')} · ${T('every tower open · research off · same cards for everyone')}</div>
            <div class="s-meta">${T('Score: kills, cleared waves, early calls, and a bonus for every Core integrity left on a win.')}</div>
            <div class="daily-stats">
              <div><label>${T('Best today')}</label><b>${rec.best ? fmt(rec.best) : '—'}</b></div>
              <div><label>${T('Runs today')}</label><b>${rec.runs}</b></div>
              <div><label>${T('Streak')}</label><b>${count(rec.streak, 'day', 'days')}</b></div>
            </div>
            <div class="cd-foot">
              <span class="s-rec"><span>${T('New challenge in {h}h {m}m', { h: hh, m: String(mm).padStart(2, '0') })}</span></span>
              <button class="btn-primary hudbox cd-go" data-act="start">${T(rec.runs ? 'Run it again ▸' : 'Run today ▸')}</button>
            </div>
          </div>
        </div>`;
      } else {
        const erec = data.endless || {}, eopen = data.endlessOpen || {};
        // sector nodes: number, title, then stars/medals (campaign) or best wave (endless), or a lock
        const nodes = maps.map((m, i) => {
          const seen = unlocked[m.id], open = endless ? eopen[m.id] : seen, rec = endless ? erec[m.id] : records[m.id];
          const cls = `sector node hudbox${m.id === current ? ' sel' : ''}${open ? '' : ' locked'}${cleared[m.id] ? ' done' : ''}`;
          const recHtml = !open ? '<i class="lock"></i>' : endless ? (rec ? `<span class="n-wave">${T('w{n}', { n: rec.wave })}</span>` : '')
            : rec && rec.stars ? stars(rec.stars) : cleared[m.id] ? `<span class="n-clear">${T('cleared')}</span>` : rec ? `<span class="n-wave">${T('w{n}', { n: rec.wave })}</span>` : '';
          return `<button class="${cls}" data-act="pick" data-arg="${m.id}" style="--c:${open ? accent(m) : '#3d5866'}" aria-label="${m.name} ${m.title}${open ? '' : ' ' + T('(locked)')}">
          <canvas class="s-map" data-map="${m.id}" aria-hidden="true"></canvas>
          <span class="n-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="n-title">${seen ? m.title : T('Locked')}</span>
          ${open && !endless ? `<span class="n-medals">${(data.medals?.[m.id] || []).map((x) => `<i class="${x ? 'on' : ''}"></i>`).join('')}</span>` : ''}
          <span class="n-rec">${recHtml}</span>
        </button>`;
        }).join('');
        // detail of the selected sector
        const sel = maps.find((m) => m.id === current) || maps[0];
        const si = maps.indexOf(sel), open = endless ? eopen[sel.id] : unlocked[sel.id], rec = endless ? erec[sel.id] : records[sel.id];
        const types = [...new Set(sel.waves.flat().map((g) => g[0]))].filter((t) => ENEMIES[t]);
        const threats = types.map((t) => `<span class="nw-item" style="--c:${ENEMIES[t].color}" title="${ENEMIES[t].trait}"><i class="ico ${t}"></i>${ENEMIES[t].plural}</span>`).join('');
        const recHtml = endless ? (rec ? `<span>${T('Best on {d}: {w} · {s}', { d: D.name, w: `<b>${T('wave {n}', { n: rec.wave })}</b>`, s: count(rec.score, 'pt', 'pts') })}</span>` : `<span class="s-none">${T('No Endless run on {d}', { d: D.name })}</span>`)
          : !rec ? `<span class="s-none">${T('No record on {d}', { d: D.name })}</span>`
          : rec.stars ? `${stars(rec.stars)}<span>${T('Secured on {d}', { d: D.name })}</span>` : `<span>${T('Best on {d}: wave {n}/{m}', { d: D.name, n: rec.wave, m: sel.waves.length })}</span>`;
        const lockHtml = endless ? `<i class="lock"></i><span>${T('Clear {name} · {title} in the campaign to open its Endless run', { name: sel.name, title: unlocked[sel.id] ? sel.title : T('this sector') })}</span>`
          : `<i class="lock"></i><span>${T('Clear {name} · {title} to unlock', { name: maps[si - 1]?.name, title: maps[si - 1]?.title })}</span>`;
        const breaches = count(sel.paths.length, 'breach', 'breaches');
        const meta = endless ? T('{b} · its {w}, then it never stops · a Leviathan every 5th wave beyond', { b: breaches, w: count(sel.waves.length, 'wave', 'waves') })
          : `${breaches} · ${count(sel.waves.length, 'wave', 'waves')}${types.includes('boss') ? ` · <b class="cd-boss">${T('boss')}</b>` : ''}`;
        const detail = `<div class="camp-detail hudbox${open ? '' : ' locked'}${endless ? ' endless' : ''}" style="--c:${open ? accent(sel) : '#3d5866'}">
          <canvas class="s-map big" data-map="${sel.id}" aria-hidden="true"></canvas>
          <div class="cd-body">
            <div class="s-top"><span class="s-name">${sel.name}</span><span class="s-diff">${endless ? T('Endless') : sel.difficulty}</span></div>
            <div class="cd-title">${unlocked[sel.id] ? sel.title : T('Locked')}</div>
            <div class="s-desc">${endless ? T('Hold the line as long as you can. Waves keep coming, denser and tougher, until the Core falls. Score: kills, waves and early calls.') : sel.desc}</div>
            ${sel.rule && RULES[sel.rule] ? `<div class="cd-rule" style="--r:${RULES[sel.rule].color}"><b>${T('Rule · {name}', { name: RULES[sel.rule].name })}</b>${RULES[sel.rule].desc}</div>` : ''}
            <div class="s-meta">${meta}</div>
            <div class="cd-threats">${threats}</div>
            ${!endless && sel.medals && open ? `<div class="cd-medals">${sel.medals.map(([k, n], i) => { const got = data.medals?.[sel.id]?.[i]; return `<span class="cdm${got ? ' on' : ''}" title="${data.medalDefs[k].desc(n)}"><i></i><b>${data.medalDefs[k].name}</b> ${data.medalDefs[k].desc(n)}</span>`; }).join('')}<span class="cdm-note">${T('Normal or harder · +15 Data each')}</span></div>` : ''}
            ${endless ? '' : TOWER_ORDER.filter((t) => TOWERS[t].unlock === sel.id).map((t) => `<div class="cd-reward" style="--r:${TOWERS[t].color}">${T('Clear to unlock · {name}', { name: `<b>${TOWERS[t].name}</b>` })}</div>`).join('')}
            <div class="cd-foot">
              <span class="s-rec">${open ? recHtml : lockHtml}</span>
              ${open ? `<button class="btn-primary hudbox cd-go" data-act="start" data-arg="${sel.id}">${T(endless ? 'Enter the void ▸' : 'Jack in ▸')}</button>` : ''}
            </div>
          </div>
        </div>`;
        body = `<div class="camp-grid">${nodes}</div>${detail}`;
      }
      html = `<div class="ov-card campaign mode-${mode}">
        ${langs}
        <div class="ov-kicker">Pixo Arcade // Tower Defense</div>
        <h1 class="ov-title glitch" data-text="VOID//WARDENS">VOID<span class="sl">//</span>WARDENS</h1>
        <p class="ov-tag">${T('A breach has opened in the grid. Hostile code is pouring through. Keep it away from the Core.')}</p>
        ${tabs}
        ${mode === 'daily' || mode === 'training' ? '' : picker}
        ${head}
        ${body}
        <div class="ov-help">
          <div><b>1–7</b> ${T('Pick a tower, click an empty tile to deploy')}</div>
          <div><b>${T('Evolve')}</b> ${T('Every upgrade is a choice between two paths')}</div>
          <div><b>${T('Space')}</b> ${T('Run waves early for bonus credits')}</div>
        </div></div>`;
    } else if (kind === 'pause') {
      html = `<div class="ov-card"><div class="ov-kicker">${T('Process suspended')}</div><h2 class="ov-h2 glitch" data-text="${T('Paused')}">${T('Paused')}</h2>
        <button class="btn-primary hudbox" data-act="resume">${T('Resume')}</button>
        <div class="ov-actions"><button class="btn-ghost" data-act="restart">${T('Restart')}</button><button class="btn-ghost" data-act="menu">${T('Sectors')}</button></div>
        <div class="diff-pick fx-pick"><div class="fx-label">${T('Graphics')} <kbd>G</kbd></div>
          <div class="dp-seg">${['auto', 'high', 'medium', 'low'].map((m) => `<button class="dp${m === data.fx ? ' on' : ''}" data-act="setFx" data-arg="${m}" style="--c:#00e5ff">${T(m)}</button>`).join('')}</div>
          <div class="dp-desc" style="--c:#00e5ff">${T(!data.webgl ? 'WebGL unavailable · bloom and post effects off' : data.fx === 'auto' ? 'Adapts to your device · now {tier}' : { high: 'Full resolution · bloom, lighting, reflections, lens dirt', medium: 'Lower resolution · bloom and lighting, no reflections', low: 'Base resolution · no bloom, lighting or reflections, light weather' }[data.fx], { tier: T(data.tier) })}</div>
        </div>
        <div class="comfort"><div class="fx-label">${T('Comfort')}</div>
          ${[['shake', 'Screen shake'], ['flash', 'Flashes']].map(([k, label]) => {
            const v = Math.round((data.comfort?.[k] ?? 1) * 100);
            return `<label class="slider"><span>${T(label)}</span><input type="range" min="0" max="100" step="5" value="${v}" data-comfort="${k}"><b>${v}%</b></label>`;
          }).join('')}
          <div class="comfort-presets"><button class="btn-ghost" data-act="comfortPreset" data-arg="calm">${T('Calm')}</button><button class="btn-ghost" data-act="comfortPreset" data-arg="full">${T('Full')}</button></div>
        </div></div>`;
    } else if (kind === 'win') {
      const nx = data.next;
      const unlockLine = nx ? `<div class="ov-unlock${nx.fresh ? ' fresh' : ''}">${T(nx.fresh ? '▸ New sector unlocked' : '▸ Up next')} · <b>${nx.name} · ${nx.title}</b></div>`
        : data.final ? `<div class="ov-unlock fresh">${T('▸ Campaign complete')} · <b>${T('the grid is secure')}</b></div>` : '';
      const title = T(data.final ? 'Kernel secured' : 'System secure');
      html = `<div class="ov-card win"><div class="ov-kicker">${data.sector} · ${data.diff.name} · ${T('Breach sealed')}</div><h2 class="ov-h2 glitch" data-text="${title}">${title}</h2>
        <div class="ov-stars">${stars(data.stars)}</div>
        <div class="ov-stats"><div><label>${T('Core')}</label><b>${data.lives}/${data.maxLives}</b></div><div><label>${T('Kills')}</label><b>${fmt(data.kills)}</b></div><div><label>${T('Towers')}</label><b>${data.towers}</b></div></div>
        ${data.medals && data.medals.length ? `<div class="ov-medals">${data.medals.map((m) => `<span class="om${m.earned ? ' on' : ''}${m.fresh ? ' fresh' : ''}" title="${m.desc}"><i></i>${m.name}</span>`).join('')}</div>`
          : data.diff && data.diff === DIFFICULTIES.easy ? `<div class="ov-medals note">${T('Medals need Normal or harder')}</div>` : ''}
        ${data.data ? `<div class="ov-data"><i class="dt"></i>${T('+{n} Data', { n: data.data.earned + (data.data.medals || 0) })}${data.data.medals ? ` <span>${T('({n} from medals)', { n: data.data.medals })}</span>` : ''} <span>${T('· {n} total', { n: fmt(data.data.total) })}</span></div>` : ''}
        ${unlockLine}
        ${(data.newTowers || []).map((n) => `<div class="ov-unlock fresh tower">${T('▸ New tower unlocked')} · <b>${n}</b></div>`).join('')}
        ${data.endlessNew ? `<div class="ov-unlock fresh endless">${T('▸ Endless opened')} · <b>${data.endlessNew}</b></div>` : ''}
        ${nx ? `<div class="ov-actions"><button class="btn-primary hudbox" data-act="start" data-arg="${nx.id}">${T('Next sector ▸')}</button>
          <button class="btn-ghost" data-act="restart">${T('Play again')}</button><button class="btn-ghost" data-act="menu">${T('Sectors')}</button></div>` : again.replace('%s', T('Play again'))}
        <button class="btn-ghost share" data-act="share">${T('Share screenshot')}</button></div>`;
    } else if (kind === 'ach') {
      const done = data.list.filter((a) => a.done).length;
      html = `<div class="ov-card achs"><div class="ov-kicker">${T('Warden service record')}</div>
        <h2 class="ov-h2">${T('Achievements')}</h2>
        <div class="lab-bal">${T('{done}/ {total} unlocked', { done: `<b>${done}</b>`, total: data.list.length })}</div>
        <div class="ach-grid">${data.list.map((a) => `<div class="ach${a.done ? ' done' : ''}">
          <span class="ach-ic">${achIcon(a.icon)}</span>
          <span class="ach-t"><b>${a.name}</b><span>${a.desc}</span>${a.goal && !a.done ? `<i class="ach-bar"><i style="width:${(a.prog / a.goal) * 100}%"></i></i><em>${a.prog} / ${a.goal}</em>` : ''}</span>
        </div>`).join('')}</div>
        <button class="btn-ghost" data-act="labBack">${T('◂ Back to campaign')}</button></div>`;
    } else if (kind === 'lab') {
      const own = new Set(data.owned || []);
      const cols = RESEARCH.map((b) => `<div class="lab-col" style="--c:${b.color}"><div class="lab-branch">${b.branch}</div>
        ${b.nodes.map((n, i) => {
          const has = own.has(n.id), prev = i === 0 || own.has(b.nodes[i - 1].id), afford = data.data >= n.cost;
          const st = has ? 'owned' : !prev ? 'locked' : afford ? 'ready' : 'poor';
          return `<button class="lab-node hudbox ${st}${n.id === data.fresh ? ' fresh' : ''}" data-act="buy" data-arg="${n.id}" ${has || st === 'locked' ? 'disabled' : ''}>
            <span class="ln-tier">T${i + 1}</span><span class="ln-name">${n.name}</span><span class="ln-desc">${n.desc}</span>
            <span class="ln-cost">${has ? T('✓ Installed') : st === 'locked' ? T('Requires {name}', { name: b.nodes[i - 1].name }) : `<i class="dt"></i>${n.cost}`}</span></button>`;
        }).join('<i class="lab-link"></i>')}</div>`).join('');
      html = `<div class="ov-card lab"><div class="ov-kicker">${T('Warden research lab')}</div>
        <h2 class="ov-h2">${T('Research')}</h2>
        <div class="lab-bal"><i class="dt"></i><b>${fmt(data.data)}</b> ${T('Data')} <span>${T('· earned every run — more for waves cleared, wins, stars and harder difficulties')}</span></div>
        <div class="lab-grid">${cols}</div>
        <button class="btn-ghost" data-act="labBack">${T('◂ Back to campaign')}</button></div>`;
    } else if (kind === 'endless') {
      const dataLine = data.data ? `<div class="ov-data"><i class="dt"></i>${T('+{n} Data', { n: data.data.earned })} <span>${T('· {n} total', { n: fmt(data.data.total) })}</span></div>` : '';
      html = `<div class="ov-card lose endless-res"><div class="ov-kicker">${T('Endless')} · ${data.sector} · ${data.title} · ${data.diff.name}</div>
        <h2 class="ov-h2 glitch" data-text="${T('Signal lost')}">${T('Signal lost')}</h2>
        <div class="ov-score"><label>${T('Fell on')}</label><b>${T('Wave {n}', { n: data.wave })}</b>${data.better ? `<em>${T('New best')}</em>` : data.prev ? `<span>${T('Best: wave {n}', { n: data.prev.wave })}</span>` : `<em>${T('First run')}</em>`}</div>
        <div class="ov-stats"><div><label>${T('Score')}</label><b>${fmt(data.score)}</b></div><div><label>${T('Kills')}</label><b>${fmt(data.kills)}</b></div><div><label>${T('Past the campaign')}</label><b>${count(data.beyond, 'wave', 'waves')}</b></div></div>
        ${dataLine}
        ${again.replace('%s', T('Go again'))}
        <button class="btn-ghost share" data-act="share">${T('Share screenshot')}</button></div>`;
    } else if (kind === 'daily') {
      const title = T(data.won ? 'Daily secured' : 'Daily breached');
      html = `<div class="ov-card ${data.won ? 'win' : 'lose'} daily-res" style="--mc:${data.mut.color}"><div class="ov-kicker">${T('Daily')} · ${data.day} · ${data.sector} · ${data.title}</div>
        <h2 class="ov-h2 glitch" data-text="${title}">${title}</h2>
        <div class="ov-score"><label>${T('Score')}</label><b>${fmt(data.score)}</b>${data.newBest ? `<em>${T('New best today')}</em>` : data.runs > 1 ? `<span>${T('Best today: {n}', { n: fmt(data.best) })}</span>` : ''}</div>
        ${data.won ? `<div class="ov-stars">${stars(data.stars)}</div>` : ''}
        <div class="ov-stats"><div><label>${T(data.won ? 'Core' : 'Reached')}</label><b>${data.won ? `${data.lives}/${data.maxLives}` : T('Wave {n}', { n: data.wave })}</b></div><div><label>${T('Kills')}</label><b>${fmt(data.kills)}</b></div><div><label>${T('Streak')}</label><b>${count(data.streak, 'day', 'days')}</b></div></div>
        <div class="ov-unlock" style="--r:${data.mut.color}">${T('Twist')} · <b>${data.mut.name}</b></div>
        ${data.data ? `<div class="ov-data"><i class="dt"></i>${T('+{n} Data', { n: data.data.earned })} <span>${T('· {n} total', { n: fmt(data.data.total) })}</span></div>` : ''}
        ${again.replace('%s', T('Run it again'))}
        <button class="btn-ghost share" data-act="share">${T('Share score')}</button></div>`;
    } else if (kind === 'tutorial') {
      const rows = [
        ['Campaign', 'Ten sectors, each with its own layout and a rule that changes how it plays. Clear one to open the next; the more Core you keep, the more stars (up to 3).'],
        ['Medals', 'Every sector has three optional challenges. Win on Normal or harder to earn them — each pays Data.'],
        ['Research', 'Every run, won or lost, pays Data. Spend it in Research on permanent upgrades.'],
        ['Arsenal', 'Clearing sectors 03, 06 and 08 adds the Spike Lance, Overclock Hub and Logic Mines.'],
        ['Endless · Daily', 'Endless never stops — how far can you hold? The Daily is one challenge a day, the same for everyone.'],
      ];
      html = `<div class="ov-card win tut-done"><div class="ov-kicker">${T('Training complete')}</div>
        <h2 class="ov-h2 glitch" data-text="${T('Ready, Warden')}">${T('Ready, Warden')}</h2>
        <p class="ov-tag">${T('You know the grid. Here is what waits outside it:')}</p>
        <div class="tut-list">${rows.map(([k, v]) => `<div><b>${T(k)}</b><span>${T(v)}</span></div>`).join('')}</div>
        <div class="ov-actions"><button class="btn-primary hudbox" data-act="campaign">${T('Start the campaign ▸')}</button>
          <button class="btn-ghost" data-act="restart">${T('Train again')}</button><button class="btn-ghost" data-act="menu">${T('Sectors')}</button></div></div>`;
    } else if (kind === 'lose') {
      html = `<div class="ov-card lose"><div class="ov-kicker">${data.sector} · ${data.diff.name} · ${T('Core compromised')}</div><h2 class="ov-h2 glitch" data-text="${T('System breached')}">${T('System breached')}</h2>
        <div class="ov-stats"><div><label>${T('Reached')}</label><b>${T('Wave {n}', { n: data.wave })}</b></div><div><label>${T('Kills')}</label><b>${fmt(data.kills)}</b></div></div>
        ${data.data ? `<div class="ov-data"><i class="dt"></i>${T('+{n} Data', { n: data.data.earned })} <span>${T('· {n} total', { n: fmt(data.data.total) })}</span></div>` : ''}
        ${again.replace('%s', T('Reboot'))}</div>`;
    }
    o.innerHTML = html;
    o.className = 'overlay show ' + kind;
    if (kind === 'start') this.startMiniMaps([...(data.maps || []), ...(data.tutorialMap ? [data.tutorialMap] : [])]);
  }

  hideOverlay() { this.els.overlay.className = 'overlay'; }
}
