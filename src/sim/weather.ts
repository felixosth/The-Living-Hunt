/**
 * The weather: a climate normal for about 63° N, fronts every few days that
 * bring cloud, wind and rain or snow, a slowly wandering temperature anomaly
 * and a daily temperature curve. It is generated an hour at a time from the
 * `weather` RNG stream and kept a week ahead in the saved state, so the
 * almanac (and later forecasts) read the weather that will really come.
 */
import { clamp, lerp, smoothstep, wrapDeg } from '../core/math';
import { chance, nextFloat, nextInt, nextRange, type RngState } from '../core/rng';
import {
  daylight,
  SECONDS_PER_DAY,
  SECONDS_PER_HOUR,
  secondOfDay,
  yearPosition,
} from '../core/time';
import type { GroundState, WeatherGen, WeatherHour, WeatherState } from './state';

/** Hours of weather kept ahead: a week. */
export const WEATHER_AHEAD_H = 7 * 24;
/** The wind most often blows from the west-south-west. */
const PREVAILING_FROM_DEG = 240;
const MEAN_WIND_SPEED = 2.8;

/**
 * Mean daily temperature by day of the year (°C), for an inland valley at
 * 63° N, a little colder than the real thing so the first snow comes while
 * you play. Seasons start on days 0, 21, 42 and 63.
 */
const CLIMATE: readonly [number, number][] = [
  [0, -6],
  [7, -3],
  [14, 1.5],
  [21, 6],
  [28, 11],
  [35, 14],
  [41, 13],
  [45, 10],
  [49, 6.5],
  [55, 2.5],
  [62, -2],
  [69, -6.5],
  [76, -9.5],
  [83, -7.5],
  [84, -6],
];

/** The normal mean temperature for the day at `t`, °C. */
export function climateMean(t: number): number {
  const day = yearPosition(t);
  for (let i = 1; i < CLIMATE.length; i++) {
    const [d1, v1] = CLIMATE[i] as [number, number];
    const [d0, v0] = CLIMATE[i - 1] as [number, number];
    if (day <= d1) return lerp(v0, v1, (day - d0) / (d1 - d0));
  }
  return (CLIMATE[0] as [number, number])[1];
}

/** Roughly normal noise with standard deviation 1. */
function gauss(rng: RngState): number {
  return (nextFloat(rng) + nextFloat(rng) + nextFloat(rng) + nextFloat(rng) - 2) * Math.sqrt(3);
}

