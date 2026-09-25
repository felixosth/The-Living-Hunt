# The Living Hunt — Technical Plan

*Version 0.1. How we build the game described in [GAME_DESIGN.md](GAME_DESIGN.md) as a browser game.*

---

## 1. Goals and constraints

- **Runs in a desktop browser** (Chrome, Firefox, Edge, Safari) on a mid-range laptop at 60 fps and 1080p. No install. Can be wrapped for Steam later.
- **Simulation first.** The simulation is the product. Rendering and UI are thin views of it.
- **Deterministic.** The same seed plus the same player commands gives the same world. This makes bugs reproducible, balance runs meaningful and saves trustworthy.
- **Headless.** The whole simulation runs in Node without a browser, so we can run 20 simulated years in seconds to balance the ecosystem and economy.
- **Save anywhere**, with versioned saves that survive updates.

---

## 2. Technology stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | A large, data-heavy simulation needs types |
| Build and dev server | **Vite** | Instant reload, minimal configuration |
| Rendering | **PixiJS v8** | Fast 2D on WebGL/WebGPU with sprites, particles and render textures. It only renders, so it doesn't impose a game-object model on our simulation |
| UI | **Preact + @preact/signals** | The journal, hub, ledger and dialogues are text-heavy UIs. The DOM gives us text layout, scrolling and accessibility for free, in about 4 kB |
| Audio | **Howler.js** | Cross-browser playback, stereo panning, audio sprites |
| Map generation noise | **simplex-noise** | Terrain, moisture, vegetation |
| Persistence | **IndexedDB** (via `idb-keyval`) + native `CompressionStream` (gzip) | Large asynchronous saves |
| Debug charts | **uPlot** | Tiny, fast time-series charts for population and price inspectors |
| Tests | **Vitest**, **fast-check**, **Playwright** | Unit, property-based and browser smoke tests |
| Lint and format | **Biome** | One fast tool |
| Headless runs | **tsx** on Node | Runs `src/sim` outside the browser |
| CI/CD | **GitHub Actions → GitHub Pages** | Every push to `main` becomes playable at a URL |

**Why not Phaser or a full engine?** Phaser brings its own scene, physics and game-object model, and our game object model *is* the simulation. PixiJS gives us rendering and nothing else. **Why not a Unity or Godot web export?** Heavier downloads, awkward DOM UI, and you asked for a browser game. Web-native TypeScript is the most direct route.

---

## 3. Architecture

```
┌─────────────────────────── browser ────────────────────────────┐
│                                                                │
│  UI (Preact) ──┐                         ┌──▶ UI (Preact)      │
│  Field input ──┴──▶ commands  snapshots ─┴──▶ Render (Pixi)    │
│                        │          ▲                            │
│                        ▼          │                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ SIM CORE — pure TypeScript, deterministic                │  │
│  │ step(state, commands, dt) → new state + events           │  │
│  │ weather · ecology · local agents · signs · hunting       │  │
│  │ economy · society · legends · chronicle (causal log)     │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────▲───────────────────────────────┘
                                 │
   Node: tools/sim-runner and tests run the same sim core, no browser
```

### Hard rules

1. **`src/sim` imports nothing from `render`, `ui`, `audio` or any browser API.** A lint rule enforces this.
2. **All randomness comes from seeded PRNG streams stored in the world state.** Never `Math.random()` in the simulation.
3. **The simulation only changes through `step(state, commands, dt)`.** Player actions are *commands*. The simulation validates them and applies them.
4. **World state is plain serialisable data**: records, arrays and typed arrays. There are no class instances holding hidden state and no closures. Systems are functions over data.
5. **Content is data.** Species, goods, recipes, regions, NPCs and scenarios live in typed files in `src/content`.
6. **Every notable change emits a chronicle event with its causes** (see §7). Rumours, contracts, legends, "Ask why…" and the debugger all read from the chronicle.

With the command/snapshot boundary in place, the simulation can move into a **Web Worker** later (via Comlink) without rewriting any systems.

---

## 4. Two-scale simulation

The world is simulated at two levels of detail. This is the key technical idea.

### 4.1 Macro level (always running, the whole valley)

