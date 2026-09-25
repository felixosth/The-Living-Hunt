/**
 * The complete, serialisable world state.
 *
 * Rules (see docs/TECHNICAL_PLAN.md §3): plain data only — records, arrays,
 * numbers, strings, booleans and typed arrays. No class instances, no
 * closures, no Maps. Everything that can be regenerated from the seed (such as
 * region terrain) stays out of it.
 */
import type { SpeciesId } from '../content/species';
import type { RngStreams } from '../core/rng';
import type { GameTime } from '../core/time';
import type { Knowledge } from './knowledge';
import type { RegionId } from './region';
import type { SignStore } from './signs';

/**
 * Version of the WorldState shape. Bump it whenever the shape changes, and add
 * a migration in src/persistence/migrations.ts.
 */
export const STATE_VERSION = 3;

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
  /** A timed action that holds the player in place, and when it ends. */
  busy: 'scan' | null;
  busyUntil: number;
  knowledge: Knowledge;
  /** The trail being followed: whose, and the last sign found on it. */
  follow: FollowState | null;
  /** Per animal id: when you last read one of its signs, and when that was last confirmed. */
  read: Record<string, { at: number; confirmed: number }>;
}

export interface FollowState {
  animal: number;
  /** Time the last found sign was made; the trail continues with later ones. */
  lastT: number;
  x: number;
  y: number;
  /** You've wandered away from the last sign found. */
  lost: boolean;
}

export interface WeatherState {
  /** Compass bearing the wind blows FROM, in degrees (0 = north). */
  windFromDeg: number;
  /** Wind speed in m/s. */
  windSpeed: number;
}

/** What an animal is doing. */
export type Activity = 'bedded' | 'feeding' | 'travelling' | 'drinking' | 'fleeing';

export interface AnimalHome {
  /** Points of interest (indices into the region's list) this animal uses. */
  rest: number[];
  feed: number[];
  water: number[];
}

export interface Animal {
  id: number;
  species: SpeciesId;
  sex: 'f' | 'm';
  juvenile: boolean;
  weightKg: number;
  /** Herd id: the id of the group's leader (its own id for a lone animal). */
  groupId: number;
  home: AnimalHome;
  x: number;
  y: number;
  /** Radians, screen convention (0 = east, π/2 = south). */
  heading: number;
  /** Speed over the last step, in metres per game minute. */
  speed: number;
  activity: Activity;
  /** Point of interest it is heading for or using (-1 for none). */
  goal: number;
  /** The spot it is walking to within the current area, in metres. */
  spotX: number;
  spotY: number;
  /** Game time the current activity ends. */
  until: number;
  /** Game time it last drank. */
  lastDrink: number;
  /** 0..1: unaware below 0.3, suspicious below 0.7, then alarmed. */
  awareness: number;
  /** Where it thinks the danger is, in metres. */
  alarmX: number;
  alarmY: number;
  /** Game time of its last alarm call, to space them out. */
  lastCall: number;
  /** Game time it last reacted to the player's ground scent. */
  scentCheckedAt: number;
  /** 0..1: raised by scares, fades day by day. Makes every sense sharper. */
  wariness: number;
  /** Whether the player could see it at the end of the last step. */
  seen: boolean;
  /** Game time the current activity started. */
  since: number;
  /** Metres walked since its last recorded print. */
  stride: number;
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
  animals: Animal[];
  nextAnimalId: number;
  signs: SignStore;
  /**
   * The player's ground scent: for each 8 m cell of the region, the game time
   * the player last walked through it (0 = never). Deer crossing it get nervous.
   */
  scentTrail: Uint32Array;
}
