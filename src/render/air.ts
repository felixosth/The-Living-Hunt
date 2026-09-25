/**
 * What the air is doing, drawn over the world: faint streaks blowing with the
 * wind (fading out while rain or snow shows the wind instead), rain or snow
 * falling, your breath in the cold drifting the way your scent goes, and
 * smoke from the cabin's chimney.
 *
 * Purely visual: positions are in world metres, moved in real time and
 * seeded with Math.random, so nothing here feeds back into the simulation.
 */
import { type Container, Graphics } from 'pixi.js';
import type { Snapshot } from '../sim/snapshot';
import { COLORS } from './palette';
import { easeWind } from './wind';

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

/** A puff of breath or smoke: it drifts downwind, grows and fades. */
interface Puff {
  x: number;
  y: number;
  age: number;
  life: number;
  /** Starting radius and how much it grows, metres. */
  r0: number;
  grow: number;
  alpha: number;
  /** Its own small drift, m/s. */
  vx: number;
  vy: number;
}

/** You can see your breath below this temperature, °C. */
const BREATH_BELOW_C = 5;

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
  private breath: Puff[] = [];
  private smoke: Puff[] = [];
  private nextBreath = 0;
  private nextSmoke = 0;
  private chimney: { x: number; y: number } | null = null;
  /** The drawn wind, easing after the weather's. */
  private eased: { angle: number; speed: number } | null = null;
  private lastFrame = 0;
  private lastTick = -1;
  private tickSeenAt = 0;

  constructor(layer: Container) {
    layer.addChild(this.g);
  }

  /** Where the cabin's chimney is, in metres (null for none). */
  setChimney(at: { x: number; y: number } | null): void {
    this.chimney = at;
    this.smoke = [];
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
    this.eased = easeWind(this.eased, s.scent.angle, s.wind.speed, dt);
    const { angle, speed: wind } = this.eased;
    const { precip, precipType, temp } = s.weather;
    const falling = precipType === 'none' ? 0 : precip;
    // Rain and snow show the wind well enough on their own.
    const streaky = Math.max(0, 1 - falling / 0.4);
    this.moveStreaks(dt, angle, streaky > 0 ? wind : 0, view);
    const snowing = precipType === 'snow';
    this.moveDrops(dt, angle, wind, view, falling, snowing);
    this.breathe(s, dt, angle, wind, temp);
    this.smoulder(dt, angle, wind);

    const g = this.g;
    g.clear();
    this.drawStreaks(g, angle, wind, zoom, streaky);
    this.drawPuffs(g, this.smoke, COLORS.smoke);
    this.drawPuffs(g, this.breath, COLORS.breath);
    if (snowing) this.drawSnow(g, zoom);
    else this.drawRain(g, angle, wind, zoom, precipType === 'sleet');
  }

  /**
   * Your breath in cold air: a puff every few seconds, quicker when you run,
   * carried off the way your scent goes. In still air it hangs round you.
   */
  private breathe(s: Snapshot, dt: number, angle: number, wind: number, temp: number): void {
    ageAndDrift(this.breath, dt, angle, driftSpeed(wind));
    if (temp >= BREATH_BELOW_C || dt === 0) return;
    this.nextBreath -= dt;
    if (this.nextBreath > 0) return;
    const running = s.player.moving && s.player.gait === 'run';
    this.nextBreath = running ? 0.9 : s.player.moving ? 1.8 : 2.8;
    const cold = Math.min(1, (BREATH_BELOW_C - temp) / 12);
    const h = s.player.heading;
    this.breath.push({
      x: s.player.x + Math.cos(h) * 0.9,
      y: s.player.y + Math.sin(h) * 0.9,
      age: 0,
      life: 1.6 + 1.4 * cold,
      r0: 0.3,
      grow: 0.9 + 0.6 * cold,
      alpha: 0.4 + 0.3 * cold,
      vx: Math.cos(h) * 0.8,
      vy: Math.sin(h) * 0.8,
    });
  }

  /** A thin, steady trail of smoke from the chimney. */
  private smoulder(dt: number, angle: number, wind: number): void {
    ageAndDrift(this.smoke, dt, angle, driftSpeed(wind) * 1.4);
    if (!this.chimney || dt === 0) return;
    this.nextSmoke -= dt;
    if (this.nextSmoke > 0) return;
    this.nextSmoke = 0.35;
    this.smoke.push({
      x: this.chimney.x + (Math.random() - 0.5) * 0.3,
      y: this.chimney.y + (Math.random() - 0.5) * 0.3,
      age: 0,
      life: 5 + Math.random() * 2,
      r0: 0.4,
      grow: 2.6,
      alpha: 0.32,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
    });
  }

  private drawPuffs(g: Graphics, puffs: Puff[], color: number): void {
    for (const p of puffs) {
      const t = p.age / p.life;
      const alpha = p.alpha * Math.min(1, t * 6) * (1 - t);
      if (alpha <= 0.01) continue;
      g.circle(p.x * PX, p.y * PX, (p.r0 + p.grow * Math.sqrt(t)) * PX).fill({ color, alpha });
    }
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

  private drawStreaks(g: Graphics, angle: number, wind: number, zoom: number, fade: number): void {
    if (this.streaks.length === 0 || fade <= 0) return;
    const len = Math.min(7, 1.2 + 0.5 * wind) * PX;
    const strength = Math.min(1, wind / 5);
    for (const st of this.streaks) {
      const t = st.age / st.life;
      const alpha = Math.sin(Math.PI * t) * (0.09 + 0.1 * strength) * fade;
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

/** Age puffs, drift them downwind and drop the spent ones. */
function ageAndDrift(puffs: Puff[], dt: number, angle: number, speed: number): void {
  for (const p of puffs) {
    p.age += dt;
    p.x += (Math.cos(angle) * speed + p.vx) * dt;
    p.y += (Math.sin(angle) * speed + p.vy) * dt;
    // Their own push dies away; the wind takes over.
    p.vx *= 1 - Math.min(1, 1.5 * dt);
    p.vy *= 1 - Math.min(1, 1.5 * dt);
  }
  let w = 0;
  for (const p of puffs) if (p.age < p.life) puffs[w++] = p;
  puffs.length = w;
}

/** How fast breath and smoke drift, metres per real second: slower than the streaks. */
function driftSpeed(wind: number): number {
  return 0.3 + 0.9 * wind;
}

/** How fast the streaks travel, in metres per real second. */
function streakSpeed(wind: number): number {
  return 2 + 2.2 * wind;
}
