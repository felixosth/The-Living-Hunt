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
export const STATE_VERSION = 5;

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
  busy: 'dress' | null;
  /** The animal being dressed. */
  busyTarget: number;
  busyUntil: number;
  knowledge: Knowledge;
  /** The trail being followed: whose, and the last sign found on it. */
  follow: FollowState | null;
  /** Per animal id: when you last read one of its signs, and when that was last confirmed. */
  read: Record<string, { at: number; confirmed: number }>;
  /** The bow, while drawn. */
  bow: BowState | null;
  arrows: number;
  /** Id of the carcass on your back, if any. */
  carrying: number | null;
  /** Weight carried, kg. */
  load: number;
  /** Total metres walked, for measuring trails. */
  walked: number;
  /** What happened with each animal you've been after, by animal id. */
  hunts: Record<string, HuntRecord>;
  /** Animals brought home. */
  trophies: HuntSummary[];
}

export interface BowState {
  target: number;
  drawnAt: number;
  /** Aim point on the target's side view: metres right of its centre, and height. */
  aimU: number;
  aimV: number;
  /** When you started holding your breath (0 = breathing). */
  breathAt: number;
  /** When you last let your breath go; it takes a while to recover. */
  breathOutAt: number;
}

export interface HuntRecord {
  /** First time you found one of its signs (0 = never). */
  firstSignAt: number;
  shotAt: number;
  shotDistance: number;
  /** How it stood: broadside, quartering away, ... */
  shotAngle: string;
  zone: HitZone | null;
  hitX: number;
  hitY: number;
  walkedAtShot: number;
  diedAt: number;
  deathX: number;
  deathY: number;
  /** Metres you walked from the shot to reaching the carcass. */
  trailWalked: number;
  recoveredAt: number;
}

export interface HuntSummary {
  animalId: number;
  species: SpeciesId;
  sex: 'f' | 'm';
  juvenile: boolean;
  liveWeightKg: number;
  carcassWeightKg: number;
  dressed: boolean;
  firstSignAt: number;
  shotAt: number;
  recoveredAt: number;
  deliveredAt: number;
  shotDistance: number;
  shotAngle: string;
  zone: HitZone;
  /** How far the animal went after the hit, in metres. */
  ranM: number;
  trailWalkedM: number;
  meat: 'good' | 'tainted' | 'poor';
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
export type Activity = 'bedded' | 'feeding' | 'travelling' | 'drinking' | 'fleeing' | 'dead';

/** Where an arrow ended up in (or past) an animal. */
export type HitZone =
  | 'heart'
  | 'lungs'
  | 'liver'
  | 'gut'
  | 'spine'
  | 'muscle'
  | 'bone'
  | 'graze'
  | 'miss';

export interface Wound {
  zone: HitZone;
  /** Game time of the hit. */
  at: number;
  /** Blood type it leaves (see content/blood). */
  blood: number;
  /** Blood signs per metre moved, at the time of the hit. */
  bleed: number;
  /** How long the bleeding lasts (game seconds; 0 = until death). */
  bleedFor: number;
  /** Metres it will still run before lying down (or dropping). */
  fleeLeft: number;
  /** Dies when it has run `fleeLeft` metres (heart and lung hits). */
  diesAfterRun: boolean;
  /** Game time it dies if left alone (0 = not from this wound). */
  deathAt: number;
  /** Game time the wound stops mattering, for survivable hits (0 = never). */
  healAt: number;
  /** Times it has been pushed up from its bed. */
  pushed: number;
  /** The gut was opened. */
  tainted: boolean;
  /** The arrow stayed in the animal. */
  lodgedArrow: boolean;
}

export interface Carcass {
  diedAt: number;
  zone: HitZone;
  /** Gut contents spilled into the meat. */
  tainted: boolean;
  dressed: boolean;
  /** Game time it was field-dressed (0 = not yet). */
  dressedAt: number;
  /** An arrow is still inside; you get it back when you dress it. */
  lodgedArrow: boolean;
  /** Current weight (less once dressed), kg. */
  weightKg: number;
}

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
  wound: Wound | null;
  /** Set when it dies. */
  carcass: Carcass | null;
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
