/**
 * Presentation-only game-clock formatting.
 *
 * The simulation deliberately keeps integer ticks as its authoritative clock.
 * These helpers translate that clock into player-facing timestamps and
 * durations without introducing browser or wall-clock dependencies.
 */

const MINUTES_PER_DAY = 24 * 60;
const DAWN_MINUTE = 6 * 60;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeTicks(ticks: number): number {
  return Math.max(0, finiteOr(ticks, 0));
}

function normalizeTicksPerDay(ticksPerDay: number): number {
  return Math.max(1, finiteOr(ticksPerDay, 1));
}

function normalizedRescueTick(rescueTick: number, ticksPerDay: number): number {
  const safeTicksPerDay = normalizeTicksPerDay(ticksPerDay);
  return Math.max(0, finiteOr(rescueTick, safeTicksPerDay));
}

/** Clamp an authoritative tick to the playable run, including terminal state. */
export function clampGameTick(tick: number, rescueTick: number): number {
  return Math.min(normalizeTicks(tick), Math.max(0, finiteOr(rescueTick, 0)));
}

/**
 * Format an authoritative game tick as a player-facing in-game timestamp.
 * Tick zero is dawn at 6:00 AM; displayed minutes use nearest-whole-minute
 * rounding and day labels never advance beyond the configured rescue day.
 */
export function formatGameTimestamp(tick: number, ticksPerDay: number, rescueTick: number): string {
  const safeTicksPerDay = normalizeTicksPerDay(ticksPerDay);
  const safeRescueTick = normalizedRescueTick(rescueTick, safeTicksPerDay);
  const clampedTick = Math.min(normalizeTicks(tick), safeRescueTick);
  const rescueDay = Math.max(1, Math.ceil(safeRescueTick / safeTicksPerDay));
  const day = Math.min(Math.floor(clampedTick / safeTicksPerDay) + 1, rescueDay);
  const tickInDay = clampedTick % safeTicksPerDay;
  const elapsedMinutes = Math.min(
    MINUTES_PER_DAY,
    Math.round((tickInDay * MINUTES_PER_DAY) / safeTicksPerDay),
  );
  const minuteOfDay = (DAWN_MINUTE + elapsedMinutes) % MINUTES_PER_DAY;
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `Day ${day} · ${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/**
 * Format a non-negative game duration using whole minutes, hours, and days.
 * The largest useful unit is shown first, with a smaller remainder when it
 * carries meaningful information (for example, "7 hours 12 minutes").
 */
export function formatDurationTicks(ticks: number, ticksPerDay: number): string {
  const safeTicksPerDay = normalizeTicksPerDay(ticksPerDay);
  const totalMinutes = Math.max(
    0,
    Math.round((normalizeTicks(ticks) * MINUTES_PER_DAY) / safeTicksPerDay),
  );
  if (totalMinutes === 0) return '0 minutes';

  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const dayRemainder = totalMinutes % MINUTES_PER_DAY;
  if (days > 0) {
    const hours = Math.floor(dayRemainder / 60);
    const minutes = dayRemainder % 60;
    return [
      pluralize(days, 'day'),
      hours ? pluralize(hours, 'hour') : '',
      minutes ? pluralize(minutes, 'minute') : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? pluralize(hours, 'hour') : '', minutes ? pluralize(minutes, 'minute') : '']
    .filter(Boolean)
    .join(' ');
}

/** Convert an authoritative rising pressure (0 = full, 100 = empty) to clamped remaining percent. */
export function remainingNeedPercent(pressure: number): number {
  return Math.max(0, Math.min(100, 100 - finiteOr(pressure, 0)));
}
