// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cryptoShuffle, selectQuestions } from '../../server/questions.ts';
import { makeCelebrity, makeRoster } from './factories.ts';

describe('question selection', () => {
  const roster = makeRoster(60);

  it('returns as many questions as were asked for', () => {
    for (const count of [1, 5, 10, 20]) {
      expect(selectQuestions(roster, count)).toHaveLength(count);
    }
  });

  /** Spec §18: a face appearing twice in one game reads as a bug. */
  it('never repeats a star inside a game', () => {
    for (let run = 0; run < 50; run += 1) {
      const picked = selectQuestions(roster, 20);
      expect(new Set(picked.map((celebrity) => celebrity.id)).size).toBe(picked.length);
    }
  });

  it('leans easy and closes hard', () => {
    const picked = selectQuestions(roster, 5);
    expect(picked.map((celebrity) => celebrity.difficulty))
      .toEqual(['easy', 'medium', 'easy', 'medium', 'hard']);
  });

  it('skips anyone the dataset marks unplayable', () => {
    const mixed = [
      ...makeRoster(10),
      makeCelebrity({ id: 'retired', name: 'Retired', playable: false }),
    ];
    for (let run = 0; run < 20; run += 1) {
      const picked = selectQuestions(mixed, 10);
      expect(picked.some((celebrity) => celebrity.id === 'retired')).toBe(false);
    }
  });

  it('gives what it can when the roster is thinner than the request', () => {
    const small = makeRoster(4);
    expect(selectQuestions(small, 20)).toHaveLength(4);
  });

  it('copes with a roster missing a whole difficulty', () => {
    const easyOnly = Array.from({ length: 8 }, (_, i) =>
      makeCelebrity({ id: `e-${i}`, difficulty: 'easy' }));
    expect(selectQuestions(easyOnly, 5)).toHaveLength(5);
  });

  it('returns nothing rather than throwing on an empty roster', () => {
    expect(selectQuestions([], 5)).toEqual([]);
  });

  /** Two games in the same room should not replay the same faces. */
  it('picks a different set from one game to the next', () => {
    const runs = Array.from({ length: 12 }, () =>
      selectQuestions(roster, 5).map((celebrity) => celebrity.id).join(','));
    expect(new Set(runs).size).toBeGreaterThan(1);
  });

  it('shuffles without losing or duplicating anything', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = cryptoShuffle(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });
});
