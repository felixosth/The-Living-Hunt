# The Living Hunt — Roadmap

*Version 0.1. The order in which we build [the design](GAME_DESIGN.md) on top of [the technical plan](TECHNICAL_PLAN.md).*

## Strategy

1. **Find the fun first, in the smallest possible space.** The biggest risk isn't the economy or the ecosystem. It's whether *reading tracks and stalking in a top-down browser game* feels good. M1 answers that question before anything else is built.
2. **Build the world outwards from the player.** One animal → one region → the valley → a settlement → rivals and legends → trade.
3. **Every milestone ends playable** and deployed to GitHub Pages, with a **fun gate**: a concrete question we answer by playing. If the answer is "no", we iterate before moving on.
4. **Tools come before content.** The god view, the simulation inspector and the headless runner are built before the systems they debug.

---

## Milestones

### M0 — Foundations

*The empty but solid skeleton.*

- Vite + TypeScript + PixiJS + Preact project, Biome, Vitest, GitHub Actions and Pages deployment.
- Fixed-timestep loop (10 Hz simulation, interpolated rendering), calendar and day length, seeded PRNG streams.
- The `step(state, commands, dt)` boundary, snapshot publishing and a lint rule for simulation purity.
- Save/load (IndexedDB + gzip) with a version field.
- Debug panel shell and headless runner shell (`npm run sim`).

**Done when:** the deployed page shows a player moving on a test map, a save/load round-trip test passes, and the simulation runs in Node.

**Status: built.** The save/load round trip and headless simulation are covered by tests in CI, and a browser smoke test checks that the player walks on the built page. The public page goes live once GitHub Pages is enabled and `main` exists (see the README). A generated 512 × 512 m test forest, a 63° N calendar and sun, a placeholder hourly wind, save/load with migrations, the debug panel and the headless runner are in place. See the [README](../README.md) for how to run it.

---

### M1 — "Tracks in the mud" (the fun prototype)

*One region, roe deer and hares, one bow. Nothing else.*

- A generated forest region: meadow, stream, mud banks, thickets, game trails. Day and night.
- Player gaits, noise by ground type, cover and visibility. Wind with a scent cone.
- Roe deer AI: daily routine (bed → feed → drink), awareness states, snort alarm, fleeing, herd behaviour. Hares on their runs.
- Signs: prints, pellets, beds, browse. Decay. **Scan**, **inspect** (fuzzy readings from knowledge) and **follow**.
- The bow, the **shot inset** with angles and hit zones, blood types, wounded behaviour, blood trails.
- Field dressing, carry weight, a "return to cabin" hunt summary.
- God view: agents, awareness, scent cone, signs.

**Fun gate:** going from *first sign found* to *animal recovered* takes 10–20 minutes, and you want to do it again. Wind and stealth decisions clearly matter. There are at least three distinct ways to fail a hunt, and they all feel fair.

**Status: done; the fun gate passed.** Everything above is in, built in four playable steps and tuned over seven rounds of playtesting (see the [M1 plan](M1_PLAN.md)). Tracking, stalking and the shot feel good, and every way to fail has a visible cause: the wind is drawn on the map, the aim sways and settles, a deer on edge can jump the string, and every miss says why. Tests cover routines, senses, sign readings (property-tested to always contain the truth), trail following, the shot and a full hunt from shot to cabin.

---

### M2 — "The weather turns" (a living region)

- Weather: temperature, rain, snow (depth, crust), fog and wind changes. Autumn into winter. Thermals.
- Weather affects signs (erosion, burial, fresh-snow clarity), noise and animal behaviour.
- **Fox and wolf pack.** Predation at the micro level (chases, kills, carcasses), scavenging, **ravens** circling carcasses. Alarm calls (jays).
- **Traps:** snare, foothold, deadfall; bait; checking, spoiled catches, stolen catches.
- **Knowledge v1:** species and sign-literacy tracks, learning by confirmation, journal v1 (bestiary, map pins, auto-notes).
- Danger: wolf aggression when cornered or starving, injuries, warmth, camping and fire.

**Status: planned** (see the [M2 plan](M2_PLAN.md)).

**Fun gate:** the first snowfall visibly changes how you hunt. A trap line is a viable alternative to stalking. Your readings get noticeably better over one session.

---

### M3 — "The valley breathes" (the macro world)

- A region graph with **Hagmarken, Granåsen, Svartmyren**. The valley map and travel.
- The macro population model: food, predation (Holling III), births, mortality, migration, immigration, pressure and wariness.
- Farms and **livestock** in Hagmarken as predator targets.
- **Materialise, catch up, reconcile** between the macro and micro levels.
- **The chronicle** with causal links.
- Headless runner with the HTML report, a long-run balance job in nightly CI, and the `harsh-winter` scenario.

**Done when:** 20-year runs over 50 seeds meet the stability targets, and the first half of the harsh-winter chain (deer ↓ → wolves at the farms → livestock losses ↑) passes as a test.

---

### M4 — "Ravnholm" (settlement and economy)

