import type { EventDefinition, EventId } from './types';

/** The M1 slice registry is intentionally stable. */
export const EVENT_DEFINITIONS = [
  {
    id: 'supply-cache',
    title: 'A Sealed Supply Cache',
    earliestTick: 1,
    description: 'A tide-worn case is wedged beneath the wreckage.',
    choices: [
      {
        id: 'open-carefully',
        label: 'Open it carefully',
        result: 'The cache holds useful rations.',
        immediateEffects: [{ kind: 'resource', target: 'food', amount: 3 }],
      },
      {
        id: 'force-open',
        label: 'Force it open',
        result: 'You recover more, but a hidden cut begins to ache.',
        immediateEffects: [{ kind: 'resource', target: 'food', amount: 5 }],
        delayedEffect: {
          delayTicks: 24,
          effect: { kind: 'health', amount: -12 },
          description: 'The untreated cut worsens.',
        },
      },
    ],
  },
  {
    id: 'storm-warning',
    title: 'Storm Warning',
    earliestTick: 1,
    description: 'A dark line of weather gathers beyond the reef.',
    choices: [
      {
        id: 'secure-camp',
        label: 'Secure camp',
        result: 'The camp is made ready before the squall.',
        immediateEffects: [{ kind: 'need', target: 'energy', amount: -8 }],
      },
      {
        id: 'rest-through-it',
        label: 'Conserve energy',
        result: 'Rest helps, although supplies are soaked.',
        immediateEffects: [
          { kind: 'need', target: 'energy', amount: 10 },
          { kind: 'resource', target: 'food', amount: -1 },
        ],
      },
    ],
  },
  {
    id: 'strange-tracks',
    title: 'Tracks at the Treeline',
    earliestTick: 1,
    description: 'Fresh tracks circle the edge of camp and vanish inland.',
    choices: [
      {
        id: 'investigate',
        label: 'Investigate',
        result: 'The trail leads to a useful water pocket.',
        immediateEffects: [
          { kind: 'resource', target: 'water', amount: 2 },
          { kind: 'need', target: 'energy', amount: -5 },
        ],
      },
      {
        id: 'stay-safe',
        label: 'Stay at camp',
        result: 'The tracks fade while you recover.',
        immediateEffects: [{ kind: 'need', target: 'energy', amount: 8 }],
      },
    ],
  },
] as const satisfies readonly EventDefinition[];

