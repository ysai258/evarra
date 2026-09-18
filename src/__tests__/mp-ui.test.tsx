import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Lobby } from '../multiplayer/client/components/Lobby.tsx';
import { MpFinal } from '../multiplayer/client/components/MpFinal.tsx';
import { MpQuestion } from '../multiplayer/client/components/MpQuestion.tsx';
import { MpReveal } from '../multiplayer/client/components/MpReveal.tsx';
import { MultiplayerLanding } from '../multiplayer/client/components/MultiplayerLanding.tsx';
import { MULTIPLAYER_CONFIG } from '../multiplayer/config.ts';
import type { PublicPlayer, RoomView } from '../multiplayer/types.ts';
import { makeCelebrity } from './factories.ts';

/**
 * The room server is not running in a unit test, so the two things that reach for it —
 * the image URL and the shared clock — are stubbed. Everything else is the real
 * component: these tests are about what each room state puts on screen (spec §85).
 */
const clock = { value: 1_700_000_000_000 };

vi.mock('../multiplayer/client/socket.ts', () => ({
  multiplayerServerUrl: () => 'http://localhost:8787',
  isMultiplayerConfigured: () => true,
  serverNow: () => clock.value,
  isClockSynced: () => true,
}));

const roster = [
  makeCelebrity({ id: 'prabhas', name: 'Prabhas' }),
  makeCelebrity({ id: 'mahesh-babu', name: 'Mahesh Babu' }),
];

function makePlayer(overrides: Partial<PublicPlayer> = {}): PublicPlayer {
  return {
    id: 'p1', name: 'Yashwanth', connected: true, isHost: false, totalScore: 0, solved: false,
    ...overrides,
  };
}

const baseRoom: RoomView = {
  code: 'AB7K9Q',
  status: 'LOBBY',
  hostPlayerId: 'p1',
  settings: { questionCount: 5, questionDurationSeconds: 30, revealDurationSeconds: 10 },
  players: [
    makePlayer({ id: 'p1', name: 'Yashwanth', isHost: true }),
    makePlayer({ id: 'p2', name: 'Rahul' }),
  ],
};

beforeEach(() => {
  clock.value = 1_700_000_000_000;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('multiplayer landing', () => {
  it('asks for a name before it will create anything', async () => {
    const onCreate = vi.fn();
    render(
      <MultiplayerLanding busy={false} onCreate={onCreate} onJoin={vi.fn()} onBack={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /create a room/i }));
    const submit = screen.getByRole('button', { name: /^create room$/i });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/your name/i), 'Sai');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(onCreate).toHaveBeenCalledWith('Sai');
  });

  it('skips straight to joining when they arrived through an invite', () => {
    render(
      <MultiplayerLanding
        invitedCode="AB7K9Q"
        busy={false}
        onCreate={vi.fn()}
        onJoin={vi.fn()}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText(/you’re joining room/i)).toHaveTextContent('AB7K9Q');
    expect(screen.queryByLabelText(/room code/i)).not.toBeInTheDocument();
  });

  it('will not join on a code that cannot be one', async () => {
    render(
      <MultiplayerLanding busy={false} onCreate={vi.fn()} onJoin={vi.fn()} onBack={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /join with a code/i }));
    await userEvent.type(screen.getByLabelText(/your name/i), 'Sai');
    await userEvent.type(screen.getByLabelText(/room code/i), 'NOPE');
    expect(screen.getByRole('button', { name: /^join room$/i })).toBeDisabled();
  });
});

