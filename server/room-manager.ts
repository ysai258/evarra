import { randomUUID, randomBytes } from 'node:crypto';
import { MULTIPLAYER_CONFIG, ROOM_IDLE_TIMEOUT_MS, clampQuestionCount, clampQuestionDuration } from '../src/multiplayer/config.ts';
import { generateRoomCode, normalizeRoomCode } from '../src/multiplayer/code.ts';
import { isValidPlayerName, normalizePlayerName } from '../src/multiplayer/name.ts';
import { multiplayerScore } from '../src/multiplayer/scoring.ts';
import { stageForElapsed } from '../src/multiplayer/stage.ts';
import type { ErrorCode, ServerEvents } from '../src/multiplayer/protocol.ts';
import type {
  FinalResults, PublicPlayer, PublicQuestion, QuestionResult, RevealState, RoomStatus,
  RoomView, ScorecardEntry, Standing,
} from '../src/multiplayer/types.ts';
import { MAX_ATTEMPTS } from '../src/engine/reveal.ts';
import type { Celebrity } from '../src/engine/types.ts';
import { selectQuestions, type Shuffle } from './questions.ts';

/**
 * The multiplayer room engine.
 *
 * This holds every fact the game is decided on: who is in a room, which star each
 * question is, when a question started and ended, what each player guessed and when,
 * and what it was worth. Clients are a screen and a keyboard — nothing they send is
 * believed beyond "this player pressed this name at this moment", and even the moment
 * is the server's own clock rather than theirs (spec §31, §57).
 *
 * It deliberately knows nothing about sockets. Everything it wants to announce goes
 * through the `RoomEvents` sink it is constructed with, which keeps the state machine
 * testable without a network and lets the transport be swapped without touching the
 * rules.
 */

export type TimerHandle = { readonly id: unknown };

/** Injected so tests can drive the clock instead of waiting out a 30-second question. */
export type Clock = {
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
};

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => ({ id: setTimeout(callback, ms) }),
  clearTimeout: (handle) => clearTimeout(handle.id as NodeJS.Timeout),
};

export type RoomEvents = {
  toRoom<E extends keyof ServerEvents>(
    code: string, event: E, ...args: Parameters<ServerEvents[E]>
  ): void;
  toPlayer<E extends keyof ServerEvents>(
    playerId: string, event: E, ...args: Parameters<ServerEvents[E]>
  ): void;
};

type CurrentAnswer = {
  wrongGuesses: number;
  solved: boolean;
  solvedAt?: number;
  stageIndex?: number;
  score: number;
  /** Stops a player re-submitting the same wrong name to burn the clock for free. */
  guessed: Set<string>;
};

type ServerPlayer = {
  id: string;
  name: string;
  /** Proves ownership of the seat on reconnect. Sent to its owner once, never broadcast. */
  token: string;
  connected: boolean;
  joinedAt: number;
  totalScore: number;
  correctAnswers: number;
  /** Total time taken across solved questions — the third tie-break (spec §91). */
  cumulativeSolveMs: number;
  scorecard: ScorecardEntry[];
  current: CurrentAnswer;
  graceTimer?: TimerHandle;
};

type ServerRoom = {
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  players: Map<string, ServerPlayer>;
  settings: { questionCount: number; questionDurationSeconds: number; revealDurationSeconds: number };
  /** The celebrities for this game, fixed the moment the host starts (spec §17). */
  questions: Celebrity[];
  /** One opaque handle per question, minted when that question begins. */
  assetTokens: string[];
  currentIndex: number;
  startedAt?: number;
  endsAt?: number;
  revealEndsAt?: number;
  lastActivityAt: number;
  phaseTimer?: TimerHandle;
};

export type RoomFailure = { error: ErrorCode };
export type JoinSuccess = { room: ServerRoom; player: ServerPlayer };
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

