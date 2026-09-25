import { SPECIES } from '../content/species';
import { terrainDef } from '../content/terrain';
import { compassName } from '../core/math';
import { daylight, formatClock, formatDate, formatHours, formatSecondOfDay } from '../core/time';
import type { Gait } from '../sim/state';
import { controls, snapshot } from './store';

const GAIT_LABEL: Record<Gait, string> = { sneak: 'Sneaking', walk: 'Walking', run: 'Running' };

export function Hud() {
  const s = snapshot.value;
  if (!s) return null;
  const sun = daylight(s.time);
  const sunText =
    sun.sunrise === null || sun.sunset === null
      ? sun.hours > 0
        ? 'Midnight sun'
        : 'Polar night'
      : `Sunrise ${formatSecondOfDay(sun.sunrise)} · Sunset ${formatSecondOfDay(sun.sunset)} · ${formatHours(sun.hours)}`;
  const { paused, timeScale } = controls.value;

  return (
    <>
      <div class="panel hud-top" data-testid="hud">
        <div class="hud-clock">
          <span data-testid="clock">{formatClock(s.time)}</span>
          {paused ? (
            <span class="hud-badge">Paused</span>
          ) : (
            timeScale > 1 && <span class="hud-badge">{timeScale}×</span>
          )}
        </div>
        <div class="hud-date">
          {formatDate(s.time)} · {s.regionName}
        </div>
        <div class="hud-sub">{sunText}</div>
      </div>
      <Wind fromDeg={s.wind.fromDeg} speed={s.wind.speed} />
      <div class="panel hud-status">
        <span>
          {s.player.moving
            ? GAIT_LABEL[s.player.gait]
            : controls.value.sneakToggled
              ? 'Crouched'
              : 'Standing'}
        </span>
        <span class="hud-sep">·</span>
        <span>
          {s.player.terrain === null ? '—' : terrainDef(s.player.terrain).name}
          {s.player.onTrail && ' (trail)'}
        </span>
        <TrackingStatus />
        <Meter label="Noise" value={Math.min(1, s.player.noiseRadius / 80)} testId="noise" />
        <Meter label="Seen" value={s.player.visibility} testId="visibility" />
        <span class="hud-label" data-testid="arrows">
          Arrows {s.player.arrows}
        </span>
        {s.player.carrying && (
          <span class="hud-label">
            Carrying {s.player.load.toFixed(0)}/{s.player.capacity} kg
          </span>
        )}
      </div>
      <Prompt />
    </>
  );
}

function Prompt() {
  const s = snapshot.value;
  if (!s) return null;
  if (s.player.busy === 'dress') {
    return (
      <div class="panel prompt">Field-dressing… {Math.round(s.player.busyProgress * 100)} %</div>
    );
  }
  if (!s.player.prompt) return null;
  return (
    <div class="panel prompt" data-testid="prompt">
      <kbd>E</kbd> {s.player.prompt}
    </div>
  );
}

function TrackingStatus() {
  const s = snapshot.value;
  if (!s) return null;
  const { searching, following } = s.tracking;
  if (!following) {
    return searching === 'still' && s.player.gait === 'sneak' && !s.bow ? (
      <span class="status-track" data-testid="searching">
        Studying the ground…
      </span>
    ) : null;
  }
  const who = following.species ? SPECIES[following.species].name : 'animal';
  return (
    <span class={`status-track${following.lost ? ' lost' : ''}`} data-testid="following">
      {following.lost ? `Lost the ${who} trail: crouch and look` : `Following a ${who}`}
    </span>
  );
}

/** A five-segment meter, filled from the left. */
function Meter({ label, value, testId }: { label: string; value: number; testId: string }) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 5);
  return (
    <span class="meter" data-testid={testId} title={`${label}: ${Math.round(value * 100)} %`}>
      <span class="hud-label">{label}</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} class={i < filled ? `pip on${i >= 3 ? ' hot' : ''}` : 'pip'} />
      ))}
    </span>
  );
}

function Wind({ fromDeg, speed }: { fromDeg: number; speed: number }) {
  // The arrow points where the wind blows TO; north is up.
  return (
    <div class="panel hud-wind" title="Wind: where your scent is carried">
      <svg viewBox="-20 -20 40 40" width="44" height="44" aria-hidden="true">
        <circle r="18" class="wind-ring" />
        <text y="-11" class="wind-n">
          N
        </text>
        <g transform={`rotate(${fromDeg + 180})`}>
          <path d="M0,-13 L5,-3 L1.5,-3 L1.5,12 L-1.5,12 L-1.5,-3 L-5,-3 Z" class="wind-arrow" />
        </g>
      </svg>
      <div>
        <div class="hud-label">Wind</div>
        <div>
          from {compassName(fromDeg)} · {speed.toFixed(1)} m/s
        </div>
      </div>
    </div>
  );
}
