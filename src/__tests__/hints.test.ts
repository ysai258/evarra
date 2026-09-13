import { describe, expect, it } from 'vitest';
import { availableHints, hasMoreHints, revealedHints } from '../engine/hints.ts';
import { makeCelebrity } from './factories.ts';

const complete = makeCelebrity({
  hints: {
    era: 'A Telugu actor working from the 2000s through to 2024.',
    origin: 'They come from a film family — a sibling is in Telugu cinema too.',
    director: 'They have worked with director S. S. Rajamouli.',
    film: 'They were in Mirchi (2013).',
    signature: 'They are best known for Baahubali: The Beginning (2015).',
  },
});

const sparse = makeCelebrity({ hints: { era: 'A Telugu actress whose films start in the 1990s.' } });

describe('hints', () => {
  it('offers hints from vague to specific', () => {
    expect(availableHints(complete).map((hint) => hint.key)).toEqual([
      'era', 'origin', 'director', 'film', 'signature',
    ]);
  });

  it('offers only the hints the dataset actually has', () => {
    expect(availableHints(sparse)).toHaveLength(1);
    expect(hasMoreHints(sparse, [0])).toBe(false);
  });

  it('resolves the revealed indices in order', () => {
    expect(revealedHints(complete, [0, 1]).map((hint) => hint.key)).toEqual(['era', 'origin']);
  });

  it('ignores an index that no longer exists', () => {
    expect(revealedHints(sparse, [0, 3])).toHaveLength(1);
  });
});
