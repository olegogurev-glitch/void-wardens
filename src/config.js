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

// ── Difficulty ──────────────────────────────────────────────
// count:  enemies per group (spawn interval shrinks to match → denser, not longer, waves)
// count/hp bonuses above 1 ramp from `ramp0` of the bonus on wave 1 to 100% on the last wave (Game.diffFactor)
// hp:     enemy HP multiplier (bosses included)
// reward: credits per kill (so extra enemies don't fund their own defense)
// lives:  Core integrity
export const DIFFICULTIES = {
  easy: { name: 'Easy', color: '#3dff9e', count: 0.85, hp: 0.95, reward: 1.1, lives: 22, ramp0: 0.3, desc: 'Lighter waves, more credits. Learn the towers.' },
  normal: { name: 'Normal', color: '#00e5ff', count: 1.15, hp: 1.15, reward: 0.95, lives: 20, ramp0: 0.3, desc: 'The intended challenge: waves grow to +15% enemies with +15% HP.' },
  hard: { name: 'Hard', color: '#ffb800', count: 1.45, hp: 1.4, reward: 0.85, lives: 18, ramp0: 0.3, desc: 'Up to +45% enemies at +40% HP, 18 Core integrity. Every tower must earn its slot.' },
  nightmare: { name: 'Nightmare', color: '#ff2a6d', count: 1.8, hp: 1.75, reward: 0.75, lives: 12, ramp0: 0.35, desc: 'Waves swell to +80% enemies at +75% HP, 12 Core integrity. Abilities and cards required.' },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'nightmare'];
export const difficultyOf = (key) => DIFFICULTIES[key] || DIFFICULTIES.normal;

// ── Crowd control limits ────────────────────────────────────
// Stacked slows, freezes and rollbacks used to lock malware in place for good.
// grace:    seconds a malware can't be frozen or stunned by towers after one wears off
// slowCap:  strongest total slow (cards included)
// pulls:    how many times one malware can be rolled back (bosses never)
export const CC = { grace: 1.0, slowCap: 0.7, pulls: 3 };

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
    // every few seconds it throws off all chill and stuns, surges forward and drops Glitches
    overclock: { every: 8, time: 2, speed: 1.8, drop: 3 },
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
  // ── Campaign malware (each debuts in its own sector) ──
  furnace: {
    name: 'Furnace', plural: 'Furnaces', trait: 'immune to chill · thaws allies',
    hp: 150, speed: 56, armor: 2, reward: 13, radius: 15, leak: 2,
    color: '#ff7a1a', thermal: { radius: 80, every: 1.6 }, // can't be slowed or frozen; pulses clear chill nearby
  },
  jammer: {
    name: 'Jammer', plural: 'Jammers', trait: 'towers nearby fire 40% slower',
    hp: 110, speed: 62, armor: 1, reward: 12, radius: 13, leak: 2,
    color: '#c86bff', jam: { radius: 85, factor: 0.6 },
  },
  bulwark: {
    name: 'Bulwark', plural: 'Bulwarks', trait: 'allies nearby take 40% less damage',
    hp: 210, speed: 46, armor: 3, reward: 16, radius: 16, leak: 2,
    color: '#ffb0c8', aegis: { radius: 85, cut: 0.4 },
  },
  carrier: {
    name: 'Carrier', plural: 'Carriers', trait: 'drops Glitches',
    hp: 260, speed: 40, armor: 2, reward: 18, radius: 18, leak: 3,
    color: '#ff4f8a', carry: { type: 'scout', every: 2.6, count: 2, max: 6, hp: 0.7 },
  },
  blinker: {
    name: 'Blinker', plural: 'Blinkers', trait: 'teleports ahead',
    hp: 72, speed: 78, armor: 0, reward: 9, radius: 11, leak: 1,
    color: '#d6ff3d', blink: { every: 2.8, dist: 78 },
  },
  watchdog: {
    name: 'Watchdog', plural: 'Watchdogs', trait: "can't be frozen, stunned or rolled back",
    hp: 190, speed: 58, armor: 2, reward: 15, radius: 15, leak: 2,
    color: '#e6e9ff', anchored: true, // tower slows work at half strength
  },
};

