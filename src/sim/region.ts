/**
 * Static region data: terrain, trees, points of interest, the navigation grid
 * and game trails. It is regenerated from the world seed rather than saved;
 * only dynamic state lives in WorldState.
 */
import { Terrain, type TerrainId, TRAIL, terrainDef } from '../content/terrain';
import { generateForestRegion } from './mapgen/forestRegion';
import { cellOf, distanceField, type NavGrid } from './nav';

export type RegionId = string;

/**
 * Places animals use: deer bed in thickets, feed on meadow edges and drink at
 * fords; hares rest in forms at forest edges.
 */
export type PoiKind = 'bed' | 'feed' | 'water' | 'form';

export interface Poi {
  index: number;
  kind: PoiKind;
  x: number;
  y: number;
  /** Rough radius of the area, in metres. */
  radius: number;
}

export interface RegionMap {
  id: RegionId;
  name: string;
  /** Size in tiles. */
  width: number;
  height: number;
  /** Tile edge length in metres. */
  tileSize: number;
  /** One TerrainId per tile, row-major. */
  terrain: Uint8Array;
  /** How hidden a figure on each tile is, 0..1: ground cover plus low branches. */
  cover: Float32Array;
  /** Tree trunks as [x, y, canopyRadius] triples, in metres. */
  trees: Float32Array;
  /** Default arrival point (Einar's cabin door), in metres. */
  spawn: { x: number; y: number };
  /** The cabin's footprint, in metres. */
  cabin: { x: number; y: number; w: number; h: number };
  pois: Poi[];
  nav: NavGrid;
  /** Game trails as polylines of [x0, y0, x1, y1, ...] in metres, for drawing. */
  trails: Float32Array[];
  /** Lazily computed distance field per point of interest. */
  fields: (Float32Array | undefined)[];
}

const GENERATORS: Record<RegionId, (seed: number, id: RegionId) => RegionMap> = {
  'test-forest': generateForestRegion,
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

function tileIndex(map: RegionMap, x: number, y: number): number {
  const tx = Math.floor(x / map.tileSize);
  const ty = Math.floor(y / map.tileSize);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return -1;
  return ty * map.width + tx;
}

/** Terrain at a position in metres, or null outside the region. */
export function terrainAt(map: RegionMap, x: number, y: number): TerrainId | null {
  const i = tileIndex(map, x, y);
  return i < 0 ? null : (map.terrain[i] as TerrainId);
}

export function isWalkable(map: RegionMap, x: number, y: number): boolean {
  const t = terrainAt(map, x, y);
  return t !== null && terrainDef(t).walkable;
}

/** Cover at a position, 0..1 (1 outside the region). */
export function coverAt(map: RegionMap, x: number, y: number): number {
  const i = tileIndex(map, x, y);
  return i < 0 ? 1 : (map.cover[i] as number);
}

export function onTrail(map: RegionMap, x: number, y: number): boolean {
  const c = cellOf(map.nav, x, y);
  return c >= 0 && map.nav.trail[c] === 1;
}

/** Ground properties at a position, with the game-trail modifiers applied. */
export function groundAt(
  map: RegionMap,
  x: number,
  y: number,
): { terrain: TerrainId | null; speed: number; noise: number; softness: number; trail: boolean } {
  const terrain = terrainAt(map, x, y);
  if (terrain === null) return { terrain, speed: 1, noise: 1, softness: 0, trail: false };
  const def = terrainDef(terrain);
  const trail = def.walkable && terrain !== Terrain.Shallows && onTrail(map, x, y);
  return {
    terrain,
    speed: trail ? Math.max(def.speed, 0.9) * TRAIL.speed : def.speed,
    noise: trail ? def.noise * TRAIL.noise : def.noise,
    softness: trail ? Math.max(def.softness, TRAIL.softness) : def.softness,
    trail,
  };
}

/** Distance field towards a point of interest (computed on first use). */
export function poiField(map: RegionMap, poi: number): Float32Array {
  let field = map.fields[poi];
  if (!field) {
    const p = map.pois[poi];
    if (!p) throw new RangeError(`No point of interest ${poi}`);
    field = distanceField(map.nav, [cellOf(map.nav, p.x, p.y)]);
    map.fields[poi] = field;
  }
  return field;
}
