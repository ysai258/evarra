import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPEAT_GAP_DAYS,
  buildSchedule,
  generateSchedule,
  pickDifficulty,
  resolveDailyPuzzle,
  selectForDate,
} from '../engine/puzzle.ts';
import { makeCelebrity, makeRoster } from './factories.ts';

const roster = makeRoster(240);

describe('daily puzzle selection', () => {
  it('resolves the same date to the same star every time', () => {
    const first = selectForDate('2026-09-12', roster);
    for (let i = 0; i < 20; i += 1) {
      expect(selectForDate('2026-09-12', roster)?.id).toBe(first?.id);
    }
  });

  it('gives different dates different stars across a month', () => {
    const ids = new Set(
      Array.from({ length: 30 }, (_, i) =>
        selectForDate(`2026-09-${`${i + 1}`.padStart(2, '0')}`, roster)?.id),
    );
    expect(ids.size).toBeGreaterThan(20);
  });

  it('only ever picks a playable celebrity', () => {
    const mixed = [
      ...makeRoster(10),
      makeCelebrity({ id: 'director-1', category: 'director', playable: false }),
    ];
    for (let i = 1; i <= 28; i += 1) {
      const picked = selectForDate(`2026-02-${`${i}`.padStart(2, '0')}`, mixed);
      expect(picked?.playable).toBe(true);
    }
  });

  it('returns undefined when nothing is playable', () => {
    expect(selectForDate('2026-09-12', [makeCelebrity({ playable: false })])).toBeUndefined();
  });

  it('honours an exclusion set', () => {
    const chosen = selectForDate('2026-09-12', roster)!;
    const next = selectForDate('2026-09-12', roster, new Set([chosen.id]));
    expect(next?.id).not.toBe(chosen.id);
  });

  it('weights the difficulty mix roughly 60/30/10', () => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    for (let day = 0; day < 1000; day += 1) {
      counts[pickDifficulty(`seed-${day}`)] += 1;
    }
    expect(counts.easy / 1000).toBeCloseTo(0.6, 1);
    expect(counts.medium / 1000).toBeCloseTo(0.3, 1);
    expect(counts.hard / 1000).toBeCloseTo(0.1, 1);
  });
});

describe('schedule generation', () => {
  it('never repeats a star inside the repeat gap', () => {
    const schedule = generateSchedule(roster, '2026-01-01', 365);
    for (let i = 0; i < schedule.length; i += 1) {
      const window = schedule.slice(Math.max(0, i - DEFAULT_REPEAT_GAP_DAYS), i);
      expect(window.some((p) => p.celebrityId === schedule[i]!.celebrityId)).toBe(false);
    }
  });

  it('produces one puzzle per consecutive day', () => {
    const schedule = generateSchedule(roster, '2026-02-26', 5);
    expect(schedule.map((p) => p.date)).toEqual([
      '2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02',
    ]);
  });

  it('throws rather than shipping an empty schedule', () => {
    expect(() => generateSchedule([], '2026-01-01', 3)).toThrow();
  });
});

describe('buildSchedule', () => {
  it('covers every day from launch to the given date', () => {
    const schedule = buildSchedule(roster, '2026-09-10', '2026-09-13');
    expect(Object.keys(schedule).sort()).toEqual([
      '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('never reaches past the day asked for — no future answers exist', () => {
    const schedule = buildSchedule(roster, '2026-09-10', '2026-09-12');
    expect(schedule['2026-09-13']).toBeUndefined();
  });

  it('gives the same answer for a date however far ahead it is replayed', () => {
    const short = buildSchedule(roster, '2026-01-01', '2026-03-01');
    const long = buildSchedule(roster, '2026-01-01', '2026-09-01');
    expect(long['2026-02-14']).toBe(short['2026-02-14']);
  });

  it('covers launch day itself', () => {
    expect(Object.keys(buildSchedule(roster, '2026-09-13', '2026-09-13'))).toEqual(['2026-09-13']);
  });

  it('honours the repeat gap it replays', () => {
    const schedule = buildSchedule(roster, '2026-01-01', '2026-12-31');
    const dates = Object.keys(schedule).sort();
    for (let i = 0; i < dates.length; i += 1) {
      const window = dates.slice(Math.max(0, i - DEFAULT_REPEAT_GAP_DAYS), i);
      expect(window.some((d) => schedule[d] === schedule[dates[i]!])).toBe(false);
    }
  });
});

describe('resolveDailyPuzzle', () => {
  it('prefers the replayed schedule', () => {
    const target = roster[42]!;
    expect(resolveDailyPuzzle('2026-09-12', roster, { '2026-09-12': target.id })?.id)
      .toBe(target.id);
  });

  it('falls back to deterministic selection past the end of the schedule', () => {
    const picked = resolveDailyPuzzle('2099-01-01', roster, {});
    expect(picked).toBeDefined();
    expect(picked?.id).toBe(selectForDate('2099-01-01', roster)?.id);
  });

  it('falls back when the schedule points at a removed celebrity', () => {
    expect(resolveDailyPuzzle('2026-09-12', roster, { '2026-09-12': 'no-longer-here' }))
      .toBeDefined();
  });
});
