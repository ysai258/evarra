import { formatPuzzleDate } from './date.ts';
import { MAX_ATTEMPTS } from './reveal.ts';
import type { GameState } from './types.ts';

/**
 * Where the game lives, taken from wherever it is actually being served.
 *
 * A hard-coded domain in the share text is a link that does not work: a shared result
 * is an invitation, and it has to land somewhere real whether the game is on a
 * project subpath, a custom domain or a local dev server.
 */
export function gameUrl(): string {
  if (typeof window === 'undefined') return 'https://ysai258.github.io/evarra/';
  const base = import.meta.env.BASE_URL || '/';
  const url = new URL(base, window.location.origin).href;
  // A project subpath needs its trailing slash; a domain root reads better without.
  return base === '/' ? url.replace(/\/$/, '') : url;
}

/**
 * 🟩 the winning guess · 🟨 a hint that was burned · ⬜ a wrong guess.
 * Deliberately contains no name and no image — the grid must stay spoiler-safe.
 */
export function resultGrid(game: GameState): string {
  const cells: string[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const guessed = attempt < game.guesses.length;
    const isWinningGuess = game.won && attempt === game.guesses.length - 1;
    if (isWinningGuess) cells.push('🟩');
    else if (guessed) cells.push('⬜');
    else cells.push('▫️');
  }
  const hints = '🟨'.repeat(game.hintsUsed.length);
  return hints ? `${cells.join(' ')}  ${hints}` : cells.join(' ');
}

export function generateShareText(game: GameState, options: { url?: string } = {}): string {
  const attempts = game.won ? `${game.guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
  return [
    'EVARRA? 🎬',
    formatPuzzleDate(game.date),
    '',
    resultGrid(game),
    '',
    `${attempts} · ${game.score ?? 0} points`,
    '',
    'Can you beat me?',
    options.url ?? gameUrl(),
  ].join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'failed';

export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'EVARRA?', text });
      return 'shared';
    } catch (err) {
      // A user dismissing the native sheet is not a failure worth falling back on.
      if (err instanceof Error && err.name === 'AbortError') return 'failed';
    }
  }
  return (await copyToClipboard(text)) ? 'copied' : 'failed';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function twitterUrl(text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
