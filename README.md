# The Living Hunt

*A systemic hunting RPG for the browser.*

> **Learn the wilderness. Read its consequences. Hunt intelligently.**

You inherit a dead hunter's cabin, journal and unpaid taxes in Ulvdalen, a small northern valley that is simulated from end to end. Animal populations eat, breed, hunt and migrate. Weather buries tracks and floods fords. Settlements trade real stockpiles, and rival hunters chase the same bounties you do. You make a living by reading the signs, from prints in the mud to prices on a merchant's slate, and acting on them before anyone else.

## Running it

Requires Node 22.12 or later.

```sh
npm install
npm run dev          # then open http://localhost:5173
```

Add `?seed=123` to the URL to generate a different world.

| Key | Action |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrows | Move |
| <kbd>Shift</kbd> | Run (fast and loud) |
| <kbd>C</kbd> | Toggle sneaking (slow, quiet, low). Crouched and still, you study the ground and subtle signs appear around you |
| Click a found sign | Read it (you have to be close) |
| <kbd>F</kbd> | Follow the trail of the sign you read, or stop following |
| Right mouse (hold) on an animal | Draw the bow; the shot inset shows its side view |
| Mouse, then left click | Aim on the side view; the crosshair drifts, so loose the arrow as it crosses the vitals |
| <kbd>Space</kbd> (hold, while drawn) | Hold your breath: five seconds of steadier aim, then you shake |
| <kbd>Q</kbd> | A soft bleat: a walking roe deer stops and looks up for a couple of seconds (it's on edge while it does) |
| <kbd>E</kbd> | Field-dress, pick up, put down, or bring an animal into the cabin |
| <kbd>J</kbd> | Journal: what you know, and how steady your bow arm is |
| <kbd>T</kbd> / <kbd>P</kbd> | Wait (10×, stops when something stirs) / pause |
| <kbd>H</kbd> | All controls |
| Mouse wheel | Zoom. The camera also leans towards the mouse, so point where you want to look |
| <kbd>`</kbd> | Debug panel: time scale, saves, new world, skill levels, state hash, **god view** |

At 1× speed a game minute passes every real second, so a full day lasts about 24 minutes.

**How to hunt.** Faint streaks show the wind, and your scent drifts the same way: an animal downwind of you will smell you and run, so come at it with the wind in your face. Walking is heard and seen; sneaking on moss and trails is not. Deer bed in thickets by day and feed on the meadows at dawn and dusk; their prints are clearest in the mud at the fords. Sounds show as arcs around you pointing roughly where they came from, and animals you can see beyond the edge of the screen get a marker at the edge. Read signs to learn which way an animal went and how long ago, follow its trail, and take a broadside shot at the lungs from close, at an animal that doesn't know you're there: the further away, the wider your arrows scatter, and a deer on edge can jump at the sound of the string before the arrow arrives. A moving deer walks on while the arrow flies, so lead it, or stop it first with a soft bleat. Then read the blood before you follow: a lung-shot deer goes down quickly, a gut-shot one will run far if you push it. Carry it back to the cabin for a summary of the hunt.

## Development

| Command | What it does |
|---|---|
| `npm run check` | Typecheck, lint and unit tests: run before committing |
| `npm run typecheck` | TypeScript for the app, plus a second pass that compiles the simulation without DOM typings |
| `npm run lint` / `npm run fix` | Biome lint and format check / apply fixes |
| `npm test` | Vitest: unit, property-based, determinism and save tests |
| `npm run test:e2e` | Playwright smoke test against a production build. Set `PW_CHROMIUM_PATH` to use an already-installed Chromium |
| `npm run sim -- --seed 42 --days 84 --wander --out out/run-42` | Headless simulation; writes `summary.json` and `daily.csv` with `--out` |
| `npm run build` | Production build into `dist/` |

The simulation (`src/sim`, `src/core`, `src/content`) is pure and deterministic: it never touches the browser, and all randomness comes from seeded streams saved with the world. Rendering (`src/render`, PixiJS) and UI (`src/ui`, Preact) only read snapshots of it. See the [Technical Plan](docs/TECHNICAL_PLAN.md) for the rules.

### Deployment

`.github/workflows/deploy.yml` publishes `dist/` to GitHub Pages on every push to `main`. To turn it on, set **Settings → Pages → Source** to **GitHub Actions** and make sure a `main` branch exists.

## Planning documents

| Document | Contents |
|---|---|
| [Game Design](docs/GAME_DESIGN.md) | Pillars, setting, core loops, a hunt step by step, field systems (stealth, wind, signs, the shot, traps), ecology, weather, legends, economy, contracts, rumours, progression, the journal |
| [Technical Plan](docs/TECHNICAL_PLAN.md) | Stack (TypeScript, Vite, PixiJS, Preact), a pure deterministic simulation core, two-scale macro/micro simulation, the causal chronicle, data models, the ecology and economy models, tooling, testing, performance budgets |
| [Roadmap](docs/ROADMAP.md) | Milestones M0–M7 with fun gates, frozen v0.1 scope, backlog, risks |
| [M1 plan](docs/M1_PLAN.md) | How the fun prototype works: the hunt it must deliver, mechanics, numbers, technical choices |
| [M2 plan](docs/M2_PLAN.md) | The next milestone: weather and snow, the fox and traps, wolves and ravens, warmth and danger |

## Status

**M0: Foundations** and **M1: "Tracks in the mud"** are done. M1 is the fun prototype: one forest region (Granåsen) with fords, game trails and Einar's cabin; roe deer and mountain hares with daily routines, senses and awareness; signs you scan for, read and follow, with knowledge that improves as you confirm readings; and the bow, with a shot inset, an anatomy-based hit model, blood trails, field dressing, carrying and a hunt summary. See the [M1 plan](docs/M1_PLAN.md) for the mechanics and numbers. Next is **M2: "The weather turns"** ([plan](docs/M2_PLAN.md)).
