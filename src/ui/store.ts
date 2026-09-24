/** UI state as signals. The app writes them; components read them. */
import { signal } from '@preact/signals';
import type { TimeScale } from '../app/session';
import type { Snapshot } from '../sim/snapshot';

export interface GameActions {
  setTimeScale(scale: TimeScale): void;
  togglePause(): void;
  quicksave(): Promise<void>;
  quickload(): Promise<void>;
  exportSave(): Promise<void>;
  importSave(file: File): Promise<void>;
  newWorld(seed: number): void;
  stateHash(): string;
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
export const perf = signal<Perf>({ fps: 0, frameMs: 0, tickMs: 0 });
export const controls = signal<{ timeScale: TimeScale; paused: boolean; sneakToggled: boolean }>({
  timeScale: 1,
  paused: false,
  sneakToggled: false,
});
export const debugOpen = signal(false);
export const toast = signal<Toast | null>(null);

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
