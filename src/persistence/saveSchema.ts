import { AUTHORED_WAYPOINTS } from '../game/island';
import { EVENT_BY_ID, eventRegistryForMode } from '../game/events';
import { cloneGameState } from '../game/simulation';
import { RANDOM_STREAM_NAMES } from '../game/random';
import { TRAIT_BY_ID, productivityMultiplier, traitsAreCompatible } from '../game/traits';
import { RULES_VERSION, TUNING, validateGameConfig } from '../game/tuning';
import type {
  EventDefinition,
  GameState,
  RandomStreamState,
  SourceId,
  SurvivorState,
  TraitId,
  WaypointId,
} from '../game/types';

export const SAVE_SCHEMA_VERSION = 1 as const;
export const SAVE_STORAGE_KEY = 'untitled-island:resume';
export const SLICE_SAVE_STORAGE_KEY = 'untitled-island:internal-slice';
export interface SaveEnvelopeV1 {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  rulesVersion: string;
  savedAt: string;
  gameState: GameState;
}
export type SaveEnvelope = SaveEnvelopeV1;
export type SaveFailureReason =
  | 'missing'
  | 'malformed-json'
  | 'invalid-envelope'
  | 'unsupported-schema'
  | 'incompatible-rules'
  | 'storage-unavailable';
export type SaveParseResult =
  { ok: true; envelope: SaveEnvelope; state: GameState } | { ok: false; reason: SaveFailureReason };
type UnknownRecord = Record<string, unknown>;
const SOURCE_IDS = ['water', 'forage', 'wreckage', 'forest'] as const;
const RESOURCE_IDS = ['water', 'food', 'materials'] as const;
const NEED_IDS = ['health', 'hunger', 'thirst', 'energy'] as const;
const INJURY_KINDS = ['cut', 'sprain', 'burn'] as const;
const STATUSES = ['running', 'decision', 'event-result', 'victory', 'defeat'] as const;
const TASK_KINDS = [
  'drink',
  'eat',
  'rest',
  'sleep',
  'gather-water',
  'gather-food',
  'gather-materials',
  'repair-shelter',
] as const;
const REASONS = [
  'critical-thirst',
  'critical-hunger',
  'critical-health',
  'night-sleep',
  'low-energy',
  'recover-policy',
  'stock-water',
  'stock-food',
  'stock-materials',
  'repair-shelter',
] as const;
const CAMP_PRIORITIES = ['balanced', 'water', 'food', 'build', 'recover'] as const;
const TURNING_POINT_KINDS = ['choice', 'injury', 'recovery', 'death', 'shelter'] as const;
const HISTORY_KINDS = ['task', 'resource', 'event', 'effect', 'health', 'terminal', 'day'] as const;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isBounded = (value: unknown, maximum = 100): value is number =>
  isFiniteNumber(value) && value >= 0 && value <= maximum;
const isIntegerBounded = (value: unknown, minimum: number, maximum: number): value is number =>
  isInteger(value) && value >= minimum && value <= maximum;
const isRandomStreamState = (value: unknown): value is RandomStreamState =>
  isRecord(value) && isInteger(value.state) && value.state >= 0 && value.state <= 0xffffffff;
const isWaypointId = (value: unknown): value is WaypointId =>
  typeof value === 'string' && AUTHORED_WAYPOINTS.some((entry) => entry.id === value);
const isPoint = (value: unknown): boolean =>
  isRecord(value) && isBounded(value.x, 1) && isBounded(value.y, 1);

function isTraitId(value: unknown): value is TraitId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TRAIT_BY_ID, value);
}

function isTraits(value: unknown): value is TraitId[] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every(isTraitId) ||
    new Set(value).size !== value.length
  )
    return false;
  return traitsAreCompatible(value);
}

function isInjury(value: unknown, rescueTick: number): boolean {
  if (!isRecord(value)) return false;
  if (
    !INJURY_KINDS.includes(value.kind as never) ||
    !isIntegerBounded(value.severity, 1, 3) ||
    !isIntegerBounded(value.recoveryTicksRemaining, 0, rescueTick) ||
    !isBounded(value.productivityModifier, 1)
  )
    return false;
  const expectedModifier = 1 - value.severity * TUNING.injury.productivityPerSeverity;
  return value.productivityModifier === expectedModifier;
}

