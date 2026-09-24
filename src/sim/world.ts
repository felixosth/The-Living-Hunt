/**
 * World creation and the single entry point that advances the simulation:
 * step(state, commands, dt). See docs/TECHNICAL_PLAN.md §3.
 */
import { DEFAULT_SCENARIO, type Scenario } from '../content/scenarios';
import { cyrb53 } from '../core/hash';
import { createStreams } from '../core/rng';
import { serialize } from '../core/serialize';
import {
  fromCalendar,
  type GameTime,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  type Season,
  toCalendar,
} from '../core/time';
import { applyCommand, type Command } from './commands';
import { advancePlayer } from './player';
import { getRegionMap } from './region';
import type { WorldState } from './state';
import { initialWeather, updateWeatherHourly } from './weather';

/** Notifications produced by a step, for UI, logs and tools. Not part of the state. */
export type SimEvent =
  | { type: 'hourStarted'; time: GameTime }
  | { type: 'dayStarted'; time: GameTime }
  | { type: 'seasonStarted'; time: GameTime; season: Season };

export function createWorld(seed: number, scenario: Scenario = DEFAULT_SCENARIO): WorldState {
  const rng = createStreams(seed);
  const map = getRegionMap(seed >>> 0, scenario.regionId);
  return {
    seed: seed >>> 0,
    time: fromCalendar(scenario.start),
    tick: 0,
    rng,
    regionId: scenario.regionId,
    weather: initialWeather(rng.weather),
    player: {
      x: map.spawn.x,
      y: map.spawn.y,
      heading: 0,
      gait: 'walk',
      moveX: 0,
      moveY: 0,
    },
  };
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

  advancePlayer(state.player, getRegionMap(state.seed, state.regionId), dtSeconds);

  const before = state.time;
  state.time = before + dtSeconds;
  const firstHour = Math.floor(before / SECONDS_PER_HOUR) + 1;
  const lastHour = Math.floor(state.time / SECONDS_PER_HOUR);
  for (let hour = firstHour; hour <= lastHour; hour++) {
    onHourStarted(state, hour * SECONDS_PER_HOUR, events);
  }

  state.tick++;
  return events;
}

function onHourStarted(state: WorldState, time: GameTime, events: SimEvent[]): void {
  events.push({ type: 'hourStarted', time });
  updateWeatherHourly(state.weather, state.rng.weather);
  if (time % SECONDS_PER_DAY === 0) onDayStarted(time, events);
}

function onDayStarted(time: GameTime, events: SimEvent[]): void {
  events.push({ type: 'dayStarted', time });
  const date = toCalendar(time);
  if (date.day === 1) events.push({ type: 'seasonStarted', time, season: date.season });
}

/** Fingerprint of the complete world state, for determinism checks. */
export function stateHash(state: WorldState): string {
  return cyrb53(serialize(state));
}
