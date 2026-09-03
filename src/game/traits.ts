import type { DeterministicRandom } from './random';
import type { TraitDefinition, TraitId } from './types';

export const TRAIT_DEFINITIONS = [
  {
    id: 'forager',
    name: 'Forager',
    description: 'Finds more food.',
    incompatibleWith: [],
    productivity: { food: 1.25 },
    moraleLossMultiplier: 1,
  },
  {
    id: 'resourceful',
    name: 'Resourceful',
    description: 'Gets more value from materials.',
    incompatibleWith: [],
    productivity: { materials: 1.2 },
    moraleLossMultiplier: 1,
  },
  {
    id: 'optimist',
    name: 'Optimist',
    description: 'Loses morale slowly.',
    incompatibleWith: ['hot-headed'],
    productivity: {},
    moraleLossMultiplier: 0.65,
  },
  {
    id: 'hot-headed',
    name: 'Hot-headed',
    description: 'Works hard but reacts strongly to conflict.',
    incompatibleWith: ['optimist', 'cautious'],
    productivity: { materials: 1.1 },
    moraleLossMultiplier: 1.35,
  },
  {
    id: 'tireless',
    name: 'Tireless',
    description: 'Spends less energy while working and traveling.',
    incompatibleWith: [],
    productivity: { travel: 1.2 },
    moraleLossMultiplier: 1,
  },
  {
    id: 'cautious',
    name: 'Cautious',
    description: 'Safer but slower in dangerous places.',
    incompatibleWith: ['hot-headed'],
    productivity: { dangerous: 0.85 },
    moraleLossMultiplier: 0.9,
  },
] as const satisfies readonly TraitDefinition[];

export const TRAIT_BY_ID = Object.fromEntries(
  TRAIT_DEFINITIONS.map((trait) => [trait.id, trait]),
) as unknown as Readonly<Record<TraitId, TraitDefinition>>;

export function traitsAreCompatible(ids: readonly TraitId[]): boolean {
  return ids.every((id) =>
    ids.every((other) => id === other || !TRAIT_BY_ID[id].incompatibleWith.includes(other)),
  );
}

export function generateTraitPair(random: DeterministicRandom): TraitId[] {
  const candidates: [TraitId, TraitId][] = [];
  for (let first = 0; first < TRAIT_DEFINITIONS.length; first += 1)
    for (let second = first + 1; second < TRAIT_DEFINITIONS.length; second += 1) {
      const pair: [TraitId, TraitId] = [
        TRAIT_DEFINITIONS[first]!.id,
        TRAIT_DEFINITIONS[second]!.id,
      ];
      if (traitsAreCompatible(pair)) candidates.push(pair);
    }
  return [...candidates[random.integer(0, candidates.length - 1)]!];
}

export function productivityMultiplier(
  traits: readonly TraitId[],
  kind: 'food' | 'materials' | 'travel' | 'dangerous',
): number {
  return traits.reduce((value, trait) => value * (TRAIT_BY_ID[trait].productivity[kind] ?? 1), 1);
}

export function moraleLossMultiplier(traits: readonly TraitId[]): number {
  return traits.reduce((value, trait) => value * TRAIT_BY_ID[trait].moraleLossMultiplier, 1);
}
