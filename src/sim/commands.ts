/**
 * Player intents. The simulation changes only by applying commands inside
 * step(); commands are validated here and malformed ones are ignored.
 */
import { FORCED_WEATHER, type ForcedWeather, forceWeather } from './debugWeather';
import type { SimEvent } from './events';
import { aim, bleat, breath, draw, interact, lower, release } from './hunting';
import { type KnowledgeArea, MAX_LEVEL } from './knowledge';
import { getRegionMap, isWalkable } from './region';
import { GAITS, type Gait, type WorldState } from './state';
import { follow, inspect } from './tracking';

export type Command =
  | { type: 'move'; x: number; y: number; gait: Gait }
  /** Read a sign you've found. */
  | { type: 'inspect'; signId: number }
  /** Follow the trail of the animal that made a sign (0 stops following). */
  | { type: 'follow'; signId: number }
  /** Draw the bow on an animal you can see. */
  | { type: 'draw'; target: number }
  /** Move the aim point on the shot inset (metres right of centre, height). */
  | { type: 'aim'; u: number; v: number }
  | { type: 'breath'; hold: boolean }
  /**
   * Loose the arrow. `lead` is how long after the last tick the click came,
   * in real seconds, so the shot goes where the aim was when you clicked.
   */
  | { type: 'release'; lead?: number }
  | { type: 'lower' }
  /** A soft bleat, to stop a walking deer for a moment. */
  | { type: 'bleat' }
  /** The context action: dress, pick up, put down, bring home. */
  | { type: 'interact' }
  /** Developer tool: move the player instantly (god view). */
  | { type: 'teleport'; x: number; y: number }
  /** Developer tool: set a skill's experience directly (the level is its whole part, 0–4). */
  | { type: 'setKnowledge'; area: KnowledgeArea; key: string; xp: number }
  /** Developer tool: force the weather for the next hours. */
  | { type: 'forceWeather'; kind: ForcedWeather };

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
    case 'inspect':
      if (Number.isInteger(command.signId)) inspect(state, command.signId, events);
      return;
    case 'follow':
      if (Number.isInteger(command.signId)) follow(state, command.signId);
      return;
    case 'draw':
      if (Number.isInteger(command.target)) draw(state, command.target);
      return;
    case 'aim':
      aim(state, command.u, command.v);
      return;
    case 'breath':
      breath(state, command.hold === true);
      return;
    case 'release':
      release(state, getRegionMap(state.seed, state.regionId), events, command.lead ?? 0);
      return;
    case 'lower':
      lower(state);
      return;
    case 'bleat':
      bleat(state, getRegionMap(state.seed, state.regionId), events);
      return;
    case 'interact':
      interact(state, getRegionMap(state.seed, state.regionId), events);
      return;
    case 'setKnowledge': {
      const table = state.player.knowledge[command.area] as Record<string, number> | undefined;
      if (!table || !(command.key in table) || !Number.isFinite(command.xp)) return;
      table[command.key] = Math.max(0, Math.min(MAX_LEVEL + 0.999, command.xp));
      return;
    }
    case 'forceWeather':
      if (FORCED_WEATHER.includes(command.kind)) forceWeather(state, command.kind);
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
