/**
 * What the air is doing, drawn over the world: faint streaks blowing with the
 * wind, more and longer the harder it blows. Your scent goes the same way.
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

export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class AirLayer {
  private g = new Graphics();
  private streaks: Streak[] = [];
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

    const g = this.g;
    g.clear();
    this.drawStreaks(g, angle, wind, zoom);
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
