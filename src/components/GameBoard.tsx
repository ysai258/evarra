import { useEffect, useRef, useState } from 'react';
import { formatPuzzleDate } from '../engine/date.ts';
import { attemptsRemaining, revealHint, submitGuess } from '../engine/game.ts';
import { availableHints, hasMoreHints, revealedHints } from '../engine/hints.ts';
import { HINT_PENALTY } from '../engine/scoring.ts';
import type { Celebrity, GameState, Stats } from '../engine/types.ts';
import { GuessInput } from './GuessInput.tsx';
import { PhotoStage } from './PhotoStage.tsx';
import { ResultPanel } from './ResultPanel.tsx';
import { Tracker } from './Tracker.tsx';

type GameBoardProps = {
  celebrity: Celebrity;
  /** Everyone selectable in the guess box — a wider list than the playable pool. */
  roster: readonly Celebrity[];
  game: GameState;
  stats: Stats;
  /** False when the player is working through the back catalogue. */
  isToday: boolean;
  onChange: (next: GameState) => void;
  onToast: (message: string) => void;
  onBackToToday: () => void;
  onBrowseArchive: () => void;
};

/**
 * The board is a two-part layout: the photo, and everything you act on. On a phone
 * they stack and the photo gives up height as clues appear; on a wide screen the
 * clues sit beside the photo. Either way the whole game stays on one screen — a
 * guessing game you have to scroll is a guessing game you lose track of.
 */
export function GameBoard({
  celebrity, roster, game, stats, isToday, onChange, onToast, onBackToToday, onBrowseArchive,
}: GameBoardProps) {
  const [feedback, setFeedback] = useState('');
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  function onGuess(name: string) {
    const outcome = submitGuess(game, name, celebrity);
    if (outcome.state === game) return;
    onChange(outcome.state);

    if (outcome.correct) {
      setFeedback('');
      return;
    }
    setShake(true);
    window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShake(false), 450);
    setFeedback(
      outcome.finished
        ? `❌ Not ${name}. Out of guesses.`
        : `❌ Not ${name}. The photo is clearer now.`,
    );
  }

  function onRevealHint() {
    const next = revealHint(game, celebrity);
    if (next === game) return;
    onChange(next);
    setFeedback('');
  }

  const hints = revealedHints(celebrity, game.hintsUsed);
  const totalHints = availableHints(celebrity).length;
  const left = attemptsRemaining(game);

  return (
    <main className="game">
      {!isToday && (
        <p className="replay-banner">
          <span>Playing <b>{formatPuzzleDate(game.date)}</b></span>
          <button type="button" onClick={onBackToToday}>Back to today</button>
        </p>
      )}

      <div className="game__body">
        {/* Each revealed clue takes a slice of the photo's height budget. Handing CSS
            the count lets the picture get *smaller* rather than cropped: a 4:5 frame
            that has to fit a shorter box would otherwise cover-crop the portrait. */}
        <div
          className="game__stage"
          style={{ '--clues': hints.length } as React.CSSProperties}
        >
          <PhotoStage
            celebrity={celebrity}
            stageIndex={game.currentStage}
            revealed={game.completed}
            shake={shake}
          />
        </div>

        <div className="game__panel">
          {/* The result grid says everything the tracker does, so it stands down and
              gives the space to the score. */}
          {!game.completed && <Tracker game={game} />}

          {/* Once the name is on screen the clues are spent — the room they were using
              goes back to the photo, which is the thing worth looking at now. */}
          {hints.length > 0 && !game.completed && (
            <div className="hints">
              {hints.map((hint) => (
                <p className="hint" key={hint.key} style={{ margin: 0 }}>
                  <span className="hint__icon" aria-hidden="true">{hint.icon}</span>
                  <span>{hint.text}</span>
                </p>
              ))}
            </div>
          )}

          {game.completed ? (
            <ResultPanel
              game={game}
              celebrity={celebrity}
              stats={stats}
              isToday={isToday}
              onToast={onToast}
              onBrowseArchive={onBrowseArchive}
            />
          ) : (
            <>
              <p
                className={`feedback ${feedback ? 'feedback--wrong' : 'feedback--info'}`}
                role="status"
                aria-live="polite"
                style={{ margin: 0 }}
              >
                {feedback || `${left} ${left === 1 ? 'guess' : 'guesses'} left · guess early, score high`}
              </p>

              <GuessInput
                celebrities={roster}
                disabled={game.completed}
                attemptsLeft={left}
                onGuess={onGuess}
              />

              <button
                type="button"
                className="button button--ghost"
                onClick={onRevealHint}
                disabled={!hasMoreHints(celebrity, game.hintsUsed)}
              >
                {hasMoreHints(celebrity, game.hintsUsed)
                  ? `Reveal a clue (−${HINT_PENALTY}) · ${game.hintsUsed.length}/${totalHints}`
                  : 'No clues left'}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
