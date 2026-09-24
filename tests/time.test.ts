import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_YEAR,
  daylight,
  formatClock,
  formatDate,
  fromCalendar,
  lightLevel,
  moonIllumination,
  moonPhase,
  SEASONS,
  SECONDS_PER_DAY,
  toCalendar,
} from '../src/core/time';

describe('calendar', () => {
  it('starts at Year 1, Spring 1, 00:00', () => {
    expect(toCalendar(0)).toMatchObject({ year: 1, season: 'Spring', day: 1, hour: 0, minute: 0 });
    expect(formatDate(0)).toBe('Spring 1, Year 1');
  });

  it('has 84-day years of four 21-day seasons', () => {
    expect(toCalendar(21 * SECONDS_PER_DAY)).toMatchObject({ season: 'Summer', day: 1 });
    expect(toCalendar(83 * SECONDS_PER_DAY)).toMatchObject({ year: 1, season: 'Winter', day: 21 });
    expect(toCalendar(DAYS_PER_YEAR * SECONDS_PER_DAY)).toMatchObject({
      year: 2,
      season: 'Spring',
      day: 1,
    });
  });

  it('round-trips between calendar dates and game time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.constantFrom(...SEASONS),
        fc.integer({ min: 1, max: 21 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (year, season, day, hour, minute) => {
          const t = fromCalendar({ year, season, day, hour, minute });
          expect(toCalendar(t)).toMatchObject({ year, season, day, hour, minute });
        },
      ),
    );
  });

  it('formats clock times and rejects impossible days', () => {
    expect(
      formatClock(fromCalendar({ year: 1, season: 'Autumn', day: 8, hour: 7, minute: 5 })),
    ).toBe('07:05');
    expect(() => fromCalendar({ year: 1, season: 'Winter', day: 22 })).toThrow();
  });
});

describe('sun at 63° N', () => {
  const noon = (season: (typeof SEASONS)[number], day: number) =>
    fromCalendar({ year: 1, season, day, hour: 12 });

  it('gives about 5 hours of daylight at Midwinter and about 20 at Midsummer', () => {
    const winter = daylight(noon('Winter', 11)).hours;
    const summer = daylight(noon('Summer', 11)).hours;
    expect(winter).toBeGreaterThan(4);
    expect(winter).toBeLessThan(5.5);
    expect(summer).toBeGreaterThan(19.5);
    expect(summer).toBeLessThan(21);
  });

  it('gives roughly equal day and night at the equinoxes', () => {
    for (const season of ['Spring', 'Autumn'] as const) {
      expect(daylight(noon(season, 11)).hours).toBeGreaterThan(11.8);
      expect(daylight(noon(season, 11)).hours).toBeLessThan(12.8);
    }
  });

  it('places sunrise and sunset symmetrically around noon', () => {
    const { sunrise, sunset } = daylight(noon('Autumn', 8));
    expect(sunrise).not.toBeNull();
    expect((sunrise as number) + (sunset as number)).toBeCloseTo(2 * 12 * 3600, -1);
  });

  it('is bright at noon and dark at midnight in winter', () => {
    expect(lightLevel(noon('Summer', 11))).toBeGreaterThan(0.95);
    expect(lightLevel(fromCalendar({ year: 1, season: 'Winter', day: 11, hour: 0 }))).toBe(0);
  });
});

describe('moon', () => {
  it('cycles through its phases', () => {
    const phases = Array.from({ length: 21 }, (_, d) => moonPhase(d * SECONDS_PER_DAY));
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    const lit = Array.from({ length: 21 }, (_, d) => moonIllumination(d * SECONDS_PER_DAY));
    expect(Math.max(...lit)).toBeGreaterThan(0.95);
    expect(Math.min(...lit)).toBeLessThan(0.05);
  });
});
