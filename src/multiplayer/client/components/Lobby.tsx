import { MULTIPLAYER_CONFIG } from '../../config.ts';
import type { RoomView } from '../../types.ts';
import { PlayerList } from './PlayerList.tsx';
import { RoomCodeCard } from './RoomCodeCard.tsx';

type LobbyProps = {
  room: RoomView;
  playerId?: string | undefined;
  busy: boolean;
  onSettings: (questionCount: number, questionDurationSeconds: number) => void;
  onStart: () => void;
  onLeave: () => void;
  onToast: (message: string) => void;
};

/**
 * The waiting room.
 *
 * Its real job is sharing — a room with one person in it is not a game — so the code
 * and the invite link sit above everything else (spec §69). The host gets the two
 * settings that shape the game; everyone else gets the same numbers as a read-only
 * statement, so nobody is left guessing what they are about to play.
 */
export function Lobby({
  room, playerId, busy, onSettings, onStart, onLeave, onToast,
}: LobbyProps) {
  const isHost = playerId === room.hostPlayerId;
  const connected = room.players.filter((player) => player.connected).length;
  const short = connected < MULTIPLAYER_CONFIG.MIN_PLAYERS;

  return (
    <main className="mp-lobby">
      <RoomCodeCard code={room.code} onToast={onToast} />

      <section className="mp-panel">
        <h2 className="mp-panel__title">
          Players <span className="mp-count">{room.players.length}</span>
        </h2>
        <PlayerList players={room.players} youId={playerId} />
      </section>

      <section className="mp-panel">
        <h2 className="mp-panel__title">Game settings</h2>
        {isHost ? (
          <div className="mp-settings">
            <Stepper
              label="Questions"
              value={room.settings.questionCount}
              choices={MULTIPLAYER_CONFIG.QUESTION_COUNT_CHOICES}
              onChange={(value) => onSettings(value, room.settings.questionDurationSeconds)}
            />
            <Stepper
              label="Seconds per question"
              value={room.settings.questionDurationSeconds}
              choices={MULTIPLAYER_CONFIG.QUESTION_DURATION_CHOICES}
              onChange={(value) => onSettings(room.settings.questionCount, value)}
            />
          </div>
        ) : (
          <p className="mp-settings__readonly">
            <b>{room.settings.questionCount}</b> questions ·{' '}
            <b>{room.settings.questionDurationSeconds}s</b> each
          </p>
        )}
      </section>

      {isHost ? (
        <div className="mp-lobby__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={onStart}
            disabled={busy || short}
          >
            {short ? 'Waiting for one more player…' : 'Start game'}
          </button>
          {short && (
            <p className="mp-hint">
              A room needs at least {MULTIPLAYER_CONFIG.MIN_PLAYERS} players. Share the code above.
            </p>
          )}
        </div>
      ) : (
        <p className="mp-waiting" role="status" aria-live="polite">
          Waiting for the host to start…
        </p>
      )}

      <button type="button" className="button button--subtle" onClick={onLeave}>
        Leave room
      </button>
    </main>
  );
}

type StepperProps = {
  label: string;
  value: number;
  choices: readonly number[];
  onChange: (value: number) => void;
};

/**
 * A stepper over a fixed set rather than a free number box: the host is choosing
 * between five and twenty questions, not typing an integer, and the server would only
 * clamp anything stranger anyway.
 */
function Stepper({ label, value, choices, onChange }: StepperProps) {
  const index = Math.max(0, choices.indexOf(value));
  const step = (delta: number) => {
    const next = choices[Math.min(choices.length - 1, Math.max(0, index + delta))];
    if (next !== undefined && next !== value) onChange(next);
  };

  return (
    <div className="mp-stepper">
      <span className="mp-stepper__label" id={`stepper-${label}`}>{label}</span>
      <div className="mp-stepper__control">
        <button
          type="button"
          className="mp-stepper__button"
          onClick={() => step(-1)}
          disabled={index === 0}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          −
        </button>
        <output className="mp-stepper__value mp-mono" aria-labelledby={`stepper-${label}`}>
          {value}
        </output>
        <button
          type="button"
          className="mp-stepper__button"
          onClick={() => step(1)}
          disabled={index === choices.length - 1}
          aria-label={`More ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
