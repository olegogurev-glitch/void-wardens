// Crowd-control lock test: one fixed, fully evolved build is bought before wave 1 and never
// touched again (like a player who stops building around wave 10). Endless then runs until the
// Core falls. If a build never falls, malware has no answer to it.
//
//   node tools/locktest.mjs                       # sector-10, hard, both builds, 3 runs
//   node tools/locktest.mjs sector-04 normal 5
//
// cc:  2 Rollback + 3 Absolute Zero ICE Nodes in the mix (the lock from play-testing)
// dps: the same slots with damage forms instead (Hailstorm / Shatter)
const SRC = new URL('../src/', import.meta.url).href;
const { Game } = await import(SRC + 'game.js');
const { GameMap } = await import(SRC + 'map.js');
const { mapById } = await import(SRC + 'maps.js');
const { COLS, ROWS, TILE, towerStats } = await import(SRC + 'config.js');

const def = mapById(process.argv[2] || 'sector-10');
const DIFF = process.argv[3] || 'hard';
const RUNS = Number(process.argv[4]) || 3;
const MAX_WAVE = 70;
const map = new GameMap(def);

const core = [
  ['arc', [0, 0]], ['launcher', [0, 0]], ['blaster', [0, 0]], ['blaster', [1, 0]],
  ['arc', [0, 0]], ['launcher', [0, 0]], ['blaster', [1, 1]], ['lance', [0, 0]],
  ['blaster', [0, 1]], ['launcher', [1, 0]], ['arc', [1, 0]],
];
const BUILDS = {
  cc: [['cryo', [1, 0]], ['cryo', [0, 0]], ['cryo', [0, 0]], ['cryo', [1, 0]], ['cryo', [0, 0]], ...core],
  dps: [['cryo', [1, 1]], ['cryo', [0, 1]], ['cryo', [0, 1]], ['cryo', [1, 1]], ['cryo', [0, 1]], ...core],
};

const samples = [];
for (const path of map.paths) for (let d = 0; d < path.length; d += 10) samples.push(path.posAt(d));
const tiles = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map.isBuildable(c, r)) tiles.push({ c, r });
const coverage = (c, r, range) => {
  const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
  return samples.reduce((n, p) => n + ((p.x - x) ** 2 + (p.y - y) ** 2 <= range * range), 0);
};

function run(build) {
  const game = new Game(map, DIFF);
  game.mode = 'endless';
  game.reset();
  game.credits = 1e6;
  for (const [type, path] of build) {
    const range = towerStats(type, path).range;
    let best = null, bs = -1;
    for (const tl of tiles) {
      if (game.towerAt(tl.c, tl.r)) continue;
      const s = coverage(tl.c, tl.r, range);
      if (s > bs) { bs = s; best = tl; }
    }
    const t = game.place(type, best.c, best.r);
    for (const i of path) game.upgrade(t, i);
  }
  game.credits = 0;
  game.startWave();
  for (let step = 0; !game.over && game.wave <= MAX_WAVE; step++) {
    game.update(1 / 60);
    if (game.offer) game.choose(Math.floor(Math.random() * game.offer.length));
    if (game.state === 'break') game.startWave();
  }
  return game.over ? game.wave : `${MAX_WAVE}+`;
}

console.log(`${def.name} · ${def.title} — Endless ${DIFF}, fixed build, waves survived until the Core falls\n`);
for (const [name, build] of Object.entries(BUILDS)) {
  console.log(name.padEnd(4), Array.from({ length: RUNS }, () => run(build)).join('  '));
}
