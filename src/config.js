// ─────────────────────────────────────────────────────────────
//  VOID//WARDENS — game data (cyber-grid theme)
//  Everything tunable lives here: economy, enemies, waves, towers
//  and their branching upgrade trees.
// ─────────────────────────────────────────────────────────────

// ── World ────────────────────────────────────────────────────
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;
export const WORLD_W = COLS * TILE; // 1280
export const WORLD_H = ROWS * TILE; // 720

// ── Economy & rules ─────────────────────────────────────────
export const START_CREDITS = 260;
export const START_LIVES = 20;
export const BREAK_TIME = 15;            // seconds between waves (auto-launch)
export const SELL_RATIO = 0.7;           // refund share when selling
export const EARLY_BONUS_PER_SEC = 3;    // credits per second skipped when calling a wave early
export const waveClearBonus = (w) => 25 + w * 10;
// enemy HP multiplier for wave w; sectors can pass their own [linear, quadratic] curve
export const waveHpMult = (w, [a, b] = [0.24, 0.045]) => 1 + a * (w - 1) + b * (w - 1) ** 2;

// ── Player abilities ────────────────────────────────────────
// Cooldowns run on game time and start ready.
export const ABILITIES = {
  firewall: {
    name: 'Firewall', key: 'Z', cooldown: 40, color: '#00e5ff',
    desc: 'Drop a barrier on the data bus. Holds malware back for 5s and burns what presses against it.',
    duration: 5, bossHold: 1.5, dps: 14,
  },
  purge: {
    name: 'System Purge', key: 'X', cooldown: 75, color: '#ffb800',
    desc: 'Network-wide shock: 15% max HP to all malware, 1s stun, reveals Rootkits, strips shields.',
    pct: 0.15, bossPct: 0.04, stun: 1, reveal: 5,
  },
};
export const ABILITY_ORDER = ['firewall', 'purge'];

// ── Enemies ─────────────────────────────────────────────────
// armor: flat reduction per hit (min 20% of the hit always lands)
// leak:  Core integrity lost when it reaches the Core
export const ENEMIES = {
  scout: {
    name: 'Glitch', plural: 'Glitches', trait: 'fast',
    hp: 32, speed: 105, armor: 0, reward: 5, radius: 11, leak: 1,
    color: '#ff2bd6',
  },
  brute: {
    name: 'Trojan', plural: 'Trojans', trait: 'armor 3',
    hp: 170, speed: 48, armor: 3, reward: 14, radius: 17, leak: 2,
    color: '#ff3b4e',
  },
  boss: {
    name: 'Leviathan.exe', plural: 'Leviathan.exe', trait: 'boss · armor 6',
    hp: 5200, speed: 30, armor: 6, reward: 300, radius: 34, leak: 12,
    color: '#ff1f3d', boss: true, ccResist: 0.25,
  },
  // ── Sector 02 malware ──
  worm: {
    name: 'Worm', plural: 'Worms', trait: 'splits ×3',
    hp: 90, speed: 68, armor: 0, reward: 6, radius: 14, leak: 2,
    color: '#ff6a3d', split: { type: 'frag', count: 3 },
  },
  frag: {
    name: 'Fragment', plural: 'Fragments', trait: 'fast',
    hp: 24, speed: 125, armor: 0, reward: 2, radius: 8, leak: 1,
    color: '#ff6a3d',
  },
  cipher: {
    name: 'Cipher', plural: 'Ciphers', trait: 'shield blocks a hit',
    hp: 64, speed: 82, armor: 0, reward: 8, radius: 12, leak: 1,
    color: '#ffe14d', shield: 2.0, // seconds for the shield to re-encrypt after it pops
  },
  rootkit: {
    name: 'Rootkit', plural: 'Rootkits', trait: 'cloaked · ICE reveals',
    hp: 80, speed: 76, armor: 1, reward: 11, radius: 12, leak: 2,
    color: '#ff4fa3', stealth: true,
  },
  patcher: {
    name: 'Patcher', plural: 'Patchers', trait: 'heals nearby',
    hp: 120, speed: 52, armor: 1, reward: 16, radius: 14, leak: 2,
    color: '#ff8ad8', heal: { radius: 80, pct: 0.06, cap: 30, every: 2.0 },
  },
};

// Waves and routes live per-sector in src/maps.js.

// ── Towers ──────────────────────────────────────────────────
// Level 1 = base. Level 2 = pick 1 of 2 branches.
// Level 3 = pick 1 of 2 evolutions *of the chosen branch*.
// → every tower has 4 distinct final forms.
const DEFAULT_STATS = {
  kind: 'bolt', damage: 0, rate: 1, range: 100, projSpeed: 640,
  boltSize: 1, splash: 0, targets: 1, twin: false, gatling: false, scatter: false,
  chains: 0, chainRange: 0, chainFalloff: 0.85,
  stunChance: 0, stunTime: 0, pierceArmor: false,
  slow: 0, slowTime: 0, freezeChance: 0, freezeTime: 0, vuln: 0, pull: 0, singularity: false,
  missiles: 1, cluster: 0, burn: 0, burnRadius: 0, shake: 0,
  spinUp: 0,   // Gatling: extra fire rate at full spin (0.8 = +80%)
  echo: 0,     // Tempest: second strike 0.4s later at this damage share
  hail: 0,     // Hailstorm: ice shards dropped per pulse (2× pulse damage each)
};

