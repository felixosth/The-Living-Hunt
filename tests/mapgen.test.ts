import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/content/terrain';
import { generateTestRegion } from '../src/sim/mapgen/testRegion';
import { getRegionMap, isWalkable, regionWidthM, terrainAt } from '../src/sim/region';

describe('test region generation', () => {
  it('is deterministic in (seed, region)', () => {
    const a = generateTestRegion(5, 'test-forest');
    const b = generateTestRegion(5, 'test-forest');
    expect(a.terrain).toEqual(b.terrain);
    expect(a.trees).toEqual(b.trees);
    expect(a.spawn).toEqual(b.spawn);
  });

  it('differs between seeds', () => {
    expect(generateTestRegion(5, 'test-forest').terrain).not.toEqual(
      generateTestRegion(6, 'test-forest').terrain,
    );
  });

  it.each([1, 2, 3, 42, 1234])(
    'seed %i has varied ground, trees and a walkable meadow spawn',
    (seed) => {
      const map = generateTestRegion(seed, 'test-forest');
      const present = new Set(map.terrain);
      for (const t of [Terrain.Grass, Terrain.Forest, Terrain.DeepWater, Terrain.Shallows]) {
        expect(present.has(t)).toBe(true);
      }
      expect(terrainAt(map, map.spawn.x, map.spawn.y)).toBe(Terrain.Grass);
      expect(isWalkable(map, map.spawn.x, map.spawn.y)).toBe(true);
      expect(map.trees.length / 3).toBeGreaterThan(1000);
      for (let i = 0; i < map.trees.length; i += 3) {
        expect(map.trees[i]).toBeGreaterThanOrEqual(0);
        expect(map.trees[i]).toBeLessThan(regionWidthM(map));
      }
    },
  );

  it('memoises generated regions', () => {
    expect(getRegionMap(77, 'test-forest')).toBe(getRegionMap(77, 'test-forest'));
    expect(() => getRegionMap(77, 'no-such-region')).toThrow();
  });

  it('reports nothing outside the region', () => {
    const map = getRegionMap(1, 'test-forest');
    expect(terrainAt(map, -1, 10)).toBeNull();
    expect(isWalkable(map, 10, regionWidthM(map) + 1)).toBe(false);
  });
});
