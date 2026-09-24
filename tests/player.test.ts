import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Terrain, type TerrainId } from '../src/content/terrain';
import { applyCommand } from '../src/sim/commands';
import { advancePlayer, GAIT_SPEED_M_PER_MIN } from '../src/sim/player';
import { getRegionMap, isWalkable, type RegionMap, regionWidthM } from '../src/sim/region';
import type { Gait, PlayerState } from '../src/sim/state';
import { createWorld, step } from '../src/sim/world';

/** A small synthetic map: meadow everywhere, with a deep-water column at tile x = 10. */
function wallMap(): RegionMap {
  const width = 20;
  const height = 20;
  const terrain = new Uint8Array(width * height).fill(Terrain.Grass);
  for (let y = 0; y < height; y++) terrain[y * width + 10] = Terrain.DeepWater;
  return {
    id: 'wall',
    width,
    height,
    tileSize: 2,
    terrain,
    trees: new Float32Array(),
    spawn: { x: 5, y: 5 },
  };
}

function player(
  x: number,
  y: number,
  moveX: number,
  moveY: number,
  gait: Gait = 'walk',
): PlayerState {
  const len = Math.hypot(moveX, moveY) || 1;
  return { x, y, heading: 0, gait, moveX: moveX / len, moveY: moveY / len };
}

describe('player movement', () => {
  it('moves at gait speed on meadow (metres per game minute)', () => {
    for (const gait of ['sneak', 'walk', 'run'] as const) {
      const p = player(2, 20, 1, 0, gait);
      advancePlayer(p, wallMap(), 60);
      expect(p.x - 2).toBeCloseTo(Math.min(GAIT_SPEED_M_PER_MIN[gait], 17.99), 5);
    }
  });

  it('is slowed by difficult ground', () => {
    const map = wallMap();
    map.terrain.fill(Terrain.Thicket as TerrainId);
    const p = player(2, 20, 1, 0);
    advancePlayer(p, map, 60);
    expect(p.x - 2).toBeCloseTo(GAIT_SPEED_M_PER_MIN.walk * 0.55, 5);
  });

  it('stops at deep water', () => {
    const p = player(18, 20, 1, 0, 'run');
    advancePlayer(p, wallMap(), 600);
    expect(p.x).toBeLessThan(20);
    expect(isWalkable(wallMap(), p.x, p.y)).toBe(true);
  });

  it('slides along an obstacle when moving diagonally into it', () => {
    const p = player(19, 20, 1, 1);
    advancePlayer(p, wallMap(), 60);
    expect(p.x).toBeLessThan(20);
    expect(p.y).toBeGreaterThan(20);
  });

  it('never leaves the region', () => {
    const p = player(1, 1, -1, -1, 'run');
    advancePlayer(p, wallMap(), 600);
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThan(0);
  });

  it('ignores malformed move commands', () => {
    const world = createWorld(1);
    applyCommand(world, { type: 'move', x: Number.NaN, y: 0, gait: 'walk' });
    applyCommand(world, { type: 'move', x: 1, y: 0, gait: 'fly' as Gait });
    expect(world.player.moveX).toBe(0);
    applyCommand(world, { type: 'move', x: 3, y: 4, gait: 'run' });
    expect(world.player.moveX).toBeCloseTo(0.6);
    expect(world.player.moveY).toBeCloseTo(0.8);
  });

  it('stays on walkable ground inside the region for any sequence of moves', () => {
    const move = fc.record({
      x: fc.integer({ min: -1, max: 1 }),
      y: fc.integer({ min: -1, max: 1 }),
      gait: fc.constantFrom<Gait>('sneak', 'walk', 'run'),
      dt: fc.integer({ min: 1, max: 600 }),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.array(move, { maxLength: 40 }),
        (seed, moves) => {
          const world = createWorld(seed);
          const map = getRegionMap(world.seed, world.regionId);
          for (const m of moves) {
            step(world, [{ type: 'move', x: m.x, y: m.y, gait: m.gait }], m.dt);
            expect(Number.isFinite(world.player.x) && Number.isFinite(world.player.y)).toBe(true);
            expect(isWalkable(map, world.player.x, world.player.y)).toBe(true);
            expect(world.player.x).toBeLessThan(regionWidthM(map));
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
