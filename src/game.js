// Core simulation. No DOM access here — the renderer and UI read this state,
// and sounds are requested through the 'sfx' event.
import {
  TILE, WORLD_W, WORLD_H, ENEMIES, TOWERS,
  ABILITIES, DIFFICULTIES, difficultyOf, START_CREDITS, START_LIVES, BREAK_TIME, SELL_RATIO, EARLY_BONUS_PER_SEC,
  waveHpMult, waveClearBonus, towerStats, upgradeOptions, RULES, CARDS, CARD_ODDS, CARD_EVERY, HP_SCALE,
  MUTATORS, SCORE, CC, ENDLESS,
} from './config.js';
import { FX } from './fx.js';
import { t as T } from './i18n.js';
import { endlessWave, mulberry32 } from './modes.js';

const TAU = Math.PI * 2;
export const TARGET_MODES = ['first', 'last', 'strong', 'close'];
const rand = (a, b) => a + Math.random() * (b - a);

export function turnTowards(a, b, max) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (d > max) d = max; else if (d < -max) d = -max;
  return a + d;
}

const NO_MUT = Object.freeze({});

export class Game {
  constructor(map, difficulty = 'normal') {
    this.map = map;
    this.perks = {}; // permanent research, set by the app before a run (the sim runs without it)
    // mode: 'campaign' | 'endless' | 'daily'. mutator: a MUTATORS key (Daily twist).
    // seed: seeds card draws (Daily) so everyone gets the same hands. Set by the app before reset().
    this.mode = 'campaign';
    this.mutator = null;
    this.seed = null;
    this.difficulty = difficulty;
    this.fx = new FX();
    this.handlers = {};
    this.reset();
  }

  get diff() { return difficultyOf(this.difficulty); }
  get endless() { return this.mode === 'endless'; }
  get mut() { return MUTATORS[this.mutator] || NO_MUT; }
  // the wave that ends the run with a win (Endless never does)
  get lastWave() { return this.endless ? Infinity : this.waves.length; }
  // Endless generates its waves ahead of time (the next-wave preview reads one ahead)
  ensureWaves(n) {
    while (this.endless && this.waves.length < n) this.waves.push(endlessWave(this.map.def, this.waves.length + 1));
  }
  // Leviathans don't follow the wave HP curve in the campaign; beyond it, Endless scales them
  bossMult(w) {
    const L = this.map.def.waves.length;
    return this.endless && w > L ? waveHpMult(w, this.map.def.hpCurve) / waveHpMult(L, this.map.def.hpCurve) : 1;
  }

  setDifficulty(key) {
    this.difficulty = DIFFICULTIES[key] ? key : 'normal';
    this.reset();
  }

  // Difficulty bonus ramps through the run: 30% of it on wave 1, the full value on the
  // last wave. Early waves stay fair (no economy yet); late waves get the real pressure.
  // (Easy's reductions apply in full from the start — the opening is where new players struggle.)
  diffFactor(key, w = this.wave) {
    if (this.diff[key] <= 1) return this.diff[key];
    const r0 = this.diff.ramp0 ?? 0.3;
    const r = r0 + (1 - r0) * Math.max(0, w - 1) / Math.max(1, this.totalWaves - 1);
    return 1 + (this.diff[key] - 1) * Math.min(1, r);
  }

  // Enemies per group after difficulty scaling (a lone boss stays alone)
  scaledCount(type, count, w = this.wave) {
    return ENEMIES[type].boss ? count : Math.max(1, Math.round(count * this.diffFactor('count', w) * (this.mut.count || 1)));
  }

  rewardFor(e) { return Math.max(1, Math.round(e.def.reward * this.diff.reward * (this.rule?.reward ?? 1) * this.mods.reward * (this.mut.reward || 1))); }

  // ── Sector rule hooks ──
  get rule() { return RULES[this.map.def.rule] || null; }
  get sellRatio() { return Math.max(this.rule?.sell ?? SELL_RATIO, this.mods.sell); }
  abilityCooldown(id) {
    const pk = id === 'firewall' ? this.perks.firewallCd : this.perks.purgeCd;
    return ABILITIES[id].cooldown * (this.rule?.abilityCd ?? 1) * this.mods.abilityCd * (pk || 1);
  }
  // upgrade price after cards and research (Rapid Tooling discounts the first upgrade on a tower)
  costOf(node, t) { return Math.round(node.cost * this.mods.upgradeCost * (t && t.path.length === 0 ? this.perks.l2Cost || 1 : 1)); }
  // tower stats with the sector rule and the run's upgrade cards applied
  statsFor(type, path) {
    const st = { ...towerStats(type, path) }, m = this.mods;
    if (this.rule?.range) st.range *= this.rule.range;
    const d = (m.dmg[type] || 1) * m.dmgAll;
    st.damage *= d;
    if (st.mineDmg) st.mineDmg *= d;
    if (st.burn) st.burn *= d;
    st.range *= (m.range[type] || 1) * m.rangeAll;
    if (st.kind !== 'aura') st.rate *= 1 + m.rate;
    if (type === 'arc' && st.chains) st.chains += m.chains;
    if (type === 'launcher' && st.splash) st.splash *= m.splash;
    if (st.kind === 'mines') st.maxMines += m.mineMax;
    if (type === 'cryo' && st.slow) st.slow = Math.min(CC.slowCap, st.slow + m.slowBonus);
    return st;
  }

