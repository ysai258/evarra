import { describe, expect, it } from 'vitest';
import {
  HINT_PENALTY,
  MIN_WINNING_SCORE,
  baseScoreForStage,
  calculateScore,
  potentialScore,
  rankFor,
} from '../engine/scoring.ts';

describe('scoring', () => {
  it('awards 500/400/300/200/100 for stages 1..5', () => {
    expect([0, 1, 2, 3, 4].map(baseScoreForStage)).toEqual([500, 400, 300, 200, 100]);
  });

  it('rejects a stage outside the reveal ladder', () => {
    expect(() => baseScoreForStage(5)).toThrow(RangeError);
    expect(() => baseScoreForStage(-1)).toThrow(RangeError);
  });

  it('scores zero for a lost game regardless of stage', () => {
    expect(calculateScore({ stageIndex: 0, hintsUsed: 0, won: false })).toBe(0);
  });

  it('subtracts 50 per hint', () => {
    expect(calculateScore({ stageIndex: 1, hintsUsed: 0, won: true })).toBe(400);
    expect(calculateScore({ stageIndex: 1, hintsUsed: 1, won: true })).toBe(400 - HINT_PENALTY);
    expect(calculateScore({ stageIndex: 1, hintsUsed: 2, won: true })).toBe(300);
  });

  it('never drops a win below the 100 point floor', () => {
    expect(calculateScore({ stageIndex: 4, hintsUsed: 5, won: true })).toBe(MIN_WINNING_SCORE);
    expect(calculateScore({ stageIndex: 4, hintsUsed: 0, won: true })).toBe(MIN_WINNING_SCORE);
  });

  it('reports the best score still reachable', () => {
    expect(potentialScore(0, 0)).toBe(500);
    expect(potentialScore(2, 1)).toBe(250);
  });

  it('labels scores playfully across the whole range', () => {
    expect(rankFor(500).label).toBe('UNFAIR');
    expect(rankFor(450).label).toBe('LEGENDARY');
    expect(rankFor(350).label).toBe('STAR SPOTTER');
    expect(rankFor(250).label).toBe('NOT BAD');
    expect(rankFor(100).label).toBe('YOU GOT THERE');
    expect(rankFor(0).label).toContain('WHO EVEN ARE YOU');
  });
});
