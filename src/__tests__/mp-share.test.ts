import { describe, expect, it } from 'vitest';
import { generateMultiplayerShareText, multiplayerGrid, ordinal } from '../multiplayer/share.ts';
import type { FinalResults } from '../multiplayer/types.ts';

const final: FinalResults = {
  questionCount: 5,
  playerCount: 4,
  standings: [
    { playerId: 'a', name: 'Rahul', totalScore: 2842, correctAnswers: 5, rank: 1 },
    { playerId: 'b', name: 'Yashwanth', totalScore: 2491, correctAnswers: 4, rank: 2 },
  ],
  scorecard: [
    { questionNumber: 1, correct: true, score: 684 },
    { questionNumber: 2, correct: true, score: 512 },
    { questionNumber: 3, correct: false, score: 0 },
    { questionNumber: 4, correct: true, score: 391 },
    { questionNumber: 5, correct: true, score: 904 },
  ],
};

describe('multiplayer share', () => {
  it('counts ranks the way English does', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });

  it('draws one square per question', () => {
    expect(multiplayerGrid(final)).toBe('🟩 🟩 ⬜ 🟩 🟩');
  });

  it('says where you came and what you scored', () => {
    const text = generateMultiplayerShareText(final, 'b', { url: 'https://example.test/room/AB7K9Q' });
    expect(text).toContain('🥈 2nd place');
    expect(text).toContain('2,491 points');
    expect(text).toContain('5 questions · 4 players');
    expect(text).toContain('https://example.test/room/AB7K9Q');
  });

  /** The grid is an invitation, not a spoiler — no name may survive into it. */
  it('names nobody from the game', () => {
    const text = generateMultiplayerShareText(final, 'b', { url: 'https://example.test' });
    expect(text).not.toContain('Rahul');
    expect(text).not.toContain('Yashwanth');
  });
});
