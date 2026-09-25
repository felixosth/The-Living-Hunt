/**
 * The bow and what comes after: drawing on an animal, aiming on the shot
 * inset, releasing, and then recovering, field-dressing, carrying and
 * bringing the animal home to the cabin.
 */
import { bodyCentre } from '../content/anatomy';
import { BloodType } from '../content/blood';
import { CARRY_CAPACITY_KG } from '../content/gear';
import { SPECIES } from '../content/species';
import { clamp } from '../core/math';
import { chance, nextRange } from '../core/rng';
import { GAME_SECONDS_PER_REAL_SECOND } from '../core/time';
import { animalContext, applyHit, SUSPICIOUS } from './animals';
import type { SimEvent } from './events';
import { learn, lesson } from './knowledge';
import { sightlineObstruction } from './perception';
import { isWalkable, type RegionMap } from './region';
import {
  angleName,
  BOW_RANGE_M,
  canHoldBreath,
  castArrow,
  gaussian,
  jumpTheString,
  MAX_RELEASE_LEAD_S,
  relativeAngle,
  scatter,
  sway,
  swayInput,
} from './shot';
import { addSign, removeSign, SIGN_LIFETIME_H, SignKind } from './signs';
import type { Animal, HuntRecord, HuntSummary, PlayerState, WorldState } from './state';

/** Field dressing a roe deer, in game seconds. */
export const DRESS_SECONDS = 15 * 60;
/** Dressing removes the innards: about a quarter of the live weight. */
const DRESSED_FRACTION = 0.75;
export const INTERACT_RANGE_M = 2.5;
/** How close to the cabin door you must be to bring an animal home. */
export const CABIN_RANGE_M = 5;
/** Animals this close hear the bowstring. */
const TWANG_RANGE_M = 30;

function animalById(state: WorldState, id: number): Animal | undefined {
  return state.animals.find((a) => a.id === id);
}

function record(player: PlayerState, animalId: number): HuntRecord {
  const key = String(animalId);
  let r = player.hunts[key];
  if (!r) {
    r = {
      firstSignAt: 0,
      shotAt: 0,
      shotDistance: 0,
      shotAngle: '',
      zone: null,
      hitX: 0,
      hitY: 0,
      walkedAtShot: 0,
      diedAt: 0,
      deathX: 0,
      deathY: 0,
      trailWalked: 0,
      recoveredAt: 0,
    };
    player.hunts[key] = r;
  }
  return r;
}

/** Note the first time you found a sign of an animal, for the hunt summary. */
export function noteSignFound(player: PlayerState, animalId: number, now: number): void {
  const r = record(player, animalId);
  if (r.firstSignAt === 0) r.firstSignAt = now;
}

// ---------------------------------------------------------------------------
// The bow
// ---------------------------------------------------------------------------

/** Grazing or drinking, unaware: head down, not watching. */
export function isHeadDown(a: Animal): boolean {
  return (
    (a.activity === 'feeding' || a.activity === 'drinking') &&
    a.awareness < SUSPICIOUS &&
    a.speed < 2
  );
}

export function draw(state: WorldState, targetId: number): void {
  const p = state.player;
  if (p.bow || p.busy || p.carrying !== null || p.arrows <= 0) return;
  const a = animalById(state, targetId);
  if (!a || a.activity === 'dead' || !a.seen) return;
  if (Math.hypot(a.x - p.x, a.y - p.y) > BOW_RANGE_M) return;
  const centre = bodyCentre(a.species);
  p.bow = {
    target: a.id,
    drawnAt: state.time,
    aimU: centre.u,
    aimV: centre.v,
    breathAt: 0,
    breathOutAt: 0,
  };
}

export function aim(state: WorldState, u: number, v: number): void {
  const bow = state.player.bow;
  if (!bow || !Number.isFinite(u) || !Number.isFinite(v)) return;
  bow.aimU = Math.max(-1.5, Math.min(1.5, u));
  bow.aimV = Math.max(0, Math.min(1.6, v));
}

