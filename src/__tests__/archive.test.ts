import { describe, expect, it } from 'vitest';
import { archiveDates, describeDay, isPlayableDate, unplayedCount } from '../engine/archive.ts';
import { createGame, submitGuess } from '../engine/game.ts';
import { makeCelebrity } from './factories.ts';

const LAUNCH = '2026-09-08';

describe('archiveDates', () => {
  it('runs from today back to launch, newest first', () => {
    expect(archiveDates(LAUNCH, '2026-09-11')).toEqual([
      '2026-09-11', '2026-09-10', '2026-09-09', '2026-09-08',
    ]);
  });

  it('never offers a future day', () => {
    expect(archiveDates(LAUNCH, '2026-09-10')).not.toContain('2026-09-11');
  });

  it('crosses a month boundary', () => {
    expect(archiveDates('2026-09-29', '2026-10-01'))
      .toEqual(['2026-10-01', '2026-09-30', '2026-09-29']);
  });

  it('falls back to today alone when the schedule is empty', () => {
    expect(archiveDates(undefined, '2026-09-12')).toEqual(['2026-09-12']);
  });

  it('offers only today on launch day itself', () => {
    expect(archiveDates(LAUNCH, '2026-09-08')).toEqual(['2026-09-08']);
  });
});

describe('isPlayableDate', () => {
  it('accepts today and any day since launch', () => {
    expect(isPlayableDate('2026-09-12', LAUNCH, '2026-09-12')).toBe(true);
    expect(isPlayableDate('2026-09-08', LAUNCH, '2026-09-12')).toBe(true);
  });

  it('refuses tomorrow', () => {
    expect(isPlayableDate('2026-09-13', LAUNCH, '2026-09-12')).toBe(false);
  });

  it('refuses a day before the game existed', () => {
    expect(isPlayableDate('2026-09-07', LAUNCH, '2026-09-12')).toBe(false);
  });

  it('refuses junk from the query string', () => {
    expect(isPlayableDate('yesterday', LAUNCH, '2026-09-12')).toBe(false);
    expect(isPlayableDate('2026-9-1', LAUNCH, '2026-09-12')).toBe(false);
    expect(isPlayableDate('', LAUNCH, '2026-09-12')).toBe(false);
  });
});

describe('describeDay', () => {
  const answer = makeCelebrity({ id: 'prabhas', name: 'Prabhas' });

  it('marks an untouched day unplayed', () => {
    const day = describeDay('2026-09-10', undefined, '2026-09-12');
    expect(day).toMatchObject({ status: 'unplayed', isToday: false, daysAgo: 2 });
  });

  it('marks a started day in progress', () => {
    const state = submitGuess(createGame('2026-09-10', answer.id), 'Mahesh Babu', answer).state;
    expect(describeDay('2026-09-10', state, '2026-09-12').status).toBe('in-progress');
  });

  it('marks a win and a loss', () => {
    const won = submitGuess(createGame('2026-09-10', answer.id), 'Prabhas', answer).state;
    expect(describeDay('2026-09-10', won, '2026-09-12').status).toBe('won');

    let lostState = createGame('2026-09-10', answer.id);
    for (const guess of ['a', 'b', 'c', 'd', 'e']) {
      lostState = submitGuess(lostState, guess, answer).state;
    }
    expect(describeDay('2026-09-10', lostState, '2026-09-12').status).toBe('lost');
  });

  it('knows today', () => {
    expect(describeDay('2026-09-12', undefined, '2026-09-12'))
      .toMatchObject({ isToday: true, daysAgo: 0 });
  });
});

describe('unplayedCount', () => {
  it('counts days still open', () => {
    const days = ['2026-09-09', '2026-09-10', '2026-09-11'].map(
      (date) => describeDay(date, undefined, '2026-09-12'),
    );
    expect(unplayedCount(days)).toBe(3);
  });

  it('ignores finished days', () => {
    const answer = makeCelebrity({ id: 'prabhas', name: 'Prabhas' });
    const won = submitGuess(createGame('2026-09-10', answer.id), 'Prabhas', answer).state;
    const days = [
      describeDay('2026-09-10', won, '2026-09-12'),
      describeDay('2026-09-11', undefined, '2026-09-12'),
    ];
    expect(unplayedCount(days)).toBe(1);
  });
});
