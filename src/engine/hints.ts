import type { Celebrity } from './types.ts';

export type Hint = { key: keyof Celebrity['hints']; icon: string; text: string };

/**
 * Hints are read straight from structured dataset fields — never generated at
 * runtime — so the game can never invent a fact about a real person.
 * Order runs from vague to specific.
 */
const HINT_ORDER: ReadonlyArray<{ key: keyof Celebrity['hints']; icon: string }> = [
  { key: 'era', icon: '🎞️' },
  { key: 'origin', icon: '📍' },
  { key: 'director', icon: '🎬' },
  { key: 'film', icon: '🎥' },
  { key: 'signature', icon: '⭐' },
];

/** Only hints the dataset actually has; a celebrity with no birthplace simply gets fewer. */
export function availableHints(celebrity: Celebrity): Hint[] {
  return HINT_ORDER.flatMap(({ key, icon }) => {
    const text = celebrity.hints[key];
    return text ? [{ key, icon, text }] : [];
  });
}

export function revealedHints(celebrity: Celebrity, hintsUsed: readonly number[]): Hint[] {
  const all = availableHints(celebrity);
  return hintsUsed.flatMap((index) => (all[index] ? [all[index]] : []));
}

export function hasMoreHints(celebrity: Celebrity, hintsUsed: readonly number[]): boolean {
  return hintsUsed.length < availableHints(celebrity).length;
}
