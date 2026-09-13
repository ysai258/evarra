import { MAX_ATTEMPTS } from './reveal.ts';

export const MAX_SCORE = 500;
/** No win ever scores below this. The worst path lands on 105, just above it. */
export const MIN_WINNING_SCORE = 100;

/**
 * What a wrong guess and a revealed clue each cost.
 *
 * Every one of the 30 stage-and-clue combinations has to score differently, and every
 * score has to end in a 0 or a 5. The obvious scheme — 100 a stage, 50 a clue —
 * satisfies the second and fails the first badly: a clue costs exactly half a stage,
 * so guess 1 with two clues ties guess 2 with none, and the floor flattens everything
 * beneath it, leaving **9 distinct scores across the 30 paths**.
 *
 * Three constraints then pin these two numbers almost completely. Both steps must be
 * multiples of five, or the scores are not. Five clues must cost less than one wrong
 * guess, or the per-guess bands overlap and collide again. And the lowest win must
 * stay at or above MIN_WINNING_SCORE. Searching that space, 80 and 15 is the only
 * pairing where a clue costs as much as 15 — every other valid option makes clues
 * cheaper, and none can land the lowest win exactly on 100 without colliding.
 */
export const STAGE_PENALTY = 80;
export const HINT_PENALTY = 15;
export const MAX_HINTS = 5;

/** 500 / 420 / 340 / 260 / 180 for a clue-free win at stages 1..5. */
export function baseScoreForStage(stageIndex: number): number {
  if (stageIndex < 0 || stageIndex >= MAX_ATTEMPTS) {
    throw new RangeError(`stageIndex out of range: ${stageIndex}`);
  }
  return MAX_SCORE - stageIndex * STAGE_PENALTY;
}

export function calculateScore(params: {
  stageIndex: number;
  hintsUsed: number;
  won: boolean;
}): number {
  if (!params.won) return 0;
  const penalised = baseScoreForStage(params.stageIndex) - params.hintsUsed * HINT_PENALTY;
  // The arithmetic bottoms out at 105; this only guards against a stored game holding
  // more clues than the dataset now offers.
  return Math.max(MIN_WINNING_SCORE, penalised);
}

/** The best score still reachable — drives the live "worth 415 now" readout. */
export function potentialScore(stageIndex: number, hintsUsed: number): number {
  return calculateScore({ stageIndex, hintsUsed, won: true });
}

export type ScoreRank = { label: string; blurb: string };

/** One band per stage, so the label tells you how early you got there. */
export function rankFor(score: number): ScoreRank {
  if (score >= MAX_SCORE) return { label: 'UNFAIR', blurb: 'You did not even look. You just knew.' };
  if (score >= 425) return { label: 'LEGENDARY', blurb: 'Recognised through the fog.' };
  if (score >= 345) return { label: 'STAR SPOTTER', blurb: 'Sharp eyes. Proper fan.' };
  if (score >= 265) return { label: 'NOT BAD', blurb: 'You got there in good time.' };
  if (score >= 185) return { label: 'CUTTING IT FINE', blurb: 'Close one, but you had it.' };
  if (score >= MIN_WINNING_SCORE) return { label: 'YOU GOT THERE', blurb: 'Late, but you made it.' };
  return { label: 'WHO EVEN ARE YOU? 😭', blurb: 'Tomorrow is another star.' };
}
