// DOM HUD: top stats, tower dock, tower panel with upgrade choices, banners, overlays.
import { TOWERS, TOWER_ORDER, ENEMIES, WAVES, START_LIVES, SELL_RATIO, WORLD_W, towerStats, upgradeOptions, pathNames } from './config.js';
import { drawTower } from './render.js';

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

export function describeWave(w) {
  const counts = {};
  for (const [type, n] of WAVES[w - 1]) counts[type] = (counts[type] || 0) + n;
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
      tooltip: $('tooltip'), speed: $('btn-speed'), pause: $('btn-pause'), mute: $('btn-mute'), viewport: $('viewport'),
    };
    this.cards = {};
    this.prev = {};
    this.panelKey = '';
    this.liveT = 0;
    this.els.waveTotal.textContent = WAVES.length;
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
    e.cta.addEventListener('click', (ev) => { if (ev.target.closest('[data-act="wave"]')) this.ctl.startWave(); });
    e.overlay.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (b) this.ctl[b.dataset.act]?.();
    });
    e.panel.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'upgrade') this.ctl.upgrade(+b.dataset.i);
      else if (act === 'sell') this.ctl.sell();
      else if (act === 'close') this.ctl.select(null);
    });
    e.panel.addEventListener('pointerover', (ev) => {
      const b = ev.target.closest('[data-act="upgrade"]');
      const t = this.view.selected;
      this.view.previewStats = b && t ? towerStats(t.type, [...t.path, +b.dataset.i]) : null;
    });
    e.panel.addEventListener('pointerleave', () => (this.view.previewStats = null));
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
      if (this.prev.credits !== undefined && cr > this.prev.credits) this.bump(e.creditsStat);
      e.credits.textContent = fmt(cr);
      this.prev.credits = cr;
      for (const type of TOWER_ORDER) this.cards[type].classList.toggle('disabled', cr < TOWERS[type].cost);
    }
    if (g.wave !== this.prev.wave) { e.waveNum.textContent = g.wave; this.prev.wave = g.wave; }
    if (g.lives !== this.prev.lives) {
      if (this.prev.lives !== undefined && g.lives < this.prev.lives) this.bump(e.livesStat, 'hit');
      e.lives.textContent = g.lives;
      e.livesBar.style.width = (g.lives / START_LIVES) * 100 + '%';
      e.livesStat.classList.toggle('low', g.lives <= START_LIVES * 0.3);
      this.prev.lives = g.lives;
    }
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
      else if (g.state === 'ready') e.cta.innerHTML = `<button class="cta hudbox pulse" data-act="wave"><span class="tri"></span>Run wave ${next}<kbd>Space</kbd></button>`;
      else if (g.state === 'break') {
        const s = Math.ceil(g.breakTimer);
        e.cta.innerHTML = `<button class="cta hudbox" data-act="wave"><span class="tri"></span>Wave ${next} in ${s}s · Run now <span class="bonus">+${s * 3}${CR}</span></button>`;
      } else e.cta.innerHTML = `<div class="cta-info"><span class="dot"></span>Wave ${g.wave} · <b>${g.hostilesLeft}</b> threats</div>`;
    }

    this.updatePanel(dt);
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
    const key = t.id + ':' + t.level + ':' + opts.map((o) => (this.game.credits >= o.cost ? 1 : 0)).join('');
    if (key !== this.panelKey) {
      const isNew = !this.panelKey.startsWith(t.id + ':');
      const keepPreview = !isNew && this.panelKey.split(':')[1] === String(t.level);
      this.panelKey = key;
      this.renderPanel(t, opts);
      if (isNew) this.bump(p, 'pop');
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

  renderPanel(t, opts) {
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
      <div class="p-meter">Damage dealt <b data-live="dealt">${fmt(t.dealt)}</b> · Kills <b data-live="kills">${fmt(t.kills)}</b></div>
      ${up}
      <button class="p-sell" data-act="sell">Sell <b>+${Math.floor(t.invested * SELL_RATIO)}${CR}</b><kbd>S</kbd></button>`;
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
  banner(title, sub = '', color = '#8b6cff') {
    const b = this.els.banner;
    b.style.setProperty('--bc', color);
    b.innerHTML = `<div class="b-title">${title}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    this.bump(b, 'show');
  }

  showOverlay(kind, data = {}) {
    const o = this.els.overlay;
    let html = '';
    if (kind === 'start') {
      html = `<div class="ov-card">
        <div class="ov-kicker">Pixo Arcade // Tower Defense</div>
        <h1 class="ov-title glitch" data-text="VOID//WARDENS">VOID<span class="sl">//</span>WARDENS</h1>
        <p class="ov-tag">A breach has opened in the grid. Hostile code is pouring through. Keep it away from the Core.</p>
        <div class="ov-help">
          <div><b>1–4</b> Pick a tower, click an empty tile to deploy</div>
          <div><b>Evolve</b> Every upgrade is a choice between two paths</div>
          <div><b>Space</b> Run waves early for bonus credits</div>
        </div>
        <button class="btn-primary hudbox" data-act="start">Jack in</button></div>`;
    } else if (kind === 'pause') {
      html = `<div class="ov-card"><div class="ov-kicker">Process suspended</div><h2 class="ov-h2 glitch" data-text="Paused">Paused</h2>
        <button class="btn-primary hudbox" data-act="resume">Resume</button>
        <button class="btn-ghost" data-act="restart">Restart</button></div>`;
    } else if (kind === 'win') {
      html = `<div class="ov-card win"><div class="ov-kicker">Breach sealed</div><h2 class="ov-h2 glitch" data-text="System secure">System secure</h2>
        <div class="ov-stats"><div><label>Core</label><b>${data.lives}/${START_LIVES}</b></div><div><label>Kills</label><b>${data.kills}</b></div><div><label>Towers</label><b>${data.towers}</b></div></div>
        <button class="btn-primary hudbox" data-act="restart">Play again</button></div>`;
    } else if (kind === 'lose') {
      html = `<div class="ov-card lose"><div class="ov-kicker">Core compromised</div><h2 class="ov-h2 glitch" data-text="System breached">System breached</h2>
        <div class="ov-stats"><div><label>Reached</label><b>Wave ${data.wave}</b></div><div><label>Kills</label><b>${data.kills}</b></div></div>
        <button class="btn-primary hudbox" data-act="restart">Reboot</button></div>`;
    }
    o.innerHTML = html;
    o.className = 'overlay show ' + kind;
  }

  hideOverlay() { this.els.overlay.className = 'overlay'; }
}
