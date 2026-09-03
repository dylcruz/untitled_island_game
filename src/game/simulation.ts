import { createIslandState, waypointPosition } from './island';
import { EVENT_BY_ID, eventRegistryForMode, PRODUCTION_EVENT_DEFINITIONS } from './events';
import { cloneRandomStreamStates, createRandomStreamStates, DeterministicRandom } from './random';
import { generateTraitPair, moraleLossMultiplier, productivityMultiplier } from './traits';
import { DEFAULT_GAME_CONFIG, SLICE_GAME_CONFIG, TUNING, validateGameConfig } from './tuning';
import type {
  CampPriority,
  CommandResult,
  DerivedTime,
  EffectData,
  EventDefinition,
  EventId,
  GameCommand,
  GameConfig,
  GameConfigInput,
  GameSnapshot,
  GameState,
  ResourceId,
  RunPhase,
  SourceId,
  SurvivorState,
  TaskKind,
  TaskReasonCode,
  WaypointId,
} from './types';

const SURVIVOR_NAMES = ['Mara', 'Jonah', 'Tess', 'Inez', 'Koa', 'Samira'] as const;
const SURVIVOR_COLORS = ['#ef8f70', '#6fc9bc', '#f3c969', '#8ca9e8', '#d889cc', '#9ecb6b'] as const;
const STARTING_WAYPOINTS: readonly WaypointId[] = ['camp', 'water', 'forage'];
const clamp = (value: number, minimum = 0, maximum = 100): number =>
  Math.min(maximum, Math.max(minimum, value));

export function deriveRunPhase(day: number): RunPhase {
  return day <= 4 ? 'early' : day <= 10 ? 'middle' : 'late';
}
export function deriveTime(state: Pick<GameState, 'clock' | 'config'>): DerivedTime {
  const tickInDay = state.clock.tick % state.config.ticksPerDay;
  const ratio = tickInDay / state.config.ticksPerDay;
  const phase =
    tickInDay === 0 ? 'dawn' : ratio < 0.75 ? 'daylight' : ratio < 0.8 ? 'dusk' : 'night';
  return {
    day: state.clock.day,
    tickInDay,
    phase,
    runPhase: deriveRunPhase(state.clock.day),
    isDaylight: phase === 'dawn' || phase === 'daylight',
    isDawn: phase === 'dawn',
    rescueTicksRemaining: Math.max(0, state.config.rescueTick - state.clock.tick),
  };
}

function resolveConfig(input: GameConfig | GameConfigInput | string | undefined): GameConfig {
  if (typeof input === 'string') return validateGameConfig({ ...DEFAULT_GAME_CONFIG, seed: input });
  return validateGameConfig({
    ...(input?.mode === 'slice' ? SLICE_GAME_CONFIG : DEFAULT_GAME_CONFIG),
    ...input,
  });
}

function copyState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config },
    clock: { ...state.clock },
    resources: { ...state.resources },
    shelter: { ...state.shelter },
    island: {
      cosmeticVariant: state.island.cosmeticVariant,
      sourceStates: Object.fromEntries(
        Object.entries(state.island.sourceStates).map(([id, source]) => [id, { ...source }]),
      ) as GameState['island']['sourceStates'],
    },
    survivors: state.survivors.map((survivor) => ({
      ...survivor,
      traits: [...survivor.traits],
      injury: survivor.injury ? { ...survivor.injury } : null,
      position: { ...survivor.position },
      previousPosition: { ...survivor.previousPosition },
      needs: { ...survivor.needs },
      activeTask: survivor.activeTask
        ? {
            ...survivor.activeTask,
            reason: {
              ...survivor.activeTask.reason,
              params: { ...survivor.activeTask.reason.params },
            },
          }
        : null,
    })),
    reservations: state.reservations.map((value) => ({ ...value })),
    activeEvent: state.activeEvent
      ? {
          ...state.activeEvent,
          participantIds: [...(state.activeEvent.participantIds ?? [])],
          referencedChoice: state.activeEvent.referencedChoice
            ? { ...state.activeEvent.referencedChoice }
            : undefined,
        }
      : null,
    scheduledEffects: state.scheduledEffects.map((value) => ({
      ...value,
      participantIds: value.participantIds ? [...value.participantIds] : undefined,
      effect: { ...value.effect },
    })),
    eventSchedule: {
      ...state.eventSchedule,
      usedEventIds: [...state.eventSchedule.usedEventIds],
      pendingFollowUps: (state.eventSchedule.pendingFollowUps ?? []).map((value) => ({ ...value })),
    },
    choiceRecords: state.choiceRecords.map((value) => ({
      ...value,
      participantIds: [...value.participantIds],
    })),
    turningPoints: state.turningPoints.map((value) => ({
      ...value,
      survivorIds: [...value.survivorIds],
    })),
    metrics: { ...state.metrics, taskReasonCounts: { ...state.metrics.taskReasonCounts } },
    history: state.history.map((value) => ({ ...value })),
    campPolicy: { ...state.campPolicy },
    rngStates: cloneRandomStreamStates(state.rngStates),
  };
}

