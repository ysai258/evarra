import { describe, expect, it } from 'vitest';
import { nameSignature, namesMatch, normalizeName, searchCelebrities } from '../engine/normalize.ts';
import { makeCelebrity } from './factories.ts';

describe('name normalization', () => {
  it('strips punctuation, case and diacritics', () => {
    expect(normalizeName('N. T. Rama Rao Jr.')).toBe('n t rama rao jr');
    expect(normalizeName('  Allu   ARJUN ')).toBe('allu arjun');
    expect(normalizeName('Chiranjeevi')).toBe(normalizeName('chiranjeevi'));
  });

  it('folds Junior/Senior onto their short forms', () => {
    expect(normalizeName('Junior NTR')).toBe('jr ntr');
  });

  it('treats word order as irrelevant in the signature', () => {
    expect(nameSignature('Jr NTR')).toBe(nameSignature('NTR Jr.'));
  });
});

describe('namesMatch', () => {
  const ntr = makeCelebrity({
    id: 'jr-ntr',
    name: 'N. T. Rama Rao Jr.',
    aliases: ['NTR', 'Jr NTR', 'Jr. NTR', 'Junior NTR', 'Tarak'],
  });

  it.each(['NTR', 'Jr NTR', 'Jr. NTR', 'jr ntr', 'NTR Jr', 'Junior NTR', 'N. T. Rama Rao Jr.'])(
    'maps %s to the same entity',
    (guess) => {
      expect(namesMatch(guess, ntr)).toBe(true);
    },
  );

  it('does not match a different star', () => {
    expect(namesMatch('Mahesh Babu', ntr)).toBe(false);
  });

  it('rejects an empty guess', () => {
    expect(namesMatch('   ', ntr)).toBe(false);
  });
});

describe('searchCelebrities', () => {
  const list = [
    makeCelebrity({ id: 'mahesh-babu', name: 'Mahesh Babu', popularity: 9 }),
    makeCelebrity({ id: 'prabhas', name: 'Prabhas', popularity: 9 }),
    makeCelebrity({ id: 'jr-ntr', name: 'N. T. Rama Rao Jr.', aliases: ['Jr NTR'], popularity: 9 }),
  ];

  it('returns nothing for an empty query', () => {
    expect(searchCelebrities('  ', list)).toEqual([]);
  });

  it('matches on a name prefix', () => {
    expect(searchCelebrities('mah', list)[0]?.id).toBe('mahesh-babu');
  });

  it('matches on an alias', () => {
    expect(searchCelebrities('jr n', list)[0]?.id).toBe('jr-ntr');
  });

  it('matches a middle word', () => {
    expect(searchCelebrities('babu', list)[0]?.id).toBe('mahesh-babu');
  });

  it('respects the result limit', () => {
    expect(searchCelebrities('a', list, 2).length).toBeLessThanOrEqual(2);
  });
});
