import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameBoard } from '../components/GameBoard.tsx';
import { GuessInput } from '../components/GuessInput.tsx';
import { createGame } from '../engine/game.ts';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { EMPTY_STATS } from '../engine/stats.ts';
import { makeCelebrity } from './factories.ts';

const roster = [
  makeCelebrity({ id: 'prabhas', name: 'Prabhas', aliases: ['Rebel Star'] }),
  makeCelebrity({ id: 'mahesh-babu', name: 'Mahesh Babu' }),
  makeCelebrity({ id: 'jr-ntr', name: 'N. T. Rama Rao Jr.', aliases: ['Jr NTR'] }),
  makeCelebrity({ id: 'samantha', name: 'Samantha', category: 'actress', gender: 'female' }),
];

const answer = roster[0]!;

describe('GuessInput', () => {
  it('suggests nothing until the player types', async () => {
    render(<GuessInput celebrities={roster} disabled={false} attemptsLeft={5} onGuess={vi.fn()} />);
    await userEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filters as the player types', async () => {
    render(<GuessInput celebrities={roster} disabled={false} attemptsLeft={5} onGuess={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'mah');
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Mahesh Babu');
  });

  it('finds a star by alias', async () => {
    render(<GuessInput celebrities={roster} disabled={false} attemptsLeft={5} onGuess={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'jr n');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[0])
      .toHaveTextContent('N. T. Rama Rao Jr.');
  });

  it('submits the highlighted option with the keyboard', async () => {
    const onGuess = vi.fn();
    render(<GuessInput celebrities={roster} disabled={false} attemptsLeft={5} onGuess={onGuess} />);
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'a');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(onGuess).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('');
  });

  it('never submits an empty guess', async () => {
    const onGuess = vi.fn();
    render(<GuessInput celebrities={roster} disabled={false} attemptsLeft={5} onGuess={onGuess} />);
    await userEvent.type(screen.getByRole('combobox'), '   {Enter}');
    expect(onGuess).not.toHaveBeenCalled();
  });

  it('says so when nothing matches', async () => {
    render(<GuessInput celebrities={roster} disabled={false} attemptsLeft={5} onGuess={vi.fn()} />);
    await userEvent.type(screen.getByRole('combobox'), 'zzzz');
    expect(screen.getByRole('listbox')).toHaveTextContent('No star matches');
  });
});

describe('GameBoard', () => {
  function setup(initial = createGame('2026-09-12', answer.id)) {
    let game = initial;
    const onChange = vi.fn((next: typeof game) => {
      game = next;
      rerender();
    });
    const board = () => (
      <GameBoard
        celebrity={answer}
        roster={roster}
        game={game}
        stats={EMPTY_STATS}
        isToday
        onChange={onChange}
        onToast={vi.fn()}
        onBackToToday={vi.fn()}
        onBrowseArchive={vi.fn()}
      />
    );
    const view = render(board());
    function rerender() {
      view.rerender(board());
    }
    return { onChange, get game() { return game; } };
  }

  it('starts on the most blurred asset and never names the star in alt text', () => {
    setup();
    const image = screen.getByRole('img', { name: /blurred photograph/i });
    // The blur lives in the file, not in a CSS filter that leaves a sharp original.
    expect(image).toHaveAttribute('src', answer.images[0]!.previews[0]);
    expect(image).toHaveStyle({ filter: 'blur(0px) saturate(0.55)' });
    expect(image.getAttribute('alt')).not.toContain(answer.name);
    expect(image.getAttribute('alt')).toContain('92%');
  });

  // The reported bug: blur is a CSS filter, so a single clear file behind it could be
  // read straight off the page with "open image in new tab".
  it('never serves the full-resolution photo while the game is in play', async () => {
    const board = setup();
    const full = answer.images[0]!.localPath;
    expect(screen.getByRole('img', { name: /blurred/i })).toHaveAttribute(
      'src',
      answer.images[0]!.previews[0],
    );
    for (let stage = 1; stage < MAX_ATTEMPTS - 1; stage += 1) {
      await userEvent.type(screen.getByRole('combobox'), 'mahesh');
      await userEvent.keyboard('{Enter}');
      const image = screen.getByRole('img', { name: /blurred/i });
      expect(image).toHaveAttribute('src', answer.images[0]!.previews[stage]);
      expect(image.getAttribute('src')).not.toBe(full);
    }
    expect(board.game.completed).toBe(false);
    expect(document.body.innerHTML).not.toContain(full);
  });

  it('serves the full-resolution photo once the game is over', async () => {
    setup();
    await userEvent.type(screen.getByRole('combobox'), 'prabhas');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('img', { name: /Photograph of/i }))
      .toHaveAttribute('src', answer.images[0]!.localPath);
  });

  it('moves to the next, clearer asset after a wrong guess and says so', async () => {
    const board = setup();
    await userEvent.type(screen.getByRole('combobox'), 'mahesh');
    await userEvent.keyboard('{Enter}');
    expect(board.game.currentStage).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent('Not Mahesh Babu');
    expect(screen.getByRole('img', { name: /blurred photograph/i }))
      .toHaveAttribute('src', answer.images[0]!.previews[1]);
  });

  it('reveals the result and the name on a correct guess', async () => {
    const board = setup();
    await userEvent.type(screen.getByRole('combobox'), 'prabhas');
    await userEvent.keyboard('{Enter}');
    expect(board.game.won).toBe(true);
    expect(screen.getByText('UNFAIR')).toBeInTheDocument();
    expect(screen.getByText(answer.name)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows a clue and charges for it', async () => {
    const board = setup();
    await userEvent.click(screen.getByRole('button', { name: /Reveal a clue/i }));
    expect(screen.getByText(answer.hints.era)).toBeInTheDocument();
    expect(board.game.hintsUsed).toEqual([0]);
    expect(screen.getByText(/worth/)).toHaveTextContent('450');
  });

  it('credits the photo source once the game is over', async () => {
    setup();
    await userEvent.type(screen.getByRole('combobox'), 'prabhas');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('link', { name: /Wikimedia Commons/i })).toHaveAttribute(
      'href',
      answer.images[0]!.sourceUrl,
    );
  });
});
