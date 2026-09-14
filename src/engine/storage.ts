/**
 * localStorage wrapper that degrades to an in-memory store. Safari private mode
 * and "block all cookies" both throw on access, and a guessing game should not
 * white-screen because of that.
 */
const memory = new Map<string, string>();

function backend(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  try {
    const probe = '__evaru_ra_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = backend().getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: unknown): void {
  try {
    backend().setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — the game still plays, it just won't persist */
  }
}

export function removeStore(key: string): void {
  try {
    backend().removeItem(key);
  } catch {
    /* ignore */
  }
}

export const STORAGE_KEYS = {
  /**
   * Every day the player has touched, keyed by puzzle date. Versioned: a stored day
   * records which star it was, so when the roster or schedule changes the old record
   * would pin a player to a puzzle that no longer exists. Bumping the key starts
   * everyone fresh instead.
   */
  games: 'evarra:v3:games',
  seenHowToPlay: 'evaru-ra:seen-how-to-play',
} as const;

/** Progress written under earlier schedules; removed on load, never read. */
export const RETIRED_STORAGE_KEYS = ['evaru-ra:game', 'evaru-ra:games', 'evarra:v2:games'] as const;