/**
 * Clock skew between a player's browser and the server is small but not zero, and a
 * client that computes the blur stage a few milliseconds early would be refused the
 * image it is already showing. The gate is therefore generous by this much — far less
 * than the seconds a stage lasts, so it gives nothing away.
 */
const STAGE_GRACE_MS = 750;

export class RoomManager {
  private readonly rooms = new Map<string, ServerRoom>();

  /** player id -> room code, so a socket only ever has to remember who it is. */
  private readonly playerRooms = new Map<string, string>();

  /** asset token -> which question of which room, for the image route. */
  private readonly assetIndex = new Map<string, { code: string; index: number }>();

  constructor(
    private readonly roster: readonly Celebrity[],
    private readonly events: RoomEvents,
    private readonly clock: Clock = systemClock,
    private readonly shuffle?: Shuffle,
  ) {}

  // ---------------------------------------------------------------- lobby

  createRoom(rawName: string): Result<JoinSuccess> {
    if (!isValidPlayerName(rawName)) return { ok: false, error: 'INVALID_NAME' };

    const code = this.uniqueCode();
    const player = this.makePlayer(rawName);
    const room: ServerRoom = {
      code,
      status: 'LOBBY',
      hostPlayerId: player.id,
      players: new Map([[player.id, player]]),
      settings: {
        questionCount: MULTIPLAYER_CONFIG.DEFAULT_QUESTION_COUNT,
        questionDurationSeconds: MULTIPLAYER_CONFIG.DEFAULT_QUESTION_DURATION_SECONDS,
        revealDurationSeconds: MULTIPLAYER_CONFIG.REVEAL_DURATION_SECONDS,
      },
      questions: [],
      assetTokens: [],
      currentIndex: -1,
      lastActivityAt: this.clock.now(),
    };

    this.rooms.set(code, room);
    this.playerRooms.set(player.id, code);
    return { ok: true, value: { room, player } };
  }

  joinRoom(rawCode: string, rawName: string): Result<JoinSuccess> {
    const code = normalizeRoomCode(rawCode);
    if (!code) return { ok: false, error: 'INVALID_CODE' };
    if (!isValidPlayerName(rawName)) return { ok: false, error: 'INVALID_NAME' };

    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    // The room locks when the host starts: joining mid-game would mean a player with
    // fewer questions behind them sitting on the same leaderboard (spec §9, §76).
    if (room.status !== 'LOBBY') {
      // A game that has finished is a different disappointment from one already under
      // way — the first offers a new room, the second asks you to wait (spec §45).
      const over = room.status === 'ENDED' || room.status === 'FINAL_RESULTS';
      return { ok: false, error: over ? 'GAME_ENDED' : 'GAME_ALREADY_STARTED' };
    }
    if (room.players.size >= MULTIPLAYER_CONFIG.MAX_PLAYERS) {
      return { ok: false, error: 'ROOM_FULL' };
    }

    const player = this.makePlayer(rawName);
    room.players.set(player.id, player);
    this.playerRooms.set(player.id, code);
    this.touch(room);

    this.events.toRoom(code, 'room:playerJoined', this.publicPlayer(room, player));
    this.broadcastState(room);
    return { ok: true, value: { room, player } };
  }

  /**
   * Returning to a seat.
   *
   * A refresh, a tunnel or a backgrounded phone must not cost a player their score, so
   * the seat is held rather than recycled (spec §46–48). The token is what makes that
   * safe: knowing a room code and someone's player id is not enough to inherit their
   * points.
   */
  resume(rawCode: string, playerId: string, token: string): Result<JoinSuccess> {
    const code = normalizeRoomCode(rawCode);
    const room = code ? this.rooms.get(code) : undefined;
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };

    const player = room.players.get(playerId);
    if (!player || player.token !== token) return { ok: false, error: 'NOT_IN_ROOM' };

