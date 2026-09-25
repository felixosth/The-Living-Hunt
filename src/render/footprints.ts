/**
 * Your own footprints in the snow, drawn behind you so you can see where
 * you've been. Purely visual: new snow buries them, a thaw takes them.
 */
import { type Container, Graphics } from 'pixi.js';
import { SECONDS_PER_HOUR } from '../core/time';
import { SNOW_PRINT_CM } from '../sim/ground';
import type { Snapshot } from '../sim/snapshot';
import { COLORS } from './palette';

const PX = 16; // PX_PER_M
/** A print every this many metres, left and right in turn. */
const STRIDE_M = 0.8;
const MAX_PRINTS = 1500;
/** They fade out over this much game time. */
const FADE_S = 48 * SECONDS_PER_HOUR;

interface Print {
  x: number;
  y: number;
  heading: number;
  t: number;
  left: boolean;
}

export class Footprints {
  private g = new Graphics();
  private prints: Print[] = [];
  private lastX = Number.NaN;
  private lastY = Number.NaN;
  private left = false;
  private dirty = false;
  private drawnHour = -1;

  constructor(layer: Container) {
    layer.addChild(this.g);
  }

  clear(): void {
    this.prints = [];
    this.lastX = Number.NaN;
    this.dirty = true;
  }

  update(s: Snapshot): void {
    const { weather } = s;
    if (weather.snowCm < 1 && this.prints.length > 0) this.clear();
    // New snow buries what was made before it stopped.
    const buried = this.prints.findIndex((p) => p.t >= weather.snowEndedAt - 1800);
    if (buried !== 0 && this.prints.length > 0) {
      this.prints = buried < 0 ? [] : this.prints.slice(buried);
      this.dirty = true;
    }
    const { x, y } = s.player;
    if (Number.isNaN(this.lastX)) {
      this.lastX = x;
      this.lastY = y;
    }
    const moved = Math.hypot(x - this.lastX, y - this.lastY);
    if (moved > 6) {
      // A jump (loading, teleport): start afresh from here.
      this.lastX = x;
      this.lastY = y;
    } else if (moved >= STRIDE_M) {
      if (weather.snowHere >= SNOW_PRINT_CM) {
        const heading = Math.atan2(y - this.lastY, x - this.lastX);
        this.left = !this.left;
        this.prints.push({ x, y, heading, t: s.time, left: this.left });
        if (this.prints.length > MAX_PRINTS) this.prints.shift();
        this.dirty = true;
      }
      this.lastX = x;
      this.lastY = y;
    }
    const hour = Math.floor(s.time / SECONDS_PER_HOUR);
    if (hour !== this.drawnHour) this.dirty = true;
    if (this.dirty) this.draw(s.time, hour);
  }

  private draw(now: number, hour: number): void {
    this.dirty = false;
    this.drawnHour = hour;
    const g = this.g;
    g.clear();
    for (const p of this.prints) {
      const alpha = 0.55 * (1 - Math.min(1, (now - p.t) / FADE_S));
      if (alpha <= 0.02) continue;
      const side = p.left ? -0.18 : 0.18;
      const cos = Math.cos(p.heading);
      const sin = Math.sin(p.heading);
      const cx = p.x - sin * side;
      const cy = p.y + cos * side;
      // A boot: a long oval pointing the way you walked.
      const pts: number[] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const f = Math.cos(a) * 0.3;
        const r = Math.sin(a) * 0.12;
        pts.push((cx + f * cos - r * sin) * PX, (cy + f * sin + r * cos) * PX);
      }
      g.poly(pts).fill({ color: COLORS.snowPrint, alpha });
    }
  }
}
