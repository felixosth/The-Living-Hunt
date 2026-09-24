/**
 * Placeholder weather: an hourly random walk of the wind, drawn from the
 * `weather` RNG stream. The real weather model (fronts, precipitation, snow,
 * forecasts) arrives in M2.
 */
import { clamp, wrapDeg } from '../core/math';
import { nextRange, type RngState } from '../core/rng';
import type { WeatherState } from './state';

const MEAN_WIND_SPEED = 3;

export function initialWeather(rng: RngState): WeatherState {
  return {
    windFromDeg: Math.round(nextRange(rng, 0, 360)),
    windSpeed: Math.round(nextRange(rng, 1, 5) * 10) / 10,
  };
}

export function updateWeatherHourly(weather: WeatherState, rng: RngState): void {
  weather.windFromDeg = Math.round(wrapDeg(weather.windFromDeg + nextRange(rng, -25, 25)));
  const drift = nextRange(rng, -1, 1) + 0.15 * (MEAN_WIND_SPEED - weather.windSpeed);
  weather.windSpeed = Math.round(clamp(weather.windSpeed + drift, 0, 14) * 10) / 10;
}
