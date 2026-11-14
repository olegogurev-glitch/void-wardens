# VOID//WARDENS — cyber-grid tower defense for Pixo

A breach has opened in the grid. Hostile code pours through it and runs along the data bus toward the Core. Stop it.

The visual style is minimalist cyberpunk (Tron / Blade Runner): neon line-art on near-black, a light-cycle grid, scanlines and glitch effects.

Pure HTML5 Canvas + vanilla JS modules, with no dependencies and no build step. All art and sound are generated in code, so there are no asset files.

## Run locally

ES modules need to be served over HTTP (opening `index.html` as a file won't work):

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. Add `?debug` to expose `window.VW` (`game`, `view`, `ctl`, `music`, …) in the console.

**Balance check.** After changing anything in `src/config.js` or `src/maps.js`, run:

```bash
node tools/sim.mjs 3 sector-01
```

```bash
node tools/sim.mjs 3 sector-02
```

Bots play the real game logic and report wins and Core integrity after each wave. Current baseline: about 25% of bot games won on Sector 01 and about 15% on Sector 02. In both sectors, single-tower builds lose and diverse upgraded builds win.

## Sectors

The start screen is a sector select. It remembers your best result per sector in the browser: 1–3 stars for a win, or the furthest wave reached.

| Sector | Layout | Waves | Notes |
|---|---|---|---|
| **01 · Serpent Bus** (Standard) | 1 breach, long winding route | 10 | Glitches, Trojans, Leviathan.exe boss |
| **02 · Twin Breach** (Hard) | 2 breaches merging into one trunk | 12 | Adds Worms, Ciphers, Rootkits and Patchers |

**To embed it on the Pixo site**, upload the folder as-is: `index.html`, `css/` and `src/`. It also works inside an `<iframe>`.

## Controls

| Input | Action |
|---|---|
| `1`–`4` / click dock | Pick a tower, then click an empty tile (hold **Shift** to keep placing). On touch: tap once to preview, tap again to deploy |
| Click tower | Open its panel to evolve, retarget or sell it |
| `Q` / `E` | Choose the left or right evolution of the selected tower |
| `T` | Cycle targeting: First / Last / Strong / Close (not shown for area towers) |
| `S` ×2 | Sell the selected tower (70% refund). The first press arms it, the second confirms within 2.5s |
| `Space` | Run the next wave. Calling it early earns +3 credits per second skipped. The next wave's makeup is previewed above the button |
| `F` / `P` / `M` / `N` | Speed 1×/2×/3× · Pause · Mute all · Music on/off |
| Right-click / `Esc` | Cancel placing or deselect |

**Music.** Procedural synthwave from `src/music.js`. It plays calm pads between waves, adds drums once a wave runs, and goes four-on-the-floor while the boss is alive.

## Towers and their evolution trees

Each tower has 3 levels. Level 2 is a choice between two branches. Level 3 is a choice between two evolutions **of the branch you picked**, which gives every tower 4 distinct final forms.

| Tower | Lv 2: Branch A → Lv 3 options | Lv 2: Branch B → Lv 3 options |
|---|---|---|
| **Photon Blaster** (50) | Overcharge → **Railgun** (piercing beam) / **Fragment Rounds** (explosive) | Twin Barrels → **Gatling Array** (bullet storm) / **Scatter Array** (3 targets) |
| **ICE Node** (70) | Deep Freeze → **Absolute Zero** (freeze solid) / **Shatter** (+40% dmg taken) | Wide Field → **Rollback** (pushes enemies back) / **Frost Storm** (2× pulses) |
| **Arc Relay** (90) | Conductor → **Tempest** (9 chains) / **Overload** (stun) | High Voltage → **EMP Burst** (hits all in range) / **Static Field** (slow) |
| **Daemon Launcher** (120) | Warheads → **Zero-Day** (huge blasts) / **Cluster Bombs** | Salvo Pods → **Botnet** (6 missiles) / **Corruption** (burning sectors) |

Armor creates real trade-offs. Trojans subtract 3 from every hit and the boss subtracts 6, so fast low-damage builds (Gatling) shred Glitches but struggle against armor. Heavy hits, armor-piercing lightning and burn damage do the opposite.

## Enemies

- **Glitch**: fast, fragile swarmers.
- **Trojan**: slow, armored, and costs 2 Core integrity if it leaks.
- **Leviathan.exe** (final boss): 5,200 HP, armor 6, resists crowd control, and costs 12 integrity if it leaks.

The following appear in Sector 02. Each one asks for a different answer:

- **Worm**: splits into 3 fast **Fragments** when killed. Splash damage handles them well.
- **Cipher**: a shield blocks one hit completely, then rebuilds 2s after it pops. Fast-firing towers strip it, and burn damage ignores it.
- **Rootkit**: cloaked, so towers can't aim at it. **ICE Node** pulses reveal it for 8s, and any hit exposes it briefly. Splash and lightning still hit it.
- **Patcher**: every 2s it heals nearby malware by 6% of their max HP (capped at 30). Kill it first; the **Strong** or **Last** targeting modes help.

## Code map

```
index.html        page shell + HUD markup
css/style.css     all UI styling (HUD, dock, tower panel, banners, overlays)
src/config.js     ← tuning: economy, enemies, towers & upgrade trees
src/maps.js       ← sectors: routes, waves, starting credits, HP curve
src/map.js        path math (multi-path), buildable tiles
src/game.js       simulation (no DOM): waves, targeting, attacks, damage, status effects
src/fx.js         particle / ring / beam / lightning state
src/render.js     procedural canvas art (palette in PAL at the top): grid, bus, towers, enemies, effects
src/ui.js         DOM HUD, dock, evolution panel, banners
src/audio.js      WebAudio-synthesized sound effects
src/music.js      adaptive procedural synthwave soundtrack
tools/sim.mjs     headless balance simulator (bots play the real logic)
src/main.js       bootstrap, input, game loop
```

**Adding content:**
- A new upgrade is a node in `TOWERS[...].branches` with an `apply(stats)` function.
- A new wave is one line in a sector's `waves`. The 5th field picks the breach: `0`, `1` or `'alt'`.
- A new sector is one more entry in `MAPS` (`src/maps.js`). It needs one waypoint list per breach, and every path must end on the same Core tile. It appears on the start screen automatically.
- A new enemy is an entry in `ENEMIES`. Its behaviour comes from flags: `split`, `shield`, `stealth`, `heal`.

The simulation never touches the DOM, so it can run headless in Node for balance testing.
