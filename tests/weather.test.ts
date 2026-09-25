import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { hash32 } from '../src/core/hash';
import { seedRng } from '../src/core/rng';
import { serialize } from '../src/core/serialize';
import { fromCalendar, SECONDS_PER_DAY, SECONDS_PER_HOUR, toCalendar } from '../src/core/time';
import { decodeSave, SAVE_FORMAT } from '../src/persistence/saveFile';
import { footingNoise, snowPace, updateGround } from '../src/sim/ground';
import { readSign } from '../src/sim/reading';
import { getRegionMap } from '../src/sim/region';
import {
  addSign,
  createSignStore,
  SignFlag,
  SignKind,
  signAt,
  weatherSigns,
} from '../src/sim/signs';
import { makeSnapshot } from '../src/sim/snapshot';
import type { Animal, GroundState, WeatherHour, WeatherState } from '../src/sim/state';
import { noiseRadiusM } from '../src/sim/stealth';
import {
  advanceWeather,
  almanac,
  climateMean,
  initialWeather,
  precipType,
  soundMasking,
  WEATHER_AHEAD_H,
  weatherSight,
} from '../src/sim/weather';
import { createWorld, stateHash, step } from '../src/sim/world';
import { CENTRE, fair, lone } from './helpers';

const H = SECONDS_PER_HOUR;
const AUTUMN_8 = fromCalendar({ year: 1, season: 'Autumn', day: 8 });