- The **Ravnholm hub**: notice board, tavern, merchant, tanner, butcher, council, your cabin (storage, workbench, bed).
- Goods, stockpiles, households, tanner and butcher production chains, pricing with per-unit recomputation, merchant cash, the Saltvik anchor.
- Selling and buying, spoilage, storage, pelt and meat grading.
- **Contracts from needs** (predator problem, supply order, cull), the **Cases** UI, payment on proof or outcome, **NPC beliefs that can be wrong**.
- **Rumours v1**, **"Ask why…"**, and the ledger of prices you've witnessed.
- **The opening:** Einar's cabin, his journal as the tutorial voice, the Midwinter tax.

**Fun gate:** the full harsh-winter chain passes, including prices and bounties. A new player can pay the Midwinter tax through at least two clearly different strategies (trapping, stalking or contracts). The "wrong wolf" story can happen.

---

### M5 — "Rivals and legends"

- **NPC hunters** (Sigrid, the Brandt brothers, Old Mattias): expected-value planning, macro-level hunts, materialised encounters, their prints and traps, market impact, teaching.
- **Legends:** promotion, marks (including distinctive prints), traits, naming, reputation, rising bounties, journal pages.
- **Reputation** per settlement. Wolf pack splits after the leader dies.
- New species: **lynx, moose, brown bear** (hibernation), **wolverine**.

**Fun gate:** in a typical two-season playthrough, at least one legend emerges without scripting, and NPC hunters visibly move prices (the pelt crash).

---

### M6 — "The iron road"

- **Järnbro** (smith, mine, smelter, fur trader, apothecary), **Älvstråket** (the road and **the ford**) and **Kallfjället** (the fell).
- **Caravans**, route conditions, flooding, the iron chain (so trap and arrowhead prices follow the iron supply).
- Storage and speculation. **Selling information** (scouting reports).
- Real **forecasting** from the pre-generated weather buffer, with forecasters of different accuracy.
- **Beaver** (dams reshape the mire) and the **lindworm**.

**Fun gate:** the heavy-rain chain passes as a test, and a player can deliberately profit from predicting a shortage.

---

### M7 — Vertical slice polish (v0.1)

- Art pass (painterly-flat vector, notebook UI), audio pass (ambience as gameplay).
- Onboarding through Einar's journal. Settings, key remapping, accessibility, difficulty presets.
- Performance pass against the budgets. Save migrations and fixtures.
- Balance from playtests. Bug bash.
- The optional **Einar's last trail** thread, built from placed initial conditions.

**Done when:** it offers 3–5 hours of engaging play, and outside playtesters can each retell at least one unscripted story.

---

## v0.1 content scope (frozen)

| Category | Content |
|---|---|
| Settlements | Ravnholm, Järnbro (+ off-map Saltvik) |
| Regions | Hagmarken, Granåsen, Svartmyren, Älvstråket, Kallfjället |
| Species | Mountain hare, roe deer, red fox, wolf, lynx, moose, brown bear, wolverine, beaver, lindworm, raven (signal), sheep and cattle |
| NPC hunters | Sigrid Halvorsdotter, the Brandt brothers, Old Mattias |
| Weapons and tools | Bow, crossbow, boar spear, knife, snare, foothold trap, deadfall, calls (grunt, predator, howl), lantern, snowshoes, sled, pack frame, white smock |
| Goods | About 20 (see the design document, §9.1) |
| Contract types | Predator problem, supply order, cull, specimen, scouting, search |

Anything not in this table waits for the backlog.

## Post-v0.1 backlog

- Hunting dog companion (tracks blood trails, but can spook game and can be killed by wolves)
- Hunting laws, seasons and quotas, a game warden, poaching
- The flintlock (a loud trade-off weapon), moon-phase night hunting, skis
- Ice fishing and fishing; a deeper herbalism system
- More monsters (a troll-like nocturnal giant, the *näck* as a rumour); the **skvader** (real or fake?)
- A "sketch" photo mode that draws a scene into the journal
- JSON modding, a Web Worker simulation, a Tauri build for Steam

---

## Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| **Tracking isn't fun in top-down 2D** | It's the core fantasy | M1 is a dedicated fun prototype. Scan instead of pixel-hunting. Strong visual and sound cues |
| **Emergence nobody notices** | A simulation nobody sees is wasted | "Ask why…", rumours, the chronicle, cases and journal auto-notes make causes visible through characters |
| **Unstable ecosystem or economy** (extinctions, runaway prices) | It breaks the world | Holling III predation, immigration, the Saltvik anchor, price clamps, smoothing, long-run balance tests in CI |
| **Scope creep** | The classic killer of systemic games | Frozen v0.1 scope table. Depth through connections, not content |
| **Browser performance** (agents, signs, catch-up) | Stutter ruins stealth | Budgets, level of detail, pruning, coarse catch-up, an optional Web Worker |
| **Save breakage across updates** | Long campaigns | Versioned saves, a migration chain, fixture tests |
| **The player breaks the market** | Exploits kill tension | Per-unit pricing, merchant cash, caravan arbitrage. Some market play is intended |
| **Information overload** | Too many systems at once | Staged onboarding through Einar's journal. Knowledge gates how much detail is shown |

---

## Where to start

M0 and M1 are done. Next is **M2**, starting with weather and snow (see the [M2 plan](M2_PLAN.md)).
