import { gameUrl } from '../engine/share.ts';
import type { FinalResults } from './types.ts';

/**
 * The brag.
 *
 * Same rules as the daily share (`engine/share.ts`): a grid, a number, and not one
 * word that spoils a face. The room link goes with it because a multiplayer result is
 * really an invitation — the point is the rematch (spec §44).
 */
export function ordinal(rank: number): string {
  const tens = rank % 100;
  if (tens >= 11 && tens <= 13) return `${rank}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][rank % 10] ?? 'th';
  return `${rank}${suffix}`;
}

/** 🟩 found · ⬜ missed. The same vocabulary the daily grid uses. */
export function multiplayerGrid(final: FinalResults): string {
  return final.scorecard.map((entry) => (entry.correct ? '🟩' : '⬜')).join(' ');
}

export function generateMultiplayerShareText(
  final: FinalResults,
  playerId: string,
  options: { url?: string } = {},
): string {
  const you = final.standings.find((standing) => standing.playerId === playerId);
  const medal = you && you.rank <= 3 ? ['🥇', '🥈', '🥉'][you.rank - 1]! : '🏆';

  return [
    'EVARRA? 🎬',
    'MULTIPLAYER',
    '',
    `${final.questionCount} questions · ${final.playerCount} players`,
    '',
    `${medal} ${you ? ordinal(you.rank) : '—'} place`,
    '',
    multiplayerGrid(final),
    '',
    `${(you?.totalScore ?? 0).toLocaleString('en-IN')} points`,
    '',
    'Can you beat me?',
    options.url ?? gameUrl(),
  ].join('\n');
}
