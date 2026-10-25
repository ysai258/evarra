// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RoomManager, type RoomLifecycle } from '../../server/room-manager.ts';
import {
  MemoryBackend, Stats, UpstashBackend, dayOf, lastDates, recordLifecycle, statsFromEnv,
} from '../../server/stats.ts';
import { MULTIPLAYER_CONFIG } from '../multiplayer/config.ts';
import { FakeClock, RecordingEvents } from './mp-harness.ts';
import { makeRoster } from './factories.ts';

const live = { rooms: 0, playing: 0, online: 0 };

describe('dayOf', () => {
  it('rolls the day over at midnight India time, not UTC', () => {
    // 18:29 UTC is 23:59 IST; 18:30 UTC is 00:00 IST the next day.
    expect(dayOf(Date.UTC(2026, 9, 24, 18, 29))).toBe('2026-10-24');
    expect(dayOf(Date.UTC(2026, 9, 24, 18, 30))).toBe('2026-10-25');
  });

  it('lists the last n days newest first', () => {
    expect(lastDates(3, Date.UTC(2026, 9, 25, 6))).toEqual(['2026-10-25', '2026-10-24', '2026-10-23']);
  });
});

describe('Stats', () => {
  it('batches counts in memory and reports them per day with totals', async () => {
    let now = Date.UTC(2026, 9, 24, 12);
    const stats = new Stats(new MemoryBackend(), () => now);
    stats.count('roomsCreated');
    stats.count('joins', 3);
    now += 86_400_000;
    stats.count('roomsCreated');
    stats.online(4);
    stats.online(2);

    const report = await stats.report(2, { rooms: 1, playing: 1, online: 3 });
    expect(report.live).toEqual({ rooms: 1, playing: 1, online: 3 });
    expect(report.days.map((d) => [d.date, d.roomsCreated, d.joins, d.peakOnline])).toEqual([
      ['2026-10-25', 1, 0, 4],
      ['2026-10-24', 1, 3, 0],
    ]);
    expect(report.totals).toMatchObject({ roomsCreated: 2, joins: 3, gamesStarted: 0 });
    expect(report.storage).toBe('memory');
    expect(report.since).toBeDefined();
  });

  it('publishes counts only — nothing that identifies a player or a room', async () => {
    const stats = new Stats(new MemoryBackend());
    recordLifecycle(stats, { type: 'gameStarted', players: 3 });
    const json = JSON.stringify(await stats.report(1, live));
    expect(Object.keys(JSON.parse(json).days[0]).sort()).toEqual(
      ['date', 'gamesFinished', 'gamesStarted', 'joins', 'peakOnline', 'playersInGames', 'roomsCreated'],
    );
  });

  it('clamps the day range to 1–90', async () => {
    const stats = new Stats(new MemoryBackend());
    expect((await stats.report(500, live)).days).toHaveLength(90);
    stats.cacheMs = 0;
    expect((await stats.report(Number.NaN, live)).days).toHaveLength(14);
  });

  it('keeps a failed batch and retries it on the next flush', async () => {
    const memory = new MemoryBackend();
    let fail = true;
    const flaky = {
      kind: 'redis' as const,
      write: async (batch: Parameters<MemoryBackend['write']>[0]) => {
        if (fail) throw new Error('down');
        await memory.write(batch);
      },
      read: (dates: string[]) => memory.read(dates),
    };
    const stats = new Stats(flaky);
    stats.count('gamesFinished', 2);
    await stats.flush();
    expect(stats.lastError).toBe('down');
    fail = false;
    stats.count('gamesFinished');
    const report = await stats.report(1, live);
    expect(report.totals.gamesFinished).toBe(3);
    expect(report.error).toBeUndefined();
  });

  it('chooses Upstash only when both URL and token are set, under either name', () => {
    expect(statsFromEnv({}).backend.kind).toBe('memory');
    expect(statsFromEnv({ UPSTASH_REDIS_REST_URL: 'https://x' }).backend.kind).toBe('memory');
    expect(statsFromEnv({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 't' }).backend.kind).toBe('redis');
    expect(statsFromEnv({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }).backend.kind).toBe('redis');
  });
});

