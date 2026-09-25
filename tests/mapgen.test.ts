import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/content/terrain';
import { generateForestRegion } from '../src/sim/mapgen/forestRegion';
import { cellOf, distanceField, downhill, findPath, isCellOpen } from '../src/sim/nav';
import {
  getRegionMap,
  groundAt,
  isWalkable,
  poiField,
  regionWidthM,
  terrainAt,
} from '../src/sim/region';
import { synthMap } from './helpers';

describe('forest region generation', () => {
  it('is deterministic in (seed, region)', () => {
    const a = generateForestRegion(5, 'test-forest');
    const b = generateForestRegion(5, 'test-forest');
    expect(a.terrain).toEqual(b.terrain);
    expect(a.trees).toEqual(b.trees);
    expect(a.spawn).toEqual(b.spawn);
    expect(a.pois).toEqual(b.pois);
    expect(a.nav.trail).toEqual(b.nav.trail);
  });

  it('differs between seeds', () => {
    expect(generateForestRegion(5, 'test-forest').terrain).not.toEqual(
      generateForestRegion(6, 'test-forest').terrain,
    );
  });

  it.each([1, 2, 3, 7, 42, 1234])(
    'seed %i has varied ground, a cabin, points of interest and trails',
    (seed) => {
      const map = generateForestRegion(seed, 'test-forest');
      const present = new Set(map.terrain);
      for (const t of [
        Terrain.Grass,
        Terrain.Forest,
        Terrain.Thicket,
        Terrain.Mud,
        Terrain.DeepWater,
        Terrain.Shallows,
        Terrain.Building,
      ]) {
        expect(present.has(t)).toBe(true);
      }
      expect(terrainAt(map, map.spawn.x, map.spawn.y)).toBe(Terrain.Grass);
      expect(isWalkable(map, map.spawn.x, map.spawn.y)).toBe(true);
      expect(map.trees.length / 3).toBeGreaterThan(1000);
      for (let i = 0; i < map.trees.length; i += 3) {
        expect(map.trees[i]).toBeGreaterThanOrEqual(0);
        expect(map.trees[i]).toBeLessThan(regionWidthM(map));
      }

      const count = (kind: string) => map.pois.filter((p) => p.kind === kind).length;
      expect(count('bed')).toBeGreaterThanOrEqual(2);
      expect(count('feed')).toBeGreaterThanOrEqual(3);
      expect(count('water')).toBeGreaterThanOrEqual(2);
      expect(count('form')).toBeGreaterThanOrEqual(4);
      expect(map.trails.length).toBeGreaterThan(10);
    },
  );

  it('connects every point of interest to the cabin', () => {
    for (const seed of [1, 2, 3]) {
      const map = generateForestRegion(seed, 'test-forest');
      const home = cellOf(map.nav, map.spawn.x, map.spawn.y);
      for (const poi of map.pois) {
        expect(isCellOpen(map.nav, cellOf(map.nav, poi.x, poi.y))).toBe(true);
        expect(Number.isFinite(poiField(map, poi.index)[home] as number)).toBe(true);
      }
    }
  });

  it('lets you cross the stream at a ford', () => {
    const map = generateForestRegion(1, 'test-forest');
    // Walkable ground on both sides of the stream is connected on foot.
    const field = distanceField(map.nav, [cellOf(map.nav, map.spawn.x, map.spawn.y)]);
    let east = 0;
    for (let c = 0; c < field.length; c++) {
      if ((c % map.nav.cols) * map.nav.cellSize > 400 && Number.isFinite(field[c] as number))
        east++;
    }
    expect(east).toBeGreaterThan(500);
  });

  it('makes trails quieter and quicker than the ground around them', () => {
    const map = generateForestRegion(3, 'test-forest');
    const cell = map.nav.trail.indexOf(1);
    const x = ((cell % map.nav.cols) + 0.5) * map.nav.cellSize;
    const y = (Math.floor(cell / map.nav.cols) + 0.5) * map.nav.cellSize;
    const ground = groundAt(map, x, y);
    expect(ground.trail).toBe(true);
    expect(ground.softness).toBeGreaterThanOrEqual(0.45);
  });

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

describe('navigation', () => {
  // 40 × 40 m with a wall of deep water at tile x = 10 that has a gap at the bottom.
  const map = synthMap(20, 20, (tx, ty) =>
    tx === 10 || tx === 11 ? (ty >= 16 ? Terrain.Grass : Terrain.DeepWater) : Terrain.Grass,
  );

  it('finds a path around a wall', () => {
    const from = cellOf(map.nav, 4, 4);
    const to = cellOf(map.nav, 36, 4);
    const path = findPath(map.nav, from, to);
    expect(path).not.toBeNull();
    expect(path?.[0]).toBe(from);
    expect(path?.at(-1)).toBe(to);
    // It has to go down to the gap (rows 8–9 of the 10-row grid).
    expect(
      Math.max(...(path ?? []).map((c) => Math.floor(c / map.nav.cols))),
    ).toBeGreaterThanOrEqual(8);
  });

  it('walks downhill to the goal', () => {
    const goal = cellOf(map.nav, 36, 4);
    const field = distanceField(map.nav, [goal]);
    let cell = cellOf(map.nav, 4, 4);
    for (let i = 0; i < 40 && cell !== goal; i++) cell = downhill(map.nav, field, cell);
    expect(cell).toBe(goal);
  });

  it('never offers blocked cells', () => {
    const field = distanceField(map.nav, [cellOf(map.nav, 4, 4)]);
    for (let c = 0; c < field.length; c++) {
      expect(Number.isFinite(field[c] as number)).toBe(isCellOpen(map.nav, c));
    }
  });
});
