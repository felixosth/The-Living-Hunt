/**
 * Read-only view of the world published after each step for rendering and UI.
 * Rendering and UI never read WorldState directly.
 */
import type { TerrainId } from '../content/terrain';
import { type GameTime, lightLevel } from '../core/time';
import { getRegionMap, type RegionId, terrainAt } from './region';
import type { Gait, WorldState } from './state';

export interface Snapshot {
  tick: number;
  time: GameTime;
  seed: number;
  regionId: RegionId;
  player: {
    x: number;
    y: number;
    heading: number;
    gait: Gait;
    moving: boolean;
    terrain: TerrainId | null;
  };
  wind: { fromDeg: number; speed: number };
  /** Ambient daylight 0..1. */
  light: number;
}

export function makeSnapshot(state: WorldState): Snapshot {
  const { player } = state;
  const map = getRegionMap(state.seed, state.regionId);
  return {
    tick: state.tick,
    time: state.time,
    seed: state.seed,
    regionId: state.regionId,
    player: {
      x: player.x,
      y: player.y,
      heading: player.heading,
      gait: player.gait,
      moving: player.moveX !== 0 || player.moveY !== 0,
      terrain: terrainAt(map, player.x, player.y),
    },
    wind: { fromDeg: state.weather.windFromDeg, speed: state.weather.windSpeed },
    light: lightLevel(state.time),
  };
}
