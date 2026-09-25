/**
 * Forest region generator: a 512 × 512 m patch of spruce forest with meadows,
 * thickets, rock outcrops, a pond and a meandering stream that can be crossed
 * at a few fords. Einar's cabin sits in a clearing near the south-west corner.
 *
 * On top of the terrain it places points of interest (deer beds, feeding
 * meadows, drinking spots, hare forms) and grows game trails between them by
 * repeated pathfinding with a wear bonus, so routes merge into a network.
 *
 * Deterministic in (worldSeed, regionId).
 */
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { Terrain, type TerrainId, TRAIL, terrainDef } from '../../content/terrain';
import { hash32 } from '../../core/hash';
import { asRandomFn, chance, nextInt, nextRange, type RngState, seedRng } from '../../core/rng';
import { cellCentre, cellOf, components, findPath, type NavGrid } from '../nav';
import type { Poi, PoiKind, RegionMap } from '../region';

const SIZE_TILES = 256;
const TILE_SIZE_M = 2;
const NAV_CELL_M = 4;
const FORD_COUNT = 3;
/** Half-width of a ford along the stream, in tiles. */
const FORD_HALF_TILES = 4;
const CLEARING_RADIUS_TILES = 11;

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

export function generateForestRegion(worldSeed: number, regionId: string): RegionMap {
  const seedFor = (layer: string) => seedRng(hash32(worldSeed, 'mapgen', regionId, layer));
  const elevation = createNoise2D(asRandomFn(seedFor('elevation')));
  const coverNoise = createNoise2D(asRandomFn(seedFor('cover')));
  const meander = createNoise2D(asRandomFn(seedFor('stream')));
  const placement = seedFor('placement');
  const poiRng = seedFor('poi');

  const w = SIZE_TILES;
  const h = SIZE_TILES;
  const ts = TILE_SIZE_M;
  const terrain = new Uint8Array(w * h);
  const at = (tx: number, ty: number) => terrain[ty * w + tx] as TerrainId;

  // --- Terrain -------------------------------------------------------------
  const fordRows: number[] = [];
  for (let i = 0; i < FORD_COUNT; i++) {
    const base = ((i + 0.5) / FORD_COUNT) * h;
    fordRows.push(Math.round(base + nextRange(placement, -18, 18)));
  }
  const streamX = new Float32Array(h);
  for (let ty = 0; ty < h; ty++) {
    streamX[ty] = w * 0.52 + 38 * meander(ty / 90, 0.5) + 10 * meander(ty / 25, 7.3);
  }
  const fordDist = (ty: number) => Math.min(...fordRows.map((r) => Math.abs(ty - r)));

  for (let ty = 0; ty < h; ty++) {
    const sx = streamX[ty] as number;
    const nearFord = fordDist(ty);
    for (let tx = 0; tx < w; tx++) {
      const e = fbm(elevation, tx / 90, ty / 90, 4);
      const c = fbm(coverNoise, tx / 45, ty / 45, 3);
      const streamDist = Math.abs(tx - sx);

      let t: TerrainId;
      if (streamDist < 1.6 && nearFord > FORD_HALF_TILES) t = Terrain.DeepWater;
      else if (streamDist < 3) t = Terrain.Shallows;
      else if (nearFord <= FORD_HALF_TILES + 3 && streamDist < 7) t = Terrain.Mud;
      else if (e < -0.56) t = Terrain.DeepWater;
      else if (e < -0.5) t = Terrain.Shallows;
      else if (e < -0.43 || (streamDist < 5.5 && c < 0.2)) t = Terrain.Mud;
      else if (e > 0.55) t = Terrain.Rock;
      else if (c > 0.5) t = Terrain.Thicket;
      else if (c > -0.05) t = Terrain.Forest;
      else t = Terrain.Grass;
      terrain[ty * w + tx] = t;
    }
  }

  // --- Einar's cabin in a clearing -------------------------------------------
  const cabinTx = Math.round(w * 0.16 + nextRange(placement, -6, 6));
  const cabinTy = Math.round(h * 0.82 + nextRange(placement, -6, 6));
  for (let dy = -CLEARING_RADIUS_TILES; dy <= CLEARING_RADIUS_TILES; dy++) {
    for (let dx = -CLEARING_RADIUS_TILES; dx <= CLEARING_RADIUS_TILES; dx++) {
      if (dx * dx + dy * dy > CLEARING_RADIUS_TILES * CLEARING_RADIUS_TILES) continue;
      terrain[(cabinTy + dy) * w + cabinTx + dx] = Terrain.Grass;
    }
  }
  // Footprint 5 × 4 tiles (10 × 8 m); the door faces south.
  const cabin = { x: (cabinTx - 2) * ts, y: (cabinTy - 3) * ts, w: 5 * ts, h: 4 * ts };
  for (let ty = cabinTy - 3; ty < cabinTy + 1; ty++) {
    for (let tx = cabinTx - 2; tx < cabinTx + 3; tx++) terrain[ty * w + tx] = Terrain.Building;
  }
  const spawn = { x: (cabinTx + 0.5) * ts, y: (cabinTy + 2.5) * ts };

  // --- Navigation grid ----------------------------------------------------------
  const per = NAV_CELL_M / ts;
  const cols = w / per;
  const rows = h / per;
  const baseCost = new Float32Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let sum = 0;
      for (let sy = 0; sy < per; sy++) {
        for (let sx = 0; sx < per; sx++)
          sum += terrainDef(at(cx * per + sx, cy * per + sy)).navCost;
      }
      baseCost[cy * cols + cx] = sum / (per * per);
    }
  }
  const nav: NavGrid = {
    cellSize: NAV_CELL_M,
    cols,
    rows,
    cost: baseCost,
    trail: new Uint8Array(cols * rows),
  };
  // Keep only the part of the map connected to the cabin, so animals never strand.
  const labels = components(nav);
  const home = labels[cellOf(nav, spawn.x, spawn.y)] as number;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== home) baseCost[i] = Number.POSITIVE_INFINITY;
  }

  // --- Points of interest -----------------------------------------------------------
  const count = (tx: number, ty: number, r: number, match: (t: TerrainId) => boolean) => {
    let n = 0;
    let total = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        total++;
        if (match(at(x, y))) n++;
      }
    }
    return total === 0 ? 0 : n / total;
  };
  const isCover = (t: TerrainId) => t === Terrain.Forest || t === Terrain.Thicket;
  const isWater = (t: TerrainId) => t === Terrain.Shallows || t === Terrain.DeepWater;
  const cabinCentre = { x: cabin.x + cabin.w / 2, y: cabin.y + cabin.h / 2 };

  const pois: Poi[] = [];
  const pick = (
    kind: PoiKind,
    max: number,
    minSpacing: number,
    minCabinDist: number,
    radius: number,
    accept: (tx: number, ty: number) => boolean,
  ) => {
    const candidates = shuffledTiles(poiRng, w, h, 5);
    let placed = 0;
    for (const tile of candidates) {
      if (placed >= max) break;
      const tx = tile % w;
      const ty = Math.floor(tile / w);
      const x = (tx + 0.5) * ts;
      const y = (ty + 0.5) * ts;
      if (!Number.isFinite(baseCost[cellOf(nav, x, y)] as number)) continue;
      if (Math.hypot(x - cabinCentre.x, y - cabinCentre.y) < minCabinDist) continue;
      if (pois.some((p) => p.kind === kind && Math.hypot(p.x - x, p.y - y) < minSpacing)) continue;
      if (!accept(tx, ty)) continue;
      pois.push({ index: pois.length, kind, x, y, radius });
      placed++;
    }
  };

  pick(
    'bed',
    5,
    70,
    90,
    8,
    (tx, ty) =>
      at(tx, ty) === Terrain.Thicket && count(tx, ty, 4, (t) => t === Terrain.Thicket) > 0.6,
  );
  if (!pois.some((p) => p.kind === 'bed')) {
    pick('bed', 3, 70, 90, 8, (tx, ty) => isCover(at(tx, ty)) && count(tx, ty, 4, isCover) > 0.8);
  }
  pick(
    'feed',
    7,
    50,
    70,
    14,
    (tx, ty) =>
      at(tx, ty) === Terrain.Grass &&
      count(tx, ty, 3, (t) => t === Terrain.Grass) > 0.5 &&
      count(tx, ty, 7, isCover) > 0.15,
  );
  // Drinking spots: the fords first, then any bank.
  pick('water', FORD_COUNT, 40, 0, 5, (tx, ty) => {
    if (fordDist(ty) > 2) return false;
    return !isWater(at(tx, ty)) && count(tx, ty, 2, isWater) > 0.1;
  });
  pick(
    'water',
    2,
    60,
    40,
    5,
    (tx, ty) =>
      !isWater(at(tx, ty)) && at(tx, ty) !== Terrain.Building && count(tx, ty, 2, isWater) > 0.15,
  );
  pick(
    'form',
    10,
    40,
    40,
    4,
    (tx, ty) => isCover(at(tx, ty)) && count(tx, ty, 6, (t) => t === Terrain.Grass) > 0.2,
  );

  // --- Game trails ----------------------------------------------------------------
  const wearCost = new Float32Array(baseCost);
  const trails: Float32Array[] = [];
  const byKind = (kind: PoiKind) => pois.filter((p) => p.kind === kind);
  const nearest = (from: { x: number; y: number }, list: Poi[], n: number) =>
    [...list]
      .sort(
        (a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y),
      )
      .slice(0, n);
  const connect = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const path = findPath(nav, cellOf(nav, a.x, a.y), cellOf(nav, b.x, b.y), wearCost, 0.5);
    if (!path || path.length < 2) return;
    const line = new Float32Array(path.length * 2);
    for (const [i, cell] of path.entries()) {
      nav.trail[cell] = 1;
      wearCost[cell] = (baseCost[cell] as number) * TRAIL.navCost;
      const c = cellCentre(nav, cell);
      line[i * 2] = c.x;
      line[i * 2 + 1] = c.y;
    }
    trails.push(line);
  };
  const beds = byKind('bed');
  const feeds = byKind('feed');
  const waters = byKind('water');
  for (const bed of beds) {
    for (const feed of nearest(bed, feeds, 2)) connect(bed, feed);
    for (const water of nearest(bed, waters, 1)) connect(bed, water);
  }
  for (const feed of feeds) for (const water of nearest(feed, waters, 1)) connect(feed, water);
  for (const form of byKind('form'))
    for (const feed of nearest(form, feeds, 1)) connect(form, feed);
  // Einar's own path from the cabin door to the nearest drinking spot.
  for (const water of nearest(spawn, waters, 1)) connect(spawn, water);
  for (let i = 0; i < baseCost.length; i++) {
    if (nav.trail[i]) baseCost[i] = (baseCost[i] as number) * TRAIL.navCost;
  }

  // --- Trees ------------------------------------------------------------------------
  const trees: number[] = [];
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const t = at(tx, ty);
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
      if (p === 0 || !chance(placement, p)) continue;
      const x = (tx + nextRange(placement, 0.15, 0.85)) * ts;
      const y = (ty + nextRange(placement, 0.15, 0.85)) * ts;
      const r = nextRange(placement, 1.4, 2.8);
      if (nav.trail[cellOf(nav, x, y)]) continue;
      if (Math.hypot(x - cabinCentre.x, y - cabinCentre.y) < CLEARING_RADIUS_TILES * ts + r)
        continue;
      trees.push(x, y, r);
    }
  }

  // --- Cover ------------------------------------------------------------------------
  const cover = new Float32Array(w * h);
  for (let i = 0; i < cover.length; i++) cover[i] = terrainDef(terrain[i] as number).cover;
  for (let i = 0; i < trees.length; i += 3) {
    // Low spruce branches hide whatever stands close to the trunk.
    const reach = (trees[i + 2] as number) * 0.6;
    const x0 = Math.max(0, Math.floor(((trees[i] as number) - reach) / ts));
    const x1 = Math.min(w - 1, Math.floor(((trees[i] as number) + reach) / ts));
    const y0 = Math.max(0, Math.floor(((trees[i + 1] as number) - reach) / ts));
    const y1 = Math.min(h - 1, Math.floor(((trees[i + 1] as number) + reach) / ts));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        cover[ty * w + tx] = Math.min(0.9, (cover[ty * w + tx] as number) + 0.2);
      }
    }
  }

  return {
    id: regionId,
    name: 'Granåsen',
    width: w,
    height: h,
    tileSize: ts,
    terrain,
    cover,
    trees: new Float32Array(trees),
    spawn,
    cabin,
    pois,
    nav,
    trails,
    fields: new Array(pois.length).fill(undefined),
  };
}

/** Tiles on a coarse lattice (every `stride` tiles, jittered), in shuffled order. */
function shuffledTiles(rng: RngState, w: number, h: number, stride: number): number[] {
  const tiles: number[] = [];
  for (let ty = stride; ty < h - stride; ty += stride) {
    for (let tx = stride; tx < w - stride; tx += stride) {
      tiles.push((ty + nextInt(rng, 0, stride - 1)) * w + tx + nextInt(rng, 0, stride - 1));
    }
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const tmp = tiles[i] as number;
    tiles[i] = tiles[j] as number;
    tiles[j] = tmp;
  }
  return tiles;
}
