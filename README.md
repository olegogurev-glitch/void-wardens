# VOID//WARDENS — cyber-grid tower defense for Pixo

A breach has opened in the grid. Hostile code pours through it and runs along the data bus toward the Core. Stop it.

The visual style is minimalist cyberpunk (Tron / Blade Runner): neon line-art on near-black, a light-cycle grid, scanlines and glitch effects.

Pure HTML5 Canvas + vanilla JS modules, with no dependencies and no build step. All art and sound are generated in code, so there are no asset files.

## Run locally

The game is made of ES modules, which browsers won't load from a page opened as a file, so double-clicking `index.html` doesn't work. Serve the folder instead:

```bash
node tools/serve.mjs
```

Then open http://localhost:5173 and stop the server with Ctrl+C. This dev server tells the browser never to cache, so your edits always show up on reload; `python3 -m http.server` would serve stale files. Add `?debug` to the URL to expose `window.VW` (`game`, `view`, `ctl`, `music`, …) in the console.

**Balance check.** After changing anything in `src/config.js` or `src/maps.js`, run:

```bash
node tools/sim.mjs 3 sector-01 normal
```

```bash
node tools/sim.mjs 3 sector-02 hard
```

Bots play the real game logic and report wins and Core integrity after each wave. Bots don't use abilities or targeting modes, so they are weaker than a real player.

| Bot games won (all strategies) | Easy | Normal | Hard | Nightmare |
|---|---|---|---|---|
| Sector 01 | ~75% | ~25% | 0% (best builds ~25%) | 0% (die ~wave 6) |
| Sector 02 | ~65% | ~15% | 0% (best builds ~6%) | 0% (die ~wave 7) |

## Deploying (e.g. to Pixo)

1. Run `node tools/stamp.mjs`. It adds a content fingerprint to every file `index.html` loads (`config.js?v=3f9a…`, via an import map). Browsers then fetch exactly the files that changed, so players never get a broken mix of old and new modules after an update. Run it after every change you deploy; it's safe to run repeatedly.
2. Upload `index.html`, `css/` and `src/` as they are. The game also works inside an `<iframe>`.
3. Make sure the host doesn't cache `index.html` itself for long. Most hosts revalidate HTML by default. The fingerprinted JS and CSS can be cached forever.

## Sectors and difficulty

The start screen is a sector select with a difficulty picker. Your best result is saved in the browser for each sector and difficulty: 1–3 stars for a win (by share of Core integrity left), or the furthest wave reached.

| Sector | Layout | Waves | Notes |
|---|---|---|---|
| **01 · Serpent Bus** (Intro) | 1 breach, long winding route | 10 | Glitches, Trojans, Leviathan.exe boss |
| **02 · Twin Breach** (Advanced) | 2 breaches merging into one trunk | 12 | Adds Worms, Ciphers, Rootkits and Patchers |

| Difficulty | Enemies | Enemy HP | Credits per kill | Core |
|---|---|---|---|---|
| **Easy** | −20% | −15% | +15% | 25 |
| **Normal** | — | — | — | 20 |
| **Hard** | up to +30% | up to +15% | −10% | 20 |
| **Nightmare** | up to +60% | up to +35% | −20% | 15 |

The Hard and Nightmare bonuses **ramp through the run**: 30% of the bonus on wave 1, rising to the full value on the last wave. The opening stays fair while you have no economy, and the late game gets the pressure. Easy's reductions apply in full from the start. Extra enemies arrive in the same time window, so waves get denser rather than longer. Tune it all in `DIFFICULTIES` in `src/config.js`.

## Boot sequence, fullscreen and landscape

Every load opens with a boot console: the grid monitor detects the breach, traces it to the Core and asks **Deploy the protection?** with a single **YES** (or Enter/Y). Tapping during the log fast-forwards it. YES unlocks audio, starts the menu music, and requests **fullscreen + landscape lock**.

