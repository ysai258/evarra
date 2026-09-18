import { stageAt } from '../../../engine/reveal.ts';
import type { RoomView } from '../../types.ts';
import { secondsUntil, useServerClock } from '../useServerClock.ts';
import { MpPhoto } from './MpPhoto.tsx';

type MpRevealProps = {
  room: RoomView;
  playerId?: string | undefined;
};

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * The answer, and the damage.
 *
 * Ten seconds, server-timed, between every question (spec §36, §39) — long enough to
 * read the name and find your row, short enough that the room does not go cold. The
 * countdown comes from the server's own `endsAt`, so nobody advances themselves.
 *
 * Both tables are here on purpose: this question alone is where the drama is, and the
 * running total is what makes the next question matter.
 */
export function MpReveal({ room, playerId }: MpRevealProps) {
  const reveal = room.reveal!;
  const now = useServerClock(true);
  const secondsLeft = secondsUntil(reveal.endsAt, now);
  const last = reveal.questionNumber >= reveal.total;

  return (
    <main className="game mp-reveal">
      <div className="mp-game__bar">
        <span className="mp-game__progress mp-mono">
          Q{reveal.questionNumber} / {reveal.total}
        </span>
        <span className="mp-mono mp-reveal__next" role="status" aria-live="polite">
          {last ? 'Final results' : 'Next question'} in {secondsLeft}…
        </span>
      </div>

      <div className="game__body">
        <div className="game__stage">
          <MpPhoto assetToken={reveal.assetToken} stageIndex={4} revealed />
          {reveal.attribution && (
            <p className="attribution">
              Photo:{' '}
              <a href={reveal.attribution.sourceUrl} target="_blank" rel="noreferrer noopener">
                {reveal.attribution.sourceName}
              </a>
              {reveal.attribution.license ? ` · ${reveal.attribution.license}` : ''}
            </p>
          )}
        </div>

        <div className="game__panel">
          <div className="mp-answer">
            <p className="mp-answer__label">ANSWER</p>
            <p className="result__name">{reveal.celebrityName}</p>
            {reveal.celebrityNameTelugu && (
              <p className="result__telugu telugu">{reveal.celebrityNameTelugu}</p>
            )}
          </div>

          <section className="mp-board">
            <h2 className="mp-board__title">This question</h2>
            <ol className="mp-board__list">
              {reveal.results.map((result, index) => (
                <li
                  key={result.playerId}
                  className={`mp-board__row${result.playerId === playerId ? ' mp-board__row--you' : ''}`}
                >
                  <span className="mp-board__rank" aria-hidden="true">
                    {result.correct ? MEDALS[index] ?? `${index + 1}` : '—'}
                  </span>
                  <span className="mp-board__name">{result.name}</span>
                  <span className="mp-board__detail">
                    {result.correct && result.stageIndex !== undefined
                      ? `${stageAt(result.stageIndex).blurPercent}% blur`
                      : '⏰ missed it'}
                  </span>
                  <span className="mp-board__score mp-mono">
                    {result.correct ? `+${result.score}` : '0'}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="mp-board mp-board--totals">
            <h2 className="mp-board__title">Overall</h2>
            <ol className="mp-board__list">
              {reveal.standings.map((standing) => (
                <li
                  key={standing.playerId}
                  className={`mp-board__row${standing.playerId === playerId ? ' mp-board__row--you' : ''}`}
                >
                  <span className="mp-board__rank mp-mono" aria-hidden="true">{standing.rank}</span>
                  <span className="mp-board__name">{standing.name}</span>
                  <span className="mp-board__score mp-mono">{standing.totalScore}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}
