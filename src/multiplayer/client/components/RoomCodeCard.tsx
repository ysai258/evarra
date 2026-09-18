import { useState } from 'react';
import { copyToClipboard } from '../../../engine/share.ts';

type RoomCodeCardProps = {
  code: string;
  onToast: (message: string) => void;
};

/** The shareable link for a room — the thing a player actually sends to a friend. */
export function roomUrl(code: string): string {
  if (typeof window === 'undefined') return `/room/${code}`;
  const base = import.meta.env.BASE_URL || '/';
  return new URL(`${base.replace(/\/$/, '')}/room/${code}`, window.location.origin).href;
}

/**
 * The room's front door.
 *
 * Two ways in, because they fail in different places: a link is one tap but dies in a
 * group chat that mangles URLs, and a code survives being read aloud across a room.
 * The code is set in the monospace face at a size you can read from a sofa (spec §68).
 */
export function RoomCodeCard({ code, onToast }: RoomCodeCardProps) {
  const [copied, setCopied] = useState<'code' | 'link' | undefined>();
  const url = roomUrl(code);

  async function copy(what: 'code' | 'link') {
    const ok = await copyToClipboard(what === 'code' ? code : url);
    if (!ok) {
      onToast('Could not copy — select the code and copy it by hand.');
      return;
    }
    setCopied(what);
    window.setTimeout(() => setCopied(undefined), 1800);
    onToast(what === 'code' ? 'Room code copied' : 'Invite link copied');
  }

  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'EVARRA? multiplayer',
          text: `Join my EVARRA? room — code ${code}`,
          url,
        });
        return;
      } catch {
        // Dismissing the share sheet is a choice, not a failure worth reporting.
        return;
      }
    }
    await copy('link');
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section className="mp-code">
      <p className="mp-code__label">ROOM CODE</p>
      <button
        type="button"
        className="mp-code__value"
        onClick={() => void copy('code')}
        aria-label={`Room code ${[...code].join(' ')}. Tap to copy.`}
      >
        {code}
      </button>
      <div className="mp-code__actions">
        <button type="button" className="button button--subtle" onClick={() => void copy('link')}>
          {copied === 'link' ? 'Copied ✓' : 'Copy link'}
        </button>
        {canShare && (
          <button type="button" className="button button--subtle" onClick={() => void share()}>
            Share
          </button>
        )}
      </div>
      <p className="mp-code__hint">Send this to your friends so they can join.</p>
    </section>
  );
}