Each region has **population numbers** (fractional, split into juveniles and adults, with an average condition), food supplies, snow and wetness, and hunting pressure. Settlements have stockpiles and prices, and caravans have positions on routes. This updates every game day (weather hourly). It's cheap: a year of the whole valley runs in milliseconds.

### 4.2 Micro level (only the region the player is in)

When the player enters a region, its populations are **materialised** into individual agents with positions, home ranges, needs, awareness and memories. Signs, traps and carcasses exist only at this level.

- **Enter a region:**
  1. If it was visited within the last **48 game hours**, restore the frozen local state and **catch up**: fast-forward the agents from `simulatedUntil` to now in coarse steps (5 game minutes) with simplified AI. They lay down signs as they go.
  2. Otherwise, **reseed** the agents from the macro counts using stochastic rounding. Legends and marked animals are always kept. Then fast-forward 48 h of *history*, so that the tracks, beds and scat you find on arrival are the real record of those animals.
- **While present:** micro deaths (kills, trap catches, predation) and births are written back to the macro counts immediately.
- **Leave a region:** freeze the local state with a timestamp. The macro level becomes authoritative again. If the macro level changes the population while you're away (predation, migration), the next visit reconciles it by removing or adding anonymous agents.
- **Named individuals (legends)** are always persisted. When away, a coarse daily routine updates their position and state.

The cost is modest: 150 agents × 576 catch-up steps is about 90 k cheap agent updates, which takes a few hundred milliseconds behind a short "arriving…" transition.

---

## 5. Time and ticks

| Clock | Rate | Work |
|---|---|---|
| Render | Display rate (60 Hz) | Interpolation, effects, UI snapshot |
| Micro simulation | Fixed **10 Hz** real time (6 game seconds at 1×) | Agents near the player, perception, signs, shots, traps |
| Micro level of detail | 1 Hz | Agents more than 300 m from the player (simplified movement) |
| Hourly | Every game hour | Apply weather, batch sign decay, spoilage, warmth |
| Daily | Game midnight | Ecology, economy, caravans, contracts, NPC hunters, rumour spread, legends |

**Fast-forward** (waiting, ×10 or ×60) raises the micro `dt` up to 60 game seconds per step with a step budget per frame. Sleeping or travelling uses the *macro plus coarse local* mode. Waiting stops automatically on any sighting, sound or notable event.

**Calendar:** 84-day years (4 × 21). Day length follows the season for about 63° N (about 5 h of daylight at midwinter). Moon phase runs on a 21-day cycle.

---

## 6. Determinism and randomness

- **PRNG:** `sfc32`, with state stored in `WorldState.rng`.
- **Named streams:** `weather`, `ecology`, `economy`, `society`, `ai`, `signs`, `combat`, `mapgen`. Adding a random call to the AI never changes the weather sequence.
- **Derived seeds** for anything reproducible by identity. Map generation uses `hash(worldSeed, regionId)`. A sign reading uses `hash(signId, knowledgeLevel)`, so reading the same print twice gives the same answer until your knowledge changes.
- **Determinism tests:** the same seed and command log must produce the same state hash. Running N days, saving, loading and running M more must equal running N + M days directly.
- Cross-engine floating-point differences (such as `Math.sin` across browsers) only matter for replays shared between machines. They're a non-goal for v0.1; tests run on Node.

---

## 7. The chronicle (causal event log)

Every notable change is recorded as an event:

```ts
interface ChronicleEvent {
  id: EventId;
  t: GameTime;
  kind: string;                 // 'LivestockKilled' | 'FordFlooded' | 'PriceRose' | 'LegendNamed' | …
  where: PlaceRef;              // region, settlement or route
  actors: EntityRef[];          // animals, NPCs, player, caravans
  data: Record<string, number | string>;
  causes: EventId[];            // what led to this — enables "Ask why…"
  salience: number;             // how newsworthy (drives rumour spread)
  knownBy: NpcId[];             // who knows it first-hand
}
```

Systems record their *causes* when they cross a threshold. The ford closes *because of* `RiverRose`, which happened *because of* `HeavyRain` × 3 days. The caravan is delayed *because of* `FordFlooded`. The iron price rises *because of* `StockLow(iron)` *because of* `CaravanDelayed`. Continuous changes, such as prices, record their dominant driver when they move past a threshold.

Consumers:

