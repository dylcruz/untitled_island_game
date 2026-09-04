import { describe, expect, it } from 'vitest';
import { applyCommand, createGame } from '../game/simulation';
import type { GameState } from '../game/types';
import {
  LocalSaveAdapter,
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  SLICE_SAVE_STORAGE_KEY,
  createSaveEnvelope,
  parseSaveEnvelope,
  serializeSave,
  type SaveEnvelope,
} from '../persistence';

function clonedEnvelope(mode: 'production' | 'slice' = 'production'): SaveEnvelope {
  return JSON.parse(
    JSON.stringify(
      createSaveEnvelope(
        createGame({ mode, seed: `persistence-${mode}` }),
        '2026-09-02T00:00:00.000Z',
      ),
    ),
  ) as SaveEnvelope;
}

function parseMutatedState(
  mutator: (state: GameState) => void,
): ReturnType<typeof parseSaveEnvelope> {
  const envelope = clonedEnvelope();
  mutator(envelope.gameState);
  return parseSaveEnvelope(JSON.stringify(envelope));
}

function activeEventState(
  eventId: 'water-dispute' | 'forager-instinct',
  participantIds: string[],
): GameState {
  const state = createGame(`active-${eventId}`);
  state.reservations = [];
  for (const survivor of state.survivors) survivor.activeTask = null;
  state.clock.tick = 100;
  state.eventSchedule.nextEventTick = null;
  state.status = 'decision';
  state.activeEvent = {
    id: eventId,
    activatedTick: state.clock.tick,
    participantIds,
    chosenChoiceId: null,
    result: null,
  };
  return state;
}

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

  it('round trips the internal slice under its separate save key', () => {
    const state = createGame({ mode: 'slice', seed: 'slice-save-round-trip' });
    const raw = serializeSave(state, '2026-09-02T00:00:00.000Z');
    const result = parseSaveEnvelope(raw);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toEqual(state);

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
    const adapter = new LocalSaveAdapter({ storage, key: SLICE_SAVE_STORAGE_KEY });
    expect(adapter.save(state)).toEqual({ ok: true });
    expect(values.has(SLICE_SAVE_STORAGE_KEY)).toBe(true);
    expect(adapter.load()).toMatchObject({ ok: true, state });
  });

  it('detaches every newly authoritative nested field on restore', () => {
    const state = createGame('detached-m2-fields');
    const result = parseSaveEnvelope(serializeSave(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    result.state.shelter.condition = 12;
    result.state.survivors[0]!.traits[0] = 'forager';
    result.state.survivors[0]!.injury = {
      kind: 'sprain',
      severity: 1,
      recoveryTicksRemaining: 4,
      productivityModifier: 0.85,
    };
    result.state.eventSchedule.pendingFollowUps!.push({
      eventId: 'signal-answer',
      sourceEventId: 'smoke-on-horizon',
      sourceChoiceId: 'signal',
      earliestTick: 1,
    });
    result.state.metrics.taskReasonCounts['repair-shelter'] = 1;

    expect(state.shelter.condition).toBe(76);
    expect(state.survivors[0]!.injury).toBeNull();
    expect(state.eventSchedule.pendingFollowUps).toEqual([]);
    expect(state.metrics.taskReasonCounts['repair-shelter']).toBeUndefined();
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
    expect(
      parseSaveEnvelope(JSON.stringify({ ...envelope, rulesVersion: 'm1-foundation-1' })),
    ).toEqual({ ok: false, reason: 'incompatible-rules' });
  });

  it.each([
    [
      'victory before rescue',
      (state: GameState) => {
        state.status = 'victory';
      },
    ],
    [
      'defeat with a living survivor',
      (state: GameState) => {
        state.status = 'defeat';
      },
    ],
    [
      'clock day mismatch',
      (state: GameState) => {
        state.clock.tick = 1;
        state.clock.day = 14;
      },
    ],
  ])('rejects inconsistent %s state', (_label, mutate) => {
    const envelope = clonedEnvelope();
    mutate(envelope.gameState);
    expect(parseSaveEnvelope(JSON.stringify(envelope))).toEqual({
      ok: false,
      reason: 'invalid-envelope',
    });
  });

  it.each([
    [
      'active task with no remaining work',
      (state: GameState) => {
        state.survivors[0]!.activeTask!.remainingTicks = 0;
      },
    ],
    [
      'progress beyond movement range',
      (state: GameState) => {
        state.survivors[0]!.progressTicks = state.config.movementTicks + 1;
      },
    ],
    [
      'event result that disagrees with its choice',
      (state: GameState) => {
        state.clock.tick = 300;
        state.clock.day = 1;
        state.eventSchedule.nextEventTick = null;
        state.status = 'event-result';
        state.activeEvent = {
          id: 'tide-pools',
          activatedTick: 300,
          participantIds: [state.survivors[0]!.id],
          chosenChoiceId: 'harvest',
          result: 'fabricated result',
        };
      },
    ],
  ])('rejects inconsistent %s content', (_label, mutate) => {
    expect(parseMutatedState(mutate)).toEqual({ ok: false, reason: 'invalid-envelope' });
  });

  it.each([
    [
      'trait ID',
      (state: GameState) => {
        state.survivors[0]!.traits = ['forager', 'unknown'] as never;
      },
    ],
    [
      'incompatible trait pair',
      (state: GameState) => {
        state.survivors[0]!.traits = ['optimist', 'hot-headed'];
      },
    ],
    [
      'injury shape',
      (state: GameState) => {
        state.survivors[0]!.injury = {
          kind: 'burn',
          severity: 4,
          recoveryTicksRemaining: 10,
          productivityModifier: 0.4,
        } as never;
      },
    ],
    [
      'shelter bounds',
      (state: GameState) => {
        state.shelter.condition = state.shelter.maximumCondition + 1;
      },
    ],
    [
      'metrics bounds',
      (state: GameState) => {
        state.metrics.maxDecisionGapTicks = -1;
      },
    ],
    [
      'choice ID',
      (state: GameState) => {
        state.choiceRecords.push({
          eventId: 'tide-pools',
          choiceId: 'not-a-choice',
          tick: 0,
          participantIds: [state.survivors[0]!.id],
          result: 'bad choice',
        });
      },
    ],
    [
      'event ID',
      (state: GameState) => {
        state.scheduledEffects.push({
          id: 'bad-event',
          dueTick: 1,
          sourceEventId: 'supply-cache' as never,
          sourceChoiceId: 'force-open',
          effect: { kind: 'health', amount: -1 },
          description: 'bad source',
        });
      },
    ],
    [
      'source reservation overclaim',
      (state: GameState) => {
        state.reservations[0]!.expectedYield =
          state.island.sourceStates[state.reservations[0]!.sourceId].available + 1;
      },
    ],
    [
      'material reservation mismatch',
      (state: GameState) => {
        state.reservations[0]!.kind = 'materials';
      },
    ],
  ])('rejects invalid M2 %s', (_label, mutate) => {
    expect(parseMutatedState(mutate)).toEqual({ ok: false, reason: 'invalid-envelope' });
  });

  it.each([
    ['empty', []],
    ['one participant', ['survivor-1']],
    ['duplicate participant', ['survivor-1', 'survivor-1']],
  ])('rejects a water-dispute active event with %s participants', (_label, participantIds) => {
    const state = activeEventState('water-dispute', participantIds);
    expect(parseSaveEnvelope(serializeSave(state))).toEqual({
      ok: false,
      reason: 'invalid-envelope',
    });
  });

  it('rejects a forager event whose active participant lacks the required trait', () => {
    const state = activeEventState('forager-instinct', ['survivor-1']);
    state.survivors[0]!.traits = ['resourceful', 'tireless'];
    expect(parseSaveEnvelope(serializeSave(state))).toEqual({
      ok: false,
      reason: 'invalid-envelope',
    });
  });

  it('accepts a valid pair participant set for water-dispute', () => {
    const state = activeEventState('water-dispute', ['survivor-1', 'survivor-2']);
    expect(parseSaveEnvelope(serializeSave(state))).toMatchObject({ ok: true });
  });

  it('accepts terminal records whose historical participants later died', () => {
    const envelope = clonedEnvelope();
    const state = envelope.gameState;
    const survivorId = state.survivors[0]!.id;
    state.status = 'defeat';
    state.reservations = [];
    for (const survivor of state.survivors) {
      survivor.alive = false;
      survivor.activeTask = null;
      survivor.needs.health = 0;
    }
    state.choiceRecords.push({
      eventId: 'tide-pools',
      choiceId: 'leave-it',
      tick: 0,
      participantIds: [survivorId],
      result: 'The group avoids the slippery rocks.',
    });
    state.turningPoints.push({
      id: 'turning-terminal-choice',
      tick: 0,
      survivorIds: [survivorId],
      kind: 'choice',
      description: 'The dead survivor made the final choice.',
      sourceEventId: 'tide-pools',
    });
    expect(parseSaveEnvelope(JSON.stringify(envelope))).toMatchObject({ ok: true });
  });

  it('accepts a valid interactive follow-up state with linked choice data', () => {
    const state = createGame('valid-follow-up-save');
    state.resources.materials = 2;
    state.reservations = [];
    for (const survivor of state.survivors) survivor.activeTask = null;
    state.clock.tick = 3000;
    state.clock.day = 6;
    state.eventSchedule.nextEventTick = null;
    state.status = 'decision';
    state.activeEvent = {
      id: 'smoke-on-horizon',
      activatedTick: state.clock.tick,
      participantIds: state.survivors.slice(0, 2).map((survivor) => survivor.id),
      chosenChoiceId: null,
      result: null,
    };
    const selected = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'smoke-on-horizon',
      choiceId: 'signal',
    });
    expect(selected.accepted).toBe(true);
    expect(parseSaveEnvelope(serializeSave(selected.state))).toMatchObject({ ok: true });
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
    expect(values.has(SAVE_STORAGE_KEY)).toBe(true);
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
