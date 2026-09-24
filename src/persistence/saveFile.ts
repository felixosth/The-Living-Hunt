/**
 * The save file format: a versioned envelope around WorldState, serialised
 * with typed-array support and gzip-compressed.
 */
import { RNG_STREAMS } from '../core/rng';
import { deserialize, serialize } from '../core/serialize';
import { STATE_VERSION, type WorldState } from '../sim/state';
import { migrateState } from './migrations';

export const SAVE_FORMAT = 'the-living-hunt/save';

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  version: number;
  /** Real-world time the save was made (ISO 8601). Metadata only. */
  savedAt: string;
  state: WorldState;
}

export class SaveError extends Error {
  override name = 'SaveError';
}

export async function encodeSave(state: WorldState, savedAt = new Date()): Promise<Uint8Array> {
  const envelope: SaveEnvelope = {
    format: SAVE_FORMAT,
    version: STATE_VERSION,
    savedAt: savedAt.toISOString(),
    state,
  };
  return gzip(new TextEncoder().encode(serialize(envelope)));
}

export async function decodeSave(bytes: Uint8Array): Promise<WorldState> {
  let text: string;
  try {
    text = new TextDecoder().decode(await gunzip(bytes));
  } catch {
    throw new SaveError('This file is not a compressed save.');
  }
  let envelope: Partial<SaveEnvelope>;
  try {
    envelope = deserialize<Partial<SaveEnvelope>>(text);
  } catch {
    throw new SaveError('The save file is damaged.');
  }
  if (envelope?.format !== SAVE_FORMAT || typeof envelope.version !== 'number') {
    throw new SaveError('This is not a save file for The Living Hunt.');
  }
  let state: Record<string, unknown>;
  try {
    state = migrateState(envelope.state as unknown as Record<string, unknown>, envelope.version);
  } catch (err) {
    throw new SaveError((err as Error).message);
  }
  assertWorldState(state);
  return state;
}

/** Cheap structural check so a corrupt save fails on load, not mid-game. */
export function assertWorldState(value: unknown): asserts value is WorldState {
  const s = value as Partial<WorldState> | null;
  const ok =
    typeof s === 'object' &&
    s !== null &&
    Number.isInteger(s.seed) &&
    Number.isInteger(s.time) &&
    Number.isInteger(s.tick) &&
    typeof s.regionId === 'string' &&
    typeof s.player === 'object' &&
    Number.isFinite(s.player?.x) &&
    Number.isFinite(s.player?.y) &&
    typeof s.weather === 'object' &&
    typeof s.rng === 'object' &&
    RNG_STREAMS.every((name) => Array.isArray(s.rng?.[name]) && s.rng[name].length === 4);
  if (!ok) throw new SaveError('The save file is missing parts of the world.');
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream('gzip'));
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream('gzip'));
}

async function pipe(bytes: Uint8Array, transform: GenericTransformStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
