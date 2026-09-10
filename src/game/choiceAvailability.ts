import type { EventChoiceDefinition, GameState, ResourceId } from './types';

/** The same up-front costs used by command validation, including conditional losses.
 * Gains and delayed effects cannot finance an immediate cost.
 */
export function getChoiceAvailability(
  resources: GameState['resources'],
  choice: EventChoiceDefinition,
) {
  const amounts = new Map<ResourceId, number>();
  for (const effect of choice.immediateEffects) {
    if (effect.kind !== 'resource' || effect.amount >= 0 || !effect.target) continue;
    const resource = effect.target as ResourceId;
    if (!(resource in resources)) continue;
    amounts.set(resource, (amounts.get(resource) ?? 0) - effect.amount);
  }
  const costs = [...amounts].map(([resource, amount]) => ({
    resource,
    amount,
    available: resources[resource],
  }));
  const shortages = costs.filter(({ available, amount }) => available < amount);
  return { costs, shortages, affordable: shortages.length === 0 };
}