function addHistory(
  state: GameState,
  kind: GameState['history'][number]['kind'],
  message: string,
): void {
  state.sequence += 1;
  state.history.push({ id: `history-${state.sequence}`, tick: state.clock.tick, kind, message });
  if (state.history.length > 80) state.history.splice(0, state.history.length - 80);
}
function addTurningPoint(
  state: GameState,
  survivorIds: string[],
  kind: GameState['turningPoints'][number]['kind'],
  description: string,
  sourceEventId?: EventId,
): void {
  state.sequence += 1;
  state.turningPoints.push({
    id: `turning-${state.sequence}`,
    tick: state.clock.tick,
    survivorIds,
    kind,
    description,
    sourceEventId,
  });
}

function createSurvivor(
  index: number,
  random: DeterministicRandom,
  usedNames: Set<string>,
): SurvivorState {
  const draw = SURVIVOR_NAMES[random.integer(0, SURVIVOR_NAMES.length - 1)]!;
  const name = usedNames.has(draw)
    ? (SURVIVOR_NAMES.find((value) => !usedNames.has(value)) ?? draw)
    : draw;
  usedNames.add(name);
  const currentWaypoint = STARTING_WAYPOINTS[index] ?? 'camp';
  const position = waypointPosition(currentWaypoint);
  return {
    id: `survivor-${index + 1}`,
    name,
    color: SURVIVOR_COLORS[index] ?? SURVIVOR_COLORS[0],
    visualVariant: random.integer(0, 5),
    traits: generateTraitPair(random),
    morale: TUNING.morale.starting,
    injury: null,
    alive: true,
    position,
    previousPosition: { ...position },
    currentWaypoint,
    targetWaypoint: currentWaypoint,
    progressTicks: 0,
    routeIndex: index,
    needs: { health: 100, hunger: 14 + index * 2, thirst: 12 + index * 2, energy: 82 - index * 3 },
    activeTask: null,
  };
}

function sourceForTask(
  kind: TaskKind,
  materialSource: 'wreckage' | 'forest' = 'wreckage',
): { sourceId: SourceId; resourceId: ResourceId; destination: WaypointId; yield: number } | null {
  if (kind === 'gather-water')
    return {
      sourceId: 'water',
      resourceId: 'water',
      destination: 'water',
      yield: TUNING.taskYields.water,
    };
  if (kind === 'gather-food')
    return {
      sourceId: 'forage',
      resourceId: 'food',
      destination: 'forage',
      yield: TUNING.taskYields.forage,
    };
  if (kind === 'gather-materials')
    return {
      sourceId: materialSource,
      resourceId: 'materials',
      destination: materialSource,
      yield: materialSource === 'forest' ? TUNING.taskYields.forest : TUNING.taskYields.wreckage,
    };
  return null;
}
function releaseTask(state: GameState, survivor: SurvivorState): void {
  if (survivor.activeTask?.reservationId)
    state.reservations = state.reservations.filter(
      (value) => value.id !== survivor.activeTask?.reservationId,
    );
  survivor.activeTask = null;
}
function reservedMaterials(state: GameState): number {
  return state.reservations
    .filter((value) => value.kind === 'materials')
    .reduce((sum, value) => sum + (value.reservedAmount ?? 0), 0);
}
function availableUnreserved(state: GameState, sourceId: SourceId): number {
  return Math.max(
    0,
    state.island.sourceStates[sourceId].available -
      state.reservations
        .filter((value) => value.kind !== 'materials' && value.sourceId === sourceId)
        .reduce((sum, value) => sum + value.expectedYield, 0),
  );
}

function workTicksFor(survivor: SurvivorState, kind: TaskKind): number {
  const base =
    kind === 'drink'
      ? TUNING.taskWorkTicks.drink
      : kind === 'eat'
        ? TUNING.taskWorkTicks.eat
        : kind === 'rest'
          ? TUNING.taskWorkTicks.rest
          : kind === 'sleep'
            ? TUNING.taskWorkTicks.sleep
            : TUNING.taskWorkTicks.gather;
  let multiplier = survivor.injury?.productivityModifier ?? 1;
  if (kind === 'gather-food') multiplier *= productivityMultiplier(survivor.traits, 'food');
  if (kind === 'gather-materials' || kind === 'repair-shelter')
    multiplier *= productivityMultiplier(survivor.traits, 'materials');
  return Math.max(1, Math.ceil(base / multiplier));
}

