/**
 * The wind you can see without any arrows: gusts rolling downwind as soft,
 * lighter patches over the ground, and the treetops leaning with the wind
 * and further as a gust passes through them.
 *
 * Purely visual: real time and Math.random, nothing fed back into the sim.
 */
import { type Container, Graphics } from 'pixi.js';
import type { Snapshot } from '../sim/snapshot';
import type { ViewRect } from './air';

const PX = 16; // PX_PER_M
/** Below this wind speed (m/s) nothing moves. */
const CALM_WIND = 1;
const PAUSED_MS = 350;
/** A gust's size across the wind and along it, metres. */
const GUST_WIDTH_M = 26;
const GUST_DEPTH_M = 9;
/** Nested ellipses per gust: more make a softer edge. */
const LAYERS = 6;

interface Gust {
  /** Centre, metres. */
  x: number;
  y: number;
  age: number;
  life: number;
  /** 0..1 */
  strength: number;
}

export class WindField {
  private g = new Graphics();
  private gusts: Gust[] = [];
  private lastFrame = 0;
  private lastTick = -1;
  private tickSeenAt = 0;
  private angle = 0;
  private wind = 0;
  /** Time in real seconds, for the steady flutter. */
  private clock = 0;

  constructor(layer: Container) {
    layer.addChild(this.g);
  }

  update(s: Snapshot, view: ViewRect, now: number): void {
    let dt = this.lastFrame === 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (s.tick !== this.lastTick) {
      this.lastTick = s.tick;
      this.tickSeenAt = now;
    } else if (now - this.tickSeenAt > PAUSED_MS) {
      dt = 0;
    }
    this.clock += dt;
    this.angle = s.scent.angle;
    this.wind = s.wind.speed;

    const want = this.wind < CALM_WIND ? 0 : Math.round(Math.min(16, 3 + 1.6 * this.wind));
    while (this.gusts.length > want) this.gusts.pop();
    while (this.gusts.length < want) this.gusts.push(this.spawn(view, true));
    const v = gustSpeed(this.wind);
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    for (let i = 0; i < this.gusts.length; i++) {
      const gust = this.gusts[i] as Gust;
      gust.age += dt;
      gust.x += cos * v * dt;
      gust.y += sin * v * dt;
      const pad = GUST_WIDTH_M;
      const outside =
        gust.x < view.x0 - pad ||
        gust.x > view.x1 + pad ||
        gust.y < view.y0 - pad ||
        gust.y > view.y1 + pad;
      if (gust.age >= gust.life || outside) this.gusts[i] = this.spawn(view, false);
    }
    this.draw(s.weather.snowCm > 1);
  }

  /**
   * How far a treetop at (x, y) is pushed downwind, metres: a steady lean in
   * the wind, a flutter, and more under a passing gust.
   */
  lean(x: number, y: number, phase: number): { dx: number; dy: number } {
    if (this.wind < CALM_WIND) return { dx: 0, dy: 0 };
    const steady = Math.min(1, this.wind / 10);
    let gust = 0;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    for (const g of this.gusts) {
      // Distance in the gust's own frame: along the wind and across it.
      const rx = x - g.x;
      const ry = y - g.y;
      const along = (rx * cos + ry * sin) / GUST_DEPTH_M;
      const across = (-rx * sin + ry * cos) / GUST_WIDTH_M;
      const d2 = along * along + across * across;
      if (d2 < 1) gust = Math.max(gust, (1 - d2) * g.strength * envelope(g));
    }
    const flutter = Math.sin(this.clock * (1.5 + steady * 2) + phase) * 0.35;
    const push = steady * (0.25 + 0.1 * flutter) + 0.7 * gust * Math.min(1, this.wind / 6);
    // A little sideways sway too, so crowns don't slide like a sheet.
    const side = 0.05 * steady * Math.sin(this.clock * 2.3 + phase * 1.7);
    return { dx: cos * push - sin * side, dy: sin * push + cos * side };
  }

  private spawn(view: ViewRect, anyAge: boolean): Gust {
    const life = 3 + Math.random() * 4;
    // New gusts come in from the upwind side of the view.
    const w = view.x1 - view.x0;
    const h = view.y1 - view.y0;
    let x = view.x0 + Math.random() * w;
    let y = view.y0 + Math.random() * h;
    if (!anyAge) {
      const back = 0.5 * Math.random() * Math.max(w, h);
      x -= Math.cos(this.angle) * back;
      y -= Math.sin(this.angle) * back;
    }
    return {
      x,
      y,
      age: anyAge ? Math.random() * life : 0,
      life,
      strength: 0.5 + 0.5 * Math.random(),
    };
  }

  /** Each gust as a soft, lighter patch, wider across the wind than along it. */
  private draw(snowy: boolean): void {
    const g = this.g;
    g.clear();
    if (this.gusts.length === 0) return;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    // Over grass a gust lightens the ground; over snow it shows as a cold shade.
    const color = snowy ? 0x7d8fa3 : 0xffffff;
    const base = (snowy ? 0.06 : 0.07) * Math.min(1, this.wind / 6);
    for (const gust of this.gusts) {
      const a = base * gust.strength * envelope(gust);
      if (a < 0.004) continue;
      for (let k = 1; k <= LAYERS; k++) {
        // Nested ellipses make a soft edge.
        const w = (GUST_WIDTH_M * k) / LAYERS;
        const d = (GUST_DEPTH_M * k) / LAYERS;
        const pts: number[] = [];
        for (let j = 0; j < 16; j++) {
          const t = (j / 16) * Math.PI * 2;
          const along = Math.cos(t) * d;
          const across = Math.sin(t) * w;
          pts.push(
            (gust.x + along * cos - across * sin) * PX,
            (gust.y + along * sin + across * cos) * PX,
          );
        }
        g.poly(pts).fill({ color, alpha: a / 2 });
      }
    }
  }
}

/** Gusts swell and die away over their life. */
function envelope(g: Gust): number {
  return Math.sin((Math.PI * g.age) / g.life);
}

/** How fast gusts roll across the ground, metres per real second. */
function gustSpeed(wind: number): number {
  return 3 + 2.4 * wind;
}
