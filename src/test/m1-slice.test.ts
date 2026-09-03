import { describe, expect, it } from 'vitest';
import { EVENT_DEFINITIONS } from '../game/events';
import { advanceStep, applyCommand, createGame, deriveTime } from '../game/simulation';
import { SLICE_GAME_CONFIG } from '../game/tuning';
import type { GameState } from '../game/types';
import { FixedStepLoop } from '../runtime/fixedStepLoop';
import { parseSaveEnvelope, serializeSave } from '../persistence';

function withoutEvents(seed: string): GameState {
  const state = createGame({ ...SLICE_GAME_CONFIG, seed });
  state.eventSchedule.nextEventTick = null;
  return state;
}

describe('M1 technical slice', () => {
  it('keeps the internal slice distinct from the fixed production contract', () => {
    const production = createGame();
    const slice = createGame({ mode: 'slice' });
    expect(production.config).toMatchObject({
      survivorCount: 3,
      ticksPerDay: 600,
      rescueTick: 8400,
    });
    expect(slice.config).toMatchObject({ survivorCount: 1, ticksPerDay: 120, rescueTick: 360 });
    expect(() => createGame({ survivorCount: 1 })).toThrow();
  });

  it('derives phase, dawn, day, and rescue countdown from integer ticks', () => {
    const state = withoutEvents('time');
    state.clock.tick = 96;
    expect(deriveTime(state)).toMatchObject({
      tickInDay: 96,
      phase: 'night',
      isDaylight: false,
      rescueTicksRemaining: 264,
    });
    state.clock.tick = 120;
    state.clock.day = 2;
    expect(deriveTime(state)).toMatchObject({ day: 2, tickInDay: 0, phase: 'dawn', isDawn: true });
  });

  it('accumulates bounded needs, replenishes renewable sources at dawn, and leaves wreckage finite', () => {
    let state = withoutEvents('needs');
    const initialHunger = state.survivors[0]!.needs.hunger;
    state = advanceStep(state);
    expect(state.survivors[0]!.needs.hunger).toBeGreaterThan(initialHunger);
    state.clock.tick = 119;
    state.clock.day = 1;
    state.island.sourceStates.water.available = 0;
    state.island.sourceStates.forage.available = 0;
    state.island.sourceStates.forest.available = 0;
    state.island.sourceStates.wreckage.available = 1;
    state = advanceStep(state);
    expect(state.island.sourceStates.water.available).toBe(6);
    expect(state.island.sourceStates.forage.available).toBe(4);
    expect(state.island.sourceStates.forest.available).toBe(1);
    expect(state.island.sourceStates.wreckage.available).toBe(1);
  });

  it('never over-reserves a source and releases an invalid reservation', () => {
    let state = createGame();
    for (const source of Object.values(state.island.sourceStates)) {
      const claimed = state.reservations
        .filter((value) => value.sourceId === source.id)
        .reduce((sum, value) => sum + value.expectedYield, 0);
      expect(claimed).toBeLessThanOrEqual(source.available);
    }
    const reservation = state.reservations[0]!;
    state.island.sourceStates[reservation.sourceId].available = 0;
    state = advanceStep(state);
    expect(state.reservations.some((value) => value.id === reservation.id)).toBe(false);
  });

  it('forces sleep at night while critical thirst overrides it', () => {
    let state = withoutEvents('night');
    state.clock.tick = 95;
    state.clock.day = 1;
    state = advanceStep(state);
    expect(state.survivors[0]!.activeTask?.kind).toBe('sleep');
    expect(state.reservations).toHaveLength(0);
    state.survivors[0]!.needs.thirst = 80;
    state.resources.water = 2;
    state = advanceStep(state);
    expect(state.survivors[0]!.activeTask?.kind).toBe('drink');
    expect(state.survivors[0]!.activeTask?.reason.code).toBe('critical-thirst');
  });

  it('consumes care resources and releases reservations after gathering completes', () => {
    let care = withoutEvents('consumption');
    const careSurvivor = care.survivors[0]!;
    careSurvivor.activeTask = null;
    care.reservations = [];
    careSurvivor.needs.thirst = 80;
    care.resources.water = 3;
    care = advanceStep(care);
    expect(care.survivors[0]!.activeTask?.kind).toBe('drink');
    care = advanceStep(care);
    expect(care.resources.water).toBe(2);
    expect(care.survivors[0]!.needs.thirst).toBeLessThan(80);

    let gather = withoutEvents('gather-completion');
    const initialReservationId = gather.survivors[0]!.activeTask!.reservationId;
    const initialWater = gather.resources.water;
    const initialSource = gather.island.sourceStates.water.available;
    for (let tick = 0; tick < gather.config.movementTicks + 8; tick += 1)
      gather = advanceStep(gather);
    expect(gather.resources.water).toBe(initialWater + 3);
    expect(gather.island.sourceStates.water.available).toBe(initialSource - 3);
    expect(gather.reservations.some((value) => value.id === initialReservationId)).toBe(false);
    expect(gather.history.some((entry) => entry.kind === 'resource')).toBe(true);
  });

  it('releases a reserved task when the survivor dies', () => {
    let state = withoutEvents('death-release');
    const survivor = state.survivors[0]!;
    const reservationId = survivor.activeTask!.reservationId!;
    survivor.needs.health = 1;
    survivor.needs.hunger = 100;
    survivor.needs.thirst = 100;
    survivor.needs.energy = 0;
    state.resources.water = 0;
    state.resources.food = 0;

    state = advanceStep(state);

    expect(state.status).toBe('defeat');
    expect(state.survivors[0]!.alive).toBe(false);
    expect(state.reservations.some((value) => value.id === reservationId)).toBe(false);
  });

  it('defines exactly three events and holds decision/result boundaries until valid commands', () => {
    let state = createGame({ mode: 'slice', seed: 'event-flow' });
    while (state.status === 'running') state = advanceStep(state);
    expect(EVENT_DEFINITIONS).toHaveLength(3);
    expect(state.status).toBe('decision');
    const tick = state.clock.tick;
    expect(advanceStep(state)).toEqual(state);
    expect(
      applyCommand(state, { type: 'acknowledge-event-result', eventId: state.activeEvent!.id }),
    ).toMatchObject({ accepted: false, reason: 'event-not-showing-result' });
    const definition = EVENT_DEFINITIONS.find((value) => value.id === state.activeEvent!.id)!;
    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: definition.id,
      choiceId: definition.choices[0]!.id,
    }).state;
    expect(state).toMatchObject({ status: 'event-result', clock: { tick } });
    state = applyCommand(state, { type: 'acknowledge-event-result', eventId: definition.id }).state;
    expect(state.status).toBe('running');
  });

  it('stores delayed effects as data and resolves lethal effects before rescue victory', () => {
    let state = withoutEvents('ordering');
    state.clock.tick = 359;
    state.clock.day = 3;
    state.survivors[0]!.needs.health = 10;
    state.scheduledEffects = [
      {
        id: 'lethal',
        dueTick: 360,
        sourceEventId: 'supply-cache',
        effect: { kind: 'health', amount: -20 },
        description: 'A final consequence lands.',
      },
    ];
    state = advanceStep(state);
    expect(state.status).toBe('defeat');
    expect(state.clock.tick).toBe(360);
  });

  it('persists and resolves a delayed effect due exactly on the rescue tick', () => {
    const state = createGame({ mode: 'slice', seed: 'rescue-effect' });
    state.clock.tick = state.config.rescueTick - 24;
    state.clock.day = 3;
    state.eventSchedule.nextEventTick = null;
    state.status = 'decision';
    state.activeEvent = {
      id: 'supply-cache',
      activatedTick: state.clock.tick,
      chosenChoiceId: null,
      result: null,
    };

    const selected = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'supply-cache',
      choiceId: 'force-open',
    });
    expect(selected.accepted).toBe(true);
    expect(selected.state.scheduledEffects).toContainEqual(
      expect.objectContaining({ dueTick: state.config.rescueTick }),
    );

    const persisted = parseSaveEnvelope(serializeSave(selected.state, '2026-09-03T00:00:00.000Z'));
    expect(persisted.ok).toBe(true);
    if (!persisted.ok) return;

    let resumed = applyCommand(persisted.state, {
      type: 'acknowledge-event-result',
      eventId: 'supply-cache',
    }).state;
    resumed.clock.tick = resumed.config.rescueTick - 1;
    resumed.clock.day = 3;
    resumed.survivors[0]!.needs.health = 10;
    resumed.eventSchedule.nextEventTick = null;
    resumed = advanceStep(resumed);

    expect(resumed.clock.tick).toBe(resumed.config.rescueTick);
    expect(resumed.survivors[0]!.needs.health).toBe(0);
    expect(resumed.status).toBe('defeat');
  });

  it.each([1, 3, 8] as const)('produces the same eight authoritative steps at %sx', (speed) => {
    const expected = new FixedStepLoop(withoutEvents('speed-equivalence'), advanceStep, {
      speed: 1,
      maxCatchUpSteps: 20,
    });
    expected.advanceElapsed(800);
    const actual = new FixedStepLoop(withoutEvents('speed-equivalence'), advanceStep, {
      speed,
      maxCatchUpSteps: 20,
    });
    actual.advanceElapsed(800 / speed);
    expect(actual.getState()).toEqual(expected.getState());
  });
});
