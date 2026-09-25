# M2 — "The weather turns": build plan

*The working plan for milestone M2 in the [Roadmap](ROADMAP.md). It builds weather, snow, predators, traps and danger on top of M1's forest, deer, signs and bow. As in [M1](M1_PLAN.md), every number is a first guess to tune by playing.*

**Goal:** Granåsen stops being a still life. Rain washes out yesterday's trail, the first snow turns the forest into an open book, a fox works the meadow for hares, ravens circle something the wolves killed, and you have to keep warm.

**Fun gate (from the roadmap):**

- The first snowfall visibly changes how you hunt.
- A trap line is a real alternative to stalking.
- Your readings get noticeably better over one session. (Learning by confirmation and the journal pages were built in M1; M2 adds pages for the new species and signs.)

## Status

Not started. Waiting for a go-ahead on this plan.

## Time, and how to test it

At normal speed a game day lasts 24 real minutes, and the game starts on Autumn 8, 13 days before winter. The weather has to happen on that clock:

- **Late autumn already turns:** cold fronts can bring sleet and the first snow from about Autumn 12, and snow that falls in autumn may melt again.
- **Winter** (from Autumn 21 + 1) is reliably cold, with lasting snow cover.
- **Debug panel:** a *Weather* section to force rain, snowfall, fog, a crust or a thaw, and to jump to a date, so any condition can be tested without waiting.

## Build steps

Each step ends playable, is pushed to `main` and deploys.

### Step 1 — Weather and snow

- **Weather model** (`src/sim/weather.ts`), replacing the M1 placeholder wind:
  - a **climate normal** for 63° N by day of year: autumn days of about +8 °C falling to around −5 °C by early winter, colder nights;
  - **fronts** every 2–5 days: clouds build, the wind backs and strengthens, then rain or snow, then clearing and colder air behind;
  - a daily **anomaly** (AR(1)) and an **hourly curve** for temperature;
  - derived: cloud cover, precipitation (rain, sleet or snow by temperature), **fog** (calm, damp, near dawn), wind as now.
- **A 7-day buffer** of hourly weather is generated ahead from the `weather` stream and kept in the saved state. Forecasts in later milestones read it; for M2, the journal gets **Einar's almanac**: a vague outlook for the next two days ("Snow likely by tomorrow evening").
- **Ground state** for the region: snow depth (falls, settles, melts; less under dense spruce), a **crust** after a thaw and a freeze, and wetness from rain. Stored as a few numbers per region, with fixed per-terrain factors, so saves stay small.
- **Effects on signs:**
  - rain wears prints, blood and your ground scent away several times faster;
  - snowfall deeper than a few centimetres **buries** older prints, blood and droppings;
  - **fresh snow takes every print** and makes them obvious (noticed on sight, like mud), and readings in snow are dated against the snowfall: *"made after the snow stopped, about 03:00"*;
  - you leave obvious prints in snow too (drawn behind you).
- **Effects on stealth:** crusted snow and frozen leaves are loud, soft new snow and wet leaves are quiet, rain masks noise like wind, and rain, snowfall and fog shorten sight for everyone.
- **Effects on animals:** heavy rain sends deer to their beds; deep snow slows deer (they flounder) but not hares.
- **Rendering:** rain streaks and snowfall that drift with the wind, the ground whitening with depth (trails and prints still show), fog drawn as a thickening haze towards the edges, and darker light under heavy cloud.
- **HUD:** a weather line with the temperature and conditions ("Light snow · −2 °C · 6 cm of snow").
- **Save:** `STATE_VERSION` bump; the migration generates the weather buffer and ground state.

### Step 2 — The red fox and traps

- **Red fox** (`src/content/species.ts`, `src/sim/animals.ts`): one or two per region, a den on a slope, active from dusk to dawn.
  - It hunts **hares** (a stalk and a short chase; in snow, the *mousing* pounce) and leaves a kill site: tufts of fur, blood, a few prints.
  - It **marks** stones and stumps with scat, and its prints run in one straight line (it steps into its own tracks), which a good reader can tell from a hare's or a dog's.
  - It scavenges: gut piles, trapped hares, carcasses.
