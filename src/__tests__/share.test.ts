import { describe, expect, it } from 'vitest';
import { generateShareText, resultGrid } from '../engine/share.ts';
import type { GameState } from '../engine/types.ts';

function game(overrides: Partial<GameState> = {}): GameState {
  return {
    date: '2026-09-12',
    celebrityId: 'prabhas',
    currentStage: 2,
    guesses: ['a', 'b', 'Prabhas'],
    hintsUsed: [0],
    score: 250,
    completed: true,
    won: true,
    ...overrides,
  };
}

describe('share text', () => {
  it('never leaks the answer', () => {
    const text = generateShareText(game());
    expect(text.toLowerCase()).not.toContain('prabhas');
    expect(text).not.toContain('celebrityId');
  });

  it('shows the date, grid, attempts and score', () => {
    const text = generateShareText(game());
    expect(text).toContain('EVARRA? 🎬');
    expect(text).toContain('September 12, 2026');
    expect(text).toContain('3/5 · 250 points');
  });

  it('marks a loss with X of 5', () => {
    const text = generateShareText(game({ won: false, score: 0, guesses: ['a', 'b', 'c', 'd', 'e'] }));
    expect(text).toContain('X/5 · 0 points');
  });

  it('marks the winning guess green and earlier guesses white', () => {
    expect(resultGrid(game({ hintsUsed: [] }))).toBe('⬜ ⬜ 🟩 ▫️ ▫️');
  });

  it('appends one yellow square per hint used', () => {
    expect(resultGrid(game({ hintsUsed: [0, 1] }))).toContain('🟨🟨');
  });

  it('has no green square for a lost game', () => {
    const grid = resultGrid(game({ won: false, guesses: ['a', 'b', 'c', 'd', 'e'], hintsUsed: [] }));
    expect(grid).toBe('⬜ ⬜ ⬜ ⬜ ⬜');
  });

  it('accepts a custom url', () => {
    expect(generateShareText(game(), { url: 'https://example.test' })).toContain('https://example.test');
  });

  it('points at wherever the game is served, not a hard-coded domain', () => {
    const text = generateShareText(game());
    expect(text).toContain(window.location.origin);
    expect(text).not.toContain('evarra.app');
  });
});
