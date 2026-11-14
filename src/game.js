// Core simulation. No DOM access here — the renderer and UI read this state,
// and sounds are requested through the 'sfx' event.
import {
  TILE, WORLD_W, WORLD_H, ENEMIES, TOWERS,
  ABILITIES, DIFFICULTIES, difficultyOf, START_CREDITS, START_LIVES, BREAK_TIME, SELL_RATIO, EARLY_BONUS_PER_SEC,
  waveHpMult, waveClearBonus, towerStats, upgradeOptions,
} from './config.js';
import { FX } from './fx.js';

const TAU = Math.PI * 2;
export const TARGET_MODES = ['first', 'last', 'strong', 'close'];
const rand = (a, b) => a + Math.random() * (b - a);

export function turnTowards(a, b, max) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (d > max) d = max; else if (d < -max) d = -max;
  return a + d;
}

export class Game {
  constructor(map, difficulty = 'normal') {
    this.map = map;
    this.difficulty = difficulty;
    this.fx = new FX();
    this.handlers = {};
    this.reset();
  }

  get diff() { return difficultyOf(this.difficulty); }

  setDifficulty(key) {
    this.difficulty = DIFFICULTIES[key] ? key : 'normal';
    this.reset();
  }

  // Difficulty bonus ramps through the run: 30% of it on wave 1, the full value on the
  // last wave. Early waves stay fair (no economy yet); late waves get the real pressure.
  // (Easy's reductions apply in full from the start — the opening is where new players struggle.)
  diffFactor(key, w = this.wave) {
    if (this.diff[key] <= 1) return this.diff[key];
    const r = 0.3 + 0.7 * Math.max(0, w - 1) / Math.max(1, this.totalWaves - 1);
    return 1 + (this.diff[key] - 1) * Math.min(1, r);
  }

  // Enemies per group after difficulty scaling (a lone boss stays alone)
  scaledCount(type, count, w = this.wave) {
    return ENEMIES[type].boss ? count : Math.max(1, Math.round(count * this.diffFactor('count', w)));
  }

