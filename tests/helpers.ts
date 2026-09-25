import { type TerrainId, terrainDef } from '../src/content/terrain';
import type { Poi, RegionMap } from '../src/sim/region';

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
