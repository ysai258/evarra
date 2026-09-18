/**
 * The shapes that cross the wire.
 *
 * Everything here is a *public view*: what the server is willing to tell a player
 * about a room. The server's own richer record (which celebrity each question is,
 * what everyone guessed) lives in `server/room-manager.ts` and never leaves it.
 */

export type RoomStatus =
  | 'LOBBY'
  | 'QUESTION'
  | 'REVEAL'
  | 'FINAL_RESULTS'
  | 'ENDED';

export type RoomSettings = {
  questionCount: number;
  questionDurationSeconds: number;
  revealDurationSeconds: number;
};

/** A player as everyone else sees them. Carries no guess and no score-in-progress. */
export type PublicPlayer = {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  totalScore: number;
  /** True once this player has the current question right — never *what* they said. */
  solved: boolean;
};

/**
 * The live question, minus the answer.
 *
 * `assetToken` is the only handle on the photograph: an opaque, per-question id the
 * server exchanges for image bytes. The celebrity's name, id and filename all stay
 * on the server until REVEAL.
 */
export type PublicQuestion = {
  index: number;
  number: number;
  total: number;
  assetToken: string;
  /** Server epoch ms. The 3-2-1 runs until this moment; the clock starts on it. */
  startedAt: number;
  endsAt: number;
  durationMs: number;
};

/** One player's line on the question-just-played leaderboard. */
export type QuestionResult = {
  playerId: string;
  name: string;
  correct: boolean;
  score: number;
  wrongGuesses: number;
  /** Server epoch ms of the correct guess; absent when they never got it. */
  solvedAt?: number;
  /** 0-based blur stage they solved at, for the "recognised at 75% blur" line. */
  stageIndex?: number;
};

export type RevealState = {
  questionNumber: number;
  total: number;
  celebrityId: string;
  celebrityName: string;
  celebrityNameTelugu?: string;
  assetToken: string;
  attribution?: {
    sourceUrl: string;
    sourceName: string;
    license?: string;
    attribution?: string;
  };
  results: QuestionResult[];
  standings: Standing[];
  endsAt: number;
};

export type Standing = {
  playerId: string;
  name: string;
  totalScore: number;
  correctAnswers: number;
  rank: number;
};

/** Everything a player needs to draw the room, whatever state it is in. */
export type RoomView = {
  code: string;
  status: RoomStatus;
  hostPlayerId: string;
  settings: RoomSettings;
  players: PublicPlayer[];
  question?: PublicQuestion;
  reveal?: RevealState;
  final?: FinalResults;
};

export type FinalResults = {
  standings: Standing[];
  questionCount: number;
  playerCount: number;
  /** Per-question score for the player who asked — their own card, nobody else's. */
  scorecard: ScorecardEntry[];
};

export type ScorecardEntry = {
  questionNumber: number;
  correct: boolean;
  score: number;
};

/** What a player stores locally so a refresh returns them to their seat. */
export type StoredSession = {
  code: string;
  playerId: string;
  token: string;
  name: string;
};