function beginTask(
  state: GameState,
  survivor: SurvivorState,
  kind: TaskKind,
  destination: WaypointId,
  reasonCode: TaskReasonCode,
): boolean {
  let reservationId: string | null = null;
  let taskId = '';
  const materialSource =
    kind === 'gather-materials' && availableUnreserved(state, 'wreckage') <= 0
      ? 'forest'
      : 'wreckage';
  const source = sourceForTask(kind, materialSource);
  const taskDestination = source?.destination ?? destination;
  if (source) {
    const incoming = state.reservations
      .filter(
        (value) =>
          value.kind !== 'materials' &&
          sourceForTask(kind, value.sourceId === 'forest' ? 'forest' : 'wreckage')?.resourceId ===
            source.resourceId,
      )
      .reduce((sum, value) => sum + value.expectedYield, 0);
    const expectedYield = Math.min(
      source.yield,
      availableUnreserved(state, source.sourceId),
      Math.max(
        0,
        TUNING.resourceCaps[source.resourceId] - state.resources[source.resourceId] - incoming,
      ),
    );
    if (expectedYield <= 0) return false;
    state.sequence += 1;
    reservationId = `reservation-${state.sequence}`;
    taskId = `task-${state.sequence}`;
    state.reservations.push({
      id: reservationId,
      taskId,
      survivorId: survivor.id,
      sourceId: source.sourceId,
      expectedYield,
      kind: 'source',
    });
  } else if (kind === 'repair-shelter') {
    const cost = survivor.traits.includes('resourceful') ? 1 : TUNING.shelter.repairMaterials;
    if (
      state.resources.materials - reservedMaterials(state) < cost ||
      state.shelter.condition >= state.shelter.maximumCondition
    )
      return false;
    state.sequence += 1;
    reservationId = `reservation-${state.sequence}`;
    taskId = `task-${state.sequence}`;
    state.reservations.push({
      id: reservationId,
      taskId,
      survivorId: survivor.id,
      sourceId: 'forest',
      expectedYield: 0,
      kind: 'materials',
      resourceId: 'materials',
      reservedAmount: cost,
    });
  }
  if (!taskId) {
    state.sequence += 1;
    taskId = `task-${state.sequence}`;
  }
  const workTicks = workTicksFor(survivor, kind);
  survivor.activeTask = {
    id: taskId,
    kind,
    destination: taskDestination,
    phase: survivor.currentWaypoint === taskDestination ? 'work' : 'travel',
    remainingTicks: workTicks,
    workTicks,
    reservationId,
    reason: {
      code: reasonCode,
      params: {
        destination: taskDestination,
        selectedAtTick: state.clock.tick,
        priority: state.campPolicy.priority,
      },
    },
  };
  survivor.targetWaypoint = taskDestination;
  survivor.progressTicks = 0;
  state.metrics.taskReasonCounts[reasonCode] =
    (state.metrics.taskReasonCounts[reasonCode] ?? 0) + 1;
  addHistory(state, 'task', `${survivor.name} begins ${kind} (${reasonCode}).`);
  return true;
}

function hardConstraintTask(
  state: GameState,
  survivor: SurvivorState,
): [TaskKind, TaskReasonCode] | null {
  if (survivor.needs.thirst >= TUNING.critical.thirst && state.resources.water > 0)
    return ['drink', 'critical-thirst'];
  if (survivor.needs.hunger >= TUNING.critical.hunger && state.resources.food > 0)
    return ['eat', 'critical-hunger'];
  if (survivor.needs.health <= 30) return ['rest', 'critical-health'];
  if (survivor.needs.energy <= TUNING.critical.energy) return ['rest', 'low-energy'];
  if (deriveTime(state).phase === 'night') return ['sleep', 'night-sleep'];
  return null;
}

function interruptForHardConstraint(state: GameState, survivor: SurvivorState): void {
  const task = survivor.activeTask;
  const hard = hardConstraintTask(state, survivor);
  if (!task || !hard || task.kind === hard[0]) return;
  if (
    task.kind === 'sleep' ||
    ['gather-water', 'gather-food', 'gather-materials', 'repair-shelter', 'rest'].includes(
      task.kind,
    )
  ) {
    addHistory(state, 'task', `${survivor.name}'s ${task.kind} task was interrupted.`);
    releaseTask(state, survivor);
  }
}

function taskScores(
  state: GameState,
  survivor: SurvivorState,
): { kind: TaskKind; reason: TaskReasonCode; score: number }[] {
  const living = state.survivors.filter((value) => value.alive).length;
  const incoming = (resource: ResourceId) =>
    state.reservations
      .filter((value) => value.kind !== 'materials')
      .reduce((sum, value) => {
        const task = state.survivors.find((entry) => entry.id === value.survivorId)?.activeTask;
        return (
          sum +
          (task &&
          sourceForTask(task.kind, value.sourceId === 'forest' ? 'forest' : 'wreckage')
            ?.resourceId === resource
            ? value.expectedYield
            : 0)
        );
      }, 0);
  const policy = TUNING.planner.policyScores[state.campPolicy.priority];
  const scores: { kind: TaskKind; reason: TaskReasonCode; score: number }[] = [
    {
      kind: 'gather-water',
      reason: 'stock-water',
      score:
        (living * TUNING.planner.targetStockPerSurvivor.water -
          state.resources.water -
          incoming('water')) *
          3 +
        policy.water,
    },
    {
      kind: 'gather-food',
      reason: 'stock-food',
      score:
        (living * TUNING.planner.targetStockPerSurvivor.food -
          state.resources.food -
          incoming('food')) *
          3 +
        policy.food,
    },
    {
      kind: 'gather-materials',
      reason: 'stock-materials',
      score: (6 - state.resources.materials - incoming('materials')) * 2 + policy.materials,
    },
    {
      kind: 'repair-shelter',
      reason: 'repair-shelter',
      score: (TUNING.shelter.repairThreshold - state.shelter.condition) * 0.6 + policy.repair,
    },
    {
      kind: 'rest',
      reason: state.campPolicy.priority === 'recover' ? 'recover-policy' : 'low-energy',
      score: (65 - survivor.needs.energy) * 0.3 + policy.rest,
    },
  ];
  return scores.sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind));
}

