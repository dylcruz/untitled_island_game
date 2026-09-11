import { describe, expect, it } from 'vitest';
import { advanceStep, applyCommand, createGame } from '../game/simulation';
import { DeterministicRandom } from '../game/random';
import { generateTraitPair, TRAIT_DEFINITIONS, traitsAreCompatible } from '../game/traits';
import type { GameState, TaskKind, TraitId } from '../game/types';

// Keep three survivors, isolating the first survivor's task from stock competition.
function fixture(traits: TraitId[] = []): GameState {
  const state = createGame('issue-8-traits');
  state.eventSchedule.nextEventTick = null;
  state.reservations = [];
  state.plannerRotation = 0;
  state.resources = { water: 20, food: 20, materials: 0 };
  for (const survivor of state.survivors) {
    survivor.activeTask = null;
    survivor.traits = [...traits];
    survivor.morale = 60;
    survivor.injury = null;
    survivor.needs = { health: 100, energy: 80, hunger: 0, thirst: 0 };
  }
  return state;
}

function plan(traits: TraitId[], kind: TaskKind, injured = false): GameState {
  const state = fixture(traits);
  if (kind === 'gather-food') {
    state.resources.food = 0;
    state.campPolicy.priority = 'food';
  } else {
    state.campPolicy.priority = 'build';
    if (kind === 'repair-shelter') {
      state.resources.materials = 10;
      state.shelter.condition = 20;
    }
  }
  if (injured)
    state.survivors[0]!.injury = {
      kind: 'sprain',
      severity: 1,
      recoveryTicksRemaining: 360,
      productivityModifier: 0.85,
    };
  const next = advanceStep(state);
  expect(next.survivors[0]!.activeTask?.kind).toBe(kind);
  return next;
}

