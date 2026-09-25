import './ui/styles.css';
import { effect } from '@preact/signals';
import { Input } from './app/input';
import { startLoop } from './app/loop';
import { GameSession, TICK_MS } from './app/session';
import { bodyCentre } from './content/anatomy';
import { SPECIES } from './content/species';
import { hash32 } from './core/hash';
import { formatClock, formatDate } from './core/time';
import { decodeSave, encodeSave } from './persistence/saveFile';
import { downloadSaveFile, readFileBytes, readSlot, writeSlot } from './persistence/storage';
import { Renderer } from './render/renderer';
import type { SimEvent } from './sim/events';
import { getRegionMap } from './sim/region';
import { BOW_RANGE_M } from './sim/shot';
import type { WorldState } from './sim/state';
import { INSPECT_RANGE_M } from './sim/tracking';
import { createWorld, stateHash } from './sim/world';
import { mountUi } from './ui/App';
import { describeLearning, describeSound } from './ui/describe';
import {
  addNotice,
  controls,
  debugOpen,
  type GameActions,
  godView,
  helpOpen,
  introOpen,
  journalOpen,
  perf,
  reading,
  showToast,
  snapshot,
  summary,
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
    inspect: (signId) => session.enqueue({ type: 'inspect', signId }),
    follow: (signId) => session.enqueue({ type: 'follow', signId }),
    draw(target) {
      // Shooting happens in real time.
      if (session.timeScale !== 1) actions.setTimeScale(1);
      session.enqueue({ type: 'draw', target });
    },
    aim(u, v) {
      // Only the latest aim matters; it is sent once per tick.
      pendingAim = { u, v };
    },
    breath: (hold) => session.enqueue({ type: 'breath', hold }),
    release() {
      flushAim();
      session.enqueue({ type: 'release' });
      input.resync();
    },
    lower() {
      session.enqueue({ type: 'lower' });
      input.resync();
    },
    interact: () => session.enqueue({ type: 'interact' }),
  };

  let pendingAim: { u: number; v: number } | null = null;
  const flushAim = () => {
    if (pendingAim) session.enqueue({ type: 'aim', ...pendingAim });
    pendingAim = null;
  };

  mountUi(uiRoot, actions);
  effect(() => {
    renderer.setGodView(godView.value);
    session.godView = godView.value;
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    if (introOpen.value) {
      introOpen.value = false;
      return;
    }
    if (e.code === 'Backquote') debugOpen.value = !debugOpen.value;
    // T: wait (10×), again for normal speed. P: pause.
    if (e.code === 'KeyT') actions.setTimeScale(session.timeScale === 1 || session.paused ? 10 : 1);
    if (e.code === 'KeyP') actions.togglePause();
    if (e.code === 'KeyE') actions.interact();
    if (e.code === 'Space' && session.curr.bow) {
      e.preventDefault();
      actions.breath(true);
    }
    if (e.code === 'KeyJ') journalOpen.value = !journalOpen.value;
    if (e.code === 'KeyH') helpOpen.value = !helpOpen.value;
    if (e.code === 'KeyF') {
      const r = reading.value;
      const following = session.curr.tracking.following;
      if (following) actions.follow(0);
      else if (r) actions.follow(r.signId);
    }
    if (e.code === 'Escape') {
      if (session.curr.bow) actions.lower();
      else if (summary.value) summary.value = null;
      else if (helpOpen.value) helpOpen.value = false;
      else if (journalOpen.value) journalOpen.value = false;
      else if (reading.value) reading.value = null;
      else if (session.curr.tracking.following) actions.follow(0);
    }
  });
  // Pointing at found signs: hover highlights, click reads.
  const signUnder = (e: MouseEvent) => {
    const at = renderer.screenToWorld(e.clientX, e.clientY);
    const reach = Math.max(1.2, renderer.metresPerPixel(14));
    let best: { id: number; x: number; y: number } | null = null;
    let bestD = reach;
    for (const sign of session.curr.signs) {
      const d = Math.hypot(sign.x - at.x, sign.y - at.y);
      if (d < bestD) {
        bestD = d;
        best = sign;
      }
    }
    return best;
  };
  stage.addEventListener('mousemove', (e) => {
    const sign = signUnder(e);
    renderer.setHoverSign(sign?.id ?? 0);
    stage.style.cursor = sign ? 'pointer' : '';
  });
  // The bow: hold the right button on an animal to draw, move the mouse to aim, left click to shoot.
  let aimLocal = { u: 0, v: 0 };
  const animalUnder = (e: MouseEvent) => {
    const at = renderer.screenToWorld(e.clientX, e.clientY);
    const reach = Math.max(4, renderer.metresPerPixel(24));
    let best: number | null = null;
    let bestD = reach;
    for (const a of session.curr.animals) {
      if (!a.seen || a.activity === 'dead') continue;
      const d = Math.hypot(a.x - at.x, a.y - at.y);
      if (d < bestD) {
        bestD = d;
        best = a.id;
      }
    }
    return best;
  };
  const startDraw = (e: MouseEvent) => {
    const p = session.curr.player;
    if (p.carrying) {
      addNotice('Put down what you are carrying first (E).');
      return;
    }
    if (p.arrows <= 0) {
      addNotice('Your quiver is empty.');
      return;
    }
    const target = animalUnder(e);
    if (target === null) {
      addNotice('Nothing to draw on there. Point at an animal you can see.');
      return;
    }
    const a = session.curr.animals.find((x) => x.id === target);
    if (a && Math.hypot(a.x - p.x, a.y - p.y) > BOW_RANGE_M) {
      addNotice(`Too far for a bow shot (${Math.round(Math.hypot(a.x - p.x, a.y - p.y))} m).`);
      return;
    }
    aimLocal = a ? bodyCentre(a.species) : { u: 0, v: 0.5 };
    actions.draw(target);
  };
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  stage.addEventListener('mousedown', () => {
    introOpen.value = false;
  });
  stage.addEventListener('mousedown', (e) => {
    if (e.button === 2) startDraw(e);
    else if (e.button === 0 && session.curr.bow) actions.release();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && session.curr.bow) actions.breath(false);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2 && session.curr.bow) actions.lower();
  });
  window.addEventListener('mousemove', (e) => renderer.setPointer({ x: e.clientX, y: e.clientY }));
  document.addEventListener('mouseleave', () => renderer.setPointer(null));
  window.addEventListener('mousemove', (e) => {
    const bow = session.curr.bow;
    if (!bow) return;
    // Relative mouse movement nudges the aim across the side view.
    const metresPerPx = bow.species === 'hare' ? 0.0022 : 0.0045;
    aimLocal = {
      u: Math.max(-1.5, Math.min(1.5, aimLocal.u + e.movementX * metresPerPx)),
      v: Math.max(0, Math.min(1.6, aimLocal.v - e.movementY * metresPerPx)),
    };
    actions.aim(aimLocal.u, aimLocal.v);
  });

  stage.addEventListener('click', (e) => {
    if (session.curr.bow) return;
    const sign = signUnder(e);
    if (!sign) return;
    const p = session.curr.player;
    if (Math.hypot(sign.x - p.x, sign.y - p.y) > INSPECT_RANGE_M) {
      addNotice('Too far away to read. Get closer.');
      return;
    }
    actions.inspect(sign.id);
  });
  stage.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      renderer.zoomBy(Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );

  /** The direction a sound seems to come from: roughly right, never exact. */
  function heardFrom(
    event: Extract<SimEvent, { type: 'sound' }>,
    p: { x: number; y: number },
  ): number {
    const blur =
      ((hash32(Math.round(event.x), Math.round(event.y), event.time) % 1000) / 1000 - 0.5) * 0.5;
    return Math.atan2(event.y - p.y, event.x - p.x) + blur;
  }

  function describeTracking(event: SimEvent): void {
    switch (event.type) {
      case 'inspected':
        reading.value = event.reading;
        return;
      case 'learned':
        addNotice(describeLearning(event.area, event.key, event.level));
        return;
      case 'confirmed':
        addNotice(`There it is: the ${SPECIES[event.species].name} whose sign you read.`);
        return;
      case 'trailLost':
        addNotice('You have lost the trail. Crouch (C), keep still and look around to pick it up.');
        return;
      case 'trailFound':
        addNotice('You pick up the trail again.');
        return;
      case 'shot':
        addNotice(
          event.dropped
            ? 'The arrow strikes. It drops on the spot.'
            : event.hit
              ? 'Thwack. The arrow strikes home.'
              : 'The arrow flies wide.',
        );
        return;
      case 'died':
        if (event.seen) addNotice(`The ${SPECIES[event.species].name} stumbles and goes down.`);
        return;
      case 'dressed':
        showToast(
          `Field-dressed: ${event.liveWeightKg.toFixed(1)} kg live.${event.arrowBack ? ' You get your arrow back.' : ''}`,
        );
        return;
      case 'pickedUp':
        showToast(
          event.what === 'arrow'
            ? 'You pick up your arrow.'
            : `You shoulder the ${SPECIES[event.species ?? 'roe'].name} (${(event.weightKg ?? 0).toFixed(1)} kg).`,
        );
        return;
      case 'dropped':
        showToast(`You put the ${SPECIES[event.species].name} down.`);
        return;
      case 'tooHeavy':
        showToast(`Too heavy to carry: ${event.weightKg.toFixed(1)} kg.`);
        return;
      case 'delivered':
        summary.value = event.summary;
        return;
    }
  }

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
      flushAim();
      const t0 = performance.now();
      const events = session.tick();
      let stirred = false;
      for (const event of events) {
        if (event.type === 'sound') {
          addNotice(describeSound(event, session.curr.player.x, session.curr.player.y));
          renderer.addSound(event.kind, heardFrom(event, session.curr.player));
          stirred = true;
        } else if (event.type === 'sighted') {
          stirred = true;
        } else {
          if (event.type === 'shot') renderer.addArrow(event);
          describeTracking(event);
        }
      }
      // Waiting stops as soon as something is seen or heard.
      if (stirred && session.timeScale > 1) actions.setTimeScale(1);
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
    livingHunt: {
      snapshot: () => session.curr,
      stateHash: () => stateHash(session.state),
      /** Developer tool: jump to a point in metres. */
      teleport: (x: number, y: number) => session.enqueue({ type: 'teleport', x, y }),
      /** Developer tool: where a world point (metres) is on screen right now. */
      toScreen: (x: number, y: number) => renderer.worldToScreen(x, y),
    },
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  const el = document.createElement('div');
  el.className = 'fatal';
  el.textContent = `The Living Hunt failed to start: ${(err as Error).message}`;
  document.body.appendChild(el);
});
