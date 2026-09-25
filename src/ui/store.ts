/** UI state as signals. The app writes them; components read them. */
import { signal } from '@preact/signals';
import type { TimeScale } from '../app/session';
import type { ForcedWeather } from '../sim/debugWeather';
import type { MissReview } from '../sim/events';
import type { KnowledgeArea } from '../sim/knowledge';
import type { Reading } from '../sim/reading';
import { MAX_RELEASE_LEAD_S } from '../sim/shot';
import type { Snapshot } from '../sim/snapshot';
import type { HuntSummary } from '../sim/state';

export interface GameActions {
  setTimeScale(scale: TimeScale): void;
  togglePause(): void;
  quicksave(): Promise<void>;
  quickload(): Promise<void>;
  exportSave(): Promise<void>;
  importSave(file: File): Promise<void>;
  newWorld(seed: number): void;
  stateHash(): string;
  inspect(signId: number): void;
  /** Follow the trail from a sign; 0 stops following. */
  follow(signId: number): void;
  draw(target: number): void;
  aim(u: number, v: number): void;
  breath(hold: boolean): void;
  release(): void;
  lower(): void;
  interact(): void;
  /** A soft bleat to stop a walking deer. */
  bleat(): void;
  /** Debug: set a skill to a level (0–4). */
  setSkill(area: KnowledgeArea, key: string, level: number): void;
  /** Debug: force the weather for the next hours. */
  forceWeather(kind: ForcedWeather): void;
  /** Debug: let game hours pass at once. */
  skipHours(hours: number): void;
}

export interface Perf {
  fps: number;
  frameMs: number;
  /** Average simulation time per tick, in ms. */
  tickMs: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export const snapshot = signal<Snapshot | null>(null);

/** How long the shot inset shows where a missed arrow went, ms. */
export const MISS_REVIEW_MS = 3500;

/** The last missed arrow and when (performance.now()), for the shot inset to review. */
export const lastMiss = signal<{ review: MissReview; at: number } | null>(null);

/** When the current snapshot arrived (performance.now()). */
export const snapshotClock = { at: 0 };

/**
 * Real seconds since the last tick, so time-driven drawings like the bow's
 * drift can run smoothly between ticks. Capped, so they stop when paused.
 */
export function sinceTick(): number {
  return Math.min(MAX_RELEASE_LEAD_S, Math.max(0, (performance.now() - snapshotClock.at) / 1000));
}
export const perf = signal<Perf>({ fps: 0, frameMs: 0, tickMs: 0 });
export const controls = signal<{ timeScale: TimeScale; paused: boolean; sneakToggled: boolean }>({
  timeScale: 1,
  paused: false,
  sneakToggled: false,
});
export const debugOpen = signal(false);
/** Debug overlay: every animal, sign, scent cone and noise radius. */
export const godView = signal(false);
export const toast = signal<Toast | null>(null);
/** The last sign reading, shown as a journal card until closed. */
export const reading = signal<Reading | null>(null);
export const journalOpen = signal(false);
export const helpOpen = signal(false);
export const introOpen = signal(true);
/** The summary of the hunt just brought home. */
export const summary = signal<HuntSummary | null>(null);

let toastId = 0;
export function showToast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId;
  toast.value = { id, text, kind };
  setTimeout(
    () => {
      if (toast.value?.id === id) toast.value = null;
    },
    kind === 'error' ? 6000 : 2500,
  );
}

export interface Notice {
  id: number;
  text: string;
}

/** Things the player hears or notices, newest last. */
export const notices = signal<Notice[]>([]);

let noticeId = 0;
export function addNotice(text: string): void {
  const id = ++noticeId;
  notices.value = [...notices.value.slice(-3), { id, text }];
  setTimeout(() => {
    notices.value = notices.value.filter((n) => n.id !== id);
  }, 8000);
}