function planIdleGroup(state: GameState): void {
  const living = state.survivors.filter((survivor) => survivor.alive);
  if (!living.length) return;
  const ordered = [
    ...living.slice(state.plannerRotation % living.length),
    ...living.slice(0, state.plannerRotation % living.length),
  ];
  let assigned = false;
  for (const survivor of ordered) {
    if (survivor.activeTask) continue;
    const hard = hardConstraintTask(state, survivor);
    if (hard && beginTask(state, survivor, hard[0], 'camp', hard[1])) {
      assigned = true;
      continue;
    }
    if (state.config.mode === 'slice') {
      const legacy = [
        ['gather-water', 'water', 'stock-water'],
        ['gather-food', 'forage', 'stock-food'],
        ['gather-materials', 'wreckage', 'stock-materials'],
      ] as const;
      if (
        legacy.some(([kind, destination, reason]) =>
          beginTask(state, survivor, kind, destination, reason),
        )
      ) {
        assigned = true;
        continue;
      }
    }
    for (const candidate of taskScores(state, survivor)) {
      const destination: WaypointId =
        candidate.kind === 'gather-water'
          ? 'water'
          : candidate.kind === 'gather-food'
            ? 'forage'
            : candidate.kind === 'gather-materials'
              ? 'wreckage'
              : 'camp';
      if (
        candidate.score > -10 &&
        beginTask(state, survivor, candidate.kind, destination, candidate.reason)
      ) {
        assigned = true;
        break;
      }
    }
  }
  if (assigned) state.plannerRotation = (state.plannerRotation + 1) % living.length;
}

function completeTask(state: GameState, survivor: SurvivorState): void {
  const task = survivor.activeTask;
  if (!task) return;
  if (task.kind === 'drink' && state.resources.water > 0) {
    state.resources.water = clamp(
      state.resources.water - TUNING.consumption.water,
      0,
      TUNING.resourceCaps.water,
    );
    survivor.needs.thirst = clamp(survivor.needs.thirst - TUNING.recovery.drink);
  } else if (task.kind === 'eat' && state.resources.food > 0) {
    state.resources.food = clamp(
      state.resources.food - TUNING.consumption.food,
      0,
      TUNING.resourceCaps.food,
    );
    survivor.needs.hunger = clamp(survivor.needs.hunger - TUNING.recovery.eat);
  } else if (task.kind === 'rest') {
    survivor.needs.energy = clamp(survivor.needs.energy + TUNING.recovery.rest);
    survivor.needs.health = clamp(survivor.needs.health + 2);
  } else if (task.kind === 'sleep') {
    const protection =
      state.shelter.condition >= TUNING.shelter.poorThreshold
        ? TUNING.shelter.protectedSleepBonus
        : 0;
    survivor.needs.energy = clamp(survivor.needs.energy + TUNING.recovery.sleep + protection);
    survivor.morale = clamp(survivor.morale + protection / 4);
  } else if (task.kind === 'repair-shelter') {
    const reservation = state.reservations.find((value) => value.id === task.reservationId);
    const cost = reservation?.reservedAmount ?? TUNING.shelter.repairMaterials;
    if (state.resources.materials >= cost) {
      state.resources.materials -= cost;
      state.shelter.condition = clamp(
        state.shelter.condition + TUNING.shelter.repairAmount,
        0,
        state.shelter.maximumCondition,
      );
      addTurningPoint(state, [survivor.id], 'shelter', `${survivor.name} repaired the shelter.`);
    }
  } else {
    const reservation = state.reservations.find((value) => value.id === task.reservationId);
    const source = reservation
      ? sourceForTask(task.kind, reservation.sourceId === 'forest' ? 'forest' : 'wreckage')
      : null;
    if (reservation && source) {
      const actual = Math.min(
        reservation.expectedYield,
        state.island.sourceStates[source.sourceId].available,
        TUNING.resourceCaps[source.resourceId] - state.resources[source.resourceId],
      );
      state.island.sourceStates[source.sourceId].available -= actual;
      state.resources[source.resourceId] += actual;
      addHistory(state, 'resource', `${survivor.name} gathered ${actual} ${source.resourceId}.`);
    }
  }
  addHistory(state, 'task', `${survivor.name} completes ${task.kind}.`);
  releaseTask(state, survivor);
}

function advanceTask(state: GameState, survivor: SurvivorState): void {
  const task = survivor.activeTask;
  if (!task) return;
  survivor.previousPosition = { ...survivor.position };
  if (task.phase === 'travel') {
    survivor.progressTicks += 1;
    const from = waypointPosition(survivor.currentWaypoint);
    const to = waypointPosition(task.destination);
    const travelModifier =
      productivityMultiplier(survivor.traits, 'travel') *
      (survivor.injury?.productivityModifier ?? 1);
    const fraction = Math.min(
      1,
      (survivor.progressTicks * travelModifier) / state.config.movementTicks,
    );
    survivor.position = {
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
    };
    if (fraction >= 1) {
      survivor.currentWaypoint = task.destination;
      survivor.targetWaypoint = task.destination;
      survivor.progressTicks = 0;
      survivor.routeIndex += 1;
      task.phase = 'work';
    }
    return;
  }
  task.remainingTicks -= 1;
  if (task.remainingTicks <= 0) completeTask(state, survivor);
}

