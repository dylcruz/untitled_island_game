import { describe, expect, it } from 'vitest';
import { applyCommand, cloneGameState, createGame, createSnapshot } from '../game/simulation';
import { deriveEndingSummary } from '../game/endings';
import { EVENT_BY_ID } from '../game/events';
import { describeOutcome } from '../game/outcomes';
import { TUNING } from '../game/tuning';
import type { EventId, GameState } from '../game/types';
import { parseSaveEnvelope, serializeSave } from '../persistence';

function decision(seed: string, id: EventId = 'fallen-palm'): GameState {
  const state = createGame(seed);
  state.reservations = [];
  for (const survivor of state.survivors) survivor.activeTask = null;
  state.status = 'decision';
  state.eventSchedule.nextEventTick = null;
  state.activeEvent = {
    id,
    activatedTick: 0,
    participantIds: [state.survivors[0]!.id],
    chosenChoiceId: null,
    result: null,
  };
  return state;
}
function reach(state: GameState): GameState {
  return applyCommand(state, {
    type: 'select-event-choice',
    eventId: 'fallen-palm',
    choiceId: 'reach',
  }).state;
}

describe('resolved event outcomes', () => {
  it('records both deterministic injury rolls and the original synthetic reproduction', () => {
    const branches = new Set<boolean>();
    for (let index = 0; index < 20; index++) {
      const state = decision(index === 0 ? 'result-review-1' : `issue4-roll-${index}`);
      const next = reach(state);
      const injury = next.activeEvent!.outcome!.effects[1]!;
      branches.add(injury.fired);
      expect(Boolean(next.survivors[0]!.injury)).toBe(injury.fired);
      if (index === 0) expect(injury.fired).toBe(false);
      if (injury.fired) {
        expect(injury.injuries[0]!.after).toEqual(next.survivors[0]!.injury);
        expect(injury.changes[0]!.delta).toBe(
          next.survivors[0]!.morale - state.survivors[0]!.morale,
        );
        expect(next.activeEvent!.result).toContain('suffered a sprain');
      } else {
        expect(injury.changes).toEqual([]);
        expect(next.activeEvent!.result).toContain('sprain risk did not occur');
        expect(next.activeEvent!.result).not.toContain('suffered');
      }
      expect(next.choiceRecords[0]!.result).toBe(next.activeEvent!.result);
      expect(next.history.at(-1)!.message).toBe(next.activeEvent!.result);
      expect(deriveEndingSummary(next).notableChoices[0]!.result).toBe(next.activeEvent!.result);
      expect(next.turningPoints.find((point) => point.kind === 'choice')!.description).toBe(
        next.activeEvent!.result,
      );
      const loaded = parseSaveEnvelope(serializeSave(next));
      expect(loaded.ok).toBe(true);
      if (loaded.ok) {
        expect(loaded.state).toEqual(next);
        expect(
          applyCommand(loaded.state, { type: 'acknowledge-event-result', eventId: 'fallen-palm' }),
        ).toEqual(applyCommand(next, { type: 'acknowledge-event-result', eventId: 'fallen-palm' }));
      }
    }
    expect(branches).toEqual(new Set([true, false]));
  });

  it.each([
    0,
    0.25,
    TUNING.resourceCaps.food - 0.25,
    TUNING.resourceCaps.food - 1,
    TUNING.resourceCaps.food,
  ])('measures actual capped food gains from %s', (food) => {
    const state = decision('result-review-1');
    state.resources.food = food;
    const next = reach(state);
    const delta = Math.min(3, TUNING.resourceCaps.food - food);
    expect(next.activeEvent!.outcome!.effects[0]!.changes).toEqual([
      {
        kind: 'resource',
        target: 'food',
        survivorId: undefined,
        before: food,
        after: food + delta,
        delta,
      },
    ]);
    expect(next.activeEvent!.result).toContain(`food ${delta ? '+' : ''}${delta}`);
  });

  it('captures all authored global, group and participant effects without changing other survivors', () => {
    for (const event of Object.values(EVENT_BY_ID))
      for (const choice of event.choices) {
        const state = decision('issue4-all-effects', event.id);
        state.resources = { food: 8, water: 8, materials: 8 };
        state.shelter.condition = 99;
        state.survivors.forEach((survivor) => {
          survivor.morale = 99;
          survivor.needs.health = 99;
        });
        const next = applyCommand(state, {
          type: 'select-event-choice',
          eventId: event.id,
          choiceId: choice.id,
        }).state;
        expect(next.activeEvent!.outcome).toBeDefined();
        for (const effect of next.activeEvent!.outcome!.effects) {
          for (const change of effect.changes) {
            expect(change.delta).toBe(change.after - change.before);
            if (change.survivorId && effect.effect.targetScope !== 'group')
              expect(change.survivorId).toBe(state.survivors[0]!.id);
          }
          if (effect.fired && effect.effect.targetScope === 'group')
            expect(effect.changes).toHaveLength(3);
        }
        for (const survivor of state.survivors) {
          const after = next.survivors.find((s) => s.id === survivor.id)!;
          const changes = next
            .activeEvent!.outcome!.effects.flatMap((e) => e.changes)
            .filter((c) => c.survivorId === survivor.id);
          expect(
            changes.filter((c) => c.kind === 'morale').reduce((sum, c) => sum + c.delta, 0),
          ).toBeCloseTo(after.morale - survivor.morale);
          for (const need of ['health', 'hunger', 'thirst', 'energy'] as const)
            expect(
              changes
                .filter((c) => c.target === need || (need === 'health' && c.kind === 'health'))
                .reduce((sum, c) => sum + c.delta, 0),
            ).toBeCloseTo(after.needs[need] - survivor.needs[need]);
        }
        expect(next.activeEvent!.result).toBe(
          describeOutcome(choice.label, next.activeEvent!.outcome!, next.survivors),
        );
        if (choice.delayedEffect) {
          expect(next.scheduledEffects[0]!.effect).toEqual(choice.delayedEffect.effect);
          expect(next.activeEvent!.outcome!.effects).toHaveLength(choice.immediateEffects.length);
        }
      }
  });

  it('detaches active, historical, cloned and published nested records', () => {
    const state = reach(decision('issue4-roll-2'));
    // Keep save metadata fixed so elapsed wall-clock time cannot affect this comparison.
    const savedAt = '2026-09-10T00:00:00.000Z';
    const original = serializeSave(state, savedAt);
    for (const copy of [cloneGameState(state), createSnapshot(state)]) {
      copy.activeEvent!.outcome!.effects[0]!.changes[0]!.delta = 999;
      copy.choiceRecords[0]!.outcome!.effects[0]!.effect.amount = 999;
      copy.activeEvent!.outcome!.effects[1]!.injuries[0]!.after.severity = 3;
      copy.choiceRecords[0]!.outcome!.effects[1]!.injuries[0]!.after.recoveryTicksRemaining = 1;
    }
    expect(serializeSave(state, savedAt)).toBe(original);
    state.activeEvent!.outcome!.effects[0]!.changes[0]!.delta = 999;
    expect(state.choiceRecords[0]!.outcome!.effects[0]!.changes[0]!.delta).toBe(3);
  });

  it('rejects old schemas, missing outcomes, forged deltas, prose and inconsistent records', () => {
    const state = reach(decision('result-review-1'));
    const envelope = JSON.parse(serializeSave(state));
    expect(parseSaveEnvelope(JSON.stringify({ ...envelope, schemaVersion: 1 }))).toEqual({
      ok: false,
      reason: 'unsupported-schema',
    });
    const mutations = [
      (s: GameState) => {
        delete s.activeEvent!.outcome;
      },
      (s: GameState) => {
        s.activeEvent!.result = 'a painful sprain';
      },
      (s: GameState) => {
        s.choiceRecords[0]!.outcome!.effects[0]!.changes[0]!.delta = 99;
      },
      (s: GameState) => {
        s.activeEvent!.outcome!.effects[1]!.fired = true;
      },
      (s: GameState) => {
        s.choiceRecords[0]!.result = 'fabricated';
      },
      (s: GameState) => {
        s.resources.food = 0;
      },
    ];
    for (const mutate of mutations) {
      const copy = cloneGameState(state);
      mutate(copy);
      expect(parseSaveEnvelope(serializeSave(copy)).ok).toBe(false);
    }
  });
});