function isTaskReason(value: unknown): boolean {
  if (!isRecord(value) || !REASONS.includes(value.code as never) || !isRecord(value.params))
    return false;
  return Object.values(value.params).every(
    (param) => isNonEmptyString(param) || isFiniteNumber(param),
  );
}

function expectedTaskDestination(kind: string): readonly string[] {
  if (kind === 'drink' || kind === 'eat' || kind === 'rest' || kind === 'sleep') return ['camp'];
  if (kind === 'gather-water') return ['water'];
  if (kind === 'gather-food') return ['forage'];
  if (kind === 'gather-materials') return ['wreckage', 'forest'];
  if (kind === 'repair-shelter') return ['camp'];
  return [];
}

function isActiveTask(value: unknown): boolean {
  if (value === null) return true;
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    TASK_KINDS.includes(value.kind as never) &&
    isWaypointId(value.destination) &&
    expectedTaskDestination(value.kind as string).includes(value.destination) &&
    (value.phase === 'travel' || value.phase === 'work') &&
    isIntegerBounded(value.remainingTicks, 1, Number.MAX_SAFE_INTEGER) &&
    isIntegerBounded(value.workTicks, 1, Number.MAX_SAFE_INTEGER) &&
    value.remainingTicks <= value.workTicks &&
    (value.reservationId === null || typeof value.reservationId === 'string') &&
    isTaskReason(value.reason)
  );
}

function isSurvivor(
  value: unknown,
  rescueTick: number,
  movementTicks: number,
): value is SurvivorState {
  if (!isRecord(value) || !isRecord(value.needs)) return false;
  if (!isTraits(value.traits)) return false;
  if (value.injury !== null && !isInjury(value.injury, rescueTick)) return false;
  const travelMultiplier =
    productivityMultiplier(value.traits, 'travel') *
    (value.injury === null ? 1 : ((value.injury as UnknownRecord).productivityModifier as number));
  const maximumProgressTicks = Math.ceil(movementTicks / travelMultiplier);
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.color) &&
    isIntegerBounded(value.visualVariant, 0, 5) &&
    isBounded(value.morale) &&
    typeof value.alive === 'boolean' &&
    isPoint(value.position) &&
    isPoint(value.previousPosition) &&
    isWaypointId(value.currentWaypoint) &&
    isWaypointId(value.targetWaypoint) &&
    isIntegerBounded(value.progressTicks, 0, maximumProgressTicks) &&
    isIntegerBounded(value.routeIndex, 0, Number.MAX_SAFE_INTEGER) &&
    isBounded(value.needs.health) &&
    isBounded(value.needs.hunger) &&
    isBounded(value.needs.thirst) &&
    isBounded(value.needs.energy) &&
    isActiveTask(value.activeTask) &&
    (value.activeTask === null ||
      (isRecord(value.activeTask) &&
        (value.activeTask.phase === 'travel'
          ? value.currentWaypoint !== value.activeTask.destination &&
            value.targetWaypoint === value.activeTask.destination
          : value.currentWaypoint === value.activeTask.destination &&
            value.targetWaypoint === value.activeTask.destination))) &&
    (value.alive || value.activeTask === null)
  );
}

function isEffect(value: unknown): boolean {
  if (!isRecord(value) || !isFiniteNumber(value.amount) || Math.abs(value.amount) > 100)
    return false;
  if (
    value.targetScope !== undefined &&
    !['participant', 'group'].includes(value.targetScope as string)
  )
    return false;
  if (value.probability !== undefined && !isBounded(value.probability, 1)) return false;
  if (value.kind === 'health' || value.kind === 'morale' || value.kind === 'shelter')
    return value.target === undefined;
  if (value.kind === 'resource') return RESOURCE_IDS.includes(value.target as never);
  if (value.kind === 'need') return NEED_IDS.includes(value.target as never);
  if (value.kind === 'injury')
    return INJURY_KINDS.includes(value.target as never) && value.amount > 0 && value.amount <= 3;
  return false;
}

function eventIdsForMode(mode: 'slice' | 'production'): readonly string[] {
  return eventRegistryForMode(mode).map((event) => event.id);
}

