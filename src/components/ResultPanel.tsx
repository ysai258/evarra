import { useEffect, useState } from 'react';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { MAX_SCORE, rankFor } from '../engine/scoring.ts';
import { stageAt } from '../engine/reveal.ts';
import {
  generateShareText, resultGrid, shareResult, twitterUrl, whatsappUrl,
} from '../engine/share.ts';
import type { Celebrity, GameState, Stats } from '../engine/types.ts';
import { Countdown } from './Countdown.tsx';

type ResultPanelProps = {
  game: GameState;
  celebrity: Celebrity;
  stats: Stats;
  /** A countdown only means something on today's puzzle. */
  isToday: boolean;
  onToast: (message: string) => void;
  onBrowseArchive: () => void;
};

/** Counts a number up — the payoff moment, so it gets one small flourish. */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || target === 0) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const duration = 700;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return value;
}

export function ResultPanel({
  game, celebrity, stats, isToday, onToast, onBrowseArchive,
}: ResultPanelProps) {
  const score = game.score ?? 0;
  const rank = rankFor(score);
  const shareText = generateShareText(game);
  const displayed = useCountUp(score, true);
  const winningStage = game.won ? stageAt(game.guesses.length - 1) : undefined;

  async function onShare() {
    const outcome = await shareResult(shareText);
    if (outcome === 'copied') onToast('Result copied — no spoilers inside');
    else if (outcome === 'failed') onToast('Could not share. Select and copy the text instead.');
  }

  return (
    <section className="result" aria-live="polite">
      <p className="result__rank" style={game.won ? undefined : { color: 'var(--muted)' }}>
        {game.won ? rank.label : 'NOT TODAY'}
      </p>
      <p className="result__blurb">{game.won ? rank.blurb : 'That one got away. Tomorrow is another star.'}</p>

      <div>
        <p className="result__name">{celebrity.name}</p>
        {celebrity.nameTelugu && <p className="result__telugu telugu">{celebrity.nameTelugu}</p>}
      </div>

      <p className="result__score">
        {displayed}
        <small> / {MAX_SCORE}</small>
      </p>

      {game.won && winningStage && (
        <p className="result__detail">
          Recognised at <b>{winningStage.blurPercent}% blur</b> in{' '}
          <b>{game.guesses.length} of {MAX_ATTEMPTS}</b>
          {game.hintsUsed.length > 0 && (
            <> with <b>{game.hintsUsed.length} {game.hintsUsed.length === 1 ? 'clue' : 'clues'}</b></>
          )}
        </p>
      )}

      <p className="result__grid" role="img" aria-label="Spoiler-free result grid">
        {resultGrid(game)}
      </p>

      {stats.currentStreak > 1 && (
        <p className="result__streak">🔥 {stats.currentStreak} day streak</p>
      )}

      <div className="result__share">
        <button type="button" className="button button--primary" onClick={onShare}>
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

      {isToday ? (
        <Countdown />
      ) : (
        <button type="button" className="button button--ghost" onClick={onBrowseArchive}>
          Pick another day
        </button>
      )}
    </section>
  );
}
