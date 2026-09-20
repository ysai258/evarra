import { describe, expect, it } from 'vitest';
import {
  MAX_QUESTION_SCORE, MIN_QUESTION_SCORE, TIME_BONUS_MAX, multiplayerScore,
  questionProgress, timeMultiplier,
} from '../multiplayer/scoring.ts';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { MAX_SCORE, baseScoreForStage } from '../engine/scoring.ts';

const MINUTE = 60_000;

/** A 60-second question, the longest the host can set. */
const score = (secondsIn: number) =>
  multiplayerScore({ elapsedMs: secondsIn * 1000, durationMs: MINUTE });

describe('multiplayer scoring', () => {
  it('opens at the daily maximum plus the full time bonus', () => {
    expect(score(0)).toBe(Math.round(MAX_SCORE * (1 + TIME_BONUS_MAX)));
    expect(score(0)).toBe(MAX_QUESTION_SCORE);
  });

  it('lands on the daily ladder’s last rung at the buzzer', () => {
    expect(score(60)).toBe(MIN_QUESTION_SCORE);
    expect(MIN_QUESTION_SCORE).toBe(baseScoreForStage(MAX_ATTEMPTS - 1));
  });

  /**
   * The invariant, and the reason the continuous curve is simpler than the stepped one
   * it replaced. That version needed an argument about five score bands not
   * overlapping; this one only has to be falling, and it is checked everywhere rather
   * than at five points.
   */
  it('pays strictly less for every moment you wait', () => {
    let previous = Infinity;
    for (let tenth = 0; tenth <= 600; tenth += 1) {
      const points = score(tenth / 10);
      expect(points).toBeLessThanOrEqual(previous);
      previous = points;
    }
    // And meaningfully so, not just technically: no long flat stretches.
    for (let second = 0; second < 60; second += 5) {
      expect(score(second)).toBeGreaterThan(score(second + 5));
    }
  });

  it('rewards the opening seconds most, where the picture gives least away', () => {
    const firstQuarter = score(0) - score(15);
    const lastQuarter = score(45) - score(60);
    expect(firstQuarter).toBeGreaterThan(lastQuarter);
  });

  it('scales with the question length rather than the wall clock', () => {
    // Half way through is half way through, whether that is 15 seconds or 30.
    const short = multiplayerScore({ elapsedMs: 15_000, durationMs: 30_000 });
    const long = multiplayerScore({ elapsedMs: 30_000, durationMs: MINUTE });
    expect(short).toBe(long);
  });

  it('clamps a progress that makes no sense', () => {
    expect(questionProgress(-5000, MINUTE)).toBe(0);
    expect(questionProgress(MINUTE * 10, MINUTE)).toBe(1);
    expect(questionProgress(1000, 0)).toBe(1);
    expect(score(-10)).toBe(MAX_QUESTION_SCORE);
    expect(score(600)).toBe(MIN_QUESTION_SCORE);
  });

  it('pays the full bonus at the start and none at the buzzer', () => {
    expect(timeMultiplier(0, MINUTE)).toBe(1 + TIME_BONUS_MAX);
    expect(timeMultiplier(MINUTE, MINUTE)).toBe(1);
  });
});
