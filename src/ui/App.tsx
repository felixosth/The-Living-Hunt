import { render } from 'preact';
import { DebugPanel } from './DebugPanel';
import { Help } from './Help';
import { Hud } from './Hud';
import { Journal } from './Journal';
import { ReadingCard } from './ReadingCard';
import { debugOpen, type GameActions, notices, toast } from './store';

function App({ actions }: { actions: GameActions }) {
  const t = toast.value;
  return (
    <>
      <Hud />
      <ReadingCard actions={actions} />
      <Journal />
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
      <Help />
    </>
  );
}

export function mountUi(root: HTMLElement, actions: GameActions): void {
  render(<App actions={actions} />, root);
}
