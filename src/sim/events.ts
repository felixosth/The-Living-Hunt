/** Notifications produced by a step, for UI, logs and tools. Not part of the state. */
import type { SpeciesId } from '../content/species';
import type { GameTime, Season } from '../core/time';

/** Sounds animals make that the player may hear. */
export type SoundKind = 'bark' | 'crash' | 'flush';

/** How far each sound carries, in metres. */
export const SOUND_RANGE_M: Record<SoundKind, number> = { bark: 400, crash: 140, flush: 50 };

export type SimEvent =
  | { type: 'hourStarted'; time: GameTime }
  | { type: 'dayStarted'; time: GameTime }
  | { type: 'seasonStarted'; time: GameTime; season: Season }
  | { type: 'sound'; kind: SoundKind; species: SpeciesId; x: number; y: number; time: GameTime }
  | { type: 'sighted'; animalId: number; species: SpeciesId; x: number; y: number; time: GameTime };

export type SimEventType = SimEvent['type'];
