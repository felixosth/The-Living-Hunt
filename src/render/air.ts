/**
 * What the air is doing, drawn over the world: faint streaks blowing with the
 * wind, more and longer the harder it blows (your scent goes the same way),
 * and rain or snow falling through it.
 *
 * Purely visual: positions are in world metres, moved in real time and
 * seeded with Math.random, so nothing here feeds back into the simulation.
 */
import { type Container, Graphics } from 'pixi.js';
import type { Snapshot } from '../sim/snapshot';
import { COLORS } from './palette';

const PX = 16; // PX_PER_M
/** Below this wind speed (m/s) nothing streaks. */
const CALM_WIND = 0.5;
/** How long the game can stay on one tick before the air counts as paused, ms. */
const PAUSED_MS = 350;

interface Streak {
  x: number;
  y: number;
  age: number;
  life: number;
  wobble: number;
}

interface Drop {
  x: number;
  y: number;
  age: number;
  life: number;
  /** Per-drop variation, 0..1. */
  seed: number;
}

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class AirLayer {
  private g = new Graphics();
  private streaks: Streak[] = [];
  private drops: Drop[] = [];
  private lastFrame = 0;
  private lastTick = -1;
  private tickSeenAt = 0;

  constructor(layer: Container) {
    layer.addChild(this.g);
  }

  update(s: Snapshot, view: ViewRect, zoom: number, now: number): void {
    let dt = this.lastFrame === 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (s.tick !== this.lastTick) {
      this.lastTick = s.tick;
      this.tickSeenAt = now;
    } else if (now - this.tickSeenAt > PAUSED_MS) {
      dt = 0;
    }

    // The way the wind blows, which is the way your scent drifts.
    const { angle } = s.scent;
    const wind = s.wind.speed;
    this.moveStreaks(dt, angle, wind, view);
    const { precip, precipType } = s.weather;
    const snowing = precipType === 'snow';
    this.moveDrops(dt, angle, wind, view, precipType === 'none' ? 0 : precip, snowing);

    const g = this.g;
    g.clear();
    this.drawStreaks(g, angle, wind, zoom);
    if (snowing) this.drawSnow(g, zoom);
    else this.drawRain(g, angle, wind, zoom, precipType === 'sleet');
  }

  /** Raindrops and snowflakes in view, as many as the fall is heavy. */
  private moveDrops(
    dt: number,
    angle: number,
    wind: number,
    view: ViewRect,
    precip: number,
    snowing: boolean,
  ): void {
    const heavy = Math.min(1, precip / 2);
    const want =
      precip < 0.03 ? 0 : Math.round((snowing ? 70 : 50) + (snowing ? 260 : 200) * heavy);
    while (this.drops.length > want) this.drops.pop();
    while (this.drops.length < want) this.drops.push(this.spawnDrop(view, snowing, true));
    // Snow drifts with the wind and wanders; rain is gone in a moment.
    const drift = snowing ? 0.6 + 0.5 * wind : 0;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i] as Drop;
      d.age += dt;
      if (snowing) {
        const wander = Math.sin(d.age * 2.2 + d.seed * 20) * 0.6;
        d.x += (Math.cos(angle) * drift + Math.cos(angle + Math.PI / 2) * wander) * dt;
        d.y += (Math.sin(angle) * drift + Math.sin(angle + Math.PI / 2) * wander) * dt;
      }
      const outside = d.x < view.x0 || d.x > view.x1 || d.y < view.y0 || d.y > view.y1;
      if (d.age >= d.life || outside) this.drops[i] = this.spawnDrop(view, snowing, false);
    }
  }

  private spawnDrop(view: ViewRect, snowing: boolean, anyAge: boolean): Drop {
    const life = snowing ? 2 + Math.random() * 3 : 0.35 + Math.random() * 0.25;
    return {
      x: view.x0 + Math.random() * (view.x1 - view.x0),
      y: view.y0 + Math.random() * (view.y1 - view.y0),
      age: anyAge ? Math.random() * life : 0,
      life,
      seed: Math.random(),
    };
  }

  /** Flakes: soft white dots that fade in and out as they settle. */
  private drawSnow(g: Graphics, zoom: number): void {
    for (const d of this.drops) {
      const t = d.age / d.life;
      const alpha = Math.sin(Math.PI * t) * (0.55 + 0.35 * d.seed);
      if (alpha <= 0.02) continue;
      g.circle(d.x * PX, d.y * PX, (1.3 + 1.6 * d.seed) / zoom).fill({
        color: COLORS.snowflake,
        alpha,
      });
    }
  }

  /**
   * Rain seen from above: a short streak down the screen, slanted by the
   * wind, then a ring where the drop lands.
   */
  private drawRain(g: Graphics, angle: number, wind: number, zoom: number, sleet: boolean): void {
    const slant = Math.min(0.8, wind / 10);
    const sx = Math.cos(angle) * slant;
    const sy = 1 + Math.sin(angle) * slant;
    const len = (sleet ? 10 : 16) / zoom;
    for (const d of this.drops) {
      const t = d.age / d.life;
      const x = d.x * PX;
      const y = d.y * PX;
      if (t < 0.6) {
        const k = 1 - t / 0.6;
        g.moveTo(x - sx * len * (k + 1), y - sy * len * (k + 1))
          .lineTo(x - sx * len * k, y - sy * len * k)
          .stroke({ width: (sleet ? 1.8 : 1.1) / zoom, color: COLORS.rain, alpha: 0.5 });
      } else {
        const k = (t - 0.6) / 0.4;
        g.circle(x, y, (1 + 4 * k) / zoom).stroke({
          width: 0.8 / zoom,
          color: sleet ? COLORS.snowflake : COLORS.rain,
          alpha: 0.45 * (1 - k),
        });
      }
    }
  }

  private moveStreaks(dt: number, angle: number, wind: number, view: ViewRect): void {
    const want = wind < CALM_WIND ? 0 : Math.round(Math.min(90, 16 + 9 * wind));
    while (this.streaks.length > want) this.streaks.pop();
    while (this.streaks.length < want) this.streaks.push(this.spawnStreak(view, true));
    const v = streakSpeed(wind);
    for (let i = 0; i < this.streaks.length; i++) {
      const st = this.streaks[i] as Streak;
      st.age += dt;
      st.x += Math.cos(angle + st.wobble) * v * dt;
      st.y += Math.sin(angle + st.wobble) * v * dt;
      const outside = st.x < view.x0 || st.x > view.x1 || st.y < view.y0 || st.y > view.y1;
      if (st.age >= st.life || outside) this.streaks[i] = this.spawnStreak(view, false);
    }
  }

  private spawnStreak(view: ViewRect, anyAge: boolean): Streak {
    const life = 1.6 + Math.random() * 2.2;
    return {
      x: view.x0 + Math.random() * (view.x1 - view.x0),
      y: view.y0 + Math.random() * (view.y1 - view.y0),
      age: anyAge ? Math.random() * life : 0,
      life,
      wobble: (Math.random() - 0.5) * 0.2,
    };
  }

  private drawStreaks(g: Graphics, angle: number, wind: number, zoom: number): void {
    if (this.streaks.length === 0) return;
    const len = Math.min(7, 1.2 + 0.5 * wind) * PX;
    const strength = Math.min(1, wind / 5);
    for (const st of this.streaks) {
      const t = st.age / st.life;
      const alpha = Math.sin(Math.PI * t) * (0.16 + 0.16 * strength);
      if (alpha <= 0.01) continue;
      const dx = Math.cos(angle + st.wobble) * len;
      const dy = Math.sin(angle + st.wobble) * len;
      const x = st.x * PX;
      const y = st.y * PX;
      g.moveTo(x - dx, y - dy)
        .lineTo(x, y)
        .stroke({ width: 1.4 / zoom, color: COLORS.wind, alpha, cap: 'round' });
    }
  }
}

/** How fast the streaks travel, in metres per real second. */
function streakSpeed(wind: number): number {
  return 2 + 2.2 * wind;
}
