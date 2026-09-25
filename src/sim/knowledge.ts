/**
 * What the player knows: familiarity with each species and literacy in each
 * kind of sign, as experience points. The level (0–4) is the whole part.
 * Reading teaches a little; confirming a reading against reality teaches a lot.
 * Hands are light skills learned by practice, like holding a bow steady.
 */
import type { SpeciesId } from '../content/species';
import type { SimEvent } from './events';
import type { SignKindName } from './signs';

export type HandSkill = 'bow';

export interface Knowledge {
  species: Record<SpeciesId, number>;
  signs: Record<SignKindName, number>;
  hands: Record<HandSkill, number>;
}

export const MAX_LEVEL = 4;

/** What Einar's journal has taught you before you arrive. */
export function initialKnowledge(): Knowledge {
  return {
    species: { roe: 1.2, hare: 1 },
    signs: { print: 1, pellets: 0.8, bed: 0.5, browse: 0.3, blood: 1, arrow: MAX_LEVEL },
    hands: { bow: 0.3 },
  };
}

export function level(xp: number): number {
  return Math.max(0, Math.min(MAX_LEVEL, Math.floor(xp)));
}

export type KnowledgeArea = 'species' | 'signs' | 'hands';

/** Add experience, reporting a level-up as an event. */
export function learn(
  k: Knowledge,
  area: KnowledgeArea,
  key: SpeciesId | SignKindName | HandSkill,
  amount: number,
  events: SimEvent[],
): void {
  const table = k[area] as Record<string, number>;
  const before = table[key] ?? 0;
  const after = Math.min(MAX_LEVEL + 0.999, before + amount);
  table[key] = after;
  if (level(after) > level(before)) {
    events.push({ type: 'learned', area, key, level: level(after) });
  }
}

/** Experience that shrinks as you get better, so the first lessons count most. */
export function lesson(base: number, xp: number): number {
  return base / (1 + level(xp));
}
