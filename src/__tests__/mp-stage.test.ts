import { describe, expect, it } from 'vitest';
import {
  DISSOLVE_COUNT, QUESTION_STAGES, blurPercentAt, maxFetchableStage, revealPosition,
  saturationAt, visibleStages,
} from '../multiplayer/stage.ts';
import { MAX_ATTEMPTS, REVEAL_STAGES } from '../engine/reveal.ts';

const THIRTY = 30_000;
const at = (seconds: number) => revealPosition(seconds * 1000, THIRTY);

describe('the reveal position', () => {
  it('runs from the opening frame to the buzzer', () => {
    expect(at(0)).toBe(0);
    expect(at(30)).toBe(DISSOLVE_COUNT);
  });

  it('moves every moment of the question, not four times', () => {
    const samples = Array.from({ length: 31 }, (_, second) => at(second));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!).toBeGreaterThan(samples[i - 1]!);
    }
  });

  it('holds at maximum blur through the 3-2-1', () => {
    expect(revealPosition(-3000, THIRTY)).toBe(0);
  });

  it('never runs off the end of the ladder', () => {
    expect(at(120)).toBe(DISSOLVE_COUNT);
    expect(revealPosition(1000, 0)).toBe(DISSOLVE_COUNT);
  });
});

describe('what is painted', () => {
  it('shows one settled rung with the next fading over it', () => {
    expect(visibleStages(0)).toEqual({ base: 0, top: 1, topOpacity: 0 });
    expect(visibleStages(0.5)).toEqual({ base: 0, top: 1, topOpacity: 0.5 });
    expect(visibleStages(1)).toEqual({ base: 1, top: 2, topOpacity: 0 });
    expect(visibleStages(2.25)).toEqual({ base: 2, top: 3, topOpacity: 0.25 });
  });

  it('settles on the last question rung at the buzzer', () => {
    const end = visibleStages(DISSOLVE_COUNT);
    expect(end.top).toBe(QUESTION_STAGES - 1);
    expect(end.topOpacity).toBe(1);
  });

  it('clamps a position from a clock that has drifted', () => {
    expect(visibleStages(-5).base).toBe(0);
    expect(visibleStages(99).top).toBe(QUESTION_STAGES - 1);
  });
});

describe('the fetch gate', () => {
  /**
   * The whole point of the dissolve is that the client needs the rung it is fading in,
   * so the gate tracks the top of the blend. What it must never do is reach the clear
   * photograph, or a question could end with the answer already in someone's cache.
   */
  it('never authorises the clear photograph during a question', () => {
    for (let second = 0; second <= 30; second += 0.25) {
      expect(maxFetchableStage(at(second))).toBeLessThan(MAX_ATTEMPTS - 1);
    }
  });

  it('only ever authorises one rung beyond the settled picture', () => {
    for (let second = 0; second <= 30; second += 0.25) {
      const position = at(second);
      const { base } = visibleStages(position);
      expect(maxFetchableStage(position) - base).toBe(1);
    }
  });
});

describe('how blurred it looks', () => {
  it('starts where the daily game starts and eases down', () => {
    expect(blurPercentAt(0)).toBe(REVEAL_STAGES[0]!.blurPercent);
    expect(blurPercentAt(DISSOLVE_COUNT)).toBe(REVEAL_STAGES[QUESTION_STAGES - 1]!.blurPercent);
  });

  it('falls through values the stepped ladder never showed', () => {
    // Half way through the first dissolve: between 92% and 75%, which is the point.
    const midway = blurPercentAt(0.5);
    expect(midway).toBeLessThan(REVEAL_STAGES[0]!.blurPercent);
    expect(midway).toBeGreaterThan(REVEAL_STAGES[1]!.blurPercent);
  });

  it('never gets blurrier as the question runs', () => {
    let previous = Infinity;
    for (let second = 0; second <= 30; second += 0.5) {
      const percent = blurPercentAt(at(second));
      expect(percent).toBeLessThanOrEqual(previous);
      previous = percent;
    }
  });

  it('eases the colour back in alongside the detail', () => {
    expect(saturationAt(0)).toBeCloseTo(REVEAL_STAGES[0]!.saturation);
    expect(saturationAt(0.5)).toBeGreaterThan(REVEAL_STAGES[0]!.saturation);
    expect(saturationAt(DISSOLVE_COUNT))
      .toBeCloseTo(REVEAL_STAGES[QUESTION_STAGES - 1]!.saturation);
  });
});
