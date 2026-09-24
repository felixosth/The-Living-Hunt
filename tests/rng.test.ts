import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hash32 } from '../src/core/hash';
import {
  createStreams,
  nextFloat,
  nextInt,
  nextU32,
  pick,
  RNG_STREAMS,
  seedRng,
} from '../src/core/rng';

const draw = (seed: number, n: number) => {
  const s = seedRng(seed);
  return Array.from({ length: n }, () => nextU32(s));
};

describe('rng', () => {
  it('is reproducible for a seed and differs between seeds', () => {
    expect(draw(42, 20)).toEqual(draw(42, 20));
    expect(draw(42, 20)).not.toEqual(draw(43, 20));
  });

  it('resumes identically from a JSON copy of its state', () => {
    const s = seedRng(7);
    for (let i = 0; i < 5; i++) nextU32(s);
    const copy = JSON.parse(JSON.stringify(s));
    expect(Array.from({ length: 10 }, () => nextU32(copy))).toEqual(
      Array.from({ length: 10 }, () => nextU32(s)),
    );
  });

  it('produces floats in [0, 1) with a sensible mean', () => {
    const s = seedRng(1);
    let sum = 0;
    for (let i = 0; i < 20_000; i++) {
      const x = nextFloat(s);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 20_000).toBeCloseTo(0.5, 1);
  });

  it('nextInt covers its inclusive range', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: 0, max: 20 }),
        (seed, min, span) => {
          const s = seedRng(seed);
          for (let i = 0; i < 50; i++) {
            const v = nextInt(s, min, min + span);
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThanOrEqual(min + span);
          }
        },
      ),
    );
  });

  it('keeps named streams independent', () => {
    const a = createStreams(99);
    const b = createStreams(99);
    for (let i = 0; i < 100; i++) nextU32(a.ai); // heavy use of one stream…
    expect(nextU32(a.weather)).toBe(nextU32(b.weather)); // …leaves the others untouched
    expect(Object.keys(a).sort()).toEqual([...RNG_STREAMS].sort());
    expect(a.weather).not.toEqual(a.ecology);
  });

  it('pick refuses an empty list', () => {
    expect(() => pick(seedRng(1), [])).toThrow();
    expect(['x']).toContain(pick(seedRng(1), ['x']));
  });

  it('hash32 depends on every part and their order', () => {
    expect(hash32(1, 'a')).toBe(hash32(1, 'a'));
    expect(hash32(1, 'a')).not.toBe(hash32('a', 1));
    expect(hash32(1, 'region-a')).not.toBe(hash32(1, 'region-b'));
    expect(hash32(1, 2)).not.toBe(hash32(2, 1));
  });
});