// ── Sector rules ────────────────────────────────────────────
// One per campaign sector (set `rule` in src/maps.js). The sim applies them, so bots feel them too.
export const RULES = {
  permafrost: { name: 'Permafrost', desc: 'Slows and freezes last twice as long.', color: '#a8e6ff', chill: 2 },
  rush: { name: 'Market Rush', desc: 'Kills pay +25% credits, but breaks between waves are 10s.', color: '#ff4fd8', reward: 1.25, breakTime: 10 },
  dark: { name: 'Low Visibility', desc: 'Tower range −12%. A hit Rootkit stays exposed 2.5× longer.', color: '#3d6dff', range: 0.88, reveal: 2.5 },
  hardened: { name: 'Hardened', desc: 'All malware has +1 armor. Armor-piercing hits deal +30%.', color: '#ffa53d', armor: 1, pierceBonus: 1.3 },
  readonly: { name: 'Read-Only', desc: 'Selling refunds 100% — rebuild the maze freely.', color: '#3dff9e', sell: 1 },
  lightning: { name: 'Lightning', desc: 'Strikes hit and stun malware where the bolt lands.', color: '#9f9bff', strike: { every: [7, 12], radius: 64, dmg: 70, stun: 1.2 } },
  uplink: { name: 'Uplink', desc: 'Firewall and System Purge recharge 40% faster.', color: '#d8eeff', abilityCd: 0.6 },
  panic: { name: 'Kernel Panic', desc: 'Every leak makes all malware on the board 25% faster for 4s.', color: '#ff2a55', panic: { speed: 1.25, time: 4 } },
};

