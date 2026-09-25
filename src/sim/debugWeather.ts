/**
 * Developer tools for the weather: force a condition for the next hours so
 * any of them can be tried without waiting for a front.
 */
import { SECONDS_PER_HOUR } from '../core/time';
import { weatherSigns } from './signs';
import type { WeatherHour, WorldState } from './state';

export const FORCED_WEATHER = [
  'clear',
  'rain',
  'snowfall',
  'snowCover',
  'fog',
  'crust',
  'thaw',
] as const;
export type ForcedWeather = (typeof FORCED_WEATHER)[number];

/** Rewrite the next `hours` of the week ahead with `change`, starting now. */
function rewrite(state: WorldState, hours: number, change: (h: WeatherHour) => void): void {
  const w = state.weather;
  for (let i = 0; i < Math.min(hours, w.ahead.length); i++) change(w.ahead[i] as WeatherHour);
  Object.assign(w, w.ahead[0]);
}

export function forceWeather(state: WorldState, kind: ForcedWeather): void {
  const w = state.weather;
  const g = w.ground;
  switch (kind) {
    case 'clear':
      rewrite(state, 12, (h) => Object.assign(h, { precip: 0, fog: 0, cloud: 0.1 }));
      return;
    case 'rain':
      rewrite(state, 6, (h) =>
        Object.assign(h, { precip: 2, cloud: 1, fog: 0, temp: Math.max(h.temp, 5) }),
      );
      return;
    case 'snowfall':
      rewrite(state, 6, (h) =>
        Object.assign(h, { precip: 1.5, cloud: 1, fog: 0, temp: Math.min(h.temp, -3) }),
      );
      return;
    case 'snowCover': {
      // As if 10 cm had just fallen and stopped: everything older lies buried.
      const now = state.time;
      g.snowCm += 10;
      g.crust = 0;
      g.snowWet = 0;
      g.snowStartedAt = now - 3 * SECONDS_PER_HOUR;
      g.snowEndedAt = now;
      g.washedAt = now;
      weatherSigns(state.signs, 0, 10, 0);
      rewrite(state, 6, (h) => Object.assign(h, { precip: 0, temp: Math.min(h.temp, -2) }));
      return;
    }
    case 'fog':
      rewrite(state, 4, (h) => Object.assign(h, { fog: 0.9, precip: 0, windSpeed: 0.5 }));
      return;
    case 'crust':
      g.snowCm = Math.max(g.snowCm, 15);
      g.crust = 1;
      g.snowWet = 0;
      rewrite(state, 6, (h) => Object.assign(h, { precip: 0, temp: Math.min(h.temp, -4) }));
      return;
    case 'thaw':
      rewrite(state, 12, (h) => Object.assign(h, { precip: 0, temp: Math.max(h.temp, 5) }));
      return;
  }
}
