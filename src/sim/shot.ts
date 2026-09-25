/**
 * The shot: the target's side view at its angle to you, the aiming reticle,
 * and where an arrow goes when it's released.
 *
 * View coordinates are metres on a vertical plane through the animal, square
 * to the line of fire: u to the right as you look, v up from the ground.
 */
import { anatomyFor, type Part, type PartId } from '../content/anatomy';
import type { SpeciesId } from '../content/species';
import { hash32 } from '../core/hash';
import { chance, nextFloat, type RngState } from '../core/rng';
import { GAME_SECONDS_PER_REAL_SECOND as REAL } from '../core/time';
import { MAX_LEVEL } from './knowledge';
import type { BowState, HitZone } from './state';

/** Chance per unit of brush in the line that a twig turns the arrow. */
export const TWIG_TURNS = 0.9;

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
/** Past a held breath, the drift doubles and a tremor builds every 1.5 real seconds or so. */
const SHAKE_S = 1.5 * REAL;
/** Settling after the draw: the extra drift shrinks by two-thirds every 1.2 real seconds. */
const SETTLE_S = 1.2 * REAL;
/** Your arms tire after holding at full draw for 12 real seconds. */
const TIRE_AFTER_S = 12 * REAL;
/** Then the aim wanders more by this many radians per real second. */
const TIRE_RATE = 0.002;
/** How far ahead of the last tick a release can be timed, in real seconds (one tick and a bit). */
export const MAX_RELEASE_LEAD_S = 0.15;

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

const OUTER: readonly PartId[] = ['body', 'neck', 'head', 'leg'];

/** Whether an arrow crossing the view plane at (u, v) strikes the animal at all. */
export function strikesBody(
  species: SpeciesId,
  theta: number,
  u: number,
  v: number,
  headDown = false,
): boolean {
  return anatomyFor(species, headDown).some((part) => {
    if (!OUTER.includes(part.id)) return false;
    const t = pierce(part, theta, u, v);
    return t !== null && t[1] > 0;
  });
}

/** How far an arrow gets through a roe deer, metres of body: less at long range. */
export function penetration(species: SpeciesId, distance: number): number {
  const far = Math.min(1, Math.max(0, distance) / BOW_RANGE_M);
  return (species === 'hare' ? 2 : 0.7) * (1 - 0.25 * far);
}

/** Chance the shoulder blade stops the arrow; a slower arrow at range is stopped more often. */
function shoulderStops(distance: number): number {
  return 0.55 + 0.3 * Math.min(1, Math.max(0, distance) / BOW_RANGE_M);
}

/**
 * Follow an arrow striking the view plane at (u, v) through an animal at
 * angle `theta`, shot from `distance` metres.
 */