// ── Endless and Daily ──────────────────────────────────────
// Endless: the sector's waves, then generated ones forever (src/modes.js). Each generated wave
// reuses one of the sector's last `templates` waves with `countGrowth` more malware per wave
// beyond the campaign, and a Leviathan every `bossEvery` waves (bosses scale with the HP curve).
// Malware adapts past the campaign: `speedGrowth` faster and `ccGrowth` more resistant to slows,
// freezes, stuns and rollback per wave (up to the caps), and a growing pack of Watchdogs joins in.
export const ENDLESS = {
  templates: 4, countGrowth: 0.07, bossEvery: 5,
  speedGrowth: 0.02, speedCap: 0.5, ccGrowth: 0.03, ccCap: 0.6,
  watchdogs: { base: 2, per: 0.5 },
};
// Score (Endless and Daily): kills pay their base bounty ×`kill`, each cleared wave `wave`×its number,
// early calls `early` per second skipped; a Daily win adds `win` plus `core` per Core integrity left.
export const SCORE = { kill: 10, wave: 100, early: 10, win: 1000, core: 150 };
// The Daily is played on one fixed difficulty, with every tower open and no research.
export const DAILY_DIFFICULTY = 'normal';
// Daily twists — one per day, on top of the sector's own rule. Fields are read by Game:
// speed/hp/count/armor (malware), reward (kill credits), credits (start), lives (Core ×),
// dmg/range (all towers ×), cardEvery (data cache cadence), breakTime (s), early (early-call bonus ×)
export const MUTATORS = {
  overclock: { name: 'Overclocked Malware', desc: 'Malware moves 20% faster, but kills pay +20% credits.', color: '#ff2a6d', speed: 1.2, reward: 1.2 },
  swarm: { name: 'Swarm Protocol', desc: '40% more malware, each with 25% less HP.', color: '#b967ff', count: 1.4, hp: 0.75 },
  glass: { name: 'Glass Core', desc: 'Core integrity is halved; towers deal +15% damage.', color: '#ff4f4f', lives: 0.5, dmg: 1.15 },
  venture: { name: 'Venture Capital', desc: '+250 starting credits, but kills pay 25% less.', color: '#ffb800', credits: 250, reward: 0.75 },
  surge: { name: 'Data Surge', desc: 'A data cache opens after every 2nd wave.', color: '#00e5ff', cardEvery: 2 },
  plated: { name: 'Plated Payloads', desc: 'Malware has +1 armor; towers have +10% range.', color: '#ffa53d', armor: 1, range: 1.1 },
  fuse: { name: 'Short Fuse', desc: 'Breaks last 8s, and calling waves early pays double.', color: '#3dff9e', breakTime: 8, early: 2 },
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
  // Spike Lance
  vulnMark: 0, execute: 0, bounces: 0, bounceFalloff: 0.6, strip: false,
  // Overclock Hub (buffs for towers in range; best hub wins per stat, no stacking)
  buffRate: 0, buffDmg: 0, buffRange: 0, buffPierce: false, revealField: false, mine: 0, field: 0,
  // Logic Mines
  mineDmg: 0, mineRadius: 0, maxMines: 0, mineStun: 0, mineSlow: 0, chain: false, mineBurn: 0,
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
            desc: 'Each pulse has an 18% chance to freeze enemies solid.',
            apply: (s) => { s.slow = 0.62; s.freezeChance = 0.18; s.freezeTime = 1.2; s.color = '#eaf8ff'; },
          },
          {
            name: 'Shatter', cost: 150, color: '#c3b5ff',
            desc: 'Chilled enemies take +40% damage from every source.',
            apply: (s) => { s.vuln = 0.28; s.damage *= 1.2; s.color = '#c3b5ff'; },
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
            desc: 'Pulses roll enemies back along the data bus, up to 3 times each. Bosses resist.',
            apply: (s) => { s.pull = 34; s.damage *= 1.3; s.singularity = true; s.color = '#b388ff'; },
          },
          {
            name: 'Hailstorm', cost: 150, color: '#7fffe1',
            desc: 'Faster pulses that also drop 3 ice shards on enemies for heavy damage.',
            apply: (s) => { s.rate *= 1.25; s.damage *= 1.25; s.hail = 2; s.color = '#7fffe1'; },
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
            apply: (s) => { s.kind = 'nova'; s.range = 140; s.damage *= 0.9; s.rate = 0.65; s.color = '#ff5ec8'; },
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
            desc: 'Colossal exploit blasts: +75% damage and a much bigger radius.',
            apply: (s) => { s.damage *= 1.75; s.splash = 95; s.shake = 6; s.color = '#ff5ef0'; },
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
            desc: '5-missile volleys and 30% faster reload.',
            apply: (s) => { s.missiles = 5; s.rate *= 1.3; s.damage *= 0.75; s.color = '#ffb000'; },
          },
          {
            name: 'Corruption', cost: 200, color: '#7dff6a',
            desc: 'Impacts leave corrupted sectors that burn through armor.',
            apply: (s) => { s.burn = 15; s.burnRadius = 36; s.color = '#7dff6a'; },
          },
        ],
      },
    ],
  },

  // ── Campaign unlocks ──────────────────────────────────────
  lance: {
    name: 'Spike Lance', cost: 120, color: '#ffd84a', unlock: 'sector-03',
    desc: 'Long-range sniper. A single armor-piercing spike lands instantly on one target.',
    base: { kind: 'lance', damage: 48, rate: 0.42, range: 240, pierceArmor: true },
    branches: [
      {
        name: 'Long Barrel', cost: 110, color: '#ffe98a',
        desc: '+40% damage and +30% range.',
        apply: (s) => { s.damage *= 1.4; s.range *= 1.3; s.color = '#ffe98a'; },
        next: [
          {
            name: 'Orbital Lance', cost: 220, color: '#fff6c8',
            desc: 'Strikes from orbit: huge range, +60% damage, and marks the target to take +30% damage for 3s.',
            apply: (s) => { s.damage *= 1.6; s.range *= 1.35; s.vulnMark = 0.3; s.color = '#fff6c8'; },
          },
          {
            name: 'Executioner', cost: 200, color: '#ffb02e',
            desc: 'Deletes non-boss malware under 25% HP outright. Bosses take +50%.',
            apply: (s) => { s.execute = 0.25; s.color = '#ffb02e'; },
          },
        ],
      },
      {
        name: 'Rapid Chamber', cost: 100, color: '#ffd84a',
        desc: '+80% fire rate, −20% damage.',
        apply: (s) => { s.rate *= 1.8; s.damage *= 0.8; },
        next: [
          {
            name: 'Ricochet', cost: 190, color: '#ffe36e',
            desc: 'Each spike ricochets to 2 more targets at 60% damage.',
            apply: (s) => { s.bounces = 2; s.color = '#ffe36e'; },
          },
          {
            name: 'Disruptor', cost: 180, color: '#fff27a',
            desc: 'Spikes stun for 0.6s, pop Cipher shields and expose Rootkits.',
            apply: (s) => { s.stunChance = 1; s.stunTime = 0.6; s.strip = true; s.color = '#fff27a'; },
          },
        ],
      },
    ],
  },

  hub: {
    name: 'Overclock Hub', cost: 90, color: '#eef3ff', unlock: 'sector-06',
    desc: 'Support node. No weapon — towers in its field fire 20% faster.',
    base: { kind: 'aura', damage: 0, rate: 0, range: 105, buffRate: 0.2 },
    branches: [
      {
        name: 'Amplifier', cost: 110, color: '#ffffff',
        desc: 'Towers in the field also deal +25% damage.',
        apply: (s) => { s.buffDmg = 0.25; s.color = '#ffffff'; },
        next: [
          {
            name: 'Overdrive', cost: 200, color: '#fff2c4',
            desc: 'Field boost rises to +40% fire rate, +35% damage and +15% range.',
            apply: (s) => { s.buffRate = 0.4; s.buffDmg = 0.35; s.buffRange = 0.15; s.color = '#fff2c4'; },
          },
          {
            name: 'Targeting Array', cost: 190, color: '#c8f0ff',
            desc: 'Towers in the field ignore armor, and cloaked malware inside it is exposed.',
            apply: (s) => { s.buffPierce = true; s.revealField = true; s.color = '#c8f0ff'; },
          },
        ],
      },
      {
        name: 'Wide Mesh', cost: 90, color: '#e0e8ff',
        desc: '+50% field radius.',
        apply: (s) => { s.range *= 1.5; s.color = '#e0e8ff'; },
        next: [
          {
            name: 'Credit Miner', cost: 180, color: '#ffe066',
            desc: 'Mines 5 credits every 4s while a wave is running.',
            apply: (s) => { s.mine = 5; s.color = '#ffe066'; },
          },
          {
            name: 'Static Field', cost: 200, color: '#d6c8ff',
            desc: 'Malware inside the field moves 25% slower and takes +15% damage.',
            apply: (s) => { s.field = 1; s.slow = 0.25; s.vuln = 0.15; s.color = '#d6c8ff'; },
          },
        ],
      },
    ],
  },

  mines: {
    name: 'Logic Mines', cost: 90, color: '#5c8dff', unlock: 'sector-08',
    desc: 'Seeds proximity mines on the data bus within range. They wait — even between waves.',
    base: { kind: 'mines', damage: 40, rate: 0.52, range: 118, mineDmg: 40, mineRadius: 44, maxMines: 4 },
    branches: [
      {
        name: 'Cluster Charges', cost: 100, color: '#7aa6ff',
        desc: '+50% mine damage, +30% blast radius.',
        apply: (s) => { s.mineDmg *= 1.5; s.damage = s.mineDmg; s.mineRadius *= 1.3; s.color = '#7aa6ff'; },
        next: [
          {
            name: 'Seed Nukes', cost: 210, color: '#ff5c8d',
            desc: 'Few, enormous mines: ×2.3 damage, much bigger blasts, 2 at a time.',
            apply: (s) => { s.mineDmg *= 2.3; s.damage = s.mineDmg; s.mineRadius *= 1.7; s.maxMines = 2; s.rate *= 0.5; s.color = '#ff5c8d'; },
          },
          {
            name: 'Chain Reaction', cost: 190, color: '#a0b8ff',
            desc: 'A blast sets off other mines nearby and leaves a burning sector.',
            apply: (s) => { s.chain = true; s.mineBurn = 12; s.color = '#a0b8ff'; },
          },
        ],
      },
      {
        name: 'Rapid Deploy', cost: 90, color: '#5c8dff',
        desc: '+70% laying speed, up to 5 mines.',
        apply: (s) => { s.rate *= 1.7; s.maxMines = 5; },
        next: [
          {
            name: 'EMP Mines', cost: 180, color: '#9ff0ff',
            desc: 'Blasts stun for 1.2s and pop Cipher shields.',
            apply: (s) => { s.mineStun = 1.2; s.strip = true; s.color = '#9ff0ff'; },
          },
          {
            name: 'Tar Pits', cost: 170, color: '#8d7bff',
            desc: 'Blasts leave a pit that slows malware 50% for 3s.',
            apply: (s) => { s.mineSlow = 0.5; s.color = '#8d7bff'; },
          },
        ],
      },
    ],
  },
};