  // ── Upgrade cards ──
  rollCards(n = this.perks.cardCount || 3) {
    const placed = new Set(this.towers.map((t) => t.type));
    const pool = CARDS.filter((c) => (!c.tower || placed.has(c.tower)) && !(c.unique && this.picked.includes(c.id)));
    const out = [];
    while (out.length < n && pool.length) {
      const total = pool.reduce((a, c) => a + CARD_ODDS[c.rarity], 0);
      let r = this.rng() * total, i = 0;
      while ((r -= CARD_ODDS[pool[i].rarity]) > 0) i++;
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }

  // Cache Decryptor: deal a fresh hand (once per run)
  reroll() {
    if (!this.offer || this.rerolls <= 0) return false;
    this.rerolls--;
    this.offer = this.rollCards();
    this.emit('offer', this.offer);
    return true;
  }

  choose(i) {
    const card = this.offer && this.offer[i];
    if (!card) return false;
    card.apply?.(this.mods);
    card.now?.(this);
    this.picked.push(card.id);
    this.offer = null;
    for (const t of this.towers) { t.stats = t.baseStats = this.statsFor(t.type, t.path); t.buffKey = ''; t.busSpots = null; }
    this.emit('picked', card);
    this.sfx('pick');
    return true;
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, arg) { const h = this.handlers[ev]; if (h) for (const f of h) f(arg); }
  // x (world px, optional) lets the audio pan the sound to where it happened
  sfx(name, x) { this.emit('sfx', x === undefined ? name : { name, x }); }

  setMap(map) {
    this.map = map;
    this.reset();
  }

  reset() {
    const def = this.map.def;
    this.waves = this.endless ? def.waves.slice() : def.waves;
    const pk = this.perks, mu = this.mut;
    this.rng = this.seed != null ? mulberry32(this.seed) : Math.random;
    this.score = 0;
    this.credits = (def.startCredits ?? START_CREDITS) + (pk.credits || 0) + (mu.credits || 0);
    this.maxLives = Math.max(1, Math.round(((this.diff.lives ?? START_LIVES) + (pk.lives || 0)) * (mu.lives || 1)));
    this.lives = this.maxLives;
    this.wave = 0;
    this.totalWaves = def.waves.length; // campaign length (Endless keeps going past it)
    this.spawnLater = [];
    this.firewalls = [];
    this.cooldowns = { firewall: 0, purge: 0 }; // seconds until each ability is ready
    this.state = 'ready'; // ready → wave → break → wave … → won | lost
    this.time = 0;
    this.waveTime = 0;
    this.breakTimer = 0;
    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.zones = [];
    this.mines = [];
    this.spawnQueue = [];
    this.grid = new Map();
    this.nextId = 1;
    this.kills = 0;
    this.leaks = 0;
    this.coreFlash = 0;
    this.boss = null;
    this.panicT = 0;
    // run modifiers from upgrade cards
    this.mods = { dmg: {}, dmgAll: (pk.dmg || 1) * (mu.dmg || 1), range: {}, rangeAll: (pk.range || 1) * (mu.range || 1), rate: 0, chains: 0, splash: 1, mineMax: 0, slowBonus: 0, reward: pk.reward || 1, upgradeCost: 1, abilityCd: 1, firewallDur: 1, purge: 1, sell: pk.sell || 0, interest: 0, armorPierce: 0 };
    this.rerolls = pk.reroll || 0;
    // per-run record for medals and achievements
    this.run = { maxTowers: 0, types: new Set(), maxLevel: 1, abilities: 0, autoStarts: 0, purgeKills: 0, failsafeUsed: false };
    this.failsafe = !!pk.failsafe;
    this.picked = [];
    this.offer = null;
    const sk = this.rule?.strike;
    this.strikeT = sk ? rand(sk.every[0], sk.every[1]) : 0;
    this.fx.clear();
  }

  get over() { return this.state === 'won' || this.state === 'lost'; }
  get hostilesLeft() { return this.spawnQueue.length + this.enemies.length; }

  // ── Waves ────────────────────────────────────────────────
  startWave() {
    if (this.state !== 'ready' && this.state !== 'break') return false;
    if (this.offer) return false; // pick a card first
    if (this.state === 'break') {
      const secs = Math.max(0, Math.ceil(this.breakTimer));
      const bonus = secs * EARLY_BONUS_PER_SEC * (this.mut.early || 1);
      if (bonus > 0) { this.credits += bonus; this.emit('early', bonus); }
      this.score += secs * SCORE.early;
    }
    if (this.mods.interest && this.wave > 0) {
      const bonus = Math.min(50, Math.floor(this.credits * this.mods.interest));
      if (bonus > 0) {
        this.credits += bonus;
        this.fx.text(this.map.core.x, this.map.core.y - 54, T('+{n} interest', { n: bonus }), '#ffb800', 13);
      }
    }
    this.wave++;
    this.ensureWaves(this.wave + 1);
    this.state = 'wave';
    this.waveTime = 0;
    const mult = waveHpMult(this.wave, this.map.def.hpCurve);
    const q = [];
    const nPaths = this.map.paths.length;
    for (const [type, count, interval, delay, path = 0] of this.waves[this.wave - 1]) {
      // more enemies arrive in the same time window → denser waves on higher difficulties
      const n = this.scaledCount(type, count);
      const step = interval * (count / n);
      const m = ENEMIES[type].boss ? this.bossMult(this.wave) : mult;
      for (let i = 0; i < n; i++) {
        const p = path === 'alt' ? i % nPaths : Math.min(path, nPaths - 1);
        q.push({ t: delay + i * step, type, mult: m, path: p });
      }
    }
    q.sort((a, b) => a.t - b.t);
    this.spawnQueue = q;
    this.emit('wave', this.wave);
    this.sfx('wave');
    return true;
  }

  endWave() {
    const bonus = waveClearBonus(this.wave);
    this.credits += bonus;
    this.score += SCORE.wave * this.wave;
    this.ensureWaves(this.wave + 1);
    if (this.wave >= this.lastWave) {
      if (this.mode === 'daily') this.score += SCORE.win + SCORE.core * this.lives;
      this.state = 'won';
      this.emit('win');
      this.sfx('win');
      return;
    }
    this.state = 'break';
    this.breakTimer = this.mut.breakTime ?? this.rule?.breakTime ?? BREAK_TIME;
    if (this.wave % (this.mut.cardEvery || CARD_EVERY) === 0) {
      this.offer = this.rollCards();
      if (this.offer.length) this.emit('offer', this.offer); else this.offer = null;
    }
    this.emit('cleared', { wave: this.wave, bonus });
    this.sfx('clear');
  }

  // ── Main tick ────────────────────────────────────────────
  update(dt) {
    if (this.over) { this.fx.update(dt); return; }
    this.time += dt;

    if (this.state === 'wave') {
      this.waveTime += dt;
      if (this.rule?.strike) this.updateStrikes(dt);
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTime) {
        const s = this.spawnQueue.shift();
        this.spawn(s.type, s.mult, s.path);
      }
    } else if (this.state === 'break') {
      if (!this.offer) this.breakTimer -= dt; // the clock waits while a data cache is open
      if (this.breakTimer <= 0) { this.run.autoStarts++; this.startWave(); }
    }

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateMines(dt);
    this.updateAbilities(dt);

    // enemies created mid-tick (worm fragments) join once iteration is done
    if (this.spawnLater.length) {
      for (const s of this.spawnLater) this.spawn(s.type, s.mult, s.path, s.d);
      this.spawnLater.length = 0;
    }

    let k = 0;
    for (const e of this.enemies) if (!e.dead && !e.leaked) this.enemies[k++] = e;
    this.enemies.length = k;

    if (this.state === 'wave' && !this.spawnQueue.length && !this.enemies.length) this.endWave();
    this.coreFlash = Math.max(0, this.coreFlash - dt * 2.5);
    this.fx.update(dt);
  }

  // ── Enemies ──────────────────────────────────────────────
  spawn(type, mult, path = 0, d = 0) {
    const def = ENEMIES[type];
    // (a Leviathan's mult is 1 except deep in Endless — see bossMult)
    const maxHp = def.hp * mult * this.diffFactor('hp') * HP_SCALE * (this.mut.hp || 1);
    // Endless past the campaign: malware adapts — faster, and shrugs off more crowd control
    const k = this.endless ? Math.max(0, this.wave - this.map.def.waves.length) : 0;
    const haste = 1 + Math.min(ENDLESS.speedCap, ENDLESS.speedGrowth * k);
    const e = {
      id: this.nextId++, type, def, maxHp, hp: maxHp, mult,
      path, d, lane: def.boss ? 0 : rand(-7, 7),
      radius: def.radius, armor: def.armor + (this.rule?.armor ?? 0) + (this.mut.armor || 0), speed: def.speed * rand(0.94, 1.06) * (this.mut.speed || 1) * haste,
      slowAmt: 0, slowT: 0, freezeT: 0, stunT: 0, vulnAmt: 0, vulnT: 0, pullCd: 0,
      pulls: 0, ccImmT: 0, ccRes: Math.min(ENDLESS.ccCap, ENDLESS.ccGrowth * k),
      surgeT: 0, overT: def.overclock ? def.overclock.every * 0.6 : 0,
      flash: 0, dead: false, leaked: false, age: d > 0 ? 0.25 : 0, seed: Math.random() * 100, trailT: 0,
      shieldUp: !!def.shield, shieldT: 0, revealT: 0, healT: def.heal ? def.heal.every * rand(0.3, 1) : 0,
      thermalT: def.thermal ? def.thermal.every * rand(0.3, 1) : 0, carryT: def.carry ? def.carry.every * rand(0.5, 1) : 0, carried: 0,
      blinkT: def.blink ? def.blink.every * rand(0.4, 1) : 0, aegised: false,
      x: 0, y: 0, angle: 0,
    };
    const p = this.map.paths[path].posAt(d, e.lane);
    e.x = p.x; e.y = p.y; e.angle = p.angle;
    this.enemies.push(e);
    const P = d > 0 ? e : this.map.paths[path].start;
    this.fx.ring(P.x, P.y, 4, def.boss ? 90 : 30, 0.4, def.color, def.boss ? 5 : 2);
    if (def.boss) {
      this.boss = e;
      this.fx.shake(10);
      this.fx.flash('255,40,100', 0.3);
      this.fx.burst(P.x, P.y, def.color, 60, 320, 5, 0.9);
      this.emit('boss', e);
      this.sfx('boss');
    }
  }

