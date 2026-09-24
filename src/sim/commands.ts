/**
 * Player intents. The simulation changes only by applying commands inside
 * step(); commands are validated here and malformed ones are ignored.
 */
import { GAITS, type Gait, type WorldState } from './state';

export type Command = { type: 'move'; x: number; y: number; gait: Gait };

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
  }
}
