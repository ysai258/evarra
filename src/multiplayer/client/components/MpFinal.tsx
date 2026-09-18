import { useEffect, useState } from 'react';
import { shareResult, twitterUrl, whatsappUrl } from '../../../engine/share.ts';
import { generateMultiplayerShareText, multiplayerGrid, ordinal } from '../../share.ts';
import type { RoomView } from '../../types.ts';
import { roomUrl } from './RoomCodeCard.tsx';

type MpFinalProps = {
  room: RoomView;
  playerId?: string | undefined;
  onToast: (message: string) => void;
  onPlayAgain: () => void;
  onHome: () => void;
};

const MEDALS = ['🥇', '🥈', '🥉'];

/** However many players there are, the board finishes arriving within this. */
const REVEAL_BUDGET_MS = 1400;

/**
 * The end of the game.
 *
 * The leaderboard first, because that is the argument everyone came for, and then the
 * player's own question-by-question card — which is the only part of this screen the
 * server sends privately, since nobody needs a breakdown of how their friends did.
 */
export function MpFinal({ room, playerId, onToast, onPlayAgain, onHome }: MpFinalProps) {
  const final = room.final!;
  const you = final.standings.find((standing) => standing.playerId === playerId);
  const [revealed, setRevealed] = useState(0);

  /**
   * The board fills in from last place upwards, so the winner lands last.
   *
   * Two things this has to get right. The first row appears immediately — a stagger
   * that starts with an empty board reads as a page that failed to load. And the whole
   * run is budgeted rather than paced per row: at a fixed delay a full room of twenty
   * would take five seconds to finish arriving, which stops being a flourish and
   * starts being a wait.
   */
  useEffect(() => {
    const count = final.standings.length;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || count <= 1) {
      setRevealed(count);
      return;
    }
    setRevealed(1);
    let shown = 1;
    const step = Math.min(220, REVEAL_BUDGET_MS / count);
    const timer = window.setInterval(() => {
      shown += 1;
      setRevealed(shown);
      if (shown >= count) window.clearInterval(timer);
    }, step);
    return () => window.clearInterval(timer);
  }, [final.standings.length]);

  const shareText = playerId
    ? generateMultiplayerShareText(final, playerId, { url: roomUrl(room.code) })
    : '';

  async function onShare() {
    const outcome = await shareResult(shareText);
    if (outcome === 'copied') onToast('Result copied — no spoilers inside');
    else if (outcome === 'failed') onToast('Could not share. Select and copy the text instead.');
  }

  return (
    <main className="mp-final">
      <header className="mp-final__head">
        <p className="mp-final__label">🏆 GAME OVER</p>
        {you && (
          <p className="mp-final__place">
            You came <b>{ordinal(you.rank)}</b>
          </p>
        )}
      </header>

      <ol className="mp-final__board">
        {final.standings.map((standing, index) => (
          <li
            key={standing.playerId}
            className={[
              'mp-final__row',
              standing.rank === 1 ? 'mp-final__row--winner' : '',
              standing.playerId === playerId ? 'mp-final__row--you' : '',
              // Counted from the bottom: last place is row zero of the animation.
              index >= final.standings.length - revealed ? 'mp-final__row--in' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="mp-final__rank" aria-hidden="true">
              {MEDALS[standing.rank - 1] ?? standing.rank}
            </span>
            <span className="mp-final__name">{standing.name}</span>
            <span className="mp-final__score mp-mono">
              {standing.totalScore.toLocaleString('en-IN')}
            </span>
          </li>
        ))}
      </ol>

      <p className="mp-final__meta">
        {final.questionCount} questions · {final.playerCount} players
      </p>

      <section className="mp-card">
        <h2 className="mp-card__title">Your game</h2>
        <p className="result__grid" role="img" aria-label="Spoiler-free result grid">
          {multiplayerGrid(final)}
        </p>
        <ol className="mp-card__list">
          {final.scorecard.map((entry) => (
            <li key={entry.questionNumber} className="mp-card__row">
              <span className="mp-mono">Q{entry.questionNumber}</span>
              <span aria-hidden="true">{entry.correct ? '✓' : '✗'}</span>
              <span className="mp-mono">{entry.score}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="result__share">
        <button type="button" className="button button--primary" onClick={() => void onShare()}>
          Share result
        </button>
        <div className="result__share-row">
          <a
            className="button button--subtle"
            href={whatsappUrl(shareText)}
            target="_blank"
            rel="noreferrer noopener"
          >
            WhatsApp
          </a>
          <a
            className="button button--subtle"
            href={twitterUrl(shareText)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Post on X
          </a>
        </div>
      </div>

      <div className="mp-final__actions">
        <button type="button" className="button button--ghost" onClick={onPlayAgain}>
          New room
        </button>
        <button type="button" className="button button--subtle" onClick={onHome}>
          Back to today’s star
        </button>
      </div>
    </main>
  );
}