export function breath(state: WorldState, hold: boolean): void {
  const bow = state.player.bow;
  if (!bow) return;
  if (hold && canHoldBreath(bow, state.time)) bow.breathAt = state.time;
  if (!hold && bow.breathAt > 0) {
    bow.breathAt = 0;
    bow.breathOutAt = state.time;
  }
}

export function lower(state: WorldState): void {
  state.player.bow = null;
}

/** Loose the arrow. The reticle decides where it strikes; the anatomy decides what that means. */
export function release(state: WorldState, map: RegionMap, events: SimEvent[], lead = 0): void {
  const p = state.player;
  const bow = p.bow;
  if (!bow) return;
  p.bow = null;
  const a = animalById(state, bow.target);
  if (!a || a.activity === 'dead' || p.arrows <= 0) return;
  const rng = state.rng.combat;
  const d = Math.hypot(a.x - p.x, a.y - p.y);
  const theta = relativeAngle(a.heading, p.x, p.y, a.x, a.y);
  const moving = p.moveX !== 0 || p.moveY !== 0;
  // The arrow goes where the drifting aim was at the click, plus a scatter you can't time.
  const at = state.time + clamp(lead, 0, MAX_RELEASE_LEAD_S) * GAME_SECONDS_PER_REAL_SECOND;
  const drift = sway(swayInput(bow, d, moving, p.knowledge.hands.bow), at);
  const sigma = scatter(d, a.speed, p.knowledge.hands.bow);
  // An animal on edge may jump the string: where you aimed is no longer where the body is.
  const jump = jumpTheString(a.species, theta, d, a.awareness, rng);
  const u = bow.aimU + drift.u + gaussian(rng) * sigma + jump.du;
  const v = bow.aimV + drift.v + gaussian(rng) * sigma + jump.dv;
  // A flinch of a few centimetres goes unnoticed; a real jump is worth telling.
  const ducked = Math.hypot(jump.du, jump.dv) > 0.1;
  // Twigs and branches in the way can turn an arrow.
  const brush = sightlineObstruction(map, p.x, p.y, a.x, a.y);
  const result = chance(rng, brush * 0.9)
    ? { zone: 'miss' as const, passThrough: true, tainted: false }
    : castArrow(a.species, theta, u, v, rng, isHeadDown(a), d);
  p.arrows--;
  // Every shot is practice; a clean one teaches more.
  const clean = result.zone === 'heart' || result.zone === 'lungs';
  learn(p.knowledge, 'hands', 'bow', lesson(clean ? 0.25 : 0.15, p.knowledge.hands.bow), events);

  const r = record(p, a.id);
  r.shotAt = state.time;
  r.shotDistance = Math.round(d);
  r.shotAngle = angleName(theta);
  r.zone = result.zone;
  r.hitX = a.x;
  r.hitY = a.y;
  r.walkedAtShot = p.walked;

  const hit = result.zone !== 'miss';
  const lodged = hit && !result.passThrough;
  let endX = a.x;
  let endY = a.y;
  if (!lodged) {
    // The arrow flies on and lands beyond the animal.
    const fire = Math.atan2(a.y - p.y, a.x - p.x) + nextRange(rng, -0.08, 0.08);
    const beyond = d + (hit ? nextRange(rng, 2, 10) : nextRange(rng, 5, 25));
    const x = p.x + Math.cos(fire) * beyond;
    const y = p.y + Math.sin(fire) * beyond;
    endX = x;
    endY = y;
    if (isWalkable(map, x, y)) {
      addSign(state.signs, {
        kind: SignKind.Arrow,
        species: a.species,
        animal: a.id,
        x,
        y,
        t: state.time,
        heading: fire,
        detail: hit ? bloodOnArrow(result.zone) : BloodType.None,
        weight: a.weightKg,
        integrity: 1,
        lifetimeH: SIGN_LIFETIME_H.arrow,
      });
    }
  }

  const ctx = animalContext(state, map, events);
  // Everything close by hears the string.
  for (const other of state.animals) {
    if (other === a || other.activity === 'dead') continue;
    if (Math.hypot(other.x - p.x, other.y - p.y) > TWANG_RANGE_M) continue;
    other.awareness = Math.max(other.awareness, 0.5);
    other.alarmX = p.x;
    other.alarmY = p.y;
  }
  applyHit(a, ctx, result.zone, result.tainted, lodged, p.x, p.y);
  events.push({
    type: 'shot',
    animalId: a.id,
    hit,
    dropped: result.zone === 'spine',
    ducked,
    fromX: p.x,
    fromY: p.y,
    atX: a.x,
    atY: a.y,
    endX,
    endY,
  });
}

