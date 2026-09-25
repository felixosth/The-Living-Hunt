import { describe, expect, it } from 'vitest';
import { ANATOMY, type PartId } from '../src/content/anatomy';
import { seedRng } from '../src/core/rng';
import { GAME_SECONDS_PER_REAL_SECOND } from '../src/core/time';
import { animalContext, applyHit } from '../src/sim/animals';
import { getRegionMap } from '../src/sim/region';
import {
  angleName,
  castArrow,
  project,
  projectAnatomy,
  relativeAngle,
  reticleSigma,
} from '../src/sim/shot';
import { SignKind } from '../src/sim/signs';
import type { Animal, BowState, HitZone, WorldState } from '../src/sim/state';
import { step } from '../src/sim/world';
import { CENTRE, lone } from './helpers';

const BROADSIDE = Math.PI / 2;

function centreOf(id: PartId, theta: number): { u: number; v: number } {
  const part = ANATOMY.roe.find((p) => p.id === id);
  if (!part) throw new Error(id);
  const p = project(part, theta);
  return { u: p.u, v: p.v };
}

function zones(theta: number, u: number, v: number, n = 200): Record<string, number> {
  const rng = seedRng(7);
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const z = castArrow('roe', theta, u, v, rng).zone;
    counts[z] = (counts[z] ?? 0) + 1;
  }
  return counts;
}

describe('the side view', () => {
  it('names the angle the animal stands at', () => {
    expect(angleName(BROADSIDE)).toBe('broadside');
    expect(angleName(-BROADSIDE)).toBe('broadside');
    expect(angleName(0)).toBe('facing away');
    expect(angleName(Math.PI)).toBe('facing you');
    expect(angleName(Math.PI / 4)).toBe('quartering away');
    expect(angleName((3 * Math.PI) / 4)).toBe('quartering towards');
  });

  it('measures the angle between heading and line of fire', () => {
    // Shooter to the west, deer heading north: broadside.
    expect(Math.abs(relativeAngle(-Math.PI / 2, 0, 0, 10, 0))).toBeCloseTo(BROADSIDE);
    // Deer walking straight away from the shooter.
    expect(relativeAngle(0, 0, 0, 10, 0)).toBeCloseTo(0);
  });

  it('shows the whole length broadside and a narrow front head-on', () => {
    const body = ANATOMY.roe[0];
    if (!body) throw new Error('no body');
    expect(project(body, BROADSIDE).ru).toBeCloseTo(0.5);
    expect(project(body, Math.PI).ru).toBeCloseTo(0.18);
    const head = projectAnatomy('roe', BROADSIDE).find((p) => p.id === 'head');
    expect(head?.u).toBeGreaterThan(0.5);
  });
});

