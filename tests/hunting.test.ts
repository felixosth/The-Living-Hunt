import { describe, expect, it } from 'vitest';
import { ANATOMY, type PartId } from '../src/content/anatomy';
import { nextFloat, seedRng } from '../src/core/rng';
import { GAME_SECONDS_PER_REAL_SECOND } from '../src/core/time';
import { animalContext, applyHit } from '../src/sim/animals';
import type { MissReview, SimEvent } from '../src/sim/events';
import { shotRng } from '../src/sim/hunting';
import { getRegionMap } from '../src/sim/region';
import {
  angleName,
  castArrow,
  jumpTheString,
  penetration,
  project,
  projectAnatomy,
  relativeAngle,
  type SwayInput,
  scatter,
  sway,
  swayInput,
  travelDuringFlight,
} from '../src/sim/shot';
import { SignKind } from '../src/sim/signs';
import type { Animal, HitZone, WorldState } from '../src/sim/state';
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

  it('scatter grows with distance and a moving target, and practice tightens it', () => {
    const input: SwayInput = {
      target: 1,
      drawnAt: 0,
      breathAt: 0,
      breathOutAt: 0,
      distance: 20,
      moving: false,
      bowXp: 0,
      targetSpeed: 0,
    };
    const settled = 6 * GAME_SECONDS_PER_REAL_SECOND;
    expect(scatter({ ...input, distance: 40 }, settled)).toBeGreaterThan(scatter(input, settled));
    expect(scatter({ ...input, targetSpeed: 9 }, settled)).toBeGreaterThan(scatter(input, settled));
    expect(scatter({ ...input, bowXp: 5 }, settled)).toBeCloseTo(0.8 * scatter(input, settled));
  });

  it('the scatter shows how ready you are: settling, breath, shaking and tired arms', () => {
    const sec = GAME_SECONDS_PER_REAL_SECOND;
    const input: SwayInput = {
      target: 1,
      drawnAt: 0,
      breathAt: 0,
      breathOutAt: 0,
      distance: 20,
      moving: false,
      bowXp: 0,
      targetSpeed: 0,
    };
    const at = (i: SwayInput, realS: number) => scatter(i, realS * sec);
    // About twice as wide on the draw, settled within a few seconds.
    expect(at(input, 0)).toBeCloseTo(2 * at(input, 10), 1);
    expect(at(input, 3)).toBeLessThan(1.15 * at(input, 10));
    // Tighter with a held breath, wider when shaking, and wider as the arms tire.
    const held = { ...input, breathAt: 4 * sec };
    expect(at(held, 6)).toBeLessThan(at(input, 6));
    expect(at(held, 11)).toBeGreaterThan(at(input, 11));
    expect(at(input, 20)).toBeGreaterThan(at(input, 10));
  });

  it('the aim drifts in real time: settling, a held breath, shaking and tiring arms', () => {
    const sec = GAME_SECONDS_PER_REAL_SECOND;
    const input: SwayInput = {
      target: 1,
      drawnAt: 0,
      breathAt: 0,
      breathOutAt: 0,
      distance: 20,
      moving: false,
      bowXp: 0,
      targetSpeed: 0,
    };
    const wobble = (i: SwayInput, realS: number) => {
      const s = sway(i, realS * sec);
      return s.drift + s.tremor;
    };
    // Settled within about three seconds, and steady for ten.
    expect(wobble(input, 3)).toBeLessThan(0.5 * wobble(input, 0));
    expect(wobble(input, 10)).toBeLessThanOrEqual(wobble(input, 3));
    // Tired arms after twelve seconds, with a tremor.
    expect(wobble(input, 20)).toBeGreaterThan(wobble(input, 10));
    expect(sway(input, 20 * sec).tremor).toBeGreaterThan(0);
    // A breath taken at 3 s steadies you until 8 s, then you shake.
    const held = { ...input, breathAt: 3 * sec };
    expect(wobble(held, 7.5)).toBeLessThan(0.6 * wobble(input, 7.5));
    expect(sway(held, 7.5 * sec).tremor).toBe(0);
    expect(sway(held, 10 * sec).tremor).toBeGreaterThan(0);
    expect(wobble(held, 10)).toBeGreaterThan(wobble(input, 10));
  });

  it('the drift moves smoothly, stays within its size, and practice calms it', () => {
    const sec = GAME_SECONDS_PER_REAL_SECOND;
    const input: SwayInput = {
      target: 3,
      drawnAt: 1000,
      breathAt: 0,
      breathOutAt: 0,
      distance: 30,
      moving: false,
      bowXp: 0,
      targetSpeed: 0,
    };
    let prev = sway(input, 1000 + 5 * sec);
    for (let t = 5; t < 11; t += 0.1) {
      const s = sway(input, 1000 + t * sec);
      expect(Math.abs(s.u)).toBeLessThanOrEqual(1.05 * s.drift + s.tremor);
      expect(Math.abs(s.v)).toBeLessThanOrEqual(1.0 * s.drift + s.tremor);
      // No jumps: a tenth of a second moves it by well under its size.
      expect(Math.hypot(s.u - prev.u, s.v - prev.v)).toBeLessThan(0.5 * s.drift);
      prev = s;
    }
    const practised = sway({ ...input, bowXp: 5 }, 1000 + 6 * sec);
    expect(practised.drift).toBeCloseTo(0.8 * sway(input, 1000 + 6 * sec).drift);
  });

  it('an animal on edge jumps the string at range, never when unaware or close', () => {
    const jumps = (awareness: number, distance: number) => {
      const rng = seedRng(11);
      let moved = 0;
      for (let i = 0; i < 200; i++) {
        const j = jumpTheString('roe', BROADSIDE, distance, awareness, rng);
        if (Math.hypot(j.du, j.dv) > 0.05) moved++;
      }
      return moved;
    };
    expect(jumps(0.1, 40)).toBe(0);
    expect(jumps(0.9, 6)).toBe(0);
    expect(jumps(0.9, 30)).toBeGreaterThan(150);
    expect(jumps(0.9, 30)).toBeGreaterThan(jumps(0.4, 30));
    // It drops and lurches forward: relative to the body, the arrow strikes high and back.
    const j = jumpTheString('roe', BROADSIDE, 35, 1, seedRng(2));
    expect(j.dv).toBeGreaterThan(0.1);
    expect(j.du).toBeLessThan(-0.1);
  });

  it('arrows go less deep at long range, so more of them stay in the body', () => {
    expect(penetration('roe', 50)).toBeLessThan(penetration('roe', 10));
    // Slightly quartering away: a long path through the body, past the far shoulder.
    const theta = Math.PI / 3;
    const { u, v } = centreOf('lungs', theta);
    const stopped = (distance: number) => {
      const rng = seedRng(5);
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const r = castArrow('roe', theta, u, v, rng, false, distance);
        if (!r.passThrough) n++;
      }
      return n;
    };
    expect(stopped(45)).toBeGreaterThan(stopped(5));
  });

  it('a moving animal carries on while the arrow flies, so the arrow strikes behind', () => {
    expect(travelDuringFlight(0, 20, BROADSIDE)).toBeCloseTo(0);
    // Walking at 4 m a (game) minute, 20 m away: a third of a second of flight, 1.3 m on.
    expect(travelDuringFlight(4, 20, BROADSIDE)).toBeCloseTo(-4 * (20 / 60));
    expect(Math.abs(travelDuringFlight(4, 40, BROADSIDE))).toBeGreaterThan(
      Math.abs(travelDuringFlight(4, 20, BROADSIDE)),
    );
    // Walking straight away, it moves along the arrow's line: no shift on the side view.
    expect(travelDuringFlight(4, 20, 0)).toBeCloseTo(0);
  });

  it('shoot at the lungs of a walking deer and you hit behind them; lead it and you hit them', () => {
    const behind = setUp();
    shoot(behind.world, behind.a, 'lungs', { walking: 4 });
    expect(behind.a.wound?.zone ?? 'miss').not.toBe('lungs');
    const led = setUp();
    shoot(led.world, led.a, 'lungs', { walking: 4, lead: true });
    expect(led.a.wound?.zone).toBe('lungs');
  });

  it('a soft bleat stops a walking deer, head up and body still; again, and it grows wary', () => {
    const { world, a } = setUp();
    Object.assign(a, { activity: 'travelling', goal: -1, awareness: 0 });
    const heading = a.heading;
    step(world, [{ type: 'bleat' }], 6);
    expect(a.lookUntil).toBeGreaterThan(world.time);
    for (let i = 0; i < 10; i++) step(world, [], 6);
    expect(a.speed).toBe(0);
    expect(a.heading).toBeCloseTo(heading);
    expect(a.awareness).toBeGreaterThanOrEqual(0.3);
    expect(a.activity).not.toBe('fleeing');
    const before = a.awareness;
    const events = step(world, [{ type: 'bleat' }], 6);
    expect(events.some((e) => e.type === 'bleated' && e.warier === 1)).toBe(true);
    expect(a.awareness).toBeGreaterThan(before);
  });

  it('a bleat carries only so far, and hares pay it no mind', () => {
    const { world, a } = setUp();
    a.x = world.player.x + 150;
    step(world, [{ type: 'bleat' }], 6);
    expect(a.lookUntil).toBe(0);
    const hare = lone('hare');
    Object.assign(hare.world.player, { x: hare.a.x - 10, y: hare.a.y });
    step(hare.world, [{ type: 'bleat' }], 6);
    expect(hare.a.lookUntil).toBe(0);
  });

  it('a missed arrow says why: it walked on, or the crosshair was off it', () => {
    // Aimed at its haunch as it walks briskly: the arrow passes behind it.
    const walked = setUp();
    const behind = missOf(
      shoot(walked.world, walked.a, 'ham', { walking: 8, at: { u: -0.35, v: 0.52 } }),
    );
    expect(behind?.cause).toBe('walked');
    // Aimed well past its nose at a standing deer: simply wide.
    const wide = setUp();
    expect(missOf(shoot(wide.world, wide.a, 'lungs', { at: { u: 1.3, v: 0.9 } }))?.cause).toBe(
      'crosshair',
    );
    // A hit carries no review: the blood has to tell you.
    const hit = setUp();
    expect(missOf(shoot(hit.world, hit.a, 'lungs'))).toBeNull();
  });

  it('a deer on edge that drops at the twang is named as the reason for the miss', () => {
    const causes: string[] = [];
    for (let i = 0; i < 12; i++) {
      const { world, a } = setUp();
      world.rng.combat = seedRng(100 + i);
      // Alarmed as you let go, 35 m off, and aimed along the top of its back.
      world.player.x = a.x - 35;
      const miss = missOf(shoot(world, a, 'lungs', { at: { u: 0, v: 0.72 }, edge: 0.9 }));
      if (miss) causes.push(miss.cause);
    }
    expect(causes).toContain('jumped');
  });

  it('the luck of a shot depends on the moment you loose it, not just the seed', () => {
    const { world } = setUp();
    const roll = (dt: number, lead: number) => {
      const w = structuredClone(world);
      w.time += dt;
      return nextFloat(shotRng(w, lead));
    };
    // The same moment rolls the same (replays and saves stay exact)...
    expect(roll(0, 0)).toBe(roll(0, 0));
    // ...but a moment later, or later in the tick, rolls differently.
    const rolls = new Set([roll(0, 0), roll(6, 0), roll(12, 0), roll(0, 0.05), roll(0, 0.1)]);
    expect(rolls.size).toBe(5);
  });

  it('every shot is practice for the bow arm', () => {
    const { world, a } = setUp();
    const before = world.player.knowledge.hands.bow;
    shoot(world, a, 'lungs');
    expect(world.player.knowledge.hands.bow).toBeGreaterThan(before);
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

/**
 * Draw, settle, hold your breath and release at an organ. With `walking`, the
 * deer is moving at that speed (metres per game minute) as you release, and
 * with `lead` you aim ahead of the organ to allow for it.
 */
function shoot(
  world: WorldState,
  a: Animal,
  organ: PartId,
  {
    walking = 0,
    lead = false,
    at,
    edge,
  }: { walking?: number; lead?: boolean; at?: { u: number; v: number }; edge?: number } = {},
): SimEvent[] {
  step(world, [{ type: 'draw', target: a.id }], 6);
  expect(world.player.bow).not.toBeNull();
  // Settle for three real seconds, hold your breath and let it calm you.
  for (let t = 0; t < 3 * GAME_SECONDS_PER_REAL_SECOND; t += 6) step(world, [], 6);
  step(world, [{ type: 'breath', hold: true }], 6);
  for (let i = 0; i < 6; i++) step(world, [], 6);
  // Aim at the organ, allowing for where the drift has the bow right now.
  const bow = world.player.bow;
  if (!bow) throw new Error('bow let down');
  const p = world.player;
  const d = Math.hypot(a.x - p.x, a.y - p.y);
  const drift = sway(swayInput(bow, d, false, p.knowledge.hands.bow), world.time);
  const theta = relativeAngle(a.heading, p.x, p.y, a.x, a.y);
  const { u, v } = at ?? clearOfShoulder(organ, theta);
  a.speed = walking;
  if (edge !== undefined) a.awareness = edge;
  const ahead = lead ? travelDuringFlight(walking, d, theta) : 0;
  return step(
    world,
    [{ type: 'aim', u: u - drift.u - ahead, v: v - drift.v }, { type: 'release' }],
    6,
  );
}

/**
 * Where a careful hunter aims for an organ: its centre, except the heart and
 * lungs, whose centres sit at the edge of the shoulder blade on a broadside
 * deer. Those are aimed a little behind and below it.
 */
function clearOfShoulder(organ: PartId, theta: number): { u: number; v: number } {
  const body: Partial<Record<PartId, [number, number]>> = {
    lungs: [0.12, 0.56],
    heart: [0.25, 0.45],
  };
  const at = body[organ];
  if (!at) return centreOf(organ, theta);
  return { u: at[0] * Math.sin(theta), v: at[1] };
}

function missOf(events: SimEvent[]): MissReview | null {
  const shot = events.find((e) => e.type === 'shot');
  return shot?.type === 'shot' ? shot.miss : null;
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
