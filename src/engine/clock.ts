import { toDateKey } from './date.ts';

/**
 * Where "today" comes from.
 *
 * The device clock cannot be trusted to decide which puzzle you are allowed to play:
 * winding it forward would hand a player tomorrow's star, and winding it back would
 * reopen days the archive has closed. The fix needs no backend and no third-party API
 * — every HTTP response carries a `Date` header, so the site's own origin is the
 * authority. Static hosts send it, and so does the dev server.
 *
 * The offset between that and `Date.now()` is measured once and applied from then on,
 * so the clock keeps ticking normally without re-fetching.
 *
 * Timezone is still the device's, because the daily rollover is deliberately local
 * midnight. A player could shift their timezone to reach across a date boundary, so
 * the derived local date is clamped to within a day of the server's UTC date — the
 * most any real timezone can differ.
 */

let offsetMs = 0;
let serverUtcDate: string | undefined;
let trusted = false;

export function isClockTrusted(): boolean {
  return trusted;
}

/** Measures the device clock's error against the server, once. */
export async function syncClock(signal?: AbortSignal): Promise<void> {
  try {
    const response = await fetch(`${window.location.pathname}?_clock=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
    const header = response.headers.get('date');
    if (!header) return;
    const serverNow = new Date(header);
    if (Number.isNaN(serverNow.getTime())) return;
    offsetMs = serverNow.getTime() - Date.now();
    serverUtcDate = serverNow.toISOString().slice(0, 10);
    trusted = true;
  } catch {
    // Offline, or a host that strips the header: fall back to the device clock.
  }
}

export function now(): Date {
  return new Date(Date.now() + offsetMs);
}

/**
 * Today's puzzle date: the device's local date, corrected by the server offset and
 * held within one day of the server's own date.
 */
export function trustedToday(): string {
  const local = toDateKey(now());
  if (!serverUtcDate) return local;
  const earliest = shiftIsoDate(serverUtcDate, -1);
  const latest = shiftIsoDate(serverUtcDate, 1);
  if (local < earliest) return earliest;
  if (local > latest) return latest;
  return local;
}

function shiftIsoDate(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
