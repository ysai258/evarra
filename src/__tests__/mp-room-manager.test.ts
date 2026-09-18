// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { RoomManager } from '../../server/room-manager.ts';
import { MULTIPLAYER_CONFIG } from '../multiplayer/config.ts';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import type { Celebrity } from '../engine/types.ts';
import type { PublicQuestion, RevealState } from '../multiplayer/types.ts';
import { FakeClock, RecordingEvents } from './mp-harness.ts';
import { makeRoster } from './factories.ts';

const SECOND = 1000;

let roster: Celebrity[];
let clock: FakeClock;
let events: RecordingEvents;
let manager: RoomManager;

/** Questions in a fixed order, so a test can name the answer it expects. */
const inOrder = <T>(items: readonly T[]): T[] => [...items];

beforeEach(() => {
  roster = makeRoster(40);
  clock = new FakeClock();
  events = new RecordingEvents();
  manager = new RoomManager(roster, events, clock, inOrder);
});

function openRoom(names: string[]) {
  const created = manager.createRoom(names[0]!);
  if (!created.ok) throw new Error(created.error);
  const room = created.value.room;
  const players = [created.value.player];
  for (const name of names.slice(1)) {
    const joined = manager.joinRoom(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    players.push(joined.value.player);
  }
  return { room, players };
}

/** The question payload the room last announced. */
function currentQuestion(): PublicQuestion {
  return events.last('game:question')![0] as PublicQuestion;
}

function lastReveal(): RevealState {
  return events.last('game:reveal')![0] as RevealState;
}

/** Past the 3-2-1 and into the live question. */
function intoQuestion(): void {
  clock.advance(MULTIPLAYER_CONFIG.COUNTDOWN_MS);
}

describe('rooms', () => {
  it('creates a room with the creator as host', () => {
    const { room, players } = openRoom(['Yashwanth']);
    expect(room.status).toBe('LOBBY');
    expect(room.hostPlayerId).toBe(players[0]!.id);
    expect(manager.size).toBe(1);
  });

  it('refuses a name that is too short', () => {
    expect(manager.createRoom('A')).toEqual({ ok: false, error: 'INVALID_NAME' });
  });

  it('lets two players share a name and tells them apart by id', () => {
    const { room, players } = openRoom(['Sai', 'Sai']);
    expect(room.players.size).toBe(2);
    expect(players[0]!.id).not.toBe(players[1]!.id);
  });

  it('reports a room that does not exist', () => {
    expect(manager.joinRoom('AB7K9Q', 'Rahul')).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
  });

  it('refuses a malformed code before looking anything up', () => {
    expect(manager.joinRoom('nope', 'Rahul')).toEqual({ ok: false, error: 'INVALID_CODE' });
  });

  it('turns players away once the room is full', () => {
    const names = Array.from({ length: MULTIPLAYER_CONFIG.MAX_PLAYERS }, (_, i) => `P${i}`);
    const { room } = openRoom(names);
    expect(manager.joinRoom(room.code, 'One too many'))
      .toEqual({ ok: false, error: 'ROOM_FULL' });
  });

  it('locks the room once the game starts', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    expect(manager.joinRoom(room.code, 'Latecomer'))
      .toEqual({ ok: false, error: 'GAME_ALREADY_STARTED' });
  });
});

describe('host', () => {
  it('lets only the host change the settings', () => {
    const { players } = openRoom(['Host', 'Rahul']);
    expect(manager.updateSettings(players[1]!.id, { questionCount: 10, questionDurationSeconds: 45 }))
      .toEqual({ ok: false, error: 'NOT_HOST' });
    const result = manager.updateSettings(players[0]!.id, {
      questionCount: 10, questionDurationSeconds: 45,
    });
    expect(result.ok).toBe(true);
  });

  it('clamps settings the client should never have sent', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.updateSettings(players[0]!.id, { questionCount: 999, questionDurationSeconds: 600 });
    expect(room.settings.questionCount).toBe(MULTIPLAYER_CONFIG.MAX_QUESTION_COUNT);
    expect(room.settings.questionDurationSeconds)
      .toBe(MULTIPLAYER_CONFIG.MAX_QUESTION_DURATION_SECONDS);
  });

  it('lets only the host start', () => {
    const { players } = openRoom(['Host', 'Rahul']);
    expect(manager.startGame(players[1]!.id)).toEqual({ ok: false, error: 'NOT_HOST' });
  });

  it('will not start a game of one', () => {
    const { players } = openRoom(['Host']);
    expect(manager.startGame(players[0]!.id))
      .toEqual({ ok: false, error: 'NOT_ENOUGH_PLAYERS' });
  });

  it('refuses settings changes once the game is running', () => {
    const { players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    expect(manager.updateSettings(players[0]!.id, { questionCount: 20, questionDurationSeconds: 15 }))
      .toEqual({ ok: false, error: 'WRONG_STATE' });
  });

  it('passes the crown on when the host leaves the lobby', () => {
    const { room, players } = openRoom(['Host', 'Rahul', 'Sai']);
    manager.leaveRoom(players[0]!.id);
    expect(room.hostPlayerId).toBe(players[1]!.id);
    expect(events.of('room:hostChanged').at(-1)).toEqual([players[1]!.id]);
  });

  /** Spec §50: the server owns the game, so losing the host must not end it. */
  it('keeps the game running when the host drops mid-question', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    // A minute-long question, so the grace period expires while it is still running.
    manager.updateSettings(players[0]!.id, { questionCount: 5, questionDurationSeconds: 60 });
    manager.startGame(players[0]!.id);
    intoQuestion();
    manager.handleDisconnect(players[0]!.id);
    clock.advance(MULTIPLAYER_CONFIG.RECONNECT_GRACE_PERIOD_SECONDS * SECOND + SECOND);
    expect(room.status).toBe('QUESTION');
    expect(room.players.has(players[0]!.id)).toBe(true);
  });
});

