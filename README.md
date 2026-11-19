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

| Bot games won / median wave | Easy | Normal | Hard | Nightmare |
|---|---|---|---|---|
| Sector 01 | 50% · w10 | 5% · w7 | 0% · w5 | 0% · w3 |
| Sector 02 | 53% · w12 | 11% · w9 | 0% · w7 | 0% · w3 |
| Sector 03 | 44% · w12 | 5% · w8 | 0% · w4 | 0% · w2 |
| Sector 04 | 34% · w9 | 13% · w7 | 0% · w5 | 2% · w2 |
| Sector 05 | 50% · w12 | 4% · w7 | 0% · w3 | 0% · w1 |
| Sector 06 | 44% · w13 | 11% · w6 | 0% · w4 | 0% · w2 |
| Sector 07 | 31% · w10 | 5% · w6 | 0% · w6 | 0% · w2 |
| Sector 08 | 38% · w13 | 2% · w11 | 6% · w6 | 0% · w2 |
| Sector 09 | 31% · w10 | 2% · w6 | 0% · w5 | 0% · w2 |
| Sector 10 | 31% · w7 | 0% · w4 | 0% · w3 | 0% · w1 |

Level-3 balance is checked separately: one fully upgraded tower against a dense wave-9 stream for 60s, ranked by damage per credit and kills. The forms that dominated it were trimmed — **Corruption** (burn 30→15/s, at most 3 burning zones per launcher; it went from 16 kills to 2), **Botnet** (5 missiles, +30% reload), **Zero-Day**, **Hailstorm**, **Shatter**, **Absolute Zero**, **EMP Burst**, **Seed Nukes** and **Chain Reaction**.

Measured with sector rules, new malware, campaign towers and upgrade cards. The bots never use abilities, pick cards at random and call every wave instantly, so they are far weaker than a real player — a skilled human 3-starred Nightmare on the previous tuning while bots were losing there. Read the table as relative difficulty, not absolute.

## Deploying (e.g. to Pixo)

1. Run `node tools/stamp.mjs`. It adds a content fingerprint to every file `index.html` loads (`config.js?v=3f9a…`, via an import map). Browsers then fetch exactly the files that changed, so players never get a broken mix of old and new modules after an update. Run it after every change you deploy; it's safe to run repeatedly.
2. Upload `index.html`, `css/` and `src/` as they are. The game also works inside an `<iframe>`.
3. Make sure the host doesn't cache `index.html` itself for long. Most hosts revalidate HTML by default. The fingerprinted JS and CSS can be cached forever.

## Training

**Training** is the first tab on the start screen, next to Campaign, Endless and Daily. A new player (no tab picked yet, training never finished) lands on it, and it pulses with an amber dot until it has been finished once; afterwards the menu opens on Campaign. Its panel lists what it teaches, and **Start training** (or Enter) runs a guided lesson on its own small map (`TUTORIAL` in `src/maps.js`: one breach, a U-shaped bus, four short waves). A coach box in the corner of the board explains one mechanic at a time and waits for the player to do it, while amber frames point at the HUD, dock, tower panel or a tile on the board:

1. Breach, data bus and Core · Core integrity · credits
2. Pick the Photon Blaster and deploy it on the marked tile → run wave 1 → towers fire on their own, kills pay
3. Wave-clear bonus and calling waves early → ICE Node (slow)
4. Open the tower panel → choose an evolution path → targeting modes and selling
5. Wave 2: Trojans and armor → wave 3 swarm: **Firewall** and **System Purge** (time freezes until the player uses each one) → cooldowns
6. Data cache cards → speed, pause and settings → a final wave on their own (Worms split)

The finish screen sums up what lies outside the training (campaign stars, medals, research, unlockable towers, Endless and Daily) and offers **Start the campaign**.

Training waits for the player: waves start only when the coach asks for one, and the break clock is held. It can't be lost (the Core stops at 1), and it saves no records, stats, achievements or Data. Only `voidwardens.tutorial` is stored, to stop the button pulsing. The steps live in `src/tutorial.js`; each one can wait for a condition (`wait`), finish on one (`done`), step back (`back`), or freeze time mid-wave (`freeze`). The coach points at tiles of the training map, so keep the two in step.

