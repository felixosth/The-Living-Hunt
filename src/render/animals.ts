/**
 * Animal sprites and awareness eyes. Animals are drawn in the agent layer
 * (under the canopies, darkened at night); their eyes go in the overlay so
 * they stay readable in the dark.
 */
import { Container, Graphics } from 'pixi.js';
import { lerp, lerpAngle } from '../core/math';
import type { AnimalView, Snapshot } from '../sim/snapshot';
import { COLORS } from './palette';

const PX = 16; // PX_PER_M, duplicated to avoid an import cycle with renderer.ts

interface AnimalSprite {
  body: Container;
  pose: string;
}

function poseKey(a: AnimalView): string {
  const posture =
    a.activity === 'dead'
      ? 'dead'
      : a.activity === 'bedded'
        ? 'bed'
        : a.alertness === 'fleeing' || a.speed > 8
          ? 'run'
          : 'stand';
  const rump = a.alertness === 'alarmed' || a.alertness === 'fleeing' ? 'flared' : 'calm';
  return `${a.species}:${a.juvenile ? 'j' : 'a'}:${posture}:${rump}:${a.seen ? 'seen' : 'hidden'}`;
}

/** Lying on its side, legs out. */
function drawDead(g: Graphics, body: number, dark: number, len: number, wid: number): void {
  const s = PX;
  g.ellipse(0.05 * s, 0.08 * s, len * s, wid * 1.2 * s).fill({ color: COLORS.shadow, alpha: 0.3 });
  for (const f of [0.28, 0.16, -0.22, -0.34]) {
    g.moveTo(f * len * 2 * s, wid * 0.6 * s)
      .lineTo((f * len * 2 + 0.05) * s, (wid + 0.3 * len) * s)
      .stroke({ width: 0.06 * s, color: dark });
  }
  g.ellipse(0, 0, len * s, wid * s)
    .fill(body)
    .stroke({ width: 1, color: dark });
  g.circle(len * 1.15 * s, -0.05 * s, wid * 0.55 * s)
    .fill(body)
    .stroke({ width: 1, color: dark });
}

function drawRoe(g: Graphics, posture: string, flared: boolean): void {
  const s = PX;
  if (posture === 'dead') {
    drawDead(g, COLORS.roe, COLORS.roeDark, 0.52, 0.24);
    return;
  }
  if (posture === 'bed') {
    g.ellipse(0.08 * s, 0.08 * s, 0.4 * s, 0.27 * s).fill({ color: COLORS.shadow, alpha: 0.3 });
    g.ellipse(0, 0, 0.38 * s, 0.25 * s)
      .fill(COLORS.roe)
      .stroke({ width: 1, color: COLORS.roeDark });
    g.circle(0.26 * s, 0.14 * s, 0.12 * s).fill(COLORS.roeDark);
    g.ellipse(0.22 * s, 0.03 * s, 0.05 * s, 0.03 * s).fill(COLORS.roeDark);
    g.ellipse(0.22 * s, 0.24 * s, 0.05 * s, 0.03 * s).fill(COLORS.roeDark);
    return;
  }
  const stretch = posture === 'run' ? 1.12 : 1;
  g.ellipse(0.1 * s, 0.1 * s, 0.56 * s * stretch, 0.22 * s).fill({
    color: COLORS.shadow,
    alpha: 0.3,
  });
  g.ellipse(0, 0, 0.55 * s * stretch, 0.2 * s)
    .fill(COLORS.roe)
    .stroke({
      width: 1,
      color: COLORS.roeDark,
    });
  // Neck and head.
  g.ellipse(0.5 * s * stretch, 0, 0.14 * s, 0.09 * s).fill(COLORS.roe);
  g.circle(0.66 * s * stretch, 0, 0.12 * s)
    .fill(COLORS.roe)
    .stroke({
      width: 1,
      color: COLORS.roeDark,
    });
  g.ellipse(0.8 * s * stretch, 0, 0.07 * s, 0.05 * s).fill(COLORS.roeDark);
  g.ellipse(0.6 * s * stretch, -0.11 * s, 0.07 * s, 0.035 * s).fill(COLORS.roeDark);
  g.ellipse(0.6 * s * stretch, 0.11 * s, 0.07 * s, 0.035 * s).fill(COLORS.roeDark);
  // The white rump patch flares when alarmed: the signal every hunter learns to dread.
  const r = flared ? 0.17 : 0.1;
  g.ellipse(-0.5 * s * stretch, 0, r * s, (r + 0.02) * s).fill({
    color: COLORS.rump,
    alpha: flared ? 1 : 0.7,
  });
}

