import type { Clock, RoomEvents, TimerHandle } from '../../server/room-manager.ts';
import type { ServerEvents } from '../multiplayer/protocol.ts';

/**
 * A clock the tests own.
 *
 * Multiplayer is almost entirely about *when* — a question ends on a timer, a reveal
 * lasts ten seconds, a dropped player keeps their seat for thirty. Waiting those out
 * in real time would make the suite unusable, so the room manager takes its clock as a
 * dependency and here it is a number the test moves by hand.
 */
export class FakeClock implements Clock {
  private current: number;

  private nextId = 1;

  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  constructor(start = 1_700_000_000_000) {
    this.current = start;
  }

  now(): number {
    return this.current;
  }

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { at: this.current + Math.max(0, ms), callback });
    return { id };
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers.delete(handle.id as number);
  }

  /**
   * Moves time forward, firing whatever comes due on the way — in order, and including
   * timers scheduled by the callbacks it just ran. Jumping straight to the end would
   * skip a question's timer and land in a state the server can never actually reach.
   */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      this.timers.delete(id);
      this.current = timer.at;
      timer.callback();
    }
    this.current = target;
  }
}

export type Recorded = { target: string; event: keyof ServerEvents; args: unknown[] };

/** Captures everything the manager announces, so tests can assert on the broadcast. */
export class RecordingEvents implements RoomEvents {
  readonly sent: Recorded[] = [];

  toRoom<E extends keyof ServerEvents>(
    code: string, event: E, ...args: Parameters<ServerEvents[E]>
  ): void {
    this.sent.push({ target: `room:${code}`, event, args });
  }

  toPlayer<E extends keyof ServerEvents>(
    playerId: string, event: E, ...args: Parameters<ServerEvents[E]>
  ): void {
    this.sent.push({ target: `player:${playerId}`, event, args });
  }

  /** Every payload for one event type, oldest first. */
  of(event: keyof ServerEvents): unknown[][] {
    return this.sent.filter((entry) => entry.event === event).map((entry) => entry.args);
  }

  last(event: keyof ServerEvents): unknown[] | undefined {
    return this.of(event).at(-1);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