  updateEnemies(dt) {
    const fx = this.fx;
    if (this.panicT > 0) this.panicT -= dt;
    // Bulwark auras: mark who is protected this tick
    const shields = this.enemies.filter((o) => o.def.aegis && !o.dead && !o.leaked);
    for (const e of this.enemies) {
      e.aegised = shields.some((a) => a !== e && (a.x - e.x) ** 2 + (a.y - e.y) ** 2 <= a.def.aegis.radius ** 2);
    }
    for (const e of this.enemies) {
      if (e.dead || e.leaked) continue;
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowAmt = 0; }
      if (e.vulnT > 0) { e.vulnT -= dt; if (e.vulnT <= 0) e.vulnAmt = 0; }
      if (e.pullCd > 0) e.pullCd -= dt;
      if (e.ccImmT > 0) e.ccImmT -= dt;
      // Leviathan overclock: throws off every slow, freeze and stun, surges and drops Glitches
      if (e.def.overclock) this.overclock(e, dt);
      let mult = 1 - e.slowAmt;
      if (this.panicT > 0) mult *= this.rule.panic.speed;
      // a freeze or stun is followed by a short immunity, so towers can't chain-lock malware
      if (e.freezeT > 0) { e.freezeT -= dt; mult = 0; if (e.freezeT <= 0) e.ccImmT = CC.grace; }
      if (e.stunT > 0) { e.stunT -= dt; mult = 0; if (e.stunT <= 0) e.ccImmT = CC.grace; }
      if (e.surgeT > 0) mult = e.def.overclock.speed * (this.panicT > 0 ? this.rule.panic.speed : 1);
      const ease = Math.min(1, e.age / 0.4);
      const prevD = e.d;
      e.d += e.speed * mult * dt * (0.4 + 0.6 * ease);

      const path = this.map.paths[e.path];
      let p = path.posAt(e.d, e.lane);
      // Firewalls stop anything advancing into them (moving away from one is allowed)
      if (this.firewalls.length && e.d > prevD) {
        const fw = this.blockingFirewall(e, p);
        if (fw) {
          e.d = prevD;
          p = path.posAt(e.d, e.lane);
          if (this.pressFirewall(fw, e, dt)) continue;
        }
      }
      e.x = p.x; e.y = p.y;
      e.angle = turnTowards(e.angle, p.angle, dt * 10);

      if (e.d >= path.length) { this.leak(e); continue; }

      // Cipher: shield re-encrypts a while after it pops
      if (e.def.shield && !e.shieldUp) {
        e.shieldT -= dt;
        if (e.shieldT <= 0) {
          e.shieldUp = true;
          fx.ring(e.x, e.y, e.radius + 10, e.radius + 4, 0.25, '#ffffff', 1.5);
        }
      }
      if (e.revealT > 0) e.revealT -= dt;
      // Furnace: immune to chill; heat pulses thaw allies around it
      if (e.def.thermal) {
        e.thermalT -= dt;
        if (e.thermalT <= 0) {
          const th = e.def.thermal;
          e.thermalT = th.every;
          let thawed = 0;
          for (const o of this.enemies) {
            if (o.dead || o.leaked || (o.x - e.x) ** 2 + (o.y - e.y) ** 2 > th.radius * th.radius) continue;
            if (o.slowAmt > 0 || o.freezeT > 0) thawed++;
            o.slowAmt = 0; o.slowT = 0; o.freezeT = 0;
          }
          fx.ring(e.x, e.y, 8, th.radius, 0.45, e.def.color, 2);
          if (thawed) fx.burst(e.x, e.y, '#ffb347', 10, 120, 2.5, 0.4, 'ember', 1.5);
        }
      }
      // Carrier: drops Glitches behind it as it goes
      if (e.def.carry && e.carried < e.def.carry.max) {
        e.carryT -= dt;
        if (e.carryT <= 0) {
          const c = e.def.carry;
          e.carryT = c.every;
          for (let i = 0; i < c.count && e.carried < c.max; i++, e.carried++) {
            this.spawnLater.push({ type: c.type, mult: e.mult * c.hp, path: e.path, d: Math.max(1, e.d - 6 - i * 10) });
          }
          fx.ring(e.x, e.y, e.radius, e.radius + 14, 0.3, e.def.color, 2);
        }
      }
      // Blinker: jumps ahead along the bus (not while a Firewall is up)
      if (e.def.blink) {
        e.blinkT -= dt;
        if (e.blinkT <= 0) {
          e.blinkT = e.def.blink.every * rand(0.85, 1.15);
          if (!this.firewalls.length && e.freezeT <= 0 && e.stunT <= 0) {
            const from = { x: e.x, y: e.y };
            e.d = Math.min(path.length - 24, e.d + e.def.blink.dist);
            const q = path.posAt(e.d, e.lane);
            e.x = q.x; e.y = q.y;
            fx.ring(from.x, from.y, e.radius + 8, 2, 0.25, e.def.color, 2);
            fx.ring(e.x, e.y, 2, e.radius + 12, 0.3, e.def.color, 2);
            fx.beam(from.x, from.y, e.x, e.y, e.def.color, 3, 0.15);
          }
        }
      }
      // Patcher: periodic heal pulse on nearby malware (capped per target, so bosses heal slowly)
      if (e.def.heal) {
        e.healT -= dt;
        if (e.healT <= 0) {
          const h = e.def.heal;
          e.healT = h.every;
          let healed = 0;
          for (const o of this.enemies) {
            if (o.dead || o.leaked || o.hp >= o.maxHp) continue;
            if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 > h.radius * h.radius) continue;
            o.hp = Math.min(o.maxHp, o.hp + Math.min(o.maxHp * h.pct, h.cap));
            fx.add({ kind: 'glow', x: o.x, y: o.y - o.radius, vx: 0, vy: -40, life: 0.5, size: 4, color: e.def.color, drag: 1 });
            healed++;
          }
          fx.ring(e.x, e.y, 6, h.radius, 0.5, e.def.color, 2);
          if (healed) this.sfx('heal', e.x);
        }
      }