describe('lobby', () => {
  const props = {
    playerId: 'p1',
    busy: false,
    onSettings: vi.fn(),
    onStart: vi.fn(),
    onLeave: vi.fn(),
    onToast: vi.fn(),
  };

  it('shows the host the settings, and everyone else the numbers', () => {
    const { unmount } = render(<Lobby {...props} room={baseRoom} />);
    expect(screen.getByRole('button', { name: /more questions/i })).toBeInTheDocument();
    unmount();

    render(<Lobby {...props} playerId="p2" room={baseRoom} />);
    expect(screen.queryByRole('button', { name: /more questions/i })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for the host/i)).toBeInTheDocument();
  });

  it('holds the start button until a second player arrives', () => {
    const alone: RoomView = { ...baseRoom, players: [baseRoom.players[0]!] };
    render(<Lobby {...props} room={alone} />);
    expect(screen.getByRole('button', { name: /waiting for one more/i })).toBeDisabled();
  });

  it('starts once the room has enough people', async () => {
    const onStart = vi.fn();
    render(<Lobby {...props} onStart={onStart} room={baseRoom} />);
    await userEvent.click(screen.getByRole('button', { name: /start game/i }));
    expect(onStart).toHaveBeenCalled();
  });

  it('steps the settings through the offered values only', async () => {
    const onSettings = vi.fn();
    render(<Lobby {...props} onSettings={onSettings} room={baseRoom} />);
    await userEvent.click(screen.getByRole('button', { name: /more questions/i }));
    expect(onSettings).toHaveBeenCalledWith(MULTIPLAYER_CONFIG.QUESTION_COUNT_CHOICES[1], 30);
  });

  it('puts the room code where a friend can be sent it', () => {
    render(<Lobby {...props} room={baseRoom} />);
    expect(screen.getByRole('button', { name: /room code A B 7 K 9 Q/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });
});

describe('a live question', () => {
  const startedAt = 1_700_000_000_000 + 3000;
  const question = {
    index: 0,
    number: 1,
    total: 5,
    assetToken: 'a'.repeat(32),
    startedAt,
    endsAt: startedAt + 30_000,
    durationMs: 30_000,
  };
  const room: RoomView = { ...baseRoom, status: 'QUESTION', question };

  it('counts in before the clock starts, and locks the guess box', () => {
    render(<MpQuestion room={room} roster={roster} playerId="p1" onGuess={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('shows the time left once the question is running', () => {
    clock.value = startedAt + 5_000;
    render(<MpQuestion room={room} roster={roster} playerId="p1" onGuess={vi.fn()} />);
    expect(screen.getByText('⏱ 25')).toBeInTheDocument();
    // Spoken at thresholds rather than on every tick, so a screen reader is usable.
    expect(screen.getByRole('timer')).toHaveTextContent('20 seconds left');
    expect(screen.getByRole('combobox')).toBeEnabled();
  });

  it('sends the chosen star’s id, not their name', async () => {
    clock.value = startedAt + 5_000;
    const onGuess = vi.fn();
    render(<MpQuestion room={room} roster={roster} playerId="p1" onGuess={onGuess} />);
    await userEvent.type(screen.getByRole('combobox'), 'prab');
    await userEvent.keyboard('{Enter}');
    expect(onGuess).toHaveBeenCalledWith('prabhas');
  });

  it('counts who is in without saying what they said', () => {
    clock.value = startedAt + 5_000;
    const answered: RoomView = {
      ...room,
      players: [baseRoom.players[0]!, { ...baseRoom.players[1]!, solved: true }],
    };
    render(<MpQuestion room={answered} roster={roster} playerId="p1" onGuess={vi.fn()} />);
    expect(screen.getByText('1 / 2 in')).toBeInTheDocument();
    expect(screen.queryByText(/prabhas/i)).not.toBeInTheDocument();
  });

  it('swaps the guess box for a locked-in card once they have it', () => {
    clock.value = startedAt + 5_000;
    const solved: RoomView = {
      ...room,
      players: [{ ...baseRoom.players[0]!, solved: true }, baseRoom.players[1]!],
    };
    render(
      <MpQuestion
        room={solved}
        roster={roster}
        playerId="p1"
        lastGuess={{ correct: true, celebrityId: 'prabhas', wrongGuesses: 0, score: 612 }}
        onGuess={vi.fn()}
      />,
    );
    expect(screen.getByText(/locked in/i)).toBeInTheDocument();
    expect(screen.getByText('+612')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('says a guess was wrong, and what the misses have cost', () => {
    clock.value = startedAt + 5_000;
    render(
      <MpQuestion
        room={room}
        roster={roster}
        playerId="p1"
        lastGuess={{ correct: false, celebrityId: 'mahesh-babu', wrongGuesses: 2 }}
        onGuess={vi.fn()}
      />,
    );
    expect(screen.getByText(/not that one/i)).toBeInTheDocument();
    expect(screen.getByText(/2 misses/i)).toBeInTheDocument();
  });
});

describe('the reveal', () => {
  const room: RoomView = {
    ...baseRoom,
    status: 'REVEAL',
    reveal: {
      questionNumber: 1,
      total: 5,
      celebrityId: 'prabhas',
      celebrityName: 'Prabhas',
      assetToken: 'b'.repeat(32),
      results: [
        { playerId: 'p1', name: 'Yashwanth', correct: true, score: 684, wrongGuesses: 0, stageIndex: 0 },
        { playerId: 'p2', name: 'Rahul', correct: false, score: 0, wrongGuesses: 1 },
      ],
      standings: [
        { playerId: 'p1', name: 'Yashwanth', totalScore: 684, correctAnswers: 1, rank: 1 },
        { playerId: 'p2', name: 'Rahul', totalScore: 0, correctAnswers: 0, rank: 2 },
      ],
      endsAt: 1_700_000_000_000 + 10_000,
    },
  };

  it('names the star and scores the question', () => {
    render(<MpReveal room={room} playerId="p1" />);
    expect(screen.getByText('Prabhas')).toBeInTheDocument();
    expect(screen.getByText('+684')).toBeInTheDocument();
    expect(screen.getByText(/missed it/i)).toBeInTheDocument();
  });

  it('counts down to the next question on the server’s clock', () => {
    render(<MpReveal room={room} playerId="p1" />);
    expect(screen.getByText(/next question in 10/i)).toBeInTheDocument();
  });

  it('says how blurred the picture was when they got it', () => {
    render(<MpReveal room={room} playerId="p1" />);
    expect(screen.getByText('92% blur')).toBeInTheDocument();
  });
});

describe('final results', () => {
  const room: RoomView = {
    ...baseRoom,
    status: 'FINAL_RESULTS',
    final: {
      questionCount: 2,
      playerCount: 2,
      standings: [
        { playerId: 'p2', name: 'Rahul', totalScore: 1420, correctAnswers: 2, rank: 1 },
        { playerId: 'p1', name: 'Yashwanth', totalScore: 684, correctAnswers: 1, rank: 2 },
      ],
      scorecard: [
        { questionNumber: 1, correct: true, score: 684 },
        { questionNumber: 2, correct: false, score: 0 },
      ],
    },
  };

  it('crowns the winner and places the player', () => {
    render(
      <MpFinal room={room} playerId="p1" onToast={vi.fn()} onPlayAgain={vi.fn()} onHome={vi.fn()} />,
    );
    const [board] = screen.getAllByRole('list');
    expect(within(board!).getByText('Rahul')).toBeInTheDocument();
    expect(screen.getByText(/you came/i)).toHaveTextContent('2nd');
    expect(screen.getByText('1,420')).toBeInTheDocument();
  });

  it('shows the player their own game, question by question', () => {
    render(
      <MpFinal room={room} playerId="p1" onToast={vi.fn()} onPlayAgain={vi.fn()} onHome={vi.fn()} />,
    );
    expect(screen.getByLabelText(/spoiler-free result grid/i)).toHaveTextContent('🟩 ⬜');
    expect(screen.getByText('Q1')).toBeInTheDocument();
  });
});

describe('the final board arriving', () => {
  const room: RoomView = {
    ...baseRoom,
    status: 'FINAL_RESULTS',
    final: {
      questionCount: 1,
      playerCount: 3,
      standings: [
        { playerId: 'p2', name: 'Rahul', totalScore: 700, correctAnswers: 1, rank: 1 },
        { playerId: 'p1', name: 'Yashwanth', totalScore: 400, correctAnswers: 1, rank: 2 },
        { playerId: 'p3', name: 'Sai', totalScore: 0, correctAnswers: 0, rank: 3 },
      ],
      scorecard: [{ questionNumber: 1, correct: true, score: 400 }],
    },
  };

  /** A stagger that starts empty reads as a page that failed to load. */
  it('shows a row immediately rather than starting blank', () => {
    render(
      <MpFinal room={room} playerId="p1" onToast={vi.fn()} onPlayAgain={vi.fn()} onHome={vi.fn()} />,
    );
    expect(document.querySelectorAll('.mp-final__row--in')).toHaveLength(1);
  });

  it('starts at the bottom, so the winner lands last', () => {
    render(
      <MpFinal room={room} playerId="p1" onToast={vi.fn()} onPlayAgain={vi.fn()} onHome={vi.fn()} />,
    );
    const first = document.querySelector('.mp-final__row--in')!;
    expect(first).toHaveTextContent('Sai');
  });

  // jsdom has no matchMedia at all, which is why the component reaches for it
  // optionally; a reduced-motion preference has to be stubbed in rather than spied on.
  it('puts the whole board up at once when motion is unwelcome', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(
      <MpFinal room={room} playerId="p1" onToast={vi.fn()} onPlayAgain={vi.fn()} onHome={vi.fn()} />,
    );
    expect(document.querySelectorAll('.mp-final__row--in')).toHaveLength(3);
    vi.unstubAllGlobals();
  });
});

describe('what a question is worth', () => {
  const startedAt = 1_700_000_000_000 + 3000;
  const question = {
    index: 0, number: 1, total: 5, assetToken: 'c'.repeat(32),
    startedAt, endsAt: startedAt + 30_000, durationMs: 30_000,
  };
  const room: RoomView = { ...baseRoom, status: 'QUESTION', question };

  /**
   * The readout is there to make the clock feel expensive, so it has to be the number
   * a correct guess would actually pay — the base alone understates it by up to half.
   */
  it('includes the time bonus, not just the blur stage', () => {
    clock.value = startedAt;
    render(<MpQuestion room={room} roster={roster} playerId="p1" onGuess={vi.fn()} />);
    expect(screen.getByText('750')).toBeInTheDocument();
  });

  it('falls as the clock runs down', () => {
    clock.value = startedAt + 29_000;
    render(<MpQuestion room={room} roster={roster} playerId="p1" onGuess={vi.fn()} />);
    expect(screen.queryByText('750')).not.toBeInTheDocument();
  });
});
