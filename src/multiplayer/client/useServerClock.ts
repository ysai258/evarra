import { useEffect, useState } from 'react';
import { serverNow } from './socket.ts';

/**
 * A ticking view of the server's clock.
 *
 * Deliberately not a countdown that decrements itself. A `setInterval` that subtracts
 * one every second drifts, and stops entirely when a phone backgrounds the tab — the
 * player would come back to a timer that thinks it has 20 seconds left on a question
 * that ended while they were away (spec §21). Recomputing from the shared clock on
 * every tick means a frozen tab simply catches up.
 *
 * Four ticks a second rather than one: a second-resolution readout that samples once a
 * second visibly stutters, and this is cheap.
 */
const TICK_MS = 250;

export function useServerClock(active: boolean): number {
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => {
    if (!active) return;
    setNow(serverNow());
    const timer = window.setInterval(() => setNow(serverNow()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  return now;
}

/** Whole seconds left, never negative — what a countdown actually wants to render. */
export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
