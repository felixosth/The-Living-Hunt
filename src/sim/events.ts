/** Notifications produced by a step, for UI, logs and tools. Not part of the state. */
import type { SpeciesId } from '../content/species';
import type { GameTime, Season } from '../core/time';
import type { KnowledgeArea } from './knowledge';
import type { Reading } from './reading';

/** Sounds animals make that the player may hear. */
export type SoundKind = 'bark' | 'crash' | 'flush';

/** How far each sound carries, in metres. */
export const SOUND_RANGE_M: Record<SoundKind, number> = { bark: 400, crash: 140, flush: 50 };

export type SimEvent =
  | { type: 'hourStarted'; time: GameTime }
  | { type: 'dayStarted'; time: GameTime }
  | { type: 'seasonStarted'; time: GameTime; season: Season }
  | { type: 'sound'; kind: SoundKind; species: SpeciesId; x: number; y: number; time: GameTime }
  | { type: 'sighted'; animalId: number; species: SpeciesId; x: number; y: number; time: GameTime }
  | { type: 'scanned'; found: number }
  | { type: 'inspected'; reading: Reading }
  | { type: 'learned'; area: KnowledgeArea; key: string; level: number }
  /** You saw the animal whose sign you had read: the reading is confirmed. */
  | { type: 'confirmed'; animalId: number; species: SpeciesId }
  | { type: 'trailLost' }
  | { type: 'trailFound' };

export type SimEventType = SimEvent['type'];
