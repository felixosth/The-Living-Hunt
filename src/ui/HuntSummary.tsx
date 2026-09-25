import { SPECIES } from '../content/species';
import { formatClock } from '../core/time';
import type { HuntSummary as Summary } from '../sim/state';
import { summary } from './store';

const ZONE_WORDS: Record<string, string> = {
  heart: 'a heart shot',
  lungs: 'a lung shot',
  liver: 'a liver shot',
  gut: 'a gut shot',
  spine: 'a spine shot that dropped it',
  muscle: 'a muscle wound',
  bone: 'a hit on the shoulder bone',
  graze: 'a graze',
  miss: 'a miss',
};

function duration(seconds: number): string {
  const m = Math.max(0, Math.round(seconds / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function describe(s: Summary): string[] {
  const def = SPECIES[s.species];
  const who = s.species === 'roe' ? (s.juvenile ? 'fawn' : s.sex === 'f' ? 'doe' : 'buck') : '';
  const lines = [
    `A ${def.name}${who ? ` ${who}` : ''}: ${s.liveWeightKg.toFixed(1)} kg live, ${s.carcassWeightKg.toFixed(1)} kg brought home.`,
  ];
  if (s.firstSignAt > 0 && s.shotAt > 0) {
    lines.push(
      `First sign found at ${formatClock(s.firstSignAt)}; ${duration(s.shotAt - s.firstSignAt)} of tracking and stalking before the shot.`,
    );
  }
  if (s.shotAt > 0) {
    lines.push(`The shot: ${s.shotDistance} m, ${s.shotAngle}. It was ${ZONE_WORDS[s.zone]}.`);
    lines.push(
      s.ranM < 3
        ? 'It fell where it stood.'
        : `It ran ${s.ranM} m. You walked ${s.trailWalkedM} m from the shot to reach it.`,
    );
  }
  if (s.recoveredAt > 0 && s.firstSignAt > 0) {
    lines.push(`From first sign to recovery: ${duration(s.recoveredAt - s.firstSignAt)}.`);
  }
  lines.push(
    s.meat === 'good'
      ? 'The meat is good.'
      : s.meat === 'tainted'
        ? 'The gut was opened: the meat is tainted.'
        : 'It lay too long before it was dressed: the meat is poor.',
  );
  return lines;
}

export function HuntSummary() {
  const s = summary.value;
  if (!s) return null;
  return (
    <div class="panel summary" data-testid="hunt-summary">
      <div class="card-title">Home at the cabin</div>
      {describe(s).map((line) => (
        <p key={line} class="card-line">
          {line}
        </p>
      ))}
      <div class="card-buttons">
        <button
          type="button"
          onClick={() => {
            summary.value = null;
          }}
        >
          Back to the forest <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
