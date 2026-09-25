/**
 * Game time and the Ulvdalen calendar.
 *
 * Time is stored as whole game seconds since the calendar epoch: Year 1,
 * Spring 1, 00:00. A year is 4 seasons of 21 days (84 days). Seasons are
 * centred on the astronomical events, so Midsummer (Summer 11) is the summer
 * solstice and Midwinter (Winter 11) the winter solstice.
 *
 * The sun is modelled for about 63° N: roughly 5 hours of daylight at
 * Midwinter and 20 at Midsummer, with long twilights. Local solar time is used
 * throughout (the sun is highest at 12:00).
 */
import { clamp, degToRad, radToDeg, smoothstep, TAU } from './math';

export type GameTime = number;

export const SECONDS_PER_MINUTE = 60;
/**
 * At normal speed a game minute passes every real second. Things measured in
 * the player's own time, like holding a drawn bow, convert with this.
 */
export const GAME_SECONDS_PER_REAL_SECOND = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86_400;
export const DAYS_PER_SEASON = 21;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export type Season = (typeof SEASONS)[number];
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length;
export const SECONDS_PER_YEAR = DAYS_PER_YEAR * SECONDS_PER_DAY;

export interface CalendarDate {
  year: number;
  season: Season;
  seasonIndex: number;
  /** Day of the season, 1-based (1..21). */
  day: number;
  /** Day of the year, 0-based (0..83). */
  dayOfYear: number;
  hour: number;
  minute: number;
  second: number;
}

export interface CalendarInput {
  year: number;
  season: Season;
  day: number;
  hour?: number;
  minute?: number;
}

export function dayIndex(t: GameTime): number {
  return Math.floor(t / SECONDS_PER_DAY);
}

export function secondOfDay(t: GameTime): number {
  return t - dayIndex(t) * SECONDS_PER_DAY;
}

export function toCalendar(t: GameTime): CalendarDate {
  const days = dayIndex(t);
  const sod = t - days * SECONDS_PER_DAY;
  const yearIndex = Math.floor(days / DAYS_PER_YEAR);
  const dayOfYear = days - yearIndex * DAYS_PER_YEAR;
  const seasonIndex = Math.floor(dayOfYear / DAYS_PER_SEASON);
  return {
    year: yearIndex + 1,
    season: SEASONS[seasonIndex] as Season,
    seasonIndex,
    day: dayOfYear - seasonIndex * DAYS_PER_SEASON + 1,
    dayOfYear,
    hour: Math.floor(sod / SECONDS_PER_HOUR),
    minute: Math.floor((sod % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE),
    second: sod % SECONDS_PER_MINUTE,
  };
}

export function fromCalendar({ year, season, day, hour = 0, minute = 0 }: CalendarInput): GameTime {
  if (day < 1 || day > DAYS_PER_SEASON) throw new RangeError(`day ${day} is outside 1..21`);
  const seasonIndex = SEASONS.indexOf(season);
  const days = (year - 1) * DAYS_PER_YEAR + seasonIndex * DAYS_PER_SEASON + (day - 1);
  return days * SECONDS_PER_DAY + hour * SECONDS_PER_HOUR + minute * SECONDS_PER_MINUTE;
}

// ---------------------------------------------------------------------------
// Sun and moon
// ---------------------------------------------------------------------------

export const LATITUDE_DEG = 63;
const AXIAL_TILT_DEG = 23.44;
/** Noon on Summer 11, as a position in the year measured in days. */
const MIDSUMMER_YEAR_POSITION = DAYS_PER_SEASON + 10.5;
/** Sun altitude at sunrise/sunset: upper limb on the horizon, with refraction. */
const HORIZON_ALTITUDE_DEG = -0.833;

/** Continuous position in the year in days, [0, 84), including time of day. */
export function yearPosition(t: GameTime): number {
  const days = t / SECONDS_PER_DAY;
  return days - Math.floor(days / DAYS_PER_YEAR) * DAYS_PER_YEAR;
}

export function solarDeclinationDeg(t: GameTime): number {
  const phase = (TAU * (yearPosition(t) - MIDSUMMER_YEAR_POSITION)) / DAYS_PER_YEAR;
  return AXIAL_TILT_DEG * Math.cos(phase);
}

/** Sun altitude above the horizon in degrees. */
export function sunAltitudeDeg(t: GameTime, latitudeDeg = LATITUDE_DEG): number {
  const decl = degToRad(solarDeclinationDeg(t));
  const lat = degToRad(latitudeDeg);
  const hourAngle = degToRad(15 * (secondOfDay(t) / SECONDS_PER_HOUR - 12));
  const sinAlt =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  return radToDeg(Math.asin(clamp(sinAlt, -1, 1)));
}

export interface Daylight {
  /** Sunrise as seconds after midnight, or null during polar night / midnight sun. */
  sunrise: number | null;
  sunset: number | null;
  /** Hours of daylight that day. */
  hours: number;
}

/** Sunrise, sunset and day length for the day containing `t`. */
export function daylight(t: GameTime, latitudeDeg = LATITUDE_DEG): Daylight {
  const noon = dayIndex(t) * SECONDS_PER_DAY + 12 * SECONDS_PER_HOUR;
  const decl = degToRad(solarDeclinationDeg(noon));
  const lat = degToRad(latitudeDeg);
  const cosH =
    (Math.sin(degToRad(HORIZON_ALTITUDE_DEG)) - Math.sin(lat) * Math.sin(decl)) /
    (Math.cos(lat) * Math.cos(decl));
  if (cosH >= 1) return { sunrise: null, sunset: null, hours: 0 };
  if (cosH <= -1) return { sunrise: null, sunset: null, hours: 24 };
  const halfDayHours = radToDeg(Math.acos(cosH)) / 15;
  return {
    sunrise: Math.round((12 - halfDayHours) * SECONDS_PER_HOUR),
    sunset: Math.round((12 + halfDayHours) * SECONDS_PER_HOUR),
    hours: 2 * halfDayHours,
  };
}

/** Ambient daylight from 0 (full night) to 1 (full day), fading through twilight. */
export function lightLevel(t: GameTime, latitudeDeg = LATITUDE_DEG): number {
  return smoothstep(-12, 8, sunAltitudeDeg(t, latitudeDeg));
}

export const LUNAR_CYCLE_DAYS = 21;

/** Moon phase in [0, 1): 0 is new moon, 0.5 is full moon. */
export function moonPhase(t: GameTime): number {
  const days = t / SECONDS_PER_DAY;
  return (days - Math.floor(days / LUNAR_CYCLE_DAYS) * LUNAR_CYCLE_DAYS) / LUNAR_CYCLE_DAYS;
}

/** Fraction of the moon's disc that is lit, 0..1. */
export function moonIllumination(t: GameTime): number {
  return (1 - Math.cos(TAU * moonPhase(t))) / 2;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "07:05" */
export function formatClock(t: GameTime): string {
  const { hour, minute } = toCalendar(t);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** "07:05" for a number of seconds after midnight. */
export function formatSecondOfDay(sod: number): string {
  return `${pad2(Math.floor(sod / SECONDS_PER_HOUR) % 24)}:${pad2(Math.floor((sod % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE))}`;
}

/** "Autumn 8, Year 1" */
export function formatDate(t: GameTime): string {
  const { season, day, year } = toCalendar(t);
  return `${season} ${day}, Year ${year}`;
}

/** "7 h 38 min" */
export function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)} h ${pad2(total % 60)} min`;
}
