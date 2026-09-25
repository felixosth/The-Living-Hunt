import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { serialize } from '../src/core/serialize';
import { type Migration, migrateState } from '../src/persistence/migrations';
import { decodeSave, encodeSave, SAVE_FORMAT, SaveError } from '../src/persistence/saveFile';
import { deleteSlot, listSlots, readSlot, writeSlot } from '../src/persistence/storage';
import { STATE_VERSION } from '../src/sim/state';
import { createWorld, stateHash, step } from '../src/sim/world';

async function gzipText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('save files', () => {
  it('round-trip the complete world state', async () => {
    const world = createWorld(9);
    step(world, [{ type: 'move', x: 1, y: 1, gait: 'run' }], 600);
    const bytes = await encodeSave(world);
    expect(bytes[0]).toBe(0x1f); // gzip magic number
    const loaded = await decodeSave(bytes);
    expect(loaded).toEqual(world);
    expect(stateHash(loaded)).toBe(stateHash(world));
  });

  it('reject files that are not saves', async () => {
    await expect(decodeSave(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(SaveError);
    await expect(decodeSave(await gzipText('not json'))).rejects.toThrow(/damaged/);
    await expect(decodeSave(await gzipText('{"format":"other"}'))).rejects.toThrow(/not a save/);
  });

  it('reject saves from a newer version of the game', async () => {
    const envelope = {
      format: SAVE_FORMAT,
      version: STATE_VERSION + 1,
      savedAt: '',
      state: createWorld(1),
    };
    await expect(decodeSave(await gzipText(serialize(envelope)))).rejects.toThrow(/newer version/);
  });

  it('reject saves with missing parts', async () => {
    const { player: _player, ...broken } = createWorld(1);
    const envelope = { format: SAVE_FORMAT, version: STATE_VERSION, savedAt: '', state: broken };
    await expect(decodeSave(await gzipText(serialize(envelope)))).rejects.toThrow(/missing/);
  });
});

describe('migrations', () => {
  const migrations: Record<number, Migration> = {
    1: (s) => ({ ...s, added: 'in v2' }),
    2: (s) => ({ ...s, renamed: s.added, added: undefined }),
  };

  it('upgrade old states step by step', () => {
    const out = migrateState({ original: true }, 1, 3, migrations);
    expect(out).toEqual({ original: true, renamed: 'in v2', added: undefined });
  });

  it('leave current states alone and fail on gaps', () => {
    expect(migrateState({ a: 1 }, 3, 3, migrations)).toEqual({ a: 1 });
    expect(() => migrateState({}, 0, 3, migrations)).toThrow(/No migration from save version 0/);
  });
});

describe('save slots (IndexedDB)', () => {
  it('store, list, read and delete saves', async () => {
    const world = createWorld(4);
    const bytes = await encodeSave(world);
    await writeSlot('quicksave', {
      bytes,
      savedAt: '2026-01-01T00:00:00.000Z',
      gameTime: world.time,
    });
    expect(await listSlots()).toContain('quicksave');
    const record = await readSlot('quicksave');
    expect(record?.gameTime).toBe(world.time);
    expect(await decodeSave(record?.bytes as Uint8Array)).toEqual(world);
    await deleteSlot('quicksave');
    expect(await readSlot('quicksave')).toBeUndefined();
  });
});

describe('save migrations', () => {
  it('upgrades an M0 (version 1) save by populating the forest', async () => {
    const world = createWorld(4);
    const v1 = {
      seed: world.seed,
      time: world.time + 3600,
      tick: 42,
      rng: world.rng,
      regionId: world.regionId,
      weather: world.weather,
      player: { ...world.player, x: world.player.x + 3 },
    };
    const envelope = { format: SAVE_FORMAT, version: 1, savedAt: '', state: v1 };
    const loaded = await decodeSave(await gzipText(serialize(envelope)));
    expect(loaded.time).toBe(v1.time);
    expect(loaded.tick).toBe(42);
    expect(loaded.player.x).toBe(v1.player.x);
    expect(loaded.animals.length).toBeGreaterThan(5);
    expect(() => step(loaded, [], 600)).not.toThrow();
  });
});
