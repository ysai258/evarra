import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { MIN_WINNING_SCORE, STAGE_PENALTY, baseScoreForStage } from '../engine/scoring.ts';

/**
 * Multiplayer scoring — the daily game's numbers with a clock on top.
 *
 * The base is the existing ladder, unchanged: 500 at full blur down to 180 once the
 * photo is nearly clear. Two things then act on it.
 *
 * A **wrong guess costs a stage**. Multiplayer lets you keep guessing until the buzzer,
 * and without a price for being wrong the best strategy is to start naming the roster
 * at second zero — you would beat everyone who actually recognised the face. Charging
 * a wrong guess exactly what it costs in the daily game (one stage, 80 points) keeps
 * the bargain the same in both modes: five bad guesses and you are on the floor.
 *
 * A **time bonus** of up to +50% then rewards recognising the face quickly. The cap
 * is what keeps the mode honest, and it is worth stating why +50% is the right number
 * rather than a round one: a stage is never free. Reaching stage 1 has already cost a
 * quarter of the clock, so the time still available at a given stage is bounded by
 * that stage. Work the bands out under that bound and they do not overlap — the worst
 * possible answer at one stage still outscores the best possible answer at the next.
 *
 * So the blur stage decides the ranking and the clock only orders players *within* a
 * stage. That is the bargain the mode is sold on (spec §63), and `mp-scoring.test.ts`
 * holds it to it; raising the cap much past 0.5 would quietly break it.
 */
export const TIME_BONUS_MAX = 0.5;
export const WRONG_GUESS_PENALTY = STAGE_PENALTY;

export type MultiplayerScoreInput = {
  /** Blur stage on screen when the correct guess landed. */
  stageIndex: number;
  /** Wrong guesses this player made on this question before getting it. */
  wrongGuesses: number;
  /** Server clock: how much of the question was still left. Clamped into range. */
  timeRemainingMs: number;
  durationMs: number;
};

/** The base before the clock touches it — the daily ladder minus the misses. */
export function multiplayerBaseScore(stageIndex: number, wrongGuesses: number): number {
  const clampedStage = Math.min(Math.max(Math.trunc(stageIndex), 0), MAX_ATTEMPTS - 1);
  const misses = Math.max(0, Math.trunc(wrongGuesses));
  const penalised = baseScoreForStage(clampedStage) - misses * WRONG_GUESS_PENALTY;
  return Math.max(MIN_WINNING_SCORE, penalised);
}

/** How much of the clock was left, as 0..1. Never trusts the numbers it is handed. */
export function timeRatio(timeRemainingMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  const remaining = Math.min(Math.max(timeRemainingMs, 0), durationMs);
  return remaining / durationMs;
}

export function timeMultiplier(timeRemainingMs: number, durationMs: number): number {
  return 1 + TIME_BONUS_MAX * timeRatio(timeRemainingMs, durationMs);
}

/** A wrong answer, or no answer at all, is worth nothing. This is only for winners. */
export function multiplayerScore(input: MultiplayerScoreInput): number {
  const base = multiplayerBaseScore(input.stageIndex, input.wrongGuesses);
  return Math.round(base * timeMultiplier(input.timeRemainingMs, input.durationMs));
}

/** The most this question could still pay out — drives the live "worth 612 now" readout. */
export function potentialMultiplayerScore(input: MultiplayerScoreInput): number {
  return multiplayerScore(input);
}
