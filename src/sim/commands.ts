/**
 * Player intents. The simulation changes only by applying commands inside
 * step(); commands are validated here and malformed ones are ignored.
 */
import { getRegionMap, isWalkable } from './region';
import { GAITS, type Gait, type WorldState } from './state';

export type Command =
  | { type: 'move'; x: number; y: number; gait: Gait }
  /** Developer tool: move the player instantly (god view). */
  | { type: 'teleport'; x: number; y: number };

export function applyCommand(state: WorldState, command: Command): void {
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
