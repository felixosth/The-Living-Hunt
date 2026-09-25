import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { easeWind, WindField } from '../src/render/wind';
import { makeSnapshot, type Snapshot } from '../src/sim/snapshot';
import { createWorld } from '../src/sim/world';

interface GustLike {
  x: number;
  y: number;
  age: number;
  life: number;
  strength: number;
}

describe('the drawn wind', () => {
  it('swings round to a new wind over a few seconds, the short way', () => {
    let w = easeWind(null, 3, 2, 0.016);
    // Across the ±π seam: from 3 rad to −3 rad is a small turn, not nearly a full circle.
    for (let i = 0; i < 60; i++) w = easeWind(w, -3, 8, 0.016);
    expect(w.angle).toBeGreaterThan(3);
    expect(w.speed).toBeGreaterThan(2);
    expect(w.speed).toBeLessThan(4);
    for (let i = 0; i < 2000; i++) w = easeWind(w, -3, 8, 0.016);
    expect(Math.cos(w.angle - -3)).toBeCloseTo(1, 3);
    expect(w.speed).toBeCloseTo(8, 2);
  });

  it('never pops a gust in or out of view, or jumps it, when the wind changes', () => {
    const base = makeSnapshot(createWorld(420));
    const field = new WindField(new Container());
    const view = { x0: 0, y0: 0, x1: 120, y1: 70 };
    let prev = new Map<GustLike, { x: number; y: number; seen: number }>();
    let pops = 0;
    let jumps = 0;
    for (let f = 0; f < 3000; f++) {
      // The weather's wind changes abruptly every few seconds, and the view drifts.
      const hour = Math.floor(f / 300);
      const snap: Snapshot = {
        ...base,
        tick: f,
        wind: { fromDeg: (hour * 70) % 360, speed: 1 + (hour % 4) * 3 },
        scent: { ...base.scent, angle: hour * 1.2 },
      };
      view.x0 += 0.05;
      view.x1 += 0.05;
      field.update(snap, view, 1000 + f * 16);
      const now = new Map<GustLike, { x: number; y: number; seen: number }>();
      for (const g of (field as unknown as { gusts: GustLike[] }).gusts) {
        const inView = g.x > view.x0 && g.x < view.x1 && g.y > view.y0 && g.y < view.y1;
        const seen = inView ? g.strength * Math.sin((Math.PI * g.age) / g.life) : 0;
        const p = prev.get(g);
        if (!p && seen > 0.05) pops++;
        if (p && Math.hypot(g.x - p.x, g.y - p.y) > 2) jumps++;
        now.set(g, { x: g.x, y: g.y, seen });
      }
      for (const [g, p] of prev) if (!now.has(g) && p.seen > 0.05) pops++;
      prev = now;
    }
    expect(pops).toBe(0);
    expect(jumps).toBe(0);
  });
});
