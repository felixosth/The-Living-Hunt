/** Ground types. Ids are stored per tile in a Uint8Array, so keep them stable. */
export const Terrain = {
  Grass: 0,
  Forest: 1,
  Thicket: 2,
  Mud: 3,
  Shallows: 4,
  DeepWater: 5,
  Rock: 6,
  Building: 7,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainDef {
  id: TerrainId;
  name: string;
  walkable: boolean;
  /** Movement speed multiplier for the player. */
  speed: number;
  /** Footstep noise multiplier (1 = meadow grass). */
  noise: number;
  /** How much a figure standing here is hidden, 0..1. */
  cover: number;
  /** How well the ground takes a print, 0..1. */
  softness: number;
  /** Relative cost of walking here for animal pathfinding. */
  navCost: number;
}

export const TERRAIN: readonly TerrainDef[] = [
  {
    id: Terrain.Grass,
    name: 'Meadow',
    walkable: true,
    speed: 1,
    noise: 0.9,
    cover: 0.1,
    softness: 0.45,
    navCost: 1,
  },
  {
    id: Terrain.Forest,
    name: 'Spruce forest',
    walkable: true,
    speed: 0.9,
    noise: 0.7,
    cover: 0.35,
    softness: 0.35,
    navCost: 1.15,
  },
  {
    id: Terrain.Thicket,
    name: 'Thicket',
    walkable: true,
    speed: 0.55,
    noise: 1.6,
    cover: 0.75,
    softness: 0.3,
    navCost: 1.6,
  },
  {
    id: Terrain.Mud,
    name: 'Mud',
    walkable: true,
    speed: 0.7,
    noise: 1.1,
    cover: 0,
    softness: 1,
    navCost: 1.5,
  },
  {
    id: Terrain.Shallows,
    name: 'Shallow water',
    walkable: true,
    speed: 0.45,
    noise: 2,
    cover: 0,
    softness: 0,
    navCost: 2.5,
  },
  {
    id: Terrain.DeepWater,
    name: 'Deep water',
    walkable: false,
    speed: 0,
    noise: 0,
    cover: 0,
    softness: 0,
    navCost: Number.POSITIVE_INFINITY,
  },
  {
    id: Terrain.Rock,
    name: 'Rock',
    walkable: true,
    speed: 0.9,
    noise: 1.2,
    cover: 0.1,
    softness: 0.05,
    navCost: 1.5,
  },
  {
    id: Terrain.Building,
    name: "Einar's cabin",
    walkable: false,
    speed: 0,
    noise: 0,
    cover: 1,
    softness: 0,
    navCost: Number.POSITIVE_INFINITY,
  },
];

export function terrainDef(id: number): TerrainDef {
  const def = TERRAIN[id];
  if (!def) throw new RangeError(`Unknown terrain id ${id}`);
  return def;
}

/** Game trails: packed earth that is quicker and quieter to walk on. */
export const TRAIL = {
  speed: 1.1,
  noise: 0.65,
  softness: 0.6,
  /** Multiplier on animal path cost, so animals prefer trails. */
  navCost: 0.5,
} as const;
