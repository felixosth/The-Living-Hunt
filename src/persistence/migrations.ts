/**
 * Save migrations. When WorldState's shape changes, bump STATE_VERSION in
 * src/sim/state.ts and add an entry here that upgrades the previous version.
 * Old saves are then upgraded step by step on load.
 */
import { initialKnowledge } from '../sim/knowledge';
import { getRegionMap, isWalkable } from '../sim/region';
import { createSignStore } from '../sim/signs';
import { STATE_VERSION } from '../sim/state';
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
