import { describe, expect, it } from 'vitest';
import { nextStageAt, stageForElapsed } from '../multiplayer/stage.ts';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';

const THIRTY = 30_000;

describe('elapsed-time blur ladder', () => {
  it('steps once per quarter of the question', () => {
    expect(stageForElapsed(0, THIRTY)).toBe(0);
    expect(stageForElapsed(THIRTY * 0.24, THIRTY)).toBe(0);
    expect(stageForElapsed(THIRTY * 0.25, THIRTY)).toBe(1);
    expect(stageForElapsed(THIRTY * 0.5, THIRTY)).toBe(2);
    expect(stageForElapsed(THIRTY * 0.75, THIRTY)).toBe(3);
  });

  /**
   * The clear photograph lands exactly on the buzzer, which is the point: while anyone
   * can still answer, nobody has seen the face.
   */
  it('only reaches the clear photograph when the question ends', () => {
    expect(stageForElapsed(THIRTY * 0.99, THIRTY)).toBe(MAX_ATTEMPTS - 2);
    expect(stageForElapsed(THIRTY, THIRTY)).toBe(MAX_ATTEMPTS - 1);
  });

  it('holds at maximum blur through the 3-2-1', () => {
    expect(stageForElapsed(-3000, THIRTY)).toBe(0);
  });

  it('never runs off the end of the ladder', () => {
    expect(stageForElapsed(THIRTY * 4, THIRTY)).toBe(MAX_ATTEMPTS - 1);
    expect(stageForElapsed(1000, 0)).toBe(MAX_ATTEMPTS - 1);
  });

  it('says when the next step lands', () => {
    expect(nextStageAt(1000, THIRTY, 0)).toBe(1000 + THIRTY * 0.25);
    expect(nextStageAt(1000, THIRTY, 3)).toBe(1000 + THIRTY);
    expect(nextStageAt(1000, THIRTY, MAX_ATTEMPTS - 1)).toBeUndefined();
  });
});
