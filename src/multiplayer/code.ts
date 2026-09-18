import { MULTIPLAYER_CONFIG } from './config.ts';

/**
 * Room codes.
 *
 * Six characters, read aloud across a room and typed on a phone, so the alphabet drops
 * every pair that gets confused in that setting: O/0, I/1, and S/5. What is left is 31
 * symbols — about 8.9 × 10^8 codes, which is far more than a hobby game will ever hold
 * at once, so collisions are handled by retrying rather than by being clever.
 *
 * Generation is `crypto.getRandomValues`, not `Math.random` (spec §93): a predictable
 * code is a room anyone can walk into.
 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRTUVWXYZ';

export function generateRoomCode(
  random: (size: number) => Uint8Array = cryptoBytes,
): string {
  const length = MULTIPLAYER_CONFIG.ROOM_CODE_LENGTH;
  const bytes = random(length);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    // The alphabet is 31 long and a byte holds 256 values, so the modulo is very
    // slightly biased towards the first few symbols. For picking a room name that
    // does not matter; it is not a secret anyone is guessing offline.
    code += ROOM_CODE_ALPHABET[bytes[index]! % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

function cryptoBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Accepts what a human typed and returns the canonical code, or undefined.
 *
 * People paste codes with spaces and hyphens and type them in lower case, so all of
 * that is forgiven. A character the alphabet deliberately dropped is not: someone who
 * typed O may have meant Q, or D, or nothing at all, and guessing would walk them into
 * a stranger's room. Better to say the code is wrong than to send them somewhere.
 */
export function normalizeRoomCode(input: string): string | undefined {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== MULTIPLAYER_CONFIG.ROOM_CODE_LENGTH) return undefined;
  return [...cleaned].every((character) => ROOM_CODE_ALPHABET.includes(character))
    ? cleaned
    : undefined;
}

export function isRoomCode(input: string): boolean {
  return normalizeRoomCode(input) !== undefined;
}
