/**
 * Headless simulation runner.
 *
 *   npm run sim -- --seed 42 --days 30
 *   npm run sim -- --seed 42 --days 84 --wander --out out/run-42
 *
 * With --out, writes summary.json and daily.csv to that directory.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { compassName } from '../../src/core/math';
import { formatClock, formatDate } from '../../src/core/time';
import { describeAnimals, describePlayerGround, runHeadless } from './headless';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '1' },
    days: { type: 'string', default: '30' },
    step: { type: 'string', default: '60' },
    wander: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

const seed = Number(values.seed);
const days = Number(values.days);
const stepSeconds = Number(values.step);
if (!Number.isInteger(seed) || seed < 0) throw new Error('--seed must be a non-negative integer');
if (!(days > 0)) throw new Error('--days must be positive');

const result = runHeadless({ seed, days, stepSeconds, wander: values.wander });
const { state, eventCounts } = result;
const when = (t: number) => `${formatDate(t)} ${formatClock(t)}`;
const simDaysPerSecond = days / (result.wallMs / 1000);

console.log(`The Living Hunt — headless run
  seed        ${state.seed}
  simulated   ${days} days (${when(result.startTime)} → ${when(state.time)})
  steps       ${result.steps.toLocaleString('en')} × ${stepSeconds} s
  wall time   ${result.wallMs.toFixed(0)} ms (${simDaysPerSecond.toFixed(0)} game days per second)
  events      ${eventCounts.hourStarted ?? 0} hours · ${eventCounts.dayStarted ?? 0} days · ${eventCounts.seasonStarted ?? 0} seasons · ${eventCounts.sound ?? 0} sounds heard · ${eventCounts.sighted ?? 0} sightings
  animals     ${describeAnimals(state)}
  signs       ${state.signs.count.toLocaleString('en')} on the ground
  player      (${state.player.x.toFixed(1)}, ${state.player.y.toFixed(1)}) m · ${describePlayerGround(state)}
  wind        from ${compassName(state.weather.windFromDeg)} at ${state.weather.windSpeed.toFixed(1)} m/s
  state hash  ${result.hash}`);

if (values.out) {
  mkdirSync(values.out, { recursive: true });
  const summary = {
    seed: state.seed,
    days,
    stepSeconds,
    wander: values.wander,
    start: when(result.startTime),
    end: when(state.time),
    steps: result.steps,
    wallMs: Math.round(result.wallMs),
    eventCounts,
    activity: result.activity,
    hash: result.hash,
  };
  writeFileSync(join(values.out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const header = 'date,wind_from_deg,wind_speed_ms,daylight_h,player_x_m,player_y_m';
  const rows = result.daily.map((d) =>
    [
      formatDate(d.time),
      d.windFromDeg,
      d.windSpeed,
      d.daylightHours.toFixed(2),
      d.playerX.toFixed(1),
      d.playerY.toFixed(1),
    ].join(','),
  );
  writeFileSync(join(values.out, 'daily.csv'), `${[header, ...rows].join('\n')}\n`);
  console.log(`  wrote       ${join(values.out, 'summary.json')}, daily.csv`);
}
