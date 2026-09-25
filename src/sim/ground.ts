/**
 * The ground under the weather: snow that falls, settles, melts and freezes
 * into a crust; leaves that get wet or frozen. Kept as a few numbers for the
 * whole region, scaled per terrain (less snow under spruce, none on water).
 */
import { Terrain, terrainDef } from '../content/terrain';
import { clamp, lerp } from '../core/math';
import { SECONDS_PER_HOUR } from '../core/time';
import { type RegionMap, terrainAt } from './region';
import type { GroundState, WeatherHour } from './state';
import { precipType } from './weather';

/** Snow at least this deep (cm) takes every print. */
export const SNOW_PRINT_CM = 2;

/** What an hour of weather did to the ground, for the signs lying on it. */
export interface GroundChange {
  /** Rain (and the wet part of sleet), mm. */
  rainMm: number;
  /** New snow, cm. */
  newSnowCm: number;
  /** Snow melted away, cm. */
  meltCm: number;
}

/** Apply the hour of weather `w` that ended at `end` to the ground. */
export function updateGround(g: GroundState, w: WeatherHour, end: number): GroundChange {
  const type = precipType(w);
  let newSnowCm = 0;
  let rainMm = 0;
  // Ten centimetres of new snow to a centimetre of water.
  if (type === 'snow') newSnowCm = w.precip;
  else if (type === 'sleet') {
    newSnowCm = 0.4 * w.precip;
    rainMm = 0.5 * w.precip;
  } else if (type === 'rain') rainMm = w.precip;

  const before = g.snowCm;
  const melt = before > 0 && w.temp > 0 ? 0.25 * w.temp + 0.4 * rainMm : 0;
  // New snow settles as it lies.
  g.snowCm = Math.max(0, before + newSnowCm - melt) * 0.997;
  if (g.snowCm < 0.3) g.snowCm = 0;
  const meltCm = Math.max(0, Math.min(before + newSnowCm, melt));

  if (g.snowCm > 0) {
    if (w.temp > 0 || rainMm > 0) {
      // Thawing: the snow gets wet and any crust softens.
      g.snowWet = Math.min(1, g.snowWet + 0.08 * Math.max(0, w.temp) + 0.3 * rainMm);
      g.crust = Math.max(0, g.crust - 0.15 * Math.max(0, w.temp) - 0.3 * rainMm);
    } else if (w.temp < -1 && g.snowWet > 0.02) {
      // Freezing again: the melt water sets into a crust.
      const f = Math.min(g.snowWet, 0.25);
      g.snowWet -= f;
      g.crust = Math.min(1, g.crust + 2.5 * f);
    }
    // New snow on top hides the crust.
    g.crust *= Math.exp(-newSnowCm / 4);
  } else {
    g.crust = 0;
    g.snowWet = 0;
  }

  const drying = w.temp > 0 ? 0.012 + 0.004 * w.temp * (1 - w.cloud) + 0.003 * w.windSpeed : 0.004;
  g.wet = clamp(g.wet + 0.2 * rainMm + 0.02 * meltCm - drying, 0, 1);
  if (w.temp < -1) g.frozen = Math.min(1, g.frozen + 0.1 * -w.temp);
  else if (w.temp > 1) g.frozen = Math.max(0, g.frozen - 0.06 * w.temp);

  if (newSnowCm > 0.05) {
    if (g.snowEndedAt < end - SECONDS_PER_HOUR) g.snowStartedAt = end - SECONDS_PER_HOUR;
    g.snowEndedAt = end;
  }
  // Rain and new snow wash out the scent you left on the ground.
  if (rainMm >= 0.4 || newSnowCm >= 1) g.washedAt = end;
  return { rainMm, newSnowCm, meltCm };
}

/** Snow depth at a point, cm. */
export function snowAt(map: RegionMap, g: GroundState, x: number, y: number): number {
  if (g.snowCm <= 0) return 0;
  const t = terrainAt(map, x, y);
  return t === null ? 0 : g.snowCm * terrainDef(t).snowCatch;
}

/**
 * Multiplier on footstep noise from the state of the ground: crusted snow
 * and frozen leaves crunch, soft new snow and wet leaves are quiet.
 */
export function footingNoise(map: RegionMap, g: GroundState, x: number, y: number): number {
  const t = terrainAt(map, x, y);
  if (t === null || t === Terrain.Shallows) return 1;
  const bare = 1 + 0.45 * g.frozen - 0.3 * g.wet * (1 - g.frozen);
  const snow = snowAt(map, g, x, y);
  if (snow <= 1) return bare;
  const inSnow = lerp(0.6, 1.9, g.crust);
  return lerp(bare, inSnow, clamp((snow - 1) / 2, 0, 1));
}

/** How much deep snow slows an animal: deer flounder, hares run on top. */
export function snowPace(species: string, snowCm: number, crust: number): number {
  if (species === 'hare' || snowCm <= 20) return 1;
  const pace = 1 / (1 + (snowCm - 20) / 30);
  // A crust that won't carry a deer cuts its legs as it breaks through.
  return crust > 0.5 ? pace * 0.85 : pace;
}

/** How much deep snow slows you on foot. */
export function playerSnowPace(snowCm: number): number {
  return 1 - Math.min(0.4, Math.max(0, snowCm - 10) / 100);
}