function eventDefinitionFor(
  mode: 'slice' | 'production',
  eventId: unknown,
): EventDefinition | null {
  if (typeof eventId !== 'string' || !eventIdsForMode(mode).includes(eventId)) return null;
  return EVENT_BY_ID[eventId as keyof typeof EVENT_BY_ID] ?? null;
}

function choiceDefinitionFor(
  mode: 'slice' | 'production',
  eventId: unknown,
  choiceId: unknown,
): EventDefinition['choices'][number] | null {
  const event = eventDefinitionFor(mode, eventId);
  if (!event || !isNonEmptyString(choiceId)) return null;
  return event.choices.find((choice) => choice.id === choiceId) ?? null;
}

function isUniqueStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every(isNonEmptyString) && new Set(value).size === value.length
  );
}

function isParticipantIds(
  value: unknown,
  survivors: SurvivorState[],
  requireLiving = false,
): boolean {
  if (!isUniqueStringArray(value)) return false;
  return value.every((id) => {
    const survivor = survivors.find((entry) => entry.id === id);
    return !!survivor && (!requireLiving || survivor.alive);
  });
}

function isActiveEventParticipants(
  value: unknown,
  survivors: SurvivorState[],
  definition: EventDefinition,
  allowEmpty = false,
): boolean {
  if (!isParticipantIds(value, survivors, true)) return false;
  const participantIds = value as string[];
  if (participantIds.length === 0) return allowEmpty;
  const expectedCount = definition.participantRule === 'pair' ? 2 : 1;
  if (participantIds.length !== expectedCount) return false;
  if (definition.participantRule === 'forager') {
    return survivors
      .filter((survivor) => participantIds.includes(survivor.id))
      .every((survivor) => survivor.traits.includes('forager'));
  }
  if (definition.participantRule === 'injured') {
    return survivors
      .filter((survivor) => participantIds.includes(survivor.id))
      .every((survivor) => survivor.injury !== null);
  }
  return true;
}

function isFiniteTick(value: unknown, clockTick: number, rescueTick: number): boolean {
  return isIntegerBounded(value, 0, Math.min(clockTick, rescueTick));
}

function isReservationShape(value: unknown, resources: UnknownRecord): boolean {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.taskId) ||
    !isNonEmptyString(value.survivorId) ||
    !SOURCE_IDS.includes(value.sourceId as SourceId) ||
    !isFiniteNumber(value.expectedYield)
  )
    return false;
  if (value.kind === 'source') {
    return (
      value.expectedYield > 0 &&
      value.resourceId === undefined &&
      value.reservedAmount === undefined
    );
  }
  if (value.kind === 'materials') {
    return (
      value.sourceId === 'forest' &&
      value.expectedYield === 0 &&
      value.resourceId === 'materials' &&
      isFiniteNumber(value.reservedAmount) &&
      value.reservedAmount > 0 &&
      value.reservedAmount <= (resources.materials as number)
    );
  }
  return false;
}

function sourceForGatherTask(
  kind: unknown,
  sourceId: unknown,
): { resourceId: string; destinations: readonly string[] } | null {
  if (kind === 'gather-water' && sourceId === 'water')
    return { resourceId: 'water', destinations: ['water'] };
  if (kind === 'gather-food' && sourceId === 'forage')
    return { resourceId: 'food', destinations: ['forage'] };
  if (kind === 'gather-materials' && (sourceId === 'wreckage' || sourceId === 'forest'))
    return { resourceId: 'materials', destinations: [sourceId] };
  return null;
}

