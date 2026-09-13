import { describe, expect, it } from 'vitest';
import {
  addDays, daysBetween, formatCountdown, formatPuzzleDate, msUntilTomorrow, toDateKey,
} from '../engine/date.ts';

describe('dates', () => {
  it('formats a local date key, not a UTC one', () => {
    // 23:30 local on the 12th must stay the 12th, whatever the timezone offset is.
    expect(toDateKey(new Date(2026, 8, 12, 23, 30))).toBe('2026-09-12');
    expect(toDateKey(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('counts days between keys', () => {
    expect(daysBetween('2026-09-12', '2026-09-13')).toBe(1);
    expect(daysBetween('2026-09-12', '2026-09-12')).toBe(0);
  });

  it('counts down to local midnight', () => {
    const ms = msUntilTomorrow(new Date(2026, 8, 12, 23, 0, 0));
    expect(ms).toBe(60 * 60 * 1000);
  });

  it('formats a countdown as hh:mm:ss', () => {
    expect(formatCountdown(8 * 3600_000 + 42 * 60_000 + 17_000)).toBe('08:42:17');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });

  it('formats a readable puzzle date', () => {
    expect(formatPuzzleDate('2026-09-12')).toBe('September 12, 2026');
  });
});
