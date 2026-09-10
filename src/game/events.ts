import { RISK_PROBABILITY_RANGES } from './tuning';
import type { EventDefinition, EventId, RiskLevel, RiskPresentation, RiskSeverity } from './types';

const risk = (level: RiskLevel, severity: RiskSeverity, label: string): RiskPresentation => ({
  level,
  label,
  severity,
  probabilityRange: RISK_PROBABILITY_RANGES[level],
});

const NO_RANDOM_SETBACK: RiskPresentation = {
  level: 'none',
  label: 'No random setback',
  severity: 'none',
  probabilityRange: { min: 0, max: 0 },
};
const MODERATE = risk('moderate', 'moderate', 'Moderate setback chance');

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
        risk: NO_RANDOM_SETBACK,
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
        risk: NO_RANDOM_SETBACK,
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
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'rest-through-it',
        label: 'Conserve energy',
        result: 'Rest helps, although supplies are soaked.',
        immediateEffects: [
          { kind: 'need', target: 'energy', amount: 10 },
          { kind: 'resource', target: 'food', amount: -1 },
        ],
        risk: NO_RANDOM_SETBACK,
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
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'stay-safe',
        label: 'Stay at camp',
        result: 'The tracks fade while you recover.',
        immediateEffects: [{ kind: 'need', target: 'energy', amount: 8 }],
        risk: NO_RANDOM_SETBACK,
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
    description: 'A low tide exposes a little food on the rocks. Gathering it takes energy.',
    choices: [
      {
        id: 'harvest',
        label: 'Harvest quickly',
        result: 'The group carries shellfish back to camp.',
        immediateEffects: [
          { kind: 'resource', target: 'food', amount: 0.25 },
          { kind: 'need', target: 'energy', amount: -6, targetScope: 'participant' },
        ],
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'leave-it',
        label: 'Leave it alone',
        result: 'The group avoids the slippery rocks.',
        immediateEffects: [{ kind: 'morale', amount: 2, targetScope: 'group' }],
        risk: NO_RANDOM_SETBACK,
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
    description:
      'A view from the ridge could lift spirits. Rescue remains scheduled for day 14 if anyone survives.',
    choices: [
      {
        id: 'climb',
        label: 'Climb the ridge',
        result: 'The view lifts everyone’s morale, but the climb tires the survivor involved.',
        immediateEffects: [
          { kind: 'morale', amount: 6, targetScope: 'group' },
          { kind: 'need', target: 'energy', amount: -12, targetScope: 'participant' },
        ],
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'turn-back',
        label: 'Turn back',
        result: 'Safety wins over discovery.',
        immediateEffects: [{ kind: 'morale', amount: -2, targetScope: 'participant' }],
        risk: NO_RANDOM_SETBACK,
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
        result: 'Insisting on equal shares lowers morale; it does not change food or water use.',
        immediateEffects: [{ kind: 'morale', amount: -4, targetScope: 'group' }],
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'hear-them-out',
        label: 'Hear both sides',
        result: 'Hearing both sides lifts morale and costs everyone energy.',
        immediateEffects: [
          { kind: 'morale', amount: 6, targetScope: 'group' },
          { kind: 'need', target: 'energy', amount: -8, targetScope: 'group' },
        ],
        risk: NO_RANDOM_SETBACK,
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
        result: 'Gather coconuts, with a chance of a sprain.',
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
        risk: NO_RANDOM_SETBACK,
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
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'endure',
        label: 'Endure the leak',
        result: 'A wet night weighs on everyone.',
        immediateEffects: [
          { kind: 'shelter', amount: -10 },
          { kind: 'morale', amount: -7, targetScope: 'group' },
        ],
        risk: NO_RANDOM_SETBACK,
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
        result: 'Gather a small handful of leaves and boost the forager’s confidence.',
        immediateEffects: [
          { kind: 'resource', target: 'food', amount: 0.25 },
          { kind: 'morale', amount: 4, targetScope: 'participant' },
        ],
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'test-first',
        label: 'Test them cautiously',
        result: 'Careful testing identifies a larger edible portion to gather.',
        immediateEffects: [{ kind: 'resource', target: 'food', amount: 2 }],
        risk: NO_RANDOM_SETBACK,
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
    description:
      'A thin line of smoke appears far offshore. Signaling can lift spirits, but rescue remains scheduled for day 14 if anyone survives.',
    choices: [
      {
        id: 'signal',
        label: 'Build a signal fire',
        result:
          'Spend materials to lift morale with a signal fire; a later flash may prompt another decision.',
        immediateEffects: [
          { kind: 'resource', target: 'materials', amount: -2 },
          { kind: 'morale', amount: 8, targetScope: 'group' },
        ],
        followUpEventId: 'signal-answer',
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'conserve',
        label: 'Conserve materials',
        result: 'The smoke vanishes unanswered.',
        immediateEffects: [{ kind: 'morale', amount: -4, targetScope: 'group' }],
        risk: NO_RANDOM_SETBACK,
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
    description:
      'After the earlier signal fire, a flash appears at sea. Its source is uncertain; rescue remains scheduled for day 14 if anyone survives.',
    choices: [
      {
        id: 'keep-burning',
        label: 'Keep it burning',
        result: 'Renewing the fire lifts everyone’s morale.',
        immediateEffects: [
          { kind: 'resource', target: 'materials', amount: -1 },
          { kind: 'morale', amount: 10, targetScope: 'group' },
        ],
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'save-fuel',
        label: 'Save the last fuel',
        result: 'The group keeps supplies, uncertain whether they were seen.',
        immediateEffects: [{ kind: 'morale', amount: -3, targetScope: 'group' }],
        risk: NO_RANDOM_SETBACK,
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
        result:
          'Bring back a little water and spend energy marking the seep for a possible return visit.',
        immediateEffects: [
          { kind: 'resource', target: 'water', amount: 0.5 },
          { kind: 'need', target: 'energy', amount: -4, targetScope: 'participant' },
        ],
        followUpEventId: 'seep-follow-up',
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'drink-now',
        label: 'Collect and move on',
        result: 'The survivors take what they can and leave the hidden seep alone.',
        immediateEffects: [
          { kind: 'resource', target: 'water', amount: 1 },
          { kind: 'morale', amount: 2, targetScope: 'participant' },
        ],
        risk: NO_RANDOM_SETBACK,
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
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'leave-marker',
        label: 'Fill another container',
        result: 'Bring water into camp supplies now; no further collection is arranged.',
        immediateEffects: [{ kind: 'resource', target: 'water', amount: 1 }],
        risk: NO_RANDOM_SETBACK,
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
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'wait-it-out',
        label: 'Wait it out',
        result: 'The group stays low and accepts a little damage to the shelter.',
        immediateEffects: [
          { kind: 'shelter', amount: -6 },
          { kind: 'morale', amount: -2, targetScope: 'group' },
        ],
        risk: NO_RANDOM_SETBACK,
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
        result: 'Add materials to camp supplies at an energy cost.',
        immediateEffects: [
          { kind: 'resource', target: 'materials', amount: 3 },
          { kind: 'need', target: 'energy', amount: -7, targetScope: 'participant' },
        ],
        risk: NO_RANDOM_SETBACK,
      },
      {
        id: 'leave-wood',
        label: 'Leave it behind',
        result: 'Skipping the haul lifts morale; no wood is stored or return visit arranged.',
        immediateEffects: [{ kind: 'morale', amount: 1, targetScope: 'group' }],
        risk: NO_RANDOM_SETBACK,
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
    description:
      'A faint light appears offshore after sunset, then disappears. Watching it affects energy and morale; rescue remains scheduled for day 14 if anyone survives.',
    choices: [
      {
        id: 'keep-watch',
        label: 'Keep watch',
        result:
          'Watching costs energy and may dampen spirits. A later morale boost depends on time remaining before rescue.',
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
          label: 'High setback chance',
          severity: 'minor',
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
        risk: NO_RANDOM_SETBACK,
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
