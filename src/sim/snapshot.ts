/**
 * Read-only view of the world published after each step for rendering and UI.
 * Rendering and UI never read WorldState directly.
 */

import { CARRY_CAPACITY_KG } from '../content/gear';
import { SPECIES_IDS, type SpeciesId } from '../content/species';
import type { TerrainId } from '../content/terrain';
import { type GameTime, lightLevel } from '../core/time';
import { ALARMED, SUSPICIOUS } from './animals';
import { DRESS_SECONDS, interactPrompt, isHeadDown } from './hunting';
import { type HandSkill, type Knowledge, level } from './knowledge';
import { sightlineObstruction } from './perception';
import { getRegionMap, groundAt, type RegionId, type RegionMap } from './region';
import {
  angleName,
  type BreathState,
  breathState,
  relativeAngle,
  type ShotAngle,
  type SwayInput,
  scatter,
  swayInput,
  travelDuringFlight,
} from './shot';
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
import { type SearchPosture, searchPosture } from './tracking';

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
  /** On the stretch of trail you have followed. */
  followed: boolean;
  /** Left by the animal whose trail you are following. */
  onTrail: boolean;
  inspected: boolean;
}

export interface KnowledgeView {
  /** Levels 0–4 and progress (0..1) to the next. */
  species: Record<SpeciesId, { level: number; progress: number }>;
  signs: Record<SignKindName, { level: number; progress: number }>;
  hands: Record<HandSkill, { level: number; progress: number }>;
}

export interface BowView {
  targetId: number;
  species: SpeciesId;
  distance: number;
  /** Target heading relative to the line of fire (radians). */
  theta: number;
  angle: ShotAngle;
  /** Scatter you can't time away: one standard deviation of the landing point, in metres. */
  sigma: number;
  /** Where you are aiming, before the drift. */
  aimU: number;
  aimV: number;
  /** What the drift and tremor depend on: pass to `sway()` with the game time to draw them. */
  sway: SwayInput;
  breath: BreathState;
  /** Twigs in the way: 0 clear to 1 blocked. */
  brush: number;
  /** How well you know the target's anatomy (0–4). */
  anatomyLevel: number;
  /** Grazing or drinking with its head down. */
  headDown: boolean;
  /** How aware of you it is. */
  alertness: Alertness;
  awareness: number;
  /** How it's moving: its body carries on while the arrow flies. */
  motion: 'still' | 'slow' | 'walking' | 'running';
  /** Which way it's moving on the side view: +1 to the right, -1 to the left. */
  motionDir: 1 | -1;
  /** How far it moves on while the arrow flies, metres along the side view. */
  lead: number;
  /** Stopped by your call, head up and looking. */
  looking: boolean;
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
    arrows: number;
    load: number;
    capacity: number;
    carrying: { species: SpeciesId; weightKg: number } | null;
    /** What the interact key (E) would do here. */
    prompt: string | null;
    busy: 'dress' | null;
    /** Progress of the current timed action, 0..1. */
    busyProgress: number;
  };
  bow: BowView | null;
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
    /** How closely you're looking at the ground. */
    searching: SearchPosture;
    following: { species: SpeciesId | null; lost: boolean } | null;
    knowledge: KnowledgeView;
  };
  /** God view only: every sign. */
  allSigns?: { count: number; x: Float32Array; y: Float32Array; kind: Uint8Array };
  godView: boolean;
}

function carryingView(state: WorldState): Snapshot['player']['carrying'] {
  const id = state.player.carrying;
  if (id === null) return null;
  const a = state.animals.find((x) => x.id === id);
  return a?.carcass ? { species: a.species, weightKg: a.carcass.weightKg } : null;
}

function bowView(state: WorldState, map: RegionMap): BowView | null {
  const { player } = state;
  const bow = player.bow;
  if (!bow) return null;
  const a = state.animals.find((x) => x.id === bow.target);
  if (!a) return null;
  const distance = Math.hypot(a.x - player.x, a.y - player.y);
  const theta = relativeAngle(a.heading, player.x, player.y, a.x, a.y);
  const now = state.time;
  return {
    targetId: a.id,
    species: a.species,
    distance,
    theta,
    angle: angleName(theta),
    sigma: scatter(distance, a.speed, player.knowledge.hands.bow),
    aimU: bow.aimU,
    aimV: bow.aimV,
    sway: swayInput(bow, distance, isMoving(player), player.knowledge.hands.bow),
    breath: breathState(bow, now),
    brush: sightlineObstruction(map, player.x, player.y, a.x, a.y),
    anatomyLevel: level(player.knowledge.species[a.species]),
    headDown: isHeadDown(a),
    alertness: alertnessOf(a),
    awareness: a.awareness,
    motion: a.speed < 0.3 ? 'still' : a.speed < 2 ? 'slow' : a.speed < 7 ? 'walking' : 'running',
    motionDir: Math.sin(theta) >= 0 ? 1 : -1,
    lead: Math.abs(travelDuringFlight(a.speed, distance, theta)),
    looking: a.lookUntil > now,
  };
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
    hands: { bow: view(k.hands.bow) },
  };
}

function noticedSigns(store: SignStore, following: number | null): SignView[] {
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
      onTrail: following !== null && store.animal[i] === following,
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
      arrows: player.arrows,
      load: player.load,
      capacity: CARRY_CAPACITY_KG,
      carrying: carryingView(state),
      prompt: player.busy || player.bow ? null : interactPrompt(state, map),
      busy: player.busy,
      busyProgress: player.busy
        ? 1 - Math.max(0, player.busyUntil - state.time) / DRESS_SECONDS
        : 0,
    },
    bow: bowView(state, map),
    wind: { fromDeg: state.weather.windFromDeg, speed: state.weather.windSpeed },
    scent: scentCone(state.weather),
    light,
    animals: state.animals
      .filter((a) => (a.seen || godView) && a.id !== player.carrying)
      .map((a) => viewAnimal(a, godView)),
    signs: noticedSigns(state.signs, state.player.follow?.animal ?? null),
    signsRevision: state.signs.revision,
    tracking: {
      searching: searchPosture(player),
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
