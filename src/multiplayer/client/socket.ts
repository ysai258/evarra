import { io, type Socket } from 'socket.io-client';
import { ERROR_MESSAGES, type Ack, type ClientEvents, type ServerEvents } from '../protocol.ts';

/**
 * The connection, and the shared clock that rides on it.
 *
 * Every deadline the game cares about — when a question starts, when it ends, when the
 * reveal is over — arrives as a server timestamp. That is the only way a room can agree
 * on a countdown (spec §21): a client that ran its own `setInterval` would drift, and a
 * client whose device clock is ten minutes fast would see a question that ended before
 * it began.
 *
 * So the client measures its own error instead. It asks the server for the time a few
 * times, assumes the reply is delayed by half the round trip, and keeps the **median**
 * of the samples — a median rather than a mean because one packet stuck behind a slow
 * hop would drag an average badly, while it barely moves a median.
 */
export type MultiplayerSocket = Socket<ServerEvents, ClientEvents>;

const SYNC_SAMPLES = 5;

let offsetMs = 0;
let synced = false;

/** Server time, as well as this device can tell. Every countdown is measured against it. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

export function isClockSynced(): boolean {
  return synced;
}

/**
 * Where the room server lives.
 *
 * The daily game is static files and can be served from anywhere; the room server is a
 * process and has to be somewhere specific, so the two are almost never the same
 * origin. Unset in a production build means multiplayer is simply not available, and
 * the UI says so rather than hanging on a connection that will never open.
 */
export function multiplayerServerUrl(): string | undefined {
  const configured = import.meta.env.VITE_MULTIPLAYER_URL;
  if (configured) return configured.replace(/\/$/, '');
  return import.meta.env.DEV ? 'http://localhost:8787' : undefined;
}

export function isMultiplayerConfigured(): boolean {
  return multiplayerServerUrl() !== undefined;
}

export function connect(): MultiplayerSocket {
  const url = multiplayerServerUrl();
  if (!url) throw new Error('Multiplayer server URL is not configured.');
  return io(url, {
    transports: ['websocket', 'polling'],
    // Socket.IO's own backoff, kept short: the room is holding this player's seat for
    // 30 seconds and there is no point being polite about it.
    reconnectionDelay: 400,
    reconnectionDelayMax: 3000,
    timeout: 8000,
    /**
     * A connection of our own rather than a shared one.
     *
     * Socket.IO caches a Manager per URL and reuses it. React's StrictMode mounts an
     * effect, tears it down and mounts it again, so the second connection would pick
     * up the Manager the first one had just closed — which fails deep inside the
     * client with an error that says nothing about any of this. Owning the Manager
     * makes the teardown complete and the remount clean.
     */
    forceNew: true,
  }) as MultiplayerSocket;
}

export async function syncClock(socket: MultiplayerSocket): Promise<void> {
  const offsets: number[] = [];
  for (let sample = 0; sample < SYNC_SAMPLES; sample += 1) {
    const offset = await sampleOffset(socket);
    if (offset !== undefined) offsets.push(offset);
  }
  if (offsets.length === 0) return;
  offsets.sort((a, b) => a - b);
  offsetMs = offsets[Math.floor(offsets.length / 2)]!;
  synced = true;
}

function sampleOffset(socket: MultiplayerSocket): Promise<number | undefined> {
  return new Promise((resolve) => {
    const sentAt = Date.now();
    const timer = window.setTimeout(() => resolve(undefined), 2000);
    socket.emit('time:sync', sentAt, (serverTime: number) => {
      window.clearTimeout(timer);
      const roundTrip = Date.now() - sentAt;
      // The reply was stamped roughly half a round trip ago.
      resolve(serverTime + roundTrip / 2 - Date.now());
    });
  });
}

/**
 * Promise wrapper around an acknowledged emit.
 *
 * Every room action is a request with an answer, so awaiting one reads better than
 * pairing an emit with a listener. A connection that dies mid-request resolves as a
 * server error rather than hanging forever on a promise nobody will settle.
 */
export function request<T>(
  socket: MultiplayerSocket,
  event: keyof ClientEvents,
  payload?: unknown,
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    // Bound, not detached: `emit` reads the manager off `this`, so calling a plain
    // reference to it throws somewhere deep inside the client.
    const emit = socket.emit.bind(socket) as (name: string, ...rest: unknown[]) => void;
    const settle = (result: Ack<T>) => {
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(
      () => resolve({ ok: false, error: 'SERVER_ERROR', message: ERROR_MESSAGES.SERVER_ERROR }),
      10_000,
    );
    if (payload === undefined) emit(event, settle);
    else emit(event, payload, settle);
  });
}
