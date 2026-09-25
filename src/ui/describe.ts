/** Plain-language descriptions of simulation events for the HUD. */
import { SPECIES } from '../content/species';
import { compassName } from '../core/math';
import type { SimEvent } from '../sim/events';

const DIRECTION: Record<string, string> = {
  N: 'north',
  NE: 'north-east',
  E: 'east',
  SE: 'south-east',
  S: 'south',
  SW: 'south-west',
  W: 'west',
  NW: 'north-west',
};

/** "to the north-west", "close by", "far off to the east". */
export function whereFrom(fromX: number, fromY: number, x: number, y: number): string {
  const d = Math.hypot(x - fromX, y - fromY);
  if (d < 20) return 'close by';
  // Compass bearing: 0 = north, clockwise; screen y grows south.
  const bearing = (Math.atan2(x - fromX, fromY - y) * 180) / Math.PI;
  const dir = DIRECTION[compassName(bearing)];
  return d > 200 ? `far off to the ${dir}` : `to the ${dir}`;
}

export function describeSound(
  event: Extract<SimEvent, { type: 'sound' }>,
  playerX: number,
  playerY: number,
): string {
  const where = whereFrom(playerX, playerY, event.x, event.y);
  switch (event.kind) {
    case 'bark':
      return `A ${SPECIES[event.species].name} barks ${where}.`;
    case 'crash':
      return `Something crashes away through the brush ${where}.`;
    case 'flush':
      return `A hare bursts from cover ${where}.`;
  }
}

const SIGN_WORDS: Record<string, string> = {
  print: 'prints',
  pellets: 'droppings',
  bed: 'beds',
  browse: 'browse',
  blood: 'blood',
};

export function describeLearning(
  area: 'species' | 'signs' | 'hands',
  key: string,
  level: number,
): string {
  if (area === 'hands') return `Practice tells: your bow arm is steadier (level ${level}).`;
  if (area === 'species') {
    const name = SPECIES[key as keyof typeof SPECIES]?.plural ?? key;
    return `You understand ${name} better (level ${level}).`;
  }
  return `Your eye for ${SIGN_WORDS[key] ?? key} sharpens (level ${level}).`;
}
