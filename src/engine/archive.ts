import { addDays, daysBetween, todayKey } from './date.ts';
import type { GameState } from './types.ts';

/**
 * The back catalogue. Someone who finds the game on day 10 should be able to play all
 * ten stars, not just today's — so every day from launch up to today stays open.
 *
 * Future days are never playable: the point of a daily game is that everyone faces
 * the same star on the same day.
 */

/** Every playable date, newest first. */
export function archiveDates(
  launch: string | undefined,
  today: string = todayKey(),
): string[] {
  if (!launch || launch > today) return [today];

  const dates: string[] = [];
  for (let date = today; date >= launch; date = addDays(date, -1)) {
    dates.push(date);
    // A corrupt schedule must not spin here.
    if (dates.length > 3650) break;
  }
  return dates;
}

export function isPlayableDate(
  date: string,
  launch: string | undefined,
  today: string = todayKey(),
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (date > today) return false;
  return launch === undefined || date >= launch;
}

export type ArchiveDay = {
  date: string;
  isToday: boolean;
  daysAgo: number;
  state?: GameState;
  status: 'won' | 'lost' | 'in-progress' | 'unplayed';
};

export function describeDay(
  date: string,
  state: GameState | undefined,
  today: string,
): ArchiveDay {
  const status: ArchiveDay['status'] = state?.completed
    ? (state.won ? 'won' : 'lost')
    : (state && state.guesses.length > 0 ? 'in-progress' : 'unplayed');
  return {
    date,
    isToday: date === today,
    daysAgo: daysBetween(date, today),
    ...(state ? { state } : {}),
    status,
  };
}

/** How many past days the player has not finished — drives the "catch up" prompt. */
export function unplayedCount(days: readonly ArchiveDay[]): number {
  return days.filter((day) => day.status === 'unplayed' || day.status === 'in-progress').length;
}