- **Ask why…** walks back up the cause graph, only through events the NPC knows (first-hand or via rumour), and renders the chain as dialogue.
- **Rumours** spread high-salience events between NPCs (§10.3).
- **Contracts and legends** are triggered by patterns of events.
- **The journal** records what the player witnessed.
- **The debugger** shows the full causal graph.

The chronicle is a bounded ring buffer. Events that are important long-term (legends, disasters) are archived as summaries.

---

## 8. Core data model (sketch)

```ts
interface WorldState {
  version: number;
  seed: number;
  rng: Record<RngStream, RngState>;
  time: GameTime;                                   // game minutes since start
  weather: WeatherState;                            // current + 7-day pre-generated buffer
  regions: Record<RegionId, RegionState>;
  settlements: Record<SettlementId, SettlementState>;
  routes: Record<RouteId, RouteState>;              // condition, open/closed, travel time
  caravans: CaravanState[];
  npcs: Record<NpcId, NpcState>;                    // beliefs, needs, relationships, rumours held
  hunters: Record<NpcId, HunterState>;              // NPC hunters: skills, plan, inventory
  legends: Record<AnimalId, LegendState>;
  contracts: Record<ContractId, ContractState>;
  chronicle: ChronicleState;
  player: PlayerState;                              // inventory, knowledge, skills, body, journal
}

interface RegionState {
  id: RegionId;
  food: Record<ForageType, number>;                 // kg of biomass available
  snowDepthCm: number;
  groundWetness: number;                            // 0..1
  populations: Record<SpeciesId, Population>;
  pressure: number;                                 // recent hunting pressure → wariness
  local?: LocalRegionState;                         // present once materialised
}

interface Population { juveniles: number; adults: number; condition: number } // fractional

interface LocalRegionState {
  simulatedUntil: GameTime;
  animals: AnimalAgent[];
  signs: SignStore;                                 // columnar typed arrays + spatial hash
  scentGrid: Float32Array;                          // 8 m cells, decaying ground scent
  traps: Trap[];
  carcasses: Carcass[];
}

interface AnimalAgent {
  id: AnimalId; species: SpeciesId; sex: 'f' | 'm'; ageDays: number; weightKg: number;
  x: number; y: number; heading: number; speed: number;
  home: { cx: number; cy: number; radius: number; pois: PoiId[] };
  needs: { hunger: number; thirst: number; rest: number; fear: number };
  activity: Activity; awareness: Awareness; target?: EntityRef;
  injuries: Injury[]; marks: Mark[]; traits: Trait[];
  memory: { dangerSpots: DangerMemory[]; knowsPlayerScent: number };
  groupId?: GroupId;                                // herd or pack
}

interface Sign {
  id: SignId; kind: SignKind; x: number; y: number; t: GameTime;
  species: SpeciesId; animalId?: AnimalId;
  facts: {                                          // the TRUTH, recorded at creation
    weightKg?: number; gait?: Gait; heading?: number;
    injury?: InjuryKind; hitZone?: HitZone; groupSize?: number;
  };
  integrity: number;                                // 1 → 0 with weather and substrate
}

interface Reading {                                 // what the player learns from a Sign
  species:  Fuzzy<SpeciesId>;                       // may be a confusion set with confidences
  age:      Fuzzy<Range>;                           // hours
  weightKg: Fuzzy<Range>;
  gait?: Fuzzy<Gait>; heading?: Fuzzy<number>; injury?: Fuzzy<InjuryKind>;
  individual?: Fuzzy<AnimalId>;                     // only with high knowledge + distinctive marks
}
type Fuzzy<T> = { kind: 'unknown' } | { kind: 'guess'; value: T; confidence: number };

type Command =
  | { type: 'move'; dir: Vec2; gait: Gait }
  | { type: 'scan' }
  | { type: 'inspect'; target: EntityRef }
  | { type: 'follow'; signId: SignId }
  | { type: 'draw' } | { type: 'holdBreath' } | { type: 'release' }
  | { type: 'placeTrap'; trap: TrapKind; at: Vec2; bait?: GoodId }
  | { type: 'butcher'; carcassId: CarcassId; action: 'dress' | 'skin' | 'quarter' }
  | { type: 'wait'; until: WaitCondition }
  | { type: 'travel'; to: PlaceRef }
  | { type: 'trade'; at: SettlementId; good: GoodId; qty: number; side: 'buy' | 'sell' }
  | { type: 'contract'; id: ContractId; action: 'accept' | 'deliver' | 'abandon' }
  | { type: 'askWhy'; npc: NpcId; subject: Subject }
  | { type: 'writeNote'; at?: Vec2; text: string };
```

