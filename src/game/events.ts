import { RISK_PROBABILITY_RANGES } from './tuning';
import type { EventDefinition, EventId, RiskLevel, RiskPresentation, RiskSeverity } from './types';

const risk = (level: RiskLevel, severity: RiskSeverity, label: string): RiskPresentation => ({
  level,
  label,
  severity,
  probabilityRange: RISK_PROBABILITY_RANGES[level],
});

const LOW = risk('low', 'none', 'Low risk');
const LOW_MINOR = risk('low', 'minor', 'Low risk');
const MODERATE = risk('moderate', 'moderate', 'Moderate risk');

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
        risk: LOW,
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
        risk: LOW_MINOR,
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
        risk: LOW_MINOR,
      },
      {
        id: 'rest-through-it',
        label: 'Conserve energy',
        result: 'Rest helps, although supplies are soaked.',
        immediateEffects: [
          { kind: 'need', target: 'energy', amount: 10 },
          { kind: 'resource', target: 'food', amount: -1 },
        ],
        risk: LOW,
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
        risk: LOW_MINOR,
      },
      {
        id: 'stay-safe',
        label: 'Stay at camp',
        result: 'The tracks fade while you recover.',
        immediateEffects: [{ kind: 'need', target: 'energy', amount: 8 }],
        risk: LOW,
      },
    ],
  },
] as const satisfies readonly EventDefinition[];

