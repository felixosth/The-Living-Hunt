/**
 * Save migrations. When WorldState's shape changes, bump STATE_VERSION in
 * src/sim/state.ts and add an entry here that upgrades the previous version.
 * Old saves are then upgraded step by step on load.
 */
import { QUIVER_SIZE } from '../content/gear';
import type { RngState, RngStreams } from '../core/rng';
import { initialKnowledge } from '../sim/knowledge';
import { getRegionMap, isWalkable } from '../sim/region';
import { createSignStore } from '../sim/signs';
import { STATE_VERSION } from '../sim/state';
import { initialWeather } from '../sim/weather';
import { createWorld } from '../sim/world';

/** Upgrades a state of version N to version N + 1. */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a version-n state to version n + 1. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * M0 → M1: the forest gains animals and the player's ground scent. The
   * region was regenerated with fords and a cabin, so a player now standing
   * in water is moved to the cabin door.
   */
  1: (old) => {
    const fresh = createWorld(old.seed as number) as unknown as Record<string, unknown>;
    const map = getRegionMap(old.seed as number, old.regionId as string);
    const player = { ...(old.player as { x: number; y: number }) };
    if (!isWalkable(map, player.x, player.y)) {
      player.x = map.spawn.x;
      player.y = map.spawn.y;
    }
    return { ...fresh, time: old.time, tick: old.tick, rng: old.rng, weather: old.weather, player };
  },
  /** Step 3 of M1: signs, knowledge and trail following. */
  2: (old) => {
    const player = old.player as Record<string, unknown>;
    const animals = (old.animals as Record<string, unknown>[]).map((a) => ({
      ...a,
      since: old.time,
      stride: 0,
    }));
    return {
      ...old,
      animals,
      signs: createSignStore(),
      player: {
        ...player,
        busy: null,
        busyUntil: 0,
        knowledge: initialKnowledge(),
        follow: null,
        read: {},
      },
    };
  },
  /** Step 4 of M1: the bow, wounds, carcasses and hunt records. */
  3: (old) => {
    const player = old.player as Record<string, unknown>;
    const animals = (old.animals as Record<string, unknown>[]).map((a) => ({
      ...a,
      wound: null,
      carcass: null,
    }));
    return {
      ...old,
      animals,
      player: {
        ...player,
        busyTarget: 0,
        bow: null,
        arrows: QUIVER_SIZE,
        carrying: null,
        load: 0,
        walked: 0,
        hunts: {},
        trophies: [],
      },
    };
  },
  /** Scanning became searching the ground; a save caught mid-scan just stops. */
  4: (old) => {
    const player = old.player as Record<string, unknown>;
    return { ...old, player: { ...player, busy: player.busy === 'scan' ? null : player.busy } };
  },
  /** Practice with the bow; a save caught with the bow drawn lets it down. */
  5: (old) => {
    const player = old.player as Record<string, unknown>;
    const knowledge = player.knowledge as Record<string, unknown>;
    return {
      ...old,
      player: {
        ...player,
        bow: null,
        knowledge: { ...knowledge, hands: initialKnowledge().hands },
      },
    };
  },
  /** Following orders signs made in the same moment by id. */
  6: (old) => {
    const player = old.player as Record<string, unknown>;
    const follow = player.follow as Record<string, unknown> | null;
    return {
      ...old,
      player: { ...player, follow: follow ? { ...follow, lastId: 0 } : null },
    };
  },
  /** Deer can be stopped with a call. */
  7: (old) => ({
    ...old,
    animals: (old.animals as Record<string, unknown>[]).map((a) => ({ ...a, lookUntil: 0 })),
  }),
  /**
   * M2: real weather. A week of it is generated from the save's own weather
   * stream, keeping the wind as it was for the rest of the hour.
   */
  8: (old) => {
    const rng = old.rng as RngStreams;
    const stream = [...rng.weather] as RngState;
    const weather = initialWeather(stream, old.time as number);
    const wind = old.weather as { windFromDeg: number; windSpeed: number };
    return {
      ...old,
      rng: { ...rng, weather: stream },
      weather: { ...weather, windFromDeg: wind.windFromDeg, windSpeed: wind.windSpeed },
    };
  },
};

export function migrateState(
  state: Record<string, unknown>,
  fromVersion: number,
  toVersion: number = STATE_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> {
  if (fromVersion > toVersion) {
    throw new Error(`Save is from a newer version (${fromVersion}) than this game (${toVersion}).`);
  }
  let current = state;
  for (let v = fromVersion; v < toVersion; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error(`No migration from save version ${v} to ${v + 1}.`);
    current = migrate(current);
  }
  return current;
}
