/**
 * Screen-space cues drawn over everything: arcs around the player showing
 * which way a sound came from, and markers at the screen edge pointing at
 * animals you can see but that are off screen.
 */
import { type Container, Graphics } from 'pixi.js';
import type { SoundKind } from '../sim/events';
import type { Snapshot } from '../sim/snapshot';
import { COLORS } from './palette';

const SOUND_LIFE_MS = 5000;
const ARC_RADIUS_PX = 72;
/** Half-width of a sound arc: you hear roughly, not exactly, where it came from. */
const ARC_SPREAD = 0.32;
const EDGE_PAD_PX = 26;

interface Sound {
  angle: number;
  kind: SoundKind;
  at: number;
}

const SOUND_COLOUR: Record<SoundKind, number> = {
  bark: COLORS.eyeSuspicious,
  crash: COLORS.eyeAlarmed,
  flush: COLORS.signHalo,
};

export class ScreenCues {
  private g = new Graphics();
  private sounds: Sound[] = [];

  constructor(stage: Container) {
    stage.addChild(this.g);
  }

  /** A sound from `angle` (radians, screen convention), already blurred by the caller. */
  addSound(kind: SoundKind, angle: number, now: number): void {
    this.sounds = [
      ...this.sounds.filter((s) => now - s.at < SOUND_LIFE_MS),
      { angle, kind, at: now },
    ];
  }

  draw(
    s: Snapshot,
    player: { x: number; y: number },
    toScreen: (x: number, y: number) => { x: number; y: number },
    width: number,
    height: number,
    now: number,
  ): void {
    const g = this.g;
    g.clear();
    for (const sound of this.sounds) {
      const age = (now - sound.at) / SOUND_LIFE_MS;
      if (age >= 1) continue;
      const alpha = age < 0.1 ? age / 0.1 : 1 - (age - 0.1) / 0.9;
      const color = SOUND_COLOUR[sound.kind];
      // Two arcs, the outer one spreading as the sound fades.
      for (const [r, w, a] of [
        [ARC_RADIUS_PX, 4, 0.9],
        [ARC_RADIUS_PX + 10 + 20 * age, 2, 0.5],
      ] as const) {
        g.arc(player.x, player.y, r, sound.angle - ARC_SPREAD, sound.angle + ARC_SPREAD).stroke({
          width: w,
          color,
          alpha: alpha * a,
          cap: 'round',
        });
      }
    }

    // Animals in view but off screen: a marker on the edge pointing at them.
    for (const a of s.animals) {
      if (!a.seen) continue;
      const p = toScreen(a.x, a.y);
      if (p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height) continue;
      const dx = p.x - player.x;
      const dy = p.y - player.y;
      const angle = Math.atan2(dy, dx);
      // Where the line from the player to the animal crosses the padded screen edge.
      const halfW = width / 2 - EDGE_PAD_PX;
      const halfH = height / 2 - EDGE_PAD_PX;
      const cx = width / 2;
      const cy = height / 2;
      const tx =
        dx === 0
          ? Number.POSITIVE_INFINITY
          : (dx > 0 ? cx + halfW - player.x : cx - halfW - player.x) / dx;
      const ty =
        dy === 0
          ? Number.POSITIVE_INFINITY
          : (dy > 0 ? cy + halfH - player.y : cy - halfH - player.y) / dy;
      const t = Math.min(tx, ty);
      const ex = player.x + dx * t;
      const ey = player.y + dy * t;
      const body =
        a.activity === 'dead' ? COLORS.ink : a.species === 'roe' ? COLORS.roe : COLORS.hare;
      const ring =
        a.alertness === 'unaware'
          ? COLORS.signHalo
          : a.alertness === 'suspicious'
            ? COLORS.eyeSuspicious
            : COLORS.eyeAlarmed;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const tip = 12;
      g.poly([
        ex + cos * tip,
        ey + sin * tip,
        ex - sin * 7,
        ey + cos * 7,
        ex + sin * 7,
        ey - cos * 7,
      ]).fill({ color: ring, alpha: 0.85 });
      g.circle(ex - cos * 8, ey - sin * 8, a.species === 'roe' ? 6 : 4.5)
        .fill(body)
        .stroke({ width: 1.5, color: ring });
    }
  }
}
