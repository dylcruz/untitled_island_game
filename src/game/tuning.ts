import type { GameConfig } from './types';
export const RULES_VERSION = 'm2-proof-of-fun-1';
export const DEFAULT_GAME_CONFIG: GameConfig = {
  seed: 'island-foundation',
  mode: 'production',
  fixedStepMs: 100,
  ticksPerDay: 600,
  rescueTick: 8_400,
  survivorCount: 3,
  movementTicks: 20,
  rulesVersion: RULES_VERSION,
};
export const SLICE_GAME_CONFIG: GameConfig = {
  seed: 'island-slice',
  mode: 'slice',
  fixedStepMs: 100,
  ticksPerDay: 120,
  rescueTick: 360,
  survivorCount: 1,
  movementTicks: 6,
  rulesVersion: RULES_VERSION,
};
export const TUNING = {
  maxCatchUpSteps: 8,
  snapshotHz: 8,
  resourceCaps: { water: 20, food: 20, materials: 20 },
  startingResources: { water: 4, food: 3, materials: 0 },
  sourceCaps: { water: 12, forage: 10, wreckage: 7, forest: 10 },
  dawnReplenishment: { water: 6, forage: 4, forest: 1 },
  needRates: { hunger: 0.14, thirst: 0.2, energy: 0.12 },
  critical: { hunger: 72, thirst: 68, energy: 18 },
  taskThresholds: { hunger: 48, thirst: 42, energy: 35 },
  healthDamage: { hunger: 0.35, thirst: 0.55, exhaustion: 0.2 },
  taskWorkTicks: { drink: 2, eat: 2, rest: 8, sleep: 12, gather: 8 },
  taskYields: { water: 3, forage: 3, wreckage: 2, forest: 2 },
  consumption: { water: 1, food: 1 },
  recovery: { drink: 42, eat: 36, rest: 25, sleep: 50 },
  morale: { starting: 72, low: 30, dailyLoss: 1.5, injuryLoss: 0.012, sleepRecovery: 0.035 },
  injury: { baseRecoveryTicks: 360, productivityPerSeverity: 0.15, sleepRecoveryMultiplier: 2 },
  shelter: {
    startingCondition: 76,
    decayPerDay: 4,
    repairThreshold: 62,
    repairAmount: 24,
    repairMaterials: 2,
    poorThreshold: 35,
    protectedSleepBonus: 8,
  },
  planner: {
    targetStockPerSurvivor: { water: 3.5, food: 2.8 },
    policyScores: {
      balanced: { water: 4, food: 4, materials: 2, repair: 3, rest: 0 },
      water: { water: 14, food: -2, materials: -3, repair: -3, rest: -4 },
      food: { water: -2, food: 14, materials: -3, repair: -3, rest: -4 },
      build: { water: -3, food: -3, materials: 12, repair: 16, rest: -4 },
      recover: { water: -5, food: -5, materials: -6, repair: -5, rest: 20 },
    },
  },
  eventFirstTickFraction: 0.2,
  eventSpacingFraction: 0.27,
  productionEventFirstDayFraction: 0.45,
  productionEventSpacingDays: 0.8,
  productionEventDeadlineDays: 2,
  riskProbability: { low: 0.2, moderate: 0.45, high: 0.7 },
} as const;
export function validateGameConfig(config: GameConfig): GameConfig {
  if (!Number.isInteger(config.fixedStepMs) || config.fixedStepMs !== 100)
    throw new Error('fixedStepMs must be 100 ms');
  if (!Number.isInteger(config.ticksPerDay) || config.ticksPerDay <= 0)
    throw new Error('ticksPerDay must be positive');
  if (
    !Number.isInteger(config.rescueTick) ||
    config.rescueTick <= 0 ||
    config.rescueTick % config.ticksPerDay !== 0
  )
    throw new Error('rescueTick must be an exact number of days');
  const production =
    config.mode === 'production' &&
    config.survivorCount === 3 &&
    config.ticksPerDay === 600 &&
    config.rescueTick === 8_400;
  const slice =
    config.mode === 'slice' &&
    config.survivorCount === 1 &&
    config.ticksPerDay === 120 &&
    config.rescueTick === 360;
  if (!production && !slice)
    throw new Error('configuration must match the production or internal slice contract');
  if (!Number.isInteger(config.movementTicks) || config.movementTicks <= 0)
    throw new Error('movementTicks must be positive');
  if (config.rulesVersion !== RULES_VERSION)
    throw new Error(`unsupported rules version: ${config.rulesVersion}`);
  if (typeof config.seed !== 'string' || config.seed.trim().length === 0)
    throw new Error('seed must not be empty');
  return config;
}
