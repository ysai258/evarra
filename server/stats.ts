/**
 * Play statistics for the room server: how many rooms, joins and games, per day.
 *
 * Counts only. No names, no IPs, no player ids or room codes are kept or published —
 * which is what lets `/stats` be public, like `/health`.
 *
 * Counters build up in memory and are written out every 30 seconds. With Upstash Redis
 * credentials (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or the
 * `KV_REST_API_*` names Vercel's integration uses) they survive restarts and the free
 * plan's sleep; without them they cover the time since the server last woke up, and the
 * report says so.
 *
 * Days are India time, because that is where the players are.
 *
 * There is no unique-player count: a seat's id is minted per room, so the same person
 * playing three rooms is three ids, and counting them as people would overstate it.
 */
import type { RoomLifecycle } from './room-manager.ts';

export const COUNTERS = [
  'roomsCreated',
  /** Someone joining a room someone else made. The host is counted by `roomsCreated`. */
  'joins',
  'gamesStarted',
  'gamesFinished',
  /** Seats in games that started: a four-player game adds four. */
  'playersInGames',
] as const;
export type Counter = (typeof COUNTERS)[number];

export type DayStats = Record<Counter, number> & {
  date: string;
  /** Most players connected at once that day, sampled every few seconds. */
  peakOnline: number;
};

export type LiveCounts = {
  /** Rooms in memory, in any state. */
  rooms: number;
  /** Rooms with a question or reveal on screen right now. */
  playing: number;
  /** Players with a connected socket, across every room. */
  online: number;
};

type Batch = {
  counts: Map<string, Map<Counter, number>>;
  peaks: Map<string, number>;
};

export type StatsBackend = {
  readonly kind: 'redis' | 'memory';
  write(batch: Batch): Promise<void>;
  read(dates: string[]): Promise<DayStats[]>;
};

const KEEP_DAYS = 400;
const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 3_600_000;
const key = (kind: string, date: string): string => `evarra:${kind}:${date}`;

/** YYYY-MM-DD in India time. */
export function dayOf(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The last `n` India-time dates, newest first. */
export function lastDates(n: number, now: number): string[] {
  return Array.from({ length: n }, (_, i) => dayOf(now - i * DAY_MS));
}

function emptyDay(date: string): DayStats {
  const zeros = Object.fromEntries(COUNTERS.map((c) => [c, 0])) as Record<Counter, number>;
  return { date, peakOnline: 0, ...zeros };
}

function emptyBatch(): Batch {
  return { counts: new Map(), peaks: new Map() };
}

export class MemoryBackend implements StatsBackend {
  readonly kind = 'memory' as const;

  private readonly days = new Map<string, DayStats>();

  async write(batch: Batch): Promise<void> {
    for (const [date, counts] of batch.counts) {
      const day = this.day(date);
      for (const [counter, n] of counts) day[counter] += n;
    }
    for (const [date, peak] of batch.peaks) {
      const day = this.day(date);
      day.peakOnline = Math.max(day.peakOnline, peak);
    }
  }

  async read(dates: string[]): Promise<DayStats[]> {
    return dates.map((date) => ({ ...(this.days.get(date) ?? emptyDay(date)) }));
  }

  private day(date: string): DayStats {
    const existing = this.days.get(date);
    if (existing) return existing;
    const fresh = emptyDay(date);
    this.days.set(date, fresh);
    return fresh;
  }
}

type Command = (string | number)[];

/** Upstash Redis over its REST API: one pipelined request per write or read. */
export class UpstashBackend implements StatsBackend {
  readonly kind = 'redis' as const;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async pipeline(commands: Command[]): Promise<unknown[]> {
    const response = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`stats store HTTP ${response.status}`);
    const results = (await response.json()) as { result?: unknown; error?: string }[];
    const failed = results.find((r) => r.error);
    if (failed) throw new Error(`stats store: ${failed.error}`);
    return results.map((r) => r.result);
  }

  async write(batch: Batch): Promise<void> {
    const ttl = KEEP_DAYS * 86_400;
    const commands: Command[] = [];
    for (const [date, counts] of batch.counts) {
      for (const [counter, n] of counts) commands.push(['HINCRBY', key('day', date), counter, n]);
      commands.push(['EXPIRE', key('day', date), ttl]);
    }
    for (const [date, peak] of batch.peaks) {
      // ZADD GT only ever raises the score, so two writers cannot lower a peak.
      commands.push(['ZADD', key('peak', date), 'GT', peak, 'online'], ['EXPIRE', key('peak', date), ttl]);
    }
    if (commands.length) await this.pipeline(commands);
  }

  async read(dates: string[]): Promise<DayStats[]> {
    const commands: Command[] = [];
    for (const date of dates) {
      commands.push(['HGETALL', key('day', date)], ['ZSCORE', key('peak', date), 'online']);
    }
    const results = await this.pipeline(commands);
    return dates.map((date, i) => {
      const day = emptyDay(date);
      const flat = (results[i * 2] as string[] | null) ?? [];
      for (let k = 0; k + 1 < flat.length; k += 2) {
        const counter = flat[k] as Counter;
        if ((COUNTERS as readonly string[]).includes(counter)) day[counter] = Number(flat[k + 1]) || 0;
      }
      day.peakOnline = Number(results[i * 2 + 1]) || 0;
      return day;
    });
  }
}

