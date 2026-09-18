import { describe, expect, it } from 'vitest';
import {
  TIME_BONUS_MAX, WRONG_GUESS_PENALTY, multiplayerBaseScore, multiplayerScore,
  timeMultiplier, timeRatio,
} from '../multiplayer/scoring.ts';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { MAX_SCORE, MIN_WINNING_SCORE, baseScoreForStage } from '../engine/scoring.ts';

const MINUTE = 60_000;

/** A 60-second question, the longest the host can set. */
function score(stageIndex: number, secondsLeft: number, wrongGuesses = 0): number {
  return multiplayerScore({
    stageIndex,
    wrongGuesses,
    timeRemainingMs: secondsLeft * 1000,
    durationMs: MINUTE,
  });
}

describe('multiplayer scoring', () => {
  it('leaves the daily ladder alone when nothing has gone wrong', () => {
    for (let stage = 0; stage < MAX_ATTEMPTS; stage += 1) {
      expect(multiplayerBaseScore(stage, 0)).toBe(baseScoreForStage(stage));
    }
  });

  it('charges a wrong guess exactly one stage', () => {
    expect(multiplayerBaseScore(0, 1)).toBe(MAX_SCORE - WRONG_GUESS_PENALTY);
    expect(multiplayerBaseScore(0, 3)).toBe(MAX_SCORE - 3 * WRONG_GUESS_PENALTY);
  });

  it('never drops a correct answer below the floor, however many misses', () => {
    expect(multiplayerBaseScore(4, 99)).toBe(MIN_WINNING_SCORE);
  });

  /** Spec §84: same stage, earlier answer wins. */
  it('pays more for the same picture recognised sooner', () => {
    expect(score(0, 50)).toBeGreaterThan(score(0, 10));
    expect(score(0, 55)).toBeGreaterThan(score(0, 30));
    expect(score(0, 30)).toBeGreaterThan(score(0, 10));
  });

  /** Spec §84: same moment, blurrier picture wins. */
  it('pays more for a blurrier picture at the same moment', () => {
    const atThirty = [0, 1, 2, 3, 4].map((stage) => score(stage, 30));
    for (let index = 1; index < atThirty.length; index += 1) {
      expect(atThirty[index - 1]!).toBeGreaterThan(atThirty[index]!);
    }
  });

  /**
   * Spec §63 — the constraint the whole formula lives or dies by, stated properly.
   *
   * A stage is not free: reaching stage 1 has already cost a quarter of the clock, so
   * "stage 1 with the full timer left" cannot happen. Once the reachable time window
   * for each stage is accounted for, the score bands turn out not to overlap at all —
   * the worst answer at one stage still beats the best answer at the next.
   *
   * That is the property worth locking down. It means the blur stage decides the
   * ranking and the clock only orders players *within* a stage, which is exactly the
   * bargain the mode is sold on: guessing early is worth more than guessing well-lit.
   */
  it('keeps each stage’s score band clear of the next', () => {
    const steps = MAX_ATTEMPTS - 1;
    // Most time that can remain at this stage: it began at stage/steps of the clock.
    const best = (stage: number) => score(stage, 60 * (1 - stage / steps));
    // Least: a hair before the picture steps again.
    const worst = (stage: number) => score(stage, 60 * (1 - (stage + 1) / steps));

    for (let stage = 0; stage < steps; stage += 1) {
      expect(worst(stage)).toBeGreaterThan(best(stage + 1));
    }
  });

  it('caps the bonus at half again', () => {
    expect(timeMultiplier(MINUTE, MINUTE)).toBe(1 + TIME_BONUS_MAX);
    expect(score(0, 60)).toBe(Math.round(MAX_SCORE * 1.5));
  });

  it('pays no bonus on the buzzer', () => {
    expect(timeMultiplier(0, MINUTE)).toBe(1);
    expect(score(0, 0)).toBe(MAX_SCORE);
  });

  it('clamps a time remaining that makes no sense', () => {
    expect(timeRatio(-5000, MINUTE)).toBe(0);
    expect(timeRatio(MINUTE * 10, MINUTE)).toBe(1);
    expect(timeRatio(1000, 0)).toBe(0);
  });

  it('matches the worked example in the brief', () => {
    // Spec §28: stage 1, 50 of 60 seconds left ≈ 708; 10 seconds left ≈ 542.
    expect(score(0, 50)).toBe(708);
    expect(score(0, 10)).toBe(542);
  });

  it('keeps a miss cheaper than nothing at all', () => {
    // Being wrong hurts, but a correct answer after three misses still beats zero.
    expect(score(0, 40, 3)).toBeGreaterThan(0);
  });
});
