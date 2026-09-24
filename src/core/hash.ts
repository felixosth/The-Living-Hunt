/**
 * Small, fast, non-cryptographic hashes used for deriving seeds and
 * fingerprinting world state.
 */

/** Final avalanche step of MurmurHash3. Returns an unsigned 32-bit integer. */
export function fmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Combine any number of integers and strings into one unsigned 32-bit hash.
 * Used for derived seeds, e.g. `hash32(worldSeed, 'mapgen', regionId)`.
 */
export function hash32(...parts: ReadonlyArray<number | string>): number {
  let h = 0x9e3779b9;
  for (const part of parts) {
    if (typeof part === 'number') {
      h = fmix32(h ^ Math.imul((part | 0) + 0x7f4a7c15, 0x2c1b3c6d));
    } else {
      for (let i = 0; i < part.length; i++) {
        h = Math.imul(h ^ part.charCodeAt(i), 0x5bd1e995);
        h ^= h >>> 15;
      }
      h = fmix32(h ^ part.length);
    }
  }
  return h >>> 0;
}

/** cyrb53: a 53-bit string hash, returned as a 14-digit hex string. */
export function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, '0');
}
