import { SIGN_KIND_NAMES } from '../sim/signs';
import { type GameActions, reading, snapshot } from './store';

const LEVEL_WORDS = ['novice', 'learning', 'fair', 'good', 'expert'];

export function ReadingCard({ actions }: { actions: GameActions }) {
  const r = reading.value;
  const s = snapshot.value;
  if (!r || !s) return null;
  const followable = r.kind !== 'arrow' && SIGN_KIND_NAMES.includes(r.kind);
  const followingThis = s.signs.some((x) => x.id === r.signId && x.followed);
  return (
    <div class="panel card" data-testid="reading">
      <div class="card-title">{r.title}</div>
      {r.lines.map((line) => (
        <p key={line} class="card-line">
          {line}
        </p>
      ))}
      <div class="card-meta">
        Reading {r.kind}: {LEVEL_WORDS[r.literacy]}
        {r.kind !== 'arrow' && ` · this species: ${LEVEL_WORDS[r.speciesLevel]}`}
      </div>
      <div class="card-buttons">
        {followable && (
          <button
            type="button"
            data-testid="follow"
            onClick={() => actions.follow(followingThis ? 0 : r.signId)}
          >
            {followingThis ? 'Stop following' : 'Follow'} <kbd>F</kbd>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            reading.value = null;
          }}
        >
          Close <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  );
}
