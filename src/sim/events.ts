/** Notifications produced by a step, for UI, logs and tools. Not part of the state. */
import type { SpeciesId } from '../content/species';
import type { GameTime, Season } from '../core/time';
import type { KnowledgeArea } from './knowledge';
import type { Reading } from './reading';
import type { HuntSummary } from './state';

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
  | { type: 'inspected'; reading: Reading }
  | { type: 'learned'; area: KnowledgeArea; key: string; level: number }
  /** You saw the animal whose sign you had read: the reading is confirmed. */
  | { type: 'confirmed'; animalId: number; species: SpeciesId }
  | { type: 'trailLost' }
  | { type: 'died'; animalId: number; species: SpeciesId; seen: boolean }
  /**
   * The arrow is away: did it hit? (Where, you'll have to work out.) It flies
   * from the shooter past the animal's position to where it ends up: in the
   * animal if it lodged, on the ground beyond it if not.
   */
  | {
      type: 'shot';
      /** Why it missed, and where the arrow passed; null on a hit (the blood tells you that). */
      miss: MissReview | null;
      /** It walked on while the arrow flew, enough to move the mark noticeably. */
      walkedOn: boolean;
      animalId: number;
      hit: boolean;
      dropped: boolean;
      /** It jumped the string: it moved at the twang, before the arrow arrived. */
      ducked: boolean;
      fromX: number;
      fromY: number;
      atX: number;
      atY: number;
      endX: number;
      endY: number;
    }
  | {
      type: 'dressed';
      animalId: number;
      species: SpeciesId;
      liveWeightKg: number;
      arrowBack: boolean;
    }
  | { type: 'pickedUp'; what: 'carcass' | 'arrow'; species?: SpeciesId; weightKg?: number }
  | { type: 'dropped'; species: SpeciesId }
  | { type: 'tooHeavy'; weightKg: number }
  | { type: 'delivered'; summary: HuntSummary }
  | { type: 'trailFound' }
  /** You bleated: how many deer stopped to look, and how many grew warier. */
  | { type: 'bleated'; stopped: number; warier: number };

export type SimEventType = SimEvent['type'];

/** Why an arrow missed. */
export type MissCause =
  /** A twig or branch in the line turned it. */
  | 'brush'
  /** The animal dropped at the twang; the arrow passed where it had been. */
  | 'jumped'
  /** The animal walked on while the arrow flew; it passed behind. */
  | 'walked'
  /** The crosshair wasn't on the animal when you let go. */
  | 'crosshair'
  /** The crosshair was on it, but the scatter took the arrow wide. */
  | 'scatter';

/** A missed arrow, for the shot inset to show afterwards. */
export interface MissReview {
  cause: MissCause;
  species: SpeciesId;
  theta: number;
  headDown: boolean;
  /** Where the crosshair was as you released, on the side view (metres). */
  aimU: number;
  aimV: number;
  /** Where the arrow crossed the animal's side view, relative to its body as it was then. */
  u: number;
  v: number;
}