    if (player.graceTimer) {
      this.clock.clearTimeout(player.graceTimer);
      delete player.graceTimer;
    }
    player.connected = true;
    this.playerRooms.set(player.id, room.code);
    this.touch(room);

    this.events.toRoom(room.code, 'game:progress', this.publicPlayers(room));
    this.broadcastState(room);
    return { ok: true, value: { room, player } };
  }

  updateSettings(
    playerId: string,
    settings: { questionCount: number; questionDurationSeconds: number },
  ): Result<ServerRoom> {
    const room = this.roomOf(playerId);
    if (!room) return { ok: false, error: 'NOT_IN_ROOM' };
    if (room.hostPlayerId !== playerId) return { ok: false, error: 'NOT_HOST' };
    // Settings are part of the game's shape; changing them mid-game would rewrite a
    // contest already in progress (spec §67).
    if (room.status !== 'LOBBY') return { ok: false, error: 'WRONG_STATE' };

    room.settings.questionCount = clampQuestionCount(settings.questionCount);
    room.settings.questionDurationSeconds = clampQuestionDuration(settings.questionDurationSeconds);
    this.touch(room);
    this.broadcastState(room);
    return { ok: true, value: room };
  }

  leaveRoom(playerId: string): void {
    const room = this.roomOf(playerId);
    if (!room) return;
    const player = room.players.get(playerId);
    if (player?.graceTimer) this.clock.clearTimeout(player.graceTimer);

    room.players.delete(playerId);
    this.playerRooms.delete(playerId);
    this.touch(room);

    if (room.players.size === 0) {
      this.destroyRoom(room);
      return;
    }

    this.events.toRoom(room.code, 'room:playerLeft', playerId);
    this.ensureHost(room);
    this.broadcastState(room);
    // The player who left may have been the last one the room was waiting on.
    this.endQuestionIfEveryoneSolved(room);
  }

  // ---------------------------------------------------------------- game

  startGame(playerId: string): Result<ServerRoom> {
    const room = this.roomOf(playerId);
    if (!room) return { ok: false, error: 'NOT_IN_ROOM' };
    if (room.hostPlayerId !== playerId) return { ok: false, error: 'NOT_HOST' };
    if (room.status !== 'LOBBY') return { ok: false, error: 'WRONG_STATE' };
    if (this.activePlayers(room).length < MULTIPLAYER_CONFIG.MIN_PLAYERS) {
      return { ok: false, error: 'NOT_ENOUGH_PLAYERS' };
    }

    room.questions = selectQuestions(this.roster, room.settings.questionCount, this.shuffle);
    if (room.questions.length === 0) return { ok: false, error: 'SERVER_ERROR' };
    room.assetTokens = [];
    room.currentIndex = -1;
    for (const player of room.players.values()) {
      player.totalScore = 0;
      player.correctAnswers = 0;
      player.cumulativeSolveMs = 0;
      player.scorecard = [];
    }

    this.startQuestion(room, 0);
    return { ok: true, value: room };
  }

  /**
   * A guess.
   *
   * Multiplayer lets a player keep guessing until the buzzer, so this is also where the
   * cost of being wrong is charged — see `multiplayer/scoring.ts` for why there has to
   * be one. Everything that decides the score is read here, from the server's clock:
   * which stage is on screen, how much time was left, how many misses came before.
   */
  submitGuess(
    playerId: string,
    assetToken: string,
    celebrityId: string,
  ): Result<{ correct: boolean; wrongGuesses: number; score?: number }> {
    const room = this.roomOf(playerId);
    if (!room) return { ok: false, error: 'NOT_IN_ROOM' };
    if (room.status !== 'QUESTION') return { ok: false, error: 'WRONG_STATE' };

    const player = room.players.get(playerId);
    if (!player) return { ok: false, error: 'NOT_IN_ROOM' };
    if (assetToken !== room.assetTokens[room.currentIndex]) {
      // A packet for the previous question arriving late, or a client that guessed at
      // the wrong thing. Either way it must not land on the question now running.
      return { ok: false, error: 'WRONG_STATE' };
    }
    if (player.current.solved) return { ok: false, error: 'ALREADY_SOLVED' };

    const answer = room.questions[room.currentIndex];
    const now = this.clock.now();
    if (!answer || room.startedAt === undefined || room.endsAt === undefined) {
      return { ok: false, error: 'WRONG_STATE' };
    }
    // Nothing counts during the 3-2-1, and nothing counts after the buzzer.
    if (now < room.startedAt || now > room.endsAt) return { ok: false, error: 'WRONG_STATE' };

    const guessed = this.roster.find((celebrity) => celebrity.id === celebrityId);
    if (!guessed) return { ok: false, error: 'INVALID_GUESS' };
    if (player.current.guessed.has(celebrityId)) {
      return { ok: true, value: { correct: false, wrongGuesses: player.current.wrongGuesses } };
    }
    player.current.guessed.add(celebrityId);
    this.touch(room);

    if (guessed.id !== answer.id) {
      player.current.wrongGuesses += 1;
      return { ok: true, value: { correct: false, wrongGuesses: player.current.wrongGuesses } };
    }

    const durationMs = room.settings.questionDurationSeconds * 1000;
    const stageIndex = stageForElapsed(now - room.startedAt, durationMs);
    const score = multiplayerScore({
      stageIndex,
      wrongGuesses: player.current.wrongGuesses,
      timeRemainingMs: room.endsAt - now,
      durationMs,
    });

    player.current.solved = true;
    player.current.solvedAt = now;
    player.current.stageIndex = stageIndex;
    player.current.score = score;
    player.totalScore += score;
    player.correctAnswers += 1;
    player.cumulativeSolveMs += now - room.startedAt;

    this.events.toRoom(room.code, 'game:progress', this.publicPlayers(room));
    this.endQuestionIfEveryoneSolved(room);

    return { ok: true, value: { correct: true, wrongGuesses: player.current.wrongGuesses, score } };
  }

  // ---------------------------------------------------- phase transitions

  private startQuestion(room: ServerRoom, index: number): void {
    room.currentIndex = index;
    room.status = 'QUESTION';

    const token = randomBytes(16).toString('hex');
    room.assetTokens[index] = token;
    this.assetIndex.set(token, { code: room.code, index });

    const durationMs = room.settings.questionDurationSeconds * 1000;
    // One timestamp drives both the 3-2-1 and the clock: the question is declared to
    // start in the near future, and every client counts down to the same instant
    // rather than starting its own timer when the packet happens to arrive (spec §89).
    room.startedAt = this.clock.now() + MULTIPLAYER_CONFIG.COUNTDOWN_MS;
    room.endsAt = room.startedAt + durationMs;
    delete room.revealEndsAt;

    for (const player of room.players.values()) player.current = freshAnswer();
    this.touch(room);

    this.schedule(room, () => this.endQuestion(room), room.endsAt - this.clock.now());
    this.events.toRoom(
      room.code,
      'game:question',
      this.publicQuestion(room)!,
      this.publicPlayers(room),
    );
  }

  /** Ends the question the moment nobody is left to wait for (spec §33). */
  private endQuestionIfEveryoneSolved(room: ServerRoom): void {
    if (room.status !== 'QUESTION') return;
    const active = this.activePlayers(room);
    if (active.length === 0 || !active.every((player) => player.current.solved)) return;
    this.endQuestion(room);
  }

  private endQuestion(room: ServerRoom): void {
    if (room.status !== 'QUESTION') return;
    this.clearTimer(room);

    const answer = room.questions[room.currentIndex];
    if (!answer) return;

    for (const player of room.players.values()) {
      player.scorecard.push({
        questionNumber: room.currentIndex + 1,
        correct: player.current.solved,
        score: player.current.score,
      });
    }

    room.status = 'REVEAL';
    room.revealEndsAt = this.clock.now() + room.settings.revealDurationSeconds * 1000;
    this.touch(room);

    this.events.toRoom(room.code, 'game:reveal', this.revealState(room, answer));
    this.schedule(room, () => this.advance(room), room.revealEndsAt - this.clock.now());
  }

  private advance(room: ServerRoom): void {
    if (room.status !== 'REVEAL') return;
    const next = room.currentIndex + 1;
    if (next < room.questions.length) {
      this.startQuestion(room, next);
      return;
    }
    this.finish(room);
  }

  private finish(room: ServerRoom): void {
    this.clearTimer(room);
    room.status = 'FINAL_RESULTS';
    delete room.startedAt;
    delete room.endsAt;
    delete room.revealEndsAt;
    this.touch(room);

    // The scorecard is one player's own game, so the final payload is addressed rather
    // than broadcast — nobody needs a question-by-question breakdown of everyone else.
    for (const player of room.players.values()) {
      this.events.toPlayer(player.id, 'game:final', this.finalResults(room, player));
    }
    this.broadcastState(room);
  }

  // ---------------------------------------------------------- connections

  /**
   * A dropped connection is not a departure.
   *
   * Phones sleep, tunnels happen, and a player who refreshes mid-question would be
   * furious to find their score gone. The seat is held for a grace period; only when
   * that expires does the room stop counting on them (spec §49).
   */
  handleDisconnect(playerId: string): void {
    const room = this.roomOf(playerId);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    player.connected = false;
    this.events.toRoom(room.code, 'game:progress', this.publicPlayers(room));
    // Whoever the room was waiting on may have just left the building.
    this.endQuestionIfEveryoneSolved(room);

    if (player.graceTimer) this.clock.clearTimeout(player.graceTimer);
    player.graceTimer = this.clock.setTimeout(
      () => this.dropPlayer(room, playerId),
      MULTIPLAYER_CONFIG.RECONNECT_GRACE_PERIOD_SECONDS * 1000,
    );
  }

  private dropPlayer(room: ServerRoom, playerId: string): void {
    const player = room.players.get(playerId);
    if (!player || player.connected) return;
    delete player.graceTimer;

    // Mid-game their scores still belong on the leaderboard, so the seat stays and
    // only their vote on "has everyone answered" is withdrawn. In the lobby there is
    // nothing to preserve, so the seat goes.
    if (room.status === 'LOBBY') {
      room.players.delete(playerId);
      this.playerRooms.delete(playerId);
      this.events.toRoom(room.code, 'room:playerLeft', playerId);
      if (room.players.size === 0) {
        this.destroyRoom(room);
        return;
      }
      this.ensureHost(room);
    }

    this.broadcastState(room);
  }

  /**
   * The room outlives its host (spec §15, §50). In the lobby someone has to be able to
   * press start, so the role passes to whoever has been there longest; once a game is
   * running the host has no powers left and the server owns the lifecycle regardless.
   */
  private ensureHost(room: ServerRoom): void {
    const host = room.players.get(room.hostPlayerId);
    if (host?.connected) return;

    const successor = [...room.players.values()]
      .filter((player) => player.connected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0]
      ?? [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];

    if (!successor || successor.id === room.hostPlayerId) return;
    room.hostPlayerId = successor.id;
    this.events.toRoom(room.code, 'room:hostChanged', successor.id);
  }

  // ------------------------------------------------------------- assets

  /**
   * Answers the image route: which celebrity a token stands for, and how far up the
   * blur ladder the asking client is currently entitled to see.
   */
  resolveAsset(token: string): { celebrity: Celebrity; maxStage: number } | undefined {
    const location = this.assetIndex.get(token);
    if (!location) return undefined;
    const room = this.rooms.get(location.code);
    if (!room) return undefined;
    const celebrity = room.questions[location.index];
    if (!celebrity) return undefined;

    return { celebrity, maxStage: this.maxStageFor(room, location.index) };
  }

  private maxStageFor(room: ServerRoom, index: number): number {
    const clear = MAX_ATTEMPTS - 1;
    // Anything already played is public: its answer has been on screen.
    if (index < room.currentIndex) return clear;
    if (index > room.currentIndex) return 0;
    if (room.status === 'QUESTION') {
      if (room.startedAt === undefined) return 0;
      const durationMs = room.settings.questionDurationSeconds * 1000;
      const elapsed = this.clock.now() - room.startedAt + STAGE_GRACE_MS;
      return stageForElapsed(elapsed, durationMs);
    }
    return clear;
  }

  // -------------------------------------------------------------- views

  view(room: ServerRoom, forPlayerId?: string): RoomView {
    const base: RoomView = {
      code: room.code,
      status: room.status,
      hostPlayerId: room.hostPlayerId,
      settings: { ...room.settings },
      players: this.publicPlayers(room),
    };

    if (room.status === 'QUESTION') {
      const question = this.publicQuestion(room);
      if (question) base.question = question;
    }
    if (room.status === 'REVEAL') {
      const answer = room.questions[room.currentIndex];
      if (answer) base.reveal = this.revealState(room, answer);
    }
    if (room.status === 'FINAL_RESULTS' && forPlayerId) {
      const player = room.players.get(forPlayerId);
      if (player) base.final = this.finalResults(room, player);
    }
    return base;
  }

  roomOf(playerId: string): ServerRoom | undefined {
    const code = this.playerRooms.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  roomByCode(rawCode: string): ServerRoom | undefined {
    const code = normalizeRoomCode(rawCode);
    return code ? this.rooms.get(code) : undefined;
  }

  broadcastState(room: ServerRoom): void {
    // FINAL_RESULTS carries a per-player scorecard, so it cannot be one broadcast.
    for (const player of room.players.values()) {
      this.events.toPlayer(player.id, 'room:state', this.view(room, player.id));
    }
  }

  private publicQuestion(room: ServerRoom): PublicQuestion | undefined {
    const token = room.assetTokens[room.currentIndex];
    if (!token || room.startedAt === undefined || room.endsAt === undefined) return undefined;
    return {
      index: room.currentIndex,
      number: room.currentIndex + 1,
      total: room.questions.length,
      assetToken: token,
      startedAt: room.startedAt,
      endsAt: room.endsAt,
      durationMs: room.settings.questionDurationSeconds * 1000,
    };
  }

  private publicPlayers(room: ServerRoom): PublicPlayer[] {
    return [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((player) => this.publicPlayer(room, player));
  }

  private publicPlayer(room: ServerRoom, player: ServerPlayer): PublicPlayer {
    return {
      id: player.id,
      name: player.name,
      connected: player.connected,
      isHost: player.id === room.hostPlayerId,
      totalScore: player.totalScore,
      solved: player.current.solved,
    };
  }

  private revealState(room: ServerRoom, answer: Celebrity): RevealState {
    const image = answer.images[0];
    const token = room.assetTokens[room.currentIndex]!;
    const results: QuestionResult[] = [...room.players.values()]
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        correct: player.current.solved,
        score: player.current.score,
        wrongGuesses: player.current.wrongGuesses,
        ...(player.current.solvedAt !== undefined ? { solvedAt: player.current.solvedAt } : {}),
        ...(player.current.stageIndex !== undefined ? { stageIndex: player.current.stageIndex } : {}),
      }))
      // Score first, then whoever got there sooner, then player id so the order is
      // stable for everyone looking at it (spec §37).
      .sort((a, b) => b.score - a.score
        || (a.solvedAt ?? Infinity) - (b.solvedAt ?? Infinity)
        || a.playerId.localeCompare(b.playerId));

    return {
      questionNumber: room.currentIndex + 1,
      total: room.questions.length,
      celebrityId: answer.id,
      celebrityName: answer.name,
      ...(answer.nameTelugu ? { celebrityNameTelugu: answer.nameTelugu } : {}),
      assetToken: token,
      ...(image ? {
        attribution: {
          sourceUrl: image.sourceUrl,
          sourceName: image.sourceName,
          ...(image.license ? { license: image.license } : {}),
          ...(image.attribution ? { attribution: image.attribution } : {}),
        },
      } : {}),
      results,
      standings: this.standings(room),
      endsAt: room.revealEndsAt ?? this.clock.now(),
    };
  }

  /** Total, then answers found, then who took less time, then player id (spec §91). */
  private standings(room: ServerRoom): Standing[] {
    return [...room.players.values()]
      .sort((a, b) => b.totalScore - a.totalScore
        || b.correctAnswers - a.correctAnswers
        || a.cumulativeSolveMs - b.cumulativeSolveMs
        || a.id.localeCompare(b.id))
      .map((player, index) => ({
        playerId: player.id,
        name: player.name,
        totalScore: player.totalScore,
        correctAnswers: player.correctAnswers,
        rank: index + 1,
      }));
  }

  private finalResults(room: ServerRoom, player: ServerPlayer): FinalResults {
    return {
      standings: this.standings(room),
      questionCount: room.questions.length,
      playerCount: room.players.size,
      scorecard: [...player.scorecard],
    };
  }

  // ------------------------------------------------------------ plumbing

  /** Everyone whose answer the room is still waiting on. */
  private activePlayers(room: ServerRoom): ServerPlayer[] {
    return [...room.players.values()].filter((player) => player.connected);
  }

  private makePlayer(rawName: string): ServerPlayer {
    return {
      id: randomUUID(),
      name: normalizePlayerName(rawName),
      token: randomBytes(24).toString('hex'),
      connected: true,
      joinedAt: this.clock.now(),
      totalScore: 0,
      correctAnswers: 0,
      cumulativeSolveMs: 0,
      scorecard: [],
      current: freshAnswer(),
    };
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const code = generateRoomCode();
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a free room code.');
  }

  private schedule(room: ServerRoom, callback: () => void, ms: number): void {
    this.clearTimer(room);
    room.phaseTimer = this.clock.setTimeout(callback, Math.max(0, ms));
  }

  private clearTimer(room: ServerRoom): void {
    if (!room.phaseTimer) return;
    this.clock.clearTimeout(room.phaseTimer);
    delete room.phaseTimer;
  }

  private touch(room: ServerRoom): void {
    room.lastActivityAt = this.clock.now();
  }

  private destroyRoom(room: ServerRoom): void {
    this.clearTimer(room);
    for (const player of room.players.values()) {
      if (player.graceTimer) this.clock.clearTimeout(player.graceTimer);
      this.playerRooms.delete(player.id);
    }
    for (const token of room.assetTokens) this.assetIndex.delete(token);
    this.rooms.delete(room.code);
  }

  /**
   * Rooms are not immortal (spec §51). An abandoned lobby, a finished game and a room
   * everyone closed the tab on all decay the same way: no activity for the idle
   * timeout and they are gone, along with their asset tokens.
   */
  cleanup(): number {
    const cutoff = this.clock.now() - ROOM_IDLE_TIMEOUT_MS;
    let removed = 0;
    for (const room of [...this.rooms.values()]) {
      if (room.lastActivityAt >= cutoff) continue;
      this.events.toRoom(room.code, 'game:ended');
      this.destroyRoom(room);
      removed += 1;
    }
    return removed;
  }

  /** Test and diagnostics seam — never used to make a decision. */
  get size(): number {
    return this.rooms.size;
  }
}

function freshAnswer(): CurrentAnswer {
  return { wrongGuesses: 0, solved: false, score: 0, guessed: new Set() };
}

export type { ServerRoom, ServerPlayer };
