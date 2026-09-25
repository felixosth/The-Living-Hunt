/**
 * Runs the simulation without a browser. Used by the CLI (run.ts) and tests.
 */
import type { SpeciesId } from '../../src/content/species';
import { terrainDef } from '../../src/content/terrain';
import { hash32 } from '../../src/core/hash';
import { nextRange, seedRng } from '../../src/core/rng';
import { daylight, type GameTime, SECONDS_PER_DAY, SECONDS_PER_HOUR } from '../../src/core/time';
import { type DayPart, dayPart } from '../../src/sim/animals';
import type { Command } from '../../src/sim/commands';
import { getRegionMap, terrainAt } from '../../src/sim/region';
import type { Activity, WorldState } from '../../src/sim/state';
import { createWorld, type SimEvent, stateHash, step } from '../../src/sim/world';

export interface RunOptions {
  seed: number;
  days: number;
  /** Game seconds per step. */
  stepSeconds?: number;
  /** Make the player wander, turning every game hour. */
  wander?: boolean;
  /** Continue from an existing state instead of creating a new world. */
  from?: WorldState;
}

export interface DailySample {
  time: GameTime;
  windFromDeg: number;
  windSpeed: number;
  daylightHours: number;
  playerX: number;
  playerY: number;
}

export interface RunResult {
  state: WorldState;
  startTime: GameTime;
  steps: number;
  wallMs: number;
  eventCounts: Record<SimEvent['type'], number>;
  /** Animal-hours per species, part of the day and activity, sampled on the hour. */
  activity: Partial<Record<SpeciesId, Partial<Record<DayPart, Partial<Record<Activity, number>>>>>>;
  daily: DailySample[];
  hash: string;
}

export function runHeadless({
  seed,
  days,
  stepSeconds = 60,
  wander = false,
  from,
}: RunOptions): RunResult {
  if (!Number.isInteger(stepSeconds) || stepSeconds <= 0 || SECONDS_PER_HOUR % stepSeconds !== 0) {
    throw new RangeError('stepSeconds must be a whole number that divides an hour');
  }
  const state = from ?? createWorld(seed);
  const startTime = state.time;
  const endTime = startTime + Math.round(days * SECONDS_PER_DAY);
  // The wander script has its own RNG so it never disturbs the world's streams.
  const wanderRng = seedRng(hash32(state.seed, 'headless-wander'));
  const eventCounts: RunResult['eventCounts'] = {
    hourStarted: 0,
    dayStarted: 0,
    seasonStarted: 0,
    sound: 0,
    sighted: 0,
  };
  const activity: RunResult['activity'] = {};
  const daily: DailySample[] = [];
  let steps = 0;

  const t0 = performance.now();
  while (state.time < endTime) {
    const commands: Command[] = [];
    if (wander && state.time % SECONDS_PER_HOUR === 0) {
      const angle = nextRange(wanderRng, 0, Math.PI * 2);
      commands.push({ type: 'move', x: Math.cos(angle), y: Math.sin(angle), gait: 'walk' });
    }
    const dt = Math.min(stepSeconds, endTime - state.time);
    for (const event of step(state, commands, dt)) {
      eventCounts[event.type]++;
      if (event.type === 'hourStarted') {
        const part = dayPart(event.time);
        for (const a of state.animals) {
          const bySpecies = activity[a.species] ?? {};
          const byPart = bySpecies[part] ?? {};
          byPart[a.activity] = (byPart[a.activity] ?? 0) + 1;
          bySpecies[part] = byPart;
          activity[a.species] = bySpecies;
        }
      }
      if (event.type === 'dayStarted') {
        daily.push({
          time: event.time,
          windFromDeg: state.weather.windFromDeg,
          windSpeed: state.weather.windSpeed,
          daylightHours: daylight(event.time).hours,
          playerX: state.player.x,
          playerY: state.player.y,
        });
      }
    }
    steps++;
  }
  const wallMs = performance.now() - t0;

  return {
    state,
    startTime,
    steps,
    wallMs,
    eventCounts,
    activity,
    daily,
    hash: stateHash(state),
  };
}

export function describePlayerGround(state: WorldState): string {
  const t = terrainAt(getRegionMap(state.seed, state.regionId), state.player.x, state.player.y);
  return t === null ? 'outside the region' : terrainDef(t).name;
}

export function describeAnimals(state: WorldState): string {
  const counts = new Map<string, number>();
  for (const a of state.animals) {
    const key = `${a.species} ${a.activity}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${n} ${k}`).join(', ');
}
