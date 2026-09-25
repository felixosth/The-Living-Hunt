/**
 * Found signs drawn as ink glyphs on the ground, larger than life so they read
 * at a normal zoom. Rebuilt only when the set of found signs changes.
 */
import { type Container, Graphics } from 'pixi.js';
import { BloodType } from '../content/blood';
import type { SignView, Snapshot } from '../sim/snapshot';
import { COLORS } from './palette';

const PX = 16; // PX_PER_M
/** Glyphs are drawn this much larger than life so they read at a normal zoom. */
const G = 2;

const FADE_IN_MS = 700;

function drawGlyph(g: Graphics, s: SignView, visibility: number): void {
  const alpha = (0.35 + 0.65 * Math.min(1, s.integrity)) * visibility;
  const ink = { color: COLORS.ink, alpha };
  const cos = Math.cos(s.heading);
  const sin = Math.sin(s.heading);
  // Local (forward, right) in metres → world pixels.
  const at = (f: number, r: number): [number, number] => [
    (s.x + G * (f * cos - r * sin)) * PX,
    (s.y + G * (f * sin + r * cos)) * PX,
  ];
  const oval = (f: number, r: number, len: number, wid: number) => {
    const pts: number[] = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      pts.push(...at(f + Math.cos(a) * len, r + Math.sin(a) * wid));
    }
    g.poly(pts).fill(ink);
  };

  // A pale halo so found signs stand out from the ground.
  g.circle(s.x * PX, s.y * PX, 0.5 * G * PX).fill({ color: COLORS.signHalo, alpha: 0.16 * alpha });

  switch (s.kind) {
    case 'print':
      if (s.species === 'roe') {
        // Two slots of a cloven hoof, pointing the way it went.
        oval(0.05, -0.07, 0.2, 0.055);
        oval(0.05, 0.07, 0.2, 0.055);
      } else {
        // Hare: long hind feet side by side in front, small forefeet behind.
        oval(0.18, -0.1, 0.16, 0.06);
        oval(0.18, 0.1, 0.16, 0.06);
        oval(-0.12, -0.03, 0.06, 0.05);
        oval(-0.28, 0.02, 0.06, 0.05);
      }
      break;
    case 'pellets': {
      const dots = s.species === 'roe' ? 8 : 5;
      for (let k = 0; k < dots; k++) {
        const a = k * 2.4;
        const r = 0.08 + 0.05 * (k % 3);
        g.circle(
          (s.x + G * Math.cos(a) * r) * PX,
          (s.y + G * Math.sin(a) * r) * PX,
          0.055 * G * PX,
        ).fill(ink);
      }
      break;
    }
    case 'bed': {
      const pts: number[] = [];
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        pts.push(...at(Math.cos(a) * 0.7, Math.sin(a) * 0.42));
      }
      g.poly(pts)
        .fill({ color: COLORS.bed, alpha: 0.35 * alpha })
        .stroke({ width: 0.06 * G * PX, color: COLORS.ink, alpha: 0.6 * alpha });
      break;
    }
    case 'browse': {
      const [x0, y0] = at(-0.3, 0);
      const [x1, y1] = at(0.15, 0);
      const [xa, ya] = at(0.35, -0.15);
      const [xb, yb] = at(0.35, 0.15);
      g.moveTo(x0, y0).lineTo(x1, y1).lineTo(xa, ya).moveTo(x1, y1).lineTo(xb, yb);
      g.stroke({ width: 0.07 * G * PX, color: COLORS.browse, alpha });
      break;
    }
    case 'blood': {
      const color =
        s.blood === BloodType.Bright || s.blood === BloodType.Frothy
          ? COLORS.bloodBright
          : COLORS.bloodDark;
      for (let k = 0; k < 3; k++) {
        const a = s.heading + k * 2.1;
        g.circle(
          (s.x + G * Math.cos(a) * 0.14 * k) * PX,
          (s.y + G * Math.sin(a) * 0.14 * k) * PX,
          G * (0.1 - 0.02 * k) * PX,
        ).fill({ color, alpha });
      }
      if (s.blood === BloodType.Gut) {
        g.circle((s.x + 0.12 * G) * PX, (s.y - 0.1 * G) * PX, 0.06 * G * PX).fill({
          color: COLORS.gut,
          alpha,
        });
      }
      break;
    }
    case 'arrow': {
      const [x0, y0] = at(-0.45, 0);
      const [x1, y1] = at(0.45, 0);
      g.moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ width: 0.05 * PX, color: COLORS.arrow });
      g.poly([...at(-0.45, 0), ...at(-0.3, -0.08), ...at(-0.25, 0), ...at(-0.3, 0.08)]).fill(
        COLORS.fletching,
      );
      break;
    }
  }
  if (s.followed) {
    g.circle(s.x * PX, s.y * PX, 0.6 * G * PX).stroke({
      width: 2.5,
      color: COLORS.followed,
      alpha: 0.9,
    });
  } else if (s.inspected) {
    g.circle(s.x * PX, s.y * PX, 0.6 * G * PX).stroke({
      width: 1.5,
      color: COLORS.signHalo,
      alpha: 0.5,
    });
  }
}

