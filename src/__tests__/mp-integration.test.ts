// @vitest-environment node
import { createServer, type Server as HttpServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { createRoomManager, registerHandlers, type TypedServer } from '../../server/handlers.ts';
import type { RoomManager } from '../../server/room-manager.ts';
import { MULTIPLAYER_CONFIG } from '../multiplayer/config.ts';
import type { Ack, JoinedPayload, GuessResultPayload } from '../multiplayer/protocol.ts';
import type { FinalResults, PublicQuestion, RevealState, RoomView } from '../multiplayer/types.ts';
import { FakeClock } from './mp-harness.ts';
import { makeRoster } from './factories.ts';

/**
 * Three players, real sockets, a whole game (spec §83).
 *
 * The sockets are genuine — this is the only test that proves the wire protocol, the
 * handlers and the state machine agree with each other. The *clock*, though, is still
 * the test's: a thirty-second question played in real time would make the suite
 * unusable, and waiting is not the thing under test. So the game's deadlines advance
 * on command while the messages travel for real.
 */

const SECOND = 1000;
const roster = makeRoster(40);

let http: HttpServer;
let io: TypedServer;
let manager: RoomManager;
let clock: FakeClock;
let clients: Socket[] = [];

beforeEach(async () => {
  clock = new FakeClock();
  http = createServer();
  io = new Server(http, { cors: { origin: true } });
  manager = createRoomManager(io, roster, clock);
  registerHandlers(io, manager, undefined, clock.now.bind(clock));
  await new Promise<void>((resolve) => http.listen(0, resolve));
});

afterEach(async () => {
  for (const client of clients) client.disconnect();
  clients = [];
  io.close();
  await new Promise<void>((resolve) => http.close(() => resolve()));
});

function url(): string {
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  return `http://127.0.0.1:${address.port}`;
}

async function player(): Promise<Socket> {
  const socket = connect(url(), { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  await once(socket, 'connect');
  return socket;
}

function once<T = unknown>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 4000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function ask<T>(socket: Socket, event: string, payload?: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(event, resolve);
    else socket.emit(event, payload, resolve);
  });
}

/** Lets queued socket messages land before the test looks at anything. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

async function openGame(questionCount = 2, durationSeconds = 30) {
  const [host, second, third] = await Promise.all([player(), player(), player()]);

  const created = await ask<JoinedPayload>(host!, 'room:create', { name: 'Yashwanth' });
  if (!created.ok) throw new Error(created.error);
  const code = created.data.room.code;

  const joinedB = await ask<JoinedPayload>(second!, 'room:join', { code, name: 'Rahul' });
  const joinedC = await ask<JoinedPayload>(third!, 'room:join', { code, name: 'Sai' });
  if (!joinedB.ok || !joinedC.ok) throw new Error('join failed');

  await ask(host!, 'room:settings', {
    questionCount, questionDurationSeconds: durationSeconds,
  });
  await settle();

  return {
    code,
    sockets: { host: host!, second: second!, third: third! },
    ids: {
      host: created.data.playerId,
      second: joinedB.data.playerId,
      third: joinedC.data.playerId,
    },
    tokens: { host: created.data.token },
  };
}

describe('a whole multiplayer game', () => {
  it('deals every player the same question at the same instant', async () => {
    const game = await openGame();
    const questions = Promise.all([
      once<PublicQuestion>(game.sockets.host, 'game:question'),
      once<PublicQuestion>(game.sockets.second, 'game:question'),
      once<PublicQuestion>(game.sockets.third, 'game:question'),
    ]);
    await ask(game.sockets.host, 'game:start');
    const [a, b, c] = await questions;

    expect(a.assetToken).toBe(b.assetToken);
    expect(b.assetToken).toBe(c.assetToken);
    expect(new Set([a.startedAt, b.startedAt, c.startedAt]).size).toBe(1);
    expect(new Set([a.endsAt, b.endsAt, c.endsAt]).size).toBe(1);
    expect(a.number).toBe(1);
    expect(a.total).toBe(2);
  });

  it('pays the earlier of two identical answers more, and nothing to the one who missed', async () => {
    const game = await openGame();
    const question = once<PublicQuestion>(game.sockets.host, 'game:question');
    await ask(game.sockets.host, 'game:start');
    const { assetToken } = await question;

    const answer = manager.roomByCode(game.code)!.questions[0]!.id;
    clock.advance(MULTIPLAYER_CONFIG.COUNTDOWN_MS);

    const first = await ask<GuessResultPayload>(
      game.sockets.host, 'game:guess', { assetToken, celebrityId: answer },
    );
    clock.advance(12 * SECOND);
    const second = await ask<GuessResultPayload>(
      game.sockets.second, 'game:guess', { assetToken, celebrityId: answer },
    );

    expect(first.ok && first.data.correct).toBe(true);
    expect(second.ok && second.data.correct).toBe(true);
    expect(first.ok && second.ok && first.data.score! > second.data.score!).toBe(true);

    const reveal = once<RevealState>(game.sockets.third, 'game:reveal');
    clock.advance(20 * SECOND);
    const revealed = await reveal;

    expect(revealed.celebrityName).toBe(manager.roomByCode(game.code)!.questions[0]!.name);
    expect(revealed.results[0]!.playerId).toBe(game.ids.host);
    expect(revealed.results[1]!.playerId).toBe(game.ids.second);
    const missed = revealed.results.find((result) => result.playerId === game.ids.third)!;
    expect(missed.correct).toBe(false);
    expect(missed.score).toBe(0);
  });

  it('runs itself to the final leaderboard without anyone pressing anything', async () => {
    const game = await openGame(2, 15);
    const finals = Promise.all([
      once<FinalResults>(game.sockets.host, 'game:final'),
      once<FinalResults>(game.sockets.second, 'game:final'),
      once<FinalResults>(game.sockets.third, 'game:final'),
    ]);
    const firstQuestion = once<PublicQuestion>(game.sockets.host, 'game:question');
    await ask(game.sockets.host, 'game:start');
    await firstQuestion;

    // Question one: the host answers, nobody else does.
    clock.advance(MULTIPLAYER_CONFIG.COUNTDOWN_MS);
    const room = manager.roomByCode(game.code)!;
    await ask(game.sockets.host, 'game:guess', {
      assetToken: room.assetTokens[0], celebrityId: room.questions[0]!.id,
    });
    clock.advance(15 * SECOND);
    await settle();

    // Through the reveal, into question two, which everyone sits out.
    clock.advance(MULTIPLAYER_CONFIG.REVEAL_DURATION_SECONDS * SECOND);
    await settle();
    clock.advance(MULTIPLAYER_CONFIG.COUNTDOWN_MS + 15 * SECOND);
    await settle();
    clock.advance(MULTIPLAYER_CONFIG.REVEAL_DURATION_SECONDS * SECOND);

    const [hostFinal, , thirdFinal] = await finals;
    expect(hostFinal.questionCount).toBe(2);
    expect(hostFinal.playerCount).toBe(3);
    expect(hostFinal.standings[0]!.playerId).toBe(game.ids.host);
    expect(hostFinal.standings[0]!.totalScore).toBeGreaterThan(0);

    // Everyone agrees on the board; the scorecard is each player's own.
    expect(thirdFinal.standings).toEqual(hostFinal.standings);
    expect(hostFinal.scorecard[0]!.correct).toBe(true);
    expect(thirdFinal.scorecard.every((entry) => !entry.correct)).toBe(true);
  });

  it('will not let a late arrival into a game in progress', async () => {
    const game = await openGame();
    await ask(game.sockets.host, 'game:start');
    await settle();

    const latecomer = await player();
    const result = await ask<JoinedPayload>(latecomer, 'room:join', {
      code: game.code, name: 'Kiran',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toBe('GAME_ALREADY_STARTED');
  });

  it('refuses a start from anyone but the host', async () => {
    const game = await openGame();
    const result = await ask<null>(game.sockets.second, 'game:start');
    expect(!result.ok && result.error).toBe('NOT_HOST');
  });

  it('puts a refreshed player back in their seat with their score intact', async () => {
    const game = await openGame();
    const question = once<PublicQuestion>(game.sockets.host, 'game:question');
    await ask(game.sockets.host, 'game:start');
    const { assetToken } = await question;
    clock.advance(MULTIPLAYER_CONFIG.COUNTDOWN_MS);

    const room = manager.roomByCode(game.code)!;
    const scored = await ask<GuessResultPayload>(game.sockets.host, 'game:guess', {
      assetToken, celebrityId: room.questions[0]!.id,
    });
    expect(scored.ok && scored.data.correct).toBe(true);

    // The tab goes away and comes back as a brand new socket.
    game.sockets.host.disconnect();
    await settle();
    const returning = await player();
    const resumed = await ask<JoinedPayload>(returning, 'room:resume', {
      code: game.code, playerId: game.ids.host, token: game.tokens.host,
    });

    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    const me = resumed.data.room.players.find((p) => p.id === game.ids.host)!;
    expect(me.connected).toBe(true);
    expect(me.solved).toBe(true);
    expect(me.totalScore).toBe(scored.ok ? scored.data.score : 0);
    expect(resumed.data.room.status).toBe('QUESTION');
  });

  it('tells every player when someone joins the lobby', async () => {
    const [host] = await Promise.all([player()]);
    const created = await ask<JoinedPayload>(host!, 'room:create', { name: 'Yashwanth' });
    if (!created.ok) throw new Error('create failed');

    const update = once<RoomView>(host!, 'room:state');
    const second = await player();
    await ask(second, 'room:join', { code: created.data.room.code, name: 'Rahul' });

    expect((await update).players.map((p) => p.name)).toEqual(['Yashwanth', 'Rahul']);
  });
});
