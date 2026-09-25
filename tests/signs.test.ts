import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SPECIES_IDS } from '../src/content/species';
import { initialKnowledge, type Knowledge } from '../src/sim/knowledge';
import { blur, readSign } from '../src/sim/reading';
import {
  addSign,
  createSignStore,
  decaySigns,
  findSign,
  SIGN_KIND_NAMES,
  SignFlag,
  SignKind,
  type SignRecord,
  signAt,
} from '../src/sim/signs';
import type { WorldState } from '../src/sim/state';
import { createWorld, step } from '../src/sim/world';

function kindCounts(world: WorldState): Record<string, number> {
  const counts: Record<string, number> = {};
  for (let i = 0; i < world.signs.count; i++) {
    const k = SIGN_KIND_NAMES[world.signs.kind[i] as number] as string;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

describe('sign store', () => {
  it('grows, finds and prunes signs', () => {
    const store = createSignStore(4);
    const ids: number[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(
        addSign(store, {
          kind: SignKind.Print,
          species: 'roe',
          animal: 1,
          x: i,
          y: 0,
          t: 0,
          weight: 20,
          integrity: 1,
          lifetimeH: i < 5 ? 2 : 100,
        }),
      );
    }
    expect(store.count).toBe(10);
    expect(signAt(store, findSign(store, ids[7] as number)).x).toBe(7);
    decaySigns(store, 3);
    expect(store.count).toBe(5);
    expect(findSign(store, ids[0] as number)).toBe(-1);
    expect(signAt(store, findSign(store, ids[9] as number)).integrity).toBeCloseTo(0.97, 5);
  });

  it('the forest is full of signs when you arrive', () => {
    const counts = kindCounts(createWorld(1));
    expect(counts.print ?? 0).toBeGreaterThan(500);
    expect(counts.pellets ?? 0).toBeGreaterThan(20);
    expect(counts.bed ?? 0).toBeGreaterThan(5);
    expect(counts.browse ?? 0).toBeGreaterThan(5);
  });

  it('prints record the truth about their maker', () => {
    const world = createWorld(1);
    const { signs } = world;
    for (let i = 0; i < signs.count; i++) {
      const sign = signAt(signs, i);
      const maker = world.animals.find((a) => a.id === sign.animal);
      expect(maker).toBeDefined();
      expect(sign.species).toBe(maker?.species);
      expect(sign.weight).toBeCloseTo(maker?.weightKg ?? 0, 3);
    }
  });
});

describe('readings', () => {
  const sign = fc.record({
    kind: fc.constantFrom(SignKind.Print, SignKind.Pellets, SignKind.Bed, SignKind.Browse),
    species: fc.constantFrom(...SPECIES_IDS),
    weight: fc.double({ min: 1.5, max: 32, noNaN: true }),
    ageS: fc.integer({ min: 0, max: 5 * 86_400 }),
    heading: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
    id: fc.integer({ min: 1, max: 1e6 }),
    detail: fc.integer({ min: 0, max: 120 }),
  });
  const xp = fc.double({ min: 0, max: 4.99, noNaN: true });

  it('ranges always contain the truth, at any knowledge', () => {
    fc.assert(
      fc.property(sign, xp, xp, (s, speciesXp, signXp) => {
        const now = 1_000_000;
        const record: SignRecord = {
          id: s.id,
          kind: s.kind,
          kindName: SIGN_KIND_NAMES[s.kind],
          species: s.species,
          animal: 1,
          x: 0,
          y: 0,
          t: now - s.ageS,
          heading: s.heading,
          detail: s.detail,
          weight: s.weight,
          integrity: 1,
          flags: 0,
        };
        const k: Knowledge = initialKnowledge();
        k.species[s.species] = speciesXp;
        k.signs[record.kindName] = signXp;
        const r = readSign(record, k, now);
        const ageH = s.ageS / 3600;
        if (r.ageH) {
          expect(r.ageH.lo).toBeLessThanOrEqual(ageH + 1e-9);
          expect(r.ageH.hi).toBeGreaterThanOrEqual(ageH - 1e-9);
        }
        if (r.weightKg) {
          expect(r.weightKg.lo).toBeLessThanOrEqual(s.weight + 1e-9);
          expect(r.weightKg.hi).toBeGreaterThanOrEqual(s.weight - 1e-9);
        }
        if (r.species !== null) expect(r.species).toBe(s.species);
        // The same sign at the same knowledge reads the same.
        expect(readSign(record, k, now)).toEqual(r);
      }),
      { numRuns: 400 },
    );
  });

  it('reads one animal consistently from sign to sign', () => {
    const k = initialKnowledge();
    const print = (id: number, animal: number, ageS: number): SignRecord => ({
      id,
      kind: SignKind.Print,
      kindName: 'print',
      species: 'roe',
      animal,
      x: 0,
      y: 0,
      t: 10_000 - ageS,
      heading: 0,
      detail: 0,
      weight: 22,
      integrity: 1,
      flags: 0,
    });
    // Two prints of the same deer from the same moment read the same.
    const a = readSign(print(1, 7, 600), k, 10_000);
    const b = readSign(print(2, 7, 600), k, 10_000);
    expect(b.weightKg).toEqual(a.weightKg);
    expect(b.ageH).toEqual(a.ageH);
    // Along its trail, older prints never read younger than newer ones.
    let prev = readSign(print(3, 7, 0), k, 10_000).ageH?.lo ?? 0;
    // (Under two hours, where ages are read to the quarter hour.)
    for (let ageS = 300; ageS < 2 * 3600; ageS += 300) {
      const lo = readSign(print(10 + ageS, 7, ageS), k, 10_000).ageH?.lo ?? 0;
      expect(lo).toBeGreaterThanOrEqual(prev);
      prev = lo;
    }
  });

  it('blood tells which way the animal went', () => {
    const k = initialKnowledge();
    const r = readSign(
      {
        id: 5,
        kind: SignKind.Blood,
        kindName: 'blood',
        species: 'roe',
        animal: 3,
        x: 0,
        y: 0,
        t: 0,
        heading: 0,
        detail: 2,
        weight: 22,
        integrity: 1,
        flags: 0,
      },
      k,
      600,
    );
    expect(r.headingDeg).toBe(90);
    expect(r.lines.join(' ')).toContain('east');
  });

  it('gets sharper with knowledge', () => {
    const record: SignRecord = {
      id: 42,
      kind: SignKind.Print,
      kindName: 'print',
      species: 'roe',
      animal: 1,
      x: 0,
      y: 0,
      t: 0,
      heading: 0,
      detail: 0,
      weight: 24,
      integrity: 1,
      flags: 0,
    };
    const now = 6 * 3600;
    const at = (lvl: number) => {
      const k = initialKnowledge();
      k.species.roe = lvl;
      k.signs.print = lvl;
      return readSign(record, k, now);
    };
    expect(at(0).species).toBeNull();
    expect(at(0).ageH).toBeNull();
    const widths = [1, 2, 3, 4].map((l) => {
      const r = at(l).ageH;
      return (r?.hi ?? 0) - (r?.lo ?? 0);
    });
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThanOrEqual(widths[i - 1] as number);
    }
    expect(at(2).headingDeg).toBe(90); // heading 0 rad = east
  });

  it('blur rounds outwards', () => {
    const r = blur(7.3, 0.5, 0.5, 1);
    expect(r.lo).toBeLessThanOrEqual(7.3);
    expect(r.hi).toBeGreaterThanOrEqual(7.3);
    expect(Number.isInteger(r.lo) && Number.isInteger(r.hi)).toBe(true);
  });
});

/** A world where the player stands among the prints of one animal's recent trail. */
function onTrail(seed = 1) {
  const world = createWorld(seed);
  const { signs } = world;
  // The animal with the longest run of prints.
  const byAnimal = new Map<number, number[]>();
  for (let i = 0; i < signs.count; i++) {
    if (signs.kind[i] !== SignKind.Print) continue;
    const list = byAnimal.get(signs.animal[i] as number) ?? [];
    list.push(i);
    byAnimal.set(signs.animal[i] as number, list);
  }
  const [animal, prints] = [...byAnimal].sort((a, b) => b[1].length - a[1].length)[0] as [
    number,
    number[],
  ];
  prints.sort((a, b) => (signs.t[a] as number) - (signs.t[b] as number));
  // Start well before the end of the trail, so there is trail ahead.
  const start = prints[Math.floor(prints.length / 3)] as number;
  world.player.x = signs.x[start] as number;
  world.player.y = signs.y[start] as number;
  return { world, animal, start, prints };
}

describe('scanning, reading and following', () => {
  it('crouching still finds nearby signs, never far ones, and fresh ones first', () => {
    const { world } = onTrail();
    world.player.gait = 'sneak';
    for (let i = 0; i < 10; i++) step(world, [], 6);
    let found = 0;
    const { signs, player } = world;
    let foundClarity = 0;
    let missedClarity = 0;
    let missed = 0;
    for (let i = 0; i < signs.count; i++) {
      const d = Math.hypot((signs.x[i] as number) - player.x, (signs.y[i] as number) - player.y);
      if ((signs.flags[i] as number) & SignFlag.Noticed) {
        found++;
        foundClarity += signs.integrity[i] as number;
        expect(d).toBeLessThanOrEqual(10.01);
      } else if (d < 10) {
        missed++;
        missedClarity += signs.integrity[i] as number;
      }
    }
    expect(found).toBeGreaterThan(0);
    if (missed > 0) expect(foundClarity / found).toBeGreaterThan(missedClarity / missed);
  });

  it('running finds nothing subtle', () => {
    const { world } = onTrail();
    world.signs.flags.fill(0);
    // Faint signs only: nothing obvious to notice in passing.
    for (let i = 0; i < world.signs.count; i++) {
      world.signs.integrity[i] = Math.min(world.signs.integrity[i] as number, 0.5);
    }
    for (let i = 0; i < 10; i++) step(world, [{ type: 'move', x: 1, y: 0, gait: 'run' }], 6);
    let found = 0;
    for (let i = 0; i < world.signs.count; i++) {
      if ((world.signs.flags[i] as number) & SignFlag.Noticed) found++;
    }
    expect(found).toBe(0);
  });

  it('reading a sign up close teaches a little; from afar does nothing', () => {
    const { world, start } = onTrail();
    world.signs.flags[start] = SignFlag.Noticed;
    const id = world.signs.id[start] as number;
    const before = world.player.knowledge.signs.print;
    const far = createWorld(1);
    far.signs.flags[start] = SignFlag.Noticed;
    far.player.x = (far.signs.x[start] as number) + 30;
    far.player.y = far.signs.y[start] as number;
    expect(
      step(far, [{ type: 'inspect', signId: id }], 6).some((e) => e.type === 'inspected'),
    ).toBe(false);
    const events = step(world, [{ type: 'inspect', signId: id }], 6);
    const inspected = events.find((e) => e.type === 'inspected');
    expect(inspected?.type === 'inspected' && inspected.reading.lines.length).toBeGreaterThan(1);
    expect(world.player.knowledge.signs.print).toBeGreaterThan(before);
  });

  it('following reveals the trail ahead as you walk it', () => {
    const { world, start, prints } = onTrail();
    const { signs } = world;
    signs.flags[start] = SignFlag.Noticed;
    step(world, [{ type: 'follow', signId: signs.id[start] as number }], 6);
    expect(world.player.follow?.animal).toBe(signs.animal[start]);
    // Walk the trail by stepping from print to print.
    const ahead = prints.slice(prints.indexOf(start) + 1, prints.indexOf(start) + 40);
    for (const i of ahead) {
      world.player.x = signs.x[i] as number;
      world.player.y = signs.y[i] as number;
      step(world, [], 6);
    }
    let followed = 0;
    for (let i = 0; i < signs.count; i++) {
      if ((signs.flags[i] as number) & SignFlag.Followed) {
        followed++;
        expect(signs.animal[i]).toBe(world.player.follow?.animal);
        expect(signs.t[i] as number).toBeGreaterThanOrEqual(signs.t[start] as number);
      }
    }
    expect(followed).toBeGreaterThan(5);
  });

  it('following picks up signs left in the same moment, in the order they were made', () => {
    const world = createWorld(1);
    const { signs, player } = world;
    const x0 = player.x;
    const y0 = player.y;
    // A blood trail laid in one step: ten drops a metre apart, all at the same time.
    const drops: number[] = [];
    for (let k = 0; k < 10; k++) {
      addSign(signs, {
        kind: SignKind.Blood,
        species: 'roe',
        animal: 999,
        x: x0 + k,
        y: y0,
        t: world.time - 60,
        heading: 0,
        detail: 1,
        weight: 22,
        integrity: 1,
        lifetimeH: 48,
      });
      drops.push(signs.id[signs.count - 1] as number);
    }
    signs.flags[findSign(signs, drops[0] as number)] = SignFlag.Noticed;
    step(world, [{ type: 'follow', signId: drops[0] as number }], 6);
    for (let k = 0; k < 10; k++) {
      player.x = x0 + k;
      for (let n = 0; n < 3; n++) step(world, [], 6);
    }
    // The trail runs all the way to the last drop (before, same-moment drops were skipped).
    expect(player.follow?.lastId).toBe(drops[9]);
    const followed = drops.filter(
      (id) => (signs.flags[findSign(signs, id)] as number) & SignFlag.Followed,
    );
    expect(followed.length).toBeGreaterThan(2);
  });

  it('seeing the animal whose sign you read confirms it', () => {
    const world = createWorld(2);
    const a = world.animals[0];
    if (!a) throw new Error('no animals');
    world.player.read[String(a.id)] = { at: world.time, confirmed: 0 };
    const before = world.player.knowledge.species[a.species];
    world.player.x = a.x + 3;
    world.player.y = a.y;
    const events = step(world, [], 6);
    expect(events.some((e) => e.type === 'confirmed')).toBe(true);
    expect(world.player.knowledge.species[a.species]).toBeGreaterThan(before);
  });
});