**Reading function:** `readSign(sign, knowledge, now) → Reading`. It is deterministic (seeded by sign and knowledge level). Ranges narrow and confidence rises as knowledge grows. Species confusion only happens within defined **confusion groups** (canids, deer, felids…). A property test guarantees that any field shown with high confidence contains the true value.

---

## 9. Ecology model (macro, daily, per region)

Start simple and stable, then tune with the headless runner.

- **Food:** each forage type regrows logistically towards a seasonal capacity, scaled by temperature and moisture. Snow depth lowers *accessibility* by species (moose reach browse above deep snow; roe deer and hares struggle).
- **Herbivore intake and condition:**
  `intake = min(need·N, share·F_accessible)`
  `condition += α·(intake/(need·N) − 1) − β·coldCost(temp, snow)`
- **Predation (Holling type III, which keeps prey from being eaten to zero):**
  `kills(p,s) = a·N_p·(v_s·N_s)² / (1 + a·h·(v_s·N_s)²)`
  Here `v_s` is vulnerability, which rises with low condition and deep snow. Predators split their effort by preference × availability, and **livestock** in farm regions is an option weighted by how well it's guarded (fences, shepherds, winter barns).
- **Births:** one seasonal pulse per species, `females × litter × f(condition)`.
- **Mortality:** a baseline rate, plus starvation below a critical condition, plus age.
- **Migration:** a daily fraction moves along the region graph, following the difference in *attractiveness* (food per head, shelter, predation risk and hunting pressure for prey; prey density including livestock for predators).
- **Immigration from beyond the valley:** a small inflow into edge regions when numbers are below capacity. This prevents permanent extinction without hiding the player's impact.
- **Pressure and wariness:** hunting pressure raises a regional wariness (detection ranges, a shift to night activity) that decays over weeks.
- **Pack dynamics:** losing a wolf pack's leader can split the pack into smaller groups with higher hunger and more boldness.

**Stability targets** (checked by long-run tests): over 20 years without the player, no species below 10 % of its initial numbers for more than a season in more than 5 % of seeds, and predator–prey swings bounded.

---

## 10. World systems

### 10.1 Weather

- A seasonal climate normal (temperature, chance of precipitation, wind) plus multi-day **fronts** plus AR(1) daily anomalies, with an hourly temperature curve.
- Regional modifiers: an elevation lapse rate (about −0.65 °C per 100 m), wind exposure on the fell, fog tendency in the mire.
- Derived state: snow depth (accumulation, compaction, melt), a **crust** flag (a thaw followed by a freeze), ground wetness, river level (from precipitation plus snowmelt, with a lag) and **ford status**.
- **Thermals:** in winds below about 2 m/s, the local air-flow direction follows the terrain slope and the time of day.
- **A pre-generated 7-day buffer** means forecasts are genuine: a forecaster samples the buffer and adds error that grows with days ahead and shrinks with skill. Einar's almanac, the old farmer, the sky and the barometer are forecasters with different accuracy.

### 10.2 Economy (daily, per settlement)

- **Goods registry:** base value, weight, perishability (a spoilage half-life that depends on temperature) and substitute group (for example, the meats are partly interchangeable).
- **Households** (aggregated per settlement) consume per-head needs × seasonal factors (fuel, fur and medicine rise in winter).
- **Craftspeople** run recipes when they have the inputs *and* a positive margin, and they post supply orders when an input runs low.
- **Pricing:**
  `coverDays = stock / demandPerDay`
  `target = ref × clamp((targetDays / coverDays)^ε, 0.25, 4)`
  `price += λ·(target − price)` (smoothing)
  The merchant buys at `price·(1 − spread)` and sells at `price·(1 + spread)`. **The price is recomputed per unit within a transaction**, so dumping ten pelts visibly drives the price down. Merchants have finite **cash**.
- **Caravans** plan loads by comparing local prices with Saltvik's price minus transport cost. Travel time depends on route conditions. Closed routes block them.
- **Saltvik** (the coast) follows a seasonal price curve with a slow drift. **This is the only deliberately exogenous input** to the economy, and it's documented as such.

