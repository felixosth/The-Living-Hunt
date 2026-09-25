/**
 * The shot: the target's side view at its angle to you, the aiming reticle,
 * and where an arrow goes when it's released.
 *
 * View coordinates are metres on a vertical plane through the animal, square
 * to the line of fire: u to the right as you look, v up from the ground.
 */
import { anatomyFor, type Part, type PartId } from '../content/anatomy';
import type { SpeciesId } from '../content/species';
import { chance, nextFloat, type RngState } from '../core/rng';
import { GAME_SECONDS_PER_REAL_SECOND as REAL } from '../core/time';
import type { BowState, HitZone } from './state';

/** You can't draw on anything further than this. */
export const BOW_RANGE_M = 50;
/*
 * The shot happens in real time (drawing drops the game to normal speed), so
 * its timings are written in real seconds and converted to game seconds.
 */
/** How long a held breath steadies you: 5 real seconds. */
export const BREATH_HOLD_S = 5 * REAL;
/** After letting a breath go, how long until you can hold it again: 4 real seconds. */
const BREATH_RECOVER_S = 4 * REAL;
/** Past a held breath, the shaking doubles your spread every 1.5 real seconds or so. */
const SHAKE_S = 1.5 * REAL;
/** Settling after the draw: the extra spread shrinks by two-thirds every 1.2 real seconds. */
const SETTLE_S = 1.2 * REAL;
/** Your arms tire after holding at full draw for 12 real seconds. */
const TIRE_AFTER_S = 12 * REAL;
/** Then the spread grows by this many radians per real second. */
const TIRE_RATE = 0.002;

/**
 * The animal's heading relative to the line of fire (radians): 0 = facing
 * straight away from you, ±π/2 = broadside, π = facing you.
 */
export function relativeAngle(
  animalHeading: number,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): number {
  const fire = Math.atan2(toY - fromY, toX - fromX);
  const d = animalHeading - fire;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

export type ShotAngle =
  | 'broadside'
  | 'quartering away'
  | 'quartering towards'
  | 'facing away'
  | 'facing you';

export function angleName(theta: number): ShotAngle {
  const side = Math.abs(Math.sin(theta));
  if (side > 0.87) return 'broadside';
  if (side < 0.34) return Math.cos(theta) > 0 ? 'facing away' : 'facing you';
  return Math.cos(theta) > 0 ? 'quartering away' : 'quartering towards';
}

export interface Projected {
  id: PartId;
  u: number;
  v: number;
  /** Semi-axes on the view plane. */
  ru: number;
  rv: number;
  /** Depth of the centre along the line of fire (larger = further from you). */
  depth: number;
}

/** A part as seen from the shooter, at relative angle `theta`. */
export function project(part: Part, theta: number): Projected {
  const [f, s, z] = part.c;
  const [a, b, c] = part.r;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  return {
    id: part.id,
    u: f * sin + s * cos,
    v: z,
    ru: Math.sqrt(a * a * sin * sin + b * b * cos * cos),
    rv: c,
    depth: f * cos - s * sin,
  };
}

export function projectAnatomy(species: SpeciesId, theta: number, headDown = false): Projected[] {
  return anatomyFor(species, headDown).map((p) => project(p, theta));
}

/** Entry and exit distances of the arrow's path through a part, or null. */
function pierce(part: Part, theta: number, u: number, v: number): [number, number] | null {
  // Ray in body coordinates, starting 5 m in front of the animal on your side.
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const w0 = -5;
  const ox = u * sin + w0 * cos - part.c[0];
  const oy = u * cos - w0 * sin - part.c[1];
  const oz = v - part.c[2];
  const dx = cos;
  const dy = -sin;
  const [a, b, c] = part.r;
  // Scale to a unit sphere.
  const px = ox / a;
  const py = oy / b;
  const pz = oz / c;
  const qx = dx / a;
  const qy = dy / b;
  const A = qx * qx + qy * qy;
  const B = 2 * (px * qx + py * qy);
  const C = px * px + py * py + pz * pz - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0 || A === 0) return null;
  const root = Math.sqrt(disc);
  return [(-B - root) / (2 * A), (-B + root) / (2 * A)];
}

export interface ShotResult {
  zone: HitZone;
  /** Went clean through, so the arrow lies beyond the animal. */
  passThrough: boolean;
  /** The gut was opened: meat tainted. */
  tainted: boolean;
}

