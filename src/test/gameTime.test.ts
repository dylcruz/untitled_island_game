import { describe, expect, it } from 'vitest';
import {
  formatDurationTicks,
  formatGameTimestamp,
  remainingNeedPercent,
} from '../presentation/gameTime';

describe('player-facing game time', () => {
  it('formats production day boundaries from dawn at 6:00 AM', () => {
    expect(formatGameTimestamp(0, 600, 8_400)).toBe('Day 1 · 6:00 AM');
    expect(formatGameTimestamp(150, 600, 8_400)).toBe('Day 1 · 12:00 PM');
    expect(formatGameTimestamp(450, 600, 8_400)).toBe('Day 1 · 12:00 AM');
    expect(formatGameTimestamp(599, 600, 8_400)).toBe('Day 1 · 5:58 AM');
    expect(formatGameTimestamp(600, 600, 8_400)).toBe('Day 2 · 6:00 AM');
  });

  it('formats slice boundaries and rounds to the nearest whole minute', () => {
    expect(formatGameTimestamp(1, 120, 360)).toBe('Day 1 · 6:12 AM');
    expect(formatGameTimestamp(60, 120, 360)).toBe('Day 1 · 6:00 PM');
    expect(formatGameTimestamp(119, 120, 360)).toBe('Day 1 · 5:48 AM');
    expect(formatGameTimestamp(120, 120, 360)).toBe('Day 2 · 6:00 AM');
    expect(formatGameTimestamp(360, 120, 360)).toBe('Day 3 · 6:00 AM');
  });

  it('clamps timestamps to the run range and rescue day', () => {
    expect(formatGameTimestamp(-10, 600, 8_400)).toBe('Day 1 · 6:00 AM');
    expect(formatGameTimestamp(9_000, 600, 8_400)).toBe('Day 14 · 6:00 AM');
    expect(formatGameTimestamp(480, 120, 360)).toBe('Day 3 · 6:00 AM');
  });

  it('formats short and long durations without exposing authoritative ticks', () => {
    expect(formatDurationTicks(-1, 600)).toBe('0 minutes');
    expect(formatDurationTicks(0, 600)).toBe('0 minutes');
    expect(formatDurationTicks(1, 600)).toBe('2 minutes');
    expect(formatDurationTicks(1, 120)).toBe('12 minutes');
    expect(formatDurationTicks(30, 600)).toBe('1 hour 12 minutes');
    expect(formatDurationTicks(600, 600)).toBe('1 day');
    expect(formatDurationTicks(8_400, 600)).toBe('14 days');
  });

  it('clamps remaining hunger and thirst percentages', () => {
    expect(remainingNeedPercent(-10)).toBe(100);
    expect(remainingNeedPercent(0)).toBe(100);
    expect(remainingNeedPercent(42.4)).toBeCloseTo(57.6);
    expect(remainingNeedPercent(100)).toBe(0);
    expect(remainingNeedPercent(125)).toBe(0);
  });
});