function invalidateReservations(state: GameState): void {
  for (const sourceId of ['water', 'forage', 'wreckage', 'forest'] as const) {
    let claimed = 0;
    for (const reservation of state.reservations.filter(
      (value) => value.kind !== 'materials' && value.sourceId === sourceId,
    )) {
      claimed += reservation.expectedYield;
      if (claimed <= state.island.sourceStates[sourceId].available) continue;
      const survivor = state.survivors.find(
        (value) => value.activeTask?.reservationId === reservation.id,
      );
      if (survivor) releaseTask(state, survivor);
      else state.reservations = state.reservations.filter((value) => value.id !== reservation.id);
    }
  }
  for (const reservation of state.reservations.filter((value) => value.kind === 'materials'))
    if ((reservation.reservedAmount ?? 0) > state.resources.materials) {
      const survivor = state.survivors.find(
        (value) => value.activeTask?.reservationId === reservation.id,
      );
      if (survivor) releaseTask(state, survivor);
    }
}

function targetsForEffect(
  state: GameState,
  effect: EffectData,
  participantIds: readonly string[],
): SurvivorState[] {
  const living = state.survivors.filter((value) => value.alive);
  if (effect.targetScope === 'group') return living;
  return participantIds
    .map((id) => state.survivors.find((value) => value.id === id))
    .filter((value): value is SurvivorState => !!value?.alive)
    .slice(0, 1)
    .concat(participantIds.length ? [] : living.slice(0, 1));
}
function applyEffect(
  state: GameState,
  effect: EffectData,
  participantIds: readonly string[] = [],
): void {
  if (effect.kind === 'resource' && effect.target && effect.target in state.resources) {
    const target = effect.target as ResourceId;
    state.resources[target] = clamp(
      state.resources[target] + effect.amount,
      0,
      TUNING.resourceCaps[target],
    );
    invalidateReservations(state);
    return;
  }
  if (effect.kind === 'shelter') {
    state.shelter.condition = clamp(
      state.shelter.condition + effect.amount,
      0,
      state.shelter.maximumCondition,
    );
    return;
  }
  for (const survivor of targetsForEffect(state, effect, participantIds)) {
    if (effect.kind === 'health')
      survivor.needs.health = clamp(survivor.needs.health + effect.amount);
    else if (effect.kind === 'need' && effect.target && effect.target in survivor.needs) {
      const target = effect.target as keyof typeof survivor.needs;
      survivor.needs[target] = clamp(survivor.needs[target] + effect.amount);
    } else if (effect.kind === 'morale') survivor.morale = clamp(survivor.morale + effect.amount);
    else if (effect.kind === 'injury' && effect.amount > 0) {
      const severity = clamp(Math.round(effect.amount), 1, 3) as 1 | 2 | 3;
      survivor.injury = {
        kind: effect.target === 'sprain' || effect.target === 'burn' ? effect.target : 'cut',
        severity,
        recoveryTicksRemaining: TUNING.injury.baseRecoveryTicks * severity,
        productivityModifier: 1 - severity * TUNING.injury.productivityPerSeverity,
      };
      survivor.morale = clamp(survivor.morale - severity * 5);
      addTurningPoint(
        state,
        [survivor.id],
        'injury',
        `${survivor.name} suffered a ${survivor.injury.kind}.`,
      );
    }
  }
}

function participantsFor(state: GameState, event: EventDefinition): string[] | null {
  let candidates = state.survivors.filter(
    (value) => value.alive && value.activeTask?.kind !== 'sleep',
  );
  if (!candidates.length) candidates = state.survivors.filter((value) => value.alive);
  if (event.participantRule === 'forager')
    candidates = candidates.filter((value) => value.traits.includes('forager'));
  if (event.participantRule === 'injured') candidates = candidates.filter((value) => value.injury);
  const count = event.participantRule === 'pair' ? 2 : 1;
  return candidates.length >= count ? candidates.slice(0, count).map((value) => value.id) : null;
}
function eligibleEvent(state: GameState, event: EventDefinition): boolean {
  if (
    event.earliestTick > state.clock.tick ||
    (!event.repeatable && state.eventSchedule.usedEventIds.includes(event.id))
  )
    return false;
  if (event.phases && !event.phases.includes(deriveRunPhase(state.clock.day))) return false;
  if (event.requiresResource && state.resources[event.requiresResource] <= 0) return false;
  if (
    event.requiresPriorChoice &&
    !state.choiceRecords.some(
      (record) =>
        record.eventId === event.requiresPriorChoice!.eventId &&
        (!event.requiresPriorChoice!.choiceId ||
          record.choiceId === event.requiresPriorChoice!.choiceId),
    )
  )
    return false;
  return participantsFor(state, event) !== null;
}

function unusedProductionRoots(state: GameState): readonly EventDefinition[] {
  const productionEvents: readonly EventDefinition[] = PRODUCTION_EVENT_DEFINITIONS;
  return productionEvents.filter(
    (event) =>
      event.category !== 'follow-up' &&
      (event.repeatable || !state.eventSchedule.usedEventIds.includes(event.id)),
  );
}

function hasPotentialFutureEvent(state: GameState): boolean {
  return (
    unusedProductionRoots(state).length > 0 ||
    (state.eventSchedule.pendingFollowUps?.length ?? 0) > 0
  );
}

