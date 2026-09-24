/**
 * Static region terrain. It is regenerated from the world seed rather than
 * saved; only dynamic state lives in WorldState.
 */
import { type TerrainId, terrainDef } from '../content/terrain';
import { generateTestRegion } from './mapgen/testRegion';

export type RegionId = string;

export interface RegionMap {
  id: RegionId;
  /** Size in tiles. */
  width: number;
  height: number;
  /** Tile edge length in metres. */
  tileSize: number;
  /** One TerrainId per tile, row-major. */
  terrain: Uint8Array;
  /** Tree trunks as [x, y, canopyRadius] triples, in metres. */
  trees: Float32Array;
  /** Default arrival point, in metres. */
  spawn: { x: number; y: number };
}

const GENERATORS: Record<RegionId, (seed: number, id: RegionId) => RegionMap> = {
  'test-forest': generateTestRegion,
};

// Memoisation of a pure function: generation is deterministic in (seed, id).
const cache = new Map<string, RegionMap>();
const CACHE_LIMIT = 4;

export function getRegionMap(seed: number, regionId: RegionId): RegionMap {
  const key = `${seed}:${regionId}`;
  let map = cache.get(key);
  if (!map) {
    const generate = GENERATORS[regionId];
    if (!generate) throw new Error(`Unknown region "${regionId}"`);
    map = generate(seed, regionId);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, map);
  }
  return map;
}

export function regionWidthM(map: RegionMap): number {
  return map.width * map.tileSize;
}

export function regionHeightM(map: RegionMap): number {
  return map.height * map.tileSize;
}

/** Terrain at a position in metres, or null outside the region. */
export function terrainAt(map: RegionMap, x: number, y: number): TerrainId | null {
  const tx = Math.floor(x / map.tileSize);
  const ty = Math.floor(y / map.tileSize);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
  return map.terrain[ty * map.width + tx] as TerrainId;
}

export function isWalkable(map: RegionMap, x: number, y: number): boolean {
  const t = terrainAt(map, x, y);
  return t !== null && terrainDef(t).walkable;
}