export function castArrow(
  species: SpeciesId,
  theta: number,
  u: number,
  v: number,
  rng: RngState,
  headDown = false,
  distance = 0,
): ShotResult {
  const parts = anatomyFor(species, headDown);
  const hits = parts
    .map((part) => ({ part, t: pierce(part, theta, u, v) }))
    .filter((h): h is { part: Part; t: [number, number] } => h.t !== null && h.t[1] > 0)
    .sort((x, y) => x.t[0] - y.t[0]);
  const outer = hits.find((h) => OUTER.includes(h.part.id));
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
  let budget = penetration(species, distance);
  const found = new Set<PartId>();
  for (const h of hits) {
    if (h.part === outer.part || h.t[0] > enter + budget) continue;
    if (h.part.id === 'shoulder') {
      if (chance(rng, shoulderStops(distance))) {
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

export type BreathState = 'breathing' | 'holding' | 'shaking' | 'recovering';

export function breathState(bow: BreathTimes, now: number): BreathState {
  if (bow.breathAt > 0) return now - bow.breathAt <= BREATH_HOLD_S ? 'holding' : 'shaking';
  if (bow.breathOutAt > 0 && now - bow.breathOutAt < BREATH_RECOVER_S) return 'recovering';
  return 'breathing';
}

type BreathTimes = Pick<BowState, 'breathAt' | 'breathOutAt'>;

export function canHoldBreath(bow: BreathTimes, now: number): boolean {
  return bow.breathAt === 0 && (bow.breathOutAt === 0 || now - bow.breathOutAt >= BREATH_RECOVER_S);
}

/**
 * Practice with the bow (experience 0–5) steadies you a little: at most a
 * fifth less drift, tremor and scatter, and a slower drift.
 */
export function practiceShare(bowXp: number): number {
  return Math.max(0, Math.min(1, bowXp / (MAX_LEVEL + 1)));
}

/** Everything the aim's movement depends on; the UI draws it from the same numbers. */
export interface SwayInput extends BreathTimes {
  target: number;
  drawnAt: number;
  distance: number;
  /** You are creeping with the bow drawn. */
  moving: boolean;
  /** Experience with the bow. */
  bowXp: number;
  /** How fast the target is moving, metres per game minute. */
  targetSpeed: number;
}

/** The sway input for a drawn bow. */
export function swayInput(
  bow: BowState,
  distance: number,
  moving: boolean,
  bowXp: number,
  targetSpeed = 0,
): SwayInput {
  return {
    target: bow.target,
    drawnAt: bow.drawnAt,
    breathAt: bow.breathAt,
    breathOutAt: bow.breathOutAt,
    distance,
    moving,
    bowXp,
    targetSpeed,
  };
}

export interface Sway {
  /** Where the arrow would go now, relative to your aim point, in metres at the target. */
  u: number;
  v: number;
  /** Half-width of the slow drift, metres. */
  drift: number;
  /** Size of the fast tremor, metres. */
  tremor: number;
}

/**
 * How your aim moves while you hold the bow drawn: a slow drift from your
 * body and breathing, plus a fast tremor when you are out of breath or your
 * arms are tiring. The arrow flies wherever the aim is at the moment you
 * release, so the skill is to release as the drift crosses the vitals.
 *
 * Deterministic in game time, so the sim and the shot inset agree.
 */
export function sway(input: SwayInput, now: number): Sway {
  const held = Math.max(0, now - input.drawnAt);
  const practice = practiceShare(input.bowXp);
  const steady = 1 - 0.2 * practice;
  const settle = 0.02 * Math.exp(-held / SETTLE_S);
  const tired = held > TIRE_AFTER_S ? (TIRE_RATE * (held - TIRE_AFTER_S)) / REAL : 0;

  let breathDrift = 1;
  let breathTremor = 0;
  switch (breathState(input, now)) {
    case 'holding':
      // Breathing out and holding calms you over half a second.
      breathDrift = 1 - 0.5 * Math.min(1, (now - input.breathAt) / (0.5 * REAL));
      break;
    case 'shaking': {
      const over = (now - input.breathAt - BREATH_HOLD_S) / SHAKE_S;
      breathDrift = Math.min(1.5, 0.5 + over);
      breathTremor = Math.min(0.02, 0.006 * over);
      break;
    }
    case 'recovering':
      breathDrift = 1.2;
      breathTremor = 0.001;
      break;
  }
  const driftAngle =
    (0.0035 + settle + (input.moving ? 0.015 : 0) + 0.5 * tired) * breathDrift * steady;
  const tremorAngle = (breathTremor + 0.6 * tired) * steady;
  const drift = driftAngle * input.distance;
  const tremor = tremorAngle * input.distance;

  // Real seconds since the draw, slowed a little by practice.
  const t = held / REAL;
  const slow = 1 - 0.25 * practice;
  const ph = phases(input.target, input.drawnAt);
  const wave = (hz: number, k: number) => Math.sin(TAU * hz * t + (ph[k] as number));
  const pu = 0.7 * wave(0.23 * slow, 0) + 0.35 * wave(0.61 * slow, 1);
  const pv = 0.6 * wave(0.29 * slow, 2) + 0.4 * wave(0.73 * slow, 3);
  const tu = 0.7 * wave(3.1, 4) + 0.3 * wave(5.3, 5);
  const tv = 0.7 * wave(2.7, 6) + 0.3 * wave(4.9, 7);
  return { u: drift * pu + tremor * tu, v: drift * pv + tremor * tv, drift, tremor };
}

const TAU = Math.PI * 2;

/** Fixed per draw, so each draw drifts its own way. */
function phases(target: number, drawnAt: number): number[] {
  return Array.from(
    { length: 8 },
    (_, k) => ((hash32(target, drawnAt, k) % 6283) / 1000) as number,
  );
}

/**
 * Scatter you can't see or time: release, string and arrow. One standard
 * deviation of the landing point around the crosshair, in metres at the
 * target. It shows how ready you are: twice as wide just after the draw,
 * settling with the drift, a little tighter with a held breath, and wider
 * again when you shake or your arms tire. A moving target adds a little too,
 * since its gait isn't perfectly steady. (That it moves on while the arrow
 * flies is `travelDuringFlight`.)
 */
export function scatter(input: SwayInput, now: number): number {
  const held = Math.max(0, now - input.drawnAt);
  const steady = 1 - 0.2 * practiceShare(input.bowXp);
  let form = 1 + Math.exp(-held / SETTLE_S);
  if (held > TIRE_AFTER_S) form += Math.min(1, (0.05 * (held - TIRE_AFTER_S)) / REAL);
  switch (breathState(input, now)) {
    case 'holding':
      form *= 0.85;
      break;
    case 'shaking':
      form *= 1 + Math.min(1, (now - input.breathAt - BREATH_HOLD_S) / (2 * SHAKE_S));
      break;
    case 'recovering':
      form *= 1.1;
      break;
  }
  return Math.min(1.5, 0.002 * input.distance * steady * form + 0.006 * input.targetSpeed);
}

/** How long an arrow takes to reach the target, in real seconds (game minutes at normal speed). */
export function flightTime(distance: number): number {
  return distance / ARROW_SPEED;
}

/**
 * How far a moving animal carries its body on while the arrow flies, as a
 * shift of the arrow's mark on the side view: it strikes further back than
 * you aimed, by speed × flight time. Lead a moving animal, or stop it first.
 * `speed` is metres per game minute.
 */
export function travelDuringFlight(speed: number, distance: number, theta: number): number {
  return -speed * flightTime(distance) * Math.sin(theta);
}

/** Arrow speed from a hunting bow, metres per real second. */
export const ARROW_SPEED = 60;
const SOUND_SPEED = 343;

export interface StringJump {
  /** How far the body moved on the view plane before the arrow arrived, metres. */
  du: number;
  dv: number;
}

/**
 * Jumping the string: an animal already on edge reacts to the twang of the
 * string. It drops to load its legs and lurches forward before the arrow
 * gets there, so the arrow strikes higher and further back than you aimed:
 * over its back, into the spine, or back into the liver and gut.
 *
 * Only an animal that is suspicious or alarmed reacts at all, and only at
 * range: close up, the arrow is there before it can move.
 */
export function jumpTheString(
  species: SpeciesId,
  theta: number,
  distance: number,
  awareness: number,
  rng: RngState,
): StringJump {
  const still = { du: 0, dv: 0 };
  if (awareness < 0.3) return still;
  const edge = Math.min(1, (awareness - 0.3) / 0.5);
  if (!chance(rng, 0.25 + 0.65 * edge)) return still;
  // The sound reaches it first; a tense animal reacts in a tenth of a second or so.
  const reaction = 0.18 - 0.08 * edge;
  const moving = flightTime(distance) - distance / SOUND_SPEED - reaction;
  if (moving <= 0) return still;
  const k = species === 'hare' ? 0.45 : 1;
  const drop = Math.min(0.25 * k, 1.0 * k * moving);
  const lurch = Math.min(0.3 * k, 1.0 * k * moving);
  // Relative to the body, the arrow's mark moves up and back towards the tail.
  return { du: -lurch * Math.sin(theta), dv: drop };
}

/** A standard normal sample (Box–Muller). */
export function gaussian(rng: RngState): number {
  const u1 = Math.max(1e-12, nextFloat(rng));
  const u2 = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
