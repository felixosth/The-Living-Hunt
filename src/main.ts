import './ui/styles.css';
import { effect } from '@preact/signals';
import { Input } from './app/input';
import { startLoop } from './app/loop';
import { GameSession, TICK_MS } from './app/session';
import { formatClock, formatDate } from './core/time';
import { decodeSave, encodeSave } from './persistence/saveFile';
import { downloadSaveFile, readFileBytes, readSlot, writeSlot } from './persistence/storage';
import { Renderer } from './render/renderer';
import { getRegionMap } from './sim/region';
import type { WorldState } from './sim/state';
import { createWorld, stateHash } from './sim/world';
import { mountUi } from './ui/App';
import {
  controls,
  debugOpen,
  type GameActions,
  godView,
  perf,
  showToast,
  snapshot,
} from './ui/store';

const QUICKSAVE_SLOT = 'quicksave';

function seedFromUrl(): number {
  const raw = new URLSearchParams(location.search).get('seed');
  const seed = raw === null ? 1 : Number(raw);
  return Number.isInteger(seed) && seed >= 0 ? seed : 1;
}

async function boot(): Promise<void> {
  const stage = document.getElementById('stage') as HTMLElement;
  const uiRoot = document.getElementById('ui') as HTMLElement;

  const session = new GameSession(createWorld(seedFromUrl()));
  const renderer = await Renderer.create(stage);
  const input = new Input(window);

  const showWorld = (state: WorldState) => {
    session.replaceState(state);
    renderer.setRegion(getRegionMap(state.seed, state.regionId), state.seed);
    input.resync();
    snapshot.value = session.curr;
  };
  showWorld(session.state);

  const syncControls = () => {
    controls.value = {
      timeScale: session.timeScale,
      paused: session.paused,
      sneakToggled: input.sneakToggled,
    };
  };

  const loadBytes = async (bytes: Uint8Array, source: string) => {
    const state = await decodeSave(bytes);
    showWorld(state);
    showToast(`Loaded ${source} — ${formatDate(state.time)}, ${formatClock(state.time)}`);
  };

  const guarded =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      try {
        await fn(...args);
      } catch (err) {
        console.error(err);
        showToast((err as Error).message, 'error');
      }
    };

  const actions: GameActions = {
    setTimeScale(scale) {
      session.timeScale = scale;
      session.paused = false;
      syncControls();
    },
    togglePause() {
      session.paused = !session.paused;
      syncControls();
    },
    quicksave: guarded(async () => {
      const bytes = await encodeSave(session.state);
      await writeSlot(QUICKSAVE_SLOT, {
        bytes,
        savedAt: new Date().toISOString(),
        gameTime: session.state.time,
      });
      showToast(`Saved — ${formatDate(session.state.time)}, ${formatClock(session.state.time)}`);
    }),
    quickload: guarded(async () => {
      const record = await readSlot(QUICKSAVE_SLOT);
      if (!record) throw new Error('No quicksave yet.');
      await loadBytes(record.bytes, 'quicksave');
    }),
    exportSave: guarded(async () => {
      const bytes = await encodeSave(session.state);
      downloadSaveFile(
        bytes,
        `living-hunt-seed${session.state.seed}-tick${session.state.tick}.lhsave`,
      );
    }),
    importSave: guarded(async (file: File) => {
      await loadBytes(await readFileBytes(file), file.name);
    }),
    newWorld(seed) {
      showWorld(createWorld(seed));
      showToast(`New world — seed ${seed}`);
    },
    stateHash: () => stateHash(session.state),
  };

  mountUi(uiRoot, actions);
  effect(() => renderer.setGodView(godView.value));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote' && !e.repeat) debugOpen.value = !debugOpen.value;
  });
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      renderer.zoomBy(Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );

  // Perf counters, published twice a second.
  let frames = 0;
  let frameMsSum = 0;
  let tickMsSum = 0;
  let ticks = 0;
  let windowStart = performance.now();

  startLoop(TICK_MS, {
    tick() {
      const command = input.poll();
      if (command) session.enqueue(command);
      const t0 = performance.now();
      session.tick();
      tickMsSum += performance.now() - t0;
      ticks++;
      snapshot.value = session.curr;
      if (controls.value.sneakToggled !== input.sneakToggled) syncControls();
    },
    frame(alpha, frameMs) {
      renderer.render(session.prev, session.curr, alpha);
      frames++;
      frameMsSum += frameMs;
      const now = performance.now();
      if (now - windowStart >= 500) {
        perf.value = {
          fps: (frames * 1000) / (now - windowStart),
          frameMs: frameMsSum / Math.max(1, frames),
          tickMs: tickMsSum / Math.max(1, ticks),
        };
        frames = 0;
        frameMsSum = 0;
        tickMsSum = 0;
        ticks = 0;
        windowStart = now;
      }
    },
  });

  // Read-only hooks for debugging from the console and for browser tests.
  Object.assign(window, {
    livingHunt: { snapshot: () => session.curr, stateHash: () => stateHash(session.state) },
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = `The Living Hunt failed to start: ${(err as Error).message}`;
  document.body.appendChild(el);
});
