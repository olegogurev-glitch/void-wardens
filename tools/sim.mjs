// Headless balance check: bots play the real game logic (src/game.js) at 60 ticks/s.
//
//   node tools/sim.mjs                  # sector-01, all strategies, 3 runs each
//   node tools/sim.mjs 10 sector-02     # 10 runs each on Sector 02
//   node tools/sim.mjs 5 sector-02 hard # on a difficulty: easy / normal / hard / nightmare
//   ENDLESS=1 node tools/sim.mjs 3 sector-04 normal   # Endless mode: how far bots get past the campaign
//   DAILY=overclock node tools/sim.mjs 3 sector-04    # with a Daily twist (MUTATORS key)
//
// Output per strategy × upgrade policy: result, waves reached, and Core integrity after
// each wave. A healthy curve: one-tower spam and no-upgrade play lose; mixed, upgraded
// builds win, ideally with some damage taken from wave 5 on.
//
// The bots place towers on the tile covering the most path and call every wave
// immediately, so they're stronger at placement but weaker at timing than a human.
const SRC = new URL('../src/', import.meta.url).href;
const { Game } = await import(SRC + 'game.js');
const { GameMap } = await import(SRC + 'map.js');
const { mapById } = await import(SRC + 'maps.js');
const { TOWERS, COLS, ROWS, TILE, towerStats, upgradeOptions } = await import(SRC + 'config.js');

const RUNS = Number(process.argv[2]) || 3;
const def = mapById(process.argv[3] || 'sector-01');
const DIFF = process.argv[4] || 'normal';
const map = new GameMap(def);
console.log(`${def.name} · ${def.title} — ${def.waves.length} waves — ${DIFF}\n`);
const samples = [];
for (const path of map.paths) for (let d = 0; d < path.length; d += 10) samples.push(path.posAt(d));
const tiles = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map.isBuildable(c, r)) tiles.push({ c, r });
const coverage = (c, r, range) => {
  const x = c * TILE + TILE / 2, y = r * TILE + TILE / 2;
  return samples.reduce((n, p) => n + ((p.x - x) ** 2 + (p.y - y) ** 2 <= range * range), 0);
};

function run(strategy, upgradeMode) {
  const game = new Game(map, DIFF);
  if (process.env.ENDLESS) { game.mode = 'endless'; game.reset(); }
  if (process.env.DAILY) { game.mode = 'daily'; game.mutator = process.env.DAILY; game.seed = 1; game.reset(); }
  const lives = [];
  let think = 0, built = 0;
  game.startWave();
  for (let step = 0; !game.over && step < 60 * 60 * (process.env.ENDLESS ? 120 : 30); step++) {
    game.update(1 / 60);
    if ((think += 1 / 60) < 0.5) continue;
    think = 0;
    let acted = false;
    if (upgradeMode !== 'none' && game.towers.length >= 3) {
      for (const t of game.towers.filter((t) => t.level < 3).sort((a, b) => a.level - b.level)) {
        const i = upgradeMode === 'A' ? 0 : upgradeMode === 'B' ? 1 : t.id % 2;
        const opt = upgradeOptions(t.type, t.path)[i];
        if (opt && game.credits >= opt.cost && (built >= strategy.length || Math.random() < 0.5)) { game.upgrade(t, i); acted = true; break; }
      }
    }
    const want = strategy[built % strategy.length];
    if (!acted && built < 40 && game.credits >= TOWERS[want].cost) {
      const range = towerStats(want, []).range;
      let best = null, bs = -1;
      for (const tl of tiles) {
        if (game.towerAt(tl.c, tl.r)) continue;
        const s = coverage(tl.c, tl.r, range);
        if (s > bs) { bs = s; best = tl; }
      }
      if (best) { game.place(want, best.c, best.r); built++; }
    }
    if (game.offer) game.choose(Math.floor(Math.random() * game.offer.length)); // upgrade cards: bots pick at random
    if (game.state === 'break') { lives.push(game.lives); game.startWave(); }
  }
  return { won: game.state === 'won', wave: game.wave, lives, score: game.score };
}

const STRATEGIES = {
  blasterOnly: ['blaster'],
  mixed: ['blaster', 'blaster', 'cryo', 'arc', 'launcher', 'blaster', 'arc', 'launcher'],
  heavy: ['blaster', 'launcher', 'cryo', 'launcher', 'arc'],
  arcCryo: ['blaster', 'cryo', 'arc', 'arc', 'cryo', 'arc'],
};
// campaign towers (only when asked: node tools/sim.mjs 3 sector-05 normal new)
if (process.argv[5] === 'new') Object.assign(STRATEGIES, {
  lanceMix: ['blaster', 'lance', 'cryo', 'arc', 'lance', 'launcher'],
  hubMix: ['blaster', 'blaster', 'hub', 'arc', 'launcher', 'blaster', 'hub', 'cryo'],
  minesMix: ['blaster', 'mines', 'cryo', 'mines', 'arc', 'launcher'],
});
if (process.argv[5] === 'only-new') { for (const k of Object.keys(STRATEGIES)) if (k !== 'mixed') delete STRATEGIES[k]; Object.assign(STRATEGIES, {
  lanceMix: ['blaster', 'lance', 'cryo', 'arc', 'lance', 'launcher'],
  hubMix: ['blaster', 'blaster', 'hub', 'arc', 'launcher', 'blaster', 'hub', 'cryo'],
  minesMix: ['blaster', 'mines', 'cryo', 'mines', 'arc', 'launcher'],
}); }
let wins = 0, total = 0;
const all = [];
for (const [name, strat] of Object.entries(STRATEGIES)) {
  for (const up of ['none', 'A', 'B', 'mix']) {
    const res = Array.from({ length: RUNS }, () => run(strat, up));
    wins += res.filter((r) => r.won).length; total += res.length;
    all.push(...res);
    console.log(name.padEnd(12), up.padEnd(5), res.map((r) => `${r.won ? 'WIN ' : 'LOSE'} w${String(r.wave).padStart(2)} [${r.lives.join(',')}]`).join('  '));
  }
}
console.log(`\n${wins}/${total} bot games won`);
if (process.env.ENDLESS || process.env.DAILY) {
  const ws = all.map((r) => r.wave).sort((a, b) => a - b), sc = all.map((r) => r.score).sort((a, b) => a - b);
  console.log(`waves reached: median ${ws[ws.length >> 1]} · best ${ws.at(-1)} · score median ${sc[sc.length >> 1]} · best ${sc.at(-1)}`);
}