function bloodOnArrow(zone: string): number {
  switch (zone) {
    case 'heart':
      return BloodType.Bright;
    case 'lungs':
      return BloodType.Frothy;
    case 'liver':
      return BloodType.Dark;
    case 'gut':
      return BloodType.Gut;
    case 'muscle':
      return BloodType.Sparse;
    default:
      return BloodType.Graze;
  }
}

// ---------------------------------------------------------------------------
// Recovery: interact (E)
// ---------------------------------------------------------------------------

/** What E would do here, for the HUD prompt. */
export function interactPrompt(state: WorldState, map: RegionMap): string | null {
  const p = state.player;
  if (p.busy === 'dress') return null;
  if (p.carrying !== null) {
    const a = animalById(state, p.carrying);
    const name = a ? SPECIES[a.species].name : 'animal';
    return Math.hypot(p.x - map.spawn.x, p.y - map.spawn.y) <= CABIN_RANGE_M
      ? `Bring the ${name} into the cabin`
      : `Put down the ${name}`;
  }
  if (nearestArrow(state) >= 0) return 'Pick up your arrow';
  const a = nearestCarcass(state);
  if (!a?.carcass) return null;
  const name = SPECIES[a.species].name;
  if (!a.carcass.dressed && a.species === 'roe') return `Field-dress the ${name}`;
  return a.carcass.weightKg > CARRY_CAPACITY_KG
    ? `Too heavy to carry (${Math.round(a.carcass.weightKg)} kg)`
    : `Pick up the ${name} (${a.carcass.weightKg.toFixed(1)} kg)`;
}