- Landscape lock works on Android Chrome (in fullscreen). iPhone Safari can't go fullscreen or lock orientation, so on any touch device held in portrait a **Rotate to landscape** screen covers the game, and a running wave pauses automatically.
- Landscape phones get their own layout: compact HUD on top and the tower/ability dock as a column on the right, so the board gets the full height.
- When embedding in Pixo with an `<iframe>`, add `allow="fullscreen"` (and `allowfullscreen`) or the browser will refuse fullscreen; the game then simply plays in the frame.
- `?intro=0` skips the console (handy while developing).

## Graphics

The scene is drawn with Canvas 2D, then composited through a WebGL post-processing pass (`src/post.js`): multi-scale bloom, anamorphic streaks on white-hot cores, shockwave refraction riding big blasts, chromatic aberration on impacts, scanlines, vignette and film grain. On top of that the renderer lights the grid dynamically around towers, enemies, projectiles and explosions, and draws enemy motion trails, drifting motes and soft bokeh.

Motion: wave-ending kills and the boss kill land in slow motion with a push-in on the target; enemies print in behind a scanline and "derez" into shearing slices when destroyed; turrets swing on a spring (slight overshoot, recoil kick, idle scanning); towers and enemies reflect on a glossy floor; and the grid lighting, bloom and Core pulse ride the soundtrack's kick and snare. Towers build in as a traced hologram and morph when upgraded (the old form tears away in slices); enemies get knocked back when hit; Arc Relays visibly charge and Daemon Launcher hatches slide open before a salvo; the Core cracks and glitches as integrity drops. The colour grade follows the moment (cool between waves, hot during the boss, a red pulse when the Core is critical, grey on a loss, warm on a win); sectors open with a CRT power-on, the menu returns through a glitch wipe, and credits fly from each kill into the HUD counter. Selected towers show a radar-style range (bearing ticks, a sweep that pings enemies it passes); the placement preview is a flickering hologram; towers are drawn as thick slabs and the data bus as a sunken trench lit from the top-left; and the post pass adds lens dirt that catches big flashes.

Big moments and atmosphere: the boss arrives with a short entrance — slow motion, a push-in on the breach, letterbox bars, a red alarm across the grid, a siren and a name card. Each sector has its own look (set in `theme` in `src/maps.js`): a night city far below the glass grid that drifts with parallax, ambient light colours, a colour grade, and rain with ripples in Sector 02. At max level every tower type gets a signature idle effect (heat shimmer, orbiting fragments, frost mist, arc crackle).

Sound: effects pan left/right with where they happen, big blasts get a sub-bass layer and a shared reverb tail, everything is muffled while paused, and there are cues for hovering controls, credits landing, the CRT power-on, the glitch wipe and the boss siren.

Comfort: the pause menu has **Screen shake** and **Flashes** sliders plus **Calm** / **Full** presets (remembered). They scale shake, camera punches, shockwaves, glitches, flashes, the beat pulse and the red alarms.

More feedback: before the final wave red searchlights sweep from the Core and a 3-2-1 countdown ticks in; each malware type dies its own way (Worms come apart, Rootkits dissolve into static, Patchers implode, Cipher shields shatter); merged damage numbers float off each enemy, bigger and warmer for bigger hits; the sector cards tilt toward the pointer over a live mini-map of their routes; tower stats count up when the panel opens and upgrade buttons charge along their edge on hover; phones vibrate on Core hits and the boss kill (Android); and the win screen has **Share screenshot**, which builds a framed image with your result and opens the share sheet (or downloads a PNG).

- Without WebGL, the game falls back to plain 2D with the same art and lighting (no bloom).
- **Graphics setting** in the pause menu (or press **G**): **Auto** (default) starts at high on desktop and medium on phones, and steps down (**medium** → **low**) if frames average under ~40 fps over 1.5 s; **High / Medium / Low** pin a tier. The choice is remembered.
  - **High:** up to 2× resolution, bloom + streaks, lens dirt, grid lighting, floor reflections, full weather and ambience.
  - **Medium:** 1.25× resolution, bloom + streaks and grid lighting; no reflections or lens dirt; 70% rain, half the motes.
  - **Low:** 1× resolution, no bloom, lighting or reflections; static city, 35% rain, no motes/bokeh, simpler deaths.
  - Tier flags live in `QUALITY` at the top of the renderer section of `src/render.js`.
