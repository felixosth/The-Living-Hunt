/**
 * Where signs come from: strides lay prints (more often and clearer on soft
 * ground), feeding animals drop pellets and browse, and resting ones leave beds.
 */
import { SPECIES } from '../content/species';
import { chance, nextRange, type RngState } from '../core/rng';
import { coverAt, groundAt, type RegionMap } from './region';
import { addSign, PrintGait, SIGN_LIFETIME_H, SignKind, type SignStore } from './signs';
import type { Animal } from './state';

/** Distance between recorded prints, per gait (a record stands for a set of four feet). */
function strideLength(a: Animal): number {
  const flee = SPECIES[a.species].speed.flee;
  const base = a.species === 'roe' ? 4.5 : 3.5;
  return a.speed > flee * 0.6 ? base * 1.7 : a.speed > flee * 0.3 ? base * 1.3 : base;
}

function printGait(a: Animal): number {
  const flee = SPECIES[a.species].speed.flee;
  return a.speed > flee * 0.6
    ? PrintGait.Bound
    : a.speed > flee * 0.3
      ? PrintGait.Trot
      : PrintGait.Walk;
}

/** Lay prints along the line the animal just moved, from (x0, y0) to where it is now. */
export function emitPrints(
  store: SignStore,
  map: RegionMap,
  rng: RngState,
  a: Animal,
  x0: number,
  y0: number,
  now: number,
): void {
  const moved = Math.hypot(a.x - x0, a.y - y0);
  if (moved < 1e-6) return;
  const len = strideLength(a);
  a.stride += moved;
  while (a.stride >= len) {
    a.stride -= len;
    // Position of this stride along the segment.
    const back = Math.min(moved, a.stride) / moved;
    const x = a.x - (a.x - x0) * back;
    const y = a.y - (a.y - y0) * back;
    const ground = groundAt(map, x, y);
    if (!chance(rng, Math.min(1, ground.softness * 1.6))) continue;
    addSign(store, {
      kind: SignKind.Print,
      species: a.species,
      animal: a.id,
      x,
      y,
      t: now,
      heading: a.heading,
      detail: printGait(a),
      weight: a.weightKg,
      integrity: 0.35 + 0.65 * ground.softness,
      lifetimeH: 4 + (SIGN_LIFETIME_H.print - 4) * ground.softness ** 2,
    });
  }
}

/** Pellets and browse while feeding, over `dt` game seconds. */
export function emitFeedingSigns(
  store: SignStore,
  map: RegionMap,
  rng: RngState,
  a: Animal,
  dt: number,
  now: number,
): void {
  if (a.activity !== 'feeding') return;
  const hours = dt / 3600;
  const pelletsEvery = a.species === 'roe' ? 2.5 : 1.5;
  if (chance(rng, hours / pelletsEvery)) {
    addSign(store, {
      kind: SignKind.Pellets,
      species: a.species,
      animal: a.id,
      x: a.x + nextRange(rng, -0.5, 0.5),
      y: a.y + nextRange(rng, -0.5, 0.5),
      t: now,
      weight: a.weightKg,
      integrity: 1,
      lifetimeH: SIGN_LIFETIME_H.pellets,
    });
  }
  // Browse where there are shrubs and saplings to bite.
  const cover = coverAt(map, a.x, a.y);
  const browseEvery = a.species === 'roe' ? 0.7 : 2;
  if (cover > 0.2 && chance(rng, hours / browseEvery)) {
    const [lo, hi] = a.species === 'roe' ? [40, 110] : [15, 45];
    addSign(store, {
      kind: SignKind.Browse,
      species: a.species,
      animal: a.id,
      x: a.x + nextRange(rng, -1, 1),
      y: a.y + nextRange(rng, -1, 1),
      t: now,
      detail: Math.round(nextRange(rng, lo, hi) * (a.juvenile ? 0.8 : 1)),
      weight: a.weightKg,
      integrity: 1,
      lifetimeH: SIGN_LIFETIME_H.browse,
    });
  }
}

/** A bed, when an animal gets up after lying for half an hour or more. */
export function emitBed(store: SignStore, a: Animal, groupSize: number, now: number): void {
  addSign(store, {
    kind: SignKind.Bed,
    species: a.species,
    animal: a.id,
    x: a.x,
    y: a.y,
    t: now,
    heading: a.heading,
    detail: groupSize,
    weight: a.weightKg,
    integrity: 1,
    lifetimeH: SIGN_LIFETIME_H.bed,
  });
}

/** Blood along the line a wounded animal just moved, while it still bleeds. */
export function emitBlood(
  store: SignStore,
  rng: RngState,
  a: Animal,
  x0: number,
  y0: number,
  now: number,
): void {
  const w = a.wound;
  if (!w || w.bleed <= 0) return;
  const moved = Math.hypot(a.x - x0, a.y - y0);
  if (moved < 1e-6) return;
  const age = now - w.at;
  if (w.bleedFor > 0 && age > w.bleedFor) return;
  const rate = w.bleedFor > 0 ? w.bleed * (1 - age / w.bleedFor) : w.bleed;
  for (let d = nextRange(rng, 0, 1); d < moved; d += 1) {
    if (!chance(rng, rate)) continue;
    const k = d / moved;
    addSign(store, {
      kind: SignKind.Blood,
      species: a.species,
      animal: a.id,
      x: x0 + (a.x - x0) * k + nextRange(rng, -0.3, 0.3),
      y: y0 + (a.y - y0) * k + nextRange(rng, -0.3, 0.3),
      t: now,
      heading: a.heading,
      detail: w.blood,
      weight: a.weightKg,
      integrity: 1,
      lifetimeH: SIGN_LIFETIME_H.blood,
    });
  }
}
