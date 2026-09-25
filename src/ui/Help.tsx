import { helpOpen } from './store';

const CONTROLS: [string, string][] = [
  ['W A S D / arrows', 'Move'],
  ['Shift', 'Run (loud)'],
  ['C', 'Toggle sneaking (quiet, slow, low; you notice more)'],
  ['C, then keep still', 'Crouch and study the ground: subtle signs appear around you'],
  ['Click a sign', 'Read it (you must be close)'],
  ['F', 'Follow the trail of the sign you read / stop'],
  ['Right mouse (hold)', 'Draw the bow on the animal under the cursor'],
  ['Mouse / left click', 'Aim on the side view / loose the arrow'],
  ['Space (hold)', 'Hold your breath: steady for a few seconds'],
  ['Q', 'A soft bleat: a walking roe deer stops and looks up for a moment'],
  ['E', 'Field-dress, pick up, put down, bring home'],
  ['J', "Journal: what you know, and Einar's almanac"],
  ['T', 'Wait (10×); stops when something stirs'],
  ['P', 'Pause'],
  ['Mouse wheel', 'Zoom'],
  ['`', 'Debug panel: god view, weather, skill levels, saves'],
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
        Watch the wind: treetops lean and gusts roll across the ground the way your scent drifts,
        and in the cold your breath shows it too. Any animal downwind of you will smell you. Move
        slowly on quiet ground, stay in cover, and read what the animals left behind.
      </p>
      <p class="card-meta">
        Watch the weather too. Rain washes out old trails and your scent, and hides your footsteps.
        New snow buries everything, then takes every print: a trail made after it stopped is fresh.
        Crusted snow and frozen leaves crunch; soft new snow is quiet.
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
