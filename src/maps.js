// ─────────────────────────────────────────────────────────────
//  Sectors (maps): routes from breach(es) to the Core + their waves.
//
//  paths: one waypoint list per breach, in tile coordinates. Every path ends at
//         the same Core tile; paths may merge and share a trunk line.
//  waves: groups of [enemyType, count, spawnInterval, startDelay, path?]
//         path = 0 | 1 | 'alt' (alternate between breaches). Defaults to 0.
//  theme: presentation only — the city lights far below the grid, rain, the
//         ambient light colours and a colour grade (lift/gain) for the sector.
// ─────────────────────────────────────────────────────────────

const TRUNK_02 = [[16, 9], [16, 4], [23, 4], [23, 14], [28, 14], [28, 9], [30, 9]];

export const MAPS = [
  {
    id: 'sector-01',
    name: 'Sector 01',
    title: 'Serpent Bus',
    difficulty: 'Intro',
    desc: 'One breach, one long winding data bus. Learn the towers.',
    startCredits: 260,
    theme: {
      city: { density: 0.55, colors: ['#00e5ff', '#7fe9ff', '#b967ff', '#ffffff'], seed: 11 },
      rain: 0,
      ambient: ['#00e5ff', '#ff2a6d', '#b967ff'],
    },
    paths: [
      [[0, 4], [7, 4], [7, 13], [14, 13], [14, 4], [21, 4], [21, 13], [27, 13], [27, 8], [30, 8]],
    ],
    waves: [
      [['scout', 8, 0.9, 0]],
      [['scout', 14, 0.6, 0]],
      [['brute', 5, 1.8, 0], ['scout', 6, 0.5, 4]],
      [['scout', 18, 0.45, 0], ['brute', 4, 2, 3]],
      [['brute', 10, 1.3, 0]],
      [['scout', 30, 0.28, 0]],
      [['brute', 10, 1.1, 0], ['scout', 20, 0.4, 2]],
      [['scout', 25, 0.3, 0], ['brute', 14, 0.9, 5]],
      [['brute', 20, 0.75, 0], ['scout', 30, 0.25, 6]],
      [['boss', 1, 0, 1.5], ['scout', 24, 0.5, 3], ['brute', 10, 1.5, 8]],
    ],
  },
  {
    id: 'sector-02',
    name: 'Sector 02',
    title: 'Twin Breach',
    difficulty: 'Advanced',
    desc: 'Two breaches feed one trunk line. New malware: Worms, Ciphers, Rootkits, Patchers.',
    startCredits: 320,
    theme: {
      city: { density: 1, colors: ['#ffb347', '#ff6a3d', '#ff2a6d', '#ffd27a'], seed: 23 },
      rain: 1,
      ambient: ['#ff8a3d', '#ff2a6d', '#ffb800'],
      grade: { lift: [0.012, 0.004, 0], gain: [1.06, 0.97, 0.9] },
    },
    hpCurve: [0.16, 0.028], // 12 waves → gentler growth than Sector 01's default
    paths: [
      [[0, 3], [8, 3], [8, 9], ...TRUNK_02],
      [[0, 15], [12, 15], [12, 9], ...TRUNK_02],
    ],
    waves: [
      [['scout', 10, 0.7, 0, 0]],
      [['scout', 8, 0.6, 0, 0], ['scout', 8, 0.6, 1, 1]],
      [['worm', 6, 1.6, 0, 'alt']],
      [['brute', 5, 1.8, 0, 0], ['cipher', 8, 0.8, 2, 1]],
      [['rootkit', 4, 1.6, 0, 0], ['scout', 14, 0.45, 2, 1]],
      [['worm', 8, 1.2, 0, 'alt'], ['patcher', 2, 4, 3, 'alt']],
      [['cipher', 14, 0.6, 0, 'alt'], ['rootkit', 6, 1.2, 4, 1]],
      [['brute', 8, 1.3, 0, 0], ['patcher', 2, 4, 2, 0], ['scout', 24, 0.3, 4, 1]],
      [['worm', 12, 0.9, 0, 'alt'], ['rootkit', 8, 1.0, 3, 'alt'], ['cipher', 10, 0.7, 6, 1]],
      [['brute', 12, 0.9, 0, 'alt'], ['patcher', 4, 2.5, 3, 'alt'], ['cipher', 16, 0.5, 5, 'alt']],
      [['worm', 16, 0.7, 0, 0], ['rootkit', 12, 0.8, 0, 1], ['brute', 12, 1, 6, 'alt'], ['scout', 30, 0.25, 8, 'alt']],
      [['boss', 1, 0, 1.5, 0], ['patcher', 3, 3, 4, 0], ['cipher', 20, 0.5, 2, 1], ['worm', 12, 1, 8, 1], ['rootkit', 10, 1, 10, 'alt']],
    ],
  },
];

export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];