const LETHALITY: PartId[] = ['heart', 'lungs', 'liver', 'gut', 'ham'];

/** Follow an arrow striking the view plane at (u, v) through an animal at angle `theta`. */
export function castArrow(
  species: SpeciesId,
  theta: number,
  u: number,
  v: number,
  rng: RngState,
  headDown = false,
): ShotResult {
  const parts = anatomyFor(species, headDown);
  const hits = parts
    .map((part) => ({ part, t: pierce(part, theta, u, v) }))
    .filter((h): h is { part: Part; t: [number, number] } => h.t !== null && h.t[1] > 0)
    .sort((x, y) => x.t[0] - y.t[0]);
  const outer = hits.find((h) => ['body', 'neck', 'head', 'leg'].includes(h.part.id));
  if (!outer) return { zone: 'miss', passThrough: true, tainted: false };

  switch (outer.part.id) {
    case 'leg':
      return { zone: 'muscle', passThrough: true, tainted: false };
    case 'head':
      return chance(rng, 0.5)
        ? { zone: 'spine', passThrough: false, tainted: false }
        : { zone: 'graze', passThrough: true, tainted: false };
    case 'neck':
      return chance(rng, 0.4)
        ? { zone: 'spine', passThrough: false, tainted: false }
        : { zone: 'muscle', passThrough: true, tainted: false };
  }

  const [enter, exit] = outer.t;
  if (exit - enter < 0.07 * (species === 'hare' ? 0.45 : 1)) {
    return { zone: 'graze', passThrough: true, tainted: false };
  }
  // A bow arrow carries enough to pass through a roe deer, unless bone stops it.
  let budget = species === 'hare' ? 2 : 0.7;
  const found = new Set<PartId>();
  for (const h of hits) {
    if (h.part === outer.part || h.t[0] > enter + budget) continue;
    if (h.part.id === 'shoulder') {
      if (chance(rng, 0.65)) {
        const vital = LETHALITY.find((id) => found.has(id) && id !== 'ham');
        return vital
          ? { zone: vital as HitZone, passThrough: false, tainted: found.has('gut') }
          : { zone: 'bone', passThrough: false, tainted: false };
      }
      budget -= 0.3;
      continue;
    }
    if (h.part.id === 'spine') return { zone: 'spine', passThrough: false, tainted: false };
    found.add(h.part.id);
  }
  const best = LETHALITY.find((id) => found.has(id));
  return {
    zone: best === undefined || best === 'ham' ? 'muscle' : (best as HitZone),
    passThrough: exit - enter < budget,
    tainted: found.has('gut'),
  };
}

/** Steadiness multiplier from breath: steady while held, shaky after, then recovering. */
export function breathFactor(bow: BowState, now: number): number {
  if (bow.breathAt > 0) {
    const held = now - bow.breathAt;
    return held <= BREATH_HOLD_S ? 0.5 : 0.5 + (held - BREATH_HOLD_S) / SHAKE_S;
  }
  if (bow.breathOutAt > 0 && now - bow.breathOutAt < BREATH_RECOVER_S) return 1.3;
  return 1;
}

export function canHoldBreath(bow: BowState, now: number): boolean {
  return bow.breathAt === 0 && (bow.breathOutAt === 0 || now - bow.breathOutAt >= BREATH_RECOVER_S);
}

/**
 * The reticle: one standard deviation of where the arrow lands, in metres at
 * the target. It shrinks as you settle after drawing and grows with distance,
 * movement, a long hold and a moving target.
 */
export function reticleSigma(
  bow: BowState,
  now: number,
  distance: number,
  moving: boolean,
  targetSpeed: number,
): number {
  const held = now - bow.drawnAt;
  const settle = 0.02 * Math.exp(-held / SETTLE_S);
  const fatigue = held > TIRE_AFTER_S ? (TIRE_RATE * (held - TIRE_AFTER_S)) / REAL : 0;
  const angular = (0.0035 + settle + (moving ? 0.015 : 0) + fatigue) * breathFactor(bow, now);
  return Math.min(1.5, angular * distance + 0.02 * targetSpeed);
}

/** A standard normal sample (Box–Muller). */
export function gaussian(rng: RngState): number {
  const u1 = Math.max(1e-12, nextFloat(rng));
  const u2 = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