## Campaign, sectors and difficulty

The start screen is the campaign: ten sectors in order, a difficulty picker, and a detail panel for the selected sector (route preview, threats, record). **Each sector unlocks once the one before it has been cleared on any difficulty**; winning shows the newly opened sector with a **Next sector** button. Your best result is saved in the browser for each sector and difficulty: 1–3 stars for a win (by share of Core integrity left), or the furthest wave reached. `?unlock` opens every sector for testing.

Every sector has its own layout, malware mix, **rule** (set as `rule` in `src/maps.js`, defined in `RULES` in `src/config.js`, applied by the simulation so the bots feel it too) and look — grid/bus colour, the backdrop far below the glass, weather, ambient light and colour grade — set in `theme`. The rule shows in the campaign panel, in the start banner and as a chip in the corner of the board.

| Sector | Layout | Waves | Rule | New malware / focus | Look |
|---|---|---|---|---|---|
| **01 · Serpent Bus** | 1 breach, long winding route | 10 | — | Glitches, Trojans · boss | Cyan night city |
| **02 · Twin Breach** | 2 breaches → shared trunk that loops across itself | 12 | — | Worms, Ciphers, Rootkits, Patchers · boss | Amber city, rain |
| **03 · Cold Storage** | Spiral into a central Core | 12 | **Permafrost** — slows/freezes last 2× | **Furnace** | Ice blue, snow |
| **04 · Neon Bazaar** | 3 breaches → one junction | 12 | **Market Rush** — kills +25% credits, 10s breaks | **Jammer** | Violet market, data glyphs |
| **05 · Blackout** | 2 lanes braided across each other | 12 | **Low Visibility** — range −12%, hit Rootkits exposed 2.5× longer | Rootkits, Jammers · boss | Dark blue, fog |
| **06 · Foundry** | Terraced staircase down and back up | 13 | **Hardened** — malware +1 armor, armor-piercing +30% | **Bulwark** | Amber, embers |
| **07 · Deep Archive** | Crooked switchbacks, Core in a dead-end alcove | 13 | **Read-Only** — selling refunds 100% | **Carrier** | Green, dust |
| **08 · Storm Front** | Lanes from the east wrap the Core, collide behind it | 14 | **Lightning** — strikes hit and stun malware | Mixed · boss | Indigo, lightning + thunder |
| **09 · Orbital Relay** | Centre Core, breaches on both flanks | 14 | **Uplink** — abilities recharge 40% faster | **Blinker** | Silver, starfield, meteors |
| **10 · The Kernel** | Vault of two rings around a centre Core | 15 | **Kernel Panic** — each leak speeds all malware 25% for 4s | Everything · two bosses | Crimson, corruption static |

**Crowd-control limits** (`CC` in `src/config.js`): towers can't chain-lock malware. After a freeze or stun wears off, a malware can't be frozen or stunned by towers for 1s. Total slow is capped at 70%. Rollback can push each malware back only 3 times, and never a boss. Leviathan **overclocks** every ~8s: it throws off all chill and stuns, surges at 1.8× speed for 2s, and drops 3 Glitches.

New malware (stats in `ENEMIES`, `src/config.js`): **Watchdog** — towers can't freeze, stun or roll it back, and slows work at half strength. It shows up in the last waves of Sectors 08–10 and in every Endless wave past the campaign. **Furnace** — immune to slow and freeze, its heat pulses thaw allies nearby. **Jammer** — towers within its field reload 40% slower (static crawls over them). **Bulwark** — allies near it take 40% less damage (they show a hex shell). **Carrier** — drops pairs of Glitches as it walks (up to 6). **Blinker** — teleports ~2 tiles ahead every few seconds (not while a Firewall is up). A wave that brings a type for the first time in a sector says so in its banner.

### Upgrade cards (data caches)

