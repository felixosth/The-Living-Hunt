# The Living Hunt

A systemic hunting RPG for the browser: TypeScript, Vite, PixiJS (rendering), Preact (UI).
Design: `docs/GAME_DESIGN.md`. Architecture: `docs/TECHNICAL_PLAN.md`. Milestones: `docs/ROADMAP.md`.

## Commands

- `npm run check`: typecheck (app and DOM-free sim), Biome, Vitest. Run before every commit.
- `npm run fix`: apply Biome formatting and safe fixes.
- `npm run test:e2e`: Playwright smoke test. In cloud sessions set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- `npm run sim -- --seed 1 --days 84 --wander`: headless run of one game year.

## Architecture rules

1. `src/sim`, `src/core` and `src/content` are pure. No imports from `app`, `render`, `ui`, `persistence`, `pixi.js` or `preact`; no DOM or Node APIs; no `Math.random`, `Date` or timers. Biome overrides and `tsconfig.sim.json` (no DOM lib) enforce this.
2. Randomness comes only from the named RNG streams in `WorldState.rng` (`src/core/rng.ts`). Derive reproducible seeds with `hash32(...)`.
3. The world changes only through `step(state, commands, dt)` (`src/sim/world.ts`). Player intents are `Command`s (`src/sim/commands.ts`).
4. `WorldState` (`src/sim/state.ts`) is plain serialisable data. Anything regenerable from the seed, such as terrain, stays out of it. When its shape changes, bump `STATE_VERSION` and add a migration in `src/persistence/migrations.ts`.
5. Rendering and UI read `Snapshot`s (`src/sim/snapshot.ts`), never `WorldState`.
6. Time is whole game seconds. Field speeds are metres per game minute (at 1×, one game minute per real second).
7. Keep determinism tests green: the same seed and commands must give the same `stateHash`, including across a save and load.
