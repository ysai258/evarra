/**
 * Every number the multiplayer room runs on, in one place.
 *
 * The server is the only thing that reads these to make decisions; the client reads
 * them to render choices and to reject obvious nonsense before it costs a round trip.
 * Anything a host can set has a MIN and a MAX here, and the server clamps to them —
 * a client that asks for a 900-second question gets 60.
 */
export const MULTIPLAYER_CONFIG = {
  DEFAULT_QUESTION_COUNT: 5,
  MIN_QUESTION_COUNT: 1,
  MAX_QUESTION_COUNT: 20,
  /** What the host's stepper offers. Any value inside the MIN/MAX range is legal. */
  QUESTION_COUNT_CHOICES: [5, 10, 15, 20],

  DEFAULT_QUESTION_DURATION_SECONDS: 30,
  MIN_QUESTION_DURATION_SECONDS: 15,
  MAX_QUESTION_DURATION_SECONDS: 60,
  QUESTION_DURATION_CHOICES: [15, 30, 45, 60],

  /** The answer-and-leaderboard beat between questions. Not host-configurable. */
  REVEAL_DURATION_SECONDS: 10,

  /**
   * The 3-2-1 before a question's clock starts. The server simply sets `startedAt`
   * this far in the future, so the countdown and the timer are the same timestamp
   * rather than two things that have to be kept in step.
   */
  COUNTDOWN_MS: 3000,

  MIN_PLAYERS: 2,
  MAX_PLAYERS: 20,

  /**
   * How long a dropped player keeps their seat, their score and their turn. Long
   * enough to cover a tunnel or a page refresh, short enough that a closed tab does
   * not hold up the room.
   */
  RECONNECT_GRACE_PERIOD_SECONDS: 30,

  ROOM_CODE_LENGTH: 6,

  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 20,

  /** A room with nobody in it, or a finished game, is swept after this long. */
  ROOM_IDLE_TIMEOUT_MINUTES: 30,
  CLEANUP_INTERVAL_MS: 60_000,
} as const;

/** Milliseconds a room may sit untouched before cleanup removes it. */
export const ROOM_IDLE_TIMEOUT_MS =
  MULTIPLAYER_CONFIG.ROOM_IDLE_TIMEOUT_MINUTES * 60_000;

export function clampQuestionCount(value: number): number {
  return clampInteger(
    value,
    MULTIPLAYER_CONFIG.MIN_QUESTION_COUNT,
    MULTIPLAYER_CONFIG.MAX_QUESTION_COUNT,
    MULTIPLAYER_CONFIG.DEFAULT_QUESTION_COUNT,
  );
}

export function clampQuestionDuration(seconds: number): number {
  return clampInteger(
    seconds,
    MULTIPLAYER_CONFIG.MIN_QUESTION_DURATION_SECONDS,
    MULTIPLAYER_CONFIG.MAX_QUESTION_DURATION_SECONDS,
    MULTIPLAYER_CONFIG.DEFAULT_QUESTION_DURATION_SECONDS,
  );
}

/** A non-number from an untrusted payload falls back rather than poisoning the room. */
function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