export const TOWER_ORDER = ['blaster', 'cryo', 'arc', 'launcher', 'lance', 'hub', 'mines'];

// ── Upgrade cards (data caches) ─────────────────────────────
// After every 3rd wave the player picks 1 of 3. `apply(m)` edits the run's modifiers (see Game.reset),
// `now(game)` fires once on pick. `tower` cards are only dealt if that tower is on the board.
// `unique` cards are never dealt twice. Rarity drives the deal odds and the card frame.
export const CARD_ODDS = { common: 60, rare: 30, epic: 10 };
export const CARD_EVERY = 3;
// ── Research (permanent, between runs) ──────────────────────
// Data is earned at the end of every run (see dataEarned) and spent in the lab. Nodes in a branch
// unlock in order. `perk` keys are read by Game.applyPerks; the sim runs without research.
export const RESEARCH = [
  { branch: 'Economy', color: '#ffb800', nodes: [
    { id: 'seed', name: 'Seed Funds', cost: 30, desc: '+25 starting credits in every sector.', perk: { credits: 25 } },
    { id: 'salvage', name: 'Salvage Protocols', cost: 60, desc: 'Selling refunds 80% instead of 70%.', perk: { sell: 0.8 } },
    { id: 'bounty', name: 'Bounty Index', cost: 110, desc: 'Kills pay +8% credits.', perk: { reward: 1.08 } },
    { id: 'venture', name: 'Venture Cache', cost: 170, desc: 'Every data cache deals 4 cards instead of 3.', perk: { cardCount: 4 } },
  ] },
  { branch: 'Arsenal', color: '#3dff9e', nodes: [
    { id: 'optics', name: 'Calibrated Optics', cost: 40, desc: 'All towers +6% range.', perk: { range: 1.06 } },
    { id: 'rounds', name: 'Hardened Rounds', cost: 80, desc: 'All towers +6% damage.', perk: { dmg: 1.06 } },
    { id: 'tooling', name: 'Rapid Tooling', cost: 130, desc: 'Level-2 upgrades cost 12% less.', perk: { l2Cost: 0.88 } },
    { id: 'reroll', name: 'Cache Decryptor', cost: 180, desc: 'Reroll one data cache per run.', perk: { reroll: 1 } },
  ] },
  { branch: 'Core', color: '#00e5ff', nodes: [
    { id: 'plating', name: 'Core Plating', cost: 40, desc: '+2 Core integrity.', perk: { lives: 2 } },
    { id: 'firewall2', name: 'Firewall Mk II', cost: 80, desc: 'Firewall recharges 15% faster and holds 1s longer.', perk: { firewallCd: 0.85, firewallPlus: 1 } },
    { id: 'capacitor', name: 'Purge Capacitor', cost: 130, desc: 'System Purge recharges 15% faster.', perk: { purgeCd: 0.85 } },
    { id: 'failsafe', name: 'Failsafe', cost: 200, desc: 'Once per run, a fatal breach leaves the Core at 1 and stuns all malware for 2s.', perk: { failsafe: 1 } },
  ] },
];
// ── Medals (3 per sector, set as `medals` in src/maps.js) ────
// Earned by winning on Normal or harder while meeting the condition; each new one pays MEDAL_DATA.
export const MEDAL_DATA = 15;
export const MEDALS = {
  flawless: { name: 'Flawless', desc: () => 'Win without losing any Core integrity', check: (r) => r.leaks === 0 },
  lean: { name: 'Lean Build', desc: (n) => `Win with at most ${n} towers on the board at once`, check: (r, n) => r.maxTowers <= n },
  duo: { name: 'Specialist', desc: (n) => `Win using only ${n} tower types`, check: (r, n) => r.types <= n },
  restraint: { name: 'Restraint', desc: () => 'Win without evolving any tower to level 3', check: (r) => r.maxLevel < 3 },
  unassisted: { name: 'Unassisted', desc: () => 'Win without using Firewall or System Purge', check: (r) => r.abilities === 0 },
  overclocked: { name: 'Overclocked', desc: () => 'Win calling every wave early', check: (r) => r.autoStarts === 0 },
};

