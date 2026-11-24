// Zero-backend persistence: one IndexedDB record per slot, plus JSON export and
// import so a journey can be backed up or moved between browsers.
import type { Individual, WeatherId } from '../data/types';

export const SAVE_VERSION = 1;

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  frame: boolean;
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  invertY: boolean;
  lineWeight: number;
}
export const DEFAULT_SETTINGS: Settings = { quality: 'high', frame: true, master: 0.8, music: 0.7, sfx: 0.9, sensitivity: 1, invertY: false, lineWeight: 1 };

export interface SaveData {
  version: number;
  savedAt: number;
  playTime: number;
  day: number;
  hour: number;
  weather: WeatherId;
  /** bonded creatures travelling with the player, in pack order */
  pack: Individual[];
  /** index of the inhabited pack member */
  active: number;
  /** bonded creatures resting at sanctuaries */
  roster: Individual[];
  pos: { x: number; y: number; z: number; yaw: number };
  seen: string[];
  bonded: string[];
  seals: string[];
  sites: string[];
  stones: string[];
  /** berry bushes already eaten today, keyed by position hash */
  foraged: string[];
  lastSanctuary: string;
  stats: { bonds: number; faints: number; steps: number; evolutions: number };
  settings: Settings;
}

const DB = 'sumirei';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function saveGame(data: SaveData, slot = 'slot0'): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, slot);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function loadGame(slot = 'slot0'): Promise<SaveData | null> {
  try {
    const db = await open();
    const data = await new Promise<SaveData | null>((res, rej) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(slot);
      r.onsuccess = () => res((r.result as SaveData) ?? null);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return data && validate(data) ? data : null;
  } catch {
    return null;
  }
}

export async function clearGame(slot = 'slot0'): Promise<void> {
  const db = await open();
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(slot);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
  db.close();
}

export function validate(d: unknown): d is SaveData {
  const s = d as SaveData;
  return !!s && typeof s === 'object' && s.version === SAVE_VERSION && Array.isArray(s.pack) && s.pack.length > 0 && Array.isArray(s.roster) && !!s.pos;
}

/** Download the save as a JSON file. */
export function exportSave(data: SaveData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sumirei-day${data.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Ask for a JSON file and parse it. Resolves null if cancelled or invalid. */
export function importSave(): Promise<SaveData | null> {
  return new Promise((res) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return res(null);
      try {
        const d = JSON.parse(await f.text());
        res(validate(d) ? d : null);
      } catch {
        res(null);
      }
    };
    inp.oncancel = () => res(null);
    inp.click();
  });
}
