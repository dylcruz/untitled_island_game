export type GameStatus = 'running' | 'decision' | 'event-result' | 'victory' | 'defeat';

export type Speed = 0 | 1 | 3 | 8;

export const SPEEDS: readonly Speed[] = [0, 1, 3, 8];

export type CampPriority = 'balanced' | 'water' | 'food' | 'build' | 'recover';

export interface GameConfig {
  seed: string;
  fixedStepMs: number;
  ticksPerDay: number;
  rescueTick: number;
  survivorCount: number;
  movementTicks: number;
  rulesVersion: string;
}

export interface GameConfigInput {
  seed?: string;
  fixedStepMs?: number;
  ticksPerDay?: number;
  rescueTick?: number;
  survivorCount?: number;
  movementTicks?: number;
  rulesVersion?: string;
}

export interface Point {
  x: number;
  y: number;
}

export type WaypointId = 'camp' | 'water' | 'forage' | 'wreckage' | 'forest' | 'interior';

export interface Waypoint {
  id: WaypointId;
  label: string;
  x: number;
  y: number;
}

export interface SourceState {
  id: string;
  available: number;
  capacity: number;
}

export interface IslandState {
  cosmeticVariant: number;
  sourceStates: Record<string, SourceState>;
}

export interface SurvivorState {
  id: string;
  name: string;
  color: string;
  alive: boolean;
  position: Point;
  previousPosition: Point;
  currentWaypoint: WaypointId;
  targetWaypoint: WaypointId;
  progressTicks: number;
  routeIndex: number;
}

export interface GameClock {
  tick: number;
  day: number;
}

export interface CampPolicyState {
  priority: CampPriority;
  lastChangedDay: number | null;
}

export interface RandomStreamState {
  state: number;
}

export interface RandomStreamStates {
  survivorGeneration: RandomStreamState;
  islandCosmetics: RandomStreamState;
  behavior: RandomStreamState;
  eventSelection: RandomStreamState;
  eventOutcome: RandomStreamState;
}

export interface GameState {
  seed: string;
  config: GameConfig;
  status: GameStatus;
  clock: GameClock;
  island: IslandState;
  survivors: SurvivorState[];
  campPolicy: CampPolicyState;
  rngStates: RandomStreamStates;
}

export type GameCommand =
  { type: 'set-camp-priority'; priority: CampPriority } | { type: 'reset-run'; seed?: string };

export type CommandRejectionReason =
  'game-not-running' | 'priority-already-selected' | 'daily-change-used' | 'unknown-command';

export interface CommandResult {
  state: GameState;
  accepted: boolean;
  reason?: CommandRejectionReason;
}

export type GameSnapshot = Readonly<GameState>;