// ── Achievements ─────────────────────────────────────────────
// check(c) gets { stats, run, result, cleared, medals, research, sectors } (see main.js); `goal`/`progress`
// turn a counter into a progress bar on the achievements screen.
export const ACHIEVEMENTS = [
  { id: 'first', name: 'First Contact', desc: 'Win your first sector.', icon: 'core', check: (c) => c.stats.wins >= 1 },
  { id: 'leviathan', name: 'Leviathan Slayer', desc: 'Destroy Leviathan.exe.', icon: 'skull', check: (c) => c.stats.bosses >= 1 },
  { id: 'evolved', name: 'Fully Evolved', desc: 'Evolve a tower to level 3.', icon: 'tower', check: (c) => c.stats.evolved >= 1 },
  { id: 'cards', name: 'Card Shark', desc: 'Take 25 upgrade cards.', icon: 'chip', goal: 25, progress: (c) => c.stats.cards, check: (c) => c.stats.cards >= 25 },
  { id: 'arsenal', name: 'Full Arsenal', desc: 'Build every tower type at least once.', icon: 'tower', goal: 7, progress: (c) => c.stats.types.length, check: (c) => c.stats.types.length >= 7 },
  { id: 'purge10', name: 'Clean Sweep', desc: 'Delete 10 malware with a single System Purge.', icon: 'bolt', check: (c) => c.stats.purgeBest >= 10 },
  { id: 'kills', name: 'Exterminator', desc: 'Destroy 1,000 malware.', icon: 'target', goal: 1000, progress: (c) => c.stats.kills, check: (c) => c.stats.kills >= 1000 },
  { id: 'close', name: 'Close Call', desc: 'Win with exactly 1 Core integrity left.', icon: 'core', check: (c) => c.result && c.result.won && c.result.lives === 1 },
  { id: 'second', name: 'Second Chance', desc: 'Win a run after the Failsafe saved you.', icon: 'cycle', check: (c) => c.result && c.result.won && c.run.failsafeUsed },
  { id: 'untouchable', name: 'Untouchable', desc: 'Win with 3 stars on Hard or Nightmare.', icon: 'target', check: (c) => c.result && c.result.won && c.result.stars === 3 && ['hard', 'nightmare'].includes(c.result.difficulty) },
  { id: 'nightmare', name: 'Nightmare Warden', desc: 'Win any sector on Nightmare.', icon: 'skull', check: (c) => c.stats.nightmareWins >= 1 },
  { id: 'kernel', name: 'Kernel Secured', desc: 'Clear Sector 10 · The Kernel.', icon: 'core', check: (c) => c.sectors['sector-10'] },
  { id: 'campaign', name: 'Grid Secured', desc: 'Clear all ten sectors.', icon: 'wall', goal: 10, progress: (c) => c.cleared, check: (c) => c.cleared >= 10 },
  { id: 'medals10', name: 'Decorated', desc: 'Earn 10 medals.', icon: 'coin', goal: 10, progress: (c) => c.medals, check: (c) => c.medals >= 10 },
  { id: 'medals30', name: 'Gilded', desc: 'Earn all 30 medals.', icon: 'coin', goal: 30, progress: (c) => c.medals, check: (c) => c.medals >= 30 },
  { id: 'research6', name: 'Researcher', desc: 'Install 6 research upgrades.', icon: 'chip', goal: 6, progress: (c) => c.research, check: (c) => c.research >= 6 },
  { id: 'research12', name: 'Full Clearance', desc: 'Install every research upgrade.', icon: 'chip', goal: 12, progress: (c) => c.research, check: (c) => c.research >= 12 },
  { id: 'endless25', name: 'Into the Void', desc: 'Reach wave 25 in Endless.', icon: 'cycle', goal: 25, progress: (c) => c.stats.endlessBest, check: (c) => c.stats.endlessBest >= 25 },
  { id: 'daily5', name: 'Daily Driver', desc: 'Finish the Daily Challenge on 5 different days.', icon: 'target', goal: 5, progress: (c) => c.stats.dailies, check: (c) => c.stats.dailies >= 5 },
  { id: 'streak5', name: 'Creature of Habit', desc: 'Play the Daily Challenge 5 days in a row.', icon: 'coin', goal: 5, progress: (c) => c.stats.streakBest, check: (c) => c.stats.streakBest >= 5 },
];

