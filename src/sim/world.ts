/**
 * World creation and the single entry point that advances the simulation:
 * step(state, commands, dt). See docs/TECHNICAL_PLAN.md §3.
 */
import { DEFAULT_SCENARIO, type Scenario } from '../content/scenarios';
import { cyrb53 } from '../core/hash';
import { createStreams } from '../core/rng';
import { cloneData, serialize } from '../core/serialize';
import {
  fromCalendar,
  type GameTime,
  lightLevel,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  toCalendar,
} from '../core/time';
import {
  calmAnimals,
  markScentTrail,
  SCENT_CELL_M,
  spawnAnimals,
  updateAnimals,
  updateSightings,
} from './animals';
import { applyCommand, type Command } from './commands';
import type { SimEvent } from './events';
import type { PlayerCues } from './perception';
import { advancePlayer } from './player';
import { getRegionMap, type RegionMap } from './region';
import type { WorldState } from './state';
import { noiseRadiusM, playerNoise, playerVisibility, scentCone } from './stealth';
import { initialWeather, updateWeatherHourly } from './weather';

export type { SimEvent } from './events';

/** A new world is simulated this long before the player arrives, so the forest holds fresh signs. */
export const WARM_UP_SECONDS = 36 * SECONDS_PER_HOUR;
const WARM_UP_STEP = 60;

// World creation is a pure function of (seed, scenario) but the warm-up takes a
// moment, so the result is memoised and handed out as fresh copies.
const created = new Map<string, WorldState>();
const CREATED_LIMIT = 4;

export function createWorld(seed: number, scenario: Scenario = DEFAULT_SCENARIO): WorldState {
  const key = `${seed >>> 0}:${scenario.id}`;
  let state = created.get(key);
  if (!state) {
    state = buildWorld(seed, scenario);
    if (created.size >= CREATED_LIMIT) created.delete(created.keys().next().value as string);
    created.set(key, state);
  }
  return cloneData(state);
}

function buildWorld(seed: number, scenario: Scenario): WorldState {
  const rng = createStreams(seed);
  const map = getRegionMap(seed >>> 0, scenario.regionId);
  const arrival = fromCalendar(scenario.start);
  const state: WorldState = {
    seed: seed >>> 0,
    time: arrival - WARM_UP_SECONDS,
    tick: 0,
    rng,
    regionId: scenario.regionId,
    weather: initialWeather(rng.weather),
    player: {
      x: map.spawn.x,
      y: map.spawn.y,
      heading: Math.PI / 2,
      gait: 'walk',
      moveX: 0,
      moveY: 0,
    },
    animals: [],
    nextAnimalId: 1,
    scentTrail: new Uint32Array(scentCells(map)),
  };
  spawnAnimals(state, map);
  while (state.time < arrival) {
    advance(state, map, Math.min(WARM_UP_STEP, arrival - state.time), [], false);
  }
  state.tick = 0;
  return state;
}

export function scentCells(map: RegionMap): number {
  const w = Math.ceil((map.width * map.tileSize) / SCENT_CELL_M);
  const h = Math.ceil((map.height * map.tileSize) / SCENT_CELL_M);
  return w * h;
}

/**
 * Advance the world by `dtSeconds` whole game seconds, applying `commands`
 * first. Mutates `state` in place and returns the events that occurred.
 */
export function step(
  state: WorldState,
  commands: readonly Command[],
  dtSeconds: number,
): SimEvent[] {
  if (!Number.isInteger(dtSeconds) || dtSeconds <= 0) {
    throw new RangeError(`step() needs a positive whole number of seconds, got ${dtSeconds}`);
  }
  const events: SimEvent[] = [];
  for (const command of commands) applyCommand(state, command);
  advance(state, getRegionMap(state.seed, state.regionId), dtSeconds, events, true);
  state.tick++;
  return events;
}

function advance(
  state: WorldState,
  map: RegionMap,
  dt: number,
  events: SimEvent[],
  playerPresent: boolean,
): void {
  let cues: PlayerCues | null = null;
  const light = lightLevel(state.time);
  if (playerPresent) {
    advancePlayer(state.player, map, dt);
    markScentTrail(state, map, state.player);
    cues = {
      x: state.player.x,
      y: state.player.y,
      noiseRadius: noiseRadiusM(playerNoise(state.player, map), state.weather.windSpeed),
      visibility: playerVisibility(state.player, map, light),
      scent: scentCone(state.weather),
      light,
    };
  }
  updateAnimals(state, map, dt, events, cues);

  const before = state.time;
  state.time = before + dt;
  const firstHour = Math.floor(before / SECONDS_PER_HOUR) + 1;
  const lastHour = Math.floor(state.time / SECONDS_PER_HOUR);
  for (let hour = firstHour; hour <= lastHour; hour++) {
    onHourStarted(state, hour * SECONDS_PER_HOUR, events);
  }
  if (playerPresent) updateSightings(state, map, lightLevel(state.time), events);
}

function onHourStarted(state: WorldState, time: GameTime, events: SimEvent[]): void {
  events.push({ type: 'hourStarted', time });
  updateWeatherHourly(state.weather, state.rng.weather);
  if (time % SECONDS_PER_DAY === 0) onDayStarted(state, time, events);
}

function onDayStarted(state: WorldState, time: GameTime, events: SimEvent[]): void {
  events.push({ type: 'dayStarted', time });
  calmAnimals(state);
  const date = toCalendar(time);
  if (date.day === 1) events.push({ type: 'seasonStarted', time, season: date.season });
}

/** Fingerprint of the complete world state, for determinism checks. */
export function stateHash(state: WorldState): string {
  return cyrb53(serialize(state));
}