function nextRelevantPhaseBoundaryTick(state: GameState): number | null {
  const candidates: number[] = [];
  const roots = unusedProductionRoots(state);
  const middleBoundary = state.config.ticksPerDay * 4;
  const lateBoundary = state.config.ticksPerDay * 10;
  if (state.clock.tick < middleBoundary && roots.some((event) => event.phases?.includes('middle')))
    candidates.push(middleBoundary);
  if (state.clock.tick < lateBoundary && roots.some((event) => event.phases?.includes('late')))
    candidates.push(lateBoundary);
  return candidates.length ? Math.min(...candidates) : null;
}

function scheduleProductionRetry(state: GameState): void {
  if (!hasPotentialFutureEvent(state)) {
    state.eventSchedule.nextEventTick = null;
    return;
  }
  const candidates = [
    state.clock.tick + Math.floor(state.config.ticksPerDay / 4),
    nextRelevantPhaseBoundaryTick(state),
    state.metrics.lastDecisionTick === null
      ? null
      : state.metrics.lastDecisionTick +
        TUNING.productionEventDeadlineDays * state.config.ticksPerDay,
    ...(state.eventSchedule.pendingFollowUps ?? []).map((follow) => follow.earliestTick),
    state.config.rescueTick - 1,
  ].filter((tick): tick is number => tick !== null && tick > state.clock.tick);
  state.eventSchedule.nextEventTick = candidates.length ? Math.min(...candidates) : null;
}

function activateEvent(state: GameState): void {
  if (
    state.activeEvent ||
    state.eventSchedule.nextEventTick === null ||
    state.clock.tick < state.eventSchedule.nextEventTick
  )
    return;
  const registry = eventRegistryForMode(state.config.mode);
  let selected: EventDefinition | undefined;
  if (state.config.mode === 'production') {
    const readyFollow = (state.eventSchedule.pendingFollowUps ?? []).find(
      (follow) =>
        follow.earliestTick <= state.clock.tick &&
        eligibleEvent(state, EVENT_BY_ID[follow.eventId]),
    );
    if (readyFollow) {
      selected = EVENT_BY_ID[readyFollow.eventId];
      state.eventSchedule.pendingFollowUps = (state.eventSchedule.pendingFollowUps ?? []).filter(
        (value) => value !== readyFollow,
      );
    }
  }
  const eligible = registry.filter(
    (event) => eligibleEvent(state, event) && event.category !== 'follow-up',
  );
  if (!selected && eligible.length) {
    const random = new DeterministicRandom(state.rngStates.eventSelection);
    selected = random.pickWeighted(eligible.map((value) => ({ value, weight: value.weight ?? 1 })));
    state.rngStates.eventSelection = random.exportState();
  }
  if (!selected) {
    if (state.config.mode === 'production') scheduleProductionRetry(state);
    else state.eventSchedule.nextEventTick = null;
    return;
  }
  const participantIds = participantsFor(state, selected)!;
  const prior = selected.requiresPriorChoice
    ? state.choiceRecords.find(
        (record) =>
          record.eventId === selected!.requiresPriorChoice!.eventId &&
          (!selected!.requiresPriorChoice!.choiceId ||
            record.choiceId === selected!.requiresPriorChoice!.choiceId),
      )
    : undefined;
  state.activeEvent = {
    id: selected.id,
    activatedTick: state.clock.tick,
    participantIds,
    referencedChoice: prior ? { eventId: prior.eventId, choiceId: prior.choiceId } : undefined,
    chosenChoiceId: null,
    result: null,
  };
  state.status = 'decision';
  const previous = state.metrics.lastDecisionTick;
  if (previous !== null)
    state.metrics.maxDecisionGapTicks = Math.max(
      state.metrics.maxDecisionGapTicks,
      state.clock.tick - previous,
    );
  state.metrics.lastDecisionTick = state.clock.tick;
  state.metrics.interactiveEventCount += 1;
  state.eventSchedule.lastDecisionTick = state.clock.tick;
  addHistory(state, 'event', `${selected.title} requires a decision.`);
}

function replenishAtDawn(state: GameState): void {
  for (const [id, amount] of Object.entries(TUNING.dawnReplenishment) as [
    Exclude<SourceId, 'wreckage'>,
    number,
  ][]) {
    const source = state.island.sourceStates[id];
    source.available = Math.min(source.capacity, source.available + amount);
  }
  addHistory(state, 'day', `Day ${state.clock.day} begins; renewable sources replenish.`);
}

export function createGame(configInput?: GameConfig | GameConfigInput | string): GameState {
  const config = resolveConfig(configInput);
  const rngStates = createRandomStreamStates(config.seed);
  const survivorRandom = new DeterministicRandom(rngStates.survivorGeneration);
  const islandRandom = new DeterministicRandom(rngStates.islandCosmetics);
  const usedNames = new Set<string>();
  const state: GameState = {
    seed: config.seed,
    config,
    status: 'running',
    clock: { tick: 0, day: 1 },
    island: createIslandState(islandRandom),
    resources: { ...TUNING.startingResources },
    shelter: { condition: TUNING.shelter.startingCondition, maximumCondition: 100 },
    survivors: Array.from({ length: config.survivorCount }, (_, index) =>
      createSurvivor(index, survivorRandom, usedNames),
    ),
    reservations: [],
    activeEvent: null,
    scheduledEffects: [],
    eventSchedule: {
      nextEventTick:
        config.mode === 'slice'
          ? Math.floor(config.rescueTick * TUNING.eventFirstTickFraction)
          : Math.floor(config.ticksPerDay * TUNING.productionEventFirstDayFraction),
      usedEventIds: [],
      sequence: 0,
      pendingFollowUps: [],
      lastDecisionTick: null,
    },
    choiceRecords: [],
    turningPoints: [],
    metrics: {
      interactiveEventCount: 0,
      lastDecisionTick: null,
      maxDecisionGapTicks: 0,
      taskReasonCounts: {},
    },
    plannerRotation: 0,
    history: [],
    campPolicy: { priority: 'balanced', lastChangedDay: null },
    rngStates,
    sequence: 0,
  };
  state.rngStates.survivorGeneration = survivorRandom.exportState();
  state.rngStates.islandCosmetics = islandRandom.exportState();
  planIdleGroup(state);
  return state;
}