function nearestArrow(state: WorldState): number {
  const { signs, player } = state;
  let best = -1;
  let bestD = INTERACT_RANGE_M;
  for (let i = 0; i < signs.count; i++) {
    if (signs.kind[i] !== SignKind.Arrow || (signs.integrity[i] as number) <= 0) continue;
    const d = Math.hypot((signs.x[i] as number) - player.x, (signs.y[i] as number) - player.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function nearestCarcass(state: WorldState): Animal | null {
  const p = state.player;
  let best: Animal | null = null;
  let bestD = INTERACT_RANGE_M;
  for (const a of state.animals) {
    if (a.activity !== 'dead' || a.id === p.carrying) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

export function interact(state: WorldState, map: RegionMap, events: SimEvent[]): void {
  const p = state.player;
  if (p.busy || p.bow) return;
  if (p.carrying !== null) {
    const a = animalById(state, p.carrying);
    if (a && Math.hypot(p.x - map.spawn.x, p.y - map.spawn.y) <= CABIN_RANGE_M) {
      deliver(state, a, events);
    } else {
      p.carrying = null;
      p.load = 0;
      if (a) events.push({ type: 'dropped', species: a.species });
    }
    return;
  }
  const arrow = nearestArrow(state);
  if (arrow >= 0) {
    removeSign(state.signs, arrow);
    p.arrows++;
    events.push({ type: 'pickedUp', what: 'arrow' });
    return;
  }
  const a = nearestCarcass(state);
  if (!a?.carcass) return;
  if (!a.carcass.dressed && a.species === 'roe') {
    p.busy = 'dress';
    p.busyUntil = state.time + DRESS_SECONDS;
    p.busyTarget = a.id;
    return;
  }
  if (a.carcass.weightKg > CARRY_CAPACITY_KG) {
    events.push({ type: 'tooHeavy', weightKg: a.carcass.weightKg });
    return;
  }
  p.carrying = a.id;
  p.load = a.carcass.weightKg;
  events.push({ type: 'pickedUp', what: 'carcass', species: a.species, weightKg: p.load });
}

function deliver(state: WorldState, a: Animal, events: SimEvent[]): void {
  const p = state.player;
  const c = a.carcass;
  if (!c) return;
  const r = record(p, a.id);
  const handled = c.dressed ? c.dressedAt : state.time;
  const meat: HuntSummary['meat'] = c.tainted
    ? 'tainted'
    : handled - c.diedAt > 6 * 3600
      ? 'poor'
      : 'good';
  const summary: HuntSummary = {
    animalId: a.id,
    species: a.species,
    sex: a.sex,
    juvenile: a.juvenile,
    liveWeightKg: a.weightKg,
    carcassWeightKg: Math.round(c.weightKg * 10) / 10,
    dressed: c.dressed,
    firstSignAt: r.firstSignAt,
    shotAt: r.shotAt,
    recoveredAt: r.recoveredAt,
    deliveredAt: state.time,
    shotDistance: r.shotDistance,
    shotAngle: r.shotAngle,
    zone: c.zone,
    ranM: Math.round(Math.hypot(r.deathX - r.hitX, r.deathY - r.hitY)),
    trailWalkedM: Math.round(r.trailWalked),
    meat,
  };
  p.trophies.push(summary);
  delete p.hunts[String(a.id)];
  state.animals = state.animals.filter((x) => x !== a);
  p.carrying = null;
  p.load = 0;
  learn(p.knowledge, 'species', a.species, lesson(0.3, p.knowledge.species[a.species]), events);
  events.push({ type: 'delivered', summary });
}

/** Per-step upkeep: dressing, the carried carcass, recovery bookkeeping, the drawn bow. */
export function updateHunting(state: WorldState, dt: number, events: SimEvent[]): void {
  const p = state.player;
  if (p.busy === 'dress' && state.time + dt >= p.busyUntil) {
    p.busy = null;
    const a = animalById(state, p.busyTarget);
    if (a?.carcass && !a.carcass.dressed) {
      a.carcass.dressed = true;
      a.carcass.dressedAt = state.time + dt;
      a.carcass.weightKg = Math.round(a.weightKg * DRESSED_FRACTION * 10) / 10;
      const arrowBack = a.carcass.lodgedArrow;
      if (arrowBack) {
        a.carcass.lodgedArrow = false;
        p.arrows++;
      }
      // Handling the animal is the best teacher of its size and anatomy.
      learn(p.knowledge, 'species', a.species, lesson(0.6, p.knowledge.species[a.species]), events);
      learn(p.knowledge, 'signs', 'blood', lesson(0.2, p.knowledge.signs.blood), events);
      events.push({
        type: 'dressed',
        animalId: a.id,
        species: a.species,
        liveWeightKg: a.weightKg,
        arrowBack,
      });
    }
  }
  if (p.carrying !== null) {
    const a = animalById(state, p.carrying);
    if (a) {
      a.x = p.x;
      a.y = p.y;
    }
  }
  for (const a of state.animals) {
    if (a.activity !== 'dead') continue;
    const r = p.hunts[String(a.id)];
    if (!r || r.recoveredAt > 0) continue;
    if (Math.hypot(a.x - p.x, a.y - p.y) < 4) {
      r.recoveredAt = state.time;
      r.trailWalked = p.walked - r.walkedAtShot;
    }
  }
  if (p.bow) {
    const a = animalById(state, p.bow.target);
    if (!a || a.activity === 'dead' || Math.hypot(a.x - p.x, a.y - p.y) > BOW_RANGE_M * 1.2) {
      p.bow = null;
    }
  }
}
