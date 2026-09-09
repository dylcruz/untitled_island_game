import type { ResolvedEffect, ResolvedOutcome, SurvivorState } from './types';

export function cloneOutcome(outcome: ResolvedOutcome): ResolvedOutcome {
  return {
    effects: outcome.effects.map((entry) => ({
      ...entry,
      effect: { ...entry.effect },
      changes: entry.changes.map((change) => ({ ...change })),
      injuries: entry.injuries.map((injury) => ({
        ...injury,
        before: injury.before ? { ...injury.before } : null,
        after: { ...injury.after },
      })),
    })),
  };
}

export function describeResolvedEffect(
  entry: ResolvedEffect,
  survivors: readonly Pick<SurvivorState, 'id' | 'name'>[],
): string {
  const label = entry.effect.target ?? entry.effect.kind;
  if (!entry.fired) return `${label} risk did not occur.`;
  const name = (id?: string) => survivors.find((survivor) => survivor.id === id)?.name ?? 'Camp';
  const details = entry.injuries.map(
    (injury) =>
      `${name(injury.survivorId)} suffered a ${injury.after.kind} (severity ${injury.after.severity})`,
  );
  for (const change of entry.changes) {
    const amount = Number(change.delta.toFixed(6));
    details.push(
      `${name(change.survivorId)}: ${change.target ?? change.kind} ${amount > 0 ? '+' : ''}${amount}${change.delta === 0 ? ' (unchanged)' : ''}`,
    );
  }
  return details.length ? `${details.join('; ')}.` : `No eligible target for ${label}.`;
}

export function describeOutcome(
  choiceLabel: string,
  outcome: ResolvedOutcome,
  survivors: readonly Pick<SurvivorState, 'id' | 'name'>[],
): string {
  return `${choiceLabel}. ${outcome.effects.map((effect) => describeResolvedEffect(effect, survivors)).join(' ') || 'No immediate changes.'}`;
}