export function advanceStep(state: GameState): GameState {
  if (state.status !== 'running') return state;
  const next = copyState(state);
  next.clock.tick += 1;
  const behaviorRandom = new DeterministicRandom(next.rngStates.behavior);
  behaviorRandom.next();
  next.rngStates.behavior = behaviorRandom.exportState();
  const previousDay = next.clock.day;
  next.clock.day = Math.min(
    Math.floor(next.clock.tick / next.config.ticksPerDay) + 1,
    Math.ceil(next.config.rescueTick / next.config.ticksPerDay),
  );
  if (next.clock.day !== previousDay) {
    next.campPolicy.lastChangedDay = null;
    replenishAtDawn(next);
  }
  const rateScale = 120 / next.config.ticksPerDay;
  next.shelter.condition = clamp(
    next.shelter.condition - TUNING.shelter.decayPerDay / next.config.ticksPerDay,
    0,
    next.shelter.maximumCondition,
  );
  invalidateReservations(next);
  for (const survivor of next.survivors) {
    if (!survivor.alive) continue;
    survivor.needs.hunger = clamp(survivor.needs.hunger + TUNING.needRates.hunger * rateScale);
    survivor.needs.thirst = clamp(survivor.needs.thirst + TUNING.needRates.thirst * rateScale);
    if (survivor.activeTask?.kind !== 'sleep')
      survivor.needs.energy = clamp(
        survivor.needs.energy -
          TUNING.needRates.energy * rateScale * (survivor.traits.includes('tireless') ? 0.75 : 1),
      );
    const moraleLoss =
      (survivor.injury ? TUNING.morale.injuryLoss * survivor.injury.severity : 0) +
      (next.shelter.condition < TUNING.shelter.poorThreshold && deriveTime(next).phase === 'night'
        ? TUNING.morale.dailyLoss / next.config.ticksPerDay
        : 0);
    survivor.morale = clamp(survivor.morale - moraleLoss * moraleLossMultiplier(survivor.traits));
    if (survivor.injury) {
      const recovering =
        survivor.activeTask?.kind === 'sleep'
          ? TUNING.injury.sleepRecoveryMultiplier
          : survivor.currentWaypoint === 'camp' && survivor.activeTask?.kind === 'rest'
            ? 1
            : 0;
      survivor.injury.recoveryTicksRemaining -= recovering;
      if (survivor.injury.recoveryTicksRemaining <= 0) {
        survivor.injury = null;
        survivor.morale = clamp(survivor.morale + 6);
        addTurningPoint(next, [survivor.id], 'recovery', `${survivor.name} recovered from injury.`);
      }
    }
    interruptForHardConstraint(next, survivor);
  }
  planIdleGroup(next);
  for (const survivor of next.survivors) if (survivor.alive) advanceTask(next, survivor);
  const due = next.scheduledEffects.filter((effect) => effect.dueTick <= next.clock.tick);
  next.scheduledEffects = next.scheduledEffects.filter(
    (effect) => effect.dueTick > next.clock.tick,
  );
  for (const effect of due) {
    applyEffect(next, effect.effect, effect.participantIds);
    addHistory(next, 'effect', effect.description);
  }
  for (const survivor of next.survivors) {
    if (!survivor.alive) continue;
    let damage = 0;
    if (survivor.needs.hunger >= TUNING.critical.hunger)
      damage += TUNING.healthDamage.hunger * rateScale;
    if (survivor.needs.thirst >= TUNING.critical.thirst)
      damage += TUNING.healthDamage.thirst * rateScale;
    if (survivor.needs.energy <= TUNING.critical.energy)
      damage += TUNING.healthDamage.exhaustion * rateScale;
    survivor.needs.health = clamp(survivor.needs.health - damage);
    if (survivor.needs.health <= 0) {
      survivor.alive = false;
      releaseTask(next, survivor);
      addHistory(next, 'health', `${survivor.name} has died.`);
      addTurningPoint(next, [survivor.id], 'death', `${survivor.name} died before rescue.`);
    }
  }
  if (next.survivors.every((survivor) => !survivor.alive)) {
    next.status = 'defeat';
    addHistory(next, 'terminal', 'The expedition ends in defeat.');
  } else if (next.clock.tick >= next.config.rescueTick) {
    next.clock.tick = next.config.rescueTick;
    next.status = 'victory';
    addHistory(next, 'terminal', 'Rescue reaches the island.');
  } else activateEvent(next);
  if (next.status === 'running') planIdleGroup(next);
  return next;
}