  rewardFor(e) { return Math.max(1, Math.round(e.def.reward * this.diff.reward)); }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, arg) { const h = this.handlers[ev]; if (h) for (const f of h) f(arg); }
  sfx(name) { this.emit('sfx', name); }

  setMap(map) {
    this.map = map;
    this.reset();
  }

  reset() {
    const def = this.map.def;
    this.waves = def.waves;
    this.credits = def.startCredits ?? START_CREDITS;
    this.maxLives = this.diff.lives ?? START_LIVES;
    this.lives = this.maxLives;
    this.wave = 0;
    this.totalWaves = this.waves.length;
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
    this.spawnQueue = [];
    this.grid = new Map();
    this.nextId = 1;
    this.kills = 0;
    this.leaks = 0;
    this.coreFlash = 0;
    this.boss = null;
    this.fx.clear();
  }

  get over() { return this.state === 'won' || this.state === 'lost'; }
  get hostilesLeft() { return this.spawnQueue.length + this.enemies.length; }

  // ── Waves ────────────────────────────────────────────────
  startWave() {
    if (this.state !== 'ready' && this.state !== 'break') return false;
    if (this.state === 'break') {
      const bonus = Math.max(0, Math.ceil(this.breakTimer)) * EARLY_BONUS_PER_SEC;
      if (bonus > 0) { this.credits += bonus; this.emit('early', bonus); }
    }
    this.wave++;
    this.state = 'wave';
    this.waveTime = 0;
    const mult = waveHpMult(this.wave, this.map.def.hpCurve);
    const q = [];
    const nPaths = this.map.paths.length;
    for (const [type, count, interval, delay, path = 0] of this.waves[this.wave - 1]) {
      // more enemies arrive in the same time window → denser waves on higher difficulties
      const n = this.scaledCount(type, count);
      const step = interval * (count / n);
      for (let i = 0; i < n; i++) {
        const p = path === 'alt' ? i % nPaths : Math.min(path, nPaths - 1);
        q.push({ t: delay + i * step, type, mult, path: p });
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
    if (this.wave >= this.waves.length) {
      this.state = 'won';
      this.emit('win');
      this.sfx('win');
      return;
    }
    this.state = 'break';
    this.breakTimer = BREAK_TIME;
    this.emit('cleared', { wave: this.wave, bonus });
    this.sfx('clear');
  }

  // ── Main tick ────────────────────────────────────────────
  update(dt) {
    if (this.over) { this.fx.update(dt); return; }
    this.time += dt;

    if (this.state === 'wave') {
      this.waveTime += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.waveTime) {
        const s = this.spawnQueue.shift();
        this.spawn(s.type, s.mult, s.path);
      }
    } else if (this.state === 'break') {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) this.startWave();
    }

    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
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
    const maxHp = def.hp * (def.boss ? 1 : mult) * this.diffFactor('hp');
    const e = {
      id: this.nextId++, type, def, maxHp, hp: maxHp, mult,
      path, d, lane: def.boss ? 0 : rand(-7, 7),
      radius: def.radius, armor: def.armor, speed: def.speed * rand(0.94, 1.06),
      slowAmt: 0, slowT: 0, freezeT: 0, stunT: 0, vulnAmt: 0, vulnT: 0, pullCd: 0,
      flash: 0, dead: false, leaked: false, age: d > 0 ? 0.25 : 0, seed: Math.random() * 100, trailT: 0,
      shieldUp: !!def.shield, shieldT: 0, revealT: 0, healT: def.heal ? def.heal.every * rand(0.3, 1) : 0,
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
    for (const e of this.enemies) {
      if (e.dead || e.leaked) continue;
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt);
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowAmt = 0; }
      if (e.vulnT > 0) { e.vulnT -= dt; if (e.vulnT <= 0) e.vulnAmt = 0; }
      if (e.pullCd > 0) e.pullCd -= dt;
      let mult = 1 - e.slowAmt;
      if (e.freezeT > 0) { e.freezeT -= dt; mult = 0; }
      if (e.stunT > 0) { e.stunT -= dt; mult = 0; }
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
          if (healed) this.sfx('heal');
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

  leak(e) {
    e.leaked = true;
    this.lives = Math.max(0, this.lives - e.def.leak);
    this.leaks++;
    this.coreFlash = 1;
    const C = this.map.core;
    this.fx.shake(e.def.boss ? 20 : 7);
    this.fx.flash('255,40,80', e.def.boss ? 0.5 : 0.22);
    this.fx.ring(C.x, C.y, 10, 80, 0.5, '#ff2a6d', 4);
    this.fx.burst(C.x, C.y, '#ff2a6d', 24, 220, 4, 0.6);
    this.sfx('hurt');
    this.emit('leak', e);
    if (e === this.boss) this.boss = null;
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
    this.sfx('bigboom');
  }

  // Can towers see (and aim at) this enemy? Cloaked Rootkits only once revealed.
  visible(e) { return !e.def.stealth || e.revealT > 0; }

  // bypassShield: damage-over-time (burn zones) ignores Cipher shields
  hurt(e, amount, src, pierce = false, bypassShield = false) {
    if (e.dead || e.leaked) return 0;
    if (e.def.stealth) e.revealT = Math.max(e.revealT, 0.6); // any hit briefly exposes a Rootkit
    if (e.shieldUp && !bypassShield) {
      e.shieldUp = false;
      e.shieldT = e.def.shield;
      e.flash = 0.07;
      this.fx.ring(e.x, e.y, e.radius + 4, e.radius + 16, 0.25, '#ffffff', 2);
      this.fx.burst(e.x, e.y, e.def.color, 8, 140, 2, 0.3, 'spark', 4);
      this.sfx('shield');
      return 0;
    }
    let dmg = amount * (1 + e.vulnAmt);
    if (!pierce && e.armor > 0) dmg = Math.max(dmg - e.armor, dmg * 0.2);
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
    const reward = this.rewardFor(e);
    this.credits += reward;
    const fx = this.fx, col = e.def.color;
    fx.text(e.x, e.y - e.radius - 4, '+' + reward, '#ffb800', e.def.boss ? 22 : 12);
    if (e.def.split) {
      const { type, count } = e.def.split;
      for (let i = 0; i < count; i++) this.spawnLater.push({ type, mult: e.mult, path: e.path, d: Math.max(1, e.d - i * 12) });
    }
    if (!e.def.boss && e.radius < 14) {
      fx.burst(e.x, e.y, col, 14, 170, 3, 0.45);
      fx.burst(e.x, e.y, '#ffffff', 6, 220, 1.5, 0.25, 'spark', 4);
      fx.burst(e.x, e.y, col, 3, 120, 3.5, 0.5, 'shard', 3);
      fx.ring(e.x, e.y, 3, 26, 0.3, col, 2);
      fx.add({ kind: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.1, size: 18, color: col });
      this.sfx('pop');
    } else if (!e.def.boss) {
      fx.burst(e.x, e.y, col, 26, 210, 4, 0.6);
      fx.burst(e.x, e.y, col, 10, 160, 4, 0.9, 'debris', 2.5);
      fx.burst(e.x, e.y, '#ffffff', 10, 260, 1.8, 0.3, 'spark', 4);
      fx.burst(e.x, e.y, col, 7, 190, 5, 0.75, 'shard', 2.5);
      fx.burst(e.x, e.y, col, 8, 70, 2.5, 1.1, 'ember', 1.2);
      fx.ring(e.x, e.y, 6, 46, 0.4, col, 3);
      fx.add({ kind: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.18, size: 44, color: col });
      fx.shake(2.5);
      this.sfx('boom');
    } else {
      // Boss: chained detonations, then a supernova
      const x = e.x, y = e.y;
      for (let i = 0; i < 9; i++) {
        fx.after(i * 0.12, () => {
          const ox = x + rand(-40, 40), oy = y + rand(-40, 40);
          fx.burst(ox, oy, i % 2 ? '#ff1f3d' : '#ff2bd6', 22, 240, 4, 0.6);
          fx.ring(ox, oy, 4, 50, 0.35, '#00e5ff', 3);
          fx.shake(6);
          this.sfx('boom');
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
        this.sfx('bigboom');
      });
      if (e === this.boss) this.boss = null;
      this.emit('bossDown');
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
    this.firewalls.push({ ...spot, t: def.duration, max: def.duration, bossT: def.bossHold, dps: def.dps });
    this.cooldowns.firewall = def.cooldown;
    this.fx.ring(spot.x, spot.y, 4, 40, 0.4, def.color, 3);
    this.fx.burst(spot.x, spot.y, def.color, 24, 200, 3, 0.5);
    this.fx.shake(2);
    this.sfx('firewall');
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
    if (smashed) { this.fx.shake(6); this.sfx('firewallDown'); }
  }

  usePurge() {
    if (!this.abilityReady('purge') || !this.enemies.length) return false;
    const def = ABILITIES.purge, C = this.map.core, fx = this.fx;
    let i = 0;
    for (const e of this.enemies) {
      if (e.dead || e.leaked) continue;
      if (e.def.shield) { e.shieldUp = false; e.shieldT = e.def.shield; }
      if (e.def.stealth) e.revealT = Math.max(e.revealT, def.reveal);
      e.stunT = Math.max(e.stunT, def.stun * (e.def.ccResist ?? 1));
      if (i++ < 18) fx.lightning([{ x: C.x, y: C.y }, { x: e.x, y: e.y }], def.color, 1.6, 0.35);
      fx.burst(e.x, e.y, def.color, 6, 120, 2, 0.35, 'spark', 4);
      this.hurt(e, e.maxHp * (e.def.boss ? def.bossPct : def.pct), null, true, true);
    }
    this.cooldowns.purge = def.cooldown;
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
      path: [], level: 1, stats: towerStats(type, []),
      cooldown: 0.25, angle: -Math.PI / 2, target: null, recoil: 0, barrel: 0, spin: 0,
      spawnT: 0, invested: def.cost, dealt: 0, kills: 0, upgradeFlash: 0,
      targeting: 'first', heat: 0,
    };
    this.towers.push(t);
    this.grid.set(c + ',' + r, t);
    this.fx.ring(t.x, t.y, 4, 34, 0.45, def.color, 3);
    this.fx.burst(t.x, t.y, def.color, 18, 140, 3, 0.5);
    this.sfx('place');
    return t;
  }

  upgrade(t, idx) {
    const node = upgradeOptions(t.type, t.path)[idx];
    if (!node || this.credits < node.cost) return false;
    this.credits -= node.cost;
    t.invested += node.cost;
    t.path.push(idx);
    t.level = 1 + t.path.length;
    t.stats = towerStats(t.type, t.path);
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
    this.sfx('upgrade');
    return true;
  }

  sell(t) {
    const refund = Math.floor(t.invested * SELL_RATIO);
    this.credits += refund;
    this.towers = this.towers.filter((o) => o !== t);
    this.grid.delete(t.c + ',' + t.r);
    this.fx.burst(t.x, t.y, '#ffb800', 20, 160, 3, 0.5);
    this.fx.ring(t.x, t.y, 30, 4, 0.35, '#ffb800', 2);
    this.fx.text(t.x, t.y - 20, '+' + refund, '#ffb800', 14);
    this.sfx('sell');
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

  updateTowers(dt) {
    for (const t of this.towers) {
      const s = t.stats;
      t.spawnT = Math.min(1, t.spawnT + dt * 3);
      t.recoil = Math.max(0, t.recoil - dt * 6);
      t.upgradeFlash = Math.max(0, t.upgradeFlash - dt * 1.5);
      // Gatling heat: spins up over ~2.5s of continuous fire, cools in ~1.2s
      if (s.spinUp) t.heat = t.target ? Math.min(1, t.heat + dt / 2.5) : Math.max(0, t.heat - dt / 1.2);
      if (s.gatling) t.spin += dt * (t.target ? 18 + 22 * t.heat : 3);
      t.cooldown -= dt;

      // area towers (ICE pulse, EMP) trigger on anything in range, cloaked or not
      const target = s.kind === 'pulse' || s.kind === 'nova'
        ? this.allInRange(t.x, t.y, s.range)[0] || null
        : this.findTarget(t.x, t.y, s.range, t.targeting);
      t.target = target;
      if (target && (s.kind === 'bolt' || s.kind === 'rail' || s.kind === 'missile')) {
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
    this.sfx('zap');
  }

  // Lightning / pulse status effects
  applyStatus(e, s) {
    if (e.dead) return;
    const resist = e.def.ccResist ?? 1;
    if (s.slow) {
      e.slowAmt = Math.max(e.slowAmt, s.slow * (e.def.boss ? 0.6 : 1));
      e.slowT = Math.max(e.slowT, s.slowTime);
    }
    if (s.stunChance && Math.random() < s.stunChance) {
      e.stunT = Math.max(e.stunT, s.stunTime * resist);
      this.fx.burst(e.x, e.y, '#fff27a', 6, 90, 2, 0.3, 'spark', 4);
    }
    if (s.freezeChance && e.freezeT <= 0 && Math.random() < s.freezeChance) {
      e.freezeT = s.freezeTime * resist;
      this.fx.burst(e.x, e.y, '#eaf8ff', 10, 110, 2.5, 0.4);
    }
    if (s.vuln) {
      e.vulnAmt = Math.max(e.vulnAmt, s.vuln);
      e.vulnT = Math.max(e.vulnT, s.slowTime + 0.4);
    }
    if (s.pull && e.pullCd <= 0) {
      e.d = Math.max(0, e.d - s.pull * (e.def.boss ? 0.3 : 1));
      e.pullCd = 1.1;
    }
  }

  fire(t, target) {
    const s = t.stats, fx = this.fx;
    switch (s.kind) {
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
        this.sfx(s.splash ? 'thump' : 'shoot');
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
        this.sfx('rail');
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
        this.sfx('emp');
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
              this.sfx('hail');
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
        this.sfx(s.singularity ? 'gravity' : 'frost');
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
        this.sfx('launch');
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
    this.sfx(big ? 'bigboom' : small ? 'pop2' : 'boom');
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
          if ((e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= (z.r + e.radius * 0.5) ** 2) this.hurt(e, z.dps * 0.25, z.src, true, true);
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
