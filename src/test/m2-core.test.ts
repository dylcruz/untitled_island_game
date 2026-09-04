import { describe, expect, it } from 'vitest';
import { deriveEndingSummary } from '../game/endings';
import { EVENT_BY_ID, EVENT_DEFINITIONS, PRODUCTION_EVENT_DEFINITIONS } from '../game/events';
import { advanceStep, applyCommand, createGame, deriveRunPhase } from '../game/simulation';
import { TRAIT_DEFINITIONS, traitsAreCompatible } from '../game/traits';
import type { GameState, TaskKind } from '../game/types';

function clearTasks(state: GameState): void {
  state.reservations = [];
  for (const survivor of state.survivors) survivor.activeTask = null;
}

function autoRun(seed = 'm2-full-run'): GameState {
  let state = createGame(seed);
  for (
    let guard = 0;
    guard < 20_000 && state.status !== 'victory' && state.status !== 'defeat';
    guard += 1
  ) {
    if (state.status === 'running') state = advanceStep(state);
    else if (state.status === 'decision') {
      const event = state.activeEvent!;
      state = applyCommand(state, {
        type: 'select-event-choice',
        eventId: event.id,
        choiceId: EVENT_BY_ID[event.id].choices[0]!.id,
      }).state;
    } else if (state.status === 'event-result')
      state = applyCommand(state, {
        type: 'acknowledge-event-result',
        eventId: state.activeEvent!.id,
      }).state;
  }
  return state;
}

