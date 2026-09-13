import { hashString, seededUnit } from './hash.ts';
import type { Celebrity, DailyPuzzle, Difficulty, GameMode } from './types.ts';

/** Keeps the daily rotation from feeling like a trivia exam. */
export const DIFFICULTY_MIX: ReadonlyArray<readonly [Difficulty, number]> = [
  ['easy', 0.6],
  ['medium', 0.3],
  ['hard', 0.1],
];

export const DEFAULT_REPEAT_GAP_DAYS = 180;

export function pickDifficulty(dateKey: string): Difficulty {
  const roll = seededUnit(`${dateKey}:difficulty`);
  let cumulative = 0;
  for (const [difficulty, weight] of DIFFICULTY_MIX) {
    cumulative += weight;
    if (roll < cumulative) return difficulty;
  }
  return 'easy';
}

export function playablePool(celebrities: readonly Celebrity[]): Celebrity[] {
  return celebrities
    .filter((celebrity) => celebrity.playable)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Deterministic selection: the same date always resolves to the same star, with
 * no dependence on load order, wall-clock time or previous page views.
 */
export function selectForDate(
  dateKey: string,
  celebrities: readonly Celebrity[],
  excludeIds: ReadonlySet<string> = new Set(),
): Celebrity | undefined {
  const pool = playablePool(celebrities);
  if (pool.length === 0) return undefined;

  const difficulty = pickDifficulty(dateKey);
  const tiers = [
    pool.filter((c) => c.difficulty === difficulty && !excludeIds.has(c.id)),
    pool.filter((c) => !excludeIds.has(c.id)),
    pool,
  ];
  const candidates = tiers.find((tier) => tier.length > 0)!;
  return candidates[hashString(`${dateKey}:star`) % candidates.length];
}

/**
 * Builds a schedule ahead of time so the same person cannot come back inside
 * `repeatGapDays`, which pure per-date hashing cannot guarantee.
 */
export function generateSchedule(
  celebrities: readonly Celebrity[],
  startDateKey: string,
  days: number,
  options: { repeatGapDays?: number; mode?: GameMode } = {},
): DailyPuzzle[] {
  const repeatGapDays = options.repeatGapDays ?? DEFAULT_REPEAT_GAP_DAYS;
  const mode = options.mode ?? 'MIXED';
  const createdAt = new Date().toISOString();
  const puzzles: DailyPuzzle[] = [];
  const recent: string[] = [];

  const cursor = new Date(
    Number(startDateKey.slice(0, 4)),
    Number(startDateKey.slice(5, 7)) - 1,
    Number(startDateKey.slice(8, 10)),
  );

  for (let day = 0; day < days; day += 1) {
    const dateKey = [
      cursor.getFullYear(),
      `${cursor.getMonth() + 1}`.padStart(2, '0'),
      `${cursor.getDate()}`.padStart(2, '0'),
    ].join('-');

    const excluded = new Set(recent.slice(-repeatGapDays));
    const celebrity = selectForDate(dateKey, celebrities, excluded);
    if (!celebrity) throw new Error('No playable celebrities available for scheduling.');

    puzzles.push({ date: dateKey, celebrityId: celebrity.id, mode, createdAt });
    recent.push(celebrity.id);
    cursor.setDate(cursor.getDate() + 1);
  }

  return puzzles;
}

/** date -> celebrity id. Built in the browser; never shipped as a file. */
export type PuzzleSchedule = Record<string, string>;

const scheduleCache = new Map<string, PuzzleSchedule>();

/**
 * Builds the schedule from launch up to `throughDate`, in the browser.
 *
 * Nothing about the answers is stored anywhere — not in the repository, not in the
 * bundle. The sequence is a pure function of the roster, the launch date and the
 * repeat gap, all of which are public and reveal nothing on their own, so a reader
 * of the source cannot look up a date and see a name. They would have to run the
 * game's own selector, which is the most a static site with no backend can ask.
 *
 * Replaying the sequence is also what preserves the no-repeat guarantee: the gap
 * depends on everything chosen before a given day, so a single date cannot be
 * evaluated in isolation.
 */
export function buildSchedule(
  celebrities: readonly Celebrity[],
  launchDate: string,
  throughDate: string,
  options: { repeatGapDays?: number } = {},
): PuzzleSchedule {
  const key = `${launchDate}|${throughDate}|${celebrities.length}`;
  const cached = scheduleCache.get(key);
  if (cached) return cached;

  const days = Math.max(1, daysApart(launchDate, throughDate) + 1);
  const schedule: PuzzleSchedule = {};
  for (const puzzle of generateSchedule(celebrities, launchDate, days, options)) {
    schedule[puzzle.date] = puzzle.celebrityId;
  }
  scheduleCache.set(key, schedule);
  return schedule;
}

function daysApart(from: string, to: string): number {
  const start = Date.UTC(
    Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)),
  );
  const end = Date.UTC(
    Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)),
  );
  return Math.round((end - start) / 86_400_000);
}

/**
 * Resolves a day's star: the replayed schedule when the date is covered, otherwise
 * the deterministic selector so the game never dead-ends.
 */
export function resolveDailyPuzzle(
  dateKey: string,
  celebrities: readonly Celebrity[],
  schedule: PuzzleSchedule,
): Celebrity | undefined {
  const id = schedule[dateKey];
  if (id) {
    const scheduled = celebrities.find((celebrity) => celebrity.id === id);
    if (scheduled) return scheduled;
  }
  return selectForDate(dateKey, celebrities);
}
