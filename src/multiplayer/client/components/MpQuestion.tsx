import { useEffect, useRef, useState } from 'react';
import { GuessInput } from '../../../components/GuessInput.tsx';
import type { Celebrity } from '../../../engine/types.ts';
import { multiplayerScore, WRONG_GUESS_PENALTY } from '../../scoring.ts';
import { stageForElapsed } from '../../stage.ts';
import type { GuessResultPayload } from '../../protocol.ts';
import type { RoomView } from '../../types.ts';
import { secondsUntil, useServerClock } from '../useServerClock.ts';
import { MpPhoto } from './MpPhoto.tsx';
import { PlayerList } from './PlayerList.tsx';

/** The only points in a question at which the countdown is read out loud. */
const ANNOUNCE_AT = [30, 20, 10, 5] as const;

type MpQuestionProps = {
  room: RoomView;
  roster: readonly Celebrity[];
  playerId?: string | undefined;
  lastGuess?: GuessResultPayload | undefined;
  onGuess: (celebrityId: string) => void;
};

/**
 * A question in progress.
 *
 * Everything on screen is derived from two server timestamps and the shared clock:
 * the 3-2-1, the countdown, and which rung of the blur ladder the room is on. Nothing
 * here counts anything down by itself, so a phone that slept through ten seconds comes
 * back to the right number rather than a stale one.
 */
export function MpQuestion({ room, roster, playerId, lastGuess, onGuess }: MpQuestionProps) {
  const question = room.question!;
  const now = useServerClock(true);
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<number>(0);

  const counting = now < question.startedAt;
  const elapsed = now - question.startedAt;
  const stageIndex = stageForElapsed(elapsed, question.durationMs);
  const secondsLeft = secondsUntil(question.endsAt, now);
  const countdown = Math.max(1, Math.ceil((question.startedAt - now) / 1000));

  const you = room.players.find((player) => player.id === playerId);
  const solved = you?.solved ?? false;
  const answered = room.players.filter((player) => player.solved).length;
  const active = room.players.filter((player) => player.connected).length;

  const wrongGuesses = lastGuess?.wrongGuesses ?? 0;
  // What a correct guess would pay *this instant*, time bonus included. Showing the
  // base alone would understate it by up to half, which is the opposite of the point:
  // the number is there to make the clock feel expensive.
  const onTheTable = multiplayerScore({
    stageIndex,
    wrongGuesses,
    timeRemainingMs: question.endsAt - Math.max(now, question.startedAt),
    durationMs: question.durationMs,
  });

  // Only these marks are spoken. Anything between them is the same announcement, so
  // the live region stays silent until the next one is crossed.
  const announced = ANNOUNCE_AT.find((mark) => secondsLeft >= mark) ?? 0;

  useEffect(() => () => window.clearTimeout(shakeTimer.current), []);

  // A wrong guess borrows the daily game's shake — the same feedback in both modes.
  useEffect(() => {
    if (!lastGuess || lastGuess.correct) return;
    setShake(true);
    window.clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShake(false), 450);
  }, [lastGuess]);

  return (
    <main className="game mp-game">
      <div className="mp-game__bar">
        <span className="mp-game__progress mp-mono">
          Q{question.number} / {question.total}
        </span>
        <span
          className={`mp-timer mp-mono${secondsLeft <= 5 && !counting ? ' mp-timer--urgent' : ''}`}
          // The number changes four times a second; announcing every one of those would
          // make the room unusable with a screen reader. The live region below carries
          // the same information at a pace a person can actually follow (spec §86).
          aria-hidden="true"
        >
          ⏱ {counting ? '—' : secondsLeft}
        </span>
        <span className="mp-game__answered mp-mono">
          {answered} / {active} in
        </span>
      </div>

      {/* The timer, at a humane rate: a handful of announcements per question rather
          than one per tick. */}
      <p className="visually-hidden" role="timer" aria-live="polite">
        {counting ? 'Get ready' : `${announced} seconds left`}
      </p>

      <div className="game__body">
        <div className="game__stage">
          <MpPhoto
            assetToken={question.assetToken}
            stageIndex={stageIndex}
            revealed={false}
            shake={shake}
          />
          {counting && (
            <div className="mp-countdown" role="status" aria-live="assertive">
              <span className="mp-countdown__number">{countdown}</span>
            </div>
          )}
        </div>

        <div className="game__panel">
          {solved ? (
            <div className="mp-locked" role="status" aria-live="polite">
              <p className="mp-locked__title">✓ Locked in!</p>
              <p className="mp-locked__score mp-mono">+{lastGuess?.score ?? 0}</p>
              <p className="mp-locked__wait">
                {answered >= active
                  ? 'Everyone’s in — revealing…'
                  : 'Waiting for the others…'}
              </p>
            </div>
          ) : (
            <>
              <p className="mp-worth" role="status" aria-live="off">
                worth <b>{onTheTable}</b> now
                {wrongGuesses > 0 && (
                  <span className="mp-worth__misses">
                    {' '}· {wrongGuesses} miss{wrongGuesses === 1 ? '' : 'es'} (−{wrongGuesses * WRONG_GUESS_PENALTY})
                  </span>
                )}
              </p>

              <p
                className={`feedback ${lastGuess && !lastGuess.correct ? 'feedback--wrong' : 'feedback--info'}`}
                role="status"
                aria-live="polite"
                style={{ margin: 0 }}
              >
                {counting
                  ? 'Get ready…'
                  : lastGuess && !lastGuess.correct
                    ? `❌ Not that one. Try again — the photo keeps clearing.`
                    : 'Guess early for more points. A wrong guess costs you.'}
              </p>

              <GuessInput
                celebrities={roster}
                disabled={counting}
                attemptsLeft={0}
                ariaLabel={`Guess the star. ${secondsLeft} seconds left.`}
                placeholder="Who is it?"
                onGuess={(_name, celebrity) => onGuess(celebrity.id)}
              />
            </>
          )}

          <div className="mp-game__players">
            <PlayerList players={room.players} showSolved youId={playerId} />
          </div>
        </div>
      </div>
    </main>
  );
}
