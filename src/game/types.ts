export type GameStatus = 'running' | 'decision' | 'event-result' | 'victory' | 'defeat';
export type GameMode = 'production' | 'slice';
export type Speed = 0 | 1 | 3 | 8;
export const SPEEDS: readonly Speed[] = [0, 1, 3, 8];
export type CampPriority = 'balanced' | 'water' | 'food' | 'build' | 'recover';
export type RunPhase = 'early' | 'middle' | 'late';
export interface GameConfig {
  seed: string;
  mode: GameMode;
  fixedStepMs: number;
  ticksPerDay: number;
  rescueTick: number;
  survivorCount: number;
  movementTicks: number;
  rulesVersion: string;
}
export type GameConfigInput = Partial<GameConfig>;
export interface Point {
  x: number;
  y: number;
}
export type WaypointId = 'camp' | 'water' | 'forage' | 'wreckage' | 'forest' | 'interior';
export type SourceId = 'water' | 'forage' | 'wreckage' | 'forest';
export type ResourceId = 'water' | 'food' | 'materials';
export interface Waypoint {
  id: WaypointId;
  label: string;
  x: number;
  y: number;
}
export interface SourceState {
  id: SourceId;
  available: number;
  capacity: number;
}
export interface IslandState {
  cosmeticVariant: number;
  sourceStates: Record<SourceId, SourceState>;
}
export interface ResourceState {
  water: number;
  food: number;
  materials: number;
}
export interface ShelterState {
  condition: number;
  maximumCondition: number;
}
export interface NeedState {
  health: number;
  hunger: number;
  thirst: number;
  energy: number;
}
export type TraitId =
  'forager' | 'resourceful' | 'optimist' | 'hot-headed' | 'tireless' | 'cautious';
export interface TraitDefinition {
  id: TraitId;
  name: string;
  description: string;
  incompatibleWith: readonly TraitId[];
  productivity: Partial<Record<'food' | 'materials' | 'travel' | 'dangerous', number>>;
  moraleLossMultiplier: number;
}
export type InjuryKind = 'cut' | 'sprain' | 'burn';
export interface InjuryState {
  kind: InjuryKind;
  severity: 1 | 2 | 3;
  recoveryTicksRemaining: number;
  productivityModifier: number;
}
export type TaskKind =
  | 'drink'
  | 'eat'
  | 'rest'
  | 'sleep'
  | 'gather-water'
  | 'gather-food'
  | 'gather-materials'
  | 'repair-shelter';
export type TaskReasonCode =
  | 'critical-thirst'
  | 'critical-hunger'
  | 'critical-health'
  | 'night-sleep'
  | 'low-energy'
  | 'recover-policy'
  | 'stock-water'
  | 'stock-food'
  | 'stock-materials'
  | 'repair-shelter';