describe('trait explanations match observable core effects', () => {
  it('Forager completes food collection sooner with the same reserved yield', () => {
    const normal = plan([], 'gather-food');
    const forager = plan(['forager'], 'gather-food');
    expect(normal.survivors[0]!.activeTask!.workTicks).toBe(8);
    expect(forager.survivors[0]!.activeTask!.workTicks).toBe(7);
    expect(forager.reservations[0]!.expectedYield).toBe(normal.reservations[0]!.expectedYield);
  });

  it.each(['gather-materials', 'repair-shelter'] as const)(
    'Resourceful accelerates %s; Hot-headed helps injured workers despite whole-tick rounding',
    (kind) => {
      expect(plan([], kind).survivors[0]!.activeTask!.workTicks).toBe(8);
      expect(plan(['resourceful'], kind).survivors[0]!.activeTask!.workTicks).toBe(7);
      expect(plan(['hot-headed'], kind).survivors[0]!.activeTask!.workTicks).toBe(8);
      expect(plan([], kind, true).survivors[0]!.activeTask!.workTicks).toBe(10);
      expect(plan(['hot-headed'], kind, true).survivors[0]!.activeTask!.workTicks).toBe(9);
    },
  );

  it('Resourceful spends one material instead of two for the same repair', () => {
    const outcomes = [[], ['resourceful'] as TraitId[]].map((traits) => {
      let state = plan(traits, 'repair-shelter');
      const task = state.survivors[0]!.activeTask!;
      task.remainingTicks = 1;
      const before = { ...state.resources, shelter: state.shelter.condition };
      state = advanceStep(state);
      return {
        cost: before.materials - state.resources.materials,
        repaired: state.shelter.condition - before.shelter,
      };
    });
    expect(outcomes.map((value) => value.cost)).toEqual([2, 1]);
    expect(outcomes[0]!.repaired).toBe(outcomes[1]!.repaired);
    expect(outcomes[0]!.repaired).toBeGreaterThan(23);
  });

  it.each(['injury', 'poor-shelter'] as const)('scales only ongoing %s morale losses', (cause) => {
    const losses = [[], ['optimist'], ['hot-headed'], ['cautious'], ['optimist', 'cautious']].map(
      (traits) => {
        const state = fixture(traits as TraitId[]);
        if (cause === 'injury')
          state.survivors[0]!.injury = {
            kind: 'cut',
            severity: 2,
            recoveryTicksRemaining: 720,
            productivityModifier: 0.7,
          };
        else {
          state.clock.tick = 479;
          state.shelter.condition = 20;
        }
        return 60 - advanceStep(state).survivors[0]!.morale;
      },
    );
    expect(losses[0]).toBeGreaterThan(0);
    for (const [index, multiplier] of [1, 0.65, 1.35, 0.9, 0.585].entries())
      expect(losses[index]).toBeCloseTo(losses[0]! * multiplier, 10);
  });

  it.each(['ration', 'hear-them-out'] as const)(
    'keeps direct conflict effects unscaled for %s',
    (choiceId) => {
      const state = fixture();
      state.survivors[0]!.traits = ['hot-headed', 'tireless'];
      state.survivors[1]!.traits = ['optimist', 'cautious'];
      state.status = 'decision';
      state.activeEvent = {
        id: 'water-dispute',
        activatedTick: 0,
        participantIds: state.survivors.slice(0, 2).map((value) => value.id),
        chosenChoiceId: null,
        result: null,
      };
      const result = applyCommand(state, {
        type: 'select-event-choice',
        eventId: 'water-dispute',
        choiceId,
      });
      expect(result.accepted).toBe(true);
      expect(result.state.survivors.map((value) => value.morale)).toEqual(
        Array(3).fill(choiceId === 'ration' ? 56 : 66),
      );
      expect(result.state.survivors.map((value) => value.needs.energy)).toEqual(
        Array(3).fill(choiceId === 'ration' ? 80 : 72),
      );
    },
  );

  it.each(['morale', 'injury'] as const)(
    'keeps delayed %s effects and the initial injury morale penalty unscaled',
    (kind) => {
      const state = fixture();
      state.survivors[0]!.traits = ['hot-headed', 'tireless'];
      state.survivors[1]!.traits = ['optimist', 'cautious'];
      state.scheduledEffects.push({
        id: 'trait-delayed-effect',
        dueTick: 1,
        sourceEventId: 'water-dispute',
        sourceChoiceId: 'ration',
        effect: { kind, amount: kind === 'morale' ? -4 : 1, targetScope: 'group' },
        description: 'Controlled direct-effect fixture',
      });
      const next = advanceStep(state);
      expect(next.scheduledEffects).toHaveLength(0);
      expect(next.survivors.map((value) => value.morale)).toEqual(
        Array(3).fill(kind === 'morale' ? 56 : 55),
      );
      if (kind === 'injury')
        expect(next.survivors.every((value) => value.injury?.severity === 1)).toBe(true);
    },
  );

  it('Tireless arrives earlier and reduces ongoing awake energy loss by 25%', () => {
    const runs = [[], ['tireless'] as TraitId[]].map((traits) => {
      let state = plan(traits, 'gather-food');
      let ticks = 1;
      while (state.survivors[0]!.activeTask!.phase === 'travel') {
        state = advanceStep(state);
        ticks++;
      }
      return { ticks, energyPerTick: (80 - state.survivors[0]!.needs.energy) / ticks };
    });
    expect(runs.map((value) => value.ticks)).toEqual([20, 17]);
    expect(runs[1]!.energyPerTick).toBeCloseTo(runs[0]!.energyPerTick * 0.75, 10);
  });

  it('generates every compatible pair deterministically without changing the six-trait set', () => {
    const random = new DeterministicRandom(8);
    const replay = new DeterministicRandom(8);
    const seen = new Set<string>();
    for (let index = 0; index < 500; index++) {
      const pair = generateTraitPair(random);
      expect(pair).toEqual(generateTraitPair(replay));
      expect(new Set(pair).size).toBe(2);
      expect(traitsAreCompatible(pair)).toBe(true);
      seen.add([...pair].sort().join(','));
    }
    expect(TRAIT_DEFINITIONS).toHaveLength(6);
    expect(seen.size).toBe(13);
    for (const other of ['optimist', 'cautious'] as const) {
      expect(traitsAreCompatible(['hot-headed', other])).toBe(false);
      expect(traitsAreCompatible([other, 'hot-headed'])).toBe(false);
    }
  });
});
