import { createHash } from 'node:crypto';
import { DeterministicRandom, EVENT_BY_ID, TUNING } from '../../src/game/index';
import type {
  CampPriority,
  ChoiceId,
  EventChoiceDefinition,
  EventId,
  GameState,
  ResourceId,
} from '../../src/game/index';

export type PolicyId = 'conservative' | 'resource-greedy' | 'random-fuzz';

export interface SimulationPolicy {
  id: PolicyId;
  version: string;
  policySeed: string;
  chooseCampPriority(state: GameState): CampPriority | null;
  chooseEventChoice(state: GameState): ChoiceId;
}

const PRIORITIES: readonly CampPriority[] = ['balanced', 'water', 'food', 'build', 'recover'];
const CONSERVATIVE_CHOICES: Readonly<Partial<Record<EventId, ChoiceId>>> = {
  'tide-pools': 'harvest',
  'interior-signal': 'turn-back',
  'water-dispute': 'hear-them-out',
  'fallen-palm': 'move-on',
  'leaking-roof': 'patch',
  'forager-instinct': 'trust-instinct',
  'smoke-on-horizon': 'conserve',
  'signal-answer': 'save-fuel',
  'freshwater-seep': 'mark-source',
  'seep-follow-up': 'collect-carefully',
  'storm-front': 'wait-it-out',
  'driftwood-cache': 'leave-wood',
  'night-watch': 'sleep-safe',
};

function incoming(state: GameState, resource: ResourceId): number {
  return state.reservations.reduce((total, reservation) => {
    if (reservation.kind === 'materials') return total;
    const actual =
      reservation.sourceId === 'water'
        ? 'water'
        : reservation.sourceId === 'forage'
          ? 'food'
          : 'materials';
    return actual === resource ? total + reservation.expectedYield : total;
  }, 0);
}

function conservativePriority(state: GameState): CampPriority {
  const living = state.survivors.filter((survivor) => survivor.alive).length;
  if (
    state.resources.water + incoming(state, 'water') <
    living * TUNING.planner.targetStockPerSurvivor.water
  )
    return 'water';
  if (
    state.resources.food + incoming(state, 'food') <
    living * TUNING.planner.targetStockPerSurvivor.food
  )
    return 'food';
  if (
    state.survivors.some(
      (survivor) =>
        survivor.alive &&
        (survivor.injury !== null || survivor.needs.health < 60 || survivor.needs.energy <= 35),
    )
  )
    return 'recover';
  if (
    state.shelter.condition < TUNING.shelter.poorThreshold ||
    state.resources.materials < TUNING.shelter.repairMaterials
  )
    return 'build';
  return 'balanced';
}

function affordable(state: GameState, choice: EventChoiceDefinition): boolean {
  return choice.immediateEffects.every(
    (effect) =>
      effect.kind !== 'resource' ||
      effect.amount >= 0 ||
      !effect.target ||
      state.resources[effect.target as ResourceId] >= -effect.amount,
  );
}

function stableSeed(gameSeed: string, id: PolicyId, version: string): string {
  return createHash('sha256').update(`${gameSeed}\u0000${id}\u0000${version}`).digest('hex');
}

export function createPolicy(id: PolicyId, gameSeed: string): SimulationPolicy {
  const version = id === 'conservative' ? '1.0.0' : id === 'resource-greedy' ? '1.0.0' : '1.0.0';
  const policySeed = stableSeed(gameSeed, id, version);
  const random = new DeterministicRandom(Number.parseInt(policySeed.slice(0, 8), 16));
  return {
    id,
    version,
    policySeed,
    chooseCampPriority(state) {
      if (id === 'conservative') return conservativePriority(state);
      if (id === 'resource-greedy') {
        const living = Math.max(1, state.survivors.filter((survivor) => survivor.alive).length);
        const ratios: [CampPriority, number][] = [
          ['water', state.resources.water / (living * TUNING.planner.targetStockPerSurvivor.water)],
          ['food', state.resources.food / (living * TUNING.planner.targetStockPerSurvivor.food)],
          ['build', state.resources.materials / Math.max(1, TUNING.shelter.repairMaterials)],
        ];
        return ratios.sort(
          (left, right) => left[1] - right[1] || left[0].localeCompare(right[0]),
        )[0]![0];
      }
      const alternatives = PRIORITIES.filter((priority) => priority !== state.campPolicy.priority);
      return alternatives[random.integer(0, alternatives.length - 1)]!;
    },
    chooseEventChoice(state) {
      const eventId = state.activeEvent!.id;
      const choices = EVENT_BY_ID[eventId].choices.filter((choice) => affordable(state, choice));
      if (!choices.length) return EVENT_BY_ID[eventId].choices[0]!.id;
      if (id === 'conservative') {
        const preferred = CONSERVATIVE_CHOICES[eventId];
        return (
          choices.find((choice) => choice.id === preferred)?.id ??
          [...choices].sort((left, right) => left.id.localeCompare(right.id))[0]!.id
        );
      }
      if (id === 'random-fuzz') return choices[random.integer(0, choices.length - 1)]!.id;
      const score = (choice: EventChoiceDefinition): number =>
        choice.immediateEffects.reduce(
          (total, effect) =>
            total + (effect.kind === 'resource' ? effect.amount * 4 : effect.amount),
          choice.risk.level === 'moderate' ? 2 : choice.risk.level === 'high' ? -6 : 0,
        );
      return [...choices].sort(
        (left, right) => score(right) - score(left) || left.id.localeCompare(right.id),
      )[0]!.id;
    },
  };
}

export const POLICY_IDS: readonly PolicyId[] = ['conservative', 'resource-greedy', 'random-fuzz'];
