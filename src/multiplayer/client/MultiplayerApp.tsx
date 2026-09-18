import { useEffect } from 'react';
import type { Celebrity } from '../../engine/types.ts';
import { navigate, type Route } from '../../router.ts';
import { Lobby } from './components/Lobby.tsx';
import { MpFinal } from './components/MpFinal.tsx';
import { MpQuestion } from './components/MpQuestion.tsx';
import { MpReveal } from './components/MpReveal.tsx';
import { MultiplayerLanding } from './components/MultiplayerLanding.tsx';
import { isMultiplayerConfigured } from './socket.ts';
import { useRoom } from './useRoom.ts';

type MultiplayerAppProps = {
  route: Extract<Route, { name: 'multiplayer' | 'room' }>;
  roster: readonly Celebrity[];
  onToast: (message: string) => void;
};

/**
 * The multiplayer mode, start to finish.
 *
 * One screen per room state, chosen from what the server last said — never from
 * anything this component worked out for itself (spec §10). That is why there is no
 * local "are we playing yet" flag anywhere in here: the room either is in QUESTION or
 * it is not, and only the server gets a say.
 */
export function MultiplayerApp({ route, roster, onToast }: MultiplayerAppProps) {
  const handle = useRoom();
  const { room, playerId, connection, error } = handle;

  // Keep the address bar pointing at the room the player is actually in, so a refresh
  // — or a link copied out of the URL bar — lands in the right place (spec §77).
  useEffect(() => {
    if (!room) return;
    if (route.name !== 'room' || route.code !== room.code) {
      navigate({ name: 'room', code: room.code }, { replace: true });
    }
  }, [room, route]);

  if (!isMultiplayerConfigured()) {
    return (
      <main className="error-screen">
        <h1 className="hero__title" style={{ fontSize: 40 }}>Not here yet</h1>
        <p style={{ color: 'var(--ink-soft)', maxWidth: '36ch' }}>
          This build has no room server configured, so playing with friends is
          unavailable. The daily star still works.
        </p>
        <button
          type="button"
          className="button button--subtle"
          onClick={() => navigate({ name: 'daily' })}
        >
          Back to today’s star
        </button>
      </main>
    );
  }

  const banner = connection === 'reconnecting'
    ? 'Connection lost. Reconnecting…'
    : connection === 'offline'
      ? 'Could not reach the room server.'
      : undefined;

  return (
    <div className="mp">
      {banner && <p className="mp-banner" role="status" aria-live="polite">{banner}</p>}
      {error && (
        <p className="mp-error" role="alert">
          {error}
          <button type="button" onClick={handle.dismissError} aria-label="Dismiss">✕</button>
        </p>
      )}

      {!room ? (
        <MultiplayerLanding
          invitedCode={route.name === 'room' ? route.code : undefined}
          busy={handle.busy || connection === 'connecting'}
          onCreate={(name) => void handle.createRoom(name)}
          onJoin={(code, name) => void handle.joinRoom(code, name)}
          onBack={() => navigate({ name: 'daily' })}
        />
      ) : room.status === 'LOBBY' ? (
        <Lobby
          room={room}
          playerId={playerId}
          busy={handle.busy}
          onSettings={(count, seconds) => void handle.updateSettings(count, seconds)}
          onStart={() => void handle.startGame()}
          onLeave={() => {
            handle.leave();
            navigate({ name: 'multiplayer' }, { replace: true });
          }}
          onToast={onToast}
        />
      ) : room.status === 'QUESTION' && room.question ? (
        <MpQuestion
          room={room}
          roster={roster}
          playerId={playerId}
          lastGuess={handle.lastGuess}
          onGuess={(celebrityId) => void handle.guess(celebrityId)}
        />
      ) : room.status === 'REVEAL' && room.reveal ? (
        <MpReveal room={room} playerId={playerId} />
      ) : room.status === 'FINAL_RESULTS' && room.final ? (
        <MpFinal
          room={room}
          playerId={playerId}
          onToast={onToast}
          onPlayAgain={() => {
            handle.leave();
            navigate({ name: 'multiplayer' }, { replace: true });
          }}
          onHome={() => {
            handle.leave();
            navigate({ name: 'daily' });
          }}
        />
      ) : (
        // ENDED, or a state whose payload has not landed yet. A room link opened after
        // the game is over says so rather than pretending to be a lobby (spec §45).
        <main className="error-screen">
          <p style={{ color: 'var(--ink-soft)' }}>This game has ended.</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              handle.leave();
              navigate({ name: 'multiplayer' }, { replace: true });
            }}
          >
            Create a new room
          </button>
        </main>
      )}
    </div>
  );
}
