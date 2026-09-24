/**
 * Fixed-timestep game loop: the simulation ticks at a fixed real-time rate,
 * rendering runs every animation frame and interpolates between ticks.
 */

export interface LoopHandlers {
  /** Called once per fixed tick. */
  tick(): void;
  /** Called every frame; `alpha` is progress (0..1) from the previous tick to the current one. */
  frame(alpha: number, frameMs: number): void;
}

/** Cap on catch-up after the tab was hidden, to avoid a burst of ticks. */
const MAX_FRAME_MS = 250;

export function startLoop(tickMs: number, handlers: LoopHandlers): () => void {
  let last = performance.now();
  let accumulator = 0;
  let handle = 0;

  const frame = (now: number) => {
    const elapsed = Math.min(now - last, MAX_FRAME_MS);
    last = now;
    accumulator += elapsed;
    while (accumulator >= tickMs) {
      handlers.tick();
      accumulator -= tickMs;
    }
    handlers.frame(accumulator / tickMs, elapsed);
    handle = requestAnimationFrame(frame);
  };
  handle = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(handle);
}