describe('questions', () => {
  it('gives everyone the same fixed sequence, with nobody twice', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.updateSettings(players[0]!.id, { questionCount: 10, questionDurationSeconds: 30 });
    manager.startGame(players[0]!.id);
    expect(room.questions).toHaveLength(10);
    expect(new Set(room.questions.map((c) => c.id)).size).toBe(10);
  });

  it('starts the clock in the future, so the 3-2-1 is the same instant for everyone', () => {
    const { players } = openRoom(['Host', 'Rahul']);
    const at = clock.now();
    manager.startGame(players[0]!.id);
    const question = currentQuestion();
    expect(question.startedAt).toBe(at + MULTIPLAYER_CONFIG.COUNTDOWN_MS);
    expect(question.endsAt).toBe(question.startedAt + 30 * SECOND);
  });

  it('sends nothing that names the star', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    const serialised = JSON.stringify(currentQuestion());
    expect(serialised).not.toContain(room.questions[0]!.name);
    expect(serialised).not.toContain(room.questions[0]!.id);
    expect(serialised).not.toContain(room.questions[0]!.images[0]!.localPath);
  });

  it('ends on the timer when nobody has answered', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    intoQuestion();
    clock.advance(30 * SECOND);
    expect(room.status).toBe('REVEAL');
    expect(lastReveal().results.every((result) => !result.correct && result.score === 0)).toBe(true);
  });

  it('ends early once everyone has it, without waiting out the clock', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    intoQuestion();
    const token = currentQuestion().assetToken;
    const answer = room.questions[0]!.id;
    manager.submitGuess(players[0]!.id, token, answer);
    expect(room.status).toBe('QUESTION');
    manager.submitGuess(players[1]!.id, token, answer);
    expect(room.status).toBe('REVEAL');
  });

  it('runs through every question and lands on the final results', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.updateSettings(players[0]!.id, { questionCount: 3, questionDurationSeconds: 15 });
    manager.startGame(players[0]!.id);
    for (let question = 0; question < 3; question += 1) {
      intoQuestion();
      clock.advance(15 * SECOND);
      expect(room.status).toBe('REVEAL');
      clock.advance(MULTIPLAYER_CONFIG.REVEAL_DURATION_SECONDS * SECOND);
    }
    expect(room.status).toBe('FINAL_RESULTS');
    expect(events.of('game:final')).toHaveLength(2);
  });
});

