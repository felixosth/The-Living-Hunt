/**
 * What the air is doing, drawn over the world: faint streaks blowing with the
 * wind, and a drift of your own scent carried downwind from where you stand.
 * If an animal sits in the drift, it can smell you.
 *
 * Purely visual: positions are in world metres, moved in real time and
 * seeded with Math.random, so nothing here feeds back into the simulation.
 */
import { type Container, Graphics } from 'pixi.js';
import type { Snapshot } from '../sim/snapshot';
import { COLORS } from './palette';

const PX = 16; // PX_PER_M
/** Below this wind speed (m/s) nothing streaks and your scent pools around you. */
const CALM_WIND = 0.5;
/** Scent puffs released per real second. */
const SCENT_RATE = 14;
/** Longest a scent puff drifts, in real seconds. */
const SCENT_LIFE_S = 14;
/** How long the game can stay on one tick before the air counts as paused, ms. */
const PAUSED_MS = 350;

interface Streak {
  x: number;
  y: number;
  age: number;
  life: number;
  wobble: number;
}

interface Puff {
  x0: number;
  y0: number;
  angle: number;
  speed: number;
  age: number;
  life: number;
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
  private puffs: Puff[] = [];
  private owed = 0;
  private lastFrame = 0;
  private lastTick = -1;
  private tickSeenAt = 0;

  constructor(layer: Container) {
    layer.addChild(this.g);
  }

  update(s: Snapshot, px: number, py: number, view: ViewRect, zoom: number, now: number): void {
    let dt = this.lastFrame === 0 ? 0 : Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (s.tick !== this.lastTick) {
      this.lastTick = s.tick;
      this.tickSeenAt = now;
    } else if (now - this.tickSeenAt > PAUSED_MS) {
      dt = 0;
    }

    const { angle, halfAngle, range } = s.scent;
    const wind = s.wind.speed;
    const calm = wind < CALM_WIND;
    this.moveStreaks(dt, angle, wind, view);
    this.movePuffs(dt, px, py, angle, halfAngle, range, wind, calm);

    const g = this.g;
    g.clear();
    this.drawStreaks(g, angle, wind, zoom);
    this.drawPuffs(g, range);
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

  private movePuffs(
    dt: number,
    px: number,
    py: number,
    angle: number,
    halfAngle: number,
    range: number,
    wind: number,
    calm: boolean,
  ): void {
    for (const p of this.puffs) p.age += dt;
    this.puffs = this.puffs.filter((p) => p.age < p.life);
    this.owed += dt * SCENT_RATE;
    // In still air scent creeps out a little way; in wind it's carried to the cone's end.
    const speed = calm ? 1.2 : Math.max(2 + 2 * wind, range / SCENT_LIFE_S);
    const life = Math.min(SCENT_LIFE_S, range / speed);
    while (this.owed >= 1) {
      this.owed -= 1;
      // Most scent drifts near the middle of the cone; a little reaches its edges.
      const spread = calm
        ? (Math.random() * 2 - 1) * Math.PI
        : (Math.random() + Math.random() - 1) * halfAngle;
      this.puffs.push({
        x0: px,
        y0: py,
        angle: angle + spread,
        speed: speed * (0.8 + Math.random() * 0.4),
        age: 0,
        life,
      });
    }
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

  private drawPuffs(g: Graphics, range: number): void {
    for (const p of this.puffs) {
      const d = p.speed * p.age;
      const t = p.age / p.life;
      const fadeIn = Math.min(1, p.age / 0.4);
      const alpha = 0.18 * fadeIn * (1 - t) ** 1.4;
      if (alpha <= 0.01) continue;
      // Scent spreads as it drifts.
      const r = (0.5 + 0.05 * Math.min(d, range)) * PX;
      g.circle((p.x0 + Math.cos(p.angle) * d) * PX, (p.y0 + Math.sin(p.angle) * d) * PX, r).fill({
        color: COLORS.scent,
        alpha,
      });
    }
  }
}

/** How fast the streaks travel, in metres per real second. */
function streakSpeed(wind: number): number {
  return 2 + 2.2 * wind;
}
