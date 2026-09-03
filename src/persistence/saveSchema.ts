import { AUTHORED_WAYPOINTS } from '../game/island';
import { cloneGameState } from '../game/simulation';
import { RANDOM_STREAM_NAMES } from '../game/random';
import { RULES_VERSION, validateGameConfig } from '../game/tuning';
import type { GameState, RandomStreamState, SurvivorState, WaypointId } from '../game/types';

export const SAVE_SCHEMA_VERSION = 1 as const;
export const SAVE_STORAGE_KEY = 'untitled-island:resume';

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

export interface SaveParseSuccess {
  ok: true;
  envelope: SaveEnvelope;
  state: GameState;
}

export interface SaveParseFailure {
  ok: false;
  reason: SaveFailureReason;
}

export type SaveParseResult = SaveParseSuccess | SaveParseFailure;

type UnknownRecord = Record<string, unknown>;

const AUTHORED_SOURCE_IDS = ['water', 'forage', 'wreckage', 'forest'] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isRandomStreamState(value: unknown): value is RandomStreamState {
  return isRecord(value) && isInteger(value.state) && value.state >= 0 && value.state <= 0xffffffff;
}

function isPoint(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    value.x >= 0 &&
    value.x <= 1 &&
    value.y >= 0 &&
    value.y <= 1
  );
}

function isWaypointId(value: unknown): value is WaypointId {
  return (
    typeof value === 'string' &&
    AUTHORED_WAYPOINTS.some((authoredWaypoint) => authoredWaypoint.id === value)
  );
}

function isSurvivor(value: unknown): value is SurvivorState {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.color === 'string' &&
    typeof value.alive === 'boolean' &&
    isPoint(value.position) &&
    isPoint(value.previousPosition) &&
    isWaypointId(value.currentWaypoint) &&
    isWaypointId(value.targetWaypoint) &&
    isInteger(value.progressTicks) &&
    value.progressTicks >= 0 &&
    isInteger(value.routeIndex) &&
    value.routeIndex >= 0
  );
}

function isSourceState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    isFiniteNumber(value.available) &&
    isFiniteNumber(value.capacity) &&
    value.available >= 0 &&
    value.capacity >= 0 &&
    value.available <= value.capacity
  );
}

function isValidGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false;
  if (typeof value.seed !== 'string' || !isRecord(value.config)) return false;
  if (value.seed !== value.config.seed) return false;
  if (
    value.status !== 'running' &&
    value.status !== 'decision' &&
    value.status !== 'event-result' &&
    value.status !== 'victory' &&
    value.status !== 'defeat'
  ) {
    return false;
  }
  if (
    !isRecord(value.clock) ||
    !isInteger(value.clock.tick) ||
    value.clock.tick < 0 ||
    !isInteger(value.clock.day) ||
    value.clock.day < 1
  ) {
    return false;
  }
  if (!isRecord(value.island) || !isInteger(value.island.cosmeticVariant)) return false;
  if (value.island.cosmeticVariant < 0 || value.island.cosmeticVariant > 3) return false;
  if (!isRecord(value.island.sourceStates)) return false;
  const sourceStates = value.island.sourceStates;
  if (
    Object.keys(sourceStates).length !== AUTHORED_SOURCE_IDS.length ||
    !AUTHORED_SOURCE_IDS.every(
      (sourceId) =>
        isSourceState(sourceStates[sourceId]) &&
        (sourceStates[sourceId] as UnknownRecord).id === sourceId,
    )
  ) {
    return false;
  }
  if (
    !Array.isArray(value.survivors) ||
    !value.survivors.every(isSurvivor) ||
    value.survivors.length !== value.config.survivorCount
  ) {
    return false;
  }
  if (!isRecord(value.campPolicy)) return false;
  if (
    value.campPolicy.priority !== 'balanced' &&
    value.campPolicy.priority !== 'water' &&
    value.campPolicy.priority !== 'food' &&
    value.campPolicy.priority !== 'build' &&
    value.campPolicy.priority !== 'recover'
  ) {
    return false;
  }
  if (value.campPolicy.lastChangedDay !== null && !isInteger(value.campPolicy.lastChangedDay)) {
    return false;
  }
  if (!isRecord(value.rngStates)) return false;
  const rngStates = value.rngStates;
  if (!RANDOM_STREAM_NAMES.every((streamName) => isRandomStreamState(rngStates[streamName]))) {
    return false;
  }
  try {
    validateGameConfig(value.config as unknown as GameState['config']);
  } catch {
    return false;
  }
  return true;
}

export function createSaveEnvelope(
  state: GameState,
  savedAt = new Date().toISOString(),
): SaveEnvelope {
  if (typeof savedAt !== 'string' || savedAt.trim().length === 0) {
    throw new Error('savedAt must be a non-empty string');
  }
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    rulesVersion: state.config.rulesVersion,
    savedAt,
    gameState: cloneGameState(state),
  };
}

export function serializeSave(state: GameState, savedAt?: string): string {
  return JSON.stringify(createSaveEnvelope(state, savedAt));
}

export function parseSaveEnvelope(
  raw: unknown,
  expectedRulesVersion = RULES_VERSION,
): SaveParseResult {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: 'missing' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'invalid-envelope' };
  }
  if (raw.trim().length === 0) return { ok: false, reason: 'missing' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: 'malformed-json' };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'invalid-envelope' };
  if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupported-schema' };
  }
  if (parsed.rulesVersion !== expectedRulesVersion) {
    return { ok: false, reason: 'incompatible-rules' };
  }
  if (typeof parsed.savedAt !== 'string' || parsed.savedAt.trim().length === 0) {
    return { ok: false, reason: 'invalid-envelope' };
  }
  if (!isValidGameState(parsed.gameState)) {
    return { ok: false, reason: 'invalid-envelope' };
  }
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

/** Convenience API for callers that only need a safe state-or-null result. */
export function restoreSave(raw: unknown, expectedRulesVersion = RULES_VERSION): GameState | null {
  const result = parseSaveEnvelope(raw, expectedRulesVersion);
  return result.ok ? result.state : null;
}
