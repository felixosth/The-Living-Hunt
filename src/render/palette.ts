import { Terrain, type TerrainId } from '../content/terrain';

/** Muted northern palette. RGB triples for the baked terrain texture. */
export const TERRAIN_RGB: Record<TerrainId, readonly [number, number, number]> = {
  [Terrain.Grass]: [128, 126, 74],
  [Terrain.Forest]: [58, 74, 47],
  [Terrain.Thicket]: [45, 61, 39],
  [Terrain.Mud]: [92, 76, 58],
  [Terrain.Shallows]: [78, 108, 114],
  [Terrain.DeepWater]: [42, 70, 86],
  [Terrain.Rock]: [118, 120, 112],
  [Terrain.Building]: [70, 58, 44],
};

export const COLORS = {
  background: 0x0d1210,
  canopy: [0x23381f, 0x2a4125, 0x1d301c, 0x2f4527] as const,
  canopyHighlight: 0x3d5a33,
  shadow: 0x000000,
  trail: '#a89468',
  roofDark: 0x4a3b2c,
  roofLight: 0x5c4a36,
  ridge: 0x2b2118,
  chimney: 0x6b6660,
  player: 0xe2d3ab,
  playerOutline: 0x2b2118,
  playerFacing: 0x2b2118,
  scent: 0xd8b46a,
  noise: 0x9ec3d8,
};