describe('UpstashBackend', () => {
  it('writes one pipelined request and reads it back', async () => {
    const calls: { url: string; body: unknown[][]; auth: string }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as unknown[][];
      calls.push({ url, body, auth: (init.headers as Record<string, string>).Authorization! });
      const isRead = body[0]![0] === 'HGETALL';
      const results = isRead
        ? [{ result: ['roomsCreated', '5', 'bogus', '9'] }, { result: '7' }]
        : body.map(() => ({ result: 1 }));
      return new Response(JSON.stringify(results), { status: 200 });
    }) as unknown as typeof fetch;

    const backend = new UpstashBackend('https://redis.example/', 'secret', fakeFetch);
    await backend.write({
      counts: new Map([['2026-10-25', new Map([['roomsCreated', 2]] as const)]]),
      peaks: new Map([['2026-10-25', 6]]),
    });
    expect(calls[0]!.url).toBe('https://redis.example/pipeline');
    expect(calls[0]!.auth).toBe('Bearer secret');
    expect(calls[0]!.body).toContainEqual(['HINCRBY', 'evarra:day:2026-10-25', 'roomsCreated', 2]);
    expect(calls[0]!.body).toContainEqual(['ZADD', 'evarra:peak:2026-10-25', 'GT', 6, 'online']);

    const [day] = await backend.read(['2026-10-25']);
    expect(day).toMatchObject({ date: '2026-10-25', roomsCreated: 5, joins: 0, peakOnline: 7 });
    expect(day).not.toHaveProperty('bogus');
  });

  it('surfaces a store error', async () => {
    const fakeFetch = (async () => new Response(JSON.stringify([{ error: 'WRONGTYPE' }]))) as unknown as typeof fetch;
    await expect(new UpstashBackend('https://r', 't', fakeFetch).read(['2026-10-25'])).rejects.toThrow('WRONGTYPE');
  });
});

describe('room lifecycle → stats', () => {
  it('fires created, joined, started and finished from a real game', () => {
    const clock = new FakeClock();
    const seen: RoomLifecycle[] = [];
    const events = Object.assign(new RecordingEvents(), {
      lifecycle: (event: RoomLifecycle) => { seen.push(event); },
    });
    const manager = new RoomManager(makeRoster(40), events, clock);

    const created = manager.createRoom('Ravi');
    if (!created.ok) throw new Error(created.error);
    const host = created.value.player;
    manager.joinRoom(created.value.room.code, 'Sita');
    manager.joinRoom(created.value.room.code, 'Anil');
    manager.updateSettings(host.id, { questionCount: 1, questionDurationSeconds: 15 });
    expect(manager.startGame(host.id).ok).toBe(true);
    expect(manager.liveCounts()).toEqual({ rooms: 1, playing: 1, online: 3 });

    clock.advance(MULTIPLAYER_CONFIG.COUNTDOWN_MS + 60_000 + MULTIPLAYER_CONFIG.REVEAL_DURATION_SECONDS * 1000);

    expect(seen).toEqual([
      { type: 'roomCreated' },
      { type: 'playerJoined' },
      { type: 'playerJoined' },
      { type: 'gameStarted', players: 3 },
      { type: 'gameFinished', players: 3 },
    ]);
    expect(manager.liveCounts().playing).toBe(0);
  });

  it('turns those moments into counters', async () => {
    const stats = new Stats(new MemoryBackend());
    recordLifecycle(stats, { type: 'roomCreated' });
    recordLifecycle(stats, { type: 'playerJoined' });
    recordLifecycle(stats, { type: 'gameStarted', players: 4 });
    recordLifecycle(stats, { type: 'gameFinished', players: 4 });
    expect((await stats.report(1, live)).totals).toEqual({
      roomsCreated: 1, joins: 1, gamesStarted: 1, gamesFinished: 1, playersInGames: 4,
    });
  });
});
