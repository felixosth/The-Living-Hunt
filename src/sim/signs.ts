/**
 * Signs: records of what actually happened. Animals lay prints, pellets, beds
 * and browse as they go (and blood when wounded); each sign stores the true
 * facts at the moment it was made and fades with time and ground.
 *
 * Stored column-wise in typed arrays so saves stay compact with thousands of
 * signs. Records are addressed by index; `id` is the stable identity.
 */
import { SPECIES_IDS, type SpeciesId } from '../content/species';

export const SignKind = {
  Print: 0,
  Pellets: 1,
  Bed: 2,
  Browse: 3,
  Blood: 4,
  Arrow: 5,
} as const;
export type SignKind = (typeof SignKind)[keyof typeof SignKind];
export const SIGN_KIND_NAMES = ['print', 'pellets', 'bed', 'browse', 'blood', 'arrow'] as const;
export type SignKindName = (typeof SIGN_KIND_NAMES)[number];

/** Gaits recorded in prints. */
export const PrintGait = { Walk: 0, Trot: 1, Bound: 2 } as const;

export const SignFlag = {
  /** The player has found it. */
  Noticed: 1,
  /** The player has read it. */
  Inspected: 2,
  /** Part of the trail the player is following. */
  Followed: 4,
  /** Made in snow: crisp and easy to see. */
  InSnow: 8,
} as const;

/** Hours a sign lasts from full integrity, by kind (prints depend on the ground). */
export const SIGN_LIFETIME_H: Record<SignKindName, number> = {
  print: 48,
  pellets: 168,
  bed: 36,
  browse: 240,
  blood: 18,
  arrow: 24 * 365,
};

/** Integrity below which a sign is gone. */
export const SIGN_MIN_INTEGRITY = 0.05;

export interface SignStore {
  count: number;
  nextId: number;
  /** Bumped whenever noticed signs change, so views know to redraw. */
  revision: number;
  id: Uint32Array;
  kind: Uint8Array;
  /** Index into SPECIES_IDS. */
  species: Uint8Array;
  animal: Uint32Array;
  x: Float32Array;
  y: Float32Array;
  /** Game time it was made. */
  t: Float64Array;
  /** Direction of travel (prints), radians. */
  heading: Float32Array;
  /** Kind-specific: print gait, bed group size, browse height (cm), blood type. */
  detail: Uint8Array;
  /** True live weight of the maker, kg. */
  weight: Float32Array;
  integrity: Float32Array;
  /** Integrity lost per game hour. */
  decay: Float32Array;
  flags: Uint8Array;
}

const COLUMNS = [
  'id',
  'kind',
  'species',
  'animal',
  'x',
  'y',
  't',
  'heading',
  'detail',
  'weight',
  'integrity',
  'decay',
  'flags',
] as const;
type Column = (typeof COLUMNS)[number];

export function createSignStore(capacity = 256): SignStore {
  return {
    count: 0,
    nextId: 1,
    revision: 0,
    id: new Uint32Array(capacity),
    kind: new Uint8Array(capacity),
    species: new Uint8Array(capacity),
    animal: new Uint32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    t: new Float64Array(capacity),
    heading: new Float32Array(capacity),
    detail: new Uint8Array(capacity),
    weight: new Float32Array(capacity),
    integrity: new Float32Array(capacity),
    decay: new Float32Array(capacity),
    flags: new Uint8Array(capacity),
  };
}

function resize(store: SignStore, capacity: number): void {
  for (const col of COLUMNS) {
    const old = store[col];
    const Ctor = old.constructor as new (n: number) => typeof old;
    const next = new Ctor(capacity);
    next.set(old.subarray(0, Math.min(store.count, capacity)) as never);
    (store as unknown as Record<Column, typeof old>)[col] = next;
  }
}

export interface NewSign {
  kind: SignKind;
  species: SpeciesId;
  animal: number;
  x: number;
  y: number;
  t: number;
  heading?: number;
  detail?: number;
  weight: number;
  /** Starting integrity (clarity), 0..1. */
  integrity: number;
  /** Hours until it fades from full integrity. */
  lifetimeH: number;
  flags?: number;
}

export function addSign(store: SignStore, s: NewSign): number {
  if (store.count === store.id.length) resize(store, store.id.length * 2);
  const i = store.count++;
  const id = store.nextId++;
  store.id[i] = id;
  store.kind[i] = s.kind;
  store.species[i] = SPECIES_IDS.indexOf(s.species);
  store.animal[i] = s.animal;
  store.x[i] = s.x;
  store.y[i] = s.y;
  store.t[i] = s.t;
  store.heading[i] = s.heading ?? 0;
  store.detail[i] = s.detail ?? 0;
  store.weight[i] = s.weight;
  store.integrity[i] = s.integrity;
  store.decay[i] = 1 / Math.max(0.1, s.lifetimeH);
  store.flags[i] = s.flags ?? 0;
  return id;
}