function drawHare(g: Graphics, posture: string): void {
  const s = PX;
  if (posture === 'dead') {
    drawDead(g, COLORS.hare, COLORS.hareDark, 0.22, 0.11);
    return;
  }
  if (posture === 'bed') {
    g.ellipse(0.04 * s, 0.04 * s, 0.18 * s, 0.14 * s).fill({ color: COLORS.shadow, alpha: 0.3 });
    g.ellipse(0, 0, 0.17 * s, 0.13 * s)
      .fill(COLORS.hare)
      .stroke({ width: 1, color: COLORS.hareDark });
    g.ellipse(-0.02 * s, -0.05 * s, 0.14 * s, 0.025 * s).fill(COLORS.hareDark);
    g.ellipse(-0.02 * s, 0.05 * s, 0.14 * s, 0.025 * s).fill(COLORS.hareDark);
    return;
  }
  const stretch = posture === 'run' ? 1.25 : 1;
  g.ellipse(0.04 * s, 0.04 * s, 0.24 * s * stretch, 0.11 * s).fill({
    color: COLORS.shadow,
    alpha: 0.3,
  });
  g.ellipse(0, 0, 0.23 * s * stretch, 0.11 * s)
    .fill(COLORS.hare)
    .stroke({
      width: 1,
      color: COLORS.hareDark,
    });
  g.circle(0.2 * s * stretch, 0, 0.08 * s).fill(COLORS.hare);
  g.ellipse(0.06 * s, -0.05 * s, 0.13 * s, 0.025 * s).fill(COLORS.hareDark);
  g.ellipse(0.06 * s, 0.05 * s, 0.13 * s, 0.025 * s).fill(COLORS.hareDark);
  g.circle(-0.23 * s * stretch, 0, 0.04 * s).fill(COLORS.rump);
}

function buildSprite(a: AnimalView): Container {
  const c = new Container();
  const g = new Graphics();
  const [, age, posture, rump, seen] = poseKey(a).split(':') as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (a.species === 'roe') drawRoe(g, posture, rump === 'flared');
  else drawHare(g, posture);
  // Drawn larger than life, like the player, so they read at a useful zoom.
  g.scale.set((a.species === 'roe' ? 1.8 : 2.2) * (age === 'j' ? 0.78 : 1));
  c.addChild(g);
  c.alpha = seen === 'seen' ? 1 : 0.4;
  return c;
}

export class AnimalLayer {
  private sprites = new Map<number, AnimalSprite>();
  private eyes = new Graphics();

  constructor(
    private readonly bodies: Container,
    overlay: Container,
  ) {
    overlay.addChild(this.eyes);
  }

  clear(): void {
    for (const s of this.sprites.values()) s.body.destroy({ children: true });
    this.sprites.clear();
    this.eyes.clear();
  }

  /** Positions (in metres) of the animals drawn this frame, for canopy fading. */
  update(prev: Snapshot, curr: Snapshot, alpha: number, zoom: number): { x: number; y: number }[] {
    const before = new Map(prev.animals.map((a) => [a.id, a]));
    const alive = new Set<number>();
    const points: { x: number; y: number }[] = [];
    this.eyes.clear();

    for (const a of curr.animals) {
      alive.add(a.id);
      const p = before.get(a.id) ?? a;
      const x = lerp(p.x, a.x, alpha);
      const y = lerp(p.y, a.y, alpha);
      const key = poseKey(a);
      let sprite = this.sprites.get(a.id);
      if (!sprite || sprite.pose !== key) {
        sprite?.body.destroy({ children: true });
        sprite = { body: buildSprite(a), pose: key };
        this.sprites.set(a.id, sprite);
        this.bodies.addChildAt(sprite.body, 0);
      }
      sprite.body.position.set(x * PX, y * PX);
      sprite.body.rotation = lerpAngle(p.heading, a.heading, alpha);
      if (a.seen) points.push({ x, y });
      this.drawEye(x, y, a, zoom);
    }
    for (const [id, sprite] of this.sprites) {
      if (!alive.has(id)) {
        sprite.body.destroy({ children: true });
        this.sprites.delete(id);
      }
    }
    return points;
  }

  /** An eye above the animal: the pupil grows with its awareness of you. */
  private drawEye(x: number, y: number, a: AnimalView, zoom: number): void {
    if (a.activity === 'dead' || (a.awareness < 0.12 && a.alertness === 'unaware')) return;
    const k = 1 / zoom;
    const cx = x * PX;
    const cy = (y - (a.species === 'roe' ? 1.8 : 1.2)) * PX - 6 * k;
    const color =
      a.alertness === 'unaware'
        ? COLORS.eyeCalm
        : a.alertness === 'suspicious'
          ? COLORS.eyeSuspicious
          : COLORS.eyeAlarmed;
    const w = 9 * k;
    const h = 5.5 * k;
    this.eyes
      .moveTo(cx - w, cy)
      .quadraticCurveTo(cx, cy - h * 2, cx + w, cy)
      .quadraticCurveTo(cx, cy + h * 2, cx - w, cy)
      .fill({ color: 0x14100c, alpha: 0.75 })
      .stroke({ width: 1.5 * k, color });
    this.eyes.circle(cx, cy, (1.2 + 3.3 * Math.min(1, a.awareness)) * k).fill(color);
  }
}