/** Signed difference b − a between two bearings, in degrees (−180..180). */
function bearingDiff(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

/** The day's temperature swing: warmest mid-afternoon, coldest before dawn, smaller under cloud and in the dark of winter. */
function diurnal(t: number, cloud: number): number {
  const hours = daylight(t).hours;
  const amplitude = (1.2 + 4.3 * (1 - cloud)) * (0.35 + 0.65 * clamp(hours / 18, 0, 1));
  const h = secondOfDay(t) / SECONDS_PER_HOUR;
  return amplitude * Math.cos((2 * Math.PI * (h - 14.5)) / 24);
}

/** How much the hour at `t` belongs to the early morning, when fog forms: 0..1. */
function dawnness(t: number): number {
  const sunrise = daylight(t).sunrise ?? 6 * SECONDS_PER_HOUR;
  const h = (secondOfDay(t) - sunrise) / SECONDS_PER_HOUR;
  return smoothstep(-6, -1.5, h) * (1 - smoothstep(1, 3.5, h));
}

function scheduleFront(gen: WeatherGen, rng: RngState, at: number): void {
  gen.frontAt = at;
  gen.frontHours = nextInt(rng, 4, 14);
  gen.frontMm = nextRange(rng, 0.4, 2.5);
  // Most fronts bring colder air behind them; some bring milder.
  gen.frontShift = chance(rng, 0.6) ? nextRange(rng, -5, -1.5) : nextRange(rng, 1, 5);
}

const round = (x: number, step: number) => Math.round(x / step) * step;

/** Generate the hour starting at `t`, advancing the generator. */
function nextHour(gen: WeatherGen, t: number, rng: RngState): WeatherHour {
  // Fair weather wanders.
  gen.anomaly = gen.anomaly * 0.98 + 0.4 * gauss(rng);
  gen.windFromDeg = wrapDeg(
    gen.windFromDeg +
      nextRange(rng, -10, 10) +
      0.04 * bearingDiff(gen.windFromDeg, PREVAILING_FROM_DEG),
  );
  gen.windSpeed = clamp(
    gen.windSpeed + nextRange(rng, -0.6, 0.6) + 0.1 * (MEAN_WIND_SPEED - gen.windSpeed),
    0,
    12,
  );
  gen.cloud = clamp(gen.cloud + 0.1 * gauss(rng) + 0.04 * (0.45 - gen.cloud), 0, 0.9);
  if (secondOfDay(t) === 0) gen.fogDay = chance(rng, 0.5) ? nextRange(rng, 0.4, 1) : 0;
  const showerRoll = nextFloat(rng);
  const showerMm = nextRange(rng, 0.1, 0.8);
  const intensityRoll = nextFloat(rng);

  // Where we are relative to the next front.
  const into = (t - gen.frontAt) / SECONDS_PER_HOUR;
  const { frontHours } = gen;
  let cloud = gen.cloud;
  let from = gen.windFromDeg;
  let speed = gen.windSpeed;
  let precip = 0;
  let warm = 0;
  let shift = 0;
  if (into < 0 && into >= -12) {
    // Approaching: cloud builds, the wind backs and freshens, the air is mild.
    const k = 1 + into / 12;
    cloud = lerp(gen.cloud, 1, k ** 0.7);
    from = gen.windFromDeg - 35 * k;
    speed = gen.windSpeed + 3.5 * k;
    warm = gen.frontShift < 0 ? 1.5 * k : 0;
  } else if (into >= 0 && into < frontHours) {
    // Rain or snow, heaviest in the middle; the new air arrives halfway through.
    const q = into / frontHours;
    cloud = 1;
    from = gen.windFromDeg - 35 + 75 * q;
    speed = gen.windSpeed + 3.5 + Math.sin(Math.PI * q);
    precip = gen.frontMm * (0.4 + 0.6 * Math.sin((Math.PI * (into + 0.5)) / frontHours));
    precip *= 0.7 + 0.6 * intensityRoll;
    warm = gen.frontShift < 0 ? 1.5 * (1 - q) : 0;
    shift = gen.frontShift * smoothstep(0.5 * frontHours, frontHours + 6, into);
  } else if (into >= frontHours && into < frontHours + 6) {
    // Behind it: clearing, the wind veered, the new air settling in.
    const k = (into - frontHours) / 6;
    cloud = lerp(1, gen.cloud * 0.6, k);
    from = gen.windFromDeg + 40;
    speed = gen.windSpeed + 3 * (1 - k);
    shift = gen.frontShift * smoothstep(0.5 * frontHours, frontHours + 6, into);
  } else if (into >= frontHours + 6) {
    // It has passed: the new air mass becomes the anomaly, and the next front is on its way.
    gen.anomaly += gen.frontShift;
    gen.windFromDeg = wrapDeg(gen.windFromDeg + 40);
    gen.cloud *= 0.6;
    cloud = gen.cloud;
    from = gen.windFromDeg;
    const gap = nextInt(rng, 48, 120) * SECONDS_PER_HOUR;
    scheduleFront(gen, rng, Math.max(gen.frontAt + gap, t + 16 * SECONDS_PER_HOUR));
  }
  // Between fronts a heavy sky can let go a shower.
  if (precip === 0 && cloud > 0.6 && showerRoll < 0.04) precip = showerMm;

  const temp =
    climateMean(t) + gen.anomaly + shift + warm + diurnal(t, cloud) - (precip > 0 ? 1 : 0);

  // The wind drops at night and picks up in the afternoon.
  const hourOfDay = secondOfDay(t) / SECONDS_PER_HOUR;
  speed *= 0.9 + 0.3 * Math.cos((2 * Math.PI * (hourOfDay - 15)) / 24);

  // Fog: calm, damp air in the early morning, under a clear or broken sky.
  gen.damp = clamp(gen.damp * 0.93 + 0.25 * Math.min(1, precip), 0.45, 1);
  const calm = clamp(1 - speed / 3, 0, 1);
  const fog =
    precip > 0.1
      ? 0
      : clamp(3.2 * calm * dawnness(t) * gen.fogDay * gen.damp * (1 - 0.5 * cloud), 0, 1);

  return {
    temp: round(temp, 0.1),
    cloud: round(cloud, 0.01),
    precip: round(precip, 0.01),
    windFromDeg: Math.round(wrapDeg(from)),
    windSpeed: round(clamp(speed, 0, 16), 0.1),
    fog: round(fog, 0.01),
  };
}

/** Bare ground for the season: snow already lying in the depths of winter. */
function initialGround(t: number): GroundState {
  const mean = climateMean(t);
  return {
    snowCm: mean < -2 ? Math.round(-mean * 4) : 0,
    crust: 0,
    snowWet: 0,
    wet: 0.3,
    frozen: mean < 0 ? 0.5 : 0,
    snowStartedAt: 0,
    snowEndedAt: 0,
    washedAt: 0,
  };
}

/** Weather for a new world from `time`, with the hour it's in and a week ahead. */
export function initialWeather(rng: RngState, time: number): WeatherState {
  const from = Math.floor(time / SECONDS_PER_HOUR) * SECONDS_PER_HOUR;
  const gen: WeatherGen = {
    anomaly: 1.5 * gauss(rng),
    windFromDeg: Math.round(nextRange(rng, 0, 360)),
    windSpeed: nextRange(rng, 1, 5),
    cloud: nextRange(rng, 0.1, 0.7),
    damp: 0.4,
    fogDay: 0,
    frontAt: 0,
    frontHours: 0,
    frontMm: 0,
    frontShift: 0,
  };
  scheduleFront(gen, rng, from + nextInt(rng, 12, 72) * SECONDS_PER_HOUR);
  const ahead: WeatherHour[] = [];
  for (let i = 0; i < WEATHER_AHEAD_H; i++) {
    ahead.push(nextHour(gen, from + i * SECONDS_PER_HOUR, rng));
  }
  return {
    ...(ahead[0] as WeatherHour),
    ahead,
    aheadFrom: from,
    gen,
    ground: initialGround(time),
  };
}

/** Move the weather on to the hour starting at `time`: the next hour becomes the current one. */
export function advanceWeather(weather: WeatherState, time: number, rng: RngState): void {
  while (weather.aheadFrom < time) {
    weather.ahead.shift();
    const last = weather.aheadFrom + WEATHER_AHEAD_H * SECONDS_PER_HOUR;
    weather.ahead.push(nextHour(weather.gen, last, rng));
    weather.aheadFrom += SECONDS_PER_HOUR;
  }
  Object.assign(weather, weather.ahead[0]);
}

// ---------------------------------------------------------------------------
// Reading the weather
// ---------------------------------------------------------------------------

export type PrecipType = 'none' | 'rain' | 'sleet' | 'snow';

export function precipType(h: Pick<WeatherHour, 'precip' | 'temp'>): PrecipType {
  if (h.precip < 0.05) return 'none';
  if (h.temp <= 0.8) return 'snow';
  if (h.temp < 2.2) return 'sleet';
  return 'rain';
}

/** Heavy enough rain that deer take shelter. */
export function isHeavyRain(h: WeatherHour): boolean {
  const type = precipType(h);
  return (type === 'rain' || type === 'sleet') && h.precip >= 1.5;
}

/** Multiplier on how far anyone can see: fog, falling snow and rain close the view. */
export function weatherSight(h: WeatherHour): number {
  const type = precipType(h);
  const falling = type === 'snow' ? 0.45 * h.precip : type === 'none' ? 0 : 0.15 * h.precip;
  return (1 - 0.7 * h.fog) / (1 + falling);
}

/**
 * How much the weather drowns out small sounds, in the same units as wind
 * speed: rain on leaves masks footsteps like a breeze does.
 */
export function soundMasking(h: WeatherHour): number {
  const type = precipType(h);
  const rain = type === 'rain' || type === 'sleet' ? 3 * Math.min(3, h.precip) : 0;
  return h.windSpeed + rain;
}

/** "Light snow", "Overcast", "Fog", ... */
export function describeSky(h: WeatherHour): string {
  const type = precipType(h);
  if (type !== 'none') {
    const heavy = h.precip >= 1.8;
    const light = h.precip < 0.5;
    if (type === 'sleet') return heavy ? 'Heavy sleet' : 'Sleet';
    if (type === 'snow') return heavy ? 'Heavy snow' : light ? 'Light snow' : 'Snow';
    return heavy ? 'Heavy rain' : light ? 'Drizzle' : 'Rain';
  }
  if (h.fog > 0.5) return 'Fog';
  if (h.fog > 0.15) return 'Mist';
  if (h.cloud > 0.85) return 'Overcast';
  if (h.cloud > 0.55) return 'Cloudy';
  if (h.cloud > 0.25) return 'Fair';
  return 'Clear';
}

/** The ground in a few words: "6 cm of snow", "crusted snow", "frozen ground", ... */
export function describeGround(g: GroundState): string | null {
  if (g.snowCm >= 1) {
    const depth = `${Math.round(g.snowCm)} cm of`;
    if (g.crust > 0.4) return `${depth} crusted snow`;
    if (g.snowWet > 0.3) return `${depth} wet snow`;
    return `${depth} snow`;
  }
  if (g.snowCm > 0) return 'a dusting of snow';
  if (g.frozen > 0.5) return 'frozen ground';
  if (g.wet > 0.5) return 'wet ground';
  return null;
}

// ---------------------------------------------------------------------------
// Einar's almanac
// ---------------------------------------------------------------------------

interface Period {
  name: string;
  hours: WeatherHour[];
}

/** The rest of today, tonight, tomorrow and the day after, from the week ahead. */
function periods(w: WeatherState, now: number): Period[] {
  const out: Period[] = [];
  const dayStart = Math.floor(now / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  const slice = (from: number, to: number) => {
    const a = Math.max(0, Math.floor((from - w.aheadFrom) / SECONDS_PER_HOUR));
    const b = Math.max(0, Math.floor((to - w.aheadFrom) / SECONDS_PER_HOUR));
    return w.ahead.slice(a, b);
  };
  const h = secondOfDay(now) / SECONDS_PER_HOUR;
  const H = SECONDS_PER_HOUR;
  if (h < 17) out.push({ name: 'Today', hours: slice(now, dayStart + 18 * H) });
  out.push({
    name: 'Tonight',
    hours: slice(Math.max(now, dayStart + 18 * H), dayStart + SECONDS_PER_DAY + 6 * H),
  });
  out.push({
    name: 'Tomorrow',
    hours: slice(dayStart + SECONDS_PER_DAY + 6 * H, dayStart + SECONDS_PER_DAY + 18 * H),
  });
  out.push({
    name: 'The day after',
    hours: slice(dayStart + 2 * SECONDS_PER_DAY + 6 * H, dayStart + 2 * SECONDS_PER_DAY + 18 * H),
  });
  return out.filter((p) => p.hours.length > 0);
}

/** When in a period something happens: "by evening", "in the morning", ... */
function when(index: number, length: number, night: boolean): string {
  const k = index / Math.max(1, length);
  if (night) return k < 0.4 ? 'in the evening' : k < 0.75 ? 'in the night' : 'towards morning';
  return k < 0.35 ? 'in the morning' : k < 0.7 ? 'around midday' : 'by evening';
}

function outlookLine(p: Period, far: boolean): string {
  const night = p.name === 'Tonight';
  const { hours } = p;
  const likely = far ? 'perhaps' : 'likely';
  const wet = hours.findIndex((x) => precipType(x) !== 'none' && x.precip >= 0.2);
  const cold = Math.min(...hours.map((x) => x.temp));
  const warmest = Math.max(...hours.map((x) => x.temp));
  const wind = Math.max(...hours.map((x) => x.windSpeed));
  const cloud = hours.reduce((s, x) => s + x.cloud, 0) / hours.length;
  const fog = Math.max(...hours.map((x) => x.fog));
  const parts: string[] = [];
  if (wet >= 0) {
    const amount = hours.reduce((s, x) => s + (precipType(x) !== 'none' ? x.precip : 0), 0);
    const types = new Set(hours.filter((x) => x.precip >= 0.2).map(precipType));
    const what = types.has('snow')
      ? types.has('rain') || types.has('sleet')
        ? 'rain turning to snow'
        : amount > 8
          ? 'heavy snow'
          : 'snow'
      : types.has('sleet')
        ? 'sleet'
        : amount > 10
          ? 'heavy rain'
          : 'rain';
    const start = when(wet, hours.length, night);
    parts.push(wet === 0 ? `${what}, ${likely}` : `${what} ${likely} ${start}`);
  } else if (fog > 0.4) {
    parts.push(
      `fog ${likely} ${night ? 'towards morning' : 'early on'}, then ${cloud > 0.6 ? 'grey' : 'fair'}`,
    );
  } else {
    parts.push(
      cloud > 0.8 ? 'grey and dry' : cloud > 0.5 ? 'cloudy, dry' : cloud > 0.25 ? 'fair' : 'clear',
    );
  }
  if (wind >= 7) parts.push('a hard wind');
  else if (wind >= 5) parts.push('windy');
  if (night || wet < 0) {
    if (cold <= -8) parts.push('bitter cold');
    else if (cold <= -1) parts.push('frost');
    else if (warmest >= 12) parts.push('mild');
  }
  const text = parts.join(', ');
  return `${p.name}: ${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Einar's outlook for the next two days: vague, but it reads the weather that will come. */
export function almanac(w: WeatherState, now: number): string[] {
  return periods(w, now).map((p) => outlookLine(p, p.name === 'The day after'));
}
