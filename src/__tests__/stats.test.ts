import { describe, expect, it } from 'vitest';
import { EMPTY_STATS, computeStats, currentStreak, maxStreak, winRate } from '../engine/stats.ts';
import type { GameArchive } from '../engine/game.ts';
import type { GameState, Stats } from '../engine/types.ts';

function played(date: string, overrides: Partial<GameState> = {}): GameState {
  return {
    date,
    celebrityId: 'prabhas',
    currentStage: 2,
    guesses: ['a', 'b', 'Prabhas'],
    hintsUsed: [],
    score: 300,
    completed: true,
    won: true,
    ...overrides,
  };
}

function archiveOf(...games: GameState[]): GameArchive {
  return Object.fromEntries(games.map((game) => [game.date, game]));
}

const lost = (date: string) => played(date, { won: false, score: 0, guesses: ['a', 'b', 'c', 'd', 'e'] });

describe('computeStats', () => {
  it('is empty with nothing played', () => {
    expect(computeStats({}, '2026-09-12')).toEqual(EMPTY_STATS);
  });

  it('ignores games still in progress', () => {
    const archive = archiveOf(played('2026-09-12', { completed: false, score: undefined }));
    expect(computeStats(archive, '2026-09-12').gamesPlayed).toBe(0);
  });

  it('counts a first win', () => {
    const stats = computeStats(archiveOf(played('2026-09-12')), '2026-09-12');
    expect(stats).toMatchObject({
      gamesPlayed: 1, gamesWon: 1, currentStreak: 1, maxStreak: 1, averageScore: 300,
    });
    expect(stats.distribution[3]).toBe(1);
  });

  it('averages across every completed game', () => {
    const archive = archiveOf(
      played('2026-09-12', { score: 500 }),
      played('2026-09-13', { score: 100 }),
    );
    expect(computeStats(archive, '2026-09-13').averageScore).toBe(300);
  });

  it('only counts wins in the distribution', () => {
    const stats = computeStats(archiveOf(lost('2026-09-12')), '2026-09-12');
    expect(Object.values(stats.distribution).every((count) => count === 0)).toBe(true);
    expect(stats.gamesPlayed).toBe(1);
    expect(stats.gamesWon).toBe(0);
  });

  // The back catalogue makes this the important case: a streak is a run of puzzle
  // dates, no matter what order the player actually sat down and played them.
  it('builds a streak from archive days played out of order', () => {
    const archive = archiveOf(
      played('2026-09-10'), played('2026-09-12'), played('2026-09-11'), played('2026-09-13'),
    );
    const stats = computeStats(archive, '2026-09-13');
    expect(stats.currentStreak).toBe(4);
    expect(stats.maxStreak).toBe(4);
  });

  it('does not bridge a day that was missed entirely', () => {
    const archive = archiveOf(played('2026-09-10'), played('2026-09-12'), played('2026-09-13'));
    expect(computeStats(archive, '2026-09-13').currentStreak).toBe(2);
  });

  it('does not bridge a day that was lost', () => {
    const archive = archiveOf(played('2026-09-11'), lost('2026-09-12'), played('2026-09-13'));
    const stats = computeStats(archive, '2026-09-13');
    expect(stats.currentStreak).toBe(1);
    expect(stats.maxStreak).toBe(1);
    expect(stats.gamesPlayed).toBe(3);
  });

  it('keeps the best streak after a later loss', () => {
    const archive = archiveOf(
      played('2026-09-10'), played('2026-09-11'), played('2026-09-12'), lost('2026-09-13'),
    );
    const stats = computeStats(archive, '2026-09-13');
    expect(stats.currentStreak).toBe(0);
    expect(stats.maxStreak).toBe(3);
  });

  it('reports the latest day played', () => {
    const archive = archiveOf(played('2026-09-10'), played('2026-09-13'));
    expect(computeStats(archive, '2026-09-13').lastPlayedDate).toBe('2026-09-13');
  });
});

describe('currentStreak', () => {
  const won = (...dates: string[]) => new Set(dates);

  it('counts back from today', () => {
    expect(currentStreak(won('2026-09-11', '2026-09-12'), won('2026-09-11', '2026-09-12'), '2026-09-12')).toBe(2);
  });

  it('survives today being unplayed — there is still time', () => {
    expect(currentStreak(won('2026-09-10', '2026-09-11'), won('2026-09-10', '2026-09-11'), '2026-09-12')).toBe(2);
  });

  it('is broken by losing today, not merely by not playing it', () => {
    const winners = won('2026-09-10', '2026-09-11');
    const played = won('2026-09-10', '2026-09-11', '2026-09-12');
    expect(currentStreak(winners, played, '2026-09-12')).toBe(0);
  });

  it('is broken once yesterday is missed too', () => {
    expect(currentStreak(won('2026-09-09', '2026-09-10'), won('2026-09-09', '2026-09-10'), '2026-09-12')).toBe(0);
  });

  it('crosses a month boundary', () => {
    expect(currentStreak(won('2026-08-31', '2026-09-01'), won('2026-08-31', '2026-09-01'), '2026-09-01')).toBe(2);
  });
});

describe('maxStreak', () => {
  it('finds the longest run anywhere', () => {
    const won = new Set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-09', '2026-09-10']);
    expect(maxStreak(won)).toBe(3);
  });

  it('is zero with nothing won', () => {
    expect(maxStreak(new Set())).toBe(0);
  });
});

describe('winRate', () => {
  it('rounds to a whole percent', () => {
    const stats: Stats = { ...EMPTY_STATS, gamesPlayed: 12, gamesWon: 10 };
    expect(winRate(stats)).toBe(83);
    expect(winRate(EMPTY_STATS)).toBe(0);
  });
});
