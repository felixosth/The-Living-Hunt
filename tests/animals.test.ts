import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENARIO, type Scenario } from '../src/content/scenarios';
import { Terrain } from '../src/content/terrain';
import { fromCalendar } from '../src/core/time';
import { ALARMED, dayPart, SUSPICIOUS } from '../src/sim/animals';
import { playerCanSee, sightlineObstruction } from '../src/sim/perception';
import { getRegionMap, isWalkable, registerRegion } from '../src/sim/region';
import type { Animal, WorldState } from '../src/sim/state';
import { createWorld, step } from '../src/sim/world';
import { runHeadless } from '../tools/sim-runner/headless';
import { synthMap } from './helpers';

/** A 256 × 256 m open meadow with no animals of its own. */
registerRegion('meadow', () => synthMap(128, 128, () => Terrain.Grass));
const MEADOW: Scenario = { ...DEFAULT_SCENARIO, id: 'meadow', regionId: 'meadow' };
const CENTRE = { x: 128, y: 128 };

/** A meadow world holding one animal of `species` borrowed from a real forest. */
function lone(species: Animal['species']): { world: WorldState; a: Animal } {
  const world = createWorld(3, MEADOW);
  const forest = createWorld(3);
  const a = forest.animals.find((x) => x.species === species) as Animal;
  Object.assign(a, {
    groupId: a.id,
    awareness: 0,
    wariness: 0,
    goal: -1,
    home: { rest: [], feed: [], water: [] },
  });
  world.animals = [a];
  return { world, a };
}

describe('daily routines', () => {
  const run = runHeadless({ seed: 2, days: 4 });

  it('roe deer bed down by day and feed at dawn, dusk and night', () => {
    const roe = run.activity.roe ?? {};
    const share = (part: 'dawn' | 'day' | 'dusk' | 'night', act: Animal['activity']) => {
      const counts = roe[part] ?? {};
      const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
      return (counts[act] ?? 0) / Math.max(1, total);
    };
    expect(share('day', 'bedded')).toBeGreaterThan(0.5);
    expect(share('dawn', 'feeding')).toBeGreaterThan(0.4);
    expect(share('night', 'feeding')).toBeGreaterThan(0.4);
    expect((roe.night?.drinking ?? 0) + (roe.dusk?.drinking ?? 0)).toBeGreaterThan(0);
  });

  it('hares rest in their forms by day and feed at night', () => {
    const hare = run.activity.hare ?? {};
    expect(hare.day?.bedded ?? 0).toBeGreaterThan((hare.day?.feeding ?? 0) * 5);
    expect(hare.night?.feeding ?? 0).toBeGreaterThan((hare.night?.bedded ?? 0) * 3);
  });

  it('keeps every animal on walkable ground', () => {
    const map = getRegionMap(run.state.seed, run.state.regionId);
    for (const a of run.state.animals) expect(isWalkable(map, a.x, a.y)).toBe(true);
  });

  it('splits the day into parts around sunrise and sunset', () => {
    expect(dayPart(fromCalendar({ year: 1, season: 'Autumn', day: 8, hour: 13 }))).toBe('day');
    expect(dayPart(fromCalendar({ year: 1, season: 'Autumn', day: 8, hour: 1 }))).toBe('night');
  });
});

