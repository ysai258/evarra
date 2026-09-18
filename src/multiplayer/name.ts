import { MULTIPLAYER_CONFIG } from './config.ts';

/**
 * Player names.
 *
 * Whitespace is collapsed first, so a pasted newline becomes the space it looked
 * like rather than gluing two words together; what is left is trimmed,
 * length-checked, and stripped of control characters — the last of those
 * because a name is rendered in a dozen places and a stray newline or bidi override
 * would wreck a leaderboard. React escapes the rest, so nothing here is fighting
 * markup injection (spec §92); this is only about a name staying one readable line.
 *
 * Names need not be unique. Two friends both called Sai are told apart by player id
 * everywhere it matters, and asking them to pick nicknames is a worse experience than
 * seeing two Sais in a lobby.
 */
export function normalizePlayerName(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e]/gu, '')
    .trim()
    .slice(0, MULTIPLAYER_CONFIG.MAX_NAME_LENGTH);
}

export function isValidPlayerName(input: string): boolean {
  const name = normalizePlayerName(input);
  return name.length >= MULTIPLAYER_CONFIG.MIN_NAME_LENGTH
    && name.length <= MULTIPLAYER_CONFIG.MAX_NAME_LENGTH;
}
