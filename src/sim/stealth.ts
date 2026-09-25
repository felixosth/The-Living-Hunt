/**
 * How much the player gives away: noise from gait and ground, visibility from
 * movement, cover and light, and the scent cone carried downwind.
 */
import { CARRY_CAPACITY_KG } from '../content/gear';
import { clamp, degToRad } from '../core/math';
import { coverAt, groundAt, type RegionMap } from './region';
import type { Gait, PlayerState, WeatherState } from './state';

/** Footstep noise per gait on meadow grass (1 = walking). */
export const GAIT_NOISE: Record<Gait, number> = { sneak: 0.18, walk: 1, run: 2.6 };

/** How far noise level 1 carries to a keen ear in calm air, in metres. */
export const NOISE_RANGE_M = 40;

/** How much movement catches the eye, per gait (standing still is lower). */
const GAIT_MOTION: Record<Gait, number> = { sneak: 0.45, walk: 0.85, run: 1 };
const STILL_MOTION = 0.25;
const CROUCHED_STILL_MOTION = 0.12;

export function isMoving(player: PlayerState): boolean {
  return player.moveX !== 0 || player.moveY !== 0;
}

/** Current footstep noise level (0 when standing still). */
export function playerNoise(player: PlayerState, map: RegionMap): number {
  if (!isMoving(player)) return 0;
  const burden = 1 + 0.5 * Math.min(1, player.load / CARRY_CAPACITY_KG);
  return GAIT_NOISE[player.gait] * groundAt(map, player.x, player.y).noise * burden;
}

/** Distance in metres at which a noise can be heard; wind masks it. */
export function noiseRadiusM(noise: number, windSpeed: number): number {
  return (noise * NOISE_RANGE_M) / (1 + windSpeed / 8);
}

/** How visible the player is, 0..1, before distance and line of sight. */
export function playerVisibility(player: PlayerState, map: RegionMap, light: number): number {
  const motion = isMoving(player)
    ? GAIT_MOTION[player.gait]
    : player.gait === 'sneak'
      ? CROUCHED_STILL_MOTION
      : STILL_MOTION;
  const cover = coverAt(map, player.x, player.y);
  return clamp(motion * (1 - cover) * (0.2 + 0.8 * light), 0, 1);
}

export interface ScentCone {
  /** Direction the scent drifts, in radians (screen convention: 0 = east, π/2 = south). */
  angle: number;
  /** Half-width of the cone in radians (π = scent pools all round in still air). */
  halfAngle: number;
  /** How far a keen nose can pick the scent up, in metres. */
  range: number;
}

/** Below this wind speed (m/s) scent pools around the player instead of drifting. */
const CALM_WIND = 0.5;

export function scentCone(weather: WeatherState): ScentCone {
  // Bearing the wind blows TO, converted from compass (0 = north) to screen angle.
  const angle = degToRad(weather.windFromDeg + 180 - 90);
  if (weather.windSpeed < CALM_WIND) return { angle, halfAngle: Math.PI, range: 30 };
  return {
    angle,
    halfAngle: degToRad(15 + 30 / (1 + weather.windSpeed)),
    range: Math.min(300, 50 + 35 * weather.windSpeed),
  };
}

/**
 * Strength (0..1) of the player's scent at a point: 1 close downwind, fading
 * towards the edge of the cone and its range.
 */
export function scentAt(
  cone: ScentCone,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
  noseRange = 1,
): number {
  const dx = x - fromX;
  const dy = y - fromY;
  const d = Math.hypot(dx, dy);
  const range = cone.range * noseRange;
  if (d > range) return 0;
  if (d < 3) return 1;
  let off = Math.atan2(dy, dx) - cone.angle;
  off = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
  if (off > cone.halfAngle) return 0;
  const across = cone.halfAngle >= Math.PI ? 1 : 1 - (off / cone.halfAngle) ** 2;
  return across * (1 - d / range);
}