function selectEventChoice(state: GameState, eventId: EventId, choiceId: string): CommandResult {
  if (state.status !== 'decision' || !state.activeEvent)
    return { state, accepted: false, reason: 'event-not-awaiting-choice' };
  if (state.activeEvent.id !== eventId)
    return { state, accepted: false, reason: 'event-id-mismatch' };
  const choice = EVENT_BY_ID[eventId].choices.find((value) => value.id === choiceId);
  if (!choice) return { state, accepted: false, reason: 'unknown-choice' };
  const resourceCosts: Partial<Record<ResourceId, number>> = {};
  for (const effect of choice.immediateEffects) {
    if (effect.kind !== 'resource' || effect.amount >= 0 || !effect.target) continue;
    const resourceId = effect.target as ResourceId;
    if (!(resourceId in state.resources)) continue;
    resourceCosts[resourceId] = (resourceCosts[resourceId] ?? 0) - effect.amount;
  }
  if (
    (Object.entries(resourceCosts) as [ResourceId, number][]).some(
      ([resourceId, cost]) => state.resources[resourceId] < cost,
    )
  )
    return { state, accepted: false, reason: 'insufficient-resources' };
  const next = copyState(state);
  const participantIds = next.activeEvent?.participantIds ?? [];
  for (const effect of choice.immediateEffects) {
    if (effect.probability !== undefined) {
      const random = new DeterministicRandom(next.rngStates.eventOutcome);
      const succeeds = random.next() < effect.probability;
      next.rngStates.eventOutcome = random.exportState();
      if (!succeeds) continue;
    }
    applyEffect(next, effect, participantIds);
  }
  if (choice.delayedEffect) {
    const dueTick = next.clock.tick + choice.delayedEffect.delayTicks;
    if (dueTick <= next.config.rescueTick) {
      next.eventSchedule.sequence += 1;
      next.scheduledEffects.push({
        id: `effect-${next.eventSchedule.sequence}`,
        dueTick,
        sourceEventId: eventId,
        participantIds: [...participantIds],
        effect: { ...choice.delayedEffect.effect },
        description: choice.delayedEffect.description,
      });
    }
  }
  if (choice.followUpEventId) {
    const earliestTick =
      next.clock.tick + Math.floor(next.config.ticksPerDay * TUNING.productionEventSpacingDays);
    if (earliestTick < next.config.rescueTick)
      (next.eventSchedule.pendingFollowUps ??= []).push({
        eventId: choice.followUpEventId,
        sourceEventId: eventId,
        sourceChoiceId: choice.id,
        earliestTick,
      });
  }
  next.choiceRecords.push({
    eventId,
    choiceId: choice.id,
    tick: next.clock.tick,
    participantIds: [...participantIds],
    result: choice.result,
  });
  addTurningPoint(next, participantIds, 'choice', choice.result, eventId);
  next.activeEvent = { ...next.activeEvent!, chosenChoiceId: choice.id, result: choice.result };
  next.status = 'event-result';
  addHistory(next, 'event', choice.result);
  return { state: next, accepted: true };
}

export function applyCommand(state: GameState, command: GameCommand): CommandResult {
  if (command.type === 'reset-run')
    return {
      state: createGame({ ...state.config, seed: command.seed ?? state.seed }),
      accepted: true,
    };
  if (command.type === 'select-event-choice')
    return selectEventChoice(state, command.eventId, command.choiceId);
  if (command.type === 'acknowledge-event-result') {
    if (state.status !== 'event-result' || !state.activeEvent)
      return { state, accepted: false, reason: 'event-not-showing-result' };
    if (state.activeEvent.id !== command.eventId)
      return { state, accepted: false, reason: 'event-id-mismatch' };
    const next = copyState(state);
    const activeId = next.activeEvent!.id;
    next.eventSchedule.usedEventIds.push(activeId);
    const spacing =
      next.config.mode === 'slice'
        ? Math.floor(next.config.rescueTick * TUNING.eventSpacingFraction)
        : Math.floor(next.config.ticksPerDay * TUNING.productionEventSpacingDays);
    const candidate = next.clock.tick + spacing;
    const hasMore =
      next.config.mode === 'slice'
        ? next.eventSchedule.usedEventIds.length < eventRegistryForMode('slice').length
        : hasPotentialFutureEvent(next);
    next.eventSchedule.nextEventTick =
      hasMore && candidate < next.config.rescueTick ? candidate : null;
    next.activeEvent = null;
    next.status = 'running';
    addHistory(next, 'event', 'The decision is acknowledged; time resumes.');
    return { state: next, accepted: true };
  }
  if (command.type !== 'set-camp-priority')
    return { state, accepted: false, reason: 'unknown-command' };
  if (state.status !== 'running') return { state, accepted: false, reason: 'game-not-running' };
  if (command.priority === state.campPolicy.priority)
    return { state, accepted: false, reason: 'priority-already-selected' };
  if (state.campPolicy.lastChangedDay === state.clock.day)
    return { state, accepted: false, reason: 'daily-change-used' };
  const next = copyState(state);
  next.campPolicy = { priority: command.priority, lastChangedDay: next.clock.day };
  return { state: next, accepted: true };
}

export const applyCommandState = (state: GameState, command: GameCommand): GameState =>
  applyCommand(state, command).state;
export const createSnapshot = (state: GameState): GameSnapshot => copyState(state);
export const cloneGameState = (state: GameState): GameState => copyState(state);
export type { CampPriority };