### 10.3 Society

- **NPCs** have needs, which create *pressure*. When pressure crosses a threshold, they post a **contract** whose reward is derived from the economic loss they expect, capped by their savings. NPCs hold **beliefs** (for example, "the culprit is a wolf") formed from their own low-skill sign reading, so they can be wrong.
- **Contract resolution:** *proof* (a matching pelt or trophy, verified against the true culprit ID when the contract names an individual) or *outcome* (no related events for N days).
- **NPC hunters:** each morning they score their options (contracts, market opportunities, rest) by expected value *using their own beliefs*, then commit to a multi-day plan. Hunts resolve at the macro level (success chance from skill, density, weather and wariness) unless the player is in the same region, in which case the hunter is materialised as an agent that leaves boot prints and sets traps.
- **Rumours:** high-salience events become news known to the witnesses. At social hubs (the tavern, the merchant), NPCs pass on a few items per day. Each hop may **distort** the rumour (numbers inflate, species swap within confusion groups, places blur to the region) and adds age. The player hears the rumours held by the NPCs they talk to, with source, hops and date.
- **Reputation:** per settlement, moved by deeds recorded in the chronicle (clean kills, waste, deliveries, correct and incorrect case outcomes).

### 10.4 Legends

- **Promotion rules** read the chronicle (survived a wound, repeated escapes, repeated livestock kills, exceptional size or age…). A promoted agent gets persistent storage, **marks** (which change the facts recorded in its signs, such as an asymmetric stride or a missing toe) and **traits** (which change its AI parameters).
- **Naming** uses templates driven by marks and deeds, chosen by the villagers who first spread the story.
- **Off-map life:** when the player is elsewhere, a coarse daily routine keeps its territory, condition and deeds updated.

---

## 11. Micro level: agents and signs

### 11.1 Animal AI

- **Utility-based activity selection:** feed, drink, rest, travel, socialise, flee, hunt, scavenge, den. Each is scored from needs × the species' activity curve (time of day, season) × safety.
- **Execution:** steering along paths on a navigation grid. Terrain costs make animals prefer **game trails**, so trails are where trap sets work.
- **Pathfinding:** A* on the 2 m tile grid (hierarchical if needed) for travel. A **flee flow field** away from threats for escape.
- **Perception:** only for agents within about 150 m of the player (or of another relevant agent).
  - *Sight:* field-of-view cone, line of sight ray-marched through vegetation density, player visibility.
  - *Hearing:* noise events with a radius, masked by wind and rain.
  - *Smell:* wind cone test, plus a ground **scent grid** (8 m cells, decays over time, washed by rain) for trails.
- **Awareness:** a meter per agent with hysteresis, so animals move through Unaware → Suspicious → Alarmed → Flee/Aggressive. Alarm propagates through herds and packs and via alarm calls.
- **Groups:** herds (follow the leader, shared alarm) and packs (the leader picks a target and members pursue). A simple chase model covers speed, stamina and snow penalties.
- **Level of detail:** agents more than 300 m away update at 1 Hz with simplified movement.

### 11.2 Signs

- **Emission:** strides lay prints with a probability based on how soft the ground is (mud > snow > soil > rock) and on gait. Scat, beds, browse, blood, hair and kills are emitted by the matching actions. Each sign stores the *true* facts at the moment of creation.
- **Storage:** columnar typed arrays with a spatial hash (16 m cells). Up to about 30 k signs per region. Signs with integrity below 0.05 are pruned, oldest first.
- **Decay:** `integrity -= baseDecay(kind, substrate)·dt + rainRate·erosion(kind)·dt`. New snowfall deeper than the print buries it.
- **Scan:** queries the spatial hash within a radius. The chance of detecting each sign depends on integrity, how obvious the sign kind is, light, perception and knowledge. Found signs become *noticed* and are drawn as decals.

### 11.3 Shots, wounds and carcasses

- The reticle radius is a function of weapon, distance, movement, fatigue, cold and breath-hold time. The hit point is sampled on a per-species **2D side-profile hit map** rotated to the current relative angle, with zones for heart, lungs, liver, gut, bone, leg and neck/head.
- Wounds set bleed rate, mobility, time to death and blood-sign type on the agent. Pushing a wounded animal (by approaching it) raises its flight distance.
- Carcasses track time of death, temperature history (spoilage), damage and scavenging.