describe('M2 deterministic production core', () => {
  it('defines six compatible typed traits and deterministically assigns exactly two', () => {
    const first = createGame('trait-seed');
    const replay = createGame('trait-seed');
    expect(TRAIT_DEFINITIONS).toHaveLength(6);
    expect(first.survivors.map((value) => value.traits)).toEqual(
      replay.survivors.map((value) => value.traits),
    );
    expect(
      first.survivors.every(
        (value) =>
          value.traits.length === 2 &&
          new Set(value.traits).size === 2 &&
          traitsAreCompatible(value.traits),
      ),
    ).toBe(true);
    expect(new Set(first.survivors.map((value) => value.name)).size).toBe(3);
    expect(
      new Set(first.survivors.map((value) => `${value.color}:${value.visualVariant}`)).size,
    ).toBe(3);
  });

  it('derives all three run phases at exact boundaries', () => {
    expect([1, 4, 5, 10, 11, 14].map(deriveRunPhase)).toEqual([
      'early',
      'early',
      'middle',
      'middle',
      'late',
      'late',
    ]);
  });

  it('enforces one policy change per day and preserves valid travel', () => {
    let state = createGame('policy');
    const traveler = state.survivors.find((value) => value.activeTask?.phase === 'travel')!;
    const before = { id: traveler.activeTask!.id, destination: traveler.activeTask!.destination };
    const result = applyCommand(state, { type: 'set-camp-priority', priority: 'food' });
    expect(result.accepted).toBe(true);
    state = result.state;
    expect(state.survivors.find((value) => value.id === traveler.id)!.activeTask).toMatchObject(
      before,
    );
    expect(applyCommand(state, { type: 'set-camp-priority', priority: 'build' })).toMatchObject({
      accepted: false,
      reason: 'daily-change-used',
    });
    state.clock.tick = state.config.ticksPerDay - 1;
    state.clock.day = 1;
    state.eventSchedule.nextEventTick = null;
    state = advanceStep(state);
    expect(applyCommand(state, { type: 'set-camp-priority', priority: 'build' }).accepted).toBe(
      true,
    );
  });

  it('uses each policy as a real planning bias while critical thirst remains a hard override', () => {
    const selected: TaskKind[][] = [];
    for (const priority of ['water', 'food', 'build', 'recover'] as const) {
      let state = createGame(`bias-${priority}`);
      clearTasks(state);
      state.campPolicy.priority = priority;
      state.resources = { water: 2, food: 2, materials: priority === 'build' ? 3 : 0 };
      state.shelter.condition = 40;
      state = advanceStep(state);
      selected.push(state.survivors.map((value) => value.activeTask!.kind));
    }
    expect(selected[0]).toContain('gather-water');
    expect(selected[1]).toContain('gather-food');
    expect(selected[2]).toContain('repair-shelter');
    expect(selected[3]).toContain('rest');
    let critical = createGame('hard-override');
    clearTasks(critical);
    critical.campPolicy.priority = 'build';
    critical.survivors[0]!.needs.thirst = 90;
    critical.resources.water = 2;
    critical = advanceStep(critical);
    expect(critical.survivors[0]!.activeTask?.reason.code).toBe('critical-thirst');
  });

  it('rotates first planning opportunity and reserves repair materials across the group', () => {
    let state = createGame('rotation');
    clearTasks(state);
    const expectedFirst = state.survivors[state.plannerRotation]!.id;
    state = advanceStep(state);
    const assignedFirst = [...state.survivors].sort((a, b) =>
      a.activeTask!.id.localeCompare(b.activeTask!.id, undefined, { numeric: true }),
    )[0]!.id;
    expect(assignedFirst).toBe(expectedFirst);
    clearTasks(state);
    state.campPolicy.priority = 'build';
    state.resources.materials = 2;
    state.shelter.condition = 20;
    state = advanceStep(state);
    const repairs = state.survivors.filter((value) => value.activeTask?.kind === 'repair-shelter');
    expect(repairs).toHaveLength(1);
    expect(state.reservations.filter((value) => value.kind === 'materials')).toHaveLength(1);
    const repair = repairs[0]!;
    const reservation = state.reservations.find(
      (value) => value.id === repair.activeTask!.reservationId,
    )!;
    const materialsBefore = state.resources.materials;
    const shelterBefore = state.shelter.condition;
    repair.activeTask!.phase = 'work';
    repair.activeTask!.remainingTicks = 1;
    state = advanceStep(state);
    expect(state.resources.materials).toBe(materialsBefore - reservation.reservedAmount!);
    expect(state.shelter.condition).toBeGreaterThan(shelterBefore);
  });

  it('bounds morale/shelter and recovers temporary injury faster during protected sleep', () => {
    let state = createGame('recovery');
    clearTasks(state);
    const survivor = state.survivors[0]!;
    survivor.injury = {
      kind: 'sprain',
      severity: 1,
      recoveryTicksRemaining: 2,
      productivityModifier: 0.85,
    };
    survivor.morale = 99;
    state.shelter.condition = 100;
    state.clock.tick = 479;
    survivor.activeTask = {
      id: 'sleep-test',
      kind: 'sleep',
      destination: 'camp',
      phase: 'work',
      remainingTicks: 10,
      workTicks: 10,
      reservationId: null,
      reason: { code: 'night-sleep', params: {} },
    };
    state.eventSchedule.nextEventTick = null;
    state = advanceStep(state);
    expect(state.survivors[0]!.injury).toBeNull();
    expect(state.survivors[0]!.morale).toBeLessThanOrEqual(100);
    expect(state.shelter.condition).toBeLessThan(100);
  });

  it('keeps the three slice events and exposes the complete production template pool', () => {
    expect(EVENT_DEFINITIONS).toHaveLength(3);
    expect(PRODUCTION_EVENT_DEFINITIONS).toHaveLength(13);
    expect(new Set(PRODUCTION_EVENT_DEFINITIONS.map((value) => value.category))).toEqual(
      new Set(['resource', 'exploration', 'conflict', 'injury', 'shelter', 'trait', 'follow-up']),
    );
  });

  it('records participants, outcomes, metrics, and an interactive prior-choice follow-up', () => {
    let state = createGame('follow-up');
    clearTasks(state);
    state.resources.materials = 2;
    state.status = 'decision';
    state.activeEvent = {
      id: 'smoke-on-horizon',
      activatedTick: 3000,
      participantIds: state.survivors.slice(0, 2).map((value) => value.id),
      chosenChoiceId: null,
      result: null,
    };
    state.clock.tick = 3000;
    state.clock.day = 6;
    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'smoke-on-horizon',
      choiceId: 'signal',
    }).state;
    expect(state.choiceRecords.at(-1)).toMatchObject({
      eventId: 'smoke-on-horizon',
      choiceId: 'signal',
    });
    expect(state.eventSchedule.pendingFollowUps?.[0]?.eventId).toBe('signal-answer');
    state = applyCommand(state, {
      type: 'acknowledge-event-result',
      eventId: 'smoke-on-horizon',
    }).state;
    state.clock.tick = state.eventSchedule.pendingFollowUps![0]!.earliestTick - 1;
    state.clock.day = 7;
    state.eventSchedule.nextEventTick = state.clock.tick + 1;
    state = advanceStep(state);
    expect(state.activeEvent).toMatchObject({
      id: 'signal-answer',
      referencedChoice: { eventId: 'smoke-on-horizon', choiceId: 'signal' },
    });
    expect(state.activeEvent?.participantIds?.length).toBeGreaterThan(0);
  });

  it('rejects event costs atomically at zero or partial resources and applies sufficient costs', () => {
    const eventState = (materials: number) => {
      const state = createGame(`event-cost-${materials}`);
      clearTasks(state);
      state.resources.materials = materials;
      state.shelter.condition = 40;
      state.status = 'decision';
      state.activeEvent = {
        id: 'leaking-roof',
        activatedTick: 3_000,
        participantIds: [state.survivors[0]!.id],
        chosenChoiceId: null,
        result: null,
      };
      return state;
    };
    for (const materials of [0, 1]) {
      const state = eventState(materials);
      const before = JSON.stringify(state);
      const result = applyCommand(state, {
        type: 'select-event-choice',
        eventId: 'leaking-roof',
        choiceId: 'patch',
      });
      expect(result).toMatchObject({ accepted: false, reason: 'insufficient-resources' });
      expect(result.state).toBe(state);
      expect(JSON.stringify(state)).toBe(before);
    }
    const sufficient = eventState(2);
    const result = applyCommand(sufficient, {
      type: 'select-event-choice',
      eventId: 'leaking-roof',
      choiceId: 'patch',
    });
    expect(result.accepted).toBe(true);
    expect(result.state.resources.materials).toBe(0);
    expect(result.state.shelter.condition).toBe(58);
    expect(result.state.choiceRecords).toHaveLength(1);
  });

  it('consumes only eventOutcome randomness for a probabilistic effect', () => {
    let state = createGame('event-outcome');
    clearTasks(state);
    state.status = 'decision';
    state.activeEvent = {
      id: 'fallen-palm',
      activatedTick: 100,
      participantIds: [state.survivors[0]!.id],
      chosenChoiceId: null,
      result: null,
    };
    const selectionBefore = state.rngStates.eventSelection;
    const outcomeBefore = state.rngStates.eventOutcome;
    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'fallen-palm',
      choiceId: 'reach',
    }).state;
    expect(state.rngStates.eventOutcome).not.toEqual(outcomeBefore);
    expect(state.rngStates.eventSelection).toEqual(selectionBefore);
  });

  it('caps an ineligible retry at the day-five phase boundary and the two-day deadline', () => {
    let state = createGame('phase-boundary-deadline');
    state.clock.tick = 2_340;
    state.clock.day = 4;
    state.eventSchedule.usedEventIds = [
      'tide-pools',
      'interior-signal',
      'fallen-palm',
      'forager-instinct',
      'freshwater-seep',
      'driftwood-cache',
      'night-watch',
    ];
    state.eventSchedule.nextEventTick = 2_341;
    state.metrics.lastDecisionTick = 1_200;
    state.eventSchedule.lastDecisionTick = 1_200;
    state = advanceStep(state);
    expect(state.eventSchedule.nextEventTick).toBe(2_400);
    while (state.status === 'running') state = advanceStep(state);
    expect(state.clock.tick).toBe(2_400);
    expect(state.metrics.maxDecisionGapTicks).toBe(1_200);
  });

  it('stops retrying after all root events are exhausted without an unlocked follow-up', () => {
    let state = createGame('exhausted-roots');
    state.eventSchedule.usedEventIds = PRODUCTION_EVENT_DEFINITIONS.filter(
      (event) => event.category !== 'follow-up',
    ).map((event) => event.id);
    state.eventSchedule.pendingFollowUps = [];
    state.eventSchedule.nextEventTick = 1;
    state = advanceStep(state);
    expect(state.eventSchedule.nextEventTick).toBeNull();
    expect(state.status).toBe('running');
  });

  it('holds measured production decision gaps to two days across representative seeds', () => {
    for (let index = 0; index < 25; index += 1) {
      const state = autoRun(`m2-deadline-${index}`);
      expect(state.metrics.maxDecisionGapTicks, `seed ${index}`).toBeLessThanOrEqual(
        state.config.ticksPerDay * 2,
      );
    }
  });

  it('completes a playable deterministic 14-day run with bounded decision gaps and serializable metrics', () => {
    const state = autoRun();
    expect(state.status).toBe('victory');
    expect(state.clock.tick).toBe(8_400);
    expect(state.metrics.interactiveEventCount).toBeGreaterThanOrEqual(7);
    expect(state.metrics.maxDecisionGapTicks).toBeLessThanOrEqual(state.config.ticksPerDay * 2);
    expect(
      state.choiceRecords.some(
        (record) => record.eventId === 'signal-answer' || record.eventId === 'seep-follow-up',
      ),
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('derives survivor fates and quality for victory and defeat without mutating state', () => {
    const victory = autoRun('ending');
    const before = JSON.stringify(victory);
    const summary = deriveEndingSummary(victory);
    expect(summary.result).toBe('victory');
    expect(summary.survivors).toHaveLength(3);
    expect(JSON.stringify(victory)).toBe(before);
    const defeat = createGame('lost');
    defeat.status = 'defeat';
    defeat.survivors.forEach((value) => {
      value.alive = false;
      value.needs.health = 0;
    });
    expect(deriveEndingSummary(defeat).quality).toBe('lost-expedition');
  });
});
