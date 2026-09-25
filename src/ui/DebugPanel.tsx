import { useRef, useState } from 'preact/hooks';
import { TIME_SCALES } from '../app/session';
import { terrainDef } from '../content/terrain';
import { controls, type GameActions, godView, perf, snapshot } from './store';

export function DebugPanel({ actions }: { actions: GameActions }) {
  const s = snapshot.value;
  const p = perf.value;
  const { timeScale, paused } = controls.value;
  const [seedText, setSeedText] = useState('');
  const [hash, setHash] = useState('');
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
        <span class="debug-label">State</span>
        <button type="button" onClick={() => setHash(actions.stateHash())}>
          Hash
        </button>
        <code data-testid="state-hash">{hash}</code>
      </div>
    </div>
  );
}
