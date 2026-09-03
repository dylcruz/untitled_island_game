import { describe, expect, it } from 'vitest';
import { createGame } from '../game/simulation';
import {
  LocalSaveAdapter,
  SAVE_SCHEMA_VERSION,
  createSaveEnvelope,
  parseSaveEnvelope,
  serializeSave,
} from '../persistence';

describe('versioned local save boundary', () => {
  it('round trips the state, config, and every random stream', () => {
    const state = createGame('save-round-trip');
    const raw = serializeSave(state, '2026-09-02T00:00:00.000Z');
    const result = parseSaveEnvelope(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(result.envelope.savedAt).toBe('2026-09-02T00:00:00.000Z');
    expect(result.state).toEqual(state);
    expect(result.state.config).toEqual(state.config);
    expect(result.state.rngStates).toEqual(state.rngStates);
  });

  it.each([
    ['missing', null],
    ['malformed JSON', '{'],
    [
      'missing state',
      JSON.stringify(createSaveEnvelope(createGame('missing-state'))).replace(
        /"gameState":\{.*\}/,
        '',
      ),
    ],
  ])('rejects %s input', (_label, raw) => {
    expect(parseSaveEnvelope(raw)).toMatchObject({ ok: false });
  });

  it('rejects unsupported schema and incompatible rules', () => {
    const envelope = createSaveEnvelope(createGame('version-check'), '2026-09-02T00:00:00.000Z');
    expect(parseSaveEnvelope(JSON.stringify({ ...envelope, schemaVersion: 999 }))).toEqual({
      ok: false,
      reason: 'unsupported-schema',
    });
    expect(
      parseSaveEnvelope(JSON.stringify({ ...envelope, rulesVersion: 'future-rules' })),
    ).toEqual({ ok: false, reason: 'incompatible-rules' });
  });

  it('treats unavailable storage as a non-fatal result', () => {
    const adapter = new LocalSaveAdapter({ storage: undefined });
    expect(adapter.save(createGame('storage-free'))).toEqual({
      ok: false,
      reason: 'storage-unavailable',
    });
    expect(adapter.load()).toEqual({ ok: false, reason: 'storage-unavailable' });
    expect(adapter.clear()).toBe(false);
  });

  it('round trips through the guarded storage adapter and clears the checkpoint', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => values.get(key) ?? null,
      setItem: (key: string, value: string): void => {
        values.set(key, value);
      },
      removeItem: (key: string): void => {
        values.delete(key);
      },
    };
    const adapter = new LocalSaveAdapter({ storage });
    const state = createGame('adapter-round-trip');

    expect(adapter.save(state, '2026-09-02T00:00:00.000Z')).toEqual({ ok: true });
    expect(adapter.load()).toMatchObject({ ok: true, state });
    expect(adapter.clear()).toBe(true);
    expect(adapter.load()).toEqual({ ok: false, reason: 'missing' });
  });

  it('rejects unknown waypoint data and treats quota failures as non-fatal', () => {
    const state = createGame('invalid-content');
    const envelope = createSaveEnvelope(state, '2026-09-02T00:00:00.000Z');
    const malformed = {
      ...envelope,
      gameState: {
        ...envelope.gameState,
        survivors: envelope.gameState.survivors.map((survivor, index) =>
          index === 0 ? { ...survivor, currentWaypoint: 'unknown-location' } : survivor,
        ),
      },
    };
    expect(parseSaveEnvelope(JSON.stringify(malformed))).toEqual({
      ok: false,
      reason: 'invalid-envelope',
    });

    const quotaStorage = {
      getItem: (): string | null => null,
      setItem: (): never => {
        throw new Error('quota exceeded');
      },
      removeItem: (): void => undefined,
    };
    const adapter = new LocalSaveAdapter({ storage: quotaStorage });
    expect(adapter.save(state)).toEqual({ ok: false, reason: 'storage-write-failed' });
  });
});
