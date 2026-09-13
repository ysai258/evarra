import type { Celebrity } from './types.ts';

const SUFFIX_ALIASES: Record<string, string> = {
  junior: 'jr',
  senior: 'sr',
};

/**
 * Collapses the many ways people write a Telugu star's name into one key:
 * "N. T. Rama Rao Jr." / "Jr NTR" / "NTR Jr" all normalise to comparable tokens.
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[._'’`-]/g, ' ')
    .replace(/[^a-z0-9ఀ-౿ ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => SUFFIX_ALIASES[token] ?? token)
    .join(' ');
}

/**
 * Sorted token signature — makes "Jr NTR" and "NTR Jr" the same key without
 * making "Ram Charan" collide with anything unrelated.
 */
export function nameSignature(input: string): string {
  return normalizeName(input).split(' ').filter(Boolean).sort().join(' ');
}

export function matchKeys(celebrity: Pick<Celebrity, 'name' | 'aliases'>): Set<string> {
  const keys = new Set<string>();
  for (const value of [celebrity.name, ...celebrity.aliases]) {
    const normalized = normalizeName(value);
    if (!normalized) continue;
    keys.add(normalized);
    keys.add(nameSignature(value));
  }
  return keys;
}

/** True when a free-text answer refers to this celebrity. */
export function namesMatch(
  guess: string,
  celebrity: Pick<Celebrity, 'name' | 'aliases'>,
): boolean {
  const normalized = normalizeName(guess);
  if (!normalized) return false;
  const keys = matchKeys(celebrity);
  return keys.has(normalized) || keys.has(nameSignature(guess));
}

export type SearchResult = { celebrity: Celebrity; score: number };

/**
 * Ranked autocomplete. Prefers whole-name prefixes, then word-start matches on
 * either the display name or an alias, then loose substrings.
 */
export function searchCelebrities(
  query: string,
  celebrities: readonly Celebrity[],
  limit = 8,
): Celebrity[] {
  const needle = normalizeName(query);
  if (!needle) return [];

  const results: SearchResult[] = [];
  for (const celebrity of celebrities) {
    let best = 0;
    const candidates = [celebrity.name, ...celebrity.aliases];
    for (let i = 0; i < candidates.length; i += 1) {
      const haystack = normalizeName(candidates[i]!);
      if (!haystack) continue;
      const isPrimary = i === 0;
      let score = 0;
      if (haystack === needle) score = 100;
      else if (haystack.startsWith(needle)) score = 80;
      else if (haystack.split(' ').some((word) => word.startsWith(needle))) score = 60;
      else if (haystack.includes(needle)) score = 35;
      else if (needle.split(' ').every((word) => haystack.includes(word))) score = 25;
      if (score > 0) best = Math.max(best, score + (isPrimary ? 8 : 0));
    }
    if (best > 0) results.push({ celebrity, score: best + Math.min(celebrity.popularity, 9) });
  }

  return results
    .sort((a, b) => b.score - a.score || a.celebrity.name.localeCompare(b.celebrity.name))
    .slice(0, limit)
    .map((result) => result.celebrity);
}
