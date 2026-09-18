import { describe, expect, it } from 'vitest';
import { MULTIPLAYER_CONFIG, clampQuestionCount, clampQuestionDuration } from '../multiplayer/config.ts';
import { ROOM_CODE_ALPHABET, generateRoomCode, isRoomCode, normalizeRoomCode } from '../multiplayer/code.ts';
import { isValidPlayerName, normalizePlayerName } from '../multiplayer/name.ts';

describe('room codes', () => {
  it('is the configured length and only uses the safe alphabet', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const code = generateRoomCode();
      expect(code).toHaveLength(MULTIPLAYER_CONFIG.ROOM_CODE_LENGTH);
      for (const character of code) expect(ROOM_CODE_ALPHABET).toContain(character);
    }
  });

  it('leaves out the characters people mishear', () => {
    for (const confusable of ['O', '0', 'I', '1', 'S']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(confusable);
    }
  });

  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateRoomCode()));
    expect(codes.size).toBe(500);
  });

  it('forgives case, spaces and punctuation', () => {
    expect(normalizeRoomCode(' ab7k9q ')).toBe('AB7K9Q');
    expect(normalizeRoomCode('AB7-K9Q')).toBe('AB7K9Q');
  });

  /** Guessing at O would walk someone into a stranger's room. Better to refuse. */
  it('refuses a code containing an excluded character', () => {
    expect(normalizeRoomCode('AB7K9O')).toBeUndefined();
    expect(normalizeRoomCode('AB7K91')).toBeUndefined();
    expect(isRoomCode('ABSK9Q')).toBe(false);
  });

  it('refuses the wrong length', () => {
    expect(normalizeRoomCode('AB7K9')).toBeUndefined();
    expect(normalizeRoomCode('AB7K9QQ')).toBeUndefined();
    expect(normalizeRoomCode('')).toBeUndefined();
  });
});

describe('player names', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizePlayerName('  Rahul  ')).toBe('Rahul');
    expect(normalizePlayerName('Mahesh   Babu')).toBe('Mahesh Babu');
  });

  it('strips control characters that would break a leaderboard row', () => {
    expect(normalizePlayerName('Sai‮kiran')).toBe('Saikiran');
    expect(normalizePlayerName('Kiran\nRaj')).toBe('Kiran Raj');
  });

  it('holds the length limits', () => {
    expect(isValidPlayerName('A')).toBe(false);
    expect(isValidPlayerName('  ')).toBe(false);
    expect(isValidPlayerName('Ab')).toBe(true);
    expect(normalizePlayerName('x'.repeat(50))).toHaveLength(MULTIPLAYER_CONFIG.MAX_NAME_LENGTH);
    expect(isValidPlayerName('x'.repeat(50))).toBe(true);
  });
});

describe('settings clamps', () => {
  it('pulls anything out of range back inside it', () => {
    expect(clampQuestionCount(999)).toBe(MULTIPLAYER_CONFIG.MAX_QUESTION_COUNT);
    expect(clampQuestionCount(0)).toBe(MULTIPLAYER_CONFIG.MIN_QUESTION_COUNT);
    expect(clampQuestionDuration(9000)).toBe(MULTIPLAYER_CONFIG.MAX_QUESTION_DURATION_SECONDS);
    expect(clampQuestionDuration(1)).toBe(MULTIPLAYER_CONFIG.MIN_QUESTION_DURATION_SECONDS);
  });

  it('falls back rather than trusting a non-number from the wire', () => {
    expect(clampQuestionCount(Number.NaN)).toBe(MULTIPLAYER_CONFIG.DEFAULT_QUESTION_COUNT);
    expect(clampQuestionDuration(Number.POSITIVE_INFINITY))
      .toBe(MULTIPLAYER_CONFIG.DEFAULT_QUESTION_DURATION_SECONDS);
  });
});