- `?fx=low`, `?fx=medium` or `?fx=high` overrides it for one visit; `?fx=2d` forces the 2D fallback.
- With the OS "reduce motion" setting, shake, refraction, glitch and flashes are toned down.

## Controls

| Input | Action |
|---|---|
| `1`–`4` / click dock | Pick a tower, then click an empty tile (hold **Shift** to keep placing). On touch: tap once to preview, tap again to deploy |
| Click tower | Open its panel to evolve, retarget or sell it |
| `Q` / `E` | Choose the left or right evolution of the selected tower |
| `T` | Cycle targeting: First / Last / Strong / Close (not shown for area towers) |
| `S` ×2 | Sell the selected tower (70% refund). The first press arms it, the second confirms within 2.5s |
| `Space` | Run the next wave. Calling it early earns +3 credits per second skipped. The next wave's makeup is previewed above the button |
| `Z` / `X` | Abilities: **Firewall** (then click the bus) · **System Purge** |
| `F` / `P` / `M` / `N` / `G` | Speed 1×/2×/3× · Pause · Mute all · Music on/off · Graphics quality |
| Right-click / `Esc` | Cancel placing or deselect |

**Abilities.** Both start ready, and their cooldowns run on game time. Tune them in `ABILITIES` in `src/config.js`.
- **Firewall** (40s cooldown): drop a barrier anywhere on a data bus. It holds malware back for 5s and burns whatever presses against it. Bosses smash through after 1.5s.
- **System Purge** (75s cooldown): hits every enemy for 15% of max HP (bosses 4%), stuns them for 1s, reveals Rootkits and strips Cipher shields.

**Reduced motion.** If the OS "reduce motion" setting is on, screen shake, glitch slices, flashes and enemy jitter are toned down, and the glitch title and banner animations are calmed.

**Music.** Procedural synthwave from `src/music.js`. It plays calm pads between waves, adds drums once a wave runs, and goes four-on-the-floor while the boss is alive.

## Towers and their evolution trees

Each tower has 3 levels. Level 2 is a choice between two branches. Level 3 is a choice between two evolutions **of the branch you picked**, which gives every tower 4 distinct final forms.

| Tower | Lv 2: Branch A → Lv 3 options | Lv 2: Branch B → Lv 3 options |
|---|---|---|
| **Photon Blaster** (50) | Overcharge → **Railgun** (piercing beam) / **Fragment Rounds** (explosive) | Twin Barrels → **Gatling Array** (spins up, faster the longer it fires) / **Scatter Array** (3 targets) |
| **ICE Node** (70) | Deep Freeze → **Absolute Zero** (freeze solid) / **Shatter** (+40% dmg taken) | Wide Field → **Rollback** (pushes enemies back) / **Hailstorm** (faster pulses + 3 ice shards) |
| **Arc Relay** (90) | Conductor → **Tempest** (9 chains, then a 50% echo strike) / **Overload** (stun) | High Voltage → **EMP Burst** (hits all in range) / **Static Field** (slow) |
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
tools/serve.mjs   no-cache local dev server
tools/stamp.mjs   cache-busting fingerprints for deploys
src/main.js       bootstrap, input, game loop
```

**Adding content:**
- A new upgrade is a node in `TOWERS[...].branches` with an `apply(stats)` function.
- A new wave is one line in a sector's `waves`. The 5th field picks the breach: `0`, `1` or `'alt'`.
- A new sector is one more entry in `MAPS` (`src/maps.js`). It needs one waypoint list per breach, and every path must end on the same Core tile. It appears on the start screen automatically.
- A new enemy is an entry in `ENEMIES`. Its behaviour comes from flags: `split`, `shield`, `stealth`, `heal`.

The simulation never touches the DOM, so it can run headless in Node for balance testing.
