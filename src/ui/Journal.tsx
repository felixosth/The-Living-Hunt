import { SPECIES } from '../content/species';
import { journalOpen, snapshot } from './store';

const SIGN_LABELS: Record<string, string> = {
  print: 'Prints',
  pellets: 'Droppings',
  bed: 'Beds',
  browse: 'Browse',
  blood: 'Blood',
};

function Bar({ level, progress }: { level: number; progress: number }) {
  return (
    <span class="know-bar" title={`Level ${level} of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          class="know-seg"
          style={{
            background: `linear-gradient(to right, var(--accent) ${
              i < level ? 100 : i === level ? Math.round(progress * 100) : 0
            }%, rgba(233, 224, 201, 0.12) 0)`,
          }}
        />
      ))}
    </span>
  );
}

/** What you know: a page per species and per kind of sign. */
export function Journal() {
  const s = snapshot.value;
  if (!journalOpen.value || !s) return null;
  const k = s.tracking.knowledge;
  return (
    <div class="panel journal" data-testid="journal">
      <div class="card-title">Journal: what you know</div>
      <div class="journal-section">Animals</div>
      {Object.entries(k.species).map(([id, v]) => (
        <div key={id} class="journal-row">
          <span>{SPECIES[id as keyof typeof SPECIES].name}</span>
          <Bar {...v} />
        </div>
      ))}
      <div class="journal-section">Reading sign</div>
      {Object.entries(k.signs)
        .filter(([id]) => id in SIGN_LABELS)
        .map(([id, v]) => (
          <div key={id} class="journal-row">
            <span>{SIGN_LABELS[id]}</span>
            <Bar {...v} />
          </div>
        ))}
      <p class="card-meta">
        Reading signs teaches a little. Seeing the animal whose trail you read teaches a lot.
      </p>
    </div>
  );
}
