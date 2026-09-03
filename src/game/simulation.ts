import { AUTHORED_ROUTES, waypointPosition, createIslandState } from './island';
import { cloneRandomStreamStates, createRandomStreamStates, DeterministicRandom } from './random';
import { DEFAULT_GAME_CONFIG, validateGameConfig } from './tuning';
import type {
  CampPriority,
  CommandResult,
  GameCommand,
  GameConfig,
  GameConfigInput,
  GameSnapshot,
  GameState,
  SurvivorState,
  WaypointId,
} from './types';

const SURVIVOR_NAMES = ['Mara', 'Jonah', 'Tess'] as const;
const SURVIVOR_COLORS = ['#ef8f70', '#6fc9bc', '#f3c969'] as const;
const STARTING_WAYPOINTS: readonly WaypointId[] = ['camp', 'water', 'forage'];

function resolveConfig(input: GameConfig | GameConfigInput | string | undefined): GameConfig {
  if (typeof input === 'string') {
    return validateGameConfig({ ...DEFAULT_GAME_CONFIG, seed: input });
  }
  return validateGameConfig({ ...DEFAULT_GAME_CONFIG, ...input });
}

function createSurvivor(
  index: number,
  random: DeterministicRandom,
  usedNames: Set<string>,
): SurvivorState {
  const currentWaypoint = STARTING_WAYPOINTS[index] ?? 'camp';
  const targets = AUTHORED_ROUTES[currentWaypoint];
  const targetWaypoint = targets[random.integer(0, targets.length - 1)] ?? 'camp';
  const generatedName = SURVIVOR_NAMES[random.integer(0, SURVIVOR_NAMES.length - 1)]!;
  const fallbackName = SURVIVOR_NAMES.find((name) => !usedNames.has(name)) ?? generatedName;
  const name = usedNames.has(generatedName) ? fallbackName : generatedName;
  usedNames.add(name);
  const position = waypointPosition(currentWaypoint);
  return {
    id: `survivor-${index + 1}`,
    name,
    color: SURVIVOR_COLORS[index] ?? SURVIVOR_COLORS[0],
    alive: true,
    position,
    previousPosition: { ...position },
    currentWaypoint,
    targetWaypoint,
    progressTicks: 0,
    routeIndex: index,
  };
}

function copyState(state: GameState): GameState {
  return {
    ...state,
    config: { ...state.config },
    clock: { ...state.clock },
    island: {
      cosmeticVariant: state.island.cosmeticVariant,
      sourceStates: Object.fromEntries(
        Object.entries(state.island.sourceStates).map(([id, source]) => [id, { ...source }]),
      ),
    },
    survivors: state.survivors.map((survivor) => ({
      ...survivor,
      position: { ...survivor.position },
      previousPosition: { ...survivor.previousPosition },
    })),
    campPolicy: { ...state.campPolicy },
    rngStates: cloneRandomStreamStates(state.rngStates),
  };
}

export function createGame(configInput?: GameConfig | GameConfigInput | string): GameState {
  const config = resolveConfig(configInput);
  const rngStates = createRandomStreamStates(config.seed);
  const survivorRandom = new DeterministicRandom(rngStates.survivorGeneration);
  const islandRandom = new DeterministicRandom(rngStates.islandCosmetics);
  const usedNames = new Set<string>();
  const survivors = Array.from({ length: config.survivorCount }, (_, index) =>
    createSurvivor(index, survivorRandom, usedNames),
  );
  const island = createIslandState(islandRandom);
  rngStates.survivorGeneration = survivorRandom.exportState();
  rngStates.islandCosmetics = islandRandom.exportState();
  return {
    seed: config.seed,
    config,
    status: 'running',
    clock: { tick: 0, day: 1 },
    island,
    survivors,
    campPolicy: { priority: 'balanced', lastChangedDay: null },
    rngStates,
  };
}

function moveSurvivor(
  survivor: SurvivorState,
  config: GameConfig,
  behaviorRandom: DeterministicRandom,
): SurvivorState {
  if (!survivor.alive) return survivor;
  const previousPosition = { ...survivor.position };
  let progressTicks = survivor.progressTicks + 1;
  let currentWaypoint = survivor.currentWaypoint;
  let targetWaypoint = survivor.targetWaypoint;
  let routeIndex = survivor.routeIndex;

  if (progressTicks >= config.movementTicks) {
    currentWaypoint = targetWaypoint;
    const nextTargets = AUTHORED_ROUTES[currentWaypoint];
    targetWaypoint = nextTargets[behaviorRandom.integer(0, nextTargets.length - 1)] ?? 'camp';
    routeIndex += 1;
    progressTicks = 0;
  }

  const from = waypointPosition(currentWaypoint);
  const to = waypointPosition(targetWaypoint);
  const fraction = progressTicks / config.movementTicks;
  return {
    ...survivor,
    previousPosition,
    currentWaypoint,
    targetWaypoint,
    progressTicks,
    routeIndex,
    position: {
      x: from.x + (to.x - from.x) * fraction,
      y: from.y + (to.y - from.y) * fraction,
    },
  };
}

export function advanceStep(state: GameState): GameState {
  if (state.status !== 'running') return state;
  const next = copyState(state);
  const behaviorRandom = new DeterministicRandom(next.rngStates.behavior);
  next.clock.tick += 1;
  next.clock.day = Math.min(
    Math.floor((next.clock.tick - 1) / next.config.ticksPerDay) + 1,
    Math.ceil(next.config.rescueTick / next.config.ticksPerDay),
  );
  if (
    next.campPolicy.lastChangedDay !== null &&
    next.campPolicy.lastChangedDay !== next.clock.day
  ) {
    next.campPolicy.lastChangedDay = null;
  }
  next.survivors = next.survivors.map((survivor) =>
    moveSurvivor(survivor, next.config, behaviorRandom),
  );
  next.rngStates.behavior = behaviorRandom.exportState();

  if (next.survivors.every((survivor) => !survivor.alive)) {
    next.status = 'defeat';
  } else if (next.clock.tick >= next.config.rescueTick) {
    next.clock.tick = next.config.rescueTick;
    next.status = 'victory';
  }
  return next;
}

export function applyCommand(state: GameState, command: GameCommand): CommandResult {
  if (command.type === 'reset-run') {
    return {
      state: createGame({ ...state.config, seed: command.seed ?? state.seed }),
      accepted: true,
    };
  }
  if (command.type !== 'set-camp-priority') {
    return { state, accepted: false, reason: 'unknown-command' };
  }
  if (state.status !== 'running') {
    return { state, accepted: false, reason: 'game-not-running' };
  }
  if (command.priority === state.campPolicy.priority) {
    return { state, accepted: false, reason: 'priority-already-selected' };
  }
  if (state.campPolicy.lastChangedDay === state.clock.day) {
    return { state, accepted: false, reason: 'daily-change-used' };
  }
  const next = copyState(state);
  next.campPolicy = { priority: command.priority, lastChangedDay: next.clock.day };
  return { state: next, accepted: true };
}

/** State-only convenience for consumers that do not need command feedback. */
export function applyCommandState(state: GameState, command: GameCommand): GameState {
  return applyCommand(state, command).state;
}

export function createSnapshot(state: GameState): GameSnapshot {
  return copyState(state);
}

export function cloneGameState(state: GameState): GameState {
  return copyState(state);
}

export type { CampPriority };
