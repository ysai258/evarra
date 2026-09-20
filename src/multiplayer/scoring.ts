import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { baseScoreForStage } from '../engine/scoring.ts';

/**
 * Multiplayer scoring — the daily game's ladder with a clock on top.
 *
 * The base is the existing ladder, unchanged: 500 at full blur down to 180 once the
 * photo is nearly clear. A time bonus of up to +50% then rewards recognising the face
 * quickly, and nothing else moves the number.
 *
 * The cap is load-bearing, and it is worth saying why +50% rather than a round number.
 * A stage is never free: reaching stage 1 has already cost a quarter of the clock, so
 * the time still available at a given stage is bounded by that stage. Work the bands
 * out under that bound and they do not overlap — the worst possible answer at one stage
 * still outscores the best possible answer at the next.
 *
 * So the blur stage decides the ranking and the clock only orders players within a
 * stage. That is the bargain the mode is sold on (spec §63), and `mp-scoring.test.ts`
 * holds it to it; raising the cap much past 0.5 would quietly break it.
 *
 * **Wrong guesses cost nothing.** You may name as many stars as you can type until the
 * buzzer, and only the right one is scored. That is a deliberate choice for a game
 * between friends — the alternative charged a miss the same 80 points it costs in the
 * daily game, which made an early stab a real gamble but also made the mode feel
 * punishing. The trade is honest and worth knowing: with misses free, the strongest
 * play is to start firing names the moment the countdown ends, because there is no
 * reason not to. The roster is large enough that this is a poor use of thirty seconds,
 * and the per-connection rate limit keeps a script from turning it into a certainty,
 * but nothing here pretends it is impossible.
 */
export const TIME_BONUS_MAX = 0.5;

export type MultiplayerScoreInput = {
  /** Blur stage on screen when the correct guess landed. */
  stageIndex: number;
  /** Server clock: how much of the question was still left. Clamped into range. */
  timeRemainingMs: number;
  durationMs: number;
};

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
  const stage = Math.min(Math.max(Math.trunc(input.stageIndex), 0), MAX_ATTEMPTS - 1);
  const base = baseScoreForStage(stage);
  return Math.round(base * timeMultiplier(input.timeRemainingMs, input.durationMs));
}