// Data paid at the end of a run: per wave cleared, plus a win bonus by stars, scaled by difficulty.
export const DATA_DIFF = { easy: 0.7, normal: 1, hard: 1.4, nightmare: 1.8 };
export const dataEarned = ({ wavesCleared, won, stars = 0, difficulty = 'normal', sectorIndex = 0 }) =>
  Math.round((wavesCleared * (2 + sectorIndex * 0.2) + (won ? 18 + stars * 6 : 0)) * (DATA_DIFF[difficulty] ?? 1));

// Enemy HP across the board, set to offset the power the cards add over a run.
export const HP_SCALE = 1.12;
export const CARDS = [
  { id: 'overvolt', name: 'Overvolt', rarity: 'common', tower: 'blaster', desc: 'Photon Blasters deal +20% damage.', apply: (m) => { m.dmg.blaster = (m.dmg.blaster || 1) * 1.2; } },
  { id: 'deepfreeze', name: 'Deep Freeze', rarity: 'common', tower: 'cryo', desc: 'ICE Nodes: +15% range and slows 10% stronger.', apply: (m) => { m.range.cryo = (m.range.cryo || 1) * 1.15; m.slowBonus += 0.1; } },
  { id: 'forked', name: 'Forked Arcs', rarity: 'rare', tower: 'arc', desc: 'Arc Relays chain to 1 more target and deal +15% damage.', apply: (m) => { m.chains += 1; m.dmg.arc = (m.dmg.arc || 1) * 1.15; } },
  { id: 'payload', name: 'Heavy Payload', rarity: 'common', tower: 'launcher', desc: 'Daemon Launchers: +30% blast radius, +15% damage.', apply: (m) => { m.splash *= 1.3; m.dmg.launcher = (m.dmg.launcher || 1) * 1.15; } },
  { id: 'longshot', name: 'Long Shot', rarity: 'common', tower: 'lance', desc: 'Spike Lances: +20% range and +20% damage.', apply: (m) => { m.range.lance = (m.range.lance || 1) * 1.2; m.dmg.lance = (m.dmg.lance || 1) * 1.2; } },
  { id: 'meshlink', name: 'Mesh Uplink', rarity: 'common', tower: 'hub', desc: 'Overclock Hub fields reach 25% further.', apply: (m) => { m.range.hub = (m.range.hub || 1) * 1.25; } },
  { id: 'deepcharges', name: 'Deep Charges', rarity: 'rare', tower: 'mines', desc: 'Logic Mines: +1 mine per tower, +20% damage.', apply: (m) => { m.mineMax += 1; m.dmg.mines = (m.dmg.mines || 1) * 1.2; } },
  { id: 'overclock', name: 'Overclock', rarity: 'rare', desc: 'All towers fire 8% faster.', apply: (m) => { m.rate += 0.08; } },
  { id: 'zeroday', name: 'Zero-Day Exploit', rarity: 'epic', desc: 'All towers deal +8% damage.', apply: (m) => { m.dmgAll *= 1.08; } },
  { id: 'precision', name: 'Precision Firmware', rarity: 'epic', desc: 'Every hit ignores 2 armor.', apply: (m) => { m.armorPierce += 2; } },
  { id: 'bounty', name: 'Bounty Protocol', rarity: 'common', desc: 'Kills pay +15% credits.', apply: (m) => { m.reward *= 1.15; } },
  { id: 'firmware', name: 'Firmware Update', rarity: 'rare', desc: 'Tower upgrades cost 12% less.', apply: (m) => { m.upgradeCost *= 0.88; } },
  { id: 'interest', name: 'Compound Interest', rarity: 'epic', unique: true, desc: 'Each wave start pays 6% of your banked credits (up to 50).', apply: (m) => { m.interest += 0.06; } },
  { id: 'salvage', name: 'Salvage Rights', rarity: 'common', unique: true, desc: 'Selling refunds 90%.', apply: (m) => { m.sell = Math.max(m.sell, 0.9); } },
  { id: 'cache', name: 'Credit Cache', rarity: 'common', desc: '+90 credits right now.', now: (g) => { g.credits += 90; } },
  { id: 'patch', name: 'Core Patch', rarity: 'common', desc: 'Restore 3 Core integrity.', now: (g) => { g.lives = Math.min(g.maxLives, g.lives + 3); } },
  { id: 'recharge', name: 'Fast Recharge', rarity: 'rare', desc: 'Firewall and System Purge recharge 30% faster.', apply: (m) => { m.abilityCd *= 0.7; } },
  { id: 'bastion', name: 'Bastion Firewall', rarity: 'common', desc: 'Firewalls hold twice as long.', apply: (m) => { m.firewallDur *= 2; } },
  { id: 'deeppurge', name: 'Deep Purge', rarity: 'rare', desc: 'System Purge deals double damage.', apply: (m) => { m.purge *= 2; } },
];

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
