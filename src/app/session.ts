/**
 * Owns the live world state on the browser side: queues player commands,
 * advances the simulation once per real-time tick, and keeps the previous and
 * current snapshots for interpolated rendering.
 */
import type { Command } from '../sim/commands';
import { makeSnapshot, type Snapshot } from '../sim/snapshot';
import type { WorldState } from '../sim/state';
import { type SimEvent, step } from '../sim/world';

/** Real-time length of one simulation tick (10 Hz). */
export const TICK_MS = 100;
/** Game seconds per tick at 1× (a game minute per real second). */
export const GAME_SECONDS_PER_TICK = 6;
/** Longest single step; faster time scales are split into several steps. */
export const MAX_STEP_SECONDS = 60;

export const TIME_SCALES = [1, 10, 60] as const;
export type TimeScale = (typeof TIME_SCALES)[number];

export class GameSession {
  state: WorldState;
  prev: Snapshot;
  curr: Snapshot;
  timeScale: TimeScale = 1;
  paused = false;
  /** Publish hidden animals and debug data in snapshots. */
  godView = false;
  private pending: Command[] = [];

  constructor(state: WorldState) {
    this.state = state;
    this.curr = this.snapshot();
    this.prev = this.curr;
  }

  enqueue(command: Command): void {
    this.pending.push(command);
  }

  /** Advance one real-time tick. Returns the events produced. */
  tick(): SimEvent[] {
    if (this.paused) {
      this.prev = this.curr;
      return [];
    }
    const commands = this.pending;
    this.pending = [];
    const events: SimEvent[] = [];
    let remaining = GAME_SECONDS_PER_TICK * this.timeScale;
    let first = true;
    while (remaining > 0) {
      const dt = Math.min(MAX_STEP_SECONDS, remaining);
      events.push(...step(this.state, first ? commands : [], dt));
      first = false;
      remaining -= dt;
    }
    this.prev = this.curr;
    this.curr = this.snapshot();
    return events;
  }

  /** Swap in a different world (new game or loaded save). */
  replaceState(state: WorldState): void {
    this.state = state;
    this.pending = [];
    this.curr = this.snapshot();
    this.prev = this.curr;
  }

  snapshot(): Snapshot {
    return makeSnapshot(this.state, { godView: this.godView });
  }
}