---

## 12. Map generation

- **Region recipes** (authored and small): biome mix, elevation profile, river and stream control points, road path, landmarks (the ford, farms, dens, the beaver pond, basking rocks), and counts of points of interest.
- **Generation** (deterministic from `hash(worldSeed, regionId)`): simplex noise for elevation and moisture → biome → vegetation density and ground type. Trees and rocks are placed by Poisson disk. Rivers are carved along splines, a navigation grid is computed, and **game trails** are grown by repeatedly pathfinding between points of interest with a "wear" bonus, so paths consolidate into natural-looking trails.
- **Only dynamic layers are saved** (snow, wetness, trampling, player structures, trap sites). Static terrain is regenerated from the seed.

---

## 13. Rendering (PixiJS)

Layers from bottom to top:

1. **Ground chunks:** 64 × 64-tile render textures, rebaked when snow or wetness changes noticeably.
2. **Sign decals:** noticed signs, with alpha tied to integrity.
3. **Objects:** trees, rocks and logs, sorted by y. A tree canopy fades when the player is under it.
4. **Agents:** animals, the player, NPC hunters. Positions are interpolated between simulation ticks.
5. **Weather effects:** rain and snow particles, drifting fog, wind-driven grass sway and floating seeds.
6. **Lighting:** a day/night tint plus additive light sources (lantern, fire). Moonlight on snow brightens nights.
7. **Vision mask:** a line-of-sight polygon from the player. Outside it, remembered terrain is desaturated and there are no agents.
8. **World-space UI:** awareness eyes, sound arcs, the reticle.

The shot inset and the HUD are DOM (Preact) layered over the canvas.

---

## 14. UI (Preact)

- Screens: **Hub** (settlement), **Valley map**, **Field HUD**, **Journal** (cases, bestiary, map, ledger, almanac, rumours, legends), and dialogues.
- The simulation publishes a **read-only snapshot** each tick. The UI subscribes through signals to the slices it shows.
- Notebook styling in CSS, hand-drawn SVG charts for the ledger, and ink sketches for prints.

---

## 15. Saves

- `WorldState` → JSON (typed arrays as base64) → gzip via `CompressionStream` → IndexedDB. Several slots, an **autosave** on sleeping and on entering a settlement, and **export/import** to a file.
- A `version` field with a chain of migration functions. A test loads every archived save fixture.
- Budget: 2 MB or less compressed.

---

## 16. Developer tooling (built early, used daily)

