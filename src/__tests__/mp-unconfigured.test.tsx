import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MultiplayerApp } from '../multiplayer/client/MultiplayerApp.tsx';

/**
 * A build that ships without a room server.
 *
 * `connect()` throws when there is no URL, and the screen that explains the situation
 * sits *below* the hook that connects — so for a while this rendered a blank page with
 * an uncaught error instead of the explanation. The daily game is unaffected either
 * way, and that is the promise being kept here.
 */
vi.mock('../multiplayer/client/socket.ts', () => ({
  multiplayerServerUrl: () => undefined,
  isMultiplayerConfigured: () => false,
  serverNow: () => Date.now(),
  isClockSynced: () => false,
  connect: () => {
    throw new Error('Multiplayer server URL is not configured.');
  },
  request: vi.fn(),
  syncClock: vi.fn(),
}));

describe('a build with no room server', () => {
  it('explains itself instead of rendering nothing', () => {
    render(
      <MultiplayerApp route={{ name: 'multiplayer' }} roster={[]} onToast={vi.fn()} />,
    );
    expect(screen.getByText(/not here yet/i)).toBeInTheDocument();
    expect(screen.getByText(/the daily star still works/i)).toBeInTheDocument();
  });

  it('offers the way back to the game that does work', () => {
    render(
      <MultiplayerApp route={{ name: 'room', code: 'AB7K9Q' }} roster={[]} onToast={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /back to today/i })).toBeInTheDocument();
  });
});