After every 3rd wave (not the last) the grid recovers a **data cache**: three cards are dealt and you keep one for the rest of the run. Click a card or press **1 / 2 / 3**; the break clock waits while you choose. Cards come in three rarities (common 60% · rare 30% · epic 10%), tower cards are only dealt for towers you have on the board, and picks collect as chips in the top-left of the board (hover for details). Examples: **Overvolt** (Blasters +20% damage), **Forked Arcs** (+1 chain), **Overclock** (all towers +8% fire rate), **Precision Firmware** (hits ignore 2 armor), **Compound Interest** (6% of banked credits each wave), **Credit Cache** (+90 now), **Core Patch** (+3 integrity), **Deep Purge**, **Bastion Firewall**. The pool and its numbers live in `CARDS` in `src/config.js`; the sim's bots pick at random. To offset the power cards add, enemy HP is scaled by `HP_SCALE` (×1.12).

### Research (permanent)

Every run pays **Data**, win or lose: about 2 per wave cleared (a little more in later sectors), plus a win bonus of 18 + 6 per star, scaled by difficulty (Easy ×0.7 · Normal ×1 · Hard ×1.4 · Nightmare ×1.8). The win and loss screens show what you earned. Spend it in **Research** (button on the campaign screen) on 12 permanent upgrades in three branches; each node needs the one before it.

| Economy | Arsenal | Core |
|---|---|---|
| Seed Funds — +25 starting credits (30) | Calibrated Optics — towers +6% range (40) | Core Plating — +2 Core (40) |
| Salvage Protocols — sell refunds 80% (60) | Hardened Rounds — towers +6% damage (80) | Firewall Mk II — 15% faster, +1s (80) |
| Bounty Index — kills +8% credits (110) | Rapid Tooling — first upgrade 12% cheaper (130) | Purge Capacitor — 15% faster (130) |
| Venture Cache — caches deal 4 cards (170) | Cache Decryptor — reroll one cache per run (180) | Failsafe — once per run, survive a fatal breach at 1 Core and stun the board (200) |

The whole lab costs 1,250 Data — roughly twenty good Normal wins. Nodes and the payout formula live in `RESEARCH` and `dataEarned` in `src/config.js`. The bot sim runs without research, so the balance tables describe a fresh player.

### Campaign towers

Clearing certain sectors (any difficulty) adds a tower to your arsenal for every sector; until then its dock card is locked and its tooltip says what opens it. The campaign panel shows the reward, and the win screen announces it. `?unlock` opens them all.

| Tower | Unlocked by | Role | Level 2 → Level 3 |
|---|---|---|---|
| **Spike Lance** (key 5) | Clearing 03 · Cold Storage | Long-range sniper: instant, armor-piercing single hits | Long Barrel → Orbital Lance (marks +30% damage) / Executioner (deletes <25% HP) · Rapid Chamber → Ricochet (bounces ×2) / Disruptor (stuns, pops shields) |
| **Overclock Hub** (key 6) | Clearing 06 · Foundry | Support: towers in its field fire +20% faster (best hub per stat, no stacking) | Amplifier → Overdrive / Targeting Array (field ignores armor, exposes cloaked) · Wide Mesh → Credit Miner (+5 per 4s) / Static Field (slow + vuln) |
| **Logic Mines** (key 7) | Clearing 08 · Storm Front | Lays proximity mines on the bus in range, even between waves | Cluster Charges → Seed Nukes / Chain Reaction (+ burn) · Rapid Deploy → EMP Mines (stun, pop shields) / Tar Pits (slow) |

Check them against the base towers with `node tools/sim.mjs 4 sector-06 normal only-new` (adds lance/hub/mines bot builds next to the standard mix; `new` runs them alongside all strategies).

| Difficulty | Enemies | Enemy HP | Credits per kill | Core | Ramp starts at |
|---|---|---|---|---|---|
| **Easy** | −15% | −5% | +10% | 22 | — |
| **Normal** | up to +15% | up to +15% | −5% | 20 | 30% |
| **Hard** | up to +45% | up to +40% | −15% | 18 | 30% |
| **Nightmare** | up to +80% | up to +75% | −25% | 12 | 35% |

