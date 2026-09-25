/**
 * Player movement.
 *
 * Field movement is time-compressed: speeds are metres per GAME MINUTE and are
 * tuned for play, not realism. At 1× a game minute passes every real second,
 * so walking covers 5 m of ground per real second and crossing a 1 km region
 * takes a few game hours.
 */
import { CARRY_CAPACITY_KG } from '../content/gear';
import { playerSnowPace, snowAt } from './ground';
import { groundAt, isWalkable, type RegionMap, regionHeightM, regionWidthM } from './region';
import type { Gait, GroundState, PlayerState } from './state';

export const GAIT_SPEED_M_PER_MIN: Record<Gait, number> = {
  sneak: 1.8,
  walk: 5,
  run: 11,
};

/** Longest distance moved in one collision sub-step, in metres. */
const SUBSTEP_M = 0.5;
const EDGE_MARGIN_M = 0.01;

export function advancePlayer(
  player: PlayerState,
  map: RegionMap,
  dtSeconds: number,
  ground?: GroundState,
): void {
  const { moveX, moveY } = player;
  if ((moveX === 0 && moveY === 0) || player.busy) return;
  player.heading = Math.atan2(moveY, moveX);

  const maxX = regionWidthM(map) - EDGE_MARGIN_M;
  const maxY = regionHeightM(map) - EDGE_MARGIN_M;
  const burden = 1 - 0.35 * Math.min(1, player.load / CARRY_CAPACITY_KG);
  // Deep snow drags at every step.
  const snow = ground ? playerSnowPace(snowAt(map, ground, player.x, player.y)) : 1;
  const speed =
    GAIT_SPEED_M_PER_MIN[player.gait] * groundAt(map, player.x, player.y).speed * burden * snow;
  const distance = (speed * dtSeconds) / 60;
  const substeps = Math.max(1, Math.ceil(distance / SUBSTEP_M));
  const sx = (moveX * distance) / substeps;
  const sy = (moveY * distance) / substeps;

  for (let i = 0; i < substeps; i++) {
    const nx = Math.min(maxX, Math.max(EDGE_MARGIN_M, player.x + sx));
    const ny = Math.min(maxY, Math.max(EDGE_MARGIN_M, player.y + sy));
    if (isWalkable(map, nx, ny)) {
      player.x = nx;
      player.y = ny;
    } else if (isWalkable(map, nx, player.y)) {
      player.x = nx; // slide along the obstacle
    } else if (isWalkable(map, player.x, ny)) {
      player.y = ny;
    } else {
      return;
    }
  }
}
