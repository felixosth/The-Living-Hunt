/**
 * Save migrations. When WorldState's shape changes, bump STATE_VERSION in
 * src/sim/state.ts and add an entry here that upgrades the previous version.
 * Old saves are then upgraded step by step on load.
 */
import { STATE_VERSION } from '../sim/state';

/** Upgrades a state of version N to version N + 1. */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] upgrades a version-n state to version n + 1. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

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
