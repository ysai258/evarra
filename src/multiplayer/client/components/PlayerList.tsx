import type { PublicPlayer } from '../../types.ts';

type PlayerListProps = {
  players: readonly PublicPlayer[];
  /** In a question, a tick means "has this one" — in the lobby it means nothing yet. */
  showSolved?: boolean;
  youId?: string | undefined;
};

/**
 * Who is in the room.
 *
 * The dot is connection, the crown is the host, and during a question the tick says
 * someone has already found the face. What it never says is *what* they guessed —
 * a wrong name shown to the room would be a free clue (spec §32, §65).
 */
export function PlayerList({ players, showSolved = false, youId }: PlayerListProps) {
  return (
    <ul className="mp-players">
      {players.map((player) => (
        <li
          key={player.id}
          className={`mp-player${player.connected ? '' : ' mp-player--away'}`}
        >
          <span
            className={`mp-player__dot mp-player__dot--${player.connected ? 'on' : 'away'}`}
            aria-hidden="true"
          />
          <span className="mp-player__name">
            {player.name}
            {player.id === youId && <span className="mp-player__you"> (you)</span>}
          </span>
          {player.isHost && <span className="mp-player__host" title="Host">👑</span>}
          {showSolved && player.solved && (
            <span className="mp-player__solved" aria-label="has answered">✓</span>
          )}
          {!player.connected && <span className="mp-player__status">reconnecting…</span>}
        </li>
      ))}
    </ul>
  );
}
