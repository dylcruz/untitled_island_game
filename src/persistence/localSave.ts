import type { GameState } from '../game/types';
import {
  isSavePayloadWithinLimit,
  parseSaveEnvelope,
  SAVE_STORAGE_KEY,
  serializeSave,
  type SaveParseResult,
} from './saveSchema';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveWriteSuccess {
  ok: true;
}

export interface SaveWriteFailure {
  ok: false;
  reason: 'payload-too-large' | 'storage-unavailable' | 'storage-write-failed';
}

export type SaveWriteResult = SaveWriteSuccess | SaveWriteFailure;

export interface LocalSaveOptions {
  storage?: StorageLike;
  key?: string;
  rulesVersion?: string;
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Guarded localStorage boundary. The simulation core never imports this
 * adapter, and storage errors are deliberately non-fatal to a running game.
 */
export class LocalSaveAdapter {
  private readonly storage: StorageLike | undefined;

  private readonly key: string;

  private readonly rulesVersion: string | undefined;

  public constructor(options: LocalSaveOptions = {}) {
    this.storage = options.storage ?? browserStorage();
    this.key = options.key ?? SAVE_STORAGE_KEY;
    this.rulesVersion = options.rulesVersion;
  }

  public save(state: GameState, savedAt?: string): SaveWriteResult {
    if (!this.storage) return { ok: false, reason: 'storage-unavailable' };
    try {
      const raw = serializeSave(state, savedAt);
      if (!isSavePayloadWithinLimit(raw)) return { ok: false, reason: 'payload-too-large' };
      this.storage.setItem(this.key, raw);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'storage-write-failed' };
    }
  }

  public load(): SaveParseResult {
    if (!this.storage) return { ok: false, reason: 'storage-unavailable' };
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return { ok: false, reason: 'storage-unavailable' };
    }
    return parseSaveEnvelope(raw, this.rulesVersion);
  }

  public clear(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.removeItem(this.key);
      return true;
    } catch {
      return false;
    }
  }
}

export function createLocalSaveAdapter(options: LocalSaveOptions = {}): LocalSaveAdapter {
  return new LocalSaveAdapter(options);
}
