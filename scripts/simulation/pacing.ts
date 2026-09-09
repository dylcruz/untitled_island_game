import { deriveRunPhase } from '../../src/game/simulation';

export interface IneligiblePeriod {
  startTick: number;
  endTick: number;
  reason: 'no-eligible-content';
}

export function summarizePacing(
  decisionTicks: readonly number[],
  endingTick: number,
  ticksPerDay: number,
  ineligiblePeriods: readonly IneligiblePeriod[] = [],
) {
  const boundaries = [0, ...decisionTicks, endingTick];
  const intervals = boundaries.slice(1).map((endTick, index) => {
    const startTick = boundaries[index]!;
    const overdueStart = startTick + 2 * ticksPerDay;
    const ineligibleTicks = ineligiblePeriods.reduce(
      (sum, period) =>
        sum +
        Math.max(0, Math.min(endTick, period.endTick) - Math.max(overdueStart, period.startTick)),
      0,
    );
    return {
      startTick,
      endTick,
      ticks: endTick - startTick,
      unexplainedOverdueTicks: Math.max(0, endTick - overdueStart - ineligibleTicks),
    };
  });
  return {
    decisionTicks: [...decisionTicks],
    startToFirstDecisionTicks: decisionTicks[0] ?? null,
    lastDecisionToEndingTicks: decisionTicks.length ? endingTick - decisionTicks.at(-1)! : null,
    maxDecisionGapTicks: Math.max(...intervals.map((gap) => gap.ticks)),
    decisionsPerPhase: Object.fromEntries(
      ['early', 'middle', 'late'].map((phase) => [
        phase,
        decisionTicks.filter((tick) => deriveRunPhase(Math.floor(tick / ticksPerDay) + 1) === phase)
          .length,
      ]),
    ),
    intervals,
    ineligiblePeriods,
    gapCompliance: intervals.every((gap) => gap.unexplainedOverdueTicks === 0),
  };
}
