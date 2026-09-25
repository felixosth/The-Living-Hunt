import { render } from 'preact';
import { DebugPanel } from './DebugPanel';
import { Hud } from './Hud';
import { debugOpen, type GameActions, notices, toast } from './store';

function App({ actions }: { actions: GameActions }) {
  const t = toast.value;
  return (
    <>
      <Hud />
      {debugOpen.value && <DebugPanel actions={actions} />}
      <div class="notices" data-testid="notices">
        {notices.value.map((n) => (
          <div key={n.id} class="notice">
            {n.text}
          </div>
        ))}
      </div>
      {t && (
        <div class={`panel toast ${t.kind}`} role="status" data-testid="toast">
          {t.text}
        </div>
      )}
      <div class="help">
        <kbd>W</kbd>
        <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd> move · <kbd>Shift</kbd> run · <kbd>C</kbd> sneak · <kbd>T</kbd> wait ·{' '}
        <kbd>P</kbd> pause · wheel zoom · <kbd>`</kbd> debug
      </div>
    </>
  );
}

export function mountUi(root: HTMLElement, actions: GameActions): void {
  render(<App actions={actions} />, root);
}