export type StatsReport = {
  live: LiveCounts;
  days: DayStats[];
  totals: Record<Counter, number>;
  storage: 'redis' | 'memory';
  /** With in-memory storage, when the counting began (the last restart or wake-up). */
  since?: string;
  error?: string;
};

export class Stats {
  private pending: Batch = emptyBatch();

  private timer: NodeJS.Timeout | null = null;

  private cache: { at: number; days: number; value: Pick<StatsReport, 'days' | 'totals'> } | null = null;

  readonly startedAt: number;

  lastError = '';

  /** How long a report is reused, so a public page cannot hammer the store. */
  cacheMs = 20_000;

  constructor(
    readonly backend: StatsBackend,
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = now();
  }

  count(counter: Counter, n = 1): void {
    if (!(n > 0)) return;
    const date = dayOf(this.now());
    const counts = this.pending.counts.get(date) ?? new Map<Counter, number>();
    counts.set(counter, (counts.get(counter) ?? 0) + n);
    this.pending.counts.set(date, counts);
  }

  /** A sample of how many players are connected; the day keeps the highest. */
  online(n: number): void {
    const date = dayOf(this.now());
    if (n > (this.pending.peaks.get(date) ?? 0)) this.pending.peaks.set(date, n);
  }

  async flush(): Promise<void> {
    const batch = this.pending;
    if (!batch.counts.size && !batch.peaks.size) return;
    this.pending = emptyBatch();
    try {
      await this.backend.write(batch);
      this.lastError = '';
    } catch (error) {
      this.lastError = (error as Error).message;
      this.merge(batch); // keep it for the next try
    }
  }

  private merge(batch: Batch): void {
    for (const [date, counts] of batch.counts) {
      for (const [counter, n] of counts) {
        const pending = this.pending.counts.get(date) ?? new Map<Counter, number>();
        pending.set(counter, (pending.get(counter) ?? 0) + n);
        this.pending.counts.set(date, pending);
      }
    }
    for (const [date, peak] of batch.peaks) {
      this.pending.peaks.set(date, Math.max(peak, this.pending.peaks.get(date) ?? 0));
    }
  }

  start(everyMs = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), everyMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Daily numbers for the last `days` days (1–90, default 14), newest first. */
  async report(days: number, live: LiveCounts): Promise<StatsReport> {
    const n = Math.max(1, Math.min(90, Math.floor(days) || 14));
    if (!this.cache || this.cache.days !== n || this.now() - this.cache.at >= this.cacheMs) {
      await this.flush();
      const list = await this.backend.read(lastDates(n, this.now()));
      const totals = Object.fromEntries(
        COUNTERS.map((c) => [c, list.reduce((sum, day) => sum + day[c], 0)]),
      ) as Record<Counter, number>;
      this.cache = { at: this.now(), days: n, value: { days: list, totals } };
    }
    return {
      live,
      ...this.cache.value,
      storage: this.backend.kind,
      ...(this.backend.kind === 'memory' ? { since: new Date(this.startedAt).toISOString() } : {}),
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }
}

export function statsFromEnv(env: NodeJS.ProcessEnv = process.env): Stats {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  return new Stats(url && token ? new UpstashBackend(url, token) : new MemoryBackend());
}

/** Turns a room's lifecycle moment into counter increments. */
export function recordLifecycle(stats: Stats, event: RoomLifecycle): void {
  switch (event.type) {
    case 'roomCreated':
      stats.count('roomsCreated');
      return;
    case 'playerJoined':
      stats.count('joins');
      return;
    case 'gameStarted':
      stats.count('gamesStarted');
      stats.count('playersInGames', event.players);
      return;
    case 'gameFinished':
      stats.count('gamesFinished');
      return;
  }
}
