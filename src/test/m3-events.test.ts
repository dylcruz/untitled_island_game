import { describe, expect, it } from 'vitest';
import {
  advanceStep,
  applyCommand,
  createGame,
  PRODUCTION_EVENT_DEFINITIONS,
  RISK_PROBABILITY_RANGES,
  TUNING,
} from '../game';
import type { EffectData, RiskLevel } from '../game';
import { parseSaveEnvelope, serializeSave } from '../persistence';

function clearTasks(state: ReturnType<typeof createGame>): void {
  state.reservations = [];
  for (const survivor of state.survivors) survivor.activeTask = null;
}

describe('M3 event content and authoritative scheduling', () => {
  it('provides thirteen templates, two follow-ups, and four asynchronous roots', () => {
    expect(PRODUCTION_EVENT_DEFINITIONS).toHaveLength(13);
    expect(
      PRODUCTION_EVENT_DEFINITIONS.filter((event) => event.category === 'follow-up'),
    ).toHaveLength(2);
    expect(
      PRODUCTION_EVENT_DEFINITIONS.filter((event) =>
        event.choices.some(
          (choice) =>
            ('delayedEffect' in choice && choice.delayedEffect) ||
            ('followUpEventId' in choice && choice.followUpEventId),
        ),
      ),
    ).toHaveLength(4);
    expect(PRODUCTION_EVENT_DEFINITIONS.every((event) => event.cooldownDays !== undefined)).toBe(
      true,
    );
    expect(PRODUCTION_EVENT_DEFINITIONS.every((event) => event.phaseWeights !== undefined)).toBe(
      true,
    );
  });

  it('keeps every probabilistic effect inside its labeled centralized range', () => {
    for (const event of PRODUCTION_EVENT_DEFINITIONS) {
      for (const choice of event.choices) {
        expect(choice.risk.label.length).toBeGreaterThan(0);
        const effects = [
          ...choice.immediateEffects,
          ...('delayedEffect' in choice && choice.delayedEffect
            ? [choice.delayedEffect.effect]
            : []),
        ] as readonly EffectData[];
        for (const effect of effects) {
          if (effect.probability === undefined) continue;
          expect(effect.riskLevel).toBe(choice.risk.level);
          const range = RISK_PROBABILITY_RANGES[effect.riskLevel as RiskLevel];
          expect(effect.probability).toBeGreaterThanOrEqual(range.min);
          expect(effect.probability).toBeLessThanOrEqual(range.max);
        }
      }
    }
  });

  it('records source choice provenance and discards a participant-only effect after target death', () => {
    let state = createGame('m3-discard');
    clearTasks(state);
    state.clock.tick = 100;
    state.eventSchedule.nextEventTick = null;
    state.status = 'decision';
    state.resources.materials = 1;
    state.activeEvent = {
      id: 'storm-front',
      activatedTick: state.clock.tick,
      participantIds: [state.survivors[0]!.id],
      chosenChoiceId: null,
      result: null,
    };
    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'storm-front',
      choiceId: 'reinforce-shelter',
    }).state;
    expect(state.scheduledEffects[0]).toMatchObject({
      sourceEventId: 'storm-front',
      sourceChoiceId: 'reinforce-shelter',
    });
    expect(parseSaveEnvelope(serializeSave(state)).ok).toBe(true);
    const dueTick = state.scheduledEffects[0]!.dueTick;
    state = applyCommand(state, {
      type: 'acknowledge-event-result',
      eventId: 'storm-front',
    }).state;
    state.survivors[0]!.alive = false;
    state.survivors[0]!.needs.health = 0;
    state.survivors[0]!.activeTask = null;
    state.clock.tick = dueTick - 1;
    state.clock.day = Math.floor(state.clock.tick / state.config.ticksPerDay) + 1;
    state.eventSchedule.nextEventTick = null;
    state = advanceStep(state);
    expect(state.scheduledEffects).toHaveLength(0);
    expect(state.history.at(-1)?.message).toContain(
      'storm-front/reinforce-shelter discarded: no original participant remained alive',
    );
  });

  it('does not persist an unreachable follow-up at the production decision cap', () => {
    let state = createGame('m5-follow-up-cap');
    clearTasks(state);
    state.clock.tick = 5_000;
    state.clock.day = Math.floor(state.clock.tick / state.config.ticksPerDay) + 1;
    state.eventSchedule.nextEventTick = null;
    state.metrics.interactiveEventCount = TUNING.productionEventDecisionCap;
    state.metrics.lastDecisionTick = state.clock.tick;
    state.eventSchedule.lastDecisionTick = state.clock.tick;
    state.status = 'decision';
    state.activeEvent = {
      id: 'freshwater-seep',
      activatedTick: state.clock.tick,
      participantIds: [state.survivors[0]!.id],
      chosenChoiceId: null,
      result: null,
    };

    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'freshwater-seep',
      choiceId: 'mark-source',
    }).state;
    expect(state.eventSchedule.pendingFollowUps).toEqual([]);
    expect(parseSaveEnvelope(serializeSave(state)).ok).toBe(true);

    state = applyCommand(state, {
      type: 'acknowledge-event-result',
      eventId: 'freshwater-seep',
    }).state;
    expect(state.eventSchedule.nextEventTick).toBeNull();
    expect(state.eventSchedule.pendingFollowUps).toEqual([]);
    state.clock.tick = 5_399;
    state.clock.day = Math.floor(state.clock.tick / state.config.ticksPerDay) + 1;
    state = advanceStep(state);
    expect(state.clock.tick).toBe(5_400);
    expect(parseSaveEnvelope(serializeSave(state)).ok).toBe(true);
  });

  it('applies participant effects to every surviving original and preserves global effects', () => {
    let state = createGame('m3-participant-targets');
    clearTasks(state);
    state.clock.tick = 100;
    state.eventSchedule.nextEventTick = null;
    state.status = 'decision';
    state.activeEvent = {
      id: 'night-watch',
      activatedTick: state.clock.tick,
      participantIds: state.survivors.slice(0, 2).map((survivor) => survivor.id),
      chosenChoiceId: null,
      result: null,
    };
    const beforeEnergy = state.survivors.map((survivor) => survivor.needs.energy);
    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'night-watch',
      choiceId: 'keep-watch',
    }).state;
    expect(
      state.survivors
        .slice(0, 2)
        .map((survivor, index) => survivor.needs.energy - beforeEnergy[index]!),
    ).toEqual([-8, -8]);

    const participantIds = state.survivors.slice(0, 2).map((survivor) => survivor.id);
    state.scheduledEffects = [
      {
        id: 'effect-global-resource',
        dueTick: 101,
        sourceEventId: 'night-watch',
        sourceChoiceId: 'keep-watch',
        participantIds,
        effect: { kind: 'resource', target: 'food', amount: 2 },
        description: 'A global resource effect resolves.',
      },
      {
        id: 'effect-global-shelter',
        dueTick: 101,
        sourceEventId: 'night-watch',
        sourceChoiceId: 'keep-watch',
        participantIds,
        effect: { kind: 'shelter', amount: 3 },
        description: 'A global shelter effect resolves.',
      },
    ];
    state.status = 'running';
    state.activeEvent = null;
    state.survivors.slice(0, 2).forEach((survivor) => {
      survivor.alive = false;
      survivor.needs.health = 0;
    });
    const beforeFood = state.resources.food;
    const beforeShelter = state.shelter.condition;
    state = advanceStep(state);
    expect(state.resources.food).toBe(beforeFood + 2);
    expect(state.shelter.condition).toBeGreaterThan(beforeShelter + 2.9);
    expect(state.history.some((entry) => entry.message.includes('discarded'))).toBe(false);
  });

  it('rejects scheduled effect provenance without the matching recorded choice', () => {
    let state = createGame('m3-fabricated-provenance');
    clearTasks(state);
    state.clock.tick = 100;
    state.eventSchedule.nextEventTick = null;
    state.status = 'decision';
    state.resources.materials = 1;
    state.activeEvent = {
      id: 'storm-front',
      activatedTick: state.clock.tick,
      participantIds: [state.survivors[0]!.id],
      chosenChoiceId: null,
      result: null,
    };
    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'storm-front',
      choiceId: 'reinforce-shelter',
    }).state;
    state.choiceRecords = [];
    expect(parseSaveEnvelope(serializeSave(state)).ok).toBe(false);
  });

  it('round trips the expanded schedule and rules state as plain JSON', () => {
    const state = createGame('m3-save');
    const raw = serializeSave(state, '2026-09-03T00:00:00.000Z');
    const restored = parseSaveEnvelope(raw);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(JSON.parse(JSON.stringify(restored.state))).toEqual(restored.state);
    expect(restored.state.config.rulesVersion).toBe('m5-balance-1');
  });
});
