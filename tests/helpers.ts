import { DEFAULT_SCENARIO, type Scenario } from '../src/content/scenarios';
import { Terrain, type TerrainId, terrainDef } from '../src/content/terrain';
import type { Poi, RegionMap } from '../src/sim/region';
import { registerRegion } from '../src/sim/region';
import type { Animal, WeatherHour, WorldState } from '../src/sim/state';
import { createWorld } from '../src/sim/world';

/**
 * A small synthetic region for unit tests: the terrain comes from `fill`,
 * with a navigation grid (4 m cells) and cover derived from it. No trees or trails.
 */
export function synthMap(
  widthTiles: number,
  heightTiles: number,
  fill: (tx: number, ty: number) => TerrainId,
  pois: Poi[] = [],
): RegionMap {
  const tileSize = 2;
  const terrain = new Uint8Array(widthTiles * heightTiles);
  const cover = new Float32Array(widthTiles * heightTiles);
  for (let ty = 0; ty < heightTiles; ty++) {
    for (let tx = 0; tx < widthTiles; tx++) {
      const t = fill(tx, ty);
      terrain[ty * widthTiles + tx] = t;
      cover[ty * widthTiles + tx] = terrainDef(t).cover;
    }
  }
  const cols = widthTiles / 2;
  const rows = heightTiles / 2;
  const cost = new Float32Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        sum += terrainDef(terrain[(cy * 2 + dy) * widthTiles + cx * 2 + dx] as number).navCost;
      }
      cost[cy * cols + cx] = sum / 4;
    }
  }
  return {
    id: 'synthetic',
    name: 'Synthetic',
    width: widthTiles,
    height: heightTiles,
    tileSize,
    terrain,
    cover,
    trees: new Float32Array(),
    spawn: { x: 5, y: 5 },
    cabin: { x: 0, y: 0, w: 0, h: 0 },
    pois,
    nav: { cellSize: 4, cols, rows, cost, trail: new Uint8Array(cols * rows) },
    trails: [],
    fields: new Array(pois.length).fill(undefined),
  };
}

/** A 256 × 256 m open meadow with no animals of its own. */
registerRegion('meadow', () => synthMap(128, 128, () => Terrain.Grass));
export const MEADOW: Scenario = { ...DEFAULT_SCENARIO, id: 'meadow', regionId: 'meadow' };
export const CENTRE = { x: 128, y: 128 };

/**
 * Dry, mild, settled weather with a steady wind, from now through the whole
 * week ahead, on bare ground: so a test isn't at the mercy of a front.
 */
export function fair(
  world: WorldState,
  wind: Pick<WeatherHour, 'windFromDeg' | 'windSpeed'> = world.weather,
  hour: Partial<WeatherHour> = {},
): void {
  const settled: WeatherHour = {
    temp: 8,
    cloud: 0.3,
    precip: 0,
    fog: 0,
    windFromDeg: wind.windFromDeg,
    windSpeed: wind.windSpeed,
    ...hour,
  };
  const w = world.weather;
  w.ahead = w.ahead.map(() => ({ ...settled }));
  Object.assign(w, settled);
  Object.assign(w.ground, { snowCm: 0, crust: 0, snowWet: 0, wet: 0, frozen: 0, washedAt: 0 });
}

/** A meadow world holding one animal of `species` borrowed from a real forest. */
export function lone(species: Animal['species']): { world: WorldState; a: Animal } {
  const world = createWorld(3, MEADOW);
  const forest = createWorld(3);
  const a = forest.animals.find((x) => x.species === species) as Animal;
  Object.assign(a, {
    groupId: a.id,
    awareness: 0,
    wariness: 0,
    goal: -1,
    home: { rest: [], feed: [], water: [] },
  });
  world.animals = [a];
  fair(world);
  return { world, a };
}