describe('guessing', () => {
  function playing() {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    intoQuestion();
    return { room, players, token: currentQuestion().assetToken, answer: room.questions[0]!.id };
  }

  it('scores a correct guess against the server clock', () => {
    const { players, token, answer } = playing();
    const result = manager.submitGuess(players[0]!.id, token, answer);
    expect(result.ok && result.value.correct).toBe(true);
    // Stage 0 with the whole 30 seconds left: the maximum a question can pay.
    expect(result.ok && result.value.score).toBe(750);
  });

  it('pays less for the same picture found later', () => {
    const { players, token, answer } = playing();
    const first = manager.submitGuess(players[0]!.id, token, answer);
    // Six seconds in: still maximum blur, but a fifth of the clock is gone.
    clock.advance(6 * SECOND);
    const second = manager.submitGuess(players[1]!.id, token, answer);
    expect(first.ok && second.ok && first.value.score! > second.value.score!).toBe(true);
  });

  it('lets a player keep guessing, and charges for each miss', () => {
    const { room, players, token, answer } = playing();
    const wrong = roster.find((celebrity) => celebrity.id !== answer)!.id;
    const first = manager.submitGuess(players[0]!.id, token, wrong);
    expect(first.ok && first.value.correct).toBe(false);
    expect(first.ok && first.value.wrongGuesses).toBe(1);

    const second = manager.submitGuess(players[0]!.id, token, answer);
    expect(second.ok && second.value.correct).toBe(true);
    // 500 − 80 for the miss, then the full time bonus.
    expect(second.ok && second.value.score).toBe(630);
    expect(room.players.get(players[0]!.id)!.totalScore).toBe(630);
  });

  it('does not charge twice for repeating the same wrong name', () => {
    const { players, token, answer } = playing();
    const wrong = roster.find((celebrity) => celebrity.id !== answer)!.id;
    manager.submitGuess(players[0]!.id, token, wrong);
    const repeat = manager.submitGuess(players[0]!.id, token, wrong);
    expect(repeat.ok && repeat.value.wrongGuesses).toBe(1);
  });

  it('refuses a second guess once the player has it', () => {
    const { players, token, answer } = playing();
    manager.submitGuess(players[0]!.id, token, answer);
    expect(manager.submitGuess(players[0]!.id, token, answer))
      .toEqual({ ok: false, error: 'ALREADY_SOLVED' });
  });

  it('ignores a guess during the 3-2-1', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    const token = currentQuestion().assetToken;
    expect(manager.submitGuess(players[0]!.id, token, room.questions[0]!.id))
      .toEqual({ ok: false, error: 'WRONG_STATE' });
  });

  it('ignores a guess after the buzzer', () => {
    const { players, token, answer } = playing();
    clock.advance(31 * SECOND);
    expect(manager.submitGuess(players[0]!.id, token, answer))
      .toEqual({ ok: false, error: 'WRONG_STATE' });
  });

  it('ignores a guess carrying the previous question’s token', () => {
    const { room, players, answer } = playing();
    clock.advance(30 * SECOND + MULTIPLAYER_CONFIG.REVEAL_DURATION_SECONDS * SECOND);
    expect(room.status).toBe('QUESTION');
    const stale = room.assetTokens[0]!;
    intoQuestion();
    expect(manager.submitGuess(players[0]!.id, stale, answer))
      .toEqual({ ok: false, error: 'WRONG_STATE' });
  });

  it('refuses a guess from someone not in the room', () => {
    const { token, answer } = playing();
    expect(manager.submitGuess('nobody', token, answer))
      .toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });

  it('refuses a celebrity that does not exist', () => {
    const { players, token } = playing();
    expect(manager.submitGuess(players[0]!.id, token, 'not-a-star'))
      .toEqual({ ok: false, error: 'INVALID_GUESS' });
  });
});

describe('the reveal', () => {
  function played() {
    const { room, players } = openRoom(['Host', 'Rahul', 'Sai']);
    manager.startGame(players[0]!.id);
    intoQuestion();
    const token = currentQuestion().assetToken;
    const answer = room.questions[0]!.id;
    manager.submitGuess(players[0]!.id, token, answer);
    clock.advance(10 * SECOND);
    manager.submitGuess(players[1]!.id, token, answer);
    clock.advance(20 * SECOND);
    return { room, players };
  }

  it('names the star only once the question is over', () => {
    const { room } = played();
    expect(room.status).toBe('REVEAL');
    expect(lastReveal().celebrityName).toBe(room.questions[0]!.name);
  });

  it('ranks the question by score, earliest first on a tie', () => {
    const { players } = played();
    const [first, second, third] = lastReveal().results;
    expect(first!.playerId).toBe(players[0]!.id);
    expect(second!.playerId).toBe(players[1]!.id);
    expect(third!.correct).toBe(false);
    expect(third!.score).toBe(0);
  });

  it('runs for the configured ten seconds, then moves on', () => {
    const { room } = played();
    clock.advance(MULTIPLAYER_CONFIG.REVEAL_DURATION_SECONDS * SECOND - 1);
    expect(room.status).toBe('REVEAL');
    clock.advance(1);
    expect(room.status).toBe('QUESTION');
  });

  it('records the blur stage each player solved at', () => {
    const { players } = played();
    const mine = lastReveal().results.find((r) => r.playerId === players[1]!.id)!;
    // Ten seconds into a thirty-second question is a third of the way: stage 1.
    expect(mine.stageIndex).toBe(1);
  });
});

