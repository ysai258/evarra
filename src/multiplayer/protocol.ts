import type {
  FinalResults, PublicPlayer, PublicQuestion, RevealState, RoomView,
} from './types.ts';

/**
 * The wire protocol, as two typed maps.
 *
 * Socket.IO will happily carry anything; naming every event and its payload here is
 * what stops that turning into untyped strings sprayed across the codebase (spec §55).
 * Both ends import these maps, so a renamed field breaks the build rather than the game.
 *
 * Requests that need an answer use acknowledgements rather than a matching pair of
 * events — the client asks, the server replies to that one caller, and nothing has to
 * correlate a response with a request by hand.
 */

export type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string };

/**
 * Failures the client is expected to handle. The client maps these to its own copy;
 * the `message` alongside is a readable fallback, never a raw server error (spec §79).
 */
export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'GAME_ALREADY_STARTED'
  | 'GAME_ENDED'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_NAME'
  | 'INVALID_CODE'
  | 'INVALID_GUESS'
  | 'WRONG_STATE'
  | 'ALREADY_SOLVED'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR';

export type CreateRoomRequest = { name: string };
export type JoinRoomRequest = { code: string; name: string };
/** Returning to a seat after a refresh or a dropped connection. */
export type ResumeRequest = { code: string; playerId: string; token: string };

export type JoinedPayload = {
  playerId: string;
  /** Proves this player owns that seat when they come back. Never shown, never shared. */
  token: string;
  room: RoomView;
};

export type UpdateSettingsRequest = {
  questionCount: number;
  questionDurationSeconds: number;
};

export type SubmitGuessRequest = {
  /** Scopes the guess to one question, so a late packet cannot land on the next one. */
  assetToken: string;
  celebrityId: string;
};

export type GuessResultPayload = {
  correct: boolean;
  /** The name the player chose, echoed so their own screen can show it. */
  celebrityId: string;
  wrongGuesses: number;
  /** Their score for this question, present only once they have it right. */
  score?: number;
};

/** Client -> server. Every one of these carries an acknowledgement. */
export type ClientEvents = {
  'room:create': (request: CreateRoomRequest, ack: (result: Ack<JoinedPayload>) => void) => void;
  'room:join': (request: JoinRoomRequest, ack: (result: Ack<JoinedPayload>) => void) => void;
  'room:resume': (request: ResumeRequest, ack: (result: Ack<JoinedPayload>) => void) => void;
  'room:leave': (ack: (result: Ack<null>) => void) => void;
  'room:settings': (request: UpdateSettingsRequest, ack: (result: Ack<RoomView>) => void) => void;
  'game:start': (ack: (result: Ack<null>) => void) => void;
  'game:guess': (request: SubmitGuessRequest, ack: (result: Ack<GuessResultPayload>) => void) => void;
  /** Clock synchronisation: the server stamps its own time into the reply. */
  'time:sync': (clientSentAt: number, ack: (serverNow: number) => void) => void;
};

/** Server -> client. Broadcasts; none of them expect a reply. */
export type ServerEvents = {
  'room:state': (room: RoomView) => void;
  'room:playerJoined': (player: PublicPlayer) => void;
  'room:playerLeft': (playerId: string) => void;
  'room:hostChanged': (hostPlayerId: string) => void;
  'game:question': (question: PublicQuestion, players: PublicPlayer[]) => void;
  /** Someone got it right, or their connection state changed. Never says who guessed what. */
  'game:progress': (players: PublicPlayer[]) => void;
  'game:reveal': (reveal: RevealState) => void;
  'game:final': (final: FinalResults) => void;
  'game:ended': () => void;
  'room:error': (error: { error: ErrorCode; message: string }) => void;
};

/** Human-readable fallbacks, used when the client has nothing more specific to say. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  ROOM_NOT_FOUND: 'Room not found. It may have expired, or the game may have ended.',
  ROOM_FULL: 'This room is full. Try another room.',
  GAME_ALREADY_STARTED: 'The game has already started. You can’t join this one.',
  GAME_ENDED: 'This game has ended.',
  NOT_HOST: 'Only the host can do that.',
  NOT_IN_ROOM: 'You’re not in this room any more.',
  NOT_ENOUGH_PLAYERS: 'Waiting for at least one more player…',
  INVALID_NAME: 'Please enter a name between 2 and 20 characters.',
  INVALID_CODE: 'That room code doesn’t look right.',
  INVALID_GUESS: 'Unable to submit your guess. Please try again.',
  WRONG_STATE: 'That isn’t possible right now.',
  ALREADY_SOLVED: 'You’ve already got this one.',
  RATE_LIMITED: 'Slow down a moment, then try again.',
  SERVER_ERROR: 'Something went wrong. Please try again.',
};
