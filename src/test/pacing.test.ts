/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import {
  advanceStep,
  applyCommand,
  createGame,
  EVENT_BY_ID,
  TUNING,
  PRODUCTION_EVENT_DEFINITIONS,
  hasEligibleDecisionContent,
} from '../game';
import { createPolicy } from '../../scripts/simulation/policies';
import { summarizePacing } from '../../scripts/simulation/pacing';
import { parseSaveEnvelope, serializeSave } from '../persistence';

describe('full arc pacing', () => {
  it.each(['ci', 'review-1', 'review-2', 'review-3', 'review-4', 'review-5'])(
    'covers the full arc and preserves promises for %s',
    (seed) => {
      const run = () => {
        let state = createGame(seed);
        const policy = createPolicy('conservative', seed);
        const ticks: number[] = [];
        for (
          let guard = 0;
          guard < 9000 && !['victory', 'defeat'].includes(state.status);
          guard++
        ) {
          if (state.status === 'running') {
            const priority = policy.chooseCampPriority(state);
            if (priority)
              state = applyCommand(state, { type: 'set-camp-priority', priority }).state;
            state = advanceStep(state);
          } else if (state.status === 'decision') {
            ticks.push(state.clock.tick);
            const eventId = state.activeEvent!.id;
            state = applyCommand(state, {
              type: 'select-event-choice',
              eventId,
              choiceId: policy.chooseEventChoice(state),
            }).state;
            expect(parseSaveEnvelope(serializeSave(state)).ok).toBe(true);
          } else {
            state = applyCommand(state, {
              type: 'acknowledge-event-result',
              eventId: state.activeEvent!.id,
            }).state;
          }
        }
        expect(state.status).toBe('victory');
        expect(ticks.length).toBeGreaterThanOrEqual(8);
        expect(ticks.length).toBeLessThanOrEqual(10);
        const pacing = summarizePacing(ticks, state.clock.tick, 600);
        expect(pacing.decisionsPerPhase).toEqual({ early: 3, middle: 4, late: 3 });
        expect(pacing.maxDecisionGapTicks).toBeLessThanOrEqual(1200);
        expect(ticks.slice(1).every((tick, i) => tick - ticks[i]! >= 480)).toBe(true);
        for (const record of state.choiceRecords) {
          const follow = EVENT_BY_ID[record.eventId].choices.find(
            (choice) => choice.id === record.choiceId,
          )?.followUpEventId;
          if (follow)
            expect(
              state.choiceRecords.some(
                (later) => later.eventId === follow && later.tick > record.tick,
              ),
            ).toBe(true);
        }
        return state;
      };
      expect(run()).toEqual(run());
    },
  );

  it('spends the last reserved slot on a queued follow-up and survives save/resume', () => {
    let state = createGame('near-cap');
    state.clock = { ...state.clock, tick: 6990, day: 12 };
    state.metrics.interactiveEventCount = 9;
    state.metrics.lastDecisionTick = 6990;
    state.eventSchedule.lastDecisionTick = 6990;
    state.status = 'decision';
    state.activeEvent = {
      id: 'freshwater-seep',
      activatedTick: 6990,
      participantIds: [state.survivors[0]!.id],
      chosenChoiceId: null,
      result: null,
    };
    state = applyCommand(state, {
      type: 'select-event-choice',
      eventId: 'freshwater-seep',
      choiceId: 'mark-source',
    }).state;
    state = applyCommand(state, {
      type: 'acknowledge-event-result',
      eventId: 'freshwater-seep',
    }).state;
    const saved = parseSaveEnvelope(serializeSave(state));
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    state = saved.state;
    while (state.status === 'running') state = advanceStep(state);
    expect(state.activeEvent?.id).toBe('seep-follow-up');
    expect(state.clock.tick).toBe(7830);
    expect(state.metrics.interactiveEventCount).toBe(TUNING.productionEventDecisionCap);
    expect(state.eventSchedule.pendingFollowUps).toEqual([]);
  });

  it('keeps a root that can promise a follow-up out of the last slot', () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = createGame(`last-slot-${seed}`);
      state.clock.tick = 7829;
      state.clock.day = 14;
      state.metrics.interactiveEventCount = 9;
      state.metrics.lastDecisionTick = 6990;
      state.eventSchedule.lastDecisionTick = 6990;
      state.eventSchedule.nextEventTick = 7830;
      state.eventSchedule.usedEventIds = PRODUCTION_EVENT_DEFINITIONS.filter(
        (event) => !['smoke-on-horizon', 'driftwood-cache'].includes(event.id),
      ).map((event) => event.id);
      expect(advanceStep(state).activeEvent?.id).toBe('driftwood-cache');
    }
  });

  it('does not label a spent budget as content ineligibility', () => {
    const state = createGame('eligibility');
    state.clock.tick = 8000;
    state.clock.day = 14;
    state.metrics.interactiveEventCount = 10;
    expect(hasEligibleDecisionContent(state)).toBe(true);
    state.survivors.forEach((survivor) => {
      survivor.alive = false;
    });
    expect(hasEligibleDecisionContent(state)).toBe(false);
  });

  it('measures both boundaries, zero-decision defeat, and only evidenced ineligibility', () => {
    expect(summarizePacing([270, 4590], 8400, 600).gapCompliance).toBe(false);
    expect(summarizePacing([], 50, 600)).toMatchObject({
      startToFirstDecisionTicks: null,
      lastDecisionToEndingTicks: null,
      maxDecisionGapTicks: 50,
      gapCompliance: true,
    });
    expect(summarizePacing([1500], 1600, 600).gapCompliance).toBe(false);
    expect(
      summarizePacing([1500], 1600, 600, [
        { startTick: 1200, endTick: 1500, reason: 'no-eligible-content' },
      ]).gapCompliance,
    ).toBe(true);
    expect(
      summarizePacing([1500], 1600, 600, [
        { startTick: 1200, endTick: 1400, reason: 'no-eligible-content' },
      ]).gapCompliance,
    ).toBe(false);
  });

  it('ends immediately on early defeat without trying to fill remaining slots', () => {
    const state = createGame('early-defeat');
    state.survivors.forEach((survivor) => {
      survivor.needs.health = 0;
    });
    const ended = advanceStep(state);
    expect(ended.status).toBe('defeat');
    expect(ended.metrics.interactiveEventCount).toBe(0);
    expect(advanceStep(ended)).toEqual(ended);
  });
});
