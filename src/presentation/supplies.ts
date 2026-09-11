import type { GameSnapshot } from '../game/types';
import { formatDurationTicks } from './gameTime';

/** Compact display for nonnegative, capped supplies; never round stock upward. */
export function formatSupply(value: number): string {
  if (value === 0) return '0';
  if (value < 0.01) return '<0.01';
  // Truncate the decimal representation to avoid floating-point multiplication
  // turning 0.29 into 0.28 or an immediately-below-cost balance into the cost.
  const [whole, fraction] = value.toString().split('.');
  const decimals = fraction?.slice(0, 2).replace(/0+$/, '');
  return decimals ? `${whole}.${decimals}` : whole!;
}

export function sourceReplenishmentText(
  snapshot: GameSnapshot,
  amount: number,
  next: number | null,
): string {
  return amount === 0
    ? 'Finite; no replenishment.'
    : next === null
      ? 'No further replenishment before rescue.'
      : `Next dawn in ${formatDurationTicks(next - snapshot.clock.tick, snapshot.config.ticksPerDay)}: adds up to ${formatSupply(amount)}, capped by source capacity.`;
}

/** Round planning estimates; stored balances retain conservative exact formatting. */
export function formatSupplyEstimate(value: number): string {
  return value > 0 && value < 0.01 ? '<0.01' : formatSupply(Number(value.toFixed(2)));
}
