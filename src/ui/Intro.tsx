import { introOpen } from './store';

/** The first thing you read: where you are and what to do. */
export function Intro() {
  if (!introOpen.value) return null;
  return (
    <div class="panel intro" data-testid="intro">
      <div class="card-title">Einar's cabin, Granåsen</div>
      <p class="card-line">
        Uncle Einar's journal is open on the table.{' '}
        <q>
          Roe deer bed in the thickets by day and come out to the meadows at dawn and dusk. They
          drink at the fords. Hares keep to the forest edges.
        </q>
      </p>
      <p class="card-line">
        <q>
          Read the ground before you go looking. Keep the wind in your face. Take only the shot you
          are sure of, and when you have hit, wait before you follow.
        </q>
      </p>
      <p class="card-meta">
        <kbd>C</kbd> crouch and keep still to study the ground · click a sign to read it ·{' '}
        <kbd>F</kbd> follow · hold right mouse on an animal to draw the bow · <kbd>H</kbd> all
        controls
      </p>
      <p class="card-meta">Press any key to begin.</p>
    </div>
  );
}
