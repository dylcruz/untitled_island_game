import {
  advanceStep,
  applyCommand,
  createGame,
  createSnapshot,
  deriveEndingSummary,
  EVENT_BY_ID,
  PRODUCTION_EVENT_DEFINITIONS,
  SLICE_GAME_CONFIG,
  TUNING,
} from '../src/game/index';
import type {
  CampPriority,
  ChoiceId,
  EffectData,
  EventId,
  GameCommand,
  GameMode,
  GameState,
  ProductionEventId,
  ResourceId,
  SourceId,
  TaskKind,
  TaskReasonCode,
  WaypointId,
} from '../src/game/index';
import { loadReleaseManifest } from './simulation/manifest';
import { createPolicy, POLICY_IDS } from './simulation/policies';
import type { PolicyId } from './simulation/policies';

const DEFAULT_RUNS = 10;
const DEFAULT_SEED = 'm2-headless';
const MAX_TASKLESS_RUNNING_STEPS = 180;
const RESOURCES: readonly ResourceId[] = ['water', 'food', 'materials'];
const SOURCES: readonly SourceId[] = ['water', 'forage', 'wreckage', 'forest'];
const WAYPOINTS: readonly WaypointId[] = [
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
const TASK_REASONS: readonly TaskReasonCode[] = [
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
const EVENT_IDS = PRODUCTION_EVENT_DEFINITIONS.map((event) => event.id);
type BatchMode = 'single' | 'matrix' | 'release' | 'sensitivity';

interface Failure {
  code: string;
  detail: string;
  tick: number;
  status: GameState['status'];
}
interface Trace {
  tick: number;
  day: number;
  type: GameCommand['type'];
  priority?: CampPriority;
  eventId?: EventId;
  choiceId?: ChoiceId;
  accepted: boolean;
  reason?: string;
}
interface Death {
  survivorId: string;
  day: number;
  tick: number;
  causes: string[];
}
interface Frequencies {
  priorities: Record<string, number>;
  rootEvents: Record<string, number>;
  followUps: Record<string, number>;
  automaticEffects: Record<string, number>;
  choices: Record<string, number>;
  taskReasons: Record<string, number>;
  damageByEvent: Record<string, number>;
  resourceLossByEvent: Record<string, number>;
}
interface Result {
  seed: string;
  gameSeed: string;
  policy: string;
  policyId: string;
  version: string;
  policyVersion: string;
  policySeed: string;
  excludedEventId: ProductionEventId | null;
  mode: GameMode;
  status: GameState['status'];
  tick: number;
  day: number;
  survivorCount: number;
  aliveCount: number;
  eventCount: number;
  minDecisionSpacingTicks: number | null;
  maxDecisionGapTicks: number;
  decisionCompliance: boolean;
  gapCompliance: boolean;
  taskReasonCounts: Record<string, number>;
  priorityUsage: Record<CampPriority, number>;
  frequencies: Frequencies;
  deaths: Death[];
  maxTasklessRunningSteps: number;
  endingQuality: ReturnType<typeof deriveEndingSummary>['quality'] | null;
  minResources: Record<ResourceId, number>;
  minSources: Record<SourceId, number>;
  initialInvariantFailures: Failure[];
  invariantFailures: Failure[];
  serializedStateBytes: number;
  commandTrace: Trace[];
}
interface Tracker {
  expectedSurvivorIds: readonly string[];
  minResources: Record<ResourceId, number>;
  minSources: Record<SourceId, number>;
  priorityUsage: Record<CampPriority, number>;
  taskless: Map<string, number>;
  maxTaskless: number;
  failureKeys: Set<string>;
  failures: Failure[];
  initialFailures: Failure[];
  trace: Trace[];
  decisionTicks: number[];
  deaths: Death[];
  frequencies: Frequencies;
}

const arg = (name: string): string | undefined => {
  const prefix = `${name}=`;
  return process.argv
    .slice(2)
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
};
const flag = (name: string): boolean => process.argv.slice(2).includes(name);
function validateArguments(): void {
  const keys = ['--mode', '--runs', '--seed', '--batch', '--policy', '--exclude-event'];
  for (const value of process.argv.slice(2)) {
    if (value === '--sensitivity') continue;
    if (!keys.some((key) => value.startsWith(`${key}=`)))
      throw new Error(`unknown argument: ${value}`);
  }
}
function integer(name: string, fallback: number, maximum: number): number {
  const raw = arg(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  return value;
}
function mode(): GameMode {
  const value = arg('--mode') ?? 'production';
  if (value !== 'production' && value !== 'slice')
    throw new Error('--mode must be production or slice');
  return value;
}
function batch(): BatchMode {
  const value = arg('--batch') ?? (flag('--sensitivity') ? 'sensitivity' : 'single');
  if (!['single', 'matrix', 'release', 'sensitivity'].includes(value))
    throw new Error('--batch must be single, matrix, release, or sensitivity');
  return value as BatchMode;
}
function policy(): PolicyId {
  const value = arg('--policy') ?? 'conservative';
  if (!POLICY_IDS.includes(value as PolicyId))
    throw new Error(`--policy must be one of ${POLICY_IDS.join(', ')}`);
  return value as PolicyId;
}
function emptyFrequencies(): Frequencies {
  return {
    priorities: {},
    rootEvents: {},
    followUps: {},
    automaticEffects: {},
    choices: {},
    taskReasons: {},
    damageByEvent: {},
    resourceLossByEvent: {},
  };
}
function inc(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = (target[key] ?? 0) + amount;
}
function tracker(state: GameState): Tracker {
  return {
    expectedSurvivorIds: state.survivors.map((survivor) => survivor.id),
    minResources: { ...state.resources },
    minSources: Object.fromEntries(
      SOURCES.map((id) => [id, state.island.sourceStates[id].available]),
    ) as Record<SourceId, number>,
    priorityUsage: { balanced: 0, water: 0, food: 0, build: 0, recover: 0 },
    taskless: new Map(state.survivors.map((survivor) => [survivor.id, 0])),
    maxTaskless: 0,
    failureKeys: new Set(),
    failures: [],
    initialFailures: [],
    trace: [],
    decisionTicks: [],
    deaths: [],
    frequencies: emptyFrequencies(),
  };
}
function fail(t: Tracker, state: GameState, code: string, detail: string): void {
  const key = `${code}:${detail}`;
  if (t.failureKeys.has(key)) return;
  t.failureKeys.add(key);
  t.failures.push({ code, detail, tick: state.clock.tick, status: state.status });
}
const finite = (value: number): boolean => Number.isFinite(value);
function sourceValues(): Record<SourceId, number> {
  return { water: 0, forage: 0, wreckage: 0, forest: 0 };
}
function invariants(state: GameState, t: Tracker, running: boolean): void {
  for (const id of RESOURCES)
    if (finite(state.resources[id]))
      t.minResources[id] = Math.min(t.minResources[id], state.resources[id]);
  for (const id of SOURCES)
    if (finite(state.island.sourceStates[id].available))
      t.minSources[id] = Math.min(t.minSources[id], state.island.sourceStates[id].available);

  if (state.survivors.length !== state.config.survivorCount)
    fail(t, state, 'survivor-count', `${state.survivors.length} !== ${state.config.survivorCount}`);
  const survivorIds = state.survivors.map((survivor) => survivor.id);
  if (new Set(survivorIds).size !== survivorIds.length)
    fail(t, state, 'survivor-ids', 'survivor IDs are not unique');
  if (
    survivorIds.length !== t.expectedSurvivorIds.length ||
    survivorIds.some((id, index) => id !== t.expectedSurvivorIds[index])
  )
    fail(t, state, 'survivor-ids', `expected stable IDs ${t.expectedSurvivorIds.join(',')}`);

  if (!Number.isInteger(state.clock.tick) || state.clock.tick < 0)
    fail(t, state, 'clock', `invalid tick ${state.clock.tick}`);
  if (!Number.isInteger(state.clock.day) || state.clock.day < 1)
    fail(t, state, 'clock', `invalid day ${state.clock.day}`);
  const expectedDay = Math.min(
    Math.floor(state.clock.tick / state.config.ticksPerDay) + 1,
    Math.ceil(state.config.rescueTick / state.config.ticksPerDay),
  );
  if (state.clock.day !== expectedDay)
    fail(t, state, 'clock', `day ${state.clock.day} !== ${expectedDay}`);
  if (state.clock.tick > state.config.rescueTick)
    fail(t, state, 'clock', `tick ${state.clock.tick} exceeds rescue ${state.config.rescueTick}`);
  const maximumGap =
    state.config.mode === 'production'
      ? TUNING.productionEventDeadlineDays * state.config.ticksPerDay
      : null;
  if (!finite(state.metrics.maxDecisionGapTicks) || state.metrics.maxDecisionGapTicks < 0)
    fail(t, state, 'decision-gap', `invalid max gap ${state.metrics.maxDecisionGapTicks}`);
  else if (maximumGap !== null && state.metrics.maxDecisionGapTicks > maximumGap)
    fail(
      t,
      state,
      'decision-gap',
      `${state.metrics.maxDecisionGapTicks} > production limit ${maximumGap}`,
    );

  for (const id of RESOURCES) {
    const value = state.resources[id];
    if (!finite(value) || value < 0 || value > TUNING.resourceCaps[id])
      fail(t, state, 'resource-bounds', `${id}=${value}`);
  }
  for (const id of SOURCES) {
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
      fail(
        t,
        state,
        'source-bounds',
        `${id} available=${source.available} capacity=${source.capacity}`,
      );
  }
  if (
    !finite(state.shelter.condition) ||
    !finite(state.shelter.maximumCondition) ||
    state.shelter.condition < 0 ||
    state.shelter.condition > state.shelter.maximumCondition
  )
    fail(
      t,
      state,
      'shelter-bounds',
      `${state.shelter.condition}/${state.shelter.maximumCondition}`,
    );

  const activeTaskIds = new Set<string>();
  const reservationById = new Map(
    state.reservations.map((reservation) => [reservation.id, reservation]),
  );
  if (reservationById.size !== state.reservations.length)
    fail(t, state, 'reservation-ids', 'reservation IDs are not unique');
  const reservationTaskIds = new Set<string>();
  for (const reservation of state.reservations) {
    if (reservationTaskIds.has(reservation.taskId))
      fail(t, state, 'reservation-tasks', `duplicate task ${reservation.taskId}`);
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
      fail(t, state, 'reservation-link', `${reservation.id} does not match its active task`);
    if (!SOURCES.includes(reservation.sourceId))
      fail(t, state, 'reservation-source', `${reservation.id} source`);
    if (!finite(reservation.expectedYield) || reservation.expectedYield < 0)
      fail(t, state, 'reservation-yield', `${reservation.id} yield=${reservation.expectedYield}`);
    if (reservation.kind === 'materials') {
      if (!finite(reservation.reservedAmount ?? NaN) || (reservation.reservedAmount ?? 0) <= 0)
        fail(
          t,
          state,
          'material-reservation',
          `${reservation.id} amount=${reservation.reservedAmount}`,
        );
      if (reservation.resourceId !== 'materials' || reservation.expectedYield !== 0)
        fail(t, state, 'material-reservation', `${reservation.id} has invalid material fields`);
    } else if (reservation.expectedYield <= 0)
      fail(t, state, 'reservation-yield', `${reservation.id} source yield must be positive`);
  }
  const claimedBySource = sourceValues();
  let claimedMaterials = 0;
  for (const reservation of state.reservations) {
    if (reservation.kind === 'materials') claimedMaterials += reservation.reservedAmount ?? 0;
    else claimedBySource[reservation.sourceId] += reservation.expectedYield;
  }
  for (const sourceId of SOURCES)
    if (claimedBySource[sourceId] > state.island.sourceStates[sourceId].available)
      fail(t, state, 'source-overclaim', `${sourceId} claimed=${claimedBySource[sourceId]}`);
  if (claimedMaterials > state.resources.materials)
    fail(
      t,
      state,
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
      fail(t, state, 'survivor-bounds', `${survivor.id} morale/progress`);
    for (const [need, value] of Object.entries(survivor.needs))
      if (!finite(value) || value < 0 || value > 100)
        fail(t, state, 'need-bounds', `${survivor.id}.${need}=${value}`);
    if (
      !WAYPOINTS.includes(survivor.currentWaypoint) ||
      !WAYPOINTS.includes(survivor.targetWaypoint) ||
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
      fail(t, state, 'position-bounds', `${survivor.id} position`);
    if (!survivor.alive && survivor.activeTask)
      fail(t, state, 'dead-task', `${survivor.id} retains ${survivor.activeTask.id}`);
    const task = survivor.activeTask;
    if (!task) continue;
    if (activeTaskIds.has(task.id)) fail(t, state, 'task-ids', `duplicate task ${task.id}`);
    activeTaskIds.add(task.id);
    if (
      !TASK_KINDS.includes(task.kind) ||
      !WAYPOINTS.includes(task.destination) ||
      (task.phase !== 'travel' && task.phase !== 'work') ||
      !Number.isInteger(task.remainingTicks) ||
      task.remainingTicks <= 0 ||
      !Number.isInteger(task.workTicks) ||
      task.workTicks <= 0 ||
      task.remainingTicks > task.workTicks ||
      !TASK_REASONS.includes(task.reason.code)
    )
      fail(t, state, 'task-invalid', `${survivor.id} task ${task.id}`);
    if (task.phase === 'work' && survivor.progressTicks !== 0)
      fail(t, state, 'task-progress', `${task.id} work progress=${survivor.progressTicks}`);
    if (task.phase === 'travel' && task.destination === survivor.currentWaypoint)
      fail(t, state, 'task-travel', `${task.id} travels to current waypoint`);
    if (task.phase === 'work' && task.destination !== survivor.currentWaypoint)
      fail(
        t,
        state,
        'task-work',
        `${task.id} work at ${survivor.currentWaypoint}, target ${task.destination}`,
      );
    if (task.reservationId !== null && !reservationById.has(task.reservationId))
      fail(t, state, 'reservation-link', `${task.id} points to missing ${task.reservationId}`);
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
      fail(t, state, 'reservation-link', `${task.id} has a reservation for the wrong task kind`);
    if (
      ['gather-water', 'gather-food', 'gather-materials', 'repair-shelter'].includes(task.kind) &&
      task.reservationId === null
    )
      fail(t, state, 'task-reservation', `${task.id} ${task.kind} has no reservation`);
  }

  if (state.activeEvent !== null) {
    const event = EVENT_BY_ID[state.activeEvent.id];
    if (!event) fail(t, state, 'event-invalid', `unknown event ${state.activeEvent.id}`);
    if (
      !Number.isInteger(state.activeEvent.activatedTick) ||
      state.activeEvent.activatedTick < 0 ||
      state.activeEvent.activatedTick > state.clock.tick
    )
      fail(
        t,
        state,
        'event-timing',
        `${state.activeEvent.id} activated=${state.activeEvent.activatedTick}`,
      );
    const participantIds = state.activeEvent.participantIds ?? [];
    const expectedParticipants = event?.participantRule === 'pair' ? 2 : 1;
    if (participantIds.length !== expectedParticipants)
      fail(
        t,
        state,
        'event-participants',
        `${state.activeEvent.id} has ${participantIds.length} participants`,
      );
    if (new Set(participantIds).size !== participantIds.length)
      fail(t, state, 'event-participants', 'duplicate participants');
    if (
      participantIds.some(
        (id) => !state.survivors.some((survivor) => survivor.id === id && survivor.alive),
      )
    )
      fail(t, state, 'event-participants', 'event references a non-living survivor');
    if (
      event?.participantRule === 'forager' &&
      participantIds.some(
        (id) => !state.survivors.find((survivor) => survivor.id === id)?.traits.includes('forager'),
      )
    )
      fail(t, state, 'event-participants', `${state.activeEvent.id} participant is not a forager`);
    if (
      state.activeEvent.chosenChoiceId !== null &&
      !event?.choices.some((choice) => choice.id === state.activeEvent!.chosenChoiceId)
    )
      fail(t, state, 'event-choice', `${state.activeEvent.id} has unknown choice`);
    if (state.status !== 'decision' && state.status !== 'event-result')
      fail(t, state, 'event-status', `active event while ${state.status}`);
    if (
      state.status === 'decision' &&
      (state.activeEvent.chosenChoiceId !== null || state.activeEvent.result !== null)
    )
      fail(t, state, 'event-status', 'decision must have no selected choice/result');
    if (
      state.status === 'event-result' &&
      (state.activeEvent.chosenChoiceId === null || state.activeEvent.result === null)
    )
      fail(t, state, 'event-status', 'event-result must have choice/result');
  } else if (state.status === 'decision' || state.status === 'event-result')
    fail(t, state, 'event-status', `${state.status} without active event`);

  const scheduledIds = new Set<string>();
  for (const effect of state.scheduledEffects) {
    if (scheduledIds.has(effect.id)) fail(t, state, 'effect-ids', `duplicate effect ${effect.id}`);
    scheduledIds.add(effect.id);
    if (
      !Number.isInteger(effect.dueTick) ||
      effect.dueTick <= state.clock.tick ||
      effect.dueTick > state.config.rescueTick
    )
      fail(t, state, 'effect-timing', `${effect.id} due=${effect.dueTick}`);
    if (!effect.sourceChoiceId)
      fail(t, state, 'effect-provenance', `${effect.id} has no source choice`);
  }

  if (running && state.status === 'running')
    for (const survivor of state.survivors) {
      if (!survivor.alive) {
        t.taskless.set(survivor.id, 0);
        continue;
      }
      const count = survivor.activeTask ? 0 : (t.taskless.get(survivor.id) ?? 0) + 1;
      t.taskless.set(survivor.id, count);
      t.maxTaskless = Math.max(t.maxTaskless, count);
      if (count === MAX_TASKLESS_RUNNING_STEPS + 1)
        fail(
          t,
          state,
          'taskless-loop',
          `${survivor.id} exceeded ${MAX_TASKLESS_RUNNING_STEPS} taskless running steps`,
        );
    }
  else if (state.status !== 'running')
    for (const survivor of state.survivors) t.taskless.set(survivor.id, 0);
}
function commandTrace(
  state: GameState,
  command: GameCommand,
  accepted: boolean,
  reason?: string,
): Trace {
  const entry: Trace = {
    tick: state.clock.tick,
    day: state.clock.day,
    type: command.type,
    accepted,
  };
  if (command.type === 'set-camp-priority') entry.priority = command.priority;
  if (command.type === 'select-event-choice') {
    entry.eventId = command.eventId;
    entry.choiceId = command.choiceId;
  }
  if (command.type === 'acknowledge-event-result') entry.eventId = command.eventId;
  if (reason) entry.reason = reason;
  return entry;
}
function loss(effect: EffectData): { damage: number; resources: number } {
  return {
    damage: effect.kind === 'health' && effect.amount < 0 ? -effect.amount : 0,
    resources: effect.kind === 'resource' && effect.amount < 0 ? -effect.amount : 0,
  };
}
function transition(
  previous: GameState,
  next: GameState,
  t: Tracker,
  kind: 'advance' | 'command',
): void {
  if (next.clock.tick < previous.clock.tick)
    fail(t, next, 'tick-regression', `tick moved ${previous.clock.tick} -> ${next.clock.tick}`);
  if (kind === 'command' && next.clock.tick !== previous.clock.tick)
    fail(t, next, 'command-advanced-time', `${previous.clock.tick} -> ${next.clock.tick}`);
  if (kind === 'advance' && next.clock.tick !== previous.clock.tick + 1)
    fail(t, next, 'advance-step-size', `${previous.clock.tick} -> ${next.clock.tick}`);
  if (previous.status === 'running' && next.status === 'decision' && next.activeEvent) {
    const previousDecisionTick = t.decisionTicks.at(-1);
    if (previousDecisionTick !== undefined) {
      const spacing = next.clock.tick - previousDecisionTick;
      const minimumSpacing = Math.ceil(next.config.ticksPerDay * 0.75);
      if (next.config.mode === 'production' && spacing < minimumSpacing)
        fail(
          t,
          next,
          'decision-spacing',
          `${spacing} < production minimum ${minimumSpacing} ticks`,
        );
    }
    t.decisionTicks.push(next.clock.tick);
  }
  if (
    (previous.status === 'decision' || previous.status === 'event-result') &&
    next.clock.tick !== previous.clock.tick
  )
    fail(t, next, 'paused-time-advanced', `${previous.status} at ${previous.clock.tick}`);
}
function trackedCommand(state: GameState, command: GameCommand, t: Tracker): GameState {
  const result = applyCommand(state, command);
  t.trace.push(commandTrace(state, command, result.accepted, result.reason));
  transition(state, result.state, t, 'command');
  if (!result.accepted) return result.state;
  if (command.type === 'set-camp-priority') {
    t.priorityUsage[command.priority] += 1;
    inc(t.frequencies.priorities, command.priority);
  }
  if (command.type === 'select-event-choice') {
    const event = EVENT_BY_ID[command.eventId];
    const choice = event.choices.find((c) => c.id === command.choiceId)!;
    inc(t.frequencies.choices, `${command.eventId}/${command.choiceId}`);
    inc(
      event.category === 'follow-up' ? t.frequencies.followUps : t.frequencies.rootEvents,
      command.eventId,
    );
    for (const effect of choice.immediateEffects) {
      const value = loss(effect);
      if (value.damage) inc(t.frequencies.damageByEvent, command.eventId, value.damage);
      if (value.resources) inc(t.frequencies.resourceLossByEvent, command.eventId, value.resources);
    }
  }
  invariants(result.state, t, false);
  return result.state;
}
function deathCauses(state: GameState, id: string): string[] {
  const s = state.survivors.find((item) => item.id === id)!;
  const causes: string[] = [];
  if (s.needs.thirst >= TUNING.critical.thirst) causes.push('thirst');
  if (s.needs.hunger >= TUNING.critical.hunger) causes.push('hunger');
  if (s.needs.energy <= TUNING.critical.energy) causes.push('exhaustion');
  return causes.length ? causes : ['health-loss'];
}
function trackedAdvance(state: GameState, t: Tracker): GameState {
  const due = state.scheduledEffects.filter((effect) => effect.dueTick === state.clock.tick + 1);
  const next = advanceStep(state);
  transition(state, next, t, 'advance');
  for (const effect of due) {
    inc(t.frequencies.automaticEffects, `${effect.sourceEventId}/${effect.sourceChoiceId}`);
    const value = loss(effect.effect);
    if (value.damage) inc(t.frequencies.damageByEvent, effect.sourceEventId, value.damage);
    if (value.resources)
      inc(t.frequencies.resourceLossByEvent, effect.sourceEventId, value.resources);
  }
  for (const before of state.survivors) {
    const after = next.survivors.find((s) => s.id === before.id)!;
    if (before.alive && !after.alive)
      t.deaths.push({
        survivorId: before.id,
        day: next.clock.day,
        tick: next.clock.tick,
        causes: deathCauses(state, before.id),
      });
  }
  invariants(next, t, true);
  return next;
}
function withoutEvent<T>(excluded: ProductionEventId | null, callback: () => T): T {
  if (!excluded) return callback();
  const registry = PRODUCTION_EVENT_DEFINITIONS as unknown as Array<
    (typeof PRODUCTION_EVENT_DEFINITIONS)[number]
  >;
  const index = registry.findIndex((event) => event.id === excluded);
  if (index < 0) throw new Error(`unknown excluded event ID: ${excluded}`);
  const [removed] = registry.splice(index, 1);
  try {
    return callback();
  } finally {
    registry.splice(index, 0, removed!);
  }
}
function removeFollowUp(state: GameState, excluded: ProductionEventId | null): void {
  if (excluded && state.eventSchedule.pendingFollowUps)
    state.eventSchedule.pendingFollowUps = state.eventSchedule.pendingFollowUps.filter(
      (follow) => follow.eventId !== excluded,
    );
}
function runOnce(
  seed: string,
  gameMode: GameMode,
  policyId: PolicyId,
  excluded: ProductionEventId | null,
): Result {
  return withoutEvent(excluded, () => {
    let state =
      gameMode === 'slice' ? createGame({ ...SLICE_GAME_CONFIG, seed }) : createGame({ seed });
    const p = createPolicy(policyId, seed);
    const t = tracker(state);
    invariants(state, t, false);
    t.initialFailures = [...t.failures];
    let actions = 0;
    const maximum = state.config.rescueTick + 100;
    while (!['victory', 'defeat'].includes(state.status) && actions < maximum) {
      removeFollowUp(state, excluded);
      if (state.status === 'running') {
        if (gameMode === 'production' && state.campPolicy.lastChangedDay !== state.clock.day) {
          const priority = p.chooseCampPriority(state);
          if (priority && priority !== state.campPolicy.priority) {
            state = trackedCommand(state, { type: 'set-camp-priority', priority }, t);
            actions += 1;
          }
        }
        if (state.status === 'running') {
          state = trackedAdvance(state, t);
          actions += 1;
        }
        continue;
      }
      if (state.status === 'decision' && state.activeEvent) {
        const eventId = state.activeEvent.id;
        const choiceId =
          gameMode === 'slice' ? EVENT_BY_ID[eventId].choices[0]!.id : p.chooseEventChoice(state);
        state = trackedCommand(state, { type: 'select-event-choice', eventId, choiceId }, t);
        actions += 1;
        if (state.status === 'event-result') {
          state = trackedCommand(state, { type: 'acknowledge-event-result', eventId }, t);
          actions += 1;
        }
        continue;
      }
      if (state.status === 'event-result' && state.activeEvent) {
        state = trackedCommand(
          state,
          { type: 'acknowledge-event-result', eventId: state.activeEvent.id },
          t,
        );
        actions += 1;
        continue;
      }
      fail(t, state, 'simulation-stuck', state.status);
      break;
    }
    if (!['victory', 'defeat'].includes(state.status))
      fail(t, state, 'guard-exceeded', `${actions}`);
    if (state.clock.tick > state.config.rescueTick)
      fail(t, state, 'terminal-after-rescue', `${state.clock.tick} > ${state.config.rescueTick}`);
    invariants(state, t, false);
    for (const [reason, count] of Object.entries(state.metrics.taskReasonCounts))
      inc(t.frequencies.taskReasons, reason, count ?? 0);
    const gaps = t.decisionTicks.slice(1).map((tick, index) => tick - t.decisionTicks[index]!);
    const snapshot = createSnapshot(state);
    const ending =
      state.status === 'victory' || state.status === 'defeat'
        ? deriveEndingSummary(state).quality
        : null;
    return {
      seed,
      gameSeed: seed,
      policy:
        gameMode === 'slice'
          ? 'm1-slice-first-choice'
          : p.id === 'conservative'
            ? 'm3-conservative'
            : p.id,
      policyId: gameMode === 'slice' ? 'slice-first-choice' : p.id,
      version: gameMode === 'slice' ? 'm1' : p.id === 'conservative' ? 'm3' : p.version,
      policyVersion: gameMode === 'slice' ? 'm1' : p.version,
      policySeed: p.policySeed,
      excludedEventId: excluded,
      mode: gameMode,
      status: snapshot.status,
      tick: snapshot.clock.tick,
      day: snapshot.clock.day,
      survivorCount: snapshot.survivors.length,
      aliveCount: snapshot.survivors.filter((s) => s.alive).length,
      eventCount: snapshot.metrics.interactiveEventCount,
      minDecisionSpacingTicks: gaps.length ? Math.min(...gaps) : null,
      maxDecisionGapTicks: snapshot.metrics.maxDecisionGapTicks,
      decisionCompliance:
        gameMode === 'slice' ||
        (snapshot.metrics.interactiveEventCount >= 8 &&
          snapshot.metrics.interactiveEventCount <= 10),
      gapCompliance:
        gameMode === 'slice' ||
        snapshot.metrics.maxDecisionGapTicks <=
          TUNING.productionEventDeadlineDays * state.config.ticksPerDay,
      taskReasonCounts: { ...snapshot.metrics.taskReasonCounts },
      priorityUsage: { ...t.priorityUsage },
      frequencies: t.frequencies,
      deaths: t.deaths,
      maxTasklessRunningSteps: t.maxTaskless,
      endingQuality: ending,
      minResources: { ...t.minResources },
      minSources: { ...t.minSources },
      initialInvariantFailures: t.initialFailures,
      invariantFailures: t.failures,
      serializedStateBytes: Buffer.byteLength(JSON.stringify(snapshot)),
      commandTrace: t.trace,
    };
  });
}
function merge(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) inc(target, key, value);
}
function aggregate(results: readonly Result[]) {
  const victories = results.filter((r) => r.status === 'victory');
  const all = victories.filter((r) => r.aliveCount === r.survivorCount);
  const frequencies = emptyFrequencies();
  for (const result of results)
    for (const key of Object.keys(frequencies) as (keyof Frequencies)[])
      merge(frequencies[key], result.frequencies[key]);
  return {
    runs: results.length,
    victories: victories.length,
    victoryRate: victories.length / results.length,
    rescueRate: victories.length / results.length,
    allSurvivorVictories: all.length,
    allSurvivorRate: all.length / results.length,
    defeats: results.filter((r) => r.status === 'defeat').length,
    invariantFailures: results.filter((r) => r.invariantFailures.length).length,
    invariantFailureCount: results.reduce((sum, r) => sum + r.invariantFailures.length, 0),
    initialInvariantFailures: results.filter((r) => r.initialInvariantFailures.length).length,
    decisionCompliantRuns: results.filter((r) => r.decisionCompliance).length,
    gapCompliantRuns: results.filter((r) => r.gapCompliance).length,
    endingDistribution: Object.fromEntries(
      ['triumphant-rescue', 'costly-rescue', 'barely-alive', 'lost-expedition'].map((quality) => [
        quality,
        results.filter((r) => r.endingQuality === quality).length,
      ]),
    ),
    deaths: results.flatMap((r) => r.deaths.map((death) => ({ gameSeed: r.gameSeed, ...death }))),
    minima: {
      resources: Object.fromEntries(
        RESOURCES.map((id) => [id, Math.min(...results.map((r) => r.minResources[id]))]),
      ),
      sources: Object.fromEntries(
        SOURCES.map((id) => [id, Math.min(...results.map((r) => r.minSources[id]))]),
      ),
    },
    frequencies,
  };
}
function scenario(
  seeds: readonly string[],
  gameMode: GameMode,
  policyId: PolicyId,
  excludedEventId: ProductionEventId | null,
) {
  const results = seeds.map((seed) => runOnce(seed, gameMode, policyId, excludedEventId));
  return {
    policyId,
    policyVersion: createPolicy(policyId, seeds[0] ?? 'probe').version,
    excludedEventId,
    summary: aggregate(results),
    failureRuns: results.filter((r) => r.status === 'defeat' || r.invariantFailures.length),
    results,
  };
}
function main(): void {
  try {
    validateArguments();
    const gameMode = mode();
    const batchMode = batch();
    const runs = integer('--runs', DEFAULT_RUNS, 10_000);
    const seedPrefix = arg('--seed') ?? DEFAULT_SEED;
    if (!seedPrefix.trim()) throw new Error('--seed must not be empty');
    if (batchMode === 'release' && arg('--seed') !== undefined)
      throw new Error(
        '--seed cannot be combined with --batch=release; the checked-in manifest is fixed',
      );
    if (batchMode === 'release' && arg('--runs') !== undefined && runs !== 10_000)
      throw new Error('--batch=release always uses exactly 10000 manifest seeds');
    if (batchMode === 'sensitivity' && arg('--seed') !== undefined)
      throw new Error(
        '--seed cannot be combined with --batch=sensitivity; sensitivity uses the retained manifest',
      );
    if (gameMode === 'slice' && batchMode !== 'single')
      throw new Error('slice mode only supports --batch=single');
    const rawExcluded = arg('--exclude-event');
    if (rawExcluded && !EVENT_IDS.includes(rawExcluded as ProductionEventId))
      throw new Error(`--exclude-event must be one of ${EVENT_IDS.join(', ')}`);
    if (rawExcluded && batchMode === 'sensitivity')
      throw new Error('--exclude-event cannot be combined with --batch=sensitivity');
    const retainedManifest =
      batchMode === 'release' || batchMode === 'sensitivity' ? loadReleaseManifest() : null;
    const manifestBatch = retainedManifest
      ? {
          definition: retainedManifest.definition,
          seeds:
            batchMode === 'sensitivity' && arg('--runs') !== undefined
              ? retainedManifest.seeds.slice(0, runs)
              : retainedManifest.seeds,
        }
      : {
          definition: null,
          seeds: Array.from({ length: runs }, (_, i) =>
            runs === 1 ? seedPrefix : `${seedPrefix}-${i + 1}`,
          ),
        };
    const policies = batchMode === 'matrix' || batchMode === 'release' ? POLICY_IDS : [policy()];
    const excludedIds: (ProductionEventId | null)[] =
      batchMode === 'sensitivity'
        ? [null, ...EVENT_IDS]
        : [(rawExcluded as ProductionEventId | undefined) ?? null];
    const scenarios = policies.flatMap((id) =>
      excludedIds.map((excluded) => scenario(manifestBatch.seeds, gameMode, id, excluded)),
    );
    const restoredEventIds = PRODUCTION_EVENT_DEFINITIONS.map((event) => event.id);
    if (
      restoredEventIds.length !== EVENT_IDS.length ||
      restoredEventIds.some((id, index) => id !== EVENT_IDS[index])
    )
      throw new Error('sensitivity registry restoration failed');
    const aggregateOnly = batchMode !== 'single';
    const baseline = scenarios.find((item) => item.excludedEventId === null);
    const report = {
      policy:
        scenarios.length === 1
          ? gameMode === 'slice'
            ? 'm1-slice-first-choice'
            : scenarios[0]!.policyId === 'conservative'
              ? 'm3-conservative'
              : scenarios[0]!.policyId
          : 'multiple',
      version:
        scenarios.length === 1
          ? gameMode === 'slice'
            ? 'm1'
            : scenarios[0]!.policyId === 'conservative'
              ? 'm3'
              : scenarios[0]!.policyVersion
          : 'matrix-v1',
      mode: gameMode,
      batch: batchMode,
      runs: manifestBatch.seeds.length,
      seedPrefix: manifestBatch.definition?.prefix ?? seedPrefix,
      manifest: manifestBatch.definition,
      manifestSelection: manifestBatch.definition
        ? {
            selectedCount: manifestBatch.seeds.length,
            firstSeed: manifestBatch.seeds[0],
            lastSeed: manifestBatch.seeds.at(-1),
          }
        : null,
      registryRestored: true,
      excludedEventIds: excludedIds.filter((id): id is ProductionEventId => id !== null),
      invariantThresholds: {
        maxTasklessRunningSteps: MAX_TASKLESS_RUNNING_STEPS,
        maxDecisionGapTicks: TUNING.productionEventDeadlineDays * 600,
      },
      summary: scenarios.length === 1 ? scenarios[0]!.summary : undefined,
      sensitivity:
        batchMode === 'sensitivity'
          ? scenarios
              .filter((item) => item.excludedEventId)
              .map((item) => ({
                excludedEventId: item.excludedEventId,
                rescueRate: item.summary.rescueRate,
                rescueRateDelta: item.summary.rescueRate - baseline!.summary.rescueRate,
              }))
          : undefined,
      scenarios: scenarios.map((item) => ({
        policyId: item.policyId,
        policyVersion: item.policyVersion,
        excludedEventId: item.excludedEventId,
        summary: item.summary,
        failureRuns: item.failureRuns,
        ...(aggregateOnly ? {} : { results: item.results }),
      })),
      results: scenarios.length === 1 && !aggregateOnly ? scenarios[0]!.results : undefined,
    };
    console.log(JSON.stringify(report, null, 2));
    process.stderr.write(
      `simulate: ${batchMode} ${manifestBatch.seeds.length} seed(s), ${scenarios.length} scenario(s), ` +
        `${scenarios.reduce((total, item) => total + item.summary.defeats, 0)} defeat(s), ` +
        `${scenarios.reduce((total, item) => total + item.summary.invariantFailures, 0)} invariant-failure run(s)\n`,
    );
    if (scenarios.some((item) => item.summary.invariantFailures > 0)) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    process.exitCode = 1;
  }
}
main();