describe('where the arrow goes', () => {
  it('broadside: the organ you aim at is the organ you hit', () => {
    for (const [organ, zone] of [
      ['lungs', 'lungs'],
      ['heart', 'heart'],
      ['liver', 'liver'],
      ['gut', 'gut'],
    ] as [PartId, HitZone][]) {
      const { u, v } = centreOf(organ, BROADSIDE);
      const counts = zones(BROADSIDE, u, v);
      expect(counts[zone]).toBe(200);
    }
  });

  it('gut shots taint the meat', () => {
    const { u, v } = centreOf('gut', BROADSIDE);
    expect(castArrow('roe', BROADSIDE, u, v, seedRng(1)).tainted).toBe(true);
  });

  it('misses over the back and under the belly', () => {
    expect(zones(BROADSIDE, 0, 1.2).miss).toBe(200);
    expect(zones(BROADSIDE, -0.1, 0.25).miss).toBe(200);
  });

  it('quartering towards, the shoulder often stops the arrow', () => {
    const theta = (3 * Math.PI) / 4;
    const { u, v } = centreOf('lungs', theta);
    const counts = zones(theta, u, v);
    expect(counts.bone ?? 0).toBeGreaterThan(50);
  });

  it('the reticle settles, and grows with distance and a moving target', () => {
    const bow: BowState = {
      target: 1,
      drawnAt: 0,
      aimU: 0,
      aimV: 0.5,
      breathAt: 0,
      breathOutAt: 0,
    };
    expect(reticleSigma(bow, 30, 20, false, 0)).toBeLessThan(reticleSigma(bow, 0, 20, false, 0));
    expect(reticleSigma(bow, 30, 40, false, 0)).toBeGreaterThan(
      reticleSigma(bow, 30, 20, false, 0),
    );
    expect(reticleSigma(bow, 30, 20, false, 9)).toBeGreaterThan(
      reticleSigma(bow, 30, 20, false, 0),
    );
    const held = { ...bow, breathAt: 25 };
    expect(reticleSigma(held, 30, 20, false, 0)).toBeLessThan(reticleSigma(bow, 30, 20, false, 0));
  });

  it('the bow keeps real-time timings: settling, a held breath and tiring arms', () => {
    const sec = GAME_SECONDS_PER_REAL_SECOND;
    const bow: BowState = {
      target: 1,
      drawnAt: 0,
      aimU: 0,
      aimV: 0.5,
      breathAt: 0,
      breathOutAt: 0,
    };
    const sigma = (b: BowState, realS: number) => reticleSigma(b, realS * sec, 20, false, 0);
    // Settled within about three seconds, and steady for ten.
    expect(sigma(bow, 3)).toBeLessThan(0.5 * sigma(bow, 0));
    expect(sigma(bow, 10)).toBeLessThanOrEqual(sigma(bow, 3));
    // Tired arms after twelve seconds.
    expect(sigma(bow, 20)).toBeGreaterThan(sigma(bow, 10));
    // A breath taken at 3 s steadies you until 8 s, then you shake.
    const held = { ...bow, breathAt: 3 * sec };
    expect(sigma(held, 7.5)).toBeLessThan(sigma(bow, 7.5));
    expect(sigma(held, 10)).toBeGreaterThan(sigma(bow, 10));
  });
});

/** A deer standing broadside 10 m east of a crouched hunter, the wind in the hunter's face. */
function setUp(): { world: WorldState; a: Animal } {
  const { world, a } = lone('roe');
  world.weather = { windFromDeg: 90, windSpeed: 2 };
  Object.assign(world.player, { x: CENTRE.x - 10, y: CENTRE.y, moveX: 0, moveY: 0, gait: 'sneak' });
  Object.assign(a, {
    x: CENTRE.x,
    y: CENTRE.y,
    heading: -Math.PI / 2,
    // Standing still at a drink.
    activity: 'drinking',
    until: world.time + 3 * 3600,
    speed: 0,
    spotX: CENTRE.x,
    spotY: CENTRE.y,
    seen: true,
  });
  return { world, a };
}

function shoot(world: WorldState, a: Animal, organ: PartId): void {
  step(world, [{ type: 'draw', target: a.id }], 6);
  expect(world.player.bow).not.toBeNull();
  // Settle for three real seconds, then aim where that organ is from here.
  for (let t = 0; t < 3 * GAME_SECONDS_PER_REAL_SECOND; t += 6) step(world, [], 6);
  const theta = relativeAngle(a.heading, world.player.x, world.player.y, a.x, a.y);
  const { u, v } = centreOf(organ, theta);
  step(
    world,
    [
      { type: 'aim', u, v },
      { type: 'breath', hold: true },
    ],
    6,
  );
  step(world, [{ type: 'release' }], 6);
}

function runUntilDead(world: WorldState, a: Animal, steps: number): void {
  for (let i = 0; i < steps && a.activity !== 'dead'; i++) step(world, [], 60);
}

