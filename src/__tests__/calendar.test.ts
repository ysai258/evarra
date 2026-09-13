import { describe, expect, it } from 'vitest';
import { buildMonth, monthOf, shiftMonth } from '../engine/calendar.ts';
import type { ArchiveDay } from '../engine/archive.ts';

const noStatuses = new Map<string, ArchiveDay['status']>();

function cellsOf(month: string, launch: string, today: string, statuses = noStatuses) {
  return buildMonth(month, { launch, today, statuses })
    .weeks.flat()
    .filter((cell) => cell.date);
}

describe('shiftMonth', () => {
  it('steps within a year', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-09', -1)).toBe('2026-08');
  });

  it('crosses the year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('buildMonth', () => {
  it('lays the month out in whole weeks starting on Sunday', () => {
    const view = buildMonth('2026-09', { launch: '2026-09-01', today: '2026-09-30', statuses: noStatuses });
    expect(view.label).toBe('September 2026');
    expect(view.weeks.every((week) => week.length === 7)).toBe(true);
    expect(view.weeks.flat().filter((cell) => cell.date)).toHaveLength(30);
  });

  it('handles a leap February', () => {
    expect(cellsOf('2028-02', '2028-01-01', '2028-12-31')).toHaveLength(29);
    expect(cellsOf('2026-02', '2026-01-01', '2026-12-31')).toHaveLength(28);
  });

  it('disables days before launch', () => {
    const cells = cellsOf('2026-09', '2026-09-13', '2026-09-30');
    expect(cells.find((cell) => cell.date === '2026-09-12')?.playable).toBe(false);
    expect(cells.find((cell) => cell.date === '2026-09-13')?.playable).toBe(true);
  });

  it('disables days after today', () => {
    const cells = cellsOf('2026-09', '2026-09-01', '2026-09-13');
    expect(cells.find((cell) => cell.date === '2026-09-13')?.playable).toBe(true);
    expect(cells.find((cell) => cell.date === '2026-09-14')?.playable).toBe(false);
    expect(cells.find((cell) => cell.date === '2026-09-30')?.playable).toBe(false);
  });

  // Launch day: the only star anyone can play is today's.
  it('leaves exactly one day playable on launch day', () => {
    const cells = cellsOf('2026-09', '2026-09-13', '2026-09-13');
    expect(cells.filter((cell) => cell.playable).map((cell) => cell.date)).toEqual(['2026-09-13']);
  });

  it('opens one more day with each day that passes', () => {
    expect(cellsOf('2026-09', '2026-09-13', '2026-09-14').filter((c) => c.playable)).toHaveLength(2);
    expect(cellsOf('2026-09', '2026-09-13', '2026-09-15').filter((c) => c.playable)).toHaveLength(3);
  });

  it('marks today', () => {
    const cells = cellsOf('2026-09', '2026-09-01', '2026-09-13');
    expect(cells.filter((cell) => cell.isToday).map((cell) => cell.date)).toEqual(['2026-09-13']);
  });

  it('carries each day’s status through', () => {
    const statuses = new Map<string, ArchiveDay['status']>([
      ['2026-09-13', 'won'],
      ['2026-09-14', 'lost'],
      ['2026-09-15', 'in-progress'],
    ]);
    const cells = cellsOf('2026-09', '2026-09-13', '2026-09-20', statuses);
    expect(cells.find((c) => c.date === '2026-09-13')?.status).toBe('won');
    expect(cells.find((c) => c.date === '2026-09-14')?.status).toBe('lost');
    expect(cells.find((c) => c.date === '2026-09-15')?.status).toBe('in-progress');
    expect(cells.find((c) => c.date === '2026-09-16')?.status).toBe('unplayed');
  });

  it('offers no month outside the playable range', () => {
    const view = buildMonth('2026-09', { launch: '2026-09-13', today: '2026-09-20', statuses: noStatuses });
    expect(view.previousMonth).toBeUndefined();
    expect(view.nextMonth).toBeUndefined();
  });

  it('offers navigation once the range spans months', () => {
    const view = buildMonth('2026-10', { launch: '2026-09-13', today: '2026-11-02', statuses: noStatuses });
    expect(view.previousMonth).toBe('2026-09');
    expect(view.nextMonth).toBe('2026-11');
  });

  it('keeps padding cells unplayable', () => {
    const view = buildMonth('2026-09', { launch: '2026-09-01', today: '2026-09-30', statuses: noStatuses });
    const padding = view.weeks.flat().filter((cell) => !cell.date);
    expect(padding.every((cell) => !cell.playable)).toBe(true);
  });

  it('reads the month out of a date', () => {
    expect(monthOf('2026-09-13')).toBe('2026-09');
  });
});
