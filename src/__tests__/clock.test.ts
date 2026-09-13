import { afterEach, describe, expect, it, vi } from 'vitest';
import { isClockTrusted, now, syncClock, trustedToday } from '../engine/clock.ts';
import { toDateKey } from '../engine/date.ts';

/** The module caches its offset, so each case needs a fresh copy. */
async function freshClock() {
  vi.resetModules();
  return import('../engine/clock.ts');
}

function headersWith(date: string | null) {
  return { headers: { get: (name: string) => (name === 'date' ? date : null) } };
}

describe('clock', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  it('falls back to the device clock when the header is unavailable', async () => {
    const clock = await freshClock();
    globalThis.fetch = vi.fn().mockResolvedValue(headersWith(null)) as never;
    await clock.syncClock();
    expect(clock.isClockTrusted()).toBe(false);
    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
  });

  it('falls back when the request fails entirely', async () => {
    const clock = await freshClock();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as never;
    await clock.syncClock();
    expect(clock.isClockTrusted()).toBe(false);
  });

  it('corrects a device clock that has been wound forward', async () => {
    const clock = await freshClock();
    const serverTime = new Date('2026-09-13T12:00:00Z');
    globalThis.fetch = vi.fn().mockResolvedValue(
      headersWith(serverTime.toUTCString()),
    ) as never;
    // Device believes it is three days later.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T12:00:00Z'));
    await clock.syncClock();
    expect(clock.isClockTrusted()).toBe(true);
    expect(Math.abs(clock.now().getTime() - serverTime.getTime())).toBeLessThan(2000);
  });

  it('refuses a date more than a day from the server’s own', async () => {
    const clock = await freshClock();
    globalThis.fetch = vi.fn().mockResolvedValue(
      headersWith(new Date('2026-09-13T12:00:00Z').toUTCString()),
    ) as never;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'));
    await clock.syncClock();
    expect(clock.trustedToday() <= '2026-09-14').toBe(true);
    expect(clock.trustedToday() >= '2026-09-12').toBe(true);
  });

  it('leaves an honest clock alone', async () => {
    const clock = await freshClock();
    globalThis.fetch = vi.fn().mockResolvedValue(
      headersWith(new Date().toUTCString()),
    ) as never;
    await clock.syncClock();
    expect(clock.trustedToday()).toBe(toDateKey(new Date()));
  });
});

describe('clock module defaults', () => {
  it('is untrusted and device-based before any sync', () => {
    expect(isClockTrusted()).toBe(false);
    expect(typeof trustedToday()).toBe('string');
    expect(now()).toBeInstanceOf(Date);
    expect(syncClock).toBeTypeOf('function');
  });
});
