import { MAX_ATTEMPTS } from './reveal.ts';

export const MAX_SCORE = 500;
/** Floor for a correct answer: the worst win — last stage, every clue — scores this. */
export const MIN_WINNING_SCORE = 100;

/**
 * What a wrong guess and a revealed clue each cost.
 *
 * These look unround, and the reason is the point: every combination of stage and
 * clues has to produce a different score. The obvious scheme — 100 a stage, 50 a clue
 * — collapses badly. A clue costs exactly half a stage, so guess 1 with two clues ties
 * guess 2 with none; and the 100-point floor flattens everything below it. Together
 * that left **9 distinct scores across the 30 possible paths**, with every ending from
 * guess 5 scoring the same 100 no matter how much help was taken.
 *
 * Keeping the range 100–500 and requiring all 30 paths to differ pins these values:
 * 4 × STAGE + 5 × CLUE must equal 400 so the worst win lands exactly on the floor, and
 * 5 × CLUE must stay under STAGE so a full set of clues can never cost as much as a
 * wrong guess — otherwise the bands overlap and collide again. Of the three integer
 * solutions, this one gives clues the most weight they can carry.
 */
export const STAGE_PENALTY = 85;
export const HINT_PENALTY = 12;
export const MAX_HINTS = 5;

/** 500 / 415 / 330 / 245 / 160 for a clue-free win at stages 1..5. */
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
  // The arithmetic already bottoms out at exactly MIN_WINNING_SCORE; this only guards
  // against a stored game with more clues than the dataset now offers.
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
  if (score >= 440) return { label: 'LEGENDARY', blurb: 'Recognised through the fog.' };
  if (score >= 355) return { label: 'STAR SPOTTER', blurb: 'Sharp eyes. Proper fan.' };
  if (score >= 270) return { label: 'NOT BAD', blurb: 'You got there in good time.' };
  if (score >= 185) return { label: 'CUTTING IT FINE', blurb: 'Close one, but you had it.' };
  if (score >= MIN_WINNING_SCORE) return { label: 'YOU GOT THERE', blurb: 'Late, but you made it.' };
  return { label: 'WHO EVEN ARE YOU? 😭', blurb: 'Tomorrow is another star.' };
}
