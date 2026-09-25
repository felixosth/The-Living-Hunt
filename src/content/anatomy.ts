/**
 * Simple 3D anatomy for the shot: the body, neck, head and legs as ellipsoids,
 * with organ and bone ellipsoids inside. Body coordinates in metres:
 * f forward along the spine, s to the animal's right, z up from the ground.
 */
import type { SpeciesId } from './species';

export type PartId =
  | 'body'
  | 'neck'
  | 'head'
  | 'leg'
  | 'heart'
  | 'lungs'
  | 'liver'
  | 'gut'
  | 'shoulder'
  | 'spine'
  | 'ham';

export interface Part {
  id: PartId;
  /** Centre (f, s, z) and semi-axes (a along f, b along s, c along z), metres. */
  c: [number, number, number];
  r: [number, number, number];
}

/** Roe deer, about 1.15 m long and 0.75 m at the shoulder. */
const ROE: Part[] = [
  { id: 'body', c: [0, 0, 0.56], r: [0.5, 0.18, 0.2] },
  { id: 'neck', c: [0.52, 0, 0.78], r: [0.14, 0.07, 0.09] },
  { id: 'head', c: [0.68, 0, 0.94], r: [0.11, 0.07, 0.08] },
  { id: 'leg', c: [0.34, 0.09, 0.2], r: [0.04, 0.04, 0.2] },
  { id: 'leg', c: [0.34, -0.09, 0.2], r: [0.04, 0.04, 0.2] },
  { id: 'leg', c: [-0.36, 0.09, 0.2], r: [0.05, 0.04, 0.2] },
  { id: 'leg', c: [-0.36, -0.09, 0.2], r: [0.05, 0.04, 0.2] },
  { id: 'heart', c: [0.27, 0, 0.47], r: [0.06, 0.05, 0.06] },
  { id: 'lungs', c: [0.2, 0, 0.58], r: [0.15, 0.13, 0.12] },
  { id: 'liver', c: [0.02, 0.02, 0.55], r: [0.08, 0.1, 0.09] },
  { id: 'gut', c: [-0.2, 0, 0.52], r: [0.24, 0.15, 0.15] },
  { id: 'shoulder', c: [0.33, 0.15, 0.62], r: [0.1, 0.03, 0.13] },
  { id: 'shoulder', c: [0.33, -0.15, 0.62], r: [0.1, 0.03, 0.13] },
  { id: 'spine', c: [0, 0, 0.73], r: [0.5, 0.03, 0.03] },
  { id: 'ham', c: [-0.38, 0.1, 0.52], r: [0.12, 0.07, 0.13] },
  { id: 'ham', c: [-0.38, -0.1, 0.52], r: [0.12, 0.07, 0.13] },
];

function scaled(parts: Part[], k: number): Part[] {
  return parts.map((p) => ({
    id: p.id,
    c: [p.c[0] * k, p.c[1] * k, p.c[2] * k],
    r: [p.r[0] * k, p.r[1] * k, p.r[2] * k],
  }));
}

/** A mountain hare is near enough a roe deer at 45 % scale for a bow shot. */
export const ANATOMY: Record<SpeciesId, Part[]> = {
  roe: ROE,
  hare: scaled(ROE, 0.45),
};

/** Neck and head lowered to graze or drink: the moment to draw. */
const ROE_HEAD_DOWN: Part[] = [
  { id: 'neck', c: [0.6, 0, 0.52], r: [0.15, 0.07, 0.09] },
  { id: 'head', c: [0.72, 0, 0.22], r: [0.1, 0.07, 0.08] },
];

const HEAD_DOWN: Record<SpeciesId, Part[]> = {
  roe: ROE_HEAD_DOWN,
  hare: scaled(ROE_HEAD_DOWN, 0.45),
};

/** The body in its current posture. */
export function anatomyFor(species: SpeciesId, headDown: boolean): Part[] {
  const parts = ANATOMY[species];
  if (!headDown) return parts;
  const lowered = HEAD_DOWN[species];
  return parts.map((p) => lowered.find((q) => q.id === p.id) ?? p);
}

/** Organs whose outline knowledge reveals on the shot inset, from vital to less so. */
export const VITALS: readonly PartId[] = ['heart', 'lungs', 'liver', 'gut'];

/** Where to aim by default when drawing: the middle of the body. */
export function bodyCentre(species: SpeciesId): { u: number; v: number } {
  const body = ANATOMY[species][0] as Part;
  return { u: 0, v: body.c[2] };
}