export class SignLayer {
  private glyphs = new Graphics();
  private hover = new Graphics();
  private all = new Graphics();
  private revision = -1;
  /** When each found sign first appeared, so new ones fade in. */
  private firstSeen = new Map<number, number>();
  private fading = false;
  private revisionsSeen = 0;
  private following = false;
  private hoverId = 0;
  private allDrawnAt = 0;

  constructor(parent: Container, overlay: Container) {
    parent.addChild(this.all, this.glyphs);
    overlay.addChild(this.hover);
  }

  clear(): void {
    this.revision = -1;
    this.firstSeen.clear();
    this.revisionsSeen = 0;
    this.glyphs.clear();
    this.all.clear();
    this.hover.clear();
  }

  update(s: Snapshot, zoom: number, now: number): void {
    const following = s.tracking.following !== null;
    if (s.signsRevision !== this.revision || this.fading || following !== this.following) {
      this.revision = s.signsRevision;
      this.following = following;
      this.fading = false;
      this.glyphs.clear();
      for (const sign of s.signs) {
        let seenAt = this.firstSeen.get(sign.id);
        if (seenAt === undefined) {
          // Signs already found when the view opens don't fade in.
          seenAt = this.revisionsSeen === 0 ? now - FADE_IN_MS : now;
          this.firstSeen.set(sign.id, seenAt);
        }
        const fade = Math.min(1, (now - seenAt) / FADE_IN_MS);
        if (fade < 1) this.fading = true;
        // While following a trail, other animals' signs step back.
        const dim = following && !sign.followed ? 0.35 : 1;
        drawGlyph(this.glyphs, sign, fade * dim);
      }
      this.revisionsSeen++;
    }
    this.drawHover(s, zoom);
    // God view: every sign as a dot, redrawn at most twice a second.
    if (s.allSigns && now - this.allDrawnAt > 500) {
      this.allDrawnAt = now;
      const { count, x, y, kind } = s.allSigns;
      this.all.clear();
      for (let i = 0; i < count; i++) {
        this.all
          .circle((x[i] as number) * PX, (y[i] as number) * PX, 0.25 * PX)
          .fill({ color: COLORS.godSign[kind[i] as number] ?? 0xffffff, alpha: 0.7 });
      }
    } else if (!s.allSigns && this.allDrawnAt !== 0) {
      this.allDrawnAt = 0;
      this.all.clear();
    }
  }

  setHover(id: number): void {
    this.hoverId = id;
  }

  private drawHover(s: Snapshot, zoom: number): void {
    this.hover.clear();
    if (!this.hoverId) return;
    const sign = s.signs.find((x) => x.id === this.hoverId);
    if (!sign) return;
    this.hover
      .circle(sign.x * PX, sign.y * PX, 0.65 * G * PX + 3 / zoom)
      .stroke({ width: 2 / zoom, color: COLORS.signHalo, alpha: 0.95 });
  }
}