Bonuses above the base **ramp through the run**: each difficulty starts at its share of the bonus on wave 1 (Normal and Hard 30%, Nightmare 35%) and reaches the full value on the last wave, so the pressure lands in the late game, where fully upgraded towers are. Easy's reductions apply in full from the start. Extra enemies arrive in the same time window, so waves get denser rather than longer. Tune it all in `DIFFICULTIES` in `src/config.js`. All four tiers were raised after play-testing showed Nightmare could be 3-starred; at the same time the level-3 forms that out-scaled late waves were trimmed (see below).

### Medals and achievements

Each sector has **three medals**: optional challenges shown in the campaign detail panel and as three pips on the sector's node. Winning on **Normal or harder** awards every medal whose condition held for the whole run. Each new medal pays **+15 Data**, which is shown separately on the win screen. Medals stay earned; you can collect them across different runs. There are 30 in total. The challenge types (in `MEDALS` in `src/config.js`; each sector picks three and sets their numbers in `medals` in `src/maps.js`):

| Medal | Condition |
|---|---|
| **Flawless** | Win without losing any Core integrity (every sector has it) |
| **Lean Build** | Never have more than *N* towers on the board at once |
| **Specialist** | Build only *N* tower types |
| **Restraint** | Never evolve a tower to level 3 |
| **Unassisted** | Never use Firewall or System Purge |
| **Overclocked** | Call every wave early (the break timer never starts one for you) |

**Achievements** are 20 account-wide goals. Examples: First Contact, Leviathan Slayer, Full Arsenal, Clean Sweep (10 kills with one Purge), Exterminator (1,000 kills), Close Call, Second Chance (win after the Failsafe), Untouchable, Nightmare Warden, Grid Secured, Gilded (all 30 medals), Full Clearance (whole lab), Into the Void (Endless wave 25), Daily Driver (Dailies on 5 days) and Creature of Habit (a 5-day Daily streak). They unlock mid-run or on the result screen with a toast and a chime. The **★ Achievements** button on the campaign screen opens the gallery, where counter goals show a progress bar. Lifetime stats (kills, cards taken, tower types built, bosses, wins) are saved when a run ends, restarts or returns to the menu. Definitions are in `ACHIEVEMENTS` in `src/config.js`. Progress is saved in the browser under `voidwardens.medals`, `voidwardens.ach` and `voidwardens.stats`.

## Endless and Daily

Tabs at the top of the start screen switch between **Campaign**, **Endless** and **Daily**. Both new modes keep a **score** (shown in the HUD): every kill pays its base bounty ×10, each cleared wave 100 × its number, and calling a wave early 10 per second skipped. A Daily win adds 1,000 plus 150 per Core integrity left. Numbers are in `SCORE` in `src/config.js`. Both modes pay Data like a campaign run but don't award medals or campaign records.

**Endless** opens per sector once you've cleared it in the campaign, on any difficulty, and is played on the difficulty you pick. You play the sector's own waves, then it keeps going: "Into the void" marks the first wave past the campaign.
- **Generated waves:** each one reuses one of the sector's last 4 waves, cycling, so the timings still fit its routes. Each wave past the campaign adds 7% more malware in the same time window, and HP keeps following the sector's curve.
- **Adaptation:** past the campaign, malware gets 2% faster per wave (up to +50%) and 3% more resistant to slows, freezes, stuns and rollback (up to 60%). A pack of **Watchdogs** (2, plus 1 every 2 waves) joins every generated wave. The next-wave bar shows the speed bonus as `SPD +n%`.
- **Leviathans:** one arrives every 5th wave beyond the campaign, scaled up with the HP curve, and two arrive from the 10th.
- **Lock check:** `node tools/locktest.mjs sector-10 hard` buys one fully evolved build before wave 1, never adds to it, and reports the wave where the Core falls. A crowd-control build (Rollback + Absolute Zero) used to hold forever on Sectors 04 and 10. It now falls around waves 11–15, the same as a damage build.
- **Records:** waves are generated the same way for everyone. The best wave (and its score) is saved per sector and difficulty and shown on the sector node.
- **Tuning:** `ENDLESS` in `src/config.js`; the generator is `endlessWave` in `src/modes.js`.
- **Bot check:** `ENDLESS=1 node tools/sim.mjs 2 sector-01 easy`. Bots that survive the campaign usually fall between waves 15 and 40.