function isValidGameState(value: unknown): value is GameState {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.seed) ||
    !isRecord(value.config) ||
    value.seed !== value.config.seed ||
    !STATUSES.includes(value.status as never)
  )
    return false;
  try {
    validateGameConfig(value.config as unknown as GameState['config']);
  } catch {
    return false;
  }
  const config = value.config as unknown as GameState['config'];
  const status = value.status as GameState['status'];
  const modeEventIds = eventIdsForMode(config.mode);
  if (
    !isRecord(value.clock) ||
    !isInteger(value.clock.tick) ||
    value.clock.tick < 0 ||
    value.clock.tick > config.rescueTick ||
    !isInteger(value.clock.day) ||
    value.clock.day < 1 ||
    value.clock.day > Math.ceil(config.rescueTick / config.ticksPerDay)
  )
    return false;
  const clock = value.clock as unknown as GameState['clock'];
  const clockTick = clock.tick;
  const expectedDay = Math.min(
    Math.floor(clockTick / config.ticksPerDay) + 1,
    Math.ceil(config.rescueTick / config.ticksPerDay),
  );
  if (clock.day !== expectedDay) return false;
  if (
    !isRecord(value.island) ||
    !isIntegerBounded(value.island.cosmeticVariant, 0, 3) ||
    !isRecord(value.island.sourceStates)
  )
    return false;
  const island = value.island;
  const sourceStates = island.sourceStates;
  if (!isRecord(sourceStates)) return false;
  if (
    Object.keys(sourceStates).length !== SOURCE_IDS.length ||
    !SOURCE_IDS.every((id) => {
      const source = sourceStates[id];
      return (
        isRecord(source) &&
        source.id === id &&
        isBounded(source.available, TUNING.sourceCaps[id]) &&
        isBounded(source.capacity, TUNING.sourceCaps[id]) &&
        source.available <= source.capacity
      );
    })
  )
    return false;
  const resources = value.resources;
  if (
    !isRecord(resources) ||
    Object.keys(resources).length !== RESOURCE_IDS.length ||
    !RESOURCE_IDS.every((id) => isBounded(resources[id], TUNING.resourceCaps[id]))
  )
    return false;
  const shelter = value.shelter;
  if (
    !isRecord(shelter) ||
    !isBounded(shelter.maximumCondition, 100) ||
    shelter.maximumCondition <= 0 ||
    !isFiniteNumber(shelter.condition) ||
    shelter.condition < 0 ||
    shelter.condition > shelter.maximumCondition
  )
    return false;
  if (
    !Array.isArray(value.survivors) ||
    value.survivors.length !== config.survivorCount ||
    !value.survivors.every((survivor) =>
      isSurvivor(survivor, config.rescueTick, config.movementTicks),
    ) ||
    new Set(value.survivors.map((entry) => entry.id)).size !== value.survivors.length
  )
    return false;
  const survivors = value.survivors as SurvivorState[];
  if (
    (status === 'victory' &&
      (clockTick !== config.rescueTick || !survivors.some((survivor) => survivor.alive))) ||
    (status === 'defeat' && survivors.some((survivor) => survivor.alive)) ||
    (status !== 'victory' && status !== 'defeat' && clockTick === config.rescueTick) ||
    ((status === 'running' || status === 'decision' || status === 'event-result') &&
      !survivors.some((survivor) => survivor.alive))
  )
    return false;
  const activeTaskIds = survivors
    .map((survivor) => survivor.activeTask)
    .filter((task): task is NonNullable<SurvivorState['activeTask']> => task !== null)
    .map((task) => task.id);
  if (new Set(activeTaskIds).size !== activeTaskIds.length) return false;
  if (
    !Array.isArray(value.reservations) ||
    !value.reservations.every((reservation) => isReservationShape(reservation, resources))
  )
    return false;
  const reservations = value.reservations as GameState['reservations'];
  if (
    new Set(reservations.map((reservation) => reservation.id)).size !== reservations.length ||
    new Set(reservations.map((reservation) => reservation.taskId)).size !== reservations.length ||
    !reservations.every((reservation) => {
      const survivor = survivors.find((entry) => entry.id === reservation.survivorId);
      const task = survivor?.activeTask;
      if (
        !survivor ||
        !task ||
        task.id !== reservation.taskId ||
        task.reservationId !== reservation.id
      )
        return false;
      if (reservation.kind === 'materials')
        return task.kind === 'repair-shelter' && task.destination === 'camp';
      const source = sourceForGatherTask(task.kind, reservation.sourceId);
      return !!source && source.destinations.includes(task.destination);
    }) ||
    !survivors.every((survivor) => {
      const task = survivor.activeTask;
      if (!task) return true;
      if (task.reservationId === null)
        return ['drink', 'eat', 'rest', 'sleep'].includes(task.kind as string);
      return reservations.some(
        (reservation) =>
          reservation.id === task.reservationId && reservation.survivorId === survivor.id,
      );
    })
  )
    return false;
  if (
    !SOURCE_IDS.every((sourceId) => {
      const claimed = reservations
        .filter((reservation) => reservation.kind === 'source' && reservation.sourceId === sourceId)
        .reduce((sum, reservation) => sum + reservation.expectedYield, 0);
      return claimed <= ((sourceStates[sourceId] as UnknownRecord).available as number);
    }) ||
    reservations
      .filter((reservation) => reservation.kind === 'materials')
      .reduce((sum, reservation) => sum + (reservation.reservedAmount ?? 0), 0) >
      (resources.materials as number)
  )
    return false;

  if (!Array.isArray(value.choiceRecords)) return false;
  const choiceRecords = value.choiceRecords as GameState['choiceRecords'];

  if (value.activeEvent !== null && !isRecord(value.activeEvent)) return false;
  if (isRecord(value.activeEvent)) {
    const activeEvent = value.activeEvent;
    const definition = eventDefinitionFor(config.mode, activeEvent.id);
    if (!definition) return false;
    if (!isIntegerBounded(activeEvent.activatedTick, 0, Math.min(clockTick, config.rescueTick)))
      return false;
    if (
      !isActiveEventParticipants(
        activeEvent.participantIds,
        survivors,
        definition,
        config.mode === 'slice' && status === 'event-result',
      )
    )
      return false;
    const referencedChoice = activeEvent.referencedChoice;
    if (referencedChoice !== undefined) {
      if (
        !isRecord(referencedChoice) ||
        !choiceDefinitionFor(config.mode, referencedChoice.eventId, referencedChoice.choiceId) ||
        !choiceRecords.some(
          (record) =>
            isRecord(record) &&
            record.eventId === referencedChoice.eventId &&
            record.choiceId === referencedChoice.choiceId,
        )
      )
        return false;
      if (
        !definition.requiresPriorChoice ||
        definition.requiresPriorChoice.eventId !== referencedChoice.eventId ||
        (definition.requiresPriorChoice.choiceId !== undefined &&
          definition.requiresPriorChoice.choiceId !== referencedChoice.choiceId)
      )
        return false;
    } else if (definition.requiresPriorChoice) return false;
    if (
      (activeEvent.chosenChoiceId !== null &&
        !choiceDefinitionFor(config.mode, activeEvent.id, activeEvent.chosenChoiceId)) ||
      (activeEvent.chosenChoiceId !== null && !isNonEmptyString(activeEvent.chosenChoiceId)) ||
      (activeEvent.chosenChoiceId === null && activeEvent.result !== null) ||
      (activeEvent.chosenChoiceId !== null && !isNonEmptyString(activeEvent.result))
    )
      return false;
    if (activeEvent.chosenChoiceId !== null) {
      const chosenChoice = choiceDefinitionFor(
        config.mode,
        activeEvent.id,
        activeEvent.chosenChoiceId,
      );
      if (!chosenChoice || activeEvent.result !== chosenChoice.result) return false;
    }
  }
  if (
    (value.activeEvent !== null &&
      value.status !== 'decision' &&
      value.status !== 'event-result') ||
    (value.activeEvent === null && (value.status === 'decision' || value.status === 'event-result'))
  )
    return false;
  if (!Array.isArray(value.scheduledEffects)) return false;
  const scheduledEffects = value.scheduledEffects as GameState['scheduledEffects'];
  if (!scheduledEffects.every(isRecord)) return false;
  if (
    new Set(scheduledEffects.map((effect) => effect.id)).size !== scheduledEffects.length ||
    !scheduledEffects.every((effect) => {
      if (
        !isNonEmptyString(effect.id) ||
        !isIntegerBounded(effect.dueTick, clockTick + 1, config.rescueTick) ||
        !eventDefinitionFor(config.mode, effect.sourceEventId) ||
        !isEffect(effect.effect) ||
        !isNonEmptyString(effect.description)
      )
        return false;
      return (
        effect.participantIds === undefined ||
        isParticipantIds(effect.participantIds, survivors, false)
      );
    })
  )
    return false;
  if (!isRecord(value.eventSchedule)) return false;
  const eventSchedule = value.eventSchedule as unknown as GameState['eventSchedule'];
  if (
    (eventSchedule.nextEventTick !== null &&
      !isIntegerBounded(
        eventSchedule.nextEventTick,
        status === 'victory' || status === 'defeat' ? 0 : clockTick,
        config.rescueTick,
      )) ||
    !Array.isArray(eventSchedule.usedEventIds) ||
    !eventSchedule.usedEventIds.every((id) => modeEventIds.includes(id as string)) ||
    new Set(eventSchedule.usedEventIds).size !== eventSchedule.usedEventIds.length ||
    !isIntegerBounded(eventSchedule.sequence, 0, Number.MAX_SAFE_INTEGER) ||
    (eventSchedule.lastDecisionTick !== undefined &&
      eventSchedule.lastDecisionTick !== null &&
      !isFiniteTick(eventSchedule.lastDecisionTick, clockTick, config.rescueTick))
  )
    return false;
  const pendingFollowUps = eventSchedule.pendingFollowUps;
  if (pendingFollowUps !== undefined) {
    if (
      !Array.isArray(pendingFollowUps) ||
      !pendingFollowUps.every(isRecord) ||
      new Set(
        pendingFollowUps.map(
          (followUp) => `${followUp.sourceEventId}:${followUp.sourceChoiceId}:${followUp.eventId}`,
        ),
      ).size !== pendingFollowUps.length ||
      !pendingFollowUps.every((followUp) => {
        if (
          config.mode !== 'production' ||
          !eventDefinitionFor(config.mode, followUp.eventId) ||
          !eventDefinitionFor(config.mode, followUp.sourceEventId) ||
          !choiceDefinitionFor(config.mode, followUp.sourceEventId, followUp.sourceChoiceId) ||
          !isIntegerBounded(followUp.earliestTick, clockTick + 1, config.rescueTick)
        )
          return false;
        const sourceChoice = choiceDefinitionFor(
          config.mode,
          followUp.sourceEventId,
          followUp.sourceChoiceId,
        );
        const target = eventDefinitionFor(config.mode, followUp.eventId);
        if (!sourceChoice || !target || !target.requiresPriorChoice) return false;
        return (
          sourceChoice?.followUpEventId === followUp.eventId &&
          target?.requiresPriorChoice?.eventId === followUp.sourceEventId &&
          target.requiresPriorChoice.choiceId === followUp.sourceChoiceId &&
          Array.isArray(value.choiceRecords) &&
          (value.choiceRecords as unknown[]).some(
            (record) =>
              isRecord(record) &&
              record.eventId === followUp.sourceEventId &&
              record.choiceId === followUp.sourceChoiceId,
          )
        );
      })
    )
      return false;
  }
  if (!Array.isArray(value.history)) return false;
  const history = value.history as GameState['history'];
  if (!history.every(isRecord)) return false;
  if (
    new Set(history.map((entry) => entry.id)).size !== history.length ||
    !history.every(
      (entry) =>
        isNonEmptyString(entry.id) &&
        isFiniteTick(entry.tick, clockTick, config.rescueTick) &&
        HISTORY_KINDS.includes(entry.kind as never) &&
        isNonEmptyString(entry.message),
    )
  )
    return false;
  if (!isRecord(value.campPolicy)) return false;
  const campPolicy = value.campPolicy as unknown as GameState['campPolicy'];
  if (
    !CAMP_PRIORITIES.includes(campPolicy.priority as never) ||
    (campPolicy.lastChangedDay !== null &&
      !isIntegerBounded(campPolicy.lastChangedDay, 1, clock.day))
  )
    return false;
  if (!isIntegerBounded(value.plannerRotation, 0, Math.max(0, survivors.length - 1))) return false;

  const choiceRecordKeys = new Set<string>();
  const choiceRecordEventIds = new Set<string>();
  if (
    !choiceRecords.every((record) => {
      if (!isRecord(record)) return false;
      const event = eventDefinitionFor(config.mode, record.eventId);
      if (!event || !choiceDefinitionFor(config.mode, record.eventId, record.choiceId))
        return false;
      if (
        !isFiniteTick(record.tick, clock.tick, config.rescueTick) ||
        !isParticipantIds(record.participantIds, survivors, false) ||
        !isNonEmptyString(record.result)
      )
        return false;
      const key = `${record.eventId}:${record.choiceId}`;
      if (
        choiceRecordKeys.has(key) ||
        (!event.repeatable && choiceRecordEventIds.has(record.eventId))
      )
        return false;
      choiceRecordKeys.add(key);
      choiceRecordEventIds.add(record.eventId);
      return true;
    })
  )
    return false;

  if (!Array.isArray(value.turningPoints)) return false;
  const turningPoints = value.turningPoints as GameState['turningPoints'];
  const turningPointIds = new Set<string>();
  if (
    !turningPoints.every((point) => {
      if (
        !isRecord(point) ||
        !isNonEmptyString(point.id) ||
        !isFiniteTick(point.tick, clock.tick, config.rescueTick) ||
        !isParticipantIds(point.survivorIds, survivors, false) ||
        !TURNING_POINT_KINDS.includes(point.kind as never) ||
        !isNonEmptyString(point.description) ||
        (point.sourceEventId !== undefined && !eventDefinitionFor(config.mode, point.sourceEventId))
      )
        return false;
      if (turningPointIds.has(point.id)) return false;
      turningPointIds.add(point.id);
      return true;
    })
  )
    return false;

  if (!isRecord(value.metrics)) return false;
  const metrics = value.metrics as unknown as GameState['metrics'];
  if (
    !isIntegerBounded(metrics.interactiveEventCount, 0, Number.MAX_SAFE_INTEGER) ||
    !isIntegerBounded(metrics.maxDecisionGapTicks, 0, clockTick) ||
    (metrics.lastDecisionTick !== null &&
      !isFiniteTick(metrics.lastDecisionTick, clockTick, config.rescueTick)) ||
    !isRecord(metrics.taskReasonCounts) ||
    !Object.keys(metrics.taskReasonCounts).every((code) => REASONS.includes(code as never)) ||
    !Object.values(metrics.taskReasonCounts).every((count) =>
      isIntegerBounded(count, 0, Number.MAX_SAFE_INTEGER),
    ) ||
    metrics.lastDecisionTick !== (eventSchedule.lastDecisionTick ?? null)
  )
    return false;
  if (!isRecord(value.rngStates)) return false;
  const rngStates = value.rngStates as unknown as GameState['rngStates'];
  if (
    !RANDOM_STREAM_NAMES.every((name) => isRandomStreamState(rngStates[name])) ||
    !isIntegerBounded(value.sequence, 0, Number.MAX_SAFE_INTEGER)
  )
    return false;
  if (
    (value.status === 'decision' &&
      (!isRecord(value.activeEvent) ||
        value.activeEvent.chosenChoiceId !== null ||
        value.activeEvent.result !== null)) ||
    (value.status === 'event-result' &&
      (!isRecord(value.activeEvent) ||
        value.activeEvent.chosenChoiceId === null ||
        !isNonEmptyString(value.activeEvent.result)))
  )
    return false;
  return true;
}

