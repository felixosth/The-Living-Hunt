/**
 * The player's side of signs: noticing obvious ones in passing, scanning for
 * subtle ones, reading them, following a trail, and learning by confirmation.
 */
import { chance, type RngState } from '../core/rng';
import type { SimEvent } from './events';
import { learn, lesson, level } from './knowledge';
import { readSign } from './reading';
import type { RegionMap } from './region';
import {
  clearFlag,
  findSign,
  SIGN_KIND_NAMES,
  SignFlag,
  SignKind,
  type SignStore,
  setFlag,
  signAt,
} from './signs';
import type { PlayerState, WorldState } from './state';

/** How long a scan takes, in game seconds. */
export const SCAN_SECONDS = 30;
export const SCAN_RADIUS_M = 12;
/** How close you must be to read a sign. */
export const INSPECT_RANGE_M = 6;
/** How far ahead the next signs of a followed trail can show up. */
export const FOLLOW_RANGE_M = 25;
/** Readings are confirmed by seeing the animal within this long of reading its sign. */
const CONFIRM_WINDOW = 12 * 3600;

/** How easy each kind of sign is to spot when scanning. */
const SCAN_EASE: Record<number, number> = {
  [SignKind.Print]: 0.9,
  [SignKind.Pellets]: 0.8,
  [SignKind.Bed]: 0.95,
  [SignKind.Browse]: 0.6,
  [SignKind.Blood]: 1,
  [SignKind.Arrow]: 1,
};

export function startScan(player: PlayerState, now: number): void {
  if (player.busy) return;
  player.busy = 'scan';
  player.busyUntil = now + SCAN_SECONDS;
}

/** Search the ground around the player; each sign is found with a chance. */
function completeScan(state: WorldState, light: number, events: SimEvent[]): void {
  const { player, signs } = state;
  const rng = state.rng.signs;
  const eyes = 0.35 + 0.65 * light;
  let found = 0;
  for (let i = 0; i < signs.count; i++) {
    if ((signs.flags[i] as number) & SignFlag.Noticed) continue;
    const d = Math.hypot((signs.x[i] as number) - player.x, (signs.y[i] as number) - player.y);
    if (d > SCAN_RADIUS_M) continue;
    const kind = signs.kind[i] as number;
    const literacy = level(player.knowledge.signs[SIGN_KIND_NAMES[kind] as 'print']);
    const p =
      (signs.integrity[i] as number) *
      (SCAN_EASE[kind] ?? 0.8) *
      eyes *
      (0.55 + 0.12 * literacy) *
      (1 - (0.5 * d) / SCAN_RADIUS_M);
    if (chance(rng, Math.min(1, p))) {
      setFlag(signs, i, SignFlag.Noticed);
      found++;
      // A scan can pick up a trail you're following further along.
      const f = player.follow;
      if (f && signs.animal[i] === f.animal && (signs.t[i] as number) > f.lastT) {
        advanceFollow(player, signs, i, events);
      }
    }
  }
  events.push({ type: 'scanned', found });
}

/** Read a sign: returns an event with the reading, and teaches a little. */
export function inspect(state: WorldState, signId: number, events: SimEvent[]): void {
  const { player, signs } = state;
  const i = findSign(signs, signId);
  if (i < 0 || !((signs.flags[i] as number) & SignFlag.Noticed)) return;
  const sign = signAt(signs, i);
  if (Math.hypot(sign.x - player.x, sign.y - player.y) > INSPECT_RANGE_M) return;
  const previous = player.read[String(sign.animal)];
  const reading = readSign(sign, player.knowledge, state.time, {
    sameAnimalAsBefore: previous !== undefined && sign.kind !== SignKind.Arrow,
  });
  events.push({ type: 'inspected', reading });
  if (sign.kind === SignKind.Arrow) return;
  if (!((signs.flags[i] as number) & SignFlag.Inspected)) {
    const k = player.knowledge;
    learn(k, 'signs', sign.kindName, lesson(0.12, k.signs[sign.kindName]), events);
    learn(k, 'species', sign.species, lesson(0.05, k.species[sign.species]), events);
    setFlag(signs, i, SignFlag.Inspected);
  }
  player.read[String(sign.animal)] = { at: state.time, confirmed: previous?.confirmed ?? 0 };
}

/** Start (or, with 0, stop) following the trail of the animal that made a sign. */
export function follow(state: WorldState, signId: number): void {
  const { player, signs } = state;
  clearFlag(signs, SignFlag.Followed);
  player.follow = null;
  if (signId === 0) return;
  const i = findSign(signs, signId);
  if (i < 0 || !((signs.flags[i] as number) & SignFlag.Noticed)) return;
  const kind = signs.kind[i] as number;
  if (kind === SignKind.Arrow) return;
  player.follow = {
    animal: signs.animal[i] as number,
    lastT: signs.t[i] as number,
    x: signs.x[i] as number,
    y: signs.y[i] as number,
    lost: false,
  };
  setFlag(signs, i, SignFlag.Followed);
}

