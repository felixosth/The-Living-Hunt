/**
 * Save slots in IndexedDB (via idb-keyval), plus export/import to files.
 */
import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval';

export interface SlotRecord {
  bytes: Uint8Array;
  /** Real-world time of saving (ISO 8601). */
  savedAt: string;
  /** Game time at saving, for display without decompressing. */
  gameTime: number;
}

let store: UseStore | undefined;
// Created lazily so importing this module never touches IndexedDB.
function saves(): UseStore {
  store ??= createStore('the-living-hunt', 'saves');
  return store;
}

export async function writeSlot(slot: string, record: SlotRecord): Promise<void> {
  await set(slot, record, saves());
}

export async function readSlot(slot: string): Promise<SlotRecord | undefined> {
  return get<SlotRecord>(slot, saves());
}

export async function listSlots(): Promise<string[]> {
  return (await keys(saves())).map(String).sort();
}

export async function deleteSlot(slot: string): Promise<void> {
  await del(slot, saves());
}

/** Offer save bytes to the player as a downloadable file. */
export function downloadSaveFile(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/gzip' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}
