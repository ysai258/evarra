import { beforeEach, describe, expect, it } from 'vitest';
import {
  attemptsRemaining,
  clearGame,
  createGame,
  loadGame,
  revealHint,
  revealNextStage,
  saveGame,
  submitGuess,
} from '../engine/game.ts';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { HINT_PENALTY, MAX_SCORE, baseScoreForStage } from '../engine/scoring.ts';
import { makeCelebrity } from './factories.ts';

const answer = makeCelebrity({
  id: 'prabhas',
  name: 'Prabhas',
  aliases: ['Rebel Star', 'Prabhas Raju Uppalapati'],
  hints: {
    era: 'A Telugu actor working from the 2000s through to 2024.',
    origin: 'They were born in Chennai.',
    director: 'They have worked with director S. S. Rajamouli.',
    film: 'They were in Mirchi (2013).',
    signature: 'They are best known for Baahubali: The Beginning (2015).',
  },
});

const decoy = makeCelebrity({ id: 'mahesh-babu', name: 'Mahesh Babu' });

function play(guesses: readonly string[]) {
  let state = createGame('2026-09-12', answer.id);
  for (const guess of guesses) state = submitGuess(state, guess, answer).state;
  return state;
}

describe('submitGuess', () => {
  it('starts at the most blurred stage with all attempts available', () => {
    const state = createGame('2026-09-12', answer.id);
    expect(state.currentStage).toBe(0);
    expect(attemptsRemaining(state)).toBe(MAX_ATTEMPTS);
    expect(state.completed).toBe(false);
  });

  it('wins on a correct first guess for the full 500', () => {
    const { state, correct, finished } = submitGuess(createGame('d', answer.id), 'Prabhas', answer);
    expect(correct).toBe(true);
    expect(finished).toBe(true);
    expect(state.won).toBe(true);
    expect(state.score).toBe(500);
    expect(state.currentStage).toBe(MAX_ATTEMPTS - 1);
  });

  it('accepts an alias as a correct answer', () => {
    expect(submitGuess(createGame('d', answer.id), 'rebel star', answer).correct).toBe(true);
  });

  it('advances a stage for each wrong guess', () => {
    const state = play([decoy.name]);
    expect(state.currentStage).toBe(1);
    expect(state.guesses).toEqual([decoy.name]);
    expect(state.completed).toBe(false);
  });

  it('scores by the stage that was on screen when the guess was made', () => {
    let state = play(['wrong one', 'wrong two']);
    state = submitGuess(state, 'Prabhas', answer).state;
    expect(state.score).toBe(baseScoreForStage(2));
  });

  it('ends the game after five wrong guesses with a score of zero', () => {
    const state = play(['a', 'b', 'c', 'd', 'e']);
    expect(state.completed).toBe(true);
    expect(state.won).toBe(false);
    expect(state.score).toBe(0);
    expect(attemptsRemaining(state)).toBe(0);
    expect(state.currentStage).toBe(MAX_ATTEMPTS - 1);
  });

  it('ignores an empty guess instead of burning an attempt', () => {
    const { state, finished } = submitGuess(createGame('d', answer.id), '   ', answer);
    expect(state.guesses).toHaveLength(0);
    expect(finished).toBe(false);
  });

  it('cannot be replayed once completed', () => {
    const finished = play(['a', 'b', 'c', 'd', 'e']);
    const after = submitGuess(finished, 'Prabhas', answer);
    expect(after.state).toBe(finished);
    expect(after.correct).toBe(false);
    expect(after.state.won).toBe(false);
  });
});

describe('revealHint', () => {
  it('reveals hints in order and reduces the eventual score', () => {
    let state = createGame('d', answer.id);
    state = revealHint(state, answer);
    state = revealHint(state, answer);
    expect(state.hintsUsed).toEqual([0, 1]);
    state = submitGuess(state, 'Prabhas', answer).state;
    expect(state.score).toBe(MAX_SCORE - 2 * HINT_PENALTY);
  });

  it('stops at the number of hints the dataset actually has', () => {
    let state = createGame('d', answer.id);
    for (let i = 0; i < 10; i += 1) state = revealHint(state, answer);
    expect(state.hintsUsed).toHaveLength(5);
  });

  it('does nothing after the game ends', () => {
    const finished = play(['a', 'b', 'c', 'd', 'e']);
    expect(revealHint(finished, answer)).toBe(finished);
  });
});

describe('revealNextStage', () => {
  it('clears the photo one step further', () => {
    expect(revealNextStage(createGame('d', answer.id)).currentStage).toBe(1);
  });

  it('never goes past the final stage', () => {
    let state = createGame('d', answer.id);
    for (let i = 0; i < 10; i += 1) state = revealNextStage(state);
    expect(state.currentStage).toBe(MAX_ATTEMPTS - 1);
  });
});

describe('persistence', () => {
  beforeEach(() => {
    clearGame();
  });

  it('restores an in-progress game across a refresh', () => {
    const state = play(['wrong']);
    saveGame(state);
    expect(loadGame('2026-09-12')).toEqual(state);
  });

  it('restores a completed game so it cannot be replayed', () => {
    const state = play(['a', 'b', 'c', 'd', 'e']);
    saveGame(state);
    const restored = loadGame('2026-09-12');
    expect(restored?.completed).toBe(true);
    expect(restored?.guesses).toHaveLength(5);
  });

  it('ignores yesterday’s saved game', () => {
    saveGame(play(['wrong']));
    expect(loadGame('2026-09-13')).toBeUndefined();
  });

  it('ignores a corrupted record', () => {
    window.localStorage.setItem('evarra:v3:games', '{"2026-09-12":{"date":"2026-09-12"}}');
    expect(loadGame('2026-09-12')).toBeUndefined();
  });

  it('drops progress saved under an earlier schedule', () => {
    const old = play(['a', 'b', 'c', 'd', 'e']);
    window.localStorage.setItem('evaru-ra:games', JSON.stringify({ [old.date]: old }));
    window.localStorage.setItem('evaru-ra:game', JSON.stringify(old));
    expect(loadGame(old.date)).toBeUndefined();
    expect(window.localStorage.getItem('evaru-ra:games')).toBeNull();
    expect(window.localStorage.getItem('evaru-ra:game')).toBeNull();
  });
});