describe('senses', () => {
  it('a deer downwind smells you and runs', () => {
    const { world, a } = lone('roe');
    const spot = CENTRE;
    // Wind from the west carries scent east, onto the deer.
    world.weather = { windFromDeg: 270, windSpeed: 3 };
    Object.assign(world.player, { x: spot.x - 40, y: spot.y, moveX: 0, moveY: 0, gait: 'sneak' });
    Object.assign(a, { x: spot.x + 20, y: spot.y, activity: 'feeding', heading: 0 });
    const events = [...step(world, [], 6), ...step(world, [], 6), ...step(world, [], 6)];
    expect(a.activity).toBe('fleeing');
    expect(events.some((e) => e.type === 'sound' && e.kind === 'bark')).toBe(true);
    // It runs away from you.
    for (let i = 0; i < 10; i++) step(world, [], 6);
    expect(a.x).toBeGreaterThan(spot.x + 30);
  });

  it('a deer upwind of a still, crouched hunter never knows', () => {
    const { world, a } = lone('roe');
    const spot = CENTRE;
    world.weather = { windFromDeg: 90, windSpeed: 3 }; // scent drifts west, away from the deer
    Object.assign(world.player, { x: spot.x - 30, y: spot.y, moveX: 0, moveY: 0, gait: 'sneak' });
    Object.assign(a, {
      x: spot.x + 20,
      y: spot.y,
      activity: 'feeding',
      until: world.time + 3600,
      heading: Math.PI / 2,
    });
    for (let i = 0; i < 50; i++) step(world, [], 6);
    expect(a.awareness).toBeLessThan(SUSPICIOUS);
    expect(a.activity).not.toBe('fleeing');
  });

  it('a deer notices you running at it across a meadow', () => {
    const { world, a } = lone('roe');
    const spot = CENTRE;
    world.weather = { windFromDeg: 90, windSpeed: 1 };
    Object.assign(world.player, { x: spot.x - 45, y: spot.y, gait: 'run' });
    Object.assign(a, { x: spot.x + 15, y: spot.y, activity: 'bedded', until: world.time + 7200 });
    let peak = 0;
    for (let i = 0; i < 20 && a.activity !== 'fleeing'; i++) {
      step(world, [{ type: 'move', x: 1, y: 0, gait: 'run' }], 6);
      peak = Math.max(peak, a.awareness);
    }
    expect(peak).toBeGreaterThanOrEqual(ALARMED);
  });

  it('a hare sits tight, then bursts from its form when you come close', () => {
    const { world, a } = lone('hare');
    const spot = CENTRE;
    world.weather = { windFromDeg: 90, windSpeed: 2 };
    Object.assign(world.player, { x: spot.x - 30, y: spot.y, gait: 'walk' });
    Object.assign(a, { x: spot.x, y: spot.y, activity: 'bedded', until: world.time + 7200 });
    const flushedAt: number[] = [];
    for (let i = 0; i < 70 && a.activity !== 'fleeing'; i++) {
      const events = step(world, [{ type: 'move', x: 1, y: 0, gait: 'walk' }], 6);
      if (events.some((e) => e.type === 'sound' && e.kind === 'flush')) {
        flushedAt.push(Math.hypot(world.player.x - a.x, world.player.y - a.y));
      }
    }
    expect(a.activity).toBe('fleeing');
    expect(flushedAt[0]).toBeLessThan(25);
  });

  it('a herd runs together', () => {
    const world = createWorld(3);
    const herdLeader = world.animals.find(
      (a) => a.species === 'roe' && world.animals.some((b) => b.groupId === a.id && b !== a),
    ) as Animal;
    const herd = world.animals.filter((b) => b.groupId === herdLeader.groupId);
    world.weather = { windFromDeg: 0, windSpeed: 4 };
    // Stand just upwind (north) of the leader so the scent pours over the herd.
    Object.assign(world.player, { x: herdLeader.x, y: herdLeader.y - 25, moveX: 0, moveY: 0 });
    for (let i = 0; i < 4; i++) step(world, [], 6);
    for (const member of herd) expect(member.activity).toBe('fleeing');
  });
});

describe('what the player can see', () => {
  it('thickets block the view, open meadow does not', () => {
    const map = synthMap(60, 20, (tx) => (tx >= 20 && tx < 40 ? Terrain.Thicket : Terrain.Grass));
    expect(sightlineObstruction(map, 2, 10, 38, 10)).toBeLessThan(0.1);
    expect(sightlineObstruction(map, 2, 10, 110, 10)).toBe(1);
  });

  it('spots a standing deer on a meadow by day, but not a bedded one far off, nor at night', () => {
    const map = synthMap(100, 20, () => Terrain.Grass);
    const world = createWorld(1);
    const a = {
      ...(world.animals[0] as Animal),
      x: 150,
      y: 20,
      activity: 'feeding' as const,
      speed: 1,
    };
    const player = { ...world.player, x: 80, y: 20 };
    expect(playerCanSee(player, a, map, 1, world.time)).toBe(true);
    expect(playerCanSee(player, { ...a, activity: 'bedded', speed: 0 }, map, 1, world.time)).toBe(
      false,
    );
    const newMoonNight = fromCalendar({ year: 1, season: 'Autumn', day: 1 });
    expect(playerCanSee(player, a, map, 0, newMoonNight)).toBe(false);
  });
});
