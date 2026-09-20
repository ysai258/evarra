import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { MAX_SCORE, baseScoreForStage } from '../engine/scoring.ts';

/**
 * Multiplayer scoring — one curve, on the clock.
 *
 * The daily game scores you on which of five stages you were looking at, because there
 * the picture only clears when you guess wrong. In a room the picture clears on time
 * alone, so time is the only thing there is to score. A stage index would just be the
 * clock, rounded — and rounding it is what made the number jump while the photograph
 * was sharpening smoothly.
 *
 * So the ladder is read continuously. The score starts where the daily game's does and
 * decays to where it ends:
 *
 *     base  = 500 down to 180, linearly across the question
 *     final = base x (1 + 0.5 x fraction of the clock still left)
 *
 * which is 750 on the opening frame and 180 on the buzzer, the same two numbers the
 * stepped version had at its extremes. Multiplying two quantities that both fall with
 * time makes the curve steepest at the start, which is the intent: recognising a face
 * through heavy blur in the first seconds should feel disproportionately rewarded.
 *
 * It is also strictly decreasing, which is worth more than it sounds. The stepped
 * version needed a careful argument that its five score bands could not overlap; here
 * the guarantee is simply that answering sooner always pays more than answering later,
 * and `mp-scoring.test.ts` checks it across the whole question rather than at five
 * points.
 */
export const TIME_BONUS_MAX = 0.5;

/** Where the curve lands on the buzzer — the daily ladder's last rung. */
export const MIN_QUESTION_SCORE = baseScoreForStage(MAX_ATTEMPTS - 1);

export type MultiplayerScoreInput = {
  /** Server clock: how far into the question the correct guess landed. */
  elapsedMs: number;
  durationMs: number;
};

/** How far through the question, as 0..1. Never trusts the numbers it is handed. */
export function questionProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const progress = elapsedMs / durationMs;
  if (!Number.isFinite(progress)) return 1;
  return Math.min(1, Math.max(0, progress));
}

export function timeMultiplier(elapsedMs: number, durationMs: number): number {
  return 1 + TIME_BONUS_MAX * (1 - questionProgress(elapsedMs, durationMs));
}

/** A wrong answer, or no answer at all, is worth nothing. This is only for winners. */
export function multiplayerScore(input: MultiplayerScoreInput): number {
  const progress = questionProgress(input.elapsedMs, input.durationMs);
  const base = MAX_SCORE - (MAX_SCORE - MIN_QUESTION_SCORE) * progress;
  return Math.round(base * timeMultiplier(input.elapsedMs, input.durationMs));
}

/** The most a question can pay: the opening frame, before the clock has moved. */
export const MAX_QUESTION_SCORE = multiplayerScore({ elapsedMs: 0, durationMs: 1 });
