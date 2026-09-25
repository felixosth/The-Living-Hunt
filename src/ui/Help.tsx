import { helpOpen } from './store';

const CONTROLS: [string, string][] = [
  ['W A S D / arrows', 'Move'],
  ['Shift', 'Run (loud)'],
  ['C', 'Toggle sneaking (quiet, slow, low)'],
  ['Q', 'Scan the ground around you for signs'],
  ['Click a sign', 'Read it (you must be close)'],
  ['F', 'Follow the trail of the sign you read / stop'],
  ['J', 'Journal: what you know'],
  ['T', 'Wait (10×); stops when something stirs'],
  ['P', 'Pause'],
  ['Mouse wheel', 'Zoom'],
  ['`', 'Debug panel and god view'],
];

export function Help() {
  if (!helpOpen.value) {
    return (
      <div class="help">
        <kbd>H</kbd> help
      </div>
    );
  }
  return (
    <div class="panel help-panel" data-testid="help">
      <div class="card-title">How to hunt</div>
      <p class="card-meta">
        Watch the wind: your scent drifts the way the arrow points. Move slowly on quiet ground,
        stay in cover, and read what the animals left behind.
      </p>
      <table>
        <tbody>
          {CONTROLS.map(([key, what]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div class="card-meta">
        <kbd>H</kbd> to close
      </div>
    </div>
  );
}
