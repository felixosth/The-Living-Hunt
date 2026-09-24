/**
 * Seeded pseudo-random number generation.
 *
 * Every random decision in the simulation draws from a named stream whose
 * state lives inside the world state, so a saved game resumes the exact same
 * random sequence. Streams are independent: adding a random call to animal AI
 * never shifts the weather.
 */
import { hash32 } from './hash';

/** sfc32 generator state: four unsigned 32-bit words. Plain data, JSON-safe. */
export type RngState = [number, number, number, number];

export const RNG_STREAMS = [
  'weather',
  'ecology',
  'economy',
  'society',
  'ai',
  'signs',
  'combat',
] as const;
export type RngStream = (typeof RNG_STREAMS)[number];
export type RngStreams = Record<RngStream, RngState>;

/** Create a generator state from a 32-bit seed. */
export function seedRng(seed: number): RngState {
  // splitmix32 to spread the seed over all four words.
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  const state: RngState = [next(), next(), next(), next()];
  // Discard the first outputs; sfc32 needs a few rounds to mix weak seeds.
  for (let i = 0; i < 12; i++) nextU32(state);
  return state;
}

/** Create one independent state per named stream, all derived from the world seed. */
export function createStreams(worldSeed: number): RngStreams {
  const streams = {} as RngStreams;
  for (const name of RNG_STREAMS) streams[name] = seedRng(hash32(worldSeed, 'rng', name));
  return streams;
}

/** Advance the generator (mutating `s`) and return an unsigned 32-bit integer. */
export function nextU32(s: RngState): number {
  let [a, b, c, d] = s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  s[0] = a >>> 0;
  s[1] = b >>> 0;
  s[2] = c >>> 0;
  s[3] = d >>> 0;
  return t >>> 0;
}

/** Uniform float in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** Uniform float in [min, max). */
export function nextRange(s: RngState, min: number, max: number): number {
  return min + (max - min) * nextFloat(s);
}

/** Uniform integer in [min, max] (inclusive). */
export function nextInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}

/** True with probability `p`. */
export function chance(s: RngState, p: number): boolean {
  return nextFloat(s) < p;
}

/** Pick a uniformly random element of a non-empty array. */
export function pick<T>(s: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from an empty array');
  return items[Math.floor(nextFloat(s) * items.length)] as T;
}

/** Wrap a state as a `() => number` for libraries that expect Math.random's shape. */
export function asRandomFn(s: RngState): () => number {
  return () => nextFloat(s);
}