describe('a hunt, start to finish', () => {
  it('a lung-shot deer runs, bleeds and dies within 250 m', () => {
    const { world, a } = setUp();
    shoot(world, a, 'lungs');
    expect(a.wound?.zone).toBe('lungs');
    expect(world.player.arrows).toBe(11);
    const hitX = a.x;
    const hitY = a.y;
    runUntilDead(world, a, 60);
    expect(a.activity).toBe('dead');
    expect(Math.hypot(a.x - hitX, a.y - hitY)).toBeLessThan(260);
    // A blood trail leads there.
    let blood = 0;
    for (let i = 0; i < world.signs.count; i++) {
      if (world.signs.kind[i] === SignKind.Blood && world.signs.animal[i] === a.id) blood++;
    }
    expect(blood).toBeGreaterThan(20);
  });

  it('a liver-shot deer lies up and dies if it is left alone', () => {
    const { world, a } = setUp();
    // The liver is a hand's width from the lungs, so wound it directly rather than by a shot.
    applyHit(
      a,
      animalContext(world, getRegionMap(world.seed, world.regionId), []),
      'liver',
      false,
      true,
      world.player.x,
      world.player.y,
    );
    expect(a.wound?.zone).toBe('liver');
    for (let i = 0; i < 20; i++) step(world, [], 60);
    expect(a.activity).toBe('bedded');
    // Walk away and wait.
    world.player.x = 5;
    world.player.y = 5;
    runUntilDead(world, a, 5 * 60);
    expect(a.activity).toBe('dead');
  });

  it('dress it, carry it home and get a summary', () => {
    const { world, a } = setUp();
    shoot(world, a, 'heart');
    runUntilDead(world, a, 30);
    expect(a.activity).toBe('dead');
    // Walk to it.
    world.player.x = a.x + 1;
    world.player.y = a.y;
    step(world, [], 6);
    step(world, [{ type: 'interact' }], 6);
    expect(world.player.busy).toBe('dress');
    const events = [];
    for (let i = 0; i < 20; i++) events.push(...step(world, [], 60));
    expect(events.some((e) => e.type === 'dressed')).toBe(true);
    expect(a.carcass?.weightKg).toBeCloseTo(a.weightKg * 0.75, 0);
    step(world, [{ type: 'interact' }], 6);
    expect(world.player.carrying).toBe(a.id);
    expect(world.player.load).toBeGreaterThan(10);
    // Home to the cabin door.
    world.player.x = 5;
    world.player.y = 5;
    const home = step(world, [{ type: 'interact' }], 6);
    const delivered = home.find((e) => e.type === 'delivered');
    expect(delivered?.type === 'delivered' && delivered.summary.zone).toBe('heart');
    expect(delivered?.type === 'delivered' && delivered.summary.meat).toBe('good');
    expect(world.player.trophies).toHaveLength(1);
    expect(world.animals.some((x) => x.id === a.id)).toBe(false);
    expect(world.player.carrying).toBeNull();
  });

  it('a miss leaves the arrow on the ground to pick up', () => {
    const { world, a } = setUp();
    step(world, [{ type: 'draw', target: a.id }], 6);
    step(world, [{ type: 'aim', u: 0, v: 1.5 }], 6);
    const events = step(world, [{ type: 'release' }], 6);
    expect(events.some((e) => e.type === 'shot' && !e.hit)).toBe(true);
    expect(a.activity).toBe('fleeing');
    let arrow = -1;
    for (let i = 0; i < world.signs.count; i++) {
      if (world.signs.kind[i] === SignKind.Arrow) arrow = i;
    }
    expect(arrow).toBeGreaterThanOrEqual(0);
    world.player.x = world.signs.x[arrow] as number;
    world.player.y = world.signs.y[arrow] as number;
    const before = world.signs.count;
    step(world, [{ type: 'interact' }], 6);
    expect(world.player.arrows).toBe(12);
    // The arrow is gone from the ground, not just faded: nothing left to notice or draw.
    for (let i = 0; i < 5; i++) step(world, [], 6);
    for (let i = 0; i < world.signs.count; i++) {
      expect(world.signs.kind[i]).not.toBe(SignKind.Arrow);
    }
    expect(world.signs.count).toBeLessThan(before + 5);
  });

  it("can't draw on an animal you can't see, or out of range", () => {
    const { world, a } = setUp();
    a.x = CENTRE.x + 60;
    step(world, [{ type: 'draw', target: a.id }], 6);
    expect(world.player.bow).toBeNull();
  });
});