- **Traps** (a new `traps` list in the saved state):
  - **Snare** (6 in your pack): set on a hare run or a game trail. Catches hares, sometimes a fox. Cheap and unselective.
  - **Foothold trap** (2): for foxes, set with bait. Holds the animal alive until you check it.
  - **Deadfall**: built on the spot from wood (a few game minutes, no cost), for hares and foxes.
  - **Setting:** `E` with a trap chosen from a short menu, placed where you stand. A set works best **on a run** (placement counts, and the game trails and hare runs are real), with **little fresh scent** (your scent on it fades over hours; rain washes it; a wary animal avoids it) and with **bait that fits** (meat scraps from a gut pile or a hare; hungry winter foxes take bait readily).
  - **Catches** are decided when an animal's path crosses the set. A catch waits: it **spoils** (faster in warm weather), can be **stolen** (a fox takes a snared hare; ravens pick at it), and a living catch in a foothold trap struggles and may pull free.
  - **Checking:** your own sets are marked on the map and listed in the journal, with when you last checked them. Collecting a catch or resetting is `E`.
- **Signs:** fox prints, scat, kill sites; trap-related signs (a sprung snare, drag marks).

### Step 3 — Wolves, ravens and jays

- **A wolf pack** (4–6) whose territory covers the whole valley, so it passes through Granåsen every few days and stays a night or two.
  - **Howls** at dusk: a long-range sound with a direction, sometimes a count for a good listener.
  - **Hunts roe deer:** the pack finds a group, tests it and chases. Deer in deep snow tire fast, wolves run on the crust. A kill leaves a clear scene: trampled snow, blood, hair, many prints, a carcass the pack feeds on and then leaves.
  - Wolves avoid you by day. They are dangerous only at night, when starving or when cornered (step 4).
- **Ravens:** a small flock that finds any carcass within a few hours (your gut piles, a wolf kill, a deer you lost) and **circles** above it, visible from far off and heard as *kraa* calls. Following ravens is a way to find kills, and your own lost animal.
- **Jays:** they scold when something moves through the forest near them: you walking (not sneaking), a fox or the wolves. You hear it as a directional sound, and nearby deer become suspicious.
- **Scavenging:** a carcass or catch you leave is found by ravens, then a fox, then the wolves. Meat condition drops, and the hunt summary says what took it.

### Step 4 — Warmth, danger and camp

- **Warmth** (a HUD meter): drains with cold, wet and wind, and faster when you're still; restored at the cabin or a fire. Cold makes your aim shake (more drift and tremor) and slows you. No hunger meter.
- **Danger:** a starving or cornered wolf may attack, most likely at night. A bite leaves you **bleeding** (your own blood trail, which the pack can follow) and slower; treat it at the cabin.
- **Death:** you wake at the cabin a day later, having lost what you carried.
- **Camp:** a fire (`E` with wood, a few minutes) warms you and lets you wait out the night (sleep skips time). Its light and smoke scare game, and the smoke widens your scent downwind for hours.

## Technical decisions

| Decision | Choice | Why |
|---|---|---|
| Weather state | Current values plus a 7-day hourly buffer in `WorldState`, generated from the `weather` stream | Deterministic; forecasts later read the same buffer, so they're genuine |
| Snow and wetness | A few region-wide numbers, with per-terrain factors | No per-tile arrays in saves; per-tile snow can come with M3's regions |
| Burying signs | At the hourly decay: a sign made before a snowfall deeper than its burial threshold is removed | Cheap, and snow becomes a clean slate |
| Predators | New species in the existing animal model, with new activities (`hunting`, `chasing`, `eating`) | Reuses senses, movement, signs and carcasses |
| Ravens and jays | Lightweight flocks bound to a carcass or a patch of forest, not full animals | They are signals, not prey |
| Traps | A plain list in `WorldState`; catches are checked when an animal crosses a set's cell | Deterministic and cheap |
| Save compatibility | `STATE_VERSION` bumps per step, each with a migration | As in M1 |

## Out of scope for M2

Prices, selling and buying (M4), NPC hunters (M5), other regions and the valley map (M3), lynx, moose, bears and wolverines (M5), seasons beyond autumn and winter, and hunting dogs.
