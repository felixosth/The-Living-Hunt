/**
 * Species data. Speeds are metres per GAME minute (time-compressed like the
 * player's), weights are live weights in kg.
 */
export type SpeciesId = 'roe' | 'hare';
export const SPECIES_IDS: readonly SpeciesId[] = ['roe', 'hare'];

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  plural: string;
  /** Live weight ranges. */
  weightKg: { female: [number, number]; male: [number, number]; juvenile: [number, number] };
  speed: {
    /** Moving slowly while feeding. */
    graze: number;
    walk: number;
    trot: number;
    flee: number;
  };
  senses: {
    /** How far it can pick out a fully visible walking figure by day, in metres. */
    sight: number;
    /** Field of view, in radians. */
    fov: number;
    /** Multiplier on how far the player's noise carries. */
    hearing: number;
    /** Multiplier on the player's scent-cone range. */
    smell: number;
  };
  /** Awareness gained per game minute from a unit of stimulus. */
  alertness: number;
  /** A resting animal of this kind stays put until you come this close (m), then bursts away. */
  flushDistance: number;
  /** Top-down body size for drawing and hit testing, in metres. */
  body: { length: number; width: number };
  /** The noise it makes when alarmed, if any. */
  alarmCall: string | null;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  roe: {
    id: 'roe',
    name: 'roe deer',
    plural: 'roe deer',
    weightKg: { female: [19, 25], male: [23, 30], juvenile: [11, 16] },
    speed: { graze: 0.9, walk: 4, trot: 9, flee: 20 },
    senses: { sight: 120, fov: (300 * Math.PI) / 180, hearing: 1.3, smell: 1 },
    alertness: 0.8,
    flushDistance: 0,
    body: { length: 1.15, width: 0.42 },
    alarmCall: 'barks',
  },
  hare: {
    id: 'hare',
    name: 'mountain hare',
    plural: 'mountain hares',
    weightKg: { female: [3, 4.5], male: [2.8, 4], juvenile: [1.5, 2.5] },
    speed: { graze: 0.5, walk: 2.5, trot: 6, flee: 17 },
    senses: { sight: 60, fov: (340 * Math.PI) / 180, hearing: 1.1, smell: 0.5 },
    alertness: 0.6,
    flushDistance: 10,
    body: { length: 0.5, width: 0.24 },
    alarmCall: null,
  },
};
