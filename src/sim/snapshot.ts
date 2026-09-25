/**
 * Read-only view of the world published after each step for rendering and UI.
 * Rendering and UI never read WorldState directly.
 */
import type { TerrainId } from '../content/terrain';
import { type GameTime, lightLevel } from '../core/time';
import { getRegionMap, groundAt, type RegionId } from './region';
import type { Gait, WorldState } from './state';
import {
  isMoving,
  noiseRadiusM,
  playerNoise,
  playerVisibility,
  type ScentCone,
  scentCone,
} from './stealth';

export interface Snapshot {
  tick: number;
  time: GameTime;
  seed: number;
  regionId: RegionId;
  regionName: string;
  player: {
    x: number;
    y: number;
    heading: number;
    gait: Gait;
    moving: boolean;
    terrain: TerrainId | null;
    onTrail: boolean;
    /** Footstep noise level (0 = silent, 1 = walking on grass). */
    noise: number;
    /** How far the footsteps carry, in metres. */
    noiseRadius: number;
    /** How visible the player is, 0..1. */
    visibility: number;
  };
  wind: { fromDeg: number; speed: number };
  scent: ScentCone;
  /** Ambient daylight 0..1. */
  light: number;
}

export function makeSnapshot(state: WorldState): Snapshot {
  const { player } = state;
  const map = getRegionMap(state.seed, state.regionId);
  const ground = groundAt(map, player.x, player.y);
  const light = lightLevel(state.time);
  const noise = playerNoise(player, map);
  return {
    tick: state.tick,
    time: state.time,
    seed: state.seed,
    regionId: state.regionId,
    regionName: map.name,
    player: {
      x: player.x,
      y: player.y,
      heading: player.heading,
      gait: player.gait,
      moving: isMoving(player),
      terrain: ground.terrain,
      onTrail: ground.trail,
      noise,
      noiseRadius: noiseRadiusM(noise, state.weather.windSpeed),
      visibility: playerVisibility(player, map, light),
    },
    wind: { fromDeg: state.weather.windFromDeg, speed: state.weather.windSpeed },
    scent: scentCone(state.weather),
    light,
  };
}
