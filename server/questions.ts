import type { Celebrity, Difficulty } from '../src/engine/types.ts';

/**
 * Choosing a game's stars.
 *
 * Two rules the daily puzzle does not need. Nobody may appear twice in one game
 * (spec §18) — a repeat inside five questions reads as a bug, not a coincidence. And
 * the run should not be uniformly brutal: a mix that leans easy keeps a room of mixed
 * film knowledge in the game, so roughly half are easy, a third medium and the rest
 * hard (spec §19).
 *
 * They are then ordered to warm up rather than ramp: easy and medium alternate, and
 * the hard ones land at the end, where a room that has found its feet can take them.
 * For the default five questions that produces easy, medium, easy, medium, hard.
 *
 * Unlike the daily schedule this is deliberately *not* deterministic — two games in
 * the same room should not replay the same five faces.
 */
const MIX: ReadonlyArray<readonly [Difficulty, number]> = [
  ['hard', 0.2],
  ['medium', 0.3],
];

export type Shuffle = <T>(items: readonly T[]) => T[];

export function selectQuestions(
  celebrities: readonly Celebrity[],
  count: number,
  shuffle: Shuffle = cryptoShuffle,
): Celebrity[] {
  const pool = celebrities.filter((celebrity) => celebrity.playable);
  const wanted = Math.min(count, pool.length);
  if (wanted <= 0) return [];

  const buckets: Record<Difficulty, Celebrity[]> = {
    easy: shuffle(pool.filter((c) => c.difficulty === 'easy')),
    medium: shuffle(pool.filter((c) => c.difficulty === 'medium')),
    hard: shuffle(pool.filter((c) => c.difficulty === 'hard')),
  };

  const quota: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  let assigned = 0;
  for (const [difficulty, share] of MIX) {
    const take = Math.min(Math.round(wanted * share), buckets[difficulty].length);
    quota[difficulty] = take;
    assigned += take;
  }
  quota.easy = Math.min(wanted - assigned, buckets.easy.length);

  const picked: Record<Difficulty, Celebrity[]> = {
    easy: buckets.easy.splice(0, quota.easy),
    medium: buckets.medium.splice(0, quota.medium),
    hard: buckets.hard.splice(0, quota.hard),
  };

  // A thin roster — or an unusual count — can leave the quotas short. Top up from
  // whatever is left rather than returning fewer questions than the host asked for.
  const chosen = new Set([...picked.easy, ...picked.medium, ...picked.hard].map((c) => c.id));
  const spare = shuffle(pool.filter((celebrity) => !chosen.has(celebrity.id)));
  while (chosen.size < wanted && spare.length > 0) {
    const extra = spare.pop()!;
    picked[extra.difficulty].push(extra);
    chosen.add(extra.id);
  }

  return orderForPlay(picked);
}

/** Easy and medium alternate; the hard ones close the game out. */
function orderForPlay(picked: Record<Difficulty, Celebrity[]>): Celebrity[] {
  const easy = [...picked.easy];
  const medium = [...picked.medium];
  const ordered: Celebrity[] = [];
  while (easy.length > 0 || medium.length > 0) {
    const nextEasy = easy.shift();
    if (nextEasy) ordered.push(nextEasy);
    const nextMedium = medium.shift();
    if (nextMedium) ordered.push(nextMedium);
  }
  return [...ordered, ...picked.hard];
}

/** Fisher-Yates over `crypto`, so a room's questions are not guessable in advance. */
export function cryptoShuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomBelow(index + 1);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

/** Rejection sampling — a plain modulo would bias the low indices. */
function randomBelow(bound: number): number {
  const limit = Math.floor(0xffff_ffff / bound) * bound;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0]!;
  } while (value >= limit);
  return value % bound;
}
