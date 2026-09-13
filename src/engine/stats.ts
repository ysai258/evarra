import { addDays, todayKey } from './date.ts';
import type { GameArchive } from './game.ts';
import type { Stats } from './types.ts';

export const EMPTY_STATS: Stats = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  totalScore: 0,
  averageScore: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/**
 * Statistics are derived from the stored days rather than accumulated as the player
 * goes. That is what makes the back catalogue work: streaks count *puzzle dates*, not
 * the order someone happened to sit down and play them. Catch up on ten missed days
 * and you have a ten-day streak; play them out of order and you still do.
 */
export function computeStats(archive: GameArchive, today: string = todayKey()): Stats {
  const finished = Object.values(archive).filter((game) => game.completed);
  if (finished.length === 0) return EMPTY_STATS;

  const distribution = { ...EMPTY_STATS.distribution };
  let gamesWon = 0;
  let totalScore = 0;
  const wonDates = new Set<string>();
  const playedDates = new Set<string>();

  for (const game of finished) {
    totalScore += game.score ?? 0;
    playedDates.add(game.date);
    if (!game.won) continue;
    gamesWon += 1;
    wonDates.add(game.date);
    const attempt = game.guesses.length;
    distribution[attempt] = (distribution[attempt] ?? 0) + 1;
  }

  const lastPlayedDate = finished
    .map((game) => game.date)
    .reduce((latest, date) => (date > latest ? date : latest));

  return {
    gamesPlayed: finished.length,
    gamesWon,
    currentStreak: currentStreak(wonDates, playedDates, today),
    maxStreak: maxStreak(wonDates),
    totalScore,
    averageScore: Math.round(totalScore / finished.length),
    distribution,
    lastPlayedDate,
  };
}

/**
 * Consecutive winning days ending at today.
 *
 * Today being *unplayed* does not break a streak — there is still time, so the count
 * starts at yesterday instead. Today being played and lost does break it.
 */
export function currentStreak(
  wonDates: ReadonlySet<string>,
  playedDates: ReadonlySet<string>,
  today: string,
): number {
  if (playedDates.has(today) && !wonDates.has(today)) return 0;
  let cursor = wonDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (wonDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** The longest run of consecutive winning days anywhere in the archive. */
export function maxStreak(wonDates: ReadonlySet<string>): number {
  let best = 0;
  for (const date of wonDates) {
    // Only count from the start of a run, so each run is measured once.
    if (wonDates.has(addDays(date, -1))) continue;
    let length = 0;
    for (let cursor = date; wonDates.has(cursor); cursor = addDays(cursor, 1)) length += 1;
    best = Math.max(best, length);
  }
  return best;
}

export function winRate(stats: Stats): number {
  return stats.gamesPlayed === 0 ? 0 : Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
}
