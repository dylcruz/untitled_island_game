import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, EVENT_BY_ID } from '../game';
import { participantsFor } from '../game/simulation';
import type { EventId, GameState } from '../game';
import { parseSaveEnvelope, serializeSave } from '../persistence';

function choose(state: GameState, eventId: EventId = 'freshwater-seep'): GameState {
  const event = EVENT_BY_ID[eventId];
  state.status = 'decision';
  state.activeEvent = {
    id: eventId,
    activatedTick: state.clock.tick,
    participantIds: participantsFor(state, event)!,
    chosenChoiceId: null,
    result: null,
  };
  const result = applyCommand(state, {
    type: 'select-event-choice',
    eventId,
    choiceId: event.choices.at(-1)!.id,
  });
  expect(result.accepted).toBe(true);
  return applyCommand(result.state, { type: 'acknowledge-event-result', eventId }).state;
}

const single = EVENT_BY_ID['freshwater-seep'];
const pair = EVENT_BY_ID['night-watch'];

describe('deterministic event participation', () => {
  it('breaks ties independently of array order and spreads first opportunities across seeds', () => {
    const winners = new Set<string>();
    for (let index = 0; index < 100; index++) {
      const state = createGame(`participation-${index}`);
      const rng = structuredClone(state.rngStates);
      const before = participantsFor(state, single);
      winners.add(before![0]!);
      const beforePair = participantsFor(state, pair);
      state.survivors.reverse();
      expect(participantsFor(state, single)).toEqual(before);
      expect(participantsFor(state, pair)).toEqual(beforePair);
      expect(state.rngStates).toEqual(rng);
    }
    expect(winners.size).toBe(3);
  });

  it('gives every eligible survivor a turn before repeating a single participant', () => {
    let state = createGame('recency');
    const selected: string[] = [];
    for (let index = 0; index < 6; index++) {
      selected.push(...participantsFor(state, single)!);
      state = choose(state, single.id);
      state.clock.tick += 1;
    }
    expect(new Set(selected.slice(0, 3)).size).toBe(3);
    expect(selected.slice(3)).toEqual(selected.slice(0, 3));
  });

  it('distributes pairs and keeps group consequences separate from personal memories', () => {
    let state = createGame('pairs');
    const counts: Record<string, number> = {};
    for (let index = 0; index < 3; index++) {
      const ids = participantsFor(state, pair)!;
      for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
      state = choose(state, pair.id);
      state.clock.tick += 1;
    }
    expect(Object.values(counts).sort()).toEqual([2, 2, 2]);
    const before = state.survivors.map((survivor) => survivor.morale);
    const ids = participantsFor(state, EVENT_BY_ID['signal-answer'])!;
    state = choose(state, 'signal-answer');
    for (const [index, survivor] of state.survivors.entries()) {
      expect(survivor.morale).toBeLessThan(before[index]!);
      expect(
        state.turningPoints.some(
          (point) =>
            point.sourceEventId === 'signal-answer' && point.survivorIds.includes(survivor.id),
        ),
      ).toBe(ids.includes(survivor.id));
    }
  });

  it('preserves traits, injuries, awake availability, and the all-asleep fallback', () => {
    const state = createGame('eligibility');
    for (const survivor of state.survivors) survivor.traits = ['optimist', 'cautious'];
    const target = state.survivors[2]!;
    target.traits = ['forager', 'cautious'];
    expect(participantsFor(state, { ...single, participantRule: 'forager' })).toEqual([target.id]);
    expect(participantsFor(state, { ...single, participantRule: 'injured' })).toBeNull();
    target.injury = {
      kind: 'sprain',
      severity: 1,
      recoveryTicksRemaining: 100,
      productivityModifier: 0.8,
    };
    expect(participantsFor(state, { ...single, participantRule: 'injured' })).toEqual([target.id]);
    target.activeTask = { ...target.activeTask!, kind: 'sleep' };
    expect(participantsFor(state, { ...single, participantRule: 'forager' })).toBeNull();
    for (const survivor of state.survivors)
      survivor.activeTask = { ...survivor.activeTask!, kind: 'sleep' };
    expect(participantsFor(state, { ...single, participantRule: 'forager' })).toEqual([target.id]);
    target.alive = false;
    expect(participantsFor(state, { ...single, participantRule: 'forager' })).toBeNull();
    state.survivors[1]!.alive = false;
    expect(participantsFor(state, pair)).toBeNull();
  });

  it('retains eligible original follow-up participants and resumes the same selection from saves', () => {
    let state = createGame('follow-up-recent');
    state.status = 'decision';
    state.activeEvent = {
      id: single.id,
      activatedTick: 0,
      participantIds: participantsFor(state, single)!,
      chosenChoiceId: null,
      result: null,
    };
    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: single.id,
      choiceId: 'mark-source',
    }).state;
    state = applyCommand(state, { type: 'acknowledge-event-result', eventId: single.id }).state;
    const original = state.choiceRecords[0]!.participantIds;
    const follow = EVENT_BY_ID['seep-follow-up'];
    expect(participantsFor(state, follow)).toEqual(original);
    expect(participantsFor(state, single)).not.toEqual(original);
    const restored = parseSaveEnvelope(serializeSave(state));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(participantsFor(restored.state, follow)).toEqual(original);
    expect(choose(restored.state, single.id)).toEqual(choose(state, single.id));
    const survivor = state.survivors.find((value) => value.id === original[0])!;
    survivor.activeTask = { ...survivor.activeTask!, kind: 'sleep' };
    expect(participantsFor(state, follow)).not.toEqual(original);
    survivor.alive = false;
    expect(participantsFor(state, follow)).not.toEqual(original);
    state.choiceRecords[0]!.choiceId = 'drink-now';
    expect(participantsFor(state, follow)).toEqual(
      participantsFor(state, { ...follow, requiresPriorChoice: undefined }),
    );
  });
});
