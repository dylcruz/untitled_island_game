import {
  advanceStep,
  applyCommand,
  createGame,
  createSnapshot,
  deriveEndingSummary,
  EVENT_BY_ID,
  SLICE_GAME_CONFIG,
  TUNING,
} from '../src/game/index';
import type {
  CampPriority,
  ChoiceId,
  EventId,
  GameCommand,
  GameMode,
  GameState,
  ResourceId,
  SourceId,
  TaskKind,
  TaskReasonCode,
  WaypointId,
} from '../src/game/index';

const DEFAULT_RUNS = 10;
const DEFAULT_SEED = 'm2-headless';
const POLICY_ID = 'm3-conservative';
const POLICY_VERSION = 'm3';
const SLICE_POLICY_ID = 'm1-slice-first-choice';
const SLICE_POLICY_VERSION = 'm1';

// At 100 ms fixed steps this is a 12-second planner hand-off budget (one fifth
// of a production day). The slice completes with a shorter idle interval.
const MAX_TASKLESS_RUNNING_STEPS = 180;
const RESOURCE_IDS: readonly ResourceId[] = ['water', 'food', 'materials'];
const SOURCE_IDS: readonly SourceId[] = ['water', 'forage', 'wreckage', 'forest'];
const WAYPOINT_IDS: readonly WaypointId[] = [
  'camp',
  'water',
  'forage',
  'wreckage',
  'forest',
  'interior',
];
const TASK_KINDS: readonly TaskKind[] = [
  'drink',
  'eat',
  'rest',
  'sleep',
  'gather-water',
  'gather-food',
  'gather-materials',
  'repair-shelter',
];
const TASK_REASON_CODES: readonly TaskReasonCode[] = [
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
];

