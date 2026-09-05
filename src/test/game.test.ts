import { describe, expect, it } from 'vitest';
import { createIslandState } from '../game/island';
import { DeterministicRandom, RANDOM_STREAM_NAMES, createRandomStreamStates } from '../game/random';
import { advanceStep, applyCommand, createGame, createSnapshot } from '../game/simulation';
import { EVENT_BY_ID } from '../game/events';
import { SLICE_GAME_CONFIG } from '../game/tuning';
import type { GameState } from '../game/types';

describe('M0 deterministic game core', () => {
  it('creates three distinct moving survivors from a seed', () => {
    const initial = createGame('movement-seed');
    const next = advanceStep(initial);

    expect(initial.survivors).toHaveLength(3);
    expect(new Set(initial.survivors.map((survivor) => survivor.id)).size).toBe(3);
    expect(new Set(initial.survivors.map((survivor) => survivor.name)).size).toBe(3);
    expect(next.clock.tick).toBe(1);
    expect(next.survivors.map((survivor) => survivor.position)).not.toEqual(
      initial.survivors.map((survivor) => survivor.position),
    );
  });

  it('reproduces the complete state and all independent random streams', () => {
    const initial = createGame('replay-seed');
    const restored = JSON.parse(JSON.stringify(initial)) as GameState;
    const next = advanceStep(initial);
    const restoredNext = advanceStep(restored);

    expect(restored).toEqual(initial);
    expect(restoredNext).toEqual(next);
    expect(Object.keys(initial.rngStates)).toEqual([...RANDOM_STREAM_NAMES]);
  });

  it('consumes behavior randomness without perturbing other streams', () => {
    const initial = createGame('independent-streams');
    let next = initial;
    for (let step = 0; step < initial.config.movementTicks; step += 1) {
      next = advanceStep(next);
    }

    expect(next.rngStates.behavior).not.toEqual(initial.rngStates.behavior);
    expect(next.rngStates.survivorGeneration).toEqual(initial.rngStates.survivorGeneration);
    expect(next.rngStates.islandCosmetics).toEqual(initial.rngStates.islandCosmetics);
    expect(next.rngStates.eventSelection).toEqual(initial.rngStates.eventSelection);
    expect(next.rngStates.eventOutcome).toEqual(initial.rngStates.eventOutcome);
  });

  it('publishes snapshots detached from authoritative state', () => {
    const state = createGame('snapshot-detachment');
    const snapshot = createSnapshot(state);
    snapshot.survivors[0]!.position.x = 0;

    expect(state.survivors[0]!.position.x).not.toBe(0);
  });

  it('reaches rescue at the configured terminal tick', () => {
    let state = createGame({ ...SLICE_GAME_CONFIG, seed: 'rescue-seed' });
    while (state.status !== 'victory' && state.status !== 'defeat') {
      if (state.status === 'running') state = advanceStep(state);
      else if (state.status === 'decision') {
        const event = state.activeEvent!;
        state = applyCommand(state, {
          type: 'select-event-choice',
          eventId: event.id,
          choiceId: EVENT_BY_ID[event.id].choices[0]!.id,
        }).state;
      } else {
        state = applyCommand(state, {
          type: 'acknowledge-event-result',
          eventId: state.activeEvent!.id,
        }).state;
      }
    }

    expect(state.status).toBe('victory');
    expect(state.clock.tick).toBe(state.config.rescueTick);
    expect(state.clock.day).toBe(3);
    expect(state.survivors.every((survivor) => survivor.alive)).toBe(true);
  });

  it('exports each stream after its initialization draws are consumed', () => {
    const seed = 'stream-consumption-seed';
    const expectedIslandRandom = new DeterministicRandom(
      createRandomStreamStates(seed).islandCosmetics,
    );
    createIslandState(expectedIslandRandom);

    const state = createGame(seed);

    expect(state.rngStates.islandCosmetics).toEqual(expectedIslandRandom.exportState());
  });
});
