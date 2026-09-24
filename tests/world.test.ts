import { describe, expect, it } from 'vitest';
import { cloneData } from '../src/core/serialize';
import { fromCalendar, SECONDS_PER_DAY } from '../src/core/time';
import { decodeSave, encodeSave } from '../src/persistence/saveFile';
import type { Command } from '../src/sim/commands';
import { makeSnapshot } from '../src/sim/snapshot';
import type { WorldState } from '../src/sim/state';
import { createWorld, stateHash, step } from '../src/sim/world';
import { runHeadless } from '../tools/sim-runner/headless';

/** A fixed command script: change direction every 50 steps. */
function scripted(state: WorldState, steps: number, from = 0): void {
  const dirs: Command[] = [
    { type: 'move', x: 1, y: 0, gait: 'walk' },
    { type: 'move', x: 0, y: 1, gait: 'run' },
    { type: 'move', x: -1, y: -1, gait: 'sneak' },
    { type: 'move', x: 0, y: 0, gait: 'walk' },
  ];
  for (let i = from; i < from + steps; i++) {
    step(state, i % 50 === 0 ? [dirs[(i / 50) % dirs.length] as Command] : [], 60);
  }
}

describe('world', () => {
  it('starts on Autumn 8 at the region spawn', () => {
    const world = createWorld(3);
    expect(world.time).toBe(fromCalendar({ year: 1, season: 'Autumn', day: 8, hour: 7 }));
    expect(makeSnapshot(world).player.terrain).not.toBeNull();
  });

  it('rejects non-integer or non-positive steps', () => {
    const world = createWorld(1);
    expect(() => step(world, [], 0)).toThrow();
    expect(() => step(world, [], 1.5)).toThrow();
  });

  it('emits hour, day and season events as time passes', () => {
    const result = runHeadless({ seed: 1, days: 30 });
    expect(result.eventCounts.hourStarted).toBe(30 * 24);
    expect(result.eventCounts.dayStarted).toBe(30);
    expect(result.eventCounts.seasonStarted).toBe(1); // Autumn 8 + 30 days crosses into Winter
    expect(result.state.time - result.startTime).toBe(30 * SECONDS_PER_DAY);
  });

  it('handles steps longer than an hour', () => {
    const world = createWorld(1);
    const events = step(world, [], 3 * 3600);
    expect(events.filter((e) => e.type === 'hourStarted')).toHaveLength(3);
  });
});

describe('determinism', () => {
  it('gives identical states for the same seed and commands', () => {
    const a = createWorld(11);
    const b = createWorld(11);
    scripted(a, 2000);
    scripted(b, 2000);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(a).toEqual(b);
  });

  it('gives different worlds for different seeds', () => {
    const a = runHeadless({ seed: 11, days: 5 });
    const b = runHeadless({ seed: 12, days: 5 });
    expect(a.hash).not.toBe(b.hash);
    expect(a.daily.map((d) => d.windFromDeg)).not.toEqual(b.daily.map((d) => d.windFromDeg));
  });

  it('continues identically after a save and load mid-run', async () => {
    const straight = createWorld(21);
    scripted(straight, 3000);

    const interrupted = createWorld(21);
    scripted(interrupted, 1234);
    const restored = await decodeSave(await encodeSave(interrupted));
    scripted(restored, 3000 - 1234, 1234);

    expect(stateHash(restored)).toBe(stateHash(straight));
  });

  it('is unaffected by cloning the state mid-run', () => {
    const a = createWorld(5);
    scripted(a, 500);
    const b = cloneData(a);
    scripted(a, 500, 500);
    scripted(b, 500, 500);
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('headless runs with wandering are reproducible', () => {
    const a = runHeadless({ seed: 8, days: 10, wander: true });
    const b = runHeadless({ seed: 8, days: 10, wander: true });
    expect(a.hash).toBe(b.hash);
    expect(a.state.player).not.toEqual(createWorld(8).player);
  });
});