/** Stable event choices are part of the headless policy, not random input. */
const CONSERVATIVE_EVENT_CHOICES: Readonly<Partial<Record<EventId, ChoiceId>>> = {
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

interface InvariantFailure {
  code: string;
  detail: string;
  tick: number;
  status: GameState['status'];
}

interface CommandTraceEntry {
  tick: number;
  day: number;
  type: GameCommand['type'];
  priority?: CampPriority;
  eventId?: EventId;
  choiceId?: ChoiceId;
  accepted: boolean;
  reason?: string;
}

interface SimulationResult {
  seed: string;
  policy: string;
  version: string;
  mode: GameMode;
  status: GameState['status'];
  tick: number;
  day: number;
  survivorCount: number;
  aliveCount: number;
  eventCount: number;
  minDecisionSpacingTicks: number | null;
  maxDecisionGapTicks: number;
  taskReasonCounts: Partial<Record<TaskReasonCode, number>>;
  priorityUsage: Record<CampPriority, number>;
  maxTasklessRunningSteps: number;
  endingQuality: ReturnType<typeof deriveEndingSummary>['quality'] | null;
  minResources: Record<ResourceId, number>;
  minSources: Record<SourceId, number>;
  invariantFailures: InvariantFailure[];
  serializedStateBytes: number;
  commandTrace: CommandTraceEntry[];
}

interface RunTracker {
  expectedSurvivorIds: readonly string[];
  tasklessSteps: Map<string, number>;
  maxTasklessSteps: number;
  minResources: Record<ResourceId, number>;
  minSources: Record<SourceId, number>;
  priorityUsage: Record<CampPriority, number>;
  failures: InvariantFailure[];
  failureKeys: Set<string>;
  commandTrace: CommandTraceEntry[];
  decisionTicks: number[];
}

function parseArgument(name: string): string | undefined {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return value?.slice(prefix.length);
}

function parseMode(): GameMode {
  const value = parseArgument('--mode') ?? 'production';
  if (value !== 'production' && value !== 'slice')
    throw new Error('--mode must be production or slice');
  return value;
}

function parseRuns(): number {
  const value = parseArgument('--runs');
  if (value === undefined) return DEFAULT_RUNS;
  const runs = Number(value);
  if (!Number.isInteger(runs) || runs < 1 || runs > 1000) {
    throw new Error('--runs must be an integer between 1 and 1000');
  }
  return runs;
}

function emptyPriorityUsage(): Record<CampPriority, number> {
  return { balanced: 0, water: 0, food: 0, build: 0, recover: 0 };
}

function emptyResourceValues(): Record<ResourceId, number> {
  return { water: 0, food: 0, materials: 0 };
}

function emptySourceValues(): Record<SourceId, number> {
  return { water: 0, forage: 0, wreckage: 0, forest: 0 };
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function recordFailure(tracker: RunTracker, state: GameState, code: string, detail: string): void {
  const key = `${code}:${detail}`;
  if (tracker.failureKeys.has(key)) return;
  tracker.failureKeys.add(key);
  tracker.failures.push({ code, detail, tick: state.clock.tick, status: state.status });
}

function updateMinimums(state: GameState, tracker: RunTracker): void {
  for (const id of RESOURCE_IDS) {
    const value = state.resources[id];
    if (finite(value)) tracker.minResources[id] = Math.min(tracker.minResources[id]!, value);
  }
  for (const id of SOURCE_IDS) {
    const value = state.island.sourceStates[id].available;
    if (finite(value)) tracker.minSources[id] = Math.min(tracker.minSources[id]!, value);
  }
}

function resourceForSource(sourceId: SourceId): ResourceId {
  if (sourceId === 'water') return 'water';
  if (sourceId === 'forage') return 'food';
  return 'materials';
}

function incomingResource(state: GameState, resourceId: ResourceId): number {
  return state.reservations
    .filter((reservation) => reservation.kind !== 'materials')
    .filter((reservation) => resourceForSource(reservation.sourceId) === resourceId)
    .reduce((sum, reservation) => sum + reservation.expectedYield, 0);
}

function reservedMaterials(state: GameState): number {
  return state.reservations
    .filter((reservation) => reservation.kind === 'materials')
    .reduce((sum, reservation) => sum + (reservation.reservedAmount ?? 0), 0);
}

function projectedPriority(state: GameState): CampPriority {
  const living = state.survivors.filter((survivor) => survivor.alive).length;
  const waterTarget = living * TUNING.planner.targetStockPerSurvivor.water;
  const foodTarget = living * TUNING.planner.targetStockPerSurvivor.food;
  if (state.resources.water + incomingResource(state, 'water') < waterTarget) return 'water';
  if (state.resources.food + incomingResource(state, 'food') < foodTarget) return 'food';

  const freeMaterials = state.resources.materials - reservedMaterials(state);
  const shelterPoor = state.shelter.condition < TUNING.shelter.poorThreshold;
  const materialsLow = freeMaterials < TUNING.shelter.repairMaterials;
  const materialsSupport = freeMaterials >= TUNING.shelter.repairMaterials;
  if ((shelterPoor && materialsSupport) || materialsLow) return 'build';

  if (
    state.survivors.some(
      (survivor) =>
        survivor.alive &&
        (survivor.injury !== null || survivor.needs.health < 60 || survivor.needs.energy <= 35),
    )
  )
    return 'recover';
  return 'balanced';
}

function fallbackChoice(eventId: EventId): ChoiceId {
  const choices = EVENT_BY_ID[eventId].choices;
  const preferred = CONSERVATIVE_EVENT_CHOICES[eventId];
  if (preferred && choices.some((choice) => choice.id === preferred)) return preferred;
  return [...choices].sort((left, right) => left.id.localeCompare(right.id))[0]!.id;
}

function choiceForEvent(state: GameState, mode: GameMode): ChoiceId {
  const eventId = state.activeEvent!.id;
  if (mode === 'slice') return EVENT_BY_ID[eventId].choices[0]!.id;
  return fallbackChoice(eventId);
}

function appendCommandTrace(
  tracker: RunTracker,
  state: GameState,
  command: GameCommand,
  accepted: boolean,
  reason?: string,
): void {
  const trace: CommandTraceEntry = {
    tick: state.clock.tick,
    day: state.clock.day,
    type: command.type,
    accepted,
  };
  if (command.type === 'set-camp-priority') trace.priority = command.priority;
  if (command.type === 'select-event-choice') {
    trace.eventId = command.eventId;
    trace.choiceId = command.choiceId;
  }
  if (command.type === 'acknowledge-event-result') trace.eventId = command.eventId;
  if (reason !== undefined) trace.reason = reason;
  tracker.commandTrace.push(trace);
}

function checkTransition(
  previous: GameState,
  next: GameState,
  tracker: RunTracker,
  kind: 'advance' | 'command',
): void {
  if (next.clock.tick < previous.clock.tick)
    recordFailure(
      tracker,
      next,
      'tick-regression',
      `tick moved ${previous.clock.tick} -> ${next.clock.tick}`,
    );
  if (kind === 'command' && next.clock.tick !== previous.clock.tick)
    recordFailure(
      tracker,
      next,
      'command-advanced-time',
      `${previous.clock.tick} -> ${next.clock.tick}`,
    );
  if (kind === 'advance' && next.clock.tick !== previous.clock.tick + 1)
    recordFailure(
      tracker,
      next,
      'advance-step-size',
      `${previous.clock.tick} -> ${next.clock.tick}`,
    );
  if (previous.status === 'running' && next.status === 'decision' && next.activeEvent) {
    const previousDecisionTick = tracker.decisionTicks.at(-1);
    if (previousDecisionTick !== undefined) {
      const spacing = next.clock.tick - previousDecisionTick;
      const minimumSpacing = Math.ceil(next.config.ticksPerDay * 0.75);
      if (next.config.mode === 'production' && spacing < minimumSpacing)
        recordFailure(
          tracker,
          next,
          'decision-spacing',
          `${spacing} < production minimum ${minimumSpacing} ticks`,
        );
    }
    tracker.decisionTicks.push(next.clock.tick);
  }
  if (
    (previous.status === 'decision' || previous.status === 'event-result') &&
    next.clock.tick !== previous.clock.tick
  )
    recordFailure(
      tracker,
      next,
      'paused-time-advanced',
      `${previous.status} at ${previous.clock.tick}`,
    );
}

function checkInvariants(state: GameState, tracker: RunTracker, countRunningStep: boolean): void {
  updateMinimums(state, tracker);
  const fail = (code: string, detail: string): void => recordFailure(tracker, state, code, detail);

  if (state.survivors.length !== state.config.survivorCount)
    fail('survivor-count', `${state.survivors.length} !== ${state.config.survivorCount}`);
  const survivorIds = state.survivors.map((survivor) => survivor.id);
  if (new Set(survivorIds).size !== survivorIds.length)
    fail('survivor-ids', 'survivor IDs are not unique');
  if (
    survivorIds.length !== tracker.expectedSurvivorIds.length ||
    survivorIds.some((id, index) => id !== tracker.expectedSurvivorIds[index])
  )
    fail('survivor-ids', `expected stable IDs ${tracker.expectedSurvivorIds.join(',')}`);

  if (!Number.isInteger(state.clock.tick) || state.clock.tick < 0)
    fail('clock', `invalid tick ${state.clock.tick}`);
  if (!Number.isInteger(state.clock.day) || state.clock.day < 1)
    fail('clock', `invalid day ${state.clock.day}`);
  const expectedDay = Math.min(
    Math.floor(state.clock.tick / state.config.ticksPerDay) + 1,
    Math.ceil(state.config.rescueTick / state.config.ticksPerDay),
  );
  if (state.clock.day !== expectedDay) fail('clock', `day ${state.clock.day} !== ${expectedDay}`);
  if (state.clock.tick > state.config.rescueTick)
    fail('clock', `tick ${state.clock.tick} exceeds rescue ${state.config.rescueTick}`);
  const maxDecisionGapTicks =
    state.config.mode === 'production'
      ? TUNING.productionEventDeadlineDays * state.config.ticksPerDay
      : null;
  if (!finite(state.metrics.maxDecisionGapTicks) || state.metrics.maxDecisionGapTicks < 0)
    fail('decision-gap', `invalid max gap ${state.metrics.maxDecisionGapTicks}`);
  else if (maxDecisionGapTicks !== null && state.metrics.maxDecisionGapTicks > maxDecisionGapTicks)
    fail(
      'decision-gap',
      `${state.metrics.maxDecisionGapTicks} > production limit ${maxDecisionGapTicks}`,
    );

  for (const id of RESOURCE_IDS) {
    const value = state.resources[id];
    if (!finite(value) || value < 0 || value > TUNING.resourceCaps[id])
      fail('resource-bounds', `${id}=${value}`);
  }
  for (const id of SOURCE_IDS) {
    const source = state.island.sourceStates[id];
    if (
      source.id !== id ||
      !finite(source.available) ||
      !finite(source.capacity) ||
      source.available < 0 ||
      source.capacity < 0 ||
      source.capacity > TUNING.sourceCaps[id] ||
      source.available > source.capacity
    )
      fail('source-bounds', `${id} available=${source.available} capacity=${source.capacity}`);
  }
  if (
    !finite(state.shelter.condition) ||
    !finite(state.shelter.maximumCondition) ||
    state.shelter.condition < 0 ||
    state.shelter.condition > state.shelter.maximumCondition
  )
    fail('shelter-bounds', `${state.shelter.condition}/${state.shelter.maximumCondition}`);

  const activeTaskIds = new Set<string>();
  const reservationById = new Map(
    state.reservations.map((reservation) => [reservation.id, reservation]),
  );
  if (reservationById.size !== state.reservations.length)
    fail('reservation-ids', 'reservation IDs are not unique');
  const reservationTaskIds = new Set<string>();
  for (const reservation of state.reservations) {
    if (reservationTaskIds.has(reservation.taskId))
      fail('reservation-tasks', `duplicate task ${reservation.taskId}`);
    reservationTaskIds.add(reservation.taskId);
    const survivor = state.survivors.find((entry) => entry.id === reservation.survivorId);
    const task = survivor?.activeTask;
    if (
      !survivor ||
      !survivor.alive ||
      !task ||
      task.id !== reservation.taskId ||
      task.reservationId !== reservation.id
    )
      fail('reservation-link', `${reservation.id} does not match its active task`);
    if (!SOURCE_IDS.includes(reservation.sourceId))
      fail('reservation-source', `${reservation.id} source`);
    if (!finite(reservation.expectedYield) || reservation.expectedYield < 0)
      fail('reservation-yield', `${reservation.id} yield=${reservation.expectedYield}`);
    if (reservation.kind === 'materials') {
      if (!finite(reservation.reservedAmount ?? NaN) || (reservation.reservedAmount ?? 0) <= 0)
        fail('material-reservation', `${reservation.id} amount=${reservation.reservedAmount}`);
      if (reservation.resourceId !== 'materials' || reservation.expectedYield !== 0)
        fail('material-reservation', `${reservation.id} has invalid material fields`);
    } else if (reservation.expectedYield <= 0) {
      fail('reservation-yield', `${reservation.id} source yield must be positive`);
    }
  }
  const claimedBySource = emptySourceValues();
  let claimedMaterials = 0;
  for (const reservation of state.reservations) {
    if (reservation.kind === 'materials') claimedMaterials += reservation.reservedAmount ?? 0;
    else claimedBySource[reservation.sourceId] += reservation.expectedYield;
  }
  for (const sourceId of SOURCE_IDS)
    if (claimedBySource[sourceId] > state.island.sourceStates[sourceId].available)
      fail('source-overclaim', `${sourceId} claimed=${claimedBySource[sourceId]}`);
  if (claimedMaterials > state.resources.materials)
    fail(
      'material-overreservation',
      `claimed=${claimedMaterials} available=${state.resources.materials}`,
    );

  for (const survivor of state.survivors) {
    if (
      !finite(survivor.morale) ||
      survivor.morale < 0 ||
      survivor.morale > 100 ||
      survivor.progressTicks < 0 ||
      !Number.isInteger(survivor.progressTicks) ||
      survivor.progressTicks > state.config.movementTicks
    )
      fail('survivor-bounds', `${survivor.id} morale/progress`);
    for (const [need, value] of Object.entries(survivor.needs))
      if (!finite(value) || value < 0 || value > 100)
        fail('need-bounds', `${survivor.id}.${need}=${value}`);
    if (
      !WAYPOINT_IDS.includes(survivor.currentWaypoint) ||
      !WAYPOINT_IDS.includes(survivor.targetWaypoint) ||
      !finite(survivor.position.x) ||
      !finite(survivor.position.y) ||
      !finite(survivor.previousPosition.x) ||
      !finite(survivor.previousPosition.y) ||
      survivor.position.x < 0 ||
      survivor.position.x > 1 ||
      survivor.position.y < 0 ||
      survivor.position.y > 1 ||
      survivor.previousPosition.x < 0 ||
      survivor.previousPosition.x > 1 ||
      survivor.previousPosition.y < 0 ||
      survivor.previousPosition.y > 1
    )
      fail('position-bounds', `${survivor.id} position`);
    if (!survivor.alive && survivor.activeTask)
      fail('dead-task', `${survivor.id} retains ${survivor.activeTask.id}`);
    const task = survivor.activeTask;
    if (!task) continue;
    if (activeTaskIds.has(task.id)) fail('task-ids', `duplicate task ${task.id}`);
    activeTaskIds.add(task.id);
    if (
      !TASK_KINDS.includes(task.kind) ||
      !WAYPOINT_IDS.includes(task.destination) ||
      (task.phase !== 'travel' && task.phase !== 'work') ||
      !Number.isInteger(task.remainingTicks) ||
      task.remainingTicks <= 0 ||
      !Number.isInteger(task.workTicks) ||
      task.workTicks <= 0 ||
      task.remainingTicks > task.workTicks ||
      !TASK_REASON_CODES.includes(task.reason.code)
    )
      fail('task-invalid', `${survivor.id} task ${task.id}`);
    if (task.phase === 'work' && survivor.progressTicks !== 0)
      fail('task-progress', `${task.id} work progress=${survivor.progressTicks}`);
    if (task.phase === 'travel' && task.destination === survivor.currentWaypoint)
      fail('task-travel', `${task.id} travels to current waypoint`);
    if (task.phase === 'work' && task.destination !== survivor.currentWaypoint)
      fail(
        'task-work',
        `${task.id} work at ${survivor.currentWaypoint}, target ${task.destination}`,
      );
    if (task.reservationId !== null && !reservationById.has(task.reservationId))
      fail('reservation-link', `${task.id} points to missing ${task.reservationId}`);
    const taskReservation = task.reservationId
      ? reservationById.get(task.reservationId)
      : undefined;
    if (
      taskReservation &&
      ((task.kind === 'gather-water' &&
        (taskReservation.kind === 'materials' || taskReservation.sourceId !== 'water')) ||
        (task.kind === 'gather-food' &&
          (taskReservation.kind === 'materials' || taskReservation.sourceId !== 'forage')) ||
        (task.kind === 'gather-materials' &&
          (taskReservation.kind === 'materials' ||
            !['wreckage', 'forest'].includes(taskReservation.sourceId))) ||
        (task.kind === 'repair-shelter' && taskReservation.kind !== 'materials') ||
        !['gather-water', 'gather-food', 'gather-materials', 'repair-shelter'].includes(task.kind))
    )
      fail('reservation-link', `${task.id} has a reservation for the wrong task kind`);
    if (
      ['gather-water', 'gather-food', 'gather-materials', 'repair-shelter'].includes(task.kind) &&
      task.reservationId === null
    )
      fail('task-reservation', `${task.id} ${task.kind} has no reservation`);
  }

  if (state.activeEvent !== null) {
    const event = EVENT_BY_ID[state.activeEvent.id];
    if (!event) fail('event-invalid', `unknown event ${state.activeEvent.id}`);
    if (
      !Number.isInteger(state.activeEvent.activatedTick) ||
      state.activeEvent.activatedTick < 0 ||
      state.activeEvent.activatedTick > state.clock.tick
    )
      fail('event-timing', `${state.activeEvent.id} activated=${state.activeEvent.activatedTick}`);
    const participantIds = state.activeEvent.participantIds ?? [];
    const expectedParticipants = event?.participantRule === 'pair' ? 2 : 1;
    if (participantIds.length !== expectedParticipants)
      fail(
        'event-participants',
        `${state.activeEvent.id} has ${participantIds.length} participants`,
      );
    if (new Set(participantIds).size !== participantIds.length)
      fail('event-participants', 'duplicate participants');
    if (
      participantIds.some(
        (id) => !state.survivors.some((survivor) => survivor.id === id && survivor.alive),
      )
    )
      fail('event-participants', 'event references a non-living survivor');
    if (
      event?.participantRule === 'forager' &&
      participantIds.some(
        (id) => !state.survivors.find((survivor) => survivor.id === id)?.traits.includes('forager'),
      )
    )
      fail('event-participants', `${state.activeEvent.id} participant is not a forager`);
    if (
      state.activeEvent.chosenChoiceId !== null &&
      !event?.choices.some((choice) => choice.id === state.activeEvent!.chosenChoiceId)
    )
      fail('event-choice', `${state.activeEvent.id} has unknown choice`);
    if (state.status !== 'decision' && state.status !== 'event-result')
      fail('event-status', `active event while ${state.status}`);
    if (
      state.status === 'decision' &&
      (state.activeEvent.chosenChoiceId !== null || state.activeEvent.result !== null)
    )
      fail('event-status', 'decision must have no selected choice/result');
    if (
      state.status === 'event-result' &&
      (state.activeEvent.chosenChoiceId === null || state.activeEvent.result === null)
    )
      fail('event-status', 'event-result must have choice/result');
  } else if (state.status === 'decision' || state.status === 'event-result') {
    fail('event-status', `${state.status} without active event`);
  }

  const scheduledIds = new Set<string>();
  for (const effect of state.scheduledEffects) {
    if (scheduledIds.has(effect.id)) fail('effect-ids', `duplicate effect ${effect.id}`);
    scheduledIds.add(effect.id);
    if (
      !Number.isInteger(effect.dueTick) ||
      effect.dueTick <= state.clock.tick ||
      effect.dueTick > state.config.rescueTick
    )
      fail('effect-timing', `${effect.id} due=${effect.dueTick}`);
    if (!effect.sourceChoiceId) fail('effect-provenance', `${effect.id} has no source choice`);
  }

  if (countRunningStep && state.status === 'running') {
    for (const survivor of state.survivors) {
      if (!survivor.alive) {
        tracker.tasklessSteps.set(survivor.id, 0);
        continue;
      }
      const count = survivor.activeTask ? 0 : (tracker.tasklessSteps.get(survivor.id) ?? 0) + 1;
      tracker.tasklessSteps.set(survivor.id, count);
      tracker.maxTasklessSteps = Math.max(tracker.maxTasklessSteps, count);
      if (count === MAX_TASKLESS_RUNNING_STEPS + 1)
        fail(
          'taskless-loop',
          `${survivor.id} exceeded ${MAX_TASKLESS_RUNNING_STEPS} taskless running steps`,
        );
    }
  } else if (state.status !== 'running') {
    for (const survivor of state.survivors) tracker.tasklessSteps.set(survivor.id, 0);
  }
}

function createTracker(state: GameState): RunTracker {
  const minResources = emptyResourceValues();
  const minSources = emptySourceValues();
  const tracker: RunTracker = {
    expectedSurvivorIds: state.survivors.map((survivor) => survivor.id),
    tasklessSteps: new Map(state.survivors.map((survivor) => [survivor.id, 0])),
    maxTasklessSteps: 0,
    minResources,
    minSources,
    priorityUsage: emptyPriorityUsage(),
    failures: [],
    failureKeys: new Set(),
    commandTrace: [],
    decisionTicks: [],
  };
  for (const id of RESOURCE_IDS) minResources[id] = state.resources[id];
  for (const id of SOURCE_IDS) minSources[id] = state.island.sourceStates[id].available;
  return tracker;
}

function runCommand(state: GameState, command: GameCommand, tracker: RunTracker): GameState {
  const result = applyCommand(state, command);
  appendCommandTrace(tracker, state, command, result.accepted, result.reason);
  checkTransition(state, result.state, tracker, 'command');
  checkInvariants(result.state, tracker, false);
  return result.state;
}

function maybeApplyPolicy(state: GameState, tracker: RunTracker, mode: GameMode): GameState {
  if (mode === 'slice' || state.status !== 'running') return state;
  if (state.campPolicy.lastChangedDay === state.clock.day) return state;
  const priority = projectedPriority(state);
  if (priority === state.campPolicy.priority) return state;
  const next = runCommand(state, { type: 'set-camp-priority', priority }, tracker);
  const lastTrace = tracker.commandTrace.at(-1)!;
  if (!lastTrace.accepted) {
    recordFailure(
      tracker,
      next,
      'policy-command',
      `priority ${priority} rejected: ${lastTrace.reason ?? 'unknown'}`,
    );
  } else tracker.priorityUsage[priority] += 1;
  return next;
}

function runOnce(seed: string, mode: GameMode): SimulationResult {
  let state = mode === 'slice' ? createGame({ ...SLICE_GAME_CONFIG, seed }) : createGame({ seed });
  const tracker = createTracker(state);
  checkInvariants(state, tracker, false);
  const maximumActions = state.config.rescueTick + 4 * (mode === 'slice' ? 3 : 8) + 2 * 15 + 20;
  let advances = 0;
  let commands = 0;
  let actions = 0;

  while (state.status !== 'victory' && state.status !== 'defeat' && actions < maximumActions) {
    if (state.status === 'running') {
      const traceCountBeforePolicy = tracker.commandTrace.length;
      state = maybeApplyPolicy(state, tracker, mode);
      if (tracker.commandTrace.length > traceCountBeforePolicy) {
        commands += 1;
        actions += 1;
      }
      if (state.status !== 'running') continue;
      const next = advanceStep(state);
      checkTransition(state, next, tracker, 'advance');
      state = next;
      advances += 1;
      actions += 1;
      checkInvariants(state, tracker, true);
      continue;
    }
    if (state.status === 'decision' && state.activeEvent) {
      const eventId = state.activeEvent.id;
      const choiceId = choiceForEvent(state, mode);
      state = runCommand(state, { type: 'select-event-choice', eventId, choiceId }, tracker);
      commands += 1;
      actions += 1;
      if (state.status !== 'event-result') {
        recordFailure(
          tracker,
          state,
          'event-command',
          `choice ${eventId}/${choiceId} was not accepted`,
        );
        continue;
      }
      const acknowledged = runCommand(
        state,
        { type: 'acknowledge-event-result', eventId },
        tracker,
      );
      commands += 1;
      actions += 1;
      state = acknowledged;
      continue;
    }
    if (state.status === 'event-result' && state.activeEvent) {
      const eventId = state.activeEvent.id;
      state = runCommand(state, { type: 'acknowledge-event-result', eventId }, tracker);
      commands += 1;
      actions += 1;
      continue;
    }
    recordFailure(tracker, state, 'simulation-stuck', `unhandled state ${state.status}`);
    break;
  }

  if (state.status !== 'victory' && state.status !== 'defeat')
    recordFailure(
      tracker,
      state,
      'guard-exceeded',
      `${actions} actions (${advances} advances, ${commands} commands)`,
    );
  if (state.clock.tick > state.config.rescueTick)
    recordFailure(
      tracker,
      state,
      'terminal-after-rescue',
      `${state.clock.tick} > ${state.config.rescueTick}`,
    );
  checkInvariants(state, tracker, false);
  if (
    mode === 'production' &&
    (state.metrics.interactiveEventCount < 8 || state.metrics.interactiveEventCount > 10)
  )
    recordFailure(
      tracker,
      state,
      'decision-count',
      `${state.metrics.interactiveEventCount} decisions outside production target 8-10`,
    );

  const decisionSpacings = tracker.decisionTicks
    .slice(1)
    .map((tick, index) => tick - tracker.decisionTicks[index]!);

  const snapshot = createSnapshot(state);
  const serialized = JSON.stringify(snapshot);
  const endingQuality =
    state.status === 'victory' || state.status === 'defeat'
      ? deriveEndingSummary(state).quality
      : null;
  return {
    seed,
    policy: mode === 'slice' ? SLICE_POLICY_ID : POLICY_ID,
    version: mode === 'slice' ? SLICE_POLICY_VERSION : POLICY_VERSION,
    mode,
    status: snapshot.status,
    tick: snapshot.clock.tick,
    day: snapshot.clock.day,
    survivorCount: snapshot.survivors.length,
    aliveCount: snapshot.survivors.filter((survivor) => survivor.alive).length,
    eventCount: snapshot.metrics.interactiveEventCount,
    minDecisionSpacingTicks: decisionSpacings.length ? Math.min(...decisionSpacings) : null,
    maxDecisionGapTicks: snapshot.metrics.maxDecisionGapTicks,
    taskReasonCounts: { ...snapshot.metrics.taskReasonCounts },
    priorityUsage: { ...tracker.priorityUsage },
    maxTasklessRunningSteps: tracker.maxTasklessSteps,
    endingQuality,
    minResources: { ...tracker.minResources },
    minSources: { ...tracker.minSources },
    invariantFailures: tracker.failures,
    serializedStateBytes: new TextEncoder().encode(serialized).byteLength,
    commandTrace: tracker.commandTrace,
  };
}

function main(): void {
  try {
    const mode = parseMode();
    const runs = parseRuns();
    const seedPrefix = parseArgument('--seed') ?? DEFAULT_SEED;
    if (seedPrefix.trim().length === 0) throw new Error('--seed must not be empty');

    const results = Array.from({ length: runs }, (_, index) =>
      runOnce(runs === 1 ? seedPrefix : `${seedPrefix}-${index + 1}`, mode),
    );
    const victories = results.filter((result) => result.status === 'victory');
    const allSurvivorVictories = victories.filter(
      (result) => result.aliveCount === result.survivorCount,
    );
    const invariantFailureRuns = results.filter((result) => result.invariantFailures.length > 0);
    const report = {
      policy: mode === 'slice' ? SLICE_POLICY_ID : POLICY_ID,
      version: mode === 'slice' ? SLICE_POLICY_VERSION : POLICY_VERSION,
      mode,
      runs,
      seedPrefix,
      invariantThresholds: {
        maxTasklessRunningSteps: MAX_TASKLESS_RUNNING_STEPS,
        maxDecisionGapTicks: TUNING.productionEventDeadlineDays * 600,
      },
      summary: {
        victories: victories.length,
        victoryRate: victories.length / runs,
        allSurvivorVictories: allSurvivorVictories.length,
        allSurvivorRate: allSurvivorVictories.length / runs,
        defeats: results.filter((result) => result.status === 'defeat').length,
        invariantFailures: invariantFailureRuns.length,
        invariantFailureCount: results.reduce(
          (total, result) => total + result.invariantFailures.length,
          0,
        ),
      },
      results,
    };
    console.log(JSON.stringify(report, null, 2));
    if (
      results.some(
        (result) =>
          result.invariantFailures.length > 0 ||
          (result.status !== 'victory' && result.status !== 'defeat') ||
          result.survivorCount !== (mode === 'slice' ? 1 : 3),
      )
    )
      process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}

main();
