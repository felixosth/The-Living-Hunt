/**
 * Senses: what animals notice of the player, and which animals the player can see.
 */
import { SPECIES } from '../content/species';
import { lerp } from '../core/math';
import { moonIllumination } from '../core/time';
import { coverAt, type RegionMap } from './region';
import type { Animal, PlayerState } from './state';
import { type ScentCone, scentAt } from './stealth';

/** Animals further than this from the player don't perceive them at all. */
export const PERCEPTION_RANGE_M = 250;

/** What the player gives away this step; computed once and shared by all animals. */
export interface PlayerCues {
  x: number;
  y: number;
  /** How far footsteps carry, in metres. */
  noiseRadius: number;
  /** 0..1 before distance and line of sight. */
  visibility: number;
  scent: ScentCone;
  light: number;
  /** Weather's multiplier on sight range: fog, rain and falling snow shorten it. */
  sight: number;
}

/** Obstruction per metre of sightline per unit of cover above the threshold: roughly 30–40 m of spruce forest or 15 m of thicket blocks the view. */
const OBSTRUCTION_PER_M = 0.11;
/** Cover below this (meadow grass, bare rock) doesn't block a sightline. */
const OBSTRUCTION_THRESHOLD = 0.12;

/**
 * How blocked the sightline between two points is, 0 (clear) to 1 (blocked),
 * from the cover along the way. The ends are skipped: what you stand in hides
 * you, it doesn't blind you.
 */
export function sightlineObstruction(
  map: RegionMap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const skip = 1.5;
  if (d <= 2 * skip) return 0;
  const steps = Math.floor(d - 2 * skip);
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (skip + i) / d;
    const cover = coverAt(map, lerp(x0, x1, t), lerp(y0, y1, t));
    if (cover > OBSTRUCTION_THRESHOLD) sum += (cover - OBSTRUCTION_THRESHOLD) * OBSTRUCTION_PER_M;
    if (sum >= 1) return 1;
  }
  return sum;
}

export interface Perception {
  /** Stimulus from sight and hearing, in awareness per game minute before alertness. */
  stimulus: number;
  /** Scent strength 0..1: any real whiff means the animal knows. */
  smell: number;
}

export function perceivePlayer(a: Animal, cues: PlayerCues, map: RegionMap): Perception {
  const def = SPECIES[a.species];
  const dx = cues.x - a.x;
  const dy = cues.y - a.y;
  const d = Math.hypot(dx, dy);
  const keen = 1 + a.wariness;
  let stimulus = 0;

  // Sight: a wide field of view; heads down while feeding, and a hare in its form trusts its camouflage.
  let range = def.senses.sight * (0.35 + 0.65 * cues.light) * (0.8 + 0.2 * keen) * cues.sight;
  if (a.activity === 'feeding') range *= 0.5;
  if (a.activity === 'bedded') range *= 0.8;
  if (d < range) {
    let off = Math.atan2(dy, dx) - a.heading;
    off = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
    if (off <= def.senses.fov / 2) {
      const blocked = sightlineObstruction(map, a.x, a.y, cues.x, cues.y);
      if (blocked < 1) {
        stimulus += cues.visibility * (1 - d / range) ** 1.5 * (1 - blocked);
      }
    }
  }

  // Hearing.
  const heard = cues.noiseRadius * def.senses.hearing * keen;
  if (d < heard) stimulus += 1.5 * (1 - d / heard);

  const smell = scentAt(
    cues.scent,
    cues.x,
    cues.y,
    a.x,
    a.y,
    def.senses.smell * (1 + 0.5 * a.wariness),
  );
  return { stimulus, smell };
}

/**
 * How far the player can see an animal in the open, given the light and the
 * moon, times `weather` (fog and falling snow close in; snow cover lightens a night).
 */
export function playerSightRange(light: number, time: number, weather = 1): number {
  return lerp(25 + 30 * moonIllumination(time), 150, light) * weather;
}

/** Whether the player can see this animal right now. */
export function playerCanSee(
  player: PlayerState,
  a: Animal,
  map: RegionMap,
  light: number,
  time: number,
  weather = 1,
): boolean {
  const d = Math.hypot(a.x - player.x, a.y - player.y);
  if (d < 4) return true;
  const moving = a.speed > 0.3 ? 1 : 0.7;
  const posture = a.activity === 'bedded' || a.activity === 'dead' ? 0.3 : 1;
  const small = a.species === 'hare' ? 0.7 : 1;
  const conspicuous = moving * posture * small * (1 - 0.6 * coverAt(map, a.x, a.y));
  if (d > playerSightRange(light, time, weather) * conspicuous) return false;
  return sightlineObstruction(map, player.x, player.y, a.x, a.y) < 0.85;
}