/** Authoritative production content. Follow-ups count as interactive templates. */
export const PRODUCTION_EVENT_DEFINITIONS = [
  {
    id: 'tide-pools',
    category: 'resource',
    title: 'Tide Pools',
    earliestTick: 1,
    phases: ['early', 'middle'],
    phaseWeights: { early: 1.2, middle: 0.8 },
    cooldownDays: 2,
    weight: 4,
    participantRule: 'any',
    description: 'A low tide exposes food, but the rocks are sharp.',
    choices: [
      {
        id: 'harvest',
        label: 'Harvest quickly',
        result: 'The group carries shellfish back to camp.',
        immediateEffects: [
          { kind: 'resource', target: 'food', amount: 0.25 },
          { kind: 'need', target: 'energy', amount: -6, targetScope: 'participant' },
        ],
        risk: LOW_MINOR,
      },
      {
        id: 'leave-it',
        label: 'Leave it alone',
        result: 'The group avoids the slippery rocks.',
        immediateEffects: [{ kind: 'morale', amount: 2, targetScope: 'group' }],
        risk: LOW,
      },
    ],
  },
  {
    id: 'interior-signal',
    category: 'exploration',
    title: 'A Ridge Above the Trees',
    earliestTick: 1,
    phases: ['early', 'middle'],
    phaseWeights: { early: 1.3, middle: 0.7 },
    cooldownDays: 3,
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
        risk: LOW_MINOR,
      },
      {
        id: 'turn-back',
        label: 'Turn back',
        result: 'Safety wins over discovery.',
        immediateEffects: [{ kind: 'morale', amount: -2, targetScope: 'participant' }],
        risk: LOW,
      },
    ],
  },
  {
    id: 'water-dispute',
    category: 'conflict',
    title: 'The Last Canteen',
    earliestTick: 1,
    phases: ['middle', 'late'],
    phaseWeights: { middle: 1.1, late: 0.9 },
    cooldownDays: 3,
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
        risk: LOW_MINOR,
      },
      {
        id: 'hear-them-out',
        label: 'Hear both sides',
        result: 'A long conversation restores trust but costs time.',
        immediateEffects: [
          { kind: 'morale', amount: 6, targetScope: 'group' },
          { kind: 'need', target: 'energy', amount: -8, targetScope: 'group' },
        ],
        risk: LOW,
      },
    ],
  },
  {
    id: 'fallen-palm',
    category: 'injury',
    title: 'A Fallen Palm',
    earliestTick: 1,
    phases: ['early', 'middle', 'late'],
    phaseWeights: { early: 0.9, middle: 1, late: 0.7 },
    cooldownDays: 2,
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
            riskLevel: 'moderate',
          },
        ],
        risk: MODERATE,
      },
      {
        id: 'move-on',
        label: 'Move on',
        result: 'No supplies are worth an avoidable injury.',
        immediateEffects: [{ kind: 'morale', amount: -1, targetScope: 'participant' }],
        risk: LOW,
      },
    ],
  },
  {
    id: 'leaking-roof',
    category: 'shelter',
    title: 'A Leaking Roof',
    earliestTick: 1,
    phases: ['middle', 'late'],
    phaseWeights: { middle: 1.2, late: 1 },
    cooldownDays: 3,
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
        risk: LOW,
      },
      {
        id: 'endure',
        label: 'Endure the leak',
        result: 'A wet night weighs on everyone.',
        immediateEffects: [
          { kind: 'shelter', amount: -10 },
          { kind: 'morale', amount: -7, targetScope: 'group' },
        ],
        risk: LOW_MINOR,
      },
    ],
  },
  {
    id: 'forager-instinct',
    category: 'trait',
    title: 'A Forager’s Hunch',
    earliestTick: 1,
    phases: ['early', 'middle'],
    phaseWeights: { early: 1.4, middle: 0.6 },
    cooldownDays: 3,
    weight: 6,
    participantRule: 'forager',
    description: 'The forager recognizes edible leaves near camp.',
    choices: [
      {
        id: 'trust-instinct',
        label: 'Trust the hunch',
        result: 'The leaves stretch the food supply.',
        immediateEffects: [
          { kind: 'resource', target: 'food', amount: 0.25 },
          { kind: 'morale', amount: 4, targetScope: 'participant' },
        ],
        risk: LOW_MINOR,
      },
      {
        id: 'test-first',
        label: 'Test them cautiously',
        result: 'A smaller safe portion is gathered.',
        immediateEffects: [{ kind: 'resource', target: 'food', amount: 2 }],
        risk: LOW,
      },
    ],
  },
  {
    id: 'smoke-on-horizon',
    category: 'exploration',
    title: 'Smoke on the Horizon',
    earliestTick: 1,
    phases: ['middle', 'late'],
    phaseWeights: { middle: 1, late: 1.2 },
    cooldownDays: 4,
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
        risk: LOW_MINOR,
      },
      {
        id: 'conserve',
        label: 'Conserve materials',
        result: 'The smoke vanishes unanswered.',
        immediateEffects: [{ kind: 'morale', amount: -4, targetScope: 'group' }],
        risk: LOW,
      },
    ],
  },
  {
    id: 'signal-answer',
    category: 'follow-up',
    title: 'An Answering Flash',
    earliestTick: 1,
    phases: ['middle', 'late'],
    phaseWeights: { middle: 1.5, late: 1.1 },
    cooldownDays: 4,
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
        risk: LOW,
      },
      {
        id: 'save-fuel',
        label: 'Save the last fuel',
        result: 'The group keeps supplies, uncertain whether they were seen.',
        immediateEffects: [{ kind: 'morale', amount: -3, targetScope: 'group' }],
        risk: LOW,
      },
    ],
  },
  {
    id: 'freshwater-seep',
    category: 'resource',
    title: 'A Freshwater Seep',
    earliestTick: 1,
    phases: ['early', 'middle'],
    phaseWeights: { early: 1.2, middle: 1 },
    cooldownDays: 3,
    weight: 5,
    participantRule: 'any',
    description: 'A cool trickle emerges where the hillside meets the roots.',
    choices: [
      {
        id: 'mark-source',
        label: 'Mark the source',
        result: 'The seep is marked for a later collection run.',
        immediateEffects: [
          { kind: 'resource', target: 'water', amount: 0.5 },
          { kind: 'need', target: 'energy', amount: -4, targetScope: 'participant' },
        ],
        followUpEventId: 'seep-follow-up',
        risk: LOW,
      },
      {
        id: 'drink-now',
        label: 'Drink and move on',
        result: 'The survivors take what they can and leave the hidden seep alone.',
        immediateEffects: [
          { kind: 'resource', target: 'water', amount: 1 },
          { kind: 'morale', amount: 2, targetScope: 'participant' },
        ],
        risk: LOW,
      },
    ],
  },
  {
    id: 'seep-follow-up',
    category: 'follow-up',
    title: 'The Marked Seep',
    earliestTick: 1,
    phases: ['early', 'middle', 'late'],
    phaseWeights: { early: 0.8, middle: 1.3, late: 1 },
    cooldownDays: 4,
    weight: 8,
    participantRule: 'any',
    requiresPriorChoice: { eventId: 'freshwater-seep', choiceId: 'mark-source' },
    description: 'The marker leads back to the seep, still running after the rain.',
    choices: [
      {
        id: 'collect-carefully',
        label: 'Collect carefully',
        result: 'The group fills containers without muddying the source.',
        immediateEffects: [
          { kind: 'resource', target: 'water', amount: 0.5 },
          { kind: 'morale', amount: 4, targetScope: 'group' },
        ],
        risk: LOW,
      },
      {
        id: 'leave-marker',
        label: 'Leave the marker',
        result: 'The seep remains a reserve for a harder day.',
        immediateEffects: [{ kind: 'resource', target: 'water', amount: 1 }],
        risk: LOW,
      },
    ],
  },
  {
    id: 'storm-front',
    category: 'shelter',
    title: 'A Fast-Moving Storm Front',
    earliestTick: 1,
    phases: ['middle', 'late'],
    phaseWeights: { middle: 1.2, late: 1.3 },
    cooldownDays: 4,
    weight: 4,
    participantRule: 'any',
    description: 'Clouds race over the ridge before the wind reaches camp.',
    choices: [
      {
        id: 'reinforce-shelter',
        label: 'Reinforce the shelter',
        result: 'The shelter is braced before the worst gusts arrive.',
        immediateEffects: [
          { kind: 'resource', target: 'materials', amount: -1 },
          { kind: 'shelter', amount: 12 },
        ],
        delayedEffect: {
          delayTicks: 180,
          effect: { kind: 'need', target: 'energy', amount: -5, targetScope: 'participant' },
          description: 'The storm work leaves its volunteers tired.',
        },
        risk: LOW,
      },
      {
        id: 'wait-it-out',
        label: 'Wait it out',
        result: 'The group stays low and accepts a little damage to the shelter.',
        immediateEffects: [
          { kind: 'shelter', amount: -6 },
          { kind: 'morale', amount: -2, targetScope: 'group' },
        ],
        risk: LOW_MINOR,
      },
    ],
  },
  {
    id: 'driftwood-cache',
    category: 'resource',
    title: 'Driftwood Cache',
    earliestTick: 1,
    phases: ['early', 'middle', 'late'],
    phaseWeights: { early: 1, middle: 0.9, late: 0.8 },
    cooldownDays: 3,
    weight: 4,
    participantRule: 'any',
    description: 'The tide leaves a stack of dry driftwood above the high-water line.',
    choices: [
      {
        id: 'haul-wood',
        label: 'Haul it to camp',
        result: 'Dry wood gives the camp a useful reserve.',
        immediateEffects: [
          { kind: 'resource', target: 'materials', amount: 3 },
          { kind: 'need', target: 'energy', amount: -7, targetScope: 'participant' },
        ],
        risk: LOW_MINOR,
      },
      {
        id: 'leave-wood',
        label: 'Leave it for later',
        result: 'The cache stays above the tide for another day.',
        immediateEffects: [{ kind: 'morale', amount: 1, targetScope: 'group' }],
        risk: LOW,
      },
    ],
  },
  {
    id: 'night-watch',
    category: 'exploration',
    title: 'A Light Beyond the Reef',
    earliestTick: 1,
    phases: ['early', 'middle', 'late'],
    phaseWeights: { early: 0.7, middle: 1, late: 1.4 },
    cooldownDays: 4,
    weight: 4,
    participantRule: 'pair',
    description: 'A faint light appears offshore after sunset, then disappears.',
    choices: [
      {
        id: 'keep-watch',
        label: 'Keep watch',
        result: 'Two survivors watch the reef and learn the light’s rhythm.',
        immediateEffects: [
          { kind: 'need', target: 'energy', amount: -8, targetScope: 'participant' },
          {
            kind: 'morale',
            amount: -4,
            targetScope: 'participant',
            probability: 0.7,
            riskLevel: 'high',
          },
        ],
        delayedEffect: {
          delayTicks: 240,
          effect: { kind: 'morale', amount: 6, targetScope: 'participant' },
          description: 'The patient watch restores a little hope.',
        },
        risk: {
          level: 'high',
          label: 'High risk',
          severity: 'severe',
          probabilityRange: RISK_PROBABILITY_RANGES.high,
        },
      },
      {
        id: 'sleep-safe',
        label: 'Sleep safely',
        result: 'The group chooses rest over an uncertain signal.',
        immediateEffects: [
          { kind: 'need', target: 'energy', amount: 8, targetScope: 'group' },
          { kind: 'morale', amount: -1, targetScope: 'group' },
        ],
        risk: LOW,
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
