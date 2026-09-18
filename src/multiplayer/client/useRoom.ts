import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ERROR_MESSAGES, type Ack, type ErrorCode, type GuessResultPayload, type JoinedPayload } from '../protocol.ts';
import type { RoomView } from '../types.ts';
import { clearSession, loadSession, rememberName, saveSession } from './session.ts';
import { connect, request, syncClock, type MultiplayerSocket } from './socket.ts';

/**
 * The client's whole relationship with a room.
 *
 * One socket, one view of the room, and a handful of actions. The view is never
 * computed here — it is whatever the server last said it was — which is the client
 * half of the bargain in spec §57: this file renders and sends, and does not decide.
 *
 * The one piece of genuinely local state is `lastGuess`, because a player's own screen
 * has to react the instant they press a name, and what they guessed is nobody else's
 * business until the reveal.
 */

export type Connection = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

export type RoomHandle = {
  connection: Connection;
  room?: RoomView;
  playerId?: string;
  error?: string;
  /** Result of this player's most recent guess on the current question. */
  lastGuess?: GuessResultPayload;
  busy: boolean;
  createRoom(name: string): Promise<boolean>;
  joinRoom(code: string, name: string): Promise<boolean>;
  updateSettings(questionCount: number, questionDurationSeconds: number): Promise<void>;
  startGame(): Promise<void>;
  guess(celebrityId: string): Promise<void>;
  leave(): void;
  dismissError(): void;
};

