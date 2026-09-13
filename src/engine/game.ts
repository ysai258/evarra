import { availableHints } from './hints.ts';
import { namesMatch } from './normalize.ts';
import { MAX_ATTEMPTS } from './reveal.ts';
import { calculateScore } from './scoring.ts';
import { STORAGE_KEYS, readStore, removeStore, writeStore } from './storage.ts';
import type { Celebrity, GameState } from './types.ts';

/**
 * The game engine. Every function here is pure — the UI holds no rules, and the
 * same engine can drive a future challenge mode or a server-side implementation.
 */

export function createGame(date: string, celebrityId: string): GameState {
  return {
    date,
    celebrityId,
    currentStage: 0,
    guesses: [],
    hintsUsed: [],
    completed: false,
    won: false,
  };
}

export type GuessOutcome = {
  state: GameState;
  correct: boolean;
  /** True when this guess ended the game (either way). */
  finished: boolean;
};

export function submitGuess(
  state: GameState,
  guess: string,
  answer: Celebrity,
): GuessOutcome {
  if (state.completed) return { state, correct: false, finished: true };

  const cleaned = guess.trim();
  if (!cleaned) return { state, correct: false, finished: false };

  const correct = namesMatch(cleaned, answer);
  const guesses = [...state.guesses, cleaned];
  const attemptsUsed = guesses.length;

  if (correct) {
    return {
      state: {
        ...state,
        guesses,
        // Winning always reveals the photo completely.
        currentStage: MAX_ATTEMPTS - 1,
        completed: true,
        won: true,
        score: calculateScore({
          stageIndex: state.currentStage,
          hintsUsed: state.hintsUsed.length,
          won: true,
        }),
      },
      correct: true,
      finished: true,
    };
  }

  const outOfAttempts = attemptsUsed >= MAX_ATTEMPTS;
  return {
    state: {
      ...state,
      guesses,
      currentStage: Math.min(attemptsUsed, MAX_ATTEMPTS - 1),
      completed: outOfAttempts,
      won: false,
      ...(outOfAttempts ? { score: 0 } : {}),
    },
    correct: false,
    finished: outOfAttempts,
  };
}

/** Burns the next hint. Each one costs 50 points off the final score. */
export function revealHint(state: GameState, answer: Celebrity): GameState {
  if (state.completed) return state;
  const total = availableHints(answer).length;
  const next = state.hintsUsed.length;
  if (next >= total) return state;
  return { ...state, hintsUsed: [...state.hintsUsed, next] };
}

/** Gives up on the current stage: clears more of the photo at the cost of an attempt. */
export function revealNextStage(state: GameState): GameState {
  if (state.completed || state.currentStage >= MAX_ATTEMPTS - 1) return state;
  return { ...state, currentStage: state.currentStage + 1 };
}

export function attemptsRemaining(state: GameState): number {
  return Math.max(0, MAX_ATTEMPTS - state.guesses.length);
}

/** Every day the player has opened, keyed by puzzle date. */
export type GameArchive = Record<string, GameState>;

function isGameState(value: unknown): value is GameState {
  const state = value as GameState | null;
  return Boolean(
    state
    && typeof state.date === 'string'
    && typeof state.celebrityId === 'string'
    && Array.isArray(state.guesses)
    && Array.isArray(state.hintsUsed),
  );
}

/**
 * Reads every stored day, folding in the single-day record earlier versions wrote so
 * a returning player keeps the game they were part way through.
 */
export function loadArchive(): GameArchive {
  const stored = readStore<Record<string, unknown>>(STORAGE_KEYS.games, {});
  const archive: GameArchive = {};
  for (const [date, state] of Object.entries(stored)) {
    if (isGameState(state) && state.date === date) archive[date] = state;
  }

  const legacy = readStore<unknown>(STORAGE_KEYS.legacyGameState, null);
  if (isGameState(legacy) && !archive[legacy.date]) {
    archive[legacy.date] = legacy;
    writeStore(STORAGE_KEYS.games, archive);
    removeStore(STORAGE_KEYS.legacyGameState);
  }

  return archive;
}

export function loadGame(date: string): GameState | undefined {
  return loadArchive()[date];
}

export function saveGame(state: GameState): void {
  writeStore(STORAGE_KEYS.games, { ...loadArchive(), [state.date]: state });
}

export function clearGame(): void {
  removeStore(STORAGE_KEYS.games);
  removeStore(STORAGE_KEYS.legacyGameState);
}
