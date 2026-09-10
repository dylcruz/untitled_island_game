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
