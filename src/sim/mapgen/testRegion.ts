/**
 * Test region generator for M0: a 512 × 512 m patch of forest with a meandering
 * stream, a pond, meadows, thickets and rock outcrops.
 *
 * Deterministic in (worldSeed, regionId). This is a stand-in until the
 * recipe-based region generation arrives in M1.
 */
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { Terrain, type TerrainId } from '../../content/terrain';
import { hash32 } from '../../core/hash';
import { asRandomFn, chance, nextRange, seedRng } from '../../core/rng';
import type { RegionMap } from '../region';

const SIZE_TILES = 256;
const TILE_SIZE_M = 2;

function fbm(noise: NoiseFunction2D, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function generateTestRegion(worldSeed: number, regionId: string): RegionMap {
  const seedFor = (layer: string) => seedRng(hash32(worldSeed, 'mapgen', regionId, layer));
  const elevation = createNoise2D(asRandomFn(seedFor('elevation')));
  const cover = createNoise2D(asRandomFn(seedFor('cover')));
  const meander = createNoise2D(asRandomFn(seedFor('stream')));
  const placement = seedFor('placement');

  const w = SIZE_TILES;
  const h = SIZE_TILES;
  const terrain = new Uint8Array(w * h);

  for (let ty = 0; ty < h; ty++) {
    // The stream runs roughly north–south and meanders.
    const streamX = w * 0.5 + 38 * meander(ty / 90, 0.5) + 10 * meander(ty / 25, 7.3);
    for (let tx = 0; tx < w; tx++) {
      const e = fbm(elevation, tx / 90, ty / 90, 4);
      const c = fbm(cover, tx / 45, ty / 45, 3);
      const streamDist = Math.abs(tx - streamX);

      let t: TerrainId;
      if (streamDist < 1.6) t = Terrain.DeepWater;
      else if (streamDist < 3) t = Terrain.Shallows;
      else if (e < -0.5) t = Terrain.DeepWater;
      else if (e < -0.42) t = Terrain.Shallows;
      else if (e < -0.34 || (streamDist < 5.5 && c < 0.2)) t = Terrain.Mud;
      else if (e > 0.55) t = Terrain.Rock;
      else if (c > 0.5) t = Terrain.Thicket;
      else if (c > -0.05) t = Terrain.Forest;
      else t = Terrain.Grass;
      terrain[ty * w + tx] = t;
    }
  }

  // Trees: dense in forest, sparse on meadows and near rock.
  const trees: number[] = [];
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const t = terrain[ty * w + tx];
      const p =
        t === Terrain.Forest
          ? 0.3
          : t === Terrain.Thicket
            ? 0.12
            : t === Terrain.Rock
              ? 0.05
              : t === Terrain.Grass
                ? 0.012
                : 0;
      if (p > 0 && chance(placement, p)) {
        const x = (tx + nextRange(placement, 0.15, 0.85)) * TILE_SIZE_M;
        const y = (ty + nextRange(placement, 0.15, 0.85)) * TILE_SIZE_M;
        trees.push(x, y, nextRange(placement, 1.4, 2.8));
      }
    }
  }

  return {
    id: regionId,
    width: w,
    height: h,
    tileSize: TILE_SIZE_M,
    terrain,
    trees: new Float32Array(trees),
    spawn: findSpawn(terrain, w, h, TILE_SIZE_M),
  };
}

/** The meadow tile nearest the map centre, searched in growing rings. */
function findSpawn(terrain: Uint8Array, w: number, h: number, tileSize: number) {
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  for (let r = 0; r < Math.max(w, h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        if (terrain[ty * w + tx] === Terrain.Grass) {
          return { x: (tx + 0.5) * tileSize, y: (ty + 0.5) * tileSize };
        }
      }
    }
  }
  return { x: (cx + 0.5) * tileSize, y: (cy + 0.5) * tileSize };
}
