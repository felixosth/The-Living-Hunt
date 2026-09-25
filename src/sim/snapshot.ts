/**
 * Read-only view of the world published after each step for rendering and UI.
 * Rendering and UI never read WorldState directly.
 */
import type { SpeciesId } from '../content/species';
import type { TerrainId } from '../content/terrain';
import { type GameTime, lightLevel } from '../core/time';
import { ALARMED, SUSPICIOUS } from './animals';
import { getRegionMap, groundAt, type RegionId } from './region';
import type { Activity, Animal, Gait, WorldState } from './state';
import {
  isMoving,
  noiseRadiusM,
  playerNoise,
  playerVisibility,
  type ScentCone,
  scentCone,
} from './stealth';

export type Alertness = 'unaware' | 'suspicious' | 'alarmed' | 'fleeing';

export interface AnimalView {
  id: number;
  species: SpeciesId;
  juvenile: boolean;
  x: number;
  y: number;
  heading: number;
  /** Metres per game minute. */
  speed: number;
  activity: Activity;
  /** 0..1 */
  awareness: number;
  alertness: Alertness;
  /** Whether the player can see it (in god view, hidden animals are included too). */
  seen: boolean;
  /** God view only. */
  debug?: { sex: 'f' | 'm'; weightKg: number; goal: number; wariness: number };
}

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
  /** Animals the player can see; every animal in god view. */
  animals: AnimalView[];
  godView: boolean;
}

export interface SnapshotOptions {
  /** Include hidden animals and debug data. */
  godView?: boolean;
}

function alertnessOf(a: Animal): Alertness {
  if (a.activity === 'fleeing') return 'fleeing';
  if (a.awareness >= ALARMED) return 'alarmed';
  if (a.awareness >= SUSPICIOUS) return 'suspicious';
  return 'unaware';
}

function viewAnimal(a: Animal, godView: boolean): AnimalView {
  return {
    id: a.id,
    species: a.species,
    juvenile: a.juvenile,
    x: a.x,
    y: a.y,
    heading: a.heading,
    speed: a.speed,
    activity: a.activity,
    awareness: a.awareness,
    alertness: alertnessOf(a),
    seen: a.seen,
    ...(godView
      ? { debug: { sex: a.sex, weightKg: a.weightKg, goal: a.goal, wariness: a.wariness } }
      : {}),
  };
}

export function makeSnapshot(
  state: WorldState,
  { godView = false }: SnapshotOptions = {},
): Snapshot {
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
    animals: state.animals.filter((a) => a.seen || godView).map((a) => viewAnimal(a, godView)),
    godView,
  };
}
