import { MAX_ATTEMPTS } from './reveal.ts';

export const MAX_SCORE = 500;
/** Floor for a correct answer, even on the last stage with every hint burned. */
export const MIN_WINNING_SCORE = 100;
export const HINT_PENALTY = 50;
export const MAX_HINTS = 5;

/** 500 / 400 / 300 / 200 / 100 for stages 1..5. */
export function baseScoreForStage(stageIndex: number): number {
  if (stageIndex < 0 || stageIndex >= MAX_ATTEMPTS) {
    throw new RangeError(`stageIndex out of range: ${stageIndex}`);
  }
  return MAX_SCORE - stageIndex * 100;
}

export function calculateScore(params: {
  stageIndex: number;
  hintsUsed: number;
  won: boolean;
}): number {
  if (!params.won) return 0;
  const base = baseScoreForStage(params.stageIndex);
  const penalised = base - params.hintsUsed * HINT_PENALTY;
  return Math.max(MIN_WINNING_SCORE, penalised);
}

/** The best score still reachable — drives the live "max 450" readout. */
export function potentialScore(stageIndex: number, hintsUsed: number): number {
  return calculateScore({ stageIndex, hintsUsed, won: true });
}

export type ScoreRank = { label: string; blurb: string };

export function rankFor(score: number): ScoreRank {
  if (score >= 500) return { label: 'UNFAIR', blurb: 'You did not even look. You just knew.' };
  if (score >= 450) return { label: 'LEGENDARY', blurb: 'Recognised through the fog.' };
  if (score >= 350) return { label: 'STAR SPOTTER', blurb: 'Sharp eyes. Proper fan.' };
  if (score >= 250) return { label: 'NOT BAD', blurb: 'You got there in good time.' };
  if (score >= 100) return { label: 'YOU GOT THERE', blurb: 'Late, but you made it.' };
  return { label: 'WHO EVEN ARE YOU? 😭', blurb: 'Tomorrow is another star.' };
}
