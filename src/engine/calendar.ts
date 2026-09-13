import { toDateKey } from './date.ts';
import type { ArchiveDay } from './archive.ts';

/**
 * Month grid for the archive picker. Pure and dateless by design — it is handed the
 * bounds rather than reading the clock — so the awkward cases (month lengths, leap
 * years, a launch date mid-month) are testable.
 */

export type DayCell = {
  /** Absent for the padding cells before the 1st and after the last day. */
  date?: string;
  dayOfMonth?: number;
  /** Inside [launch, today]: anything else is shown but not playable. */
  playable: boolean;
  isToday: boolean;
  status: ArchiveDay['status'];
};

export type MonthView = {
  /** `YYYY-MM`. */
  month: string;
  label: string;
  weeks: DayCell[][];
  /** Absent when stepping there would leave the playable range entirely. */
  previousMonth?: string;
  nextMonth?: string;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + delta;
  const shifted = new Date(year, index, 1);
  return `${shifted.getFullYear()}-${`${shifted.getMonth() + 1}`.padStart(2, '0')}`;
}

export function buildMonth(
  month: string,
  options: {
    launch: string;
    today: string;
    statuses: ReadonlyMap<string, ArchiveDay['status']>;
  },
): MonthView {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const cells: DayCell[] = [];
  // Leading blanks so the 1st lands under its weekday (weeks start on Sunday).
  for (let i = 0; i < first.getDay(); i += 1) {
    cells.push({ playable: false, isToday: false, status: 'unplayed' });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = toDateKey(new Date(year, monthIndex, day));
    cells.push({
      date,
      dayOfMonth: day,
      playable: date >= options.launch && date <= options.today,
      isToday: date === options.today,
      status: options.statuses.get(date) ?? 'unplayed',
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ playable: false, isToday: false, status: 'unplayed' });
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return {
    month,
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
    weeks,
    // Only offer a month that still contains a playable day.
    ...(previous >= monthOf(options.launch) ? { previousMonth: previous } : {}),
    ...(next <= monthOf(options.today) ? { nextMonth: next } : {}),
  };
}
