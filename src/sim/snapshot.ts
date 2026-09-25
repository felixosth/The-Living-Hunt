/**
 * Read-only view of the world published after each step for rendering and UI.
 * Rendering and UI never read WorldState directly.
 */
import { SPECIES_IDS, type SpeciesId } from '../content/species';
import type { TerrainId } from '../content/terrain';
import { type GameTime, lightLevel } from '../core/time';
import { ALARMED, SUSPICIOUS } from './animals';
import { type Knowledge, level } from './knowledge';
import { getRegionMap, groundAt, type RegionId } from './region';
import { SIGN_KIND_NAMES, SignFlag, SignKind, type SignKindName, type SignStore } from './signs';
import type { Activity, Animal, Gait, WorldState } from './state';
import {
  isMoving,
  noiseRadiusM,
  playerNoise,
  playerVisibility,
  type ScentCone,
  scentCone,
} from './stealth';
import { SCAN_SECONDS } from './tracking';

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

export interface SignView {
  id: number;
  kind: SignKindName;
  species: SpeciesId;
  x: number;
  y: number;
  /** Radians, screen convention. */
  heading: number;
  integrity: number;
  /** Blood type for blood (its colour is plain to see), otherwise 0. */
  blood: number;
  followed: boolean;
  inspected: boolean;
}

export interface KnowledgeView {
  /** Levels 0–4 and progress (0..1) to the next. */
  species: Record<SpeciesId, { level: number; progress: number }>;
  signs: Record<SignKindName, { level: number; progress: number }>;
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
  /** Signs the player has found. */
  signs: SignView[];
  /** Changes whenever the found signs change. */
  signsRevision: number;
  tracking: {
    /** Scan progress 0..1, or null when not scanning. */
    scan: number | null;
    following: { species: SpeciesId | null; lost: boolean } | null;
    knowledge: KnowledgeView;
  };
  /** God view only: every sign. */
  allSigns?: { count: number; x: Float32Array; y: Float32Array; kind: Uint8Array };
  godView: boolean;
}

function knowledgeView(k: Knowledge): KnowledgeView {
  const view = (xp: number) => ({
    level: level(xp),
    progress: level(xp) >= 4 ? 1 : xp - Math.floor(xp),
  });
  return {
    species: Object.fromEntries(
      Object.entries(k.species).map(([key, xp]) => [key, view(xp)]),
    ) as KnowledgeView['species'],
    signs: Object.fromEntries(
      Object.entries(k.signs).map(([key, xp]) => [key, view(xp)]),
    ) as KnowledgeView['signs'],
  };
}

function noticedSigns(store: SignStore): SignView[] {
  const out: SignView[] = [];
  for (let i = 0; i < store.count; i++) {
    const flags = store.flags[i] as number;
    if (!(flags & SignFlag.Noticed)) continue;
    out.push({
      id: store.id[i] as number,
      kind: SIGN_KIND_NAMES[store.kind[i] as number] as SignKindName,
      species: SPECIES_IDS[store.species[i] as number] as SpeciesId,
      x: store.x[i] as number,
      y: store.y[i] as number,
      heading: store.heading[i] as number,
      integrity: store.integrity[i] as number,
      blood: store.kind[i] === SignKind.Blood ? (store.detail[i] as number) : 0,
      followed: (flags & SignFlag.Followed) !== 0,
      inspected: (flags & SignFlag.Inspected) !== 0,
    });
  }
  return out;
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
    signs: noticedSigns(state.signs),
    signsRevision: state.signs.revision,
    tracking: {
      scan:
        player.busy === 'scan'
          ? 1 - Math.max(0, player.busyUntil - state.time) / SCAN_SECONDS
          : null,
      following: player.follow
        ? {
            species: state.animals.find((a) => a.id === player.follow?.animal)?.species ?? null,
            lost: player.follow.lost,
          }
        : null,
      knowledge: knowledgeView(player.knowledge),
    },
    ...(godView
      ? {
          allSigns: {
            count: state.signs.count,
            x: state.signs.x.slice(0, state.signs.count),
            y: state.signs.y.slice(0, state.signs.count),
            kind: state.signs.kind.slice(0, state.signs.count),
          },
        }
      : {}),
    godView,
  };
}
