import { useState } from 'react';
import { MULTIPLAYER_CONFIG } from '../../config.ts';
import { isRoomCode, normalizeRoomCode } from '../../code.ts';
import { isValidPlayerName } from '../../name.ts';
import { rememberedName } from '../session.ts';

type MultiplayerLandingProps = {
  /** Set when they arrived through an invite link, which skips straight to joining. */
  invitedCode?: string | undefined;
  busy: boolean;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onBack: () => void;
};

/**
 * The way in.
 *
 * A name and nothing else — no account, no email, no verification (spec §3, §95).
 * A player who followed an invite is shown the room they are joining and asked only
 * for the name, because asking "create or join?" of someone who already clicked a
 * specific room's link is a question with an obvious answer.
 */
export function MultiplayerLanding({
  invitedCode, busy, onCreate, onJoin, onBack,
}: MultiplayerLandingProps) {
  const [name, setName] = useState(() => rememberedName());
  const [code, setCode] = useState(invitedCode ?? '');
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>(
    invitedCode ? 'join' : 'choose',
  );

  const nameOk = isValidPlayerName(name);
  const codeOk = isRoomCode(code);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!nameOk || busy) return;
    if (mode === 'create') onCreate(name);
    else if (codeOk) onJoin(normalizeRoomCode(code)!, name);
  }

  return (
    <main className="mp-landing">
      <div className="mp-landing__head">
        <h1 className="mp-landing__title">🎮 PLAY WITH FRIENDS</h1>
        <p className="mp-landing__sub">
          Same face, same clock, everyone guessing at once.
        </p>
      </div>

      {invitedCode && (
        <p className="mp-landing__invite">
          You’re joining room <b className="mp-mono">{invitedCode}</b>
        </p>
      )}

      {mode === 'choose' ? (
        <div className="mp-landing__choice">
          <button
            type="button"
            className="button button--primary"
            onClick={() => setMode('create')}
          >
            Create a room
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setMode('join')}
          >
            Join with a code
          </button>
        </div>
      ) : (
        <form className="mp-form" onSubmit={submit}>
          {mode === 'join' && !invitedCode && (
            <label className="mp-field">
              <span className="mp-field__label">Room code</span>
              <input
                className="mp-input mp-mono"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="AB7K9Q"
                maxLength={MULTIPLAYER_CONFIG.ROOM_CODE_LENGTH + 2}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-describedby="mp-code-help"
              />
              <span className="mp-field__help" id="mp-code-help">
                Six characters, from whoever made the room.
              </span>
            </label>
          )}

          <label className="mp-field">
            <span className="mp-field__label">Your name</span>
            <input
              className="mp-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Yashwanth"
              maxLength={MULTIPLAYER_CONFIG.MAX_NAME_LENGTH}
              autoComplete="nickname"
              enterKeyHint="go"
              autoFocus={mode === 'join'}
            />
            <span className="mp-field__help">
              {MULTIPLAYER_CONFIG.MIN_NAME_LENGTH}–{MULTIPLAYER_CONFIG.MAX_NAME_LENGTH} characters.
              It’s what the leaderboard calls you.
            </span>
          </label>

          <button
            type="submit"
            className="button button--primary"
            disabled={busy || !nameOk || (mode === 'join' && !codeOk)}
          >
            {busy ? 'One moment…' : mode === 'create' ? 'Create room' : 'Join room'}
          </button>

          {!invitedCode && (
            <button
              type="button"
              className="button button--subtle"
              onClick={() => setMode(mode === 'create' ? 'join' : 'create')}
            >
              {mode === 'create' ? 'I have a room code' : 'Create a room instead'}
            </button>
          )}
        </form>
      )}

      <button type="button" className="button button--subtle mp-landing__back" onClick={onBack}>
        Back to today’s star
      </button>
    </main>
  );
}