**Daily** is one challenge per calendar day (it rolls over at local midnight), picked from the date alone. Everyone gets the same sector, the same **twist** and the same card hands for the same picks. It's always played on Normal, with all 7 towers open and research switched off, so nobody has an edge from progress. Twists live in `MUTATORS`:

| Twist | Effect |
|---|---|
| Overclocked Malware | Malware +20% speed, kills +20% credits |
| Swarm Protocol | +40% malware, each −25% HP |
| Glass Core | Core integrity halved, towers +15% damage |
| Venture Capital | +250 starting credits, kills −25% credits |
| Data Surge | A data cache after every 2nd wave |
| Plated Payloads | Malware +1 armor, towers +10% range |
| Short Fuse | 8s breaks, early calls pay double |

You can replay the Daily as often as you like. The panel keeps today's best score, today's runs and your **streak** (days in a row with a finished Daily; a missed day resets it). The result screen's **Share score** makes a framed screenshot with the date, twist and score. Saved in the browser under `voidwardens.daily` and `voidwardens.endless.<sector>.<difficulty>`. Try a twist in the sim with `DAILY=glass node tools/sim.mjs 2 sector-04`.

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
| **ICE Node** (70) | Deep Freeze → **Absolute Zero** (freeze solid) / **Shatter** (+40% dmg taken) | Wide Field → **Rollback** (pushes enemies back, 3 times each) / **Hailstorm** (faster pulses + 3 ice shards) |
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

## Language

The game is in **English** and **Russian**. `?lang=ru` / `?lang=en` picks one for a visit (the Pixo site starts games this way, matching the site language). Otherwise the **EN · RU** switch at the top right of the start screen decides, and it's remembered in the browser (`voidwardens.lang`). Without either, the game follows the Pixo site's own choice (`pixo-lang`, when it's served from the same origin) and falls back to English.

Everything lives in `src/i18n.js`. English is the source text: UI code passes its strings through `t()` (`t('Wave {n}', { n: 3 })`), which looks them up in the Russian table and falls back to the English text. Game data — towers and their upgrades, malware, sectors, rules, twists, cards, research, medals, achievements — is translated in place by id when the module loads, so code that shows a name needs no change. Russian counts use proper plurals (`count()`: 1 волна, 2 волны, 5 волн; malware nouns via `enemyNoun()`).

**Adding a string:** wrap it in `t()` and add the English → Russian line to `RU` in `src/i18n.js`. **Adding content** (a tower, card, sector…): add its Russian name and description under `RU_DATA` by id; anything missing just shows in English.

Cyrillic display text uses **Exo 2** (Chakra Petch has no Cyrillic); the font stack falls back to it per glyph, so Latin text and the logo stay in Chakra Petch. Hotkeys work on a Russian keyboard layout too (they fall back to the physical key).

## Code map

```
index.html        page shell + HUD markup
css/style.css     all UI styling (HUD, dock, tower panel, banners, overlays)
src/config.js     ← tuning: economy, enemies, towers & upgrade trees
src/maps.js       ← sectors: routes, waves, starting credits, HP curve
src/map.js        path math (multi-path), buildable tiles
src/game.js       simulation (no DOM): waves, targeting, attacks, damage, status effects
src/tutorial.js   Training: the step-by-step coach, its spotlights and conditions
src/modes.js      Endless wave generator, Daily seed (sector + twist), seeded PRNG
src/fx.js         particle / ring / beam / lightning state
src/render.js     procedural canvas art (palette in PAL at the top): grid, bus, towers, enemies, effects
src/ui.js         DOM HUD, dock, evolution panel, banners
src/i18n.js       language pick, t() and the Russian translation (UI strings + game data)
src/audio.js      WebAudio-synthesized sound effects
src/music.js      adaptive procedural synthwave soundtrack
tools/sim.mjs     headless balance simulator (bots play the real logic; `cc` = Rollback/Absolute Zero bot)
tools/locktest.mjs fixed late-game build vs Endless: finds where it breaks
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
