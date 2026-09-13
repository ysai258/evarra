import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { potentialScore } from '../engine/scoring.ts';
import type { GameState } from '../engine/types.ts';

/** Attempt pips plus the score still on the table — the game's core tension. */
export function Tracker({ game }: { game: GameState }) {
  const attempt = Math.min(game.guesses.length + 1, MAX_ATTEMPTS);
  const best = potentialScore(game.currentStage, game.hintsUsed.length);

  return (
    <div className="tracker">
      <div
        className="pips"
        role="img"
        aria-label={
          game.completed
            ? `Game over after ${game.guesses.length} of ${MAX_ATTEMPTS} guesses`
            : `Guess ${attempt} of ${MAX_ATTEMPTS}`
        }
      >
        {Array.from({ length: MAX_ATTEMPTS }, (_, index) => {
          const isWinningGuess = game.won && index === game.guesses.length - 1;
          const used = index < game.guesses.length;
          const current = !game.completed && index === game.guesses.length;
          return (
            <span
              key={index}
              className={[
                'pip',
                isWinningGuess ? 'pip--won' : used ? 'pip--used' : '',
                current ? 'pip--current' : '',
              ].filter(Boolean).join(' ')}
            />
          );
        })}
      </div>
      {!game.completed && (
        <p className="tracker__score">
          worth <b>{best}</b> now
        </p>
      )}
    </div>
  );
}