export function createSaveEnvelope(
  state: GameState,
  savedAt = new Date().toISOString(),
): SaveEnvelope {
  if (typeof savedAt !== 'string' || savedAt.trim().length === 0)
    throw new Error('savedAt must be a non-empty string');
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    rulesVersion: state.config.rulesVersion,
    savedAt,
    gameState: cloneGameState(state),
  };
}
export const serializeSave = (state: GameState, savedAt?: string): string =>
  JSON.stringify(createSaveEnvelope(state, savedAt));
export function parseSaveEnvelope(
  raw: unknown,
  expectedRulesVersion = RULES_VERSION,
): SaveParseResult {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim().length === 0))
    return { ok: false, reason: 'missing' };
  if (typeof raw !== 'string') return { ok: false, reason: 'invalid-envelope' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: 'malformed-json' };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'invalid-envelope' };
  if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION)
    return { ok: false, reason: 'unsupported-schema' };
  if (parsed.rulesVersion !== expectedRulesVersion)
    return { ok: false, reason: 'incompatible-rules' };
  if (
    typeof parsed.savedAt !== 'string' ||
    parsed.savedAt.trim().length === 0 ||
    !isValidGameState(parsed.gameState)
  )
    return { ok: false, reason: 'invalid-envelope' };
  const state = cloneGameState(parsed.gameState);
  return {
    ok: true,
    envelope: {
      schemaVersion: SAVE_SCHEMA_VERSION,
      rulesVersion: parsed.rulesVersion,
      savedAt: parsed.savedAt,
      gameState: state,
    },
    state,
  };
}
export function restoreSave(raw: unknown, expectedRulesVersion = RULES_VERSION): GameState | null {
  const result = parseSaveEnvelope(raw, expectedRulesVersion);
  return result.ok ? result.state : null;
}
