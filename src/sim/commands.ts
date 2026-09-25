/**
 * Player intents. The simulation changes only by applying commands inside
 * step(); commands are validated here and malformed ones are ignored.
 */
import type { SimEvent } from './events';
import { getRegionMap, isWalkable } from './region';
import { GAITS, type Gait, type WorldState } from './state';
import { follow, inspect, startScan } from './tracking';

export type Command =
  | { type: 'move'; x: number; y: number; gait: Gait }
  /** Crouch and search the ground nearby. */
  | { type: 'scan' }
  /** Read a sign you've found. */
  | { type: 'inspect'; signId: number }
  /** Follow the trail of the animal that made a sign (0 stops following). */
  | { type: 'follow'; signId: number }
  /** Developer tool: move the player instantly (god view). */
  | { type: 'teleport'; x: number; y: number };

export function applyCommand(state: WorldState, command: Command, events: SimEvent[] = []): void {
  switch (command.type) {
    case 'move': {
      const { x, y, gait } = command;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !GAITS.includes(gait)) return;
      const len = Math.hypot(x, y);
      state.player.moveX = len > 1e-9 ? x / len : 0;
      state.player.moveY = len > 1e-9 ? y / len : 0;
      state.player.gait = gait;
      return;
    }
    case 'scan':
      startScan(state.player, state.time);
      return;
    case 'inspect':
      if (Number.isInteger(command.signId)) inspect(state, command.signId, events);
      return;
    case 'follow':
      if (Number.isInteger(command.signId)) follow(state, command.signId);
      return;
    case 'teleport': {
      const map = getRegionMap(state.seed, state.regionId);
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) return;
      if (!isWalkable(map, command.x, command.y)) return;
      state.player.x = command.x;
      state.player.y = command.y;
      return;
    }
  }
}