export const TOWERS = {
  blaster: {
    name: 'Photon Blaster', cost: 50, color: '#3dff9e',
    desc: 'Fast light bolts. Cheap, reliable single-target damage.',
    base: { kind: 'bolt', damage: 9, rate: 2.2, range: 130, projSpeed: 640 },
    branches: [
      {
        name: 'Overcharge', cost: 75, color: '#ffcc33',
        desc: '+90% damage per bolt. Heavy hits punch through armor.',
        apply: (s) => { s.damage *= 1.9; s.boltSize = 1.5; s.color = '#ffcc33'; },
        next: [
          {
            name: 'Railgun', cost: 160, color: '#bff6ff',
            desc: 'Hypersonic beam that pierces every enemy in a line. Long range.',
            apply: (s) => { s.kind = 'rail'; s.damage = 75; s.rate = 0.7; s.range = 210; s.color = '#bff6ff'; },
          },
          {
            name: 'Fragment Rounds', cost: 150, color: '#ff8a1f',
            desc: 'Bolts fragment on impact, splashing nearby enemies.',
            apply: (s) => { s.damage *= 1.35; s.splash = 55; s.color = '#ff8a1f'; },
          },
        ],
      },
      {
        name: 'Twin Barrels', cost: 75, color: '#3dff9e',
        desc: '+80% fire rate with alternating dual cannons.',
        apply: (s) => { s.rate *= 1.8; s.twin = true; },
        next: [
          {
            name: 'Gatling Array', cost: 150, color: '#a6ffd6',
            desc: 'Spins up: fire rate climbs by up to +120% while it keeps shooting.',
            apply: (s) => { s.rate *= 1.35; s.spinUp = 1.2; s.gatling = true; s.color = '#a6ffd6'; },
          },
          {
            name: 'Scatter Array', cost: 160, color: '#00e5ff',
            desc: 'Locks onto 3 targets and fires at all of them at once.',
            apply: (s) => { s.targets = 3; s.damage *= 1.2; s.scatter = true; s.color = '#00e5ff'; },
          },
        ],
      },
    ],
  },

  cryo: {
    name: 'ICE Node', cost: 70, color: '#7fe9ff',
    desc: 'Intrusion countermeasure. Freezing pulses damage and slow everything nearby.',
    base: { kind: 'pulse', damage: 4, rate: 0.8, range: 95, slow: 0.35, slowTime: 1.6, pierceArmor: true },
    branches: [
      {
        name: 'Deep Freeze', cost: 80, color: '#8fd3ff',
        desc: 'Stronger chill: 55% slow and harder-hitting pulses.',
        apply: (s) => { s.slow = 0.55; s.damage = 7; s.color = '#a9dcff'; },
        next: [
          {
            name: 'Absolute Zero', cost: 150, color: '#eaf8ff',
            desc: 'Each pulse has a 25% chance to freeze enemies solid.',
            apply: (s) => { s.slow = 0.62; s.freezeChance = 0.25; s.freezeTime = 1.3; s.color = '#eaf8ff'; },
          },
          {
            name: 'Shatter', cost: 150, color: '#c3b5ff',
            desc: 'Chilled enemies take +40% damage from every source.',
            apply: (s) => { s.vuln = 0.4; s.damage *= 1.4; s.color = '#c3b5ff'; },
          },
        ],
      },
      {
        name: 'Wide Field', cost: 80, color: '#7fffe1',
        desc: '+40% pulse radius and stronger pulses.',
        apply: (s) => { s.range *= 1.4; s.damage = 8; s.color = '#9ff5ea'; },
        next: [
          {
            name: 'Rollback', cost: 170, color: '#b388ff',
            desc: 'Pulses roll enemies back along the data bus.',
            apply: (s) => { s.pull = 28; s.damage *= 1.3; s.singularity = true; s.color = '#b388ff'; },
          },
          {
            name: 'Hailstorm', cost: 150, color: '#7fffe1',
            desc: 'Faster pulses that also drop 3 ice shards on enemies for heavy damage.',
            apply: (s) => { s.rate *= 1.4; s.damage *= 1.5; s.hail = 3; s.color = '#7fffe1'; },
          },
        ],
      },
    ],
  },

  arc: {
    name: 'Arc Relay', cost: 90, color: '#c561ff',
    desc: 'Chain lightning that jumps between up to 3 enemies.',
    base: { kind: 'chain', damage: 15, rate: 0.9, range: 115, chains: 3, chainRange: 85, chainFalloff: 0.85 },
    branches: [
      {
        name: 'Conductor', cost: 95, color: '#c99bff',
        desc: 'Lightning jumps to 5 enemies, reaches farther and strikes faster.',
        apply: (s) => { s.chains = 5; s.chainRange = 105; s.rate *= 1.15; s.color = '#c99bff'; },
        next: [
          {
            name: 'Tempest', cost: 180, color: '#e0b3ff',
            desc: 'Arcs through up to 9 enemies, then strikes again 0.4s later at 50%.',
            apply: (s) => { s.chains = 9; s.damage *= 1.25; s.chainFalloff = 0.93; s.echo = 0.5; s.color = '#e0b3ff'; },
          },
          {
            name: 'Overload', cost: 170, color: '#fff27a',
            desc: 'Each strike has a 35% chance to stun its target.',
            apply: (s) => { s.stunChance = 0.35; s.stunTime = 0.7; s.damage *= 1.25; s.color = '#fff27a'; },
          },
        ],
      },
      {
        name: 'High Voltage', cost: 95, color: '#ff7bf2',
        desc: '+80% damage. Lightning ignores armor.',
        apply: (s) => { s.damage *= 1.8; s.pierceArmor = true; s.color = '#ff7bf2'; },
        next: [
          {
            name: 'EMP Burst', cost: 190, color: '#ff5ec8',
            desc: 'Discharges into EVERY enemy in range at once.',
            apply: (s) => { s.kind = 'nova'; s.range = 140; s.damage *= 1.1; s.rate = 0.75; s.color = '#ff5ec8'; },
          },
          {
            name: 'Static Field', cost: 170, color: '#7ab8ff',
            desc: 'Faster strikes that slow enemies by 40%.',
            apply: (s) => { s.rate *= 1.4; s.slow = 0.4; s.slowTime = 2; s.color = '#7ab8ff'; },
          },
        ],
      },
    ],
  },

  launcher: {
    name: 'Daemon Launcher', cost: 120, color: '#ff8a1f',
    desc: 'Homing daemon missiles with explosive splash. Slow but devastating.',
    base: { kind: 'missile', damage: 34, rate: 0.5, range: 175, splash: 50, missiles: 1 },
    branches: [
      {
        name: 'Warheads', cost: 120, color: '#ff6a3d',
        desc: '+70% damage and a bigger blast radius.',
        apply: (s) => { s.damage *= 1.7; s.splash = 68; s.color = '#ff6a3d'; },
        next: [
          {
            name: 'Zero-Day', cost: 220, color: '#ff5ef0',
            desc: 'Colossal exploit blasts with double damage and radius.',
            apply: (s) => { s.damage *= 2; s.splash = 105; s.shake = 6; s.color = '#ff5ef0'; },
          },
          {
            name: 'Cluster Bombs', cost: 200, color: '#ffd23d',
            desc: 'Impacts scatter 6 bomblets for a carpet of extra blasts.',
            apply: (s) => { s.cluster = 6; s.color = '#ffd23d'; },
          },
        ],
      },
      {
        name: 'Salvo Pods', cost: 120, color: '#ffa95e',
        desc: 'Fires 3 missiles per volley at different targets.',
        apply: (s) => { s.missiles = 3; s.damage *= 0.65; s.color = '#ffa95e'; },
        next: [
          {
            name: 'Botnet', cost: 210, color: '#ffb000',
            desc: '6-missile volleys and 50% faster reload.',
            apply: (s) => { s.missiles = 6; s.rate *= 1.5; s.damage *= 0.8; s.color = '#ffb000'; },
          },
          {
            name: 'Corruption', cost: 200, color: '#7dff6a',
            desc: 'Impacts leave corrupted sectors that burn through armor.',
            apply: (s) => { s.burn = 30; s.burnRadius = 42; s.damage *= 1.2; s.color = '#7dff6a'; },
          },
        ],
      },
    ],
  },
};

export const TOWER_ORDER = ['blaster', 'cryo', 'arc', 'launcher'];

// Resolve a tower's stats from its upgrade path, e.g. [] / [1] / [1, 0]
export function towerStats(type, path) {
  const def = TOWERS[type];
  const s = { ...DEFAULT_STATS, ...def.base, color: def.color };
  let list = def.branches;
  for (const idx of path) {
    const node = list[idx];
    node.apply(s);
    list = node.next || [];
  }
  return s;
}

// The two choices available for the next level (empty at max level)
export function upgradeOptions(type, path) {
  if (path.length >= 2) return [];
  let list = TOWERS[type].branches;
  for (const idx of path) list = list[idx].next;
  return list;
}

// Names of the upgrades taken so far
export function pathNames(type, path) {
  const out = [];
  let list = TOWERS[type].branches;
  for (const idx of path) {
    out.push(list[idx].name);
    list = list[idx].next || [];
  }
  return out;
}
