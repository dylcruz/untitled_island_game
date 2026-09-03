import type { GameConfig } from './types';

export const RULES_VERSION = 'm0-foundation-1';

export const DEFAULT_GAME_CONFIG: GameConfig = {
  seed: 'island-foundation',
  fixedStepMs: 100,
  ticksPerDay: 600,
  rescueTick: 8_400,
  survivorCount: 3,
  movementTicks: 20,
  rulesVersion: RULES_VERSION,
};

export const TUNING = {
  maxCatchUpSteps: 8,
  snapshotHz: 8,
  waterCapacity: 8,
  forageCapacity: 8,
  wreckageCapacity: 12,
  forestCapacity: 10,
} as const;

export function validateGameConfig(config: GameConfig): GameConfig {
  if (!Number.isInteger(config.fixedStepMs) || config.fixedStepMs !== 100) {
    throw new Error('fixedStepMs must be the 100 ms foundation step');
  }
  if (!Number.isInteger(config.ticksPerDay) || config.ticksPerDay <= 0) {
    throw new Error('ticksPerDay must be a positive integer');
  }
  if (!Number.isInteger(config.rescueTick) || config.rescueTick <= 0) {
    throw new Error('rescueTick must be a positive integer');
  }
  if (config.rescueTick % config.ticksPerDay !== 0) {
    throw new Error('rescueTick must be an exact number of days');
  }
  if (!Number.isInteger(config.survivorCount) || config.survivorCount !== 3) {
    throw new Error('the foundation always creates exactly three survivors');
  }
  if (!Number.isInteger(config.movementTicks) || config.movementTicks <= 0) {
    throw new Error('movementTicks must be a positive integer');
  }
  if (config.rulesVersion !== RULES_VERSION) {
    throw new Error(`unsupported rules version: ${config.rulesVersion}`);
  }
  if (config.seed.trim().length === 0) {
    throw new Error('seed must not be empty');
  }
  return config;
}