- **Debug panel (the `` ` `` key, since M0):** performance, time controls (pause, 1×, 10×, 60×), quicksave/quickload, save export/import, new world by seed, state hash. The tools below grow out of it.
- **God view:** all agents, awareness meters, scent cones and the scent grid, sign heatmap, navigation grid, points of interest, game trails.
- **Simulation inspector:** populations and prices over time (uPlot), a chronicle browser with the cause graph, and time controls up to ×10 000 (skip weeks).
- **Scenarios:** named starting states (`default`, `harsh-winter`, `wet-spring`, `wolf-crisis`…) that can be loaded from a menu or a URL parameter.
- **Headless runner:**
  ```
  npm run sim -- --seed 42 --years 20 --scenario default --out out/run-42
  npm run sim:batch -- --seeds 1..50 --years 20
  ```
  Writes CSV files and a self-contained HTML report (populations by region, prices by settlement, contracts, caravan delays, notable events).

---

## 17. Testing strategy

| Layer | What | Where |
|---|---|---|
| Unit | PRNG, calendar and day length, pricing, decay, `readSign`, shot sampling, pathfinding | Vitest, every commit |
| Property | Populations never negative; prices in bounds; high-confidence readings contain the truth; stable save round-trip | fast-check, every commit |
| Determinism | Same seed + commands → same state hash; save/load mid-run gives identical results | Every commit |
| **Causal chains** | The pitch's examples as acceptance tests (below) | Every commit (short) and nightly (long) |
| Long-run balance | 20 years × 50 seeds: stability targets, price bounds, no NaN | Nightly, uploads the HTML report |
| Browser smoke | Boot, new game, walk, scan, open journal, save, reload | Playwright, every commit |

**Causal-chain acceptance tests** turn the pitch into assertions:

1. **Harsh winter** (the `harsh-winter` scenario): roe deer numbers and condition fall → wolf presence in Hagmarken rises → livestock losses rise → meat and leather prices rise in Ravnholm → a predator contract is posted → NPC hunters take it → the wolf-pelt price falls after they sell.
2. **Heavy rain** (the `wet-spring` scenario): prints decay faster → the river rises and the ford closes → the iron caravan is delayed → iron, trap and arrowhead prices rise → herb biomass in Svartmyren rises → the medicine price falls.
3. **Wrong culprit:** a lynx preys on livestock and the farmer's contract names a wolf → killing a wolf does not stop the losses → the outcome-based payment fails.

---

## 18. Performance budgets

| Item | Budget |
|---|---|
| Frame rate | 60 fps at 1080p on a mid-range laptop with integrated graphics |
| Micro simulation per frame (1×) | ≤ 4 ms |
| Daily macro tick | ≤ 20 ms (split across frames if needed) |
| Materialised animals per region | ≤ 150 |
| Signs per region | ≤ 30 000 |
| 48 h catch-up on region entry | ≤ 300 ms |
| Save size (compressed) | ≤ 2 MB |
| Initial download (prototype) | ≤ 5 MB |

---

## 19. Project layout

This is the target layout. Until the systems grow, M1 keeps the micro level as flat modules in `src/sim`: `animals.ts`, `perception.ts`, `stealth.ts`, `nav.ts`, `signs.ts`, `signEmission.ts`, `reading.ts`, `tracking.ts`, `knowledge.ts`, `shot.ts` and `hunting.ts`.

```
/
├─ index.html
├─ package.json · tsconfig.json · vite.config.ts · biome.json
├─ src/
│  ├─ main.ts                # boot: load content, create/load world, start loop
│  ├─ app/                   # browser glue: session (commands, ticks, snapshots), loop, input
│  ├─ core/                  # rng, time/calendar, ids, math, spatial hash, serialisation
│  ├─ sim/                   # PURE, DETERMINISTIC — no DOM, no Pixi
│  │  ├─ world.ts            # WorldState, createWorld(), step()
│  │  ├─ commands.ts         # validate & apply player commands
│  │  ├─ chronicle.ts        # causal event log
│  │  ├─ weather/            # climate, fronts, forecast buffer, rivers, thermals
│  │  ├─ ecology/            # macro populations, food, predation, migration
│  │  ├─ local/              # materialise, catch-up, reconcile
│  │  ├─ agents/             # animal AI, perception, groups, pathfinding
│  │  ├─ signs/              # emission, decay, scan, readSign
│  │  ├─ hunting/            # shots, wounds, carcasses, traps, processing
│  │  ├─ economy/            # goods, stock, production, pricing, caravans
│  │  ├─ society/            # NPCs, hunters, contracts, rumours, reputation, ask-why
│  │  ├─ legends/            # promotion, marks, traits, naming
│  │  ├─ player/             # inventory, knowledge, skills, warmth, injuries
│  │  └─ mapgen/             # region generation from recipes
│  ├─ content/               # species, goods, recipes, regions, npcs, scenarios (typed data)
│  ├─ render/                # Pixi layers, chunks, decals, fx, vision, camera
│  ├─ ui/                    # Preact: HUD, journal, hub, valley map, dialogues
│  ├─ persistence/           # save format, migrations, IndexedDB slots, file export/import
│  ├─ audio/
│  └─ debug/                 # god view, inspector, time controls
├─ tools/sim-runner/         # headless runs → CSV + HTML report
├─ tests/                    # unit, property, determinism, causal-chain scenarios
└─ docs/
```

---

## 20. CI/CD

- **On every push or PR:** install, type-check, lint, unit/property/determinism/causal-chain tests (short), build, Playwright smoke test.
- **On `main`:** deploy to **GitHub Pages**, so every merged change is playable in a browser.
- **Nightly:** the long-run balance batch, with the HTML report uploaded as a workflow artefact.

## 21. Later options

- Move the simulation into a Web Worker (Comlink) once the frame budget needs it.
- A **Tauri** desktop build for Steam (small binary, same code).
- JSON content loading for modding.