export const PRODUCTION_EVENT_DEFINITIONS = [
  {
    id: 'tide-pools',
    category: 'resource',
    title: 'Tide Pools',
    earliestTick: 1,
    phases: ['early', 'middle'],
    weight: 4,
    participantRule: 'any',
    description: 'A low tide exposes food, but the rocks are sharp.',
    choices: [
      {
        id: 'harvest',
        label: 'Harvest quickly',
        result: 'The group carries shellfish back to camp.',
        immediateEffects: [
          { kind: 'resource', target: 'food', amount: 4 },
          { kind: 'need', target: 'energy', amount: -6, targetScope: 'participant' },
        ],
      },
      {
        id: 'leave-it',
        label: 'Leave it alone',
        result: 'The group avoids the slippery rocks.',
        immediateEffects: [{ kind: 'morale', amount: 2, targetScope: 'group' }],
      },
    ],
  },
  {
    id: 'interior-signal',
    category: 'exploration',
    title: 'A Ridge Above the Trees',
    earliestTick: 1,
    phases: ['early', 'middle'],
    weight: 3,
    participantRule: 'any',
    description: 'A ridge may reveal a better signal point.',
    choices: [
      {
        id: 'climb',
        label: 'Climb the ridge',
        result: 'The view reveals a clear line to the horizon.',
        immediateEffects: [
          { kind: 'morale', amount: 6, targetScope: 'group' },
          { kind: 'need', target: 'energy', amount: -12, targetScope: 'participant' },
        ],
      },
      {
        id: 'turn-back',
        label: 'Turn back',
        result: 'Safety wins over discovery.',
        immediateEffects: [{ kind: 'morale', amount: -2, targetScope: 'participant' }],
      },
    ],
  },
  {
    id: 'water-dispute',
    category: 'conflict',
    title: 'The Last Canteen',
    earliestTick: 1,
    phases: ['middle', 'late'],
    weight: 4,
    participantRule: 'pair',
    requiresResource: 'water',
    description: 'Two survivors disagree over rationing.',
    choices: [
      {
        id: 'ration',
        label: 'Enforce equal rations',
        result: 'The rule is fair, if unpopular.',
        immediateEffects: [{ kind: 'morale', amount: -4, targetScope: 'group' }],
      },
      {
        id: 'hear-them-out',
        label: 'Hear both sides',
        result: 'A long conversation restores trust but costs time.',
        immediateEffects: [
          { kind: 'morale', amount: 6, targetScope: 'group' },
          { kind: 'need', target: 'energy', amount: -8, targetScope: 'group' },
        ],
      },
    ],
  },
  {
    id: 'fallen-palm',
    category: 'injury',
    title: 'A Fallen Palm',
    earliestTick: 1,
    phases: ['early', 'middle', 'late'],
    weight: 3,
    participantRule: 'any',
    description: 'Useful coconuts hang beyond a splintered trunk.',
    choices: [
      {
        id: 'reach',
        label: 'Reach across',
        result: 'The coconuts are won, along with a painful sprain.',
        immediateEffects: [
          { kind: 'resource', target: 'food', amount: 3 },
          {
            kind: 'injury',
            target: 'sprain',
            amount: 2,
            targetScope: 'participant',
            probability: 0.45,
          },
        ],
      },
      {
        id: 'move-on',
        label: 'Move on',
        result: 'No supplies are worth an avoidable injury.',
        immediateEffects: [{ kind: 'morale', amount: -1, targetScope: 'participant' }],
      },
    ],
  },
  {
    id: 'leaking-roof',
    category: 'shelter',
    title: 'A Leaking Roof',
    earliestTick: 1,
    phases: ['middle', 'late'],
    weight: 5,
    participantRule: 'any',
    description: 'Rain finds every weakness in the shelter.',
    choices: [
      {
        id: 'patch',
        label: 'Spend materials',
        result: 'The roof is patched before nightfall.',
        immediateEffects: [
          { kind: 'resource', target: 'materials', amount: -2 },
          { kind: 'shelter', amount: 18 },
        ],
      },
      {
        id: 'endure',
        label: 'Endure the leak',
        result: 'A wet night weighs on everyone.',
        immediateEffects: [
          { kind: 'shelter', amount: -10 },
          { kind: 'morale', amount: -7, targetScope: 'group' },
        ],
      },
    ],
  },
  {
    id: 'forager-instinct',
    category: 'trait',
    title: 'A Forager’s Hunch',
    earliestTick: 1,
    phases: ['early', 'middle'],
    weight: 6,
    participantRule: 'forager',
    description: 'The forager recognizes edible leaves near camp.',
    choices: [
      {
        id: 'trust-instinct',
        label: 'Trust the hunch',
        result: 'The leaves stretch the food supply.',
        immediateEffects: [
          { kind: 'resource', target: 'food', amount: 5 },
          { kind: 'morale', amount: 4, targetScope: 'participant' },
        ],
      },
      {
        id: 'test-first',
        label: 'Test them cautiously',
        result: 'A smaller safe portion is gathered.',
        immediateEffects: [{ kind: 'resource', target: 'food', amount: 2 }],
      },
    ],
  },
  {
    id: 'smoke-on-horizon',
    category: 'exploration',
    title: 'Smoke on the Horizon',
    earliestTick: 1,
    phases: ['middle', 'late'],
    weight: 5,
    participantRule: 'pair',
    description: 'A thin line of smoke appears far offshore.',
    choices: [
      {
        id: 'signal',
        label: 'Build a signal fire',
        result: 'The group commits scarce material to a bright signal.',
        immediateEffects: [
          { kind: 'resource', target: 'materials', amount: -2 },
          { kind: 'morale', amount: 8, targetScope: 'group' },
        ],
        followUpEventId: 'signal-answer',
      },
      {
        id: 'conserve',
        label: 'Conserve materials',
        result: 'The smoke vanishes unanswered.',
        immediateEffects: [{ kind: 'morale', amount: -4, targetScope: 'group' }],
      },
    ],
  },
  {
    id: 'signal-answer',
    category: 'follow-up',
    title: 'An Answering Flash',
    earliestTick: 1,
    phases: ['middle', 'late'],
    weight: 10,
    participantRule: 'any',
    requiresPriorChoice: { eventId: 'smoke-on-horizon', choiceId: 'signal' },
    description: 'The earlier signal fire is answered by a flash at sea.',
    choices: [
      {
        id: 'keep-burning',
        label: 'Keep it burning',
        result: 'The answering vessel sees the renewed signal.',
        immediateEffects: [
          { kind: 'resource', target: 'materials', amount: -1 },
          { kind: 'morale', amount: 10, targetScope: 'group' },
        ],
      },
      {
        id: 'save-fuel',
        label: 'Save the last fuel',
        result: 'The group keeps supplies, uncertain whether they were seen.',
        immediateEffects: [{ kind: 'morale', amount: -3, targetScope: 'group' }],
      },
    ],
  },
] as const satisfies readonly EventDefinition[];

export const EVENT_BY_ID = Object.fromEntries(
  [...EVENT_DEFINITIONS, ...PRODUCTION_EVENT_DEFINITIONS].map((event) => [event.id, event]),
) as unknown as Readonly<Record<EventId, EventDefinition>>;

export function eventRegistryForMode(mode: 'slice' | 'production'): readonly EventDefinition[] {
  return mode === 'slice' ? EVENT_DEFINITIONS : PRODUCTION_EVENT_DEFINITIONS;
}