export function useRoom(): RoomHandle {
  const socketRef = useRef<MultiplayerSocket>(null);
  const [connection, setConnection] = useState<Connection>('idle');
  const [room, setRoom] = useState<RoomView>();
  const [playerId, setPlayerId] = useState<string>();
  const [error, setError] = useState<string>();
  const [lastGuess, setLastGuess] = useState<GuessResultPayload>();
  const [busy, setBusy] = useState(false);

  /**
   * Kept in a ref as well as in state because the reconnect handler runs outside
   * React's render cycle and needs whatever is current, not whatever was captured.
   */
  const identity = useRef<{ code: string; playerId: string; token: string }>(null);

  useEffect(() => {
    const socket = connect();
    socketRef.current = socket;
    setConnection('connecting');

    socket.on('connect', () => {
      setConnection('online');
      void syncClock(socket);
      // A reconnect lands here too, and the server has been holding the seat. Claim it
      // back before the grace period runs out (spec §46).
      const seat = identity.current;
      if (seat) void resumeSeat(socket, seat);
    });
    socket.on('disconnect', () => {
      setConnection((previous) => (previous === 'offline' ? previous : 'reconnecting'));
    });
    // On the Manager, not the socket, so `removeAllListeners` below will not reach it.
    const onReconnectFailed = () => setConnection('offline');
    socket.io.on('reconnect_failed', onReconnectFailed);

    socket.on('room:state', setRoom);
    socket.on('game:question', (question, players) => {
      setLastGuess(undefined);
      setRoom((previous) => (previous
        ? { ...previous, status: 'QUESTION', question, players, reveal: undefined, final: undefined }
        : previous));
    });
    socket.on('game:progress', (players) => {
      setRoom((previous) => (previous ? { ...previous, players } : previous));
    });
    socket.on('game:reveal', (reveal) => {
      setRoom((previous) => (previous
        ? { ...previous, status: 'REVEAL', reveal, question: undefined }
        : previous));
    });
    socket.on('game:final', (final) => {
      setRoom((previous) => (previous
        ? { ...previous, status: 'FINAL_RESULTS', final, question: undefined, reveal: undefined }
        : previous));
    });
    socket.on('game:ended', () => {
      setRoom((previous) => (previous ? { ...previous, status: 'ENDED' } : previous));
    });
    socket.on('room:error', ({ error: code }) => setError(ERROR_MESSAGES[code]));

    return () => {
      socket.io.off('reconnect_failed', onReconnectFailed);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const accept = useCallback((result: Ack<JoinedPayload>, name: string): boolean => {
    if (!result.ok) {
      setError(result.message || ERROR_MESSAGES[result.error]);
      // A seat that no longer exists must not be retried on every reconnect.
      if (result.error === 'ROOM_NOT_FOUND' || result.error === 'NOT_IN_ROOM') {
        identity.current = null;
        clearSession();
      }
      return false;
    }
    const { playerId: id, token, room: view } = result.data;
    identity.current = { code: view.code, playerId: id, token };
    saveSession({ code: view.code, playerId: id, token, name });
    setPlayerId(id);
    setRoom(view);
    setError(undefined);
    return true;
  }, []);

  /** Silently reclaims a seat on reconnect — a failure here is not worth a dialog. */
  const resumeSeat = useCallback(
    async (socket: MultiplayerSocket, seat: { code: string; playerId: string; token: string }) => {
      const result = await request<JoinedPayload>(socket, 'room:resume', seat);
      if (!result.ok) {
        if (result.error === 'ROOM_NOT_FOUND' || result.error === 'NOT_IN_ROOM') {
          identity.current = null;
          clearSession();
          setRoom(undefined);
          setPlayerId(undefined);
        }
        return;
      }
      setPlayerId(result.data.playerId);
      setRoom(result.data.room);
    },
    [],
  );

  /** Reclaims a stored seat on first load, so a refresh returns to the same game. */
  useEffect(() => {
    if (connection !== 'online' || identity.current || room) return;
    const stored = loadSession();
    if (!stored) return;
    identity.current = { code: stored.code, playerId: stored.playerId, token: stored.token };
    const socket = socketRef.current;
    if (socket) void resumeSeat(socket, identity.current);
  }, [connection, room, resumeSeat]);

  const act = useCallback(async <T>(
    run: (socket: MultiplayerSocket) => Promise<Ack<T>>,
  ): Promise<Ack<T> | undefined> => {
    const socket = socketRef.current;
    if (!socket) return undefined;
    setBusy(true);
    try {
      return await run(socket);
    } finally {
      setBusy(false);
    }
  }, []);

  const createRoom = useCallback(async (name: string) => {
    rememberName(name);
    const result = await act<JoinedPayload>(
      (socket) => request(socket, 'room:create', { name }),
    );
    return result ? accept(result, name) : false;
  }, [accept, act]);

  const joinRoom = useCallback(async (code: string, name: string) => {
    rememberName(name);
    const result = await act<JoinedPayload>(
      (socket) => request(socket, 'room:join', { code, name }),
    );
    return result ? accept(result, name) : false;
  }, [accept, act]);

  const updateSettings = useCallback(async (
    questionCount: number,
    questionDurationSeconds: number,
  ) => {
    const result = await act<RoomView>(
      (socket) => request(socket, 'room:settings', { questionCount, questionDurationSeconds }),
    );
    if (result?.ok) setRoom(result.data);
    else if (result) setError(result.message);
  }, [act]);

  const startGame = useCallback(async () => {
    const result = await act<null>((socket) => request(socket, 'game:start'));
    if (result && !result.ok) setError(result.message);
  }, [act]);

  const guess = useCallback(async (celebrityId: string) => {
    const socket = socketRef.current;
    const token = room?.question?.assetToken;
    if (!socket || !token) return;
    const result = await request<GuessResultPayload>(
      socket, 'game:guess', { assetToken: token, celebrityId },
    );
    if (result.ok) setLastGuess(result.data);
    else if (result.error !== 'ALREADY_SOLVED') setError(result.message);
  }, [room?.question?.assetToken]);

  const leave = useCallback(() => {
    const socket = socketRef.current;
    if (socket) void request<null>(socket, 'room:leave');
    identity.current = null;
    clearSession();
    setRoom(undefined);
    setPlayerId(undefined);
    setLastGuess(undefined);
  }, []);

  const dismissError = useCallback(() => setError(undefined), []);

  return useMemo(() => ({
    connection,
    room,
    playerId,
    error,
    lastGuess,
    busy,
    createRoom,
    joinRoom,
    updateSettings,
    startGame,
    guess,
    leave,
    dismissError,
  }), [
    connection, room, playerId, error, lastGuess, busy,
    createRoom, joinRoom, updateSettings, startGame, guess, leave, dismissError,
  ]);
}

/** Narrows an unknown failure to something the UI can say out loud. */
export function describeError(code: ErrorCode): string {
  return ERROR_MESSAGES[code];
}
