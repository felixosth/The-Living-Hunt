/**
 * Arrows in flight: from the bow past the animal to where each one ends up,
 * in the animal or on the ground beyond it. A hit throws up a puff of cut
 * hair, which doesn't say where the arrow struck; the blood does that.
 */
import { type Container, Graphics } from 'pixi.js';
import { COLORS } from './palette';

const PX = 16; // PX_PER_M
/** Drawn larger than life, like the animals, so it reads at a normal zoom. */
const G = 2;
/** Flight speed on screen, metres per real second: slower than a real arrow so you can follow it. */
const SPEED = 55;
const LYING_MS = 1500;
const FADE_MS = 900;
const PUFF_MS = 600;

export interface ArrowShot {
  fromX: number;
  fromY: number;
  atX: number;
  atY: number;
  endX: number;
  endY: number;
  hit: boolean;
}

interface Flight extends ArrowShot {
  start: number;
  /** Flight time to the end, ms. */
  duration: number;
  /** Share of the flight at which it reaches the animal. */
  atT: number;
  lodged: boolean;
}

export class ArrowFlights {
  private g = new Graphics();
  private flights: Flight[] = [];

  constructor(layer: Container) {
    layer.addChild(this.g);
  }

  add(shot: ArrowShot, now: number): void {
    const total = Math.hypot(shot.endX - shot.fromX, shot.endY - shot.fromY);
    const toAnimal = Math.hypot(shot.atX - shot.fromX, shot.atY - shot.fromY);
    this.flights.push({
      ...shot,
      start: now,
      duration: Math.max(150, (total / SPEED) * 1000),
      atT: total > 0 ? Math.min(1, toAnimal / total) : 1,
      lodged: shot.hit && total - toAnimal < 0.5,
    });
  }

  update(zoom: number, now: number): void {
    const g = this.g;
    g.clear();
    this.flights = this.flights.filter(
      (f) => now - f.start < f.duration + (f.lodged ? PUFF_MS : LYING_MS + FADE_MS),
    );
    for (const f of this.flights) {
      const elapsed = now - f.start;
      const t = Math.min(1, elapsed / f.duration);
      if (f.hit) this.drawPuff(g, f, elapsed, zoom);
      if (f.lodged && t >= 1) continue;
      const dx = f.endX - f.fromX;
      const dy = f.endY - f.fromY;
      const total = Math.hypot(dx, dy);
      const x = f.fromX + dx * t;
      const y = f.fromY + dy * t;
      // A shallow arc: the arrow rises above its shadow and comes down again.
      const lift = t < 1 ? 4 * t * (1 - t) * Math.min(1.5, 0.03 * total) : 0;
      const alpha = t < 1 ? 1 : 1 - Math.max(0, elapsed - f.duration - LYING_MS) / FADE_MS;
      if (alpha <= 0) continue;
      drawArrow(g, x, y, lift, Math.atan2(dy, dx), alpha, zoom);
    }
  }

  private drawPuff(g: Graphics, f: Flight, elapsed: number, zoom: number): void {
    const since = elapsed - f.atT * f.duration;
    if (since < 0 || since > PUFF_MS) return;
    const k = since / PUFF_MS;
    const heading = Math.atan2(f.endY - f.fromY, f.endX - f.fromX);
    for (let i = 0; i < 7; i++) {
      // Hair sprays forward and to the sides of the line of flight.
      const a = heading + (i - 3) * 0.45;
      const d = (0.3 + 0.12 * (i % 3)) * G * k + 0.15;
      g.circle(
        (f.atX + Math.cos(a) * d) * PX,
        (f.atY + Math.sin(a) * d) * PX,
        (1.6 + (i % 2)) / zoom,
      ).fill({ color: COLORS.hair, alpha: 0.9 * (1 - k) });
    }
  }
}

function drawArrow(
  g: Graphics,
  x: number,
  y: number,
  lift: number,
  heading: number,
  alpha: number,
  zoom: number,
): void {
  const half = 0.4 * G;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const width = Math.max(1.5 / zoom, 0.05 * G * PX);
  const line = (ox: number, oy: number, color: number, a: number) =>
    g
      .moveTo((x - cos * half) * PX + ox, (y - sin * half) * PX + oy)
      .lineTo((x + cos * half) * PX + ox, (y + sin * half) * PX + oy)
      .stroke({ width, color, alpha: a, cap: 'round' });
  // The shadow on the ground, then the arrow lifted above it.
  line(lift * 0.5 * PX, lift * 0.5 * PX, COLORS.shadow, 0.3 * alpha);
  const up = -lift * PX;
  line(0, up, COLORS.arrow, alpha);
  // Fletching at the tail.
  const tx = (x - cos * half) * PX;
  const ty = (y - sin * half) * PX + up;
  const fx = cos * 0.25 * G * PX;
  const fy = sin * 0.25 * G * PX;
  const nx = -sin * 0.09 * G * PX;
  const ny = cos * 0.09 * G * PX;
  g.poly([tx, ty, tx + fx + nx, ty + fy + ny, tx + fx, ty + fy, tx + fx - nx, ty + fy - ny]).fill({
    color: COLORS.fletching,
    alpha,
  });
}
