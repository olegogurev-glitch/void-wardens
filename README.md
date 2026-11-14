# VOID//WARDENS — cyber-grid tower defense for Pixo

A breach has opened in the grid. Hostile code pours through it and runs along the data bus toward the Core. Stop it.

The visual style is minimalist cyberpunk (Tron / Blade Runner): neon line-art on near-black, a light-cycle grid, scanlines and glitch effects.

Pure HTML5 Canvas + vanilla JS modules, with no dependencies and no build step. All art and sound are generated in code, so there are no asset files.

## Run locally

ES modules need to be served over HTTP (opening `index.html` as a file won't work):

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. Add `?debug` to expose `window.VW` (`game`, `view`, `ctl`) in the console.

**To embed it on the Pixo site**, upload the folder as-is: `index.html`, `css/` and `src/`. It also works inside an `<iframe>`.

## Controls

| Input | Action |
|---|---|
| `1`–`4` / click dock | Pick a tower, then click an empty tile (hold **Shift** to keep placing) |
| Click tower | Open its panel to evolve or sell it |
| `Q` / `E` | Choose the left or right evolution of the selected tower |
| `S` | Sell the selected tower (70% refund) |
| `Space` | Launch the next wave. Calling it early earns +3 credits per second skipped |
| `F` / `P` / `M` | Speed 1×/2×/3× · Pause · Mute |
| Right-click / `Esc` | Cancel placing or deselect |

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
- **Leviathan.exe** (wave 10 boss): 5,200 HP, armor 6, resists crowd control, and costs 12 integrity if it leaks.

## Code map

```
index.html        page shell + HUD markup
css/style.css     all UI styling (HUD, dock, tower panel, banners, overlays)
src/config.js     ← ALL tuning: economy, enemies, waves, towers & upgrade trees
src/map.js        path waypoints, buildable tiles, path math
src/game.js       simulation (no DOM): waves, targeting, attacks, damage, status effects
src/fx.js         particle / ring / beam / lightning state
src/render.js     procedural canvas art (palette in PAL at the top): grid, bus, towers, enemies, effects
src/ui.js         DOM HUD, dock, evolution panel, banners
src/audio.js      WebAudio-synthesized sound effects
src/main.js       bootstrap, input, game loop
```

**Adding content:**
- A new upgrade is a node in `TOWERS[...].branches` with an `apply(stats)` function.
- A new wave is one line in `WAVES`.
- A new map is a new `WAYPOINTS` array.

The simulation never touches the DOM, so it can run headless in Node for balance testing.
