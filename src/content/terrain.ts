/** Ground types. Ids are stored per tile in a Uint8Array, so keep them stable. */
export const Terrain = {
  Grass: 0,
  Forest: 1,
  Thicket: 2,
  Mud: 3,
  Shallows: 4,
  DeepWater: 5,
  Rock: 6,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainDef {
  id: TerrainId;
  name: string;
  walkable: boolean;
  /** Movement speed multiplier for the player. */
  speed: number;
}

export const TERRAIN: readonly TerrainDef[] = [
  { id: Terrain.Grass, name: 'Meadow', walkable: true, speed: 1 },
  { id: Terrain.Forest, name: 'Spruce forest', walkable: true, speed: 0.9 },
  { id: Terrain.Thicket, name: 'Thicket', walkable: true, speed: 0.55 },
  { id: Terrain.Mud, name: 'Mud', walkable: true, speed: 0.7 },
  { id: Terrain.Shallows, name: 'Shallow water', walkable: true, speed: 0.45 },
  { id: Terrain.DeepWater, name: 'Deep water', walkable: false, speed: 0 },
  { id: Terrain.Rock, name: 'Rock', walkable: true, speed: 0.9 },
];

export function terrainDef(id: number): TerrainDef {
  const def = TERRAIN[id];
  if (!def) throw new RangeError(`Unknown terrain id ${id}`);
  return def;
}
