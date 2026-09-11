import {
  availableUnreserved,
  CRITICAL_HEALTH,
  economyRates,
  estimatedIncoming,
  hardConstraintTask,
  plannerStockTarget,
  reservedMaterials,
} from './simulation';
import { TUNING } from './tuning';
import type { GameState, ResourceId } from './types';

/** Read-only planning context; no forecast of future consumption or event outcomes. */
export function deriveCampOutlook(state: GameState) {
  const living = state.survivors.filter((survivor) => survivor.alive);
  const nextDawn =
    (Math.floor(state.clock.tick / state.config.ticksPerDay) + 1) * state.config.ticksPerDay;
  const nextReplenishmentTick =
    nextDawn < state.config.rescueTick && living.length ? nextDawn : null;
  const supplies = (['water', 'food', 'materials'] as const).map((resource: ResourceId) => {
    const stored = state.resources[resource];
    const incoming = estimatedIncoming(state, resource);
    const target = plannerStockTarget(state, resource);
    return {
      resource,
      stored,
      incoming,
      target,
      shortfall: Math.max(0, target - stored - incoming),
    };
  });
  const needs = living.flatMap((survivor) => {
    const { thirst, hunger, energy, health } = survivor.needs;
    return [
      { kind: 'thirst', remaining: 100 - thirst, pressure: thirst / TUNING.critical.thirst },
      { kind: 'hunger', remaining: 100 - hunger, pressure: hunger / TUNING.critical.hunger },
      { kind: 'health', remaining: health, pressure: (100 - health) / (100 - CRITICAL_HEALTH) },
      {
        kind: 'energy',
        remaining: energy,
        pressure: (100 - energy) / (100 - TUNING.critical.energy),
      },
    ].map((need) => ({
      ...need,
      survivorId: survivor.id,
      name: survivor.name,
      critical: need.pressure >= 1,
    }));
  });
  // Compare progress toward each core critical threshold, with stable ties.
  needs.sort(
    (a, b) =>
      b.pressure - a.pressure ||
      a.survivorId.localeCompare(b.survivorId) ||
      a.kind.localeCompare(b.kind),
  );
  return {
    livingCount: living.length,
    supplies,
    urgentNeed: needs[0] ?? null,
    nextReplenishmentTick,
    sources: Object.values(state.island.sourceStates).map((source) => ({
      ...source,
      unreserved: availableUnreserved(state, source.id),
      replenishment:
        source.id === 'wreckage' ? 0 : economyRates(state).dawnReplenishment[source.id],
    })),
    reservedMaterials: reservedMaterials(state),
    work: living.map((survivor) => ({
      name: survivor.name,
      task: survivor.activeTask?.kind ?? null,
      reason: survivor.activeTask?.reason.code ?? null,
      previousPriority:
        !!survivor.activeTask &&
        survivor.activeTask.reason.params.priority !== state.campPolicy.priority,
      constraint: hardConstraintTask(state, survivor)?.[1] ?? null,
    })),
  };
}
