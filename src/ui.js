// DOM HUD: top stats, tower dock, tower panel with upgrade choices, banners, overlays.
import { TOWERS, TOWER_ORDER, ENEMIES, START_LIVES, SELL_RATIO, WORLD_W, COLS, ROWS, ABILITIES, ABILITY_ORDER, DIFFICULTIES, DIFFICULTY_ORDER, towerStats, upgradeOptions, pathNames, waveHpMult } from './config.js';
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

export function describeWave(game, w) {
  const counts = {};
  for (const [type, n] of game.waves[w - 1]) counts[type] = (counts[type] || 0) + game.scaledCount(type, n, w);
  return Object.entries(counts).map(([type, n]) => {
    const d = ENEMIES[type];
    return d.boss ? d.name : `${n} ${n > 1 ? d.plural : d.name}`;
  }).join(' · ');
}

export class UI {
  constructor(game, view, ctl) {
    this.game = game;
    this.view = view;
    this.ctl = ctl;
    this.els = {
      credits: $('credits'), creditsStat: $('stat-credits'), waveNum: $('wave-num'), waveTotal: $('wave-total'),
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
      const left = g.cooldowns[id], cd = ABILITIES[id].cooldown;
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

  showTip(btn, type) {
    const def = TOWERS[type], s = towerStats(type, []);
    const tip = this.els.tooltip;
    tip.style.setProperty('--c', def.color);
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
      const card = ev.target.closest('.sector');
      if (card) this.ctl.preview?.(card.dataset.arg);
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
      this.view.previewStats = b && t ? towerStats(t.type, [...t.path, +b.dataset.i]) : null;
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
    if (g.totalWaves !== this.prev.totalWaves) { e.waveTotal.textContent = g.totalWaves; this.prev.totalWaves = g.totalWaves; }
    if (g.difficulty !== this.prev.difficulty) {
      const d = g.diff;
      e.waveNum.closest('.stat').querySelector('label').innerHTML = `Wave <span class="diff-tag" style="--c:${d.color}">${d.name}</span>`;
      this.prev.difficulty = g.difficulty;
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
    const key = t.id + ':' + t.level + ':' + opts.map((o) => (this.game.credits >= o.cost ? 1 : 0)).join('') + ':' + (armed ? 'A' : '') + ':' + t.targeting;
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
          const ns = towerStats(t.type, [...t.path, i]);
          const diff = diffLine(s, ns);
          const ok = this.game.credits >= o.cost;
          return `<button class="upg hudbox${ok ? '' : ' locked'}" data-act="upgrade" data-i="${i}" style="--c:${o.color}">
            <span class="u-key">${i === 0 ? 'Q' : 'E'}</span>
            <span class="u-name">${o.name}</span><span class="u-desc">${o.desc}</span>
            ${diff ? `<span class="u-diff">${diff}</span>` : ''}
            <span class="u-cost">${CR}${o.cost}</span></button>`;
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
        ? `<button class="p-sell armed" data-act="sell">Confirm sell <b>+${Math.floor(t.invested * SELL_RATIO)}${CR}</b><kbd>S</kbd></button>`
        : `<button class="p-sell" data-act="sell">Sell <b>+${Math.floor(t.invested * SELL_RATIO)}${CR}</b><kbd>S</kbd></button>`}`;
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
      const { maps, records = {}, current, difficulty = 'normal' } = data;
      const D = DIFFICULTIES[difficulty];
      const picker = `<div class="diff-pick">
          <div class="dp-seg">${DIFFICULTY_ORDER.map((k) => `<button class="dp${k === difficulty ? ' on' : ''}" data-act="difficulty" data-arg="${k}" style="--c:${DIFFICULTIES[k].color}">${DIFFICULTIES[k].name}</button>`).join('')}</div>
          <div class="dp-desc" style="--c:${D.color}">${D.desc}</div>
        </div>`;
      const cards = maps.map((m) => {
        const rec = records[m.id];
        const recHtml = !rec ? '<span class="s-none">No record</span>'
          : rec.stars ? `${stars(rec.stars)}<span>Secured</span>`
          : `<span>Best: wave ${rec.wave}/${m.waves.length}</span>`;
        const hot = m.difficulty === 'Advanced';
        return `<button class="sector hudbox${m.id === current ? ' sel' : ''}" data-act="start" data-arg="${m.id}" style="--c:${hot ? '#ff2a6d' : '#00e5ff'}">
          <canvas class="s-map" data-map="${m.id}" aria-hidden="true"></canvas>
          <span class="s-top"><span class="s-name">${m.name}</span><span class="s-diff">${m.difficulty}</span></span>
          <span class="s-title">${m.title}</span>
          <span class="s-desc">${m.desc}</span>
          <span class="s-meta">${m.paths.length} breach${m.paths.length > 1 ? 'es' : ''} · ${m.waves.length} waves</span>
          <span class="s-foot"><span class="s-rec">${recHtml}</span><span class="s-go">Jack in ▸</span></span>
        </button>`;
      }).join('');
      html = `<div class="ov-card">
        <div class="ov-kicker">Pixo Arcade // Tower Defense</div>
        <h1 class="ov-title glitch" data-text="VOID//WARDENS">VOID<span class="sl">//</span>WARDENS</h1>
        <p class="ov-tag">A breach has opened in the grid. Hostile code is pouring through. Keep it away from the Core.</p>
        ${picker}
        <div class="sectors">${cards}</div>
        <div class="ov-help">
          <div><b>1–4</b> Pick a tower, click an empty tile to deploy</div>
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
      html = `<div class="ov-card win"><div class="ov-kicker">${data.sector} · ${data.diff.name} · Breach sealed</div><h2 class="ov-h2 glitch" data-text="System secure">System secure</h2>
        <div class="ov-stars">${stars(data.stars)}</div>
        <div class="ov-stats"><div><label>Core</label><b>${data.lives}/${data.maxLives}</b></div><div><label>Kills</label><b>${data.kills}</b></div><div><label>Towers</label><b>${data.towers}</b></div></div>
        ${again.replace('%s', 'Play again')}
        <button class="btn-ghost share" data-act="share">Share screenshot</button></div>`;
    } else if (kind === 'lose') {
      html = `<div class="ov-card lose"><div class="ov-kicker">${data.sector} · ${data.diff.name} · Core compromised</div><h2 class="ov-h2 glitch" data-text="System breached">System breached</h2>
        <div class="ov-stats"><div><label>Reached</label><b>Wave ${data.wave}</b></div><div><label>Kills</label><b>${data.kills}</b></div></div>
        ${again.replace('%s', 'Reboot')}</div>`;
    }
    o.innerHTML = html;
    o.className = 'overlay show ' + kind;
    if (kind === 'start') this.startMiniMaps(data.maps || []);
  }

  hideOverlay() { this.els.overlay.className = 'overlay'; }
}
