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
/** How quickly the drawn wind follows a change in the weather, real seconds. */
const EASE_S = 4;

interface Gust {
  /** Centre, metres. */
  x: number;
  y: number;
  /** The way it travels and how fast (m/s): kept for its whole life. */
  angle: number;
  speed: number;
  age: number;
  life: number;
  /** 0..1 */
  strength: number;
}

/**
 * Ease a drawn wind towards the weather's, so a change of wind on the hour
 * swings round over a few seconds instead of in one frame.
 */
export function easeWind(
  current: { angle: number; speed: number } | null,
  angle: number,
  speed: number,
  dt: number,
): { angle: number; speed: number } {
  if (!current) return { angle, speed };
  const k = 1 - Math.exp(-dt / EASE_S);
  const turn = Math.atan2(Math.sin(angle - current.angle), Math.cos(angle - current.angle));
  return { angle: current.angle + turn * k, speed: current.speed + (speed - current.speed) * k };
}

export class WindField {
  private g = new Graphics();
  private gusts: Gust[] = [];
  private lastFrame = 0;
  private lastTick = -1;
  private tickSeenAt = 0;
  private eased: { angle: number; speed: number } | null = null;
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
    this.eased = easeWind(this.eased, s.scent.angle, s.wind.speed, dt);
    this.angle = this.eased.angle;
    this.wind = this.eased.speed;

    // Gusts never pop in or out: new ones fade in from nothing, and when the
    // wind drops the spare ones are left to fade away.
    const want = this.wind < CALM_WIND ? 0 : Math.round(Math.min(16, 3 + 1.6 * this.wind));
    while (this.gusts.length < want) this.gusts.push(this.spawn(view, false));
    let alive = 0;
    for (const gust of this.gusts) {
      gust.age += dt;
      gust.x += Math.cos(gust.angle) * gust.speed * dt;
      gust.y += Math.sin(gust.angle) * gust.speed * dt;
      const pad = GUST_WIDTH_M;
      const outside =
        gust.x < view.x0 - pad ||
        gust.x > view.x1 + pad ||
        gust.y < view.y0 - pad ||
        gust.y > view.y1 + pad;
      const done = gust.age >= gust.life || outside;
      if (!done) this.gusts[alive++] = gust;
      else if (alive < want) this.gusts[alive++] = this.spawn(view, true);
    }
    this.gusts.length = alive;
    this.draw(s.weather.snowCm > 1);
  }

  /**
   * How far a treetop at (x, y) is pushed downwind, metres: a steady lean in
   * the wind, a flutter, and more under a passing gust.
   */
  lean(x: number, y: number, phase: number): { dx: number; dy: number } {
    const steady = Math.min(1, this.wind / 10);
    let gust = 0;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    for (const g of this.gusts) {
      // Distance in the gust's own frame: along its way and across it.
      const rx = x - g.x;
      const ry = y - g.y;
      if (rx * rx + ry * ry > GUST_WIDTH_M * GUST_WIDTH_M) continue;
      const gc = Math.cos(g.angle);
      const gs = Math.sin(g.angle);
      const along = (rx * gc + ry * gs) / GUST_DEPTH_M;
      const across = (-rx * gs + ry * gc) / GUST_WIDTH_M;
      const d2 = along * along + across * across;
      if (d2 < 1) gust = Math.max(gust, (1 - d2) * g.strength * envelope(g));
    }
    const flutter = Math.sin(this.clock * (1.5 + steady * 2) + phase) * 0.35;
    const push = steady * (0.25 + 0.1 * flutter) + 0.7 * gust * Math.min(1, this.wind / 6);
    // A little sideways sway too, so crowns don't slide like a sheet.
    const side = 0.05 * steady * Math.sin(this.clock * 2.3 + phase * 1.7);
    return { dx: cos * push - sin * side, dy: sin * push + cos * side };
  }

  /** A new gust, starting faint. `upwind` places it back along the wind, to drift into view. */
  private spawn(view: ViewRect, upwind: boolean): Gust {
    const life = 3 + Math.random() * 4;
    const w = view.x1 - view.x0;
    const h = view.y1 - view.y0;
    let x = view.x0 + Math.random() * w;
    let y = view.y0 + Math.random() * h;
    if (upwind) {
      const back = 0.5 * Math.random() * Math.max(w, h);
      x -= Math.cos(this.angle) * back;
      y -= Math.sin(this.angle) * back;
    }
    return {
      x,
      y,
      angle: this.angle,
      speed: gustSpeed(this.wind),
      age: 0,
      life,
      strength: 0.5 + 0.5 * Math.random(),
    };
  }

  /** Each gust as a soft, lighter patch, wider across the wind than along it. */
  private draw(snowy: boolean): void {
    const g = this.g;
    g.clear();
    if (this.gusts.length === 0) return;
    // Over grass a gust lightens the ground; over snow it shows as a cold shade.
    const color = snowy ? 0x7d8fa3 : 0xffffff;
    const base = (snowy ? 0.06 : 0.07) * Math.min(1, Math.max(this.wind, CALM_WIND) / 6);
    for (const gust of this.gusts) {
      const a = base * gust.strength * envelope(gust);
      if (a < 0.004) continue;
      const cos = Math.cos(gust.angle);
      const sin = Math.sin(gust.angle);
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
