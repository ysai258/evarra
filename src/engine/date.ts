/**
 * Daily rollover is local midnight (00:00 in the player's own timezone).
 * Every date in the game is a plain `YYYY-MM-DD` string in local time — never a
 * UTC timestamp — so a player in Hyderabad and one in London each get a new star
 * at their own midnight.
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1);
}

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function daysBetween(from: string, to: string): number {
  const ms = fromDateKey(to).getTime() - fromDateKey(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** Milliseconds until the next local midnight. */
export function msUntilTomorrow(now: Date = new Date()): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = `${Math.floor(total / 3600)}`.padStart(2, '0');
  const minutes = `${Math.floor((total % 3600) / 60)}`.padStart(2, '0');
  const seconds = `${total % 60}`.padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatPuzzleDate(key: string): string {
  const date = fromDateKey(key);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
