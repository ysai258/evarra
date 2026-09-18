import type { Server, Socket } from 'socket.io';
import { ERROR_MESSAGES, type Ack, type ClientEvents, type ErrorCode, type JoinedPayload, type ServerEvents } from '../src/multiplayer/protocol.ts';
import type { Celebrity } from '../src/engine/types.ts';
import { RateLimiter, type LimitName } from './rate-limit.ts';
import { RoomManager, systemClock, type Clock, type RoomEvents, type ServerPlayer, type ServerRoom } from './room-manager.ts';

/**
 * The socket layer.
 *
 * Its whole job is translation: turn a socket message into a call on the RoomManager,
 * and turn the manager's announcements back into emits. No game rule lives here — if a
 * decision is being made in this file, it belongs one layer down.
 */

export type SocketData = { playerId?: string };

export type TypedServer = Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>;
export type TypedSocket = Socket<ClientEvents, ServerEvents, Record<string, never>, SocketData>;

export function createRoomManager(
  io: TypedServer,
  roster: readonly Celebrity[],
  clock: Clock = systemClock,
): RoomManager {
  /** player id -> socket id, so the manager can address one person without knowing about sockets. */
  const sockets = new Map<string, string>();

  const events: RoomEvents = {
    toRoom: (code, event, ...args) => {
      io.to(code).emit(event, ...args);
    },
    toPlayer: (playerId, event, ...args) => {
      const socketId = sockets.get(playerId);
      if (socketId) io.to(socketId).emit(event, ...args);
    },
  };

  const manager = new RoomManager(roster, events, clock);
  managerSockets.set(manager, sockets);
  return manager;
}

/** Side table rather than a field, so RoomManager stays free of transport concerns. */
const managerSockets = new WeakMap<RoomManager, Map<string, string>>();

export function registerHandlers(
  io: TypedServer,
  manager: RoomManager,
  limiter: RateLimiter = new RateLimiter(),
  /** The same clock the manager runs on, so a synced client agrees with its deadlines. */
  now: () => number = Date.now,
): void {
  const sockets = managerSockets.get(manager);
  if (!sockets) {
    throw new Error('registerHandlers needs a manager built by createRoomManager.');
  }

  io.on('connection', (socket: TypedSocket) => {
    /**
     * Clock synchronisation (spec §22). The client times the round trip and takes the
     * server's own `Date.now()` from the middle of it; every timestamp the game sends
     * is then meaningful on a device whose clock is minutes out.
     */
    socket.on('time:sync', (_clientSentAt, ack) => {
      if (typeof ack === 'function') ack(now());
    });

    socket.on('room:create', (request, ack) => {
      if (!allow(socket, limiter, 'create', ack)) return;
      const result = manager.createRoom(request?.name ?? '');
      if (!result.ok) return reply(ack, result.error);
      seat(socket, sockets, manager, result.value.room, result.value.player);
      reply(ack, undefined, joined(manager, result.value.room, result.value.player));
    });

    socket.on('room:join', (request, ack) => {
      if (!allow(socket, limiter, 'join', ack)) return;
      const result = manager.joinRoom(request?.code ?? '', request?.name ?? '');
      if (!result.ok) return reply(ack, result.error);
      seat(socket, sockets, manager, result.value.room, result.value.player);
      reply(ack, undefined, joined(manager, result.value.room, result.value.player));
    });

    socket.on('room:resume', (request, ack) => {
      if (!allow(socket, limiter, 'join', ack)) return;
      const result = manager.resume(
        request?.code ?? '', request?.playerId ?? '', request?.token ?? '',
      );
      if (!result.ok) return reply(ack, result.error);
      seat(socket, sockets, manager, result.value.room, result.value.player);
      reply(ack, undefined, joined(manager, result.value.room, result.value.player));
    });

    socket.on('room:settings', (request, ack) => {
      if (!allow(socket, limiter, 'settings', ack)) return;
      const playerId = socket.data.playerId;
      if (!playerId) return reply(ack, 'NOT_IN_ROOM');
      const result = manager.updateSettings(playerId, {
        questionCount: Number(request?.questionCount),
        questionDurationSeconds: Number(request?.questionDurationSeconds),
      });
      if (!result.ok) return reply(ack, result.error);
      reply(ack, undefined, manager.view(result.value, playerId));
    });

    socket.on('game:start', (ack) => {
      const playerId = socket.data.playerId;
      if (!playerId) return reply(ack, 'NOT_IN_ROOM');
      const result = manager.startGame(playerId);
      if (!result.ok) return reply(ack, result.error);
      reply(ack, undefined, null);
    });

    socket.on('game:guess', (request, ack) => {
      if (!allow(socket, limiter, 'guess', ack)) return;
      const playerId = socket.data.playerId;
      if (!playerId) return reply(ack, 'NOT_IN_ROOM');
      const result = manager.submitGuess(
        playerId, String(request?.assetToken ?? ''), String(request?.celebrityId ?? ''),
      );
      if (!result.ok) return reply(ack, result.error);
      reply(ack, undefined, {
        correct: result.value.correct,
        celebrityId: String(request?.celebrityId ?? ''),
        wrongGuesses: result.value.wrongGuesses,
        ...(result.value.score !== undefined ? { score: result.value.score } : {}),
      });
    });

    socket.on('room:leave', (ack) => {
      const playerId = socket.data.playerId;
      if (playerId) {
        manager.leaveRoom(playerId);
        sockets.delete(playerId);
        delete socket.data.playerId;
      }
      reply(ack, undefined, null);
    });

    socket.on('disconnect', () => {
      const playerId = socket.data.playerId;
      limiter.forget(socket.id);
      if (!playerId) return;
      // A second tab, or a reconnect that has already been seated, owns the mapping
      // now — leaving it alone keeps this stale socket from evicting the live one.
      if (sockets.get(playerId) !== socket.id) return;
      sockets.delete(playerId);
      manager.handleDisconnect(playerId);
    });
  });
}

function seat(
  socket: TypedSocket,
  sockets: Map<string, string>,
  manager: RoomManager,
  room: ServerRoom,
  player: ServerPlayer,
): void {
  socket.data.playerId = player.id;
  sockets.set(player.id, socket.id);
  void socket.join(room.code);
  // Their own state goes back in the acknowledgement; this is for everyone else.
  manager.broadcastState(room);
}

function joined(manager: RoomManager, room: ServerRoom, player: ServerPlayer): JoinedPayload {
  return {
    playerId: player.id,
    token: player.token,
    room: manager.view(room, player.id),
  };
}

function allow(
  socket: TypedSocket,
  limiter: RateLimiter,
  limit: LimitName,
  ack: unknown,
): boolean {
  if (limiter.take(socket.id, limit)) return true;
  reply(ack, 'RATE_LIMITED');
  return false;
}

/** One shape for every acknowledgement, so the client has one thing to branch on. */
function reply<T>(ack: unknown, error?: ErrorCode, data?: T): void {
  if (typeof ack !== 'function') return;
  const callback = ack as (result: Ack<T>) => void;
  if (error) callback({ ok: false, error, message: ERROR_MESSAGES[error] });
  else callback({ ok: true, data: data as T });
}
