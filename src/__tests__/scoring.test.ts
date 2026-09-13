import { describe, expect, it } from 'vitest';
import {
  HINT_PENALTY,
  MAX_HINTS,
  MAX_SCORE,
  MIN_WINNING_SCORE,
  STAGE_PENALTY,
  baseScoreForStage,
  calculateScore,
  potentialScore,
  rankFor,
} from '../engine/scoring.ts';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';

const everyPath = Array.from({ length: MAX_ATTEMPTS }, (_, stageIndex) =>
  Array.from({ length: MAX_HINTS + 1 }, (_, hintsUsed) => ({ stageIndex, hintsUsed })))
  .flat();

describe('scoring', () => {
  it('awards the full 500 only for a clue-free first guess', () => {
    expect(calculateScore({ stageIndex: 0, hintsUsed: 0, won: true })).toBe(MAX_SCORE);
  });

  it('steps down by one stage per wrong guess', () => {
    expect([0, 1, 2, 3, 4].map(baseScoreForStage)).toEqual([500, 420, 340, 260, 180]);
  });

  it('rejects a stage outside the reveal ladder', () => {
    expect(() => baseScoreForStage(MAX_ATTEMPTS)).toThrow(RangeError);
    expect(() => baseScoreForStage(-1)).toThrow(RangeError);
  });

  it('scores zero for a lost game regardless of stage', () => {
    expect(calculateScore({ stageIndex: 0, hintsUsed: 0, won: false })).toBe(0);
    expect(calculateScore({ stageIndex: 4, hintsUsed: 5, won: false })).toBe(0);
  });

  it('subtracts the clue penalty per clue', () => {
    expect(calculateScore({ stageIndex: 1, hintsUsed: 0, won: true })).toBe(420);
    expect(calculateScore({ stageIndex: 1, hintsUsed: 1, won: true })).toBe(420 - HINT_PENALTY);
    expect(calculateScore({ stageIndex: 1, hintsUsed: 3, won: true })).toBe(420 - 3 * HINT_PENALTY);
  });

  /**
   * The reason the numbers are what they are. The old scheme — 100 a stage, 50 a clue,
   * floored at 100 — produced just 9 distinct scores across these 30 paths, and every
   * win on the last guess scored 100 however much help was taken.
   */
  it('gives every stage-and-clue combination its own score', () => {
    const scores = everyPath.map((path) => calculateScore({ ...path, won: true }));
    expect(new Set(scores).size).toBe(everyPath.length);
  });

  it('never scores a win below the floor or above the maximum', () => {
    for (const path of everyPath) {
      const score = calculateScore({ ...path, won: true });
      expect(score).toBeGreaterThanOrEqual(MIN_WINNING_SCORE);
      expect(score).toBeLessThanOrEqual(MAX_SCORE);
    }
  });

  it('lands the worst possible win just above the floor, never on it by clamping', () => {
    const worst = calculateScore({
      stageIndex: MAX_ATTEMPTS - 1, hintsUsed: MAX_HINTS, won: true,
    });
    expect(worst).toBe(105);
    expect(worst).toBeGreaterThan(MIN_WINNING_SCORE);
  });

  // Scores ending in odd digits read like a rounding error rather than a result.
  it('ends every score in a five or a zero', () => {
    for (const path of everyPath) {
      expect(calculateScore({ ...path, won: true }) % 5, JSON.stringify(path)).toBe(0);
    }
    expect(MAX_SCORE % 5).toBe(0);
  });

  it('always pays more for guessing earlier, whatever the clues', () => {
    for (let stage = 0; stage < MAX_ATTEMPTS - 1; stage += 1) {
      for (let hints = 0; hints <= MAX_HINTS; hints += 1) {
        expect(calculateScore({ stageIndex: stage, hintsUsed: hints, won: true }))
          .toBeGreaterThan(calculateScore({ stageIndex: stage + 1, hintsUsed: hints, won: true }));
      }
    }
  });

  it('always pays more for using fewer clues, whatever the stage', () => {
    for (let stage = 0; stage < MAX_ATTEMPTS; stage += 1) {
      for (let hints = 0; hints < MAX_HINTS; hints += 1) {
        expect(calculateScore({ stageIndex: stage, hintsUsed: hints, won: true }))
          .toBeGreaterThan(calculateScore({ stageIndex: stage, hintsUsed: hints + 1, won: true }));
      }
    }
  });

  it('keeps a full set of clues cheaper than a single wrong guess', () => {
    expect(MAX_HINTS * HINT_PENALTY).toBeLessThan(STAGE_PENALTY);
  });

  it('reports the best score still reachable', () => {
    expect(potentialScore(0, 0)).toBe(MAX_SCORE);
    expect(potentialScore(2, 1)).toBe(340 - HINT_PENALTY);
  });

  it('gives each stage its own rank label at a clue-free win', () => {
    const labels = [0, 1, 2, 3, 4].map((stage) => rankFor(baseScoreForStage(stage)).label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[0]).toBe('UNFAIR');
  });

  it('labels the whole range, losses included', () => {
    expect(rankFor(MAX_SCORE).label).toBe('UNFAIR');
    expect(rankFor(425).label).toBe('LEGENDARY');
    expect(rankFor(345).label).toBe('STAR SPOTTER');
    expect(rankFor(265).label).toBe('NOT BAD');
    expect(rankFor(185).label).toBe('CUTTING IT FINE');
    expect(rankFor(105).label).toBe('YOU GOT THERE');
    expect(rankFor(0).label).toContain('WHO EVEN ARE YOU');
  });
});