/** Index of the sign with this id, or -1. */
export function findSign(store: SignStore, id: number): number {
  for (let i = 0; i < store.count; i++) if (store.id[i] === id) return i;
  return -1;
}

/** A plain copy of one sign, for readings and views. */
export interface SignRecord {
  id: number;
  kind: SignKind;
  kindName: SignKindName;
  species: SpeciesId;
  animal: number;
  x: number;
  y: number;
  t: number;
  heading: number;
  detail: number;
  weight: number;
  integrity: number;
  flags: number;
}

export function signAt(store: SignStore, i: number): SignRecord {
  const kind = store.kind[i] as SignKind;
  return {
    id: store.id[i] as number,
    kind,
    kindName: SIGN_KIND_NAMES[kind],
    species: SPECIES_IDS[store.species[i] as number] as SpeciesId,
    animal: store.animal[i] as number,
    x: store.x[i] as number,
    y: store.y[i] as number,
    t: store.t[i] as number,
    heading: store.heading[i] as number,
    detail: store.detail[i] as number,
    weight: store.weight[i] as number,
    integrity: store.integrity[i] as number,
    flags: store.flags[i] as number,
  };
}

/** Fade every sign by `hours` and drop the ones that are gone. */
export function decaySigns(store: SignStore, hours: number): void {
  let w = 0;
  for (let r = 0; r < store.count; r++) {
    const integrity = (store.integrity[r] as number) - (store.decay[r] as number) * hours;
    if (integrity < SIGN_MIN_INTEGRITY) continue;
    if (w !== r) for (const col of COLUMNS) store[col][w] = store[col][r] as number;
    store.integrity[w] = integrity;
    w++;
  }
  store.count = w;
  // Faded noticed signs look different, so redraw them.
  store.revision++;
  if (store.id.length > 4 * (w + 256)) resize(store, Math.max(256, 2 * w));
}

/**
 * What an hour of weather does to the signs: rain wears prints and blood
 * away, new snow buries what lies on the ground, and melting blurs prints
 * made in the snow. Browse on the twigs and arrows are left alone.
 */
export function weatherSigns(
  store: SignStore,
  rainMm: number,
  newSnowCm: number,
  meltCm: number,
): void {
  if (rainMm <= 0 && newSnowCm <= 0 && meltCm <= 0) return;
  for (let i = 0; i < store.count; i++) {
    const kind = store.kind[i] as SignKind;
    const loss = SIGN_WEATHERING[kind];
    if (!loss) continue;
    const snowy = ((store.flags[i] as number) & SignFlag.InSnow) !== 0;
    const lost = rainMm * loss.rain + newSnowCm / loss.buriedCm + (snowy ? meltCm * loss.melt : 0);
    store.integrity[i] = (store.integrity[i] as number) - lost;
  }
  store.revision++;
}

/** Integrity lost per mm of rain, the snow depth that buries a sign, and loss per cm of melt. */
const SIGN_WEATHERING: Partial<Record<SignKind, { rain: number; buriedCm: number; melt: number }>> =
  {
    [SignKind.Print]: { rain: 0.08, buriedCm: 3, melt: 0.3 },
    [SignKind.Blood]: { rain: 0.25, buriedCm: 2, melt: 0.2 },
    [SignKind.Pellets]: { rain: 0.01, buriedCm: 4, melt: 0 },
    [SignKind.Bed]: { rain: 0.03, buriedCm: 6, melt: 0.15 },
  };

/** Remove the sign at index `i` entirely (e.g. an arrow you picked up), keeping the order. */
export function removeSign(store: SignStore, i: number): void {
  if (i < 0 || i >= store.count) return;
  for (const col of COLUMNS) store[col].copyWithin(i, i + 1, store.count);
  store.count--;
  store.revision++;
}

/** Set `flag` (one or more bits) on a sign. */
export function setFlag(store: SignStore, i: number, flag: number): void {
  if (((store.flags[i] as number) & flag) !== flag) {
    store.flags[i] = (store.flags[i] as number) | flag;
    store.revision++;
  }
}

export function clearFlag(store: SignStore, flag: number): void {
  let changed = false;
  for (let i = 0; i < store.count; i++) {
    if ((store.flags[i] as number) & flag) {
      store.flags[i] = (store.flags[i] as number) & ~flag;
      changed = true;
    }
  }
  if (changed) store.revision++;
}