/** Run the weather alone, hour by hour, with the ground under it. */
function weatherRun(seed: number, from: number, days: number) {
  const rng = seedRng(hash32(seed, 'weather-test'));
  const w = initialWeather(rng, from);
  const hours: (WeatherHour & { t: number; snowCm: number })[] = [];
  for (let t = from + H; t <= from + days * SECONDS_PER_DAY; t += H) {
    updateGround(w.ground, w, t);
    advanceWeather(w, t, rng);
    hours.push({ ...w, t, snowCm: w.ground.snowCm });
  }
  return { w, hours };
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe('the weather', () => {
  it('keeps a week ahead, the current hour first', () => {
    const { w } = weatherRun(1, AUTUMN_8, 3);
    expect(w.ahead).toHaveLength(WEATHER_AHEAD_H);
    expect(w.aheadFrom).toBe(AUTUMN_8 + 3 * SECONDS_PER_DAY);
    expect(w.temp).toBe(w.ahead[0]?.temp);
  });

  it('comes out the same from the same seed', () => {
    expect(serialize(weatherRun(7, AUTUMN_8, 10).w)).toBe(serialize(weatherRun(7, AUTUMN_8, 10).w));
    expect(serialize(weatherRun(7, AUTUMN_8, 10).w)).not.toBe(
      serialize(weatherRun(8, AUTUMN_8, 10).w),
    );
  });

  it('turns from mild autumn to a snowy winter', () => {
    expect(climateMean(AUTUMN_8)).toBeGreaterThan(5);
    expect(climateMean(fromCalendar({ year: 1, season: 'Winter', day: 11 }))).toBeLessThan(-7);
    for (const seed of [1, 2, 3, 4]) {
      const { hours } = weatherRun(seed, AUTUMN_8, 40);
      const autumn = hours.filter((h) => toCalendar(h.t).season === 'Autumn');
      const winter = hours.filter((h) => toCalendar(h.t).season === 'Winter');
      expect(mean(autumn.slice(0, 5 * 24).map((h) => h.temp))).toBeGreaterThan(0);
      expect(mean(winter.map((h) => h.temp))).toBeLessThan(-3);
      // By midwinter there is snow on the ground.
      expect(winter.filter((h) => h.snowCm > 5).length / winter.length).toBeGreaterThan(0.7);
      // Days are warmer than nights.
      const at = (hour: number) =>
        mean(autumn.filter((h) => toCalendar(h.t).hour === hour).map((h) => h.temp));
      expect(at(14)).toBeGreaterThan(at(3) + 2);
    }
  });

  it('brings a front with rain or snow every few days', () => {
    for (const seed of [1, 2, 3]) {
      const { hours } = weatherRun(seed, AUTUMN_8, 30);
      const wetDays = new Set(
        hours.filter((h) => h.precip >= 0.5).map((h) => Math.floor(h.t / SECONDS_PER_DAY)),
      );
      expect(wetDays.size).toBeGreaterThan(30 / 6);
      expect(wetDays.size).toBeLessThan(30 * 0.6);
      // Precipitation comes under cloud.
      for (const h of hours) if (h.precip > 0.3) expect(h.cloud).toBeGreaterThan(0.5);
    }
  });

  it('brings fog only in calm, dry air', () => {
    const { hours } = weatherRun(5, AUTUMN_8, 30);
    expect(hours.some((h) => h.fog > 0.3)).toBe(true);
    for (const h of hours.filter((x) => x.fog > 0.3)) {
      expect(h.windSpeed).toBeLessThan(2.5);
      expect(h.precip).toBeLessThanOrEqual(0.1);
    }
  });

  it('gives an almanac that reads the weather to come', () => {
    const w = initialWeather(seedRng(3), AUTUMN_8);
    const now = AUTUMN_8 + 10 * H;
    advanceWeather(w, now, seedRng(4));
    // Dry for two days, except snow all tomorrow.
    for (const [i, h] of w.ahead.entries()) {
      const t = w.aheadFrom + i * H;
      const tomorrow = Math.floor(t / SECONDS_PER_DAY) === Math.floor(now / SECONDS_PER_DAY) + 1;
      Object.assign(h, tomorrow ? { precip: 1.2, temp: -3, cloud: 1 } : { precip: 0, temp: 4 });
    }
    const lines = almanac(w, now);
    expect(lines[0]).toMatch(/^Today: /);
    expect(lines.find((l) => l.startsWith('Tomorrow'))).toMatch(/snow/);
    expect(lines.find((l) => l.startsWith('Today'))).not.toMatch(/snow|rain/);
  });

  it('tells rain, sleet and snow apart by the temperature', () => {
    expect(precipType({ precip: 1, temp: 5 })).toBe('rain');
    expect(precipType({ precip: 1, temp: 1.5 })).toBe('sleet');
    expect(precipType({ precip: 1, temp: -2 })).toBe('snow');
    expect(precipType({ precip: 0, temp: -2 })).toBe('none');
  });
});

function bare(): GroundState {
  return {
    snowCm: 0,
    crust: 0,
    snowWet: 0,
    wet: 0,
    frozen: 0,
    snowStartedAt: 0,
    snowEndedAt: 0,
    washedAt: 0,
  };
}
const hour = (h: Partial<WeatherHour>): WeatherHour => ({
  temp: 5,
  cloud: 0.5,
  precip: 0,
  windFromDeg: 0,
  windSpeed: 2,
  fog: 0,
  ...h,
});

describe('the ground', () => {
  it('gathers snow, which settles and melts in a thaw', () => {
    const g = bare();
    for (let i = 1; i <= 5; i++) updateGround(g, hour({ temp: -3, precip: 1.5 }), i * H);
    expect(g.snowCm).toBeGreaterThan(6);
    expect(g.snowStartedAt).toBe(0);
    expect(g.snowEndedAt).toBe(5 * H);
    const deep = g.snowCm;
    for (let i = 6; i <= 10; i++) updateGround(g, hour({ temp: -3 }), i * H);
    expect(g.snowCm).toBeLessThan(deep);
    expect(g.snowCm).toBeGreaterThan(deep * 0.9);
    for (let i = 11; i <= 40; i++) updateGround(g, hour({ temp: 6 }), i * H);
    expect(g.snowCm).toBe(0);
  });

  it('freezes a thawed surface into a crust, which new snow covers', () => {
    const g = { ...bare(), snowCm: 20 };
    for (let i = 1; i <= 4; i++) updateGround(g, hour({ temp: 2 }), i * H);
    expect(g.crust).toBe(0);
    for (let i = 5; i <= 10; i++) updateGround(g, hour({ temp: -6 }), i * H);
    expect(g.crust).toBeGreaterThan(0.6);
    for (let i = 11; i <= 14; i++) updateGround(g, hour({ temp: -6, precip: 2 }), i * H);
    expect(g.crust).toBeLessThan(0.2);
  });

  it('gets wet in rain and dries after, and washes out your scent', () => {
    const g = bare();
    updateGround(g, hour({ precip: 2 }), H);
    expect(g.wet).toBeGreaterThan(0.3);
    expect(g.washedAt).toBe(H);
    for (let i = 2; i <= 40; i++) updateGround(g, hour({ cloud: 0.1 }), i * H);
    expect(g.wet).toBe(0);
  });

  it('makes crust loud and fresh snow quiet underfoot', () => {
    const map = getRegionMap(3, 'meadow');
    const at = (g: GroundState) => footingNoise(map, g, 50, 50);
    expect(at({ ...bare(), snowCm: 15 })).toBeLessThan(0.7);
    expect(at({ ...bare(), snowCm: 15, crust: 1 })).toBeGreaterThan(1.7);
    expect(at({ ...bare(), frozen: 1 })).toBeGreaterThan(1.3);
    expect(at({ ...bare(), wet: 1 })).toBeLessThan(0.8);
    expect(at(bare())).toBe(1);
  });

  it('holds deer back in deep snow but not hares', () => {
    expect(snowPace('roe', 10, 0)).toBe(1);
    expect(snowPace('roe', 50, 0)).toBeLessThan(0.6);
    expect(snowPace('hare', 50, 0)).toBe(1);
  });
});

describe('the weather and the hunt', () => {
  it('lets rain wear away prints and blood, and snow bury them', () => {
    const store = createSignStore();
    for (const kind of [SignKind.Print, SignKind.Blood, SignKind.Browse]) {
      addSign(store, {
        kind,
        species: 'roe',
        animal: 1,
        x: 0,
        y: 0,
        t: 0,
        weight: 20,
        integrity: 1,
        lifetimeH: 48,
      });
    }
    weatherSigns(store, 2, 0, 0);
    expect(store.integrity[0]).toBeCloseTo(0.84);
    expect(store.integrity[1]).toBeCloseTo(0.5);
    expect(store.integrity[2]).toBe(1);
    weatherSigns(store, 0, 3, 0);
    expect(store.integrity[0]).toBeLessThan(0);
    expect(store.integrity[2]).toBe(1);
  });

  it('masks your footsteps in rain and closes in the view in fog', () => {
    const dry = hour({ windSpeed: 2 });
    const rain = hour({ windSpeed: 2, precip: 2 });
    expect(noiseRadiusM(1, soundMasking(rain))).toBeLessThan(
      noiseRadiusM(1, soundMasking(dry)) * 0.7,
    );
    expect(weatherSight(hour({ fog: 0.9 }))).toBeLessThan(0.45);
    expect(weatherSight(hour({ temp: -3, precip: 2 }))).toBeLessThan(0.6);
    expect(weatherSight(dry)).toBe(1);
  });

  it('takes a crisp print of a deer in fresh snow, dated by the snowfall', () => {
    const { world, a } = lone('roe');
    fair(world, world.weather, { temp: -4 });
    const g = world.weather.ground;
    Object.assign(g, {
      snowCm: 12,
      snowStartedAt: world.time - 6 * H,
      snowEndedAt: world.time - 2 * H,
    });
    Object.assign(world.player, { x: CENTRE.x - 100, y: CENTRE.y });
    Object.assign(a, {
      x: CENTRE.x,
      y: CENTRE.y,
      activity: 'travelling',
      heading: 0,
      goal: -1,
    });
    // Walk the deer east for a bit.
    for (let i = 0; i < 20; i++) {
      a.x += 0.5;
      step(world, [], 6);
      a.speed = 4;
    }
    const prints = [];
    for (let i = 0; i < world.signs.count; i++) {
      if (world.signs.kind[i] === SignKind.Print && world.signs.animal[i] === a.id) prints.push(i);
    }
    expect(prints.length).toBeGreaterThan(0);
    const sign = signAt(world.signs, prints[0] as number);
    expect(sign.flags & SignFlag.InSnow).toBeTruthy();
    expect(sign.integrity).toBeGreaterThan(0.95);
    const reading = readSign(sign, world.player.knowledge, world.time, {
      sameAnimalAsBefore: false,
      snow: { startedAt: g.snowStartedAt, endedAt: g.snowEndedAt, falling: false },
    });
    expect(reading.lines.join(' ')).toMatch(/made after the snow stopped, about \d\d:00/);
  });

  it('notices prints in snow from further off', () => {
    const { world } = lone('roe');
    fair(world);
    const near = { x: CENTRE.x + 10, y: CENTRE.y };
    Object.assign(world.player, { x: CENTRE.x, y: CENTRE.y, gait: 'walk', moveX: 0, moveY: 0 });
    const add = (flags: number) =>
      addSign(world.signs, {
        kind: SignKind.Print,
        species: 'roe',
        animal: 99,
        ...near,
        t: world.time,
        weight: 20,
        integrity: 1,
        lifetimeH: 96,
        flags,
      });
    add(0);
    add(SignFlag.InSnow);
    step(world, [], 6);
    expect((world.signs.flags[world.signs.count - 2] as number) & SignFlag.Noticed).toBe(0);
    expect((world.signs.flags[world.signs.count - 1] as number) & SignFlag.Noticed).toBeTruthy();
  });

  it('sends deer to lie up in a downpour', () => {
    const run = (rain: boolean) => {
      const world = createWorld(3);
      fair(world, { windFromDeg: 0, windSpeed: 2 });
      Object.assign(world.player, { x: 20, y: 20 });
      // On to the evening, when deer are up and feeding; then the rain comes, or doesn't.
      for (let i = 0; i < 13 * 60; i++) step(world, [], 60);
      if (rain) fair(world, world.weather, { precip: 3, temp: 6, cloud: 1 });
      for (let i = 0; i < 3 * 60; i++) step(world, [], 60);
      const roe = world.animals.filter((x) => x.species === 'roe');
      return roe.filter((x: Animal) => x.activity === 'bedded').length / roe.length;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 0.2);
  });

  it('bogs a fleeing deer down in deep snow', () => {
    const flight = (snowCm: number) => {
      const { world, a } = lone('roe');
      world.weather.ground.snowCm = snowCm;
      Object.assign(a, { x: CENTRE.x, y: CENTRE.y, activity: 'fleeing', until: world.time + 3600 });
      Object.assign(a, { alarmX: CENTRE.x - 30, alarmY: CENTRE.y, speed: 20, heading: 0 });
      Object.assign(world.player, { x: CENTRE.x - 100, y: CENTRE.y + 100 });
      const x0 = a.x;
      for (let i = 0; i < 10; i++) step(world, [], 6);
      return Math.abs(a.x - x0);
    };
    expect(flight(50)).toBeLessThan(flight(0) * 0.65);
  });

  it('forces weather for testing, and stays deterministic', () => {
    const a = createWorld(5);
    const b = createWorld(5);
    for (const w of [a, b]) {
      step(w, [{ type: 'forceWeather', kind: 'snowCover' }], 6);
      step(w, [{ type: 'forceWeather', kind: 'fog' }], 6);
      for (let i = 0; i < 50; i++) step(w, [], 60);
    }
    expect(a.weather.ground.snowCm).toBeGreaterThan(8);
    expect(makeSnapshot(a).weather.ground).toMatch(/snow/);
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('upgrades a version 8 save with a week of weather', async () => {
    const world = createWorld(6);
    const old = {
      ...world,
      weather: { windFromDeg: 123, windSpeed: 4.5 },
    } as unknown as WeatherState;
    const envelope = { format: SAVE_FORMAT, version: 8, savedAt: '', state: old };
    const text = serialize(envelope);
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const loaded = await decodeSave(new Uint8Array(await new Response(stream).arrayBuffer()));
    expect(loaded.weather.ahead).toHaveLength(WEATHER_AHEAD_H);
    expect(loaded.weather.windFromDeg).toBe(123);
    expect(loaded.weather.ground.snowCm).toBeGreaterThanOrEqual(0);
    step(loaded, [], 3600);
    expect(loaded.weather.ahead).toHaveLength(WEATHER_AHEAD_H);
  });
});
