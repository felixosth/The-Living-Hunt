/**
 * The complete, serialisable world state.
 *
 * Rules (see docs/TECHNICAL_PLAN.md §3): plain data only — records, arrays,
 * numbers, strings, booleans and typed arrays. No class instances, no
 * closures, no Maps. Everything that can be regenerated from the seed (such as
 * region terrain) stays out of it.
 */
import type { RngStreams } from '../core/rng';
import type { GameTime } from '../core/time';
import type { RegionId } from './region';

/**
 * Version of the WorldState shape. Bump it whenever the shape changes, and add
 * a migration in src/persistence/migrations.ts.
 */
export const STATE_VERSION = 1;

export type Gait = 'sneak' | 'walk' | 'run';
export const GAITS: readonly Gait[] = ['sneak', 'walk', 'run'];

export interface PlayerState {
  /** Position in metres; x grows east, y grows south. */
  x: number;
  y: number;
  /** Facing in radians, screen convention (0 = east, π/2 = south). */
  heading: number;
  gait: Gait;
  /** Current movement intent, a direction vector (zero when standing still). */
  moveX: number;
  moveY: number;
}

export interface WeatherState {
  /** Compass bearing the wind blows FROM, in degrees (0 = north). */
  windFromDeg: number;
  /** Wind speed in m/s. */
  windSpeed: number;
}

export interface WorldState {
  seed: number;
  /** Game seconds since the calendar epoch (see core/time). */
  time: GameTime;
  /** Number of steps taken since the world was created. */
  tick: number;
  rng: RngStreams;
  regionId: RegionId;
  weather: WeatherState;
  player: PlayerState;
}