      // ambient trails
      e.trailT -= dt;
      if (e.trailT <= 0) {
        if (e.def.stealth && e.revealT <= 0) {
          e.trailT = 0.2; // cloaked: no trail
        } else if (e.type === 'scout' || e.type === 'frag') {
          e.trailT = 0.035;
          fx.add({ kind: 'glow', x: e.x - Math.cos(e.angle) * 8, y: e.y - Math.sin(e.angle) * 8, vx: rand(-10, 10), vy: rand(-10, 10), life: 0.3, size: 4, color: e.def.color, drag: 2 });
        } else if (e.type === 'boss') {
          e.trailT = 0.03;
          const a = Math.random() * TAU;
          fx.add({ kind: 'glow', x: e.x + Math.cos(a) * e.radius, y: e.y + Math.sin(a) * e.radius, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, life: 0.6, size: 5, color: '#ff1f3d', drag: 1 });
        } else {
          e.trailT = 0.12;
          fx.add({ kind: 'glow', x: e.x + rand(-6, 6), y: e.y + rand(-6, 6), vx: 0, vy: 0, life: 0.5, size: 3, color: e.def.color, drag: 0 });
        }
        if (e.slowAmt > 0 && Math.random() < 0.5) {
          fx.add({ kind: 'glow', x: e.x + rand(-e.radius, e.radius), y: e.y + rand(-e.radius, e.radius), vx: 0, vy: -20, life: 0.5, size: 2.5, color: '#bfe8ff', drag: 0 });
        }
      }
    }
  }

  // ── Logic Mines ──
  // Spots on the bus inside the tower's range, sampled once per tower/upgrade.
  busSpotsFor(t) {
    if (t.busSpots) return t.busSpots;
    const out = [], R = t.stats.range;
    for (const p of this.map.paths) {
      for (let d = 20; d < p.length - 30; d += 12) {
        const q = p.posAt(d);
        if ((q.x - t.x) ** 2 + (q.y - t.y) ** 2 <= R * R) out.push(q);
      }
    }
    return (t.busSpots = out);
  }

  tickMineLayer(t, dt) {
    const s = t.stats;
    const mine = this.mines.filter((m) => m.src === t);
    if (mine.length >= s.maxMines) return;
    if ((t.layT -= dt) > 0) return;
    t.layT = 1 / s.rate;
    const spots = this.busSpotsFor(t);
    if (!spots.length) return;
    // prefer spots away from mines already down
    let spot = null;
    for (let i = 0; i < 8 && !spot; i++) {
      const q = spots[Math.floor(Math.random() * spots.length)];
      if (this.mines.every((m) => (m.x - q.x) ** 2 + (m.y - q.y) ** 2 > 26 * 26)) spot = q;
    }
    if (!spot) return;
    this.mines.push({
      x: spot.x + rand(-5, 5), y: spot.y + rand(-5, 5), fromX: t.x, fromY: t.y, armT: 0.45, age: 0, src: t,
      dmg: s.mineDmg, radius: s.mineRadius, stun: s.mineStun, slow: s.mineSlow, chain: s.chain, burn: s.mineBurn, strip: s.strip, color: s.color,
      big: s.maxMines <= 2,
    });
    t.recoil = 1;
    this.sfx('mineLay', t.x);
  }

  updateMines(dt) {
    if (!this.mines.length) return;
    for (const m of this.mines) {
      m.age += dt;
      if (m.armT > 0) { m.armT -= dt; continue; }
      if (m.gone) continue;
      for (const e of this.enemies) {
        if (e.dead || e.leaked) continue;
        if ((e.x - m.x) ** 2 + (e.y - m.y) ** 2 <= (14 + e.radius) ** 2) { this.detonate(m); break; }
      }
    }
    this.mines = this.mines.filter((m) => !m.gone && this.towers.includes(m.src));
  }

  detonate(m) {
    if (m.gone) return;
    m.gone = true;
    for (const e of this.enemies) {
      if (e.dead || e.leaked || (e.x - m.x) ** 2 + (e.y - m.y) ** 2 > (m.radius + e.radius * 0.5) ** 2) continue;
      if (m.strip && e.def.shield && e.shieldUp) { e.shieldUp = false; e.shieldT = e.def.shield; }
      if (m.stun) this.hold(e, 'stunT', m.stun);
    }
    this.explodeAt(m.x, m.y, m.dmg, m.radius, m.src, m.color, m.big || m.radius > 70, !m.big && m.radius < 50);
    if (m.slow) this.zones.push({ x: m.x, y: m.y, r: m.radius * 0.9, dps: 0, slow: m.slow, t: 3, max: 3, tick: 0, color: '#8d7bff', src: m.src });
    if (m.burn) this.zones.push({ x: m.x, y: m.y, r: m.radius * 0.8, dps: m.burn, t: 3, max: 3, tick: 0, color: m.color, src: m.src });
    if (m.chain) {
      for (const o of this.mines) {
        if (o === m || o.gone || o.armT > 0 || (o.x - m.x) ** 2 + (o.y - m.y) ** 2 > 90 * 90) continue;
        this.fx.after(0.12, () => this.detonate(o));
      }
    }
  }

  // Lightning rule: a bolt lands on the malware, damaging and stunning everything around it
  updateStrikes(dt) {
    const sk = this.rule.strike;
    if ((this.strikeT -= dt) > 0) return;
    const pool = this.enemies.filter((e) => !e.dead && !e.leaked && e.age > 0.5);
    if (!pool.length) { this.strikeT = 0.5; return; }
    this.strikeT = rand(sk.every[0], sk.every[1]);
    const t = pool[Math.floor(Math.random() * pool.length)];
    const x = t.x, y = t.y, dmg = sk.dmg * waveHpMult(this.wave, this.map.def.hpCurve);
    for (const e of pool) {
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > sk.radius * sk.radius) continue;
      this.hold(e, 'stunT', sk.stun);
      this.hurt(e, dmg, null, true);
    }
    this.fx.ring(x, y, 6, sk.radius, 0.4, '#c9b8ff', 4);
    this.fx.burst(x, y, '#e6e0ff', 24, 260, 3, 0.4, 'spark', 3);
    this.fx.flash('200,190,255', 0.18);
    this.fx.shake(5);
    this.emit('strike', { x, y });
  }

  leak(e) {
    e.leaked = true;
    this.lives = Math.max(0, this.lives - e.def.leak);
    this.leaks++;
    if (this.rule?.panic) { this.panicT = this.rule.panic.time; this.emit('panic'); }
    this.coreFlash = 1;
    const C = this.map.core;
    this.fx.shake(e.def.boss ? 20 : 7);
    this.fx.flash('255,40,80', e.def.boss ? 0.5 : 0.22);
    this.fx.ring(C.x, C.y, 10, 80, 0.5, '#ff2a6d', 4);
    this.fx.burst(C.x, C.y, '#ff2a6d', 24, 220, 4, 0.6);
    this.sfx('hurt', C.x);
    this.emit('leak', e);
    if (e === this.boss) this.boss = this.enemies.find((o) => o !== e && o.def.boss && !o.dead && !o.leaked) || null;
    // Failsafe research: the first fatal breach leaves the Core at 1 and stuns the board
    if (this.lives <= 0 && this.failsafe) {
      this.failsafe = false;
      this.run.failsafeUsed = true;
      this.lives = 1;
      for (const o of this.enemies) if (!o.dead && !o.leaked) o.stunT = Math.max(o.stunT, 2 * (o.def.ccResist ?? 1));
      const C = this.map.core;
      this.fx.ring(C.x, C.y, 10, 900, 1, '#00e5ff', 6);
      this.fx.flash('120,240,255', 0.5);
      this.emit('failsafe');
      this.sfx('purge', C.x);
    }
    if (this.lives <= 0 && this.state !== 'lost') {
      this.state = 'lost';
      this.fx.after(0, () => this.coreExplosion());
      this.emit('lose');
      this.sfx('lose');
    }
  }

  coreExplosion() {
    const C = this.map.core;
    this.fx.flash('255,60,90', 0.8);
    this.fx.shake(22);
    this.fx.ring(C.x, C.y, 10, 400, 1.2, '#ff2a6d', 8);
    this.fx.burst(C.x, C.y, '#ff2a6d', 120, 600, 6, 1.4);
    this.fx.burst(C.x, C.y, '#ffffff', 40, 400, 4, 1);
    this.sfx('bigboom', C.x);
  }

  // Can towers see (and aim at) this enemy? Cloaked Rootkits only once revealed.
  visible(e) { return !e.def.stealth || e.revealT > 0; }

  // bypassShield: damage-over-time (burn zones) ignores Cipher shields
  hurt(e, amount, src, pierce = false, bypassShield = false) {
    if (e.dead || e.leaked) return 0;
    if (e.def.stealth) e.revealT = Math.max(e.revealT, 0.6 * (this.rule?.reveal ?? 1)); // any hit briefly exposes a Rootkit
    if (e.shieldUp && !bypassShield) {
      e.shieldUp = false;
      e.shieldT = e.def.shield;
      e.flash = 0.07;
      this.fx.ring(e.x, e.y, e.radius + 4, e.radius + 16, 0.25, '#ffffff', 2);
      this.fx.burst(e.x, e.y, e.def.color, 8, 140, 2, 0.3, 'spark', 4);
      this.sfx('shield', e.x);
      return 0;
    }
    let dmg = amount * (1 + e.vulnAmt);
    if (pierce && this.rule?.pierceBonus) dmg *= this.rule.pierceBonus;
    const armor = e.armor - this.mods.armorPierce;
    if (!pierce && armor > 0) dmg = Math.max(dmg - armor, dmg * 0.2);
    if (e.aegised) dmg *= 1 - 0.4; // a Bulwark nearby soaks part of every hit
    e.hp -= dmg;
    e.flash = 0.07;
    if (src) src.dealt += dmg;
    if (e.hp <= 0) {
      if (src) src.kills++;
      this.kill(e);
    }
    return dmg;
  }

  kill(e) {
    e.dead = true;
    this.kills++;
    this.score += e.def.reward * SCORE.kill;
    const reward = this.rewardFor(e);
    this.credits += reward;
    const fx = this.fx, col = e.def.color;
    fx.text(e.x, e.y - e.radius - 4, '+' + reward, '#ffb800', e.def.boss ? 22 : 12);
    this.emit('reward', { x: e.x, y: e.y, amount: reward });
    if (e.def.split) {
      const { type, count } = e.def.split;
      for (let i = 0; i < count; i++) this.spawnLater.push({ type, mult: e.mult, path: e.path, d: Math.max(1, e.d - i * 12) });
    }
    // presentation hook: the kill that ends a wave (the boss has its own event)
    if (!e.def.boss && this.state === 'wave' && !this.spawnQueue.length && !this.spawnLater.length
      && this.enemies.every((o) => o === e || o.dead || o.leaked)) this.emit('finalKill', e);
    if (!e.def.boss && e.radius < 14) {
      fx.burst(e.x, e.y, col, 14, 170, 3, 0.45);
      fx.burst(e.x, e.y, '#ffffff', 6, 220, 1.5, 0.25, 'spark', 4);
      fx.burst(e.x, e.y, col, 3, 120, 3.5, 0.5, 'shard', 3);
      fx.ring(e.x, e.y, 3, 26, 0.3, col, 2);
      fx.add({ kind: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.1, size: 18, color: col });
      this.sfx('pop', e.x);
    } else if (!e.def.boss) {
      fx.burst(e.x, e.y, col, 26, 210, 4, 0.6);
      fx.burst(e.x, e.y, col, 10, 160, 4, 0.9, 'debris', 2.5);
      fx.burst(e.x, e.y, '#ffffff', 10, 260, 1.8, 0.3, 'spark', 4);
      fx.burst(e.x, e.y, col, 7, 190, 5, 0.75, 'shard', 2.5);
      fx.burst(e.x, e.y, col, 8, 70, 2.5, 1.1, 'ember', 1.2);
      fx.ring(e.x, e.y, 6, 46, 0.4, col, 3);
      fx.add({ kind: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.18, size: 44, color: col });
      fx.shake(2.5);
      this.sfx('boom', e.x);
    } else {
      // Boss: chained detonations, then a supernova
      const x = e.x, y = e.y;
      for (let i = 0; i < 9; i++) {
        fx.after(i * 0.12, () => {
          const ox = x + rand(-40, 40), oy = y + rand(-40, 40);
          fx.burst(ox, oy, i % 2 ? '#ff1f3d' : '#ff2bd6', 22, 240, 4, 0.6);
          fx.ring(ox, oy, 4, 50, 0.35, '#00e5ff', 3);
          fx.shake(6);
          this.sfx('boom', ox);
        });
      }
      fx.after(1.15, () => {
        fx.flash('255,220,240', 0.7);
        fx.shake(20);
        fx.ring(x, y, 10, 320, 1, '#ff1f3d', 8);
        fx.ring(x, y, 10, 220, 0.8, '#ffffff', 4);
        fx.burst(x, y, '#ff1f3d', 110, 560, 6, 1.2);
        fx.burst(x, y, '#ffffff', 40, 420, 3, 0.8, 'spark', 2);
        fx.burst(x, y, '#00e5ff', 24, 300, 6, 1.6, 'debris', 1.5);
        fx.burst(x, y, '#ff2a6d', 26, 420, 7, 1.5, 'shard', 1.6);
        fx.burst(x, y, '#ffb347', 40, 160, 3, 2.2, 'ember', 0.9);
        this.sfx('bigboom', x);
      });
      if (e === this.boss) this.boss = this.enemies.find((o) => o !== e && o.def.boss && !o.dead && !o.leaked) || null;
      this.emit('bossDown', e);
    }
  }

  // ── Player abilities ─────────────────────────────────────
  abilityReady(id) { return !this.over && this.cooldowns[id] <= 0; }

  updateAbilities(dt) {
    for (const id in this.cooldowns) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    let k = 0;
    for (const fw of this.firewalls) {
      fw.t -= dt;
      if (fw.t <= 0) { this.firewallDown(fw, false); continue; }
      if (Math.random() < 0.4) {
        const o = rand(-16, 16);
        this.fx.add({ kind: 'glow', x: fw.x - Math.sin(fw.angle) * o, y: fw.y + Math.cos(fw.angle) * o, vx: 0, vy: -rand(15, 40), life: 0.4, size: 2.5, color: ABILITIES.firewall.color, drag: 0 });
      }
      this.firewalls[k++] = fw;
    }
    this.firewalls.length = k;
  }

  // Nearest point on any data bus within maxDist of (x, y), or null
  snapToBus(x, y, maxDist = 24) {
    let best = null, bd = maxDist;
    for (const path of this.map.paths) {
      for (const s of path.segs) {
        const px = x - s.x0, py = y - s.y0;
        const along = Math.max(0, Math.min(s.len, px * s.ux + py * s.uy));
        const cx = s.x0 + s.ux * along, cy = s.y0 + s.uy * along;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bd) { bd = d; best = { x: cx, y: cy, angle: s.angle }; }
      }
    }
    return best;
  }

  useFirewall(x, y) {
    if (!this.abilityReady('firewall')) return false;
    const spot = this.snapToBus(x, y);
    if (!spot) return false;
    const def = ABILITIES.firewall;
    const dur = (def.duration + (this.perks.firewallPlus || 0)) * this.mods.firewallDur;
    this.firewalls.push({ ...spot, t: dur, max: dur, bossT: def.bossHold * this.mods.firewallDur, dps: def.dps });
    this.cooldowns.firewall = this.abilityCooldown('firewall');
    this.run.abilities++;
    this.fx.ring(spot.x, spot.y, 4, 40, 0.4, def.color, 3);
    this.fx.burst(spot.x, spot.y, def.color, 24, 200, 3, 0.5);
    this.fx.shake(2);
    this.sfx('firewall', spot.x);
    return true;
  }

  blockingFirewall(e, p) {
    for (const fw of this.firewalls) {
      const now = Math.hypot(p.x - fw.x, p.y - fw.y);
      if (now < e.radius + 9 && now < Math.hypot(e.x - fw.x, e.y - fw.y)) return fw;
    }
    return null;
  }

  // An enemy pushing on a firewall: it burns (ignoring armor/shields); bosses grind the wall down.
  // Returns true if the enemy died.
  pressFirewall(fw, e, dt) {
    if (e.def.boss) {
      fw.bossT -= dt;
      if (fw.bossT <= 0) { this.firewallDown(fw, true); return false; }
    }
    if (Math.random() < 0.15) this.fx.burst(e.x, e.y, ABILITIES.firewall.color, 2, 90, 1.5, 0.2, 'spark', 4);
    e.hp -= fw.dps * dt * (1 + e.vulnAmt);
    if (e.hp <= 0) { this.kill(e); return true; }
    return false;
  }

  firewallDown(fw, smashed) {
    fw.t = 0;
    this.firewalls = this.firewalls.filter((o) => o !== fw);
    const col = ABILITIES.firewall.color;
    this.fx.burst(fw.x, fw.y, col, smashed ? 30 : 14, smashed ? 260 : 120, 3, 0.5, smashed ? 'debris' : 'glow', 2);
    if (smashed) { this.fx.shake(6); this.sfx('firewallDown', fw.x); }
  }

  usePurge() {
    if (!this.abilityReady('purge') || !this.enemies.length) return false;
    const def = ABILITIES.purge, C = this.map.core, fx = this.fx;
    const kills0 = this.kills;
    this.run.abilities++;
    let i = 0;
    for (const e of this.enemies) {
      if (e.dead || e.leaked) continue;
      if (e.def.shield) { e.shieldUp = false; e.shieldT = e.def.shield; }
      if (e.def.stealth) e.revealT = Math.max(e.revealT, def.reveal);
      this.hold(e, 'stunT', def.stun, true);
      if (i++ < 18) fx.lightning([{ x: C.x, y: C.y }, { x: e.x, y: e.y }], def.color, 1.6, 0.35);
      fx.burst(e.x, e.y, def.color, 6, 120, 2, 0.35, 'spark', 4);
      this.hurt(e, e.maxHp * (e.def.boss ? def.bossPct : def.pct) * this.mods.purge, null, true, true);
    }
    this.cooldowns.purge = this.abilityCooldown('purge');
    this.run.purgeKills = Math.max(this.run.purgeKills, this.kills - kills0);
    this.emit('purged', this.kills - kills0);
    fx.ring(C.x, C.y, 20, 1500, 1.1, def.color, 6);
    fx.ring(C.x, C.y, 20, 900, 0.8, '#ffffff', 3);
    fx.flash('255,190,60', 0.35);
    fx.shake(12);
    this.sfx('purge');
    return true;
  }

  // ── Towers ───────────────────────────────────────────────
  towerAt(c, r) { return this.grid.get(c + ',' + r) || null; }

  canPlace(type, c, r) {
    return this.map.isBuildable(c, r) && !this.grid.has(c + ',' + r) && this.credits >= TOWERS[type].cost;
  }

  place(type, c, r) {
    if (!this.canPlace(type, c, r)) return null;
    const def = TOWERS[type];
    this.credits -= def.cost;
    const t = {
      id: this.nextId++, type, def, c, r, x: c * TILE + TILE / 2, y: r * TILE + TILE / 2,
      path: [], level: 1, stats: this.statsFor(type, []), baseStats: null, buffKey: '', layT: 0.6, mineT: 0, busSpots: null,
      cooldown: 0.25, angle: -Math.PI / 2, target: null, recoil: 0, barrel: 0, spin: 0,
      spawnT: 0, invested: def.cost, dealt: 0, kills: 0, upgradeFlash: 0,
      targeting: 'first', heat: 0,
    };
    t.baseStats = t.stats;
    this.towers.push(t);
    this.run.types.add(type);
    this.run.maxTowers = Math.max(this.run.maxTowers, this.towers.length);
    this.grid.set(c + ',' + r, t);
    this.fx.ring(t.x, t.y, 4, 34, 0.45, def.color, 3);
    this.fx.burst(t.x, t.y, def.color, 18, 140, 3, 0.5);
    this.sfx('place', t.x);
    return t;
  }

  upgrade(t, idx) {
    const node = upgradeOptions(t.type, t.path)[idx];
    const cost = node && this.costOf(node, t);
    if (!node || this.credits < cost) return false;
    this.credits -= cost;
    t.invested += cost;
    t.path.push(idx);
    t.level = 1 + t.path.length;
    this.run.maxLevel = Math.max(this.run.maxLevel, t.level);
    if (t.level === 3) this.emit('evolved', t);
    t.stats = t.baseStats = this.statsFor(t.type, t.path);
    t.buffKey = ''; t.busSpots = null;
    t.upgradeFlash = 1;
    const fx = this.fx, col = t.stats.color;
    fx.beam(t.x, t.y + 4, t.x, t.y - 140, col, 16, 0.55);
    fx.beam(t.x, t.y + 4, t.x, t.y - 140, '#ffffff', 4, 0.4);
    fx.ring(t.x, t.y, 6, 46, 0.5, col, 3);
    fx.after(0.12, () => fx.ring(t.x, t.y, 6, 70, 0.6, col, 2));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      fx.add({ kind: 'glow', x: t.x + Math.cos(a) * 18, y: t.y + Math.sin(a) * 8, vx: Math.cos(a) * 20, vy: -rand(60, 170), life: rand(0.5, 0.9), size: 3, color: col, drag: 1 });
    }
    this.sfx('upgrade', t.x);
    return true;
  }

  sell(t) {
    const refund = Math.floor(t.invested * this.sellRatio);
    this.credits += refund;
    this.towers = this.towers.filter((o) => o !== t);
    this.grid.delete(t.c + ',' + t.r);
    this.fx.burst(t.x, t.y, '#ffb800', 20, 160, 3, 0.5);
    this.fx.ring(t.x, t.y, 30, 4, 0.35, '#ffb800', 2);
    this.fx.text(t.x, t.y - 20, '+' + refund, '#ffb800', 14);
    this.sfx('sell', t.x);
    return refund;
  }

  setTargeting(t, mode) {
    if (!TARGET_MODES.includes(mode)) return;
    t.targeting = mode;
    this.fx.ring(t.x, t.y, 22, 12, 0.25, t.stats.color, 1.5);
    this.sfx('click');
  }

  // Higher score = preferred target. 'first' = furthest along the path.
  targetScore(e, x, y, mode) {
    switch (mode) {
      case 'last': return this.map.paths[e.path].length - e.d;
      case 'strong': return e.hp * 1000 + e.d;
      case 'close': return -((e.x - x) ** 2 + (e.y - y) ** 2);
      default: return e.d - this.map.paths[e.path].length; // least distance left to the Core
    }
  }

  findTarget(x, y, range, mode = 'first') {
    let best = null, bs = -Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.leaked || !this.visible(e)) continue;
      const dx = e.x - x, dy = e.y - y, rr = range + e.radius * 0.5;
      if (dx * dx + dy * dy > rr * rr) continue;
      const s = this.targetScore(e, x, y, mode);
      if (s > bs) { bs = s; best = e; }
    }
    return best;
  }

  // Up to n distinct targets in range, best first by the tower's targeting mode
  pickTargets(t, n) {
    return this.inRange(t.x, t.y, t.stats.range)
      .map((e) => [this.targetScore(e, t.x, t.y, t.targeting), e])
      .sort((a, b) => b[0] - a[0])
      .slice(0, n)
      .map((p) => p[1]);
  }

  inRange(x, y, range) {
    const out = [];
    for (const e of this.enemies) {
      if (e.dead || e.leaked || !this.visible(e)) continue;
      const dx = e.x - x, dy = e.y - y, rr = range + e.radius * 0.5;
      if (dx * dx + dy * dy <= rr * rr) out.push(e);
    }
    return out;
  }

  // Like inRange, but includes cloaked enemies — for area effects that don't need to aim
  allInRange(x, y, range) {
    const out = [];
    for (const e of this.enemies) {
      if (e.dead || e.leaked) continue;
      const dx = e.x - x, dy = e.y - y, rr = range + e.radius * 0.5;
      if (dx * dx + dy * dy <= rr * rr) out.push(e);
    }
    return out;
  }

  nearestEnemy(x, y, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (const e of this.enemies) {
      if (e.dead || e.leaked || !this.visible(e)) continue;
      const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  // Overclock Hubs: each tower takes the best boost per stat from any hub covering it (no stacking)
  applyHubs(dt) {
    const hubs = this.towers.filter((t) => t.stats.kind === 'aura' && t.spawnT >= 1);
    for (const t of this.towers) {
      if (t.stats.kind === 'aura') continue;
      let rate = 0, dmg = 0, range = 0, pierce = false;
      for (const h of hubs) {
        const hs = h.stats;
        if ((h.x - t.x) ** 2 + (h.y - t.y) ** 2 > hs.range * hs.range) continue;
        rate = Math.max(rate, hs.buffRate); dmg = Math.max(dmg, hs.buffDmg); range = Math.max(range, hs.buffRange); pierce = pierce || hs.buffPierce;
      }
      const key = `${rate}|${dmg}|${range}|${pierce}`;
      if (key === t.buffKey) continue;
      t.buffKey = key;
      const st = { ...t.baseStats };
      if (rate || dmg || range || pierce) {
        st.rate *= 1 + rate; st.damage *= 1 + dmg; st.range *= 1 + range;
        if (st.mineDmg) st.mineDmg *= 1 + dmg;
        if (st.burn) st.burn *= 1 + dmg;
        if (pierce) st.pierceArmor = true;
        st.buffed = true;
      }
      t.stats = st;
    }
    for (const h of hubs) {
      const hs = h.stats;
      // field effects on malware inside the hub's radius
      if (hs.revealField || hs.field) {
        for (const e of this.enemies) {
          if (e.dead || e.leaked || (e.x - h.x) ** 2 + (e.y - h.y) ** 2 > hs.range * hs.range) continue;
          if (hs.revealField && e.def.stealth) e.revealT = Math.max(e.revealT, 0.3);
          if (hs.field) this.applyStatus(e, { slow: hs.slow, slowTime: 0.35, vuln: hs.vuln });
        }
      }
      if (hs.mine && this.state === 'wave') {
        h.mineT += dt;
        if (h.mineT >= 4) {
          h.mineT -= 4;
          this.credits += hs.mine;
          this.fx.text(h.x, h.y - 24, '+' + hs.mine, '#ffe066', 11);
          this.emit('reward', { x: h.x, y: h.y, amount: hs.mine });
        }
      }
    }
  }

  updateTowers(dt) {
    this.applyHubs(dt);
    const jammers = this.enemies.filter((e) => e.def.jam && !e.dead && !e.leaked);
    for (const t of this.towers) {
      // Jammers nearby slow this tower's reload
      const jam = jammers.find((j) => (j.x - t.x) ** 2 + (j.y - t.y) ** 2 <= j.def.jam.radius ** 2);
      t.jammed = !!jam;
      const s = t.stats;
      t.spawnT = Math.min(1, t.spawnT + dt * 3);
      t.recoil = Math.max(0, t.recoil - dt * 6);
      t.upgradeFlash = Math.max(0, t.upgradeFlash - dt * 1.5);
      // Gatling heat: spins up over ~2.5s of continuous fire, cools in ~1.2s
      if (s.spinUp) t.heat = t.target ? Math.min(1, t.heat + dt / 2.5) : Math.max(0, t.heat - dt / 1.2);
      if (s.gatling) t.spin += dt * (t.target ? 18 + 22 * t.heat : 3);
      t.cooldown -= dt * (jam ? jam.def.jam.factor : 1);
      if (s.kind === 'aura') { t.target = null; continue; } // support only
      if (s.kind === 'mines') { this.tickMineLayer(t, dt * (jam ? jam.def.jam.factor : 1)); continue; }

      // area towers (ICE pulse, EMP) trigger on anything in range, cloaked or not
      const target = s.kind === 'pulse' || s.kind === 'nova'
        ? this.allInRange(t.x, t.y, s.range)[0] || null
        : this.findTarget(t.x, t.y, s.range, t.targeting);
      t.target = target;
      if (target && (s.kind === 'bolt' || s.kind === 'rail' || s.kind === 'missile' || s.kind === 'lance')) {
        t.angle = turnTowards(t.angle, Math.atan2(target.y - t.y, target.x - t.x), dt * 12);
      }
      if (t.cooldown <= 0) {
        if (target) { this.fire(t, target); t.cooldown += 1 / (s.rate * (1 + s.spinUp * t.heat)); }
        else t.cooldown = 0;
      }
    }
  }

  // Chain lightning from an Arc Relay; mult scales damage (Tempest echo uses 0.5)
  chainStrike(t, target, mult) {
    const s = t.stats, fx = this.fx;
    const hits = [target];
    let cur = target;
    const cr2 = s.chainRange * s.chainRange;
    while (hits.length < s.chains) {
      let best = null, bd = cr2;
      for (const e of this.enemies) {
        if (e.dead || hits.includes(e) || !this.visible(e)) continue;
        const d2 = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
        if (d2 < bd) { bd = d2; best = e; }
      }
      if (!best) break;
      hits.push(best);
      cur = best;
    }
    const pts = [{ x: t.x, y: t.y - 22 }];
    let dmg = s.damage * mult;
    for (const e of hits) {
      pts.push({ x: e.x, y: e.y });
      this.hurt(e, dmg, t, s.pierceArmor);
      this.applyStatus(e, s);
      fx.burst(e.x, e.y, s.color, 5, 120, 2, 0.25, 'spark', 4);
      dmg *= s.chainFalloff;
    }
    fx.lightning(pts, s.color, mult < 1 ? 1.6 : 2.4, 0.18);
    fx.add({ kind: 'glow', x: t.x, y: t.y - 22, vx: 0, vy: 0, life: 0.15, size: mult < 1 ? 14 : 20, color: s.color });
    this.sfx('zap', t.x);
  }

  // Lightning / pulse status effects
  applyStatus(e, s) {
    if (e.dead) return;
    const chill = this.rule?.chill ?? 1, immune = !!e.def.thermal || e.surgeT > 0;
    if (s.slow && !immune) {
      const k = (e.def.boss ? 0.6 : 1) * (e.def.anchored ? 0.5 : 1) * (1 - e.ccRes);
      e.slowAmt = Math.max(e.slowAmt, s.slow * k);
      e.slowT = Math.max(e.slowT, s.slowTime * chill);
    }
    if (s.stunChance && Math.random() < s.stunChance && this.hold(e, 'stunT', s.stunTime)) {
      this.fx.burst(e.x, e.y, '#fff27a', 6, 90, 2, 0.3, 'spark', 4);
    }
    if (s.freezeChance && !immune && e.freezeT <= 0 && Math.random() < s.freezeChance && this.hold(e, 'freezeT', s.freezeTime * chill)) {
      this.fx.burst(e.x, e.y, '#eaf8ff', 10, 110, 2.5, 0.4);
    }
    if (s.vuln) {
      e.vulnAmt = Math.max(e.vulnAmt, s.vuln);
      e.vulnT = Math.max(e.vulnT, s.slowTime + 0.4);
    }
    // Rollback: each malware can only be rolled back a few times; bosses and Watchdogs hold their ground
    if (s.pull && e.pullCd <= 0 && e.pulls < CC.pulls && !e.def.boss && !e.def.anchored) {
      e.d = Math.max(0, e.d - s.pull * (1 - e.ccRes));
      e.pulls++;
      e.pullCd = 1.1;
    }
  }

  // Freeze or stun (key 'freezeT' | 'stunT') for `time` seconds, if it can take hold. Watchdogs and a
  // surging Leviathan ignore it, bosses and Endless malware resist it, and after one wears off there is
  // a short immunity (abilities pass `force` to skip that). Returns whether it took hold.
  hold(e, key, time, force = false) {
    if (e.def.anchored || e.surgeT > 0 || (!force && e.ccImmT > 0)) return false;
    const t = time * (e.def.ccResist ?? 1) * (1 - e.ccRes);
    if (t <= 0) return false;
    e[key] = Math.max(e[key], t);
    return true;
  }

  overclock(e, dt) {
    const oc = e.def.overclock;
    if (e.surgeT > 0) { e.surgeT -= dt; return; }
    if ((e.overT -= dt) > 0) return;
    e.overT = oc.every * rand(0.85, 1.15);
    e.surgeT = oc.time;
    e.slowAmt = 0; e.slowT = 0; e.freezeT = 0; e.stunT = 0;
    const mult = waveHpMult(this.wave, this.map.def.hpCurve);
    for (let i = 0; i < oc.drop; i++) this.spawnLater.push({ type: 'scout', mult, path: e.path, d: Math.max(1, e.d - 14 - i * 12) });
    const fx = this.fx;
    fx.ring(e.x, e.y, e.radius, e.radius * 3.2, 0.45, '#ffffff', 3);
    fx.ring(e.x, e.y, e.radius, e.radius * 2.2, 0.35, e.def.color, 4);
    fx.burst(e.x, e.y, e.def.color, 26, 260, 3, 0.5, 'spark', 3);
    fx.text(e.x, e.y - e.radius - 18, T('OVERCLOCK'), '#ffffff', 14);
    fx.shake(4);
    this.emit('overclock', e);
    this.sfx('emp', e.x);
  }

  fire(t, target) {
    const s = t.stats, fx = this.fx;
    switch (s.kind) {
      case 'lance': {
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        const mx = t.x + Math.cos(t.angle) * 26, my = t.y + Math.sin(t.angle) * 26;
        const hit = new Set();
        let from = { x: mx, y: my }, tg = target, dmg = s.damage;
        for (let n = 0; tg && n <= s.bounces; n++) {
          hit.add(tg);
          fx.beam(from.x, from.y, tg.x, tg.y, s.color, n ? 3 : 5, 0.22);
          fx.beam(from.x, from.y, tg.x, tg.y, '#ffffff', n ? 1 : 1.6, 0.16);
          fx.add({ kind: 'glow', x: tg.x, y: tg.y, vx: 0, vy: 0, life: 0.12, size: 16, color: s.color });
          fx.burst(tg.x, tg.y, s.color, 6, 160, 2, 0.25, 'spark', 4);
          if (s.strip) {
            if (tg.def.shield && tg.shieldUp) { tg.shieldUp = false; tg.shieldT = tg.def.shield; }
            if (tg.def.stealth) tg.revealT = Math.max(tg.revealT, 2);
          }
          if (s.vulnMark) { tg.vulnAmt = Math.max(tg.vulnAmt, s.vulnMark); tg.vulnT = Math.max(tg.vulnT, 3); }
          const d = s.execute && tg.def.boss ? dmg * 1.5 : dmg;
          this.hurt(tg, d, t, s.pierceArmor);
          if (!tg.dead && s.execute && !tg.def.boss && tg.hp / tg.maxHp <= s.execute) {
            fx.text(tg.x, tg.y - tg.radius - 10, T('EXECUTE'), s.color, 11);
            this.hurt(tg, tg.hp + 1, t, true, true);
          }
          if (s.stunChance) this.applyStatus(tg, s);
          // ricochet to the nearest visible malware not hit yet
          from = { x: tg.x, y: tg.y };
          dmg *= s.bounceFalloff;
          let best = null, bd = 140 * 140;
          for (const o of this.enemies) {
            if (o.dead || o.leaked || hit.has(o) || !this.visible(o)) continue;
            const dd = (o.x - from.x) ** 2 + (o.y - from.y) ** 2;
            if (dd < bd) { bd = dd; best = o; }
          }
          tg = best;
        }
        fx.add({ kind: 'glow', x: mx, y: my, vx: 0, vy: 0, life: 0.1, size: 18, color: s.color });
        t.recoil = 1;
        this.sfx('lance', t.x);
        break;
      }
      case 'bolt': {
        let targets = [target];
        if (s.targets > 1) targets = this.pickTargets(t, s.targets);
        t.angle = Math.atan2(target.y - t.y, target.x - t.x);
        const fan = [0, -0.35, 0.35];
        for (let i = 0; i < targets.length; i++) {
          const tg = targets[i];
          const ang = s.scatter ? t.angle + fan[i % 3] : t.angle;
          let side = 0;
          if (s.twin && !s.scatter && !s.gatling) { t.barrel ^= 1; side = t.barrel ? 4 : -4; }
          else if (s.gatling) side = Math.sin(t.spin) * 3;
          const len = s.splash ? 21 : 20;
          const bx = t.x + Math.cos(ang) * len - Math.sin(ang) * side;
          const by = t.y + Math.sin(ang) * len + Math.cos(ang) * side;
          this.projectiles.push({
            kind: 'bolt', x: bx, y: by, vx: Math.cos(ang) * s.projSpeed, vy: Math.sin(ang) * s.projSpeed,
            speed: s.projSpeed, target: tg, dmg: s.damage, splash: s.splash, size: s.boltSize,
            color: s.color, life: 1.2, src: t, pierce: s.pierceArmor,
          });
          fx.add({ kind: 'glow', x: bx, y: by, vx: 0, vy: 0, life: 0.07, size: 9 * s.boltSize, color: s.color });
        }
        t.recoil = 1;
        this.sfx(s.splash ? 'thump' : 'shoot', t.x);
        break;
      }

      case 'rail': {
        const a = Math.atan2(target.y - t.y, target.x - t.x);
        t.angle = a;
        const ca = Math.cos(a), sa = Math.sin(a);
        const x1 = t.x + ca * 26, y1 = t.y + sa * 26;
        const L = s.range + 80;
        const x2 = t.x + ca * L, y2 = t.y + sa * L;
        for (const e of this.enemies) {
          if (e.dead) continue;
          // distance from enemy to the beam segment
          const px = e.x - x1, py = e.y - y1;
          const proj = px * ca + py * sa;
          if (proj < -e.radius || proj > L) continue;
          const perp = Math.abs(px * -sa + py * ca);
          if (perp <= e.radius + 7) {
            this.hurt(e, s.damage, t);
            fx.burst(e.x, e.y, s.color, 8, 200, 2, 0.3, 'spark', 4);
          }
        }
        fx.beam(x1, y1, x2, y2, s.color, 9, 0.3);
        fx.beam(x1, y1, x2, y2, '#ffffff', 2.5, 0.22);
        for (let i = 0; i < 14; i++) {
          const f = Math.random() * L;
          fx.add({ kind: 'glow', x: x1 + ca * f, y: y1 + sa * f, vx: -sa * rand(-40, 40), vy: ca * rand(-40, 40), life: rand(0.2, 0.5), size: 2.5, color: s.color, drag: 2 });
        }
        fx.add({ kind: 'glow', x: x1, y: y1, vx: 0, vy: 0, life: 0.12, size: 22, color: s.color });
        fx.shake(2.5);
        t.recoil = 1;
        this.sfx('rail', t.x);
        break;
      }

      case 'chain': {
        this.chainStrike(t, target, 1);
        if (s.echo) {
          // Tempest: a second, weaker strike from the same spire
          fx.after(0.4, () => {
            if (!this.towers.includes(t) || this.over) return;
            const tg = this.findTarget(t.x, t.y, s.range, t.targeting);
            if (tg) this.chainStrike(t, tg, s.echo);
          });
        }
        break;
      }

      case 'nova': {
        const list = this.allInRange(t.x, t.y, s.range);
        list.forEach((e, i) => {
          if (i < 12) fx.lightning([{ x: t.x, y: t.y - 22 }, { x: e.x, y: e.y }], s.color, 1.8, 0.2);
          this.hurt(e, s.damage, t, true);
          fx.burst(e.x, e.y, s.color, 4, 100, 2, 0.25, 'spark', 4);
        });
        fx.ring(t.x, t.y - 10, 10, s.range, 0.45, s.color, 4);
        fx.add({ kind: 'glow', x: t.x, y: t.y - 22, vx: 0, vy: 0, life: 0.2, size: 36, color: s.color });
        fx.shake(2);
        this.sfx('emp', t.x);
        break;
      }

      case 'pulse': {
        const list = this.allInRange(t.x, t.y, s.range);
        for (const e of list) {
          if (e.def.stealth) {
            if (e.revealT <= 0.6) fx.ring(e.x, e.y, e.radius + 14, e.radius + 2, 0.3, '#7fe9ff', 1.5);
            e.revealT = Math.max(e.revealT, 8); // ICE pulses decloak Rootkits for a good stretch of road
          }
          this.hurt(e, s.damage, t, true);
          this.applyStatus(e, s);
        }
        if (s.hail && list.length) {
          // Hailstorm: shards fall on random enemies in range, staggered
          for (let i = 0; i < s.hail; i++) {
            const e = list[Math.floor(Math.random() * list.length)];
            fx.after(i * 0.09, () => {
              if (e.dead || e.leaked) return;
              const sx = e.x + rand(-14, 14), sy = e.y - 70;
              fx.beam(sx, sy, e.x, e.y, s.color, 4, 0.18);
              fx.beam(sx, sy, e.x, e.y, '#ffffff', 1.5, 0.12);
              fx.burst(e.x, e.y, '#eaf8ff', 8, 130, 2.5, 0.35);
              this.hurt(e, s.damage * 2, t, true);
              this.sfx('hail', e.x);
            });
          }
        }
        fx.ring(t.x, t.y, 12, s.range, 0.55, s.color, s.singularity ? 4 : 3);
        if (s.singularity) fx.ring(t.x, t.y, s.range, 12, 0.5, '#6a3cff', 2);
        const n = 22;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + Math.random() * 0.2;
          const v = s.singularity ? -s.range * 1.6 : s.range * 1.6;
          const r0 = s.singularity ? s.range : 10;
          fx.add({ kind: 'glow', x: t.x + Math.cos(a) * r0, y: t.y + Math.sin(a) * r0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, size: 2.5, color: s.color, drag: 2.5 });
        }
        this.sfx(s.singularity ? 'gravity' : 'frost', t.x);
        break;
      }

      case 'missile': {
        const n = s.missiles;
        let targets = [target];
        if (n > 1) {
          targets = this.pickTargets(t, n);
          if (!targets.length) targets = [target];
        }
        for (let i = 0; i < n; i++) {
          const tg = targets[i % targets.length];
          const spread = n > 1 ? (i - (n - 1) / 2) * 0.45 : 0;
          const a = t.angle + spread + rand(-0.15, 0.15);
          this.projectiles.push({
            kind: 'missile', x: t.x + Math.cos(t.angle) * 6, y: t.y + Math.sin(t.angle) * 6,
            angle: a, speed: 130, maxSpeed: n >= 6 ? 470 : 420, accel: 650, turn: 5,
            target: tg, dmg: s.damage, splash: s.splash, cluster: s.cluster,
            burn: s.burn, burnRadius: s.burnRadius, shake: s.shake,
            color: s.color, life: 3.5, src: t, delay: i * 0.07, smokeT: 0,
            small: n >= 3,
          });
        }
        t.recoil = 1;
        this.sfx('launch', t.x);
        break;
      }
    }
  }

  // ── Projectiles ──────────────────────────────────────────
  updateProjectiles(dt) {
    const out = [];
    const fx = this.fx;
    for (const p of this.projectiles) {
      if (p.kind === 'bolt') {
        const tg = p.target;
        if (tg && !tg.dead && !tg.leaked) {
          const dx = tg.x - p.x, dy = tg.y - p.y, dist = Math.hypot(dx, dy) || 1;
          if (dist <= p.speed * dt + tg.radius) { this.boltHit(p, tg); continue; }
          p.vx = (dx / dist) * p.speed;
          p.vy = (dy / dist) * p.speed;
        } else {
          p.target = null;
          const hit = this.enemyAt(p.x, p.y, 4);
          if (hit) { this.boltHit(p, hit); continue; }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0 || p.x < -50 || p.y < -50 || p.x > WORLD_W + 50 || p.y > WORLD_H + 50) continue;
        out.push(p);
      } else if (p.kind === 'missile') {
        if (p.delay > 0) { p.delay -= dt; out.push(p); continue; }
        let tg = p.target;
        if (!tg || tg.dead || tg.leaked) tg = p.target = this.nearestEnemy(p.x, p.y, 420);
        if (tg) {
          const dx = tg.x - p.x, dy = tg.y - p.y;
          p.angle = turnTowards(p.angle, Math.atan2(dy, dx), p.turn * dt);
          if (Math.hypot(dx, dy) <= p.speed * dt + tg.radius + 2) { this.missileHit(p); continue; }
        }
        p.speed = Math.min(p.maxSpeed, p.speed + p.accel * dt);
        p.turn += dt * 9; // homing tightens over time → no endless orbiting
        p.x += Math.cos(p.angle) * p.speed * dt;
        p.y += Math.sin(p.angle) * p.speed * dt;
        p.life -= dt;
        p.smokeT -= dt;
        if (p.smokeT <= 0) {
          p.smokeT = 0.022;
          const bx = p.x - Math.cos(p.angle) * 7, by = p.y - Math.sin(p.angle) * 7;
          fx.add({ kind: 'smoke', x: bx, y: by, vx: rand(-8, 8), vy: rand(-8, 8), life: 0.55, size: p.small ? 2.5 : 3.5, color: '#8f8aae', drag: 2 });
          fx.add({ kind: 'glow', x: bx, y: by, vx: 0, vy: 0, life: 0.12, size: p.small ? 4 : 6, color: p.color });
        }
        if (p.life <= 0) { this.missileHit(p); continue; }
        out.push(p);
      } else if (p.kind === 'bomblet') {
        const k = Math.exp(-3.2 * dt);
        p.vx *= k; p.vy *= k;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.t -= dt;
        if (p.t <= 0) { this.explodeAt(p.x, p.y, p.dmg, p.splash, p.src, p.color, false, true); continue; }
        out.push(p);
      }
    }
    this.projectiles = out;
  }

  enemyAt(x, y, pad) {
    for (const e of this.enemies) {
      if (e.dead || e.leaked || !this.visible(e)) continue;
      const r = e.radius + pad;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) return e;
    }
    return null;
  }

  boltHit(p, e) {
    if (p.splash) {
      this.explodeAt(e.x, e.y, p.dmg, p.splash, p.src, p.color, false);
    } else {
      this.hurt(e, p.dmg, p.src, p.pierce);
      this.fx.burst(e.x, e.y, p.color, 4, 140, 1.6, 0.2, 'spark', 5);
      this.fx.add({ kind: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.08, size: 8 * p.size, color: p.color });
    }
  }

  missileHit(p) {
    this.explodeAt(p.x, p.y, p.dmg, p.splash, p.src, p.color, p.splash >= 100);
    if (p.shake) this.fx.shake(p.shake);
    if (p.cluster) {
      for (let i = 0; i < p.cluster; i++) {
        const a = (i / p.cluster) * TAU + rand(-0.3, 0.3), v = rand(170, 280);
        this.projectiles.push({ kind: 'bomblet', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: rand(0.22, 0.45), dmg: p.dmg * 0.35, splash: 36, src: p.src, color: p.color });
      }
    }
    if (p.burn) {
      const own = this.zones.filter((z) => z.src === p.src && z.dps === p.burn);
      if (own.length >= 3) this.zones.splice(this.zones.indexOf(own[0]), 1);
      this.zones.push({ x: p.x, y: p.y, r: p.burnRadius, dps: p.burn, t: 3, max: 3, tick: 0, color: p.color, src: p.src });
    }
  }

  explodeAt(x, y, dmg, radius, src, color, big = false, small = false) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= radius + e.radius * 0.5) {
        const f = 1 - 0.5 * Math.min(1, d / radius);
        this.hurt(e, dmg * f, src);
      }
    }
    const fx = this.fx;
    fx.ring(x, y, 4, radius, big ? 0.55 : 0.32, color, big ? 5 : 3);
    fx.burst(x, y, color, big ? 40 : small ? 8 : 16, radius * (big ? 4 : 3), big ? 5 : 3, big ? 0.7 : 0.4);
    fx.burst(x, y, '#ffffff', big ? 14 : 5, radius * 4, 1.6, 0.25, 'spark', 4);
    fx.add({ kind: 'glow', x, y, vx: 0, vy: 0, life: big ? 0.25 : 0.14, size: radius * (big ? 1.2 : 0.9), color });
    if (!small) fx.burst(x, y, color, big ? 14 : 5, radius * 1.4, 2.5, big ? 1.1 : 0.7, 'ember', 1.4);
    if (big) fx.burst(x, y, color, 6, radius * 3, 5, 0.6, 'shard', 2.5);
    if (!small) for (let i = 0; i < (big ? 6 : 3); i++) {
      fx.add({ kind: 'smoke', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-30, 30), vy: rand(-30, 30), life: rand(0.5, 0.9), size: radius * 0.18, color: '#5c5680', drag: 2 });
    }
    if (big) { fx.shake(5); fx.flash(this.hexToRgb(color), 0.12); }
    this.sfx(big ? 'bigboom' : small ? 'pop2' : 'boom', x);
  }

  hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  }

  updateZones(dt) {
    const fx = this.fx;
    let k = 0;
    for (const z of this.zones) {
      z.t -= dt;
      if (z.t <= 0) continue;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick += 0.25;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 > (z.r + e.radius * 0.5) ** 2) continue;
          if (z.dps) this.hurt(e, z.dps * 0.25, z.src, true, true);
          if (z.slow) this.applyStatus(e, { slow: z.slow, slowTime: 0.4 });
        }
      }
      if (Math.random() < 0.7) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * z.r;
        fx.add({ kind: 'glow', x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, vx: 0, vy: -rand(20, 50), life: rand(0.3, 0.6), size: rand(2, 4), color: z.color, drag: 0 });
      }
      this.zones[k++] = z;
    }
    this.zones.length = k;
  }
}
