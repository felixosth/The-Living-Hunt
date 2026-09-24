export const TAU = Math.PI * 2;

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hermite smoothstep of `x` between edges `e0` and `e1`, clamped to [0, 1]. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Wrap an angle in degrees to [0, 360). */
export function wrapDeg(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Linear interpolation between two angles (radians) along the shortest arc. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Eight-point compass name for a bearing in degrees (0 = north, clockwise). */
export function compassName(bearingDeg: number): (typeof COMPASS)[number] {
  return COMPASS[Math.round(wrapDeg(bearingDeg) / 45) % 8] as (typeof COMPASS)[number];
}
