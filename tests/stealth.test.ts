import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/content/terrain';
import type { PlayerState } from '../src/sim/state';
import {
  noiseRadiusM,
  playerNoise,
  playerVisibility,
  scentAt,
  scentCone,
} from '../src/sim/stealth';
import { createWorld } from '../src/sim/world';
import { synthMap } from './helpers';

const meadow = synthMap(20, 20, () => Terrain.Grass);
const thicket = synthMap(20, 20, () => Terrain.Thicket);

function player(gait: PlayerState['gait'], moving: boolean): PlayerState {
  return {
    ...createWorld(1).player,
    x: 10,
    y: 10,
    heading: 0,
    gait,
    moveX: moving ? 1 : 0,
    moveY: 0,
  };
}

describe('noise', () => {
  it('is silent standing still and loudest running', () => {
    expect(playerNoise(player('walk', false), meadow)).toBe(0);
    const sneak = playerNoise(player('sneak', true), meadow);
    const walk = playerNoise(player('walk', true), meadow);
    const run = playerNoise(player('run', true), meadow);
    expect(sneak).toBeLessThan(walk);
    expect(walk).toBeLessThan(run);
  });

  it('is louder in a thicket than on a meadow', () => {
    expect(playerNoise(player('walk', true), thicket)).toBeGreaterThan(
      playerNoise(player('walk', true), meadow),
    );
  });

  it('carries less far in strong wind', () => {
    expect(noiseRadiusM(1, 10)).toBeLessThan(noiseRadiusM(1, 0));
  });
});

describe('visibility', () => {
  it('drops with cover, stillness and darkness', () => {
    const open = playerVisibility(player('walk', true), meadow, 1);
    expect(playerVisibility(player('walk', true), thicket, 1)).toBeLessThan(open);
    expect(playerVisibility(player('sneak', false), meadow, 1)).toBeLessThan(open);
    expect(playerVisibility(player('walk', true), meadow, 0)).toBeLessThan(open);
  });
});

describe('scent cone', () => {
  it('carries scent downwind, not upwind', () => {
    // Wind from the south blows north: the scent drifts towards smaller y.
    const cone = scentCone({ windFromDeg: 180, windSpeed: 4 });
    expect(scentAt(cone, 100, 100, 100, 40)).toBeGreaterThan(0.3);
    expect(scentAt(cone, 100, 100, 100, 160)).toBe(0);
    expect(scentAt(cone, 100, 100, 160, 100)).toBe(0);
  });

  it('reaches further in stronger wind', () => {
    expect(scentCone({ windFromDeg: 0, windSpeed: 6 }).range).toBeGreaterThan(
      scentCone({ windFromDeg: 0, windSpeed: 2 }).range,
    );
  });

  it('pools all round in still air', () => {
    const cone = scentCone({ windFromDeg: 90, windSpeed: 0 });
    expect(scentAt(cone, 0, 0, 10, 0)).toBeGreaterThan(0);
    expect(scentAt(cone, 0, 0, -10, 0)).toBeGreaterThan(0);
    expect(scentAt(cone, 0, 0, 100, 0)).toBe(0);
  });
});
