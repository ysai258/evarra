import { readStore, removeStore, writeStore } from '../../engine/storage.ts';
import type { StoredSession } from '../types.ts';

/**
 * The seat, remembered.
 *
 * Refreshing the page must not cost a player their score or spawn a second copy of
 * them in the lobby (spec §47, §77), so the three things needed to reclaim a seat —
 * which room, who they are, and the token that proves it — are kept locally and
 * replayed on the next connection.
 *
 * It rides on the daily game's storage wrapper, which already degrades to memory when
 * localStorage throws. A player in private mode simply cannot survive a refresh, which
 * is a far better failure than a white screen.
 */
const KEY = 'evarra:v1:multiplayer-session';

/** Their name, kept separately so it survives leaving a room and outlives the session. */
const NAME_KEY = 'evarra:v1:multiplayer-name';

export function loadSession(): StoredSession | undefined {
  const stored = readStore<Partial<StoredSession> | null>(KEY, null);
  if (!stored?.code || !stored.playerId || !stored.token) return undefined;
  return {
    code: stored.code,
    playerId: stored.playerId,
    token: stored.token,
    name: stored.name ?? '',
  };
}

export function saveSession(session: StoredSession): void {
  writeStore(KEY, session);
  if (session.name) writeStore(NAME_KEY, session.name);
}

export function clearSession(): void {
  removeStore(KEY);
}

/** Pre-fills the name box, so joining a friend's second room is one tap. */
export function rememberedName(): string {
  return readStore<string>(NAME_KEY, '');
}

export function rememberName(name: string): void {
  writeStore(NAME_KEY, name);
}
