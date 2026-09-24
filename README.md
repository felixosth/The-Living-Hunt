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
| <kbd>Shift</kbd> | Run |
| <kbd>C</kbd> | Toggle sneaking |
| Mouse wheel | Zoom |
| <kbd>`</kbd> | Debug panel: pause and time scale, quicksave/quickload, export/import saves, new world, state hash |

At 1× speed a game minute passes every real second, so a full day lasts about 24 minutes.

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

## Status

**M0: Foundations** is built: a generated test forest you can walk around at any time of day or night, with a 63° N calendar and sun, placeholder wind, save/load, a debug panel, a headless runner, and CI. Next is **M1: "Tracks in the mud"**, the fun prototype with roe deer, hares, signs and the bow.