export interface TaskReason {
  code: TaskReasonCode;
  params: Record<string, string | number>;
}
export interface ActiveTask {
  id: string;
  kind: TaskKind;
  destination: WaypointId;
  phase: 'travel' | 'work';
  remainingTicks: number;
  workTicks: number;
  reservationId: string | null;
  reason: TaskReason;
}
export interface TaskReservation {
  id: string;
  taskId: string;
  survivorId: string;
  sourceId: SourceId;
  expectedYield: number;
  kind?: 'source' | 'materials';
  resourceId?: 'materials';
  reservedAmount?: number;
}
export interface SurvivorState {
  id: string;
  name: string;
  color: string;
  visualVariant: number;
  traits: TraitId[];
  morale: number;
  injury: InjuryState | null;
  alive: boolean;
  position: Point;
  previousPosition: Point;
  currentWaypoint: WaypointId;
  targetWaypoint: WaypointId;
  progressTicks: number;
  routeIndex: number;
  needs: NeedState;
  activeTask: ActiveTask | null;
}
export interface GameClock {
  tick: number;
  day: number;
}
export type DayPhase = 'dawn' | 'daylight' | 'dusk' | 'night';
export interface DerivedTime {
  day: number;
  tickInDay: number;
  phase: DayPhase;
  runPhase: RunPhase;
  isDaylight: boolean;
  isDawn: boolean;
  rescueTicksRemaining: number;
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
export type SliceEventId = 'supply-cache' | 'storm-warning' | 'strange-tracks';
export type ProductionEventId =
  | 'tide-pools'
  | 'interior-signal'
  | 'water-dispute'
  | 'fallen-palm'
  | 'leaking-roof'
  | 'forager-instinct'
  | 'smoke-on-horizon'
  | 'signal-answer'
  | 'freshwater-seep'
  | 'seep-follow-up'
  | 'storm-front'
  | 'driftwood-cache'
  | 'night-watch';
export type EventId = SliceEventId | ProductionEventId;
export type ChoiceId = string;
export type EventCategory =
  'resource' | 'exploration' | 'conflict' | 'injury' | 'shelter' | 'trait' | 'follow-up';
export type ParticipantRule = 'any' | 'pair' | 'forager' | 'injured';
export type EffectKind = 'health' | 'resource' | 'need' | 'morale' | 'injury' | 'shelter';
export type RiskLevel = 'low' | 'moderate' | 'high';
export type RiskSeverity = 'none' | 'minor' | 'moderate' | 'severe';
export interface ProbabilityRange {
  min: number;
  max: number;
}
export interface RiskPresentation {
  level: RiskLevel;
  label: string;
  severity: RiskSeverity;
  probabilityRange: ProbabilityRange;
}
export interface EffectData {
  kind: EffectKind;
  target?: ResourceId | keyof NeedState | InjuryKind;
  amount: number;
  targetScope?: 'participant' | 'group';
  probability?: number;
  /** The risk band must agree with the containing choice when probability is set. */
  riskLevel?: RiskLevel;
}
export interface EventChoiceDefinition {
  id: ChoiceId;
  label: string;
  result: string;
  immediateEffects: readonly EffectData[];
  delayedEffect?: { delayTicks: number; effect: EffectData; description: string };
  followUpEventId?: ProductionEventId;
  risk: RiskPresentation;
}
export interface EventDefinition {
  id: EventId;
  title: string;
  description: string;
  earliestTick: number;
  category?: EventCategory;
  phases?: readonly RunPhase[];
  /** Minimum in-game days before this template may occur again. */
  cooldownDays?: number;
  /** Optional phase-specific selection weights; omitted phases use weight. */
  phaseWeights?: Partial<Record<RunPhase, number>>;
  weight?: number;
  repeatable?: boolean;
  participantRule?: ParticipantRule;
  requiresResource?: ResourceId;
  requiresPriorChoice?: { eventId: EventId; choiceId?: ChoiceId };
  choices: readonly EventChoiceDefinition[];
}
export interface ActiveEvent {
  id: EventId;
  activatedTick: number;
  participantIds?: string[];
  referencedChoice?: { eventId: EventId; choiceId: ChoiceId };
  chosenChoiceId: ChoiceId | null;
  result: string | null;
}
export interface ScheduledEffect {
  id: string;
  dueTick: number;
  sourceEventId: EventId;
  sourceChoiceId: ChoiceId;
  participantIds?: string[];
  effect: EffectData;
  description: string;
}
export interface PendingFollowUp {
  eventId: ProductionEventId;
  sourceEventId: EventId;
  sourceChoiceId: ChoiceId;
  earliestTick: number;
}
export interface EventScheduleState {
  nextEventTick: number | null;
  usedEventIds: EventId[];
  sequence: number;
  pendingFollowUps?: PendingFollowUp[];
  lastDecisionTick?: number | null;
}
export interface ChoiceRecord {
  eventId: EventId;
  choiceId: ChoiceId;
  tick: number;
  participantIds: string[];
  result: string;
}
export interface TurningPointRecord {
  id: string;
  tick: number;
  survivorIds: string[];
  kind: 'choice' | 'injury' | 'recovery' | 'death' | 'shelter';
  description: string;
  sourceEventId?: EventId;
}
export interface SimulationMetrics {
  interactiveEventCount: number;
  lastDecisionTick: number | null;
  maxDecisionGapTicks: number;
  taskReasonCounts: Partial<Record<TaskReasonCode, number>>;
}
export interface HistoryEntry {
  id: string;
  tick: number;
  kind: 'task' | 'resource' | 'event' | 'effect' | 'health' | 'terminal' | 'day';
  message: string;
}
export interface GameState {
  seed: string;
  config: GameConfig;
  status: GameStatus;
  clock: GameClock;
  island: IslandState;
  resources: ResourceState;
  shelter: ShelterState;
  survivors: SurvivorState[];
  reservations: TaskReservation[];
  activeEvent: ActiveEvent | null;
  scheduledEffects: ScheduledEffect[];
  eventSchedule: EventScheduleState;
  choiceRecords: ChoiceRecord[];
  turningPoints: TurningPointRecord[];
  metrics: SimulationMetrics;
  plannerRotation: number;
  history: HistoryEntry[];
  campPolicy: CampPolicyState;
  rngStates: RandomStreamStates;
  sequence: number;
}
export type GameCommand =
  | { type: 'set-camp-priority'; priority: CampPriority }
  | { type: 'select-event-choice'; eventId: EventId; choiceId: ChoiceId }
  | { type: 'acknowledge-event-result'; eventId: EventId }
  | { type: 'reset-run'; seed?: string };
export type CommandRejectionReason =
  | 'game-not-running'
  | 'priority-already-selected'
  | 'daily-change-used'
  | 'insufficient-resources'
  | 'event-not-awaiting-choice'
  | 'event-not-showing-result'
  | 'event-id-mismatch'
  | 'unknown-choice'
  | 'unknown-command';
export interface CommandResult {
  state: GameState;
  accepted: boolean;
  reason?: CommandRejectionReason;
}
export type EndingQuality =
  'triumphant-rescue' | 'costly-rescue' | 'barely-alive' | 'lost-expedition';
export interface SurvivorEnding {
  survivorId: string;
  name: string;
  fate: 'rescued' | 'lost';
  summary: string;
  turningPoints: TurningPointRecord[];
}
export interface EndingSummary {
  result: 'victory' | 'defeat';
  quality: EndingQuality;
  daysSurvived: number;
  seed: string;
  survivors: SurvivorEnding[];
  notableChoices: ChoiceRecord[];
}
export type GameSnapshot = Readonly<GameState>;