function advanceFollow(player: PlayerState, signs: SignStore, i: number, events: SimEvent[]): void {
  const f = player.follow;
  if (!f) return;
  f.lastT = signs.t[i] as number;
  f.x = signs.x[i] as number;
  f.y = signs.y[i] as number;
  setFlag(signs, i, SignFlag.Noticed | SignFlag.Followed);
  if (f.lost) {
    f.lost = false;
    events.push({ type: 'trailFound' });
  }
}

/** Kinds of sign that make up a trail. */
function isTrailSign(kind: number): boolean {
  return kind === SignKind.Print || kind === SignKind.Blood || kind === SignKind.Bed;
}

/**
 * Following: as you walk, the next signs of the animal within reach show up,
 * each with a chance set by how clear it is and how well you read that kind.
 */
function updateFollow(
  player: PlayerState,
  signs: SignStore,
  rng: RngState,
  dt: number,
  light: number,
  events: SimEvent[],
): void {
  const f = player.follow;
  if (!f) return;
  const moving = player.moveX !== 0 || player.moveY !== 0;
  const pace = moving && player.gait === 'run' ? 0.25 : 1;
  for (let round = 0; round < 3; round++) {
    // The next few signs of this animal, in time order.
    const next: number[] = [];
    for (let i = 0; i < signs.count; i++) {
      if (signs.animal[i] !== f.animal || (signs.t[i] as number) <= f.lastT) continue;
      if (!isTrailSign(signs.kind[i] as number)) continue;
      next.push(i);
    }
    if (next.length === 0) return;
    next.sort((a, b) => (signs.t[a] as number) - (signs.t[b] as number));
    let advanced = false;
    for (const i of next.slice(0, 4)) {
      const d = Math.hypot((signs.x[i] as number) - player.x, (signs.y[i] as number) - player.y);
      if (d > FOLLOW_RANGE_M) continue;
      const literacy = level(
        player.knowledge.signs[SIGN_KIND_NAMES[signs.kind[i] as number] as 'print'],
      );
      const p =
        (signs.integrity[i] as number) *
        (0.45 + 0.13 * literacy) *
        (0.4 + 0.6 * light) *
        pace *
        Math.min(1, dt / 6);
      if (chance(rng, Math.min(1, p))) {
        advanceFollow(player, signs, i, events);
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  if (!f.lost && Math.hypot(f.x - player.x, f.y - player.y) > FOLLOW_RANGE_M) {
    f.lost = true;
    events.push({ type: 'trailLost' });
  }
}

/** Obvious signs close by are noticed without a scan: fresh prints in mud, blood, arrows. */
function noticeObvious(state: WorldState): void {
  const { player, signs } = state;
  if (player.gait === 'run' && (player.moveX !== 0 || player.moveY !== 0)) return;
  const { x: xs, y: ys, flags, kind: kinds, integrity: integrities } = signs;
  const px = player.x;
  const py = player.y;
  for (let i = 0; i < signs.count; i++) {
    // Cheap rejections first: this runs over every sign each step.
    const dx = (xs[i] as number) - px;
    if (dx > 6 || dx < -6) continue;
    const dy = (ys[i] as number) - py;
    if (dy > 6 || dy < -6) continue;
    if ((flags[i] as number) & SignFlag.Noticed) continue;
    const kind = kinds[i] as number;
    const integrity = integrities[i] as number;
    const obvious =
      kind === SignKind.Arrow ||
      (kind === SignKind.Blood && integrity > 0.25) ||
      (kind === SignKind.Print && integrity > 0.8) ||
      (kind === SignKind.Bed && integrity > 0.7);
    if (!obvious) continue;
    const reach = kind === SignKind.Bed ? 4 : 6;
    if (dx * dx + dy * dy <= reach * reach) setFlag(signs, i, SignFlag.Noticed);
  }
}

/** Per-step tracking update, after the player has moved. */
export function updateTracking(
  state: WorldState,
  _map: RegionMap,
  dt: number,
  light: number,
  events: SimEvent[],
): void {
  const { player } = state;
  if (player.busy === 'scan' && state.time + dt >= player.busyUntil) {
    player.busy = null;
    completeScan(state, light, events);
  }
  noticeObvious(state);
  updateFollow(player, state.signs, state.rng.signs, dt, light, events);
}

/** Seeing an animal whose sign you read recently confirms the reading, which teaches a lot. */
export function confirmSightings(state: WorldState, events: SimEvent[]): void {
  const { player } = state;
  const sightings = events.filter((e) => e.type === 'sighted');
  for (const e of sightings) {
    const read = player.read[String(e.animalId)];
    if (!read || state.time - read.at > CONFIRM_WINDOW || read.confirmed >= read.at) continue;
    read.confirmed = state.time;
    const k = player.knowledge;
    events.push({ type: 'confirmed', animalId: e.animalId, species: e.species });
    learn(k, 'species', e.species, lesson(0.45, k.species[e.species]), events);
    learn(k, 'signs', 'print', lesson(0.3, k.signs.print), events);
  }
}
