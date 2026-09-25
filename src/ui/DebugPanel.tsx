import { useRef, useState } from 'preact/hooks';
import { TIME_SCALES } from '../app/session';
import { terrainDef } from '../content/terrain';
import type { ForcedWeather } from '../sim/debugWeather';
import type { KnowledgeArea } from '../sim/knowledge';
import { controls, type GameActions, godView, perf, snapshot } from './store';

/** Weather you can force, as [kind, label]. */
const WEATHER: [ForcedWeather, string][] = [
  ['clear', 'Clear'],
  ['windy', 'Windy'],
  ['rain', 'Rain'],
  ['snowfall', 'Snowfall'],
  ['snowCover', '+10 cm snow'],
  ['fog', 'Fog'],
  ['crust', 'Crust'],
  ['thaw', 'Thaw'],
];

/** Every skill you can set, as [area, key, label]. */
const SKILLS: [KnowledgeArea, string, string][] = [
  ['species', 'roe', 'Roe deer'],
  ['species', 'hare', 'Hare'],
  ['signs', 'print', 'Prints'],
  ['signs', 'pellets', 'Droppings'],
  ['signs', 'bed', 'Beds'],
  ['signs', 'browse', 'Browse'],
  ['signs', 'blood', 'Blood'],
  ['hands', 'bow', 'Bow arm'],
];

export function DebugPanel({ actions }: { actions: GameActions }) {
  const s = snapshot.value;
  const p = perf.value;
  const { timeScale, paused } = controls.value;
  const [seedText, setSeedText] = useState('');
  const [hash, setHash] = useState('');
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [weatherOpen, setWeatherOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!s) return null;

  const createWorld = (e: Event) => {
    e.preventDefault();
    const seed = seedText.trim() === '' ? Math.floor(Math.random() * 1e9) : Number(seedText);
    if (Number.isInteger(seed) && seed >= 0) actions.newWorld(seed);
  };

  return (
    <div class="panel debug" data-testid="debug-panel">
      <div class="debug-title">Debug</div>
      <table>
        <tbody>
          <tr>
            <th>Perf</th>
            <td>
              {p.fps.toFixed(0)} fps · frame {p.frameMs.toFixed(1)} ms · sim {p.tickMs.toFixed(2)}{' '}
              ms/tick
            </td>
          </tr>
          <tr>
            <th>World</th>
            <td>
              seed <span data-testid="seed">{s.seed}</span> · tick {s.tick} · {s.regionId}
            </td>
          </tr>
          <tr>
            <th>Player</th>
            <td data-testid="player-pos">
              {s.player.x.toFixed(1)}, {s.player.y.toFixed(1)} m ·{' '}
              {s.player.terrain === null ? '—' : terrainDef(s.player.terrain).name}
            </td>
          </tr>
          <tr>
            <th>Light</th>
            <td>{(s.light * 100).toFixed(0)} %</td>
          </tr>
        </tbody>
      </table>

      <div class="debug-row">
        <span class="debug-label">Time</span>
        <button type="button" class={paused ? 'on' : ''} onClick={actions.togglePause}>
          Pause
        </button>
        {TIME_SCALES.map((scale) => (
          <button
            type="button"
            key={scale}
            class={!paused && timeScale === scale ? 'on' : ''}
            onClick={() => actions.setTimeScale(scale)}
          >
            {scale}×
          </button>
        ))}
      </div>

      <div class="debug-row">
        <span class="debug-label">View</span>
        <button
          type="button"
          class={godView.value ? 'on' : ''}
          data-testid="god-view"
          onClick={() => {
            godView.value = !godView.value;
          }}
        >
          God view
        </button>
      </div>

      <div class="debug-row">
        <span class="debug-label">Save</span>
        <button type="button" data-testid="quicksave" onClick={() => actions.quicksave()}>
          Quicksave
        </button>
        <button type="button" data-testid="quickload" onClick={() => actions.quickload()}>
          Quickload
        </button>
        <button type="button" onClick={() => actions.exportSave()}>
          Export
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".lhsave,application/gzip"
          hidden
          onChange={(e) => {
            const file = (e.currentTarget as HTMLInputElement).files?.[0];
            if (file) actions.importSave(file);
            (e.currentTarget as HTMLInputElement).value = '';
          }}
        />
      </div>

      <form class="debug-row" onSubmit={createWorld}>
        <span class="debug-label">World</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="seed (blank = random)"
          value={seedText}
          onInput={(e) => setSeedText((e.currentTarget as HTMLInputElement).value)}
        />
        <button type="submit">New world</button>
      </form>

      <div class="debug-row">
        <span class="debug-label">Weather</span>
        <button
          type="button"
          class={weatherOpen ? 'on' : ''}
          data-testid="weather-toggle"
          onClick={() => setWeatherOpen(!weatherOpen)}
        >
          {weatherOpen ? 'Hide' : 'Show'}
        </button>
      </div>
      {weatherOpen && (
        <div class="debug-skills" data-testid="weather-tools">
          <div class="debug-row">
            <span class="debug-label">Now</span>
            <span>
              {s.weather.sky}, {s.weather.temp.toFixed(1)} °C · {s.weather.snowCm.toFixed(1)} cm
              snow · crust {(s.weather.crust * 100).toFixed(0)} % · wet{' '}
              {(s.weather.wet * 100).toFixed(0)} % · frozen {(s.weather.frozen * 100).toFixed(0)} %
            </span>
          </div>
          <div class="debug-row debug-wrap">
            <span class="debug-label">Force</span>
            {WEATHER.map(([kind, label]) => (
              <button
                type="button"
                key={kind}
                data-testid={`weather-${kind}`}
                onClick={() => actions.forceWeather(kind)}
              >
                {label}
              </button>
            ))}
          </div>
          <div class="debug-row">
            <span class="debug-label">Skip</span>
            {[1, 6, 24].map((h) => (
              <button
                type="button"
                key={h}
                data-testid={`skip-${h}`}
                onClick={() => actions.skipHours(h)}
              >
                {h} h
              </button>
            ))}
          </div>
        </div>
      )}

      <div class="debug-row">
        <span class="debug-label">Skills</span>
        <button
          type="button"
          class={skillsOpen ? 'on' : ''}
          data-testid="skills-toggle"
          onClick={() => setSkillsOpen(!skillsOpen)}
        >
          {skillsOpen ? 'Hide' : 'Show'}
        </button>
      </div>
      {skillsOpen && (
        <div class="debug-skills" data-testid="skills">
          {SKILLS.map(([area, key, label]) => {
            const current = (s.tracking.knowledge[area] as Record<string, { level: number }>)[key]
              ?.level;
            return (
              <div class="debug-row" key={`${area}.${key}`}>
                <span class="debug-label">{label}</span>
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <button
                    type="button"
                    key={lvl}
                    class={current === lvl ? 'on' : ''}
                    data-testid={`skill-${area}-${key}-${lvl}`}
                    onClick={() => actions.setSkill(area, key, lvl)}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div class="debug-row">
        <span class="debug-label">State</span>
        <button type="button" onClick={() => setHash(actions.stateHash())}>
          Hash
        </button>
        <code data-testid="state-hash">{hash}</code>
      </div>
    </div>
  );
}