describe('the image gate', () => {
  it('will not serve a stage the room has not reached', async () => {
    const { players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    intoQuestion();
    const token = currentQuestion().assetToken;
    expect(manager.resolveAsset(token)!.maxStage).toBe(0);
    clock.advance(15 * SECOND);
    expect(manager.resolveAsset(token)!.maxStage).toBe(2);
  });

  /** The whole point: the clear photograph is unreachable while anyone can still answer. */
  it('holds the clear photograph back until the reveal', () => {
    const { players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    intoQuestion();
    const token = currentQuestion().assetToken;
    clock.advance(29 * SECOND);
    expect(manager.resolveAsset(token)!.maxStage).toBeLessThan(MAX_ATTEMPTS - 1);
    clock.advance(1 * SECOND);
    expect(manager.resolveAsset(token)!.maxStage).toBe(MAX_ATTEMPTS - 1);
  });

  it('knows nothing about a token it never minted', () => {
    expect(manager.resolveAsset('deadbeef'.repeat(4))).toBeUndefined();
  });
});

describe('dropping out and coming back', () => {
  it('holds the seat, the score and the answer through a reconnect', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    const created = manager.createRoom('Throwaway');
    expect(created.ok).toBe(true);

    manager.startGame(players[0]!.id);
    intoQuestion();
    manager.submitGuess(players[0]!.id, currentQuestion().assetToken, room.questions[0]!.id);
    const scored = room.players.get(players[0]!.id)!.totalScore;

    manager.handleDisconnect(players[0]!.id);
    clock.advance(5 * SECOND);
    const back = manager.resume(room.code, players[0]!.id, players[0]!.token);

    expect(back.ok).toBe(true);
    expect(room.players.get(players[0]!.id)!.connected).toBe(true);
    expect(room.players.get(players[0]!.id)!.totalScore).toBe(scored);
    expect(room.players.get(players[0]!.id)!.current.solved).toBe(true);
  });

  it('refuses a seat claimed with the wrong token', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    expect(manager.resume(room.code, players[0]!.id, 'not-the-token'))
      .toEqual({ ok: false, error: 'NOT_IN_ROOM' });
  });

  it('gives up the seat in the lobby once the grace period passes', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.handleDisconnect(players[1]!.id);
    clock.advance(MULTIPLAYER_CONFIG.RECONNECT_GRACE_PERIOD_SECONDS * SECOND);
    expect(room.players.has(players[1]!.id)).toBe(false);
  });

  /** Mid-game their points still belong on the board, so the seat stays. */
  it('keeps a lost player on the leaderboard mid-game', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    intoQuestion();
    manager.handleDisconnect(players[1]!.id);
    clock.advance(MULTIPLAYER_CONFIG.RECONNECT_GRACE_PERIOD_SECONDS * SECOND);
    expect(room.players.has(players[1]!.id)).toBe(true);
  });

  it('stops waiting on a player who has gone', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.startGame(players[0]!.id);
    intoQuestion();
    manager.submitGuess(players[0]!.id, currentQuestion().assetToken, room.questions[0]!.id);
    expect(room.status).toBe('QUESTION');
    // The only player still thinking drops: there is nobody left to wait for.
    manager.handleDisconnect(players[1]!.id);
    expect(room.status).toBe('REVEAL');
  });
});

describe('cleanup', () => {
  it('sweeps a room nobody has touched', () => {
    openRoom(['Host', 'Rahul']);
    expect(manager.size).toBe(1);
    clock.advance(MULTIPLAYER_CONFIG.ROOM_IDLE_TIMEOUT_MINUTES * 60 * SECOND + SECOND);
    expect(manager.cleanup()).toBe(1);
    expect(manager.size).toBe(0);
  });

  it('leaves a room that is being used alone', () => {
    openRoom(['Host', 'Rahul']);
    clock.advance(5 * 60 * SECOND);
    expect(manager.cleanup()).toBe(0);
    expect(manager.size).toBe(1);
  });

  it('closes a room the moment the last player leaves', () => {
    const { players } = openRoom(['Host', 'Rahul']);
    manager.leaveRoom(players[0]!.id);
    manager.leaveRoom(players[1]!.id);
    expect(manager.size).toBe(0);
  });
});

describe('a room after the game', () => {
  /** Spec §45: a finished game offers a new room; one in progress asks you to wait. */
  it('tells a latecomer the game is over, not that it is running', () => {
    const { room, players } = openRoom(['Host', 'Rahul']);
    manager.updateSettings(players[0]!.id, { questionCount: 1, questionDurationSeconds: 15 });
    manager.startGame(players[0]!.id);
    intoQuestion();
    clock.advance(15 * SECOND + MULTIPLAYER_CONFIG.REVEAL_DURATION_SECONDS * SECOND);

    expect(room.status).toBe('FINAL_RESULTS');
    expect(manager.joinRoom(room.code, 'Latecomer'))
      .toEqual({ ok: false, error: 'GAME_ENDED' });
  });
});
