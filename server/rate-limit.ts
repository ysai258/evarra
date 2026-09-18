/**
 * A token bucket per connection.
 *
 * No login means no account to throttle, so the connection is the only handle there
 * is (spec §75). It is a soft limit by design: it exists to stop a script hammering
 * room creation or spraying the roster at a question, not to stand up to a determined
 * attacker, which a friends-and-family game does not need.
 */
export type Bucket = { capacity: number; refillPerSecond: number };

export const LIMITS = {
  create: { capacity: 5, refillPerSecond: 1 / 20 },
  join: { capacity: 10, refillPerSecond: 1 / 6 },
  /** Generous: multiplayer invites rapid guessing, and a fast typist is not an attack. */
  guess: { capacity: 20, refillPerSecond: 2 },
  settings: { capacity: 20, refillPerSecond: 1 },
} as const satisfies Record<string, Bucket>;

export type LimitName = keyof typeof LIMITS;

export class RateLimiter {
  private readonly state = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** True when the action is allowed; spends a token when it is. */
  take(key: string, limit: LimitName): boolean {
    const bucket = LIMITS[limit];
    const at = this.now();
    const entry = this.state.get(`${key}:${limit}`)
      ?? { tokens: bucket.capacity, updatedAt: at };

    const refilled = Math.min(
      bucket.capacity,
      entry.tokens + ((at - entry.updatedAt) / 1000) * bucket.refillPerSecond,
    );
    if (refilled < 1) {
      this.state.set(`${key}:${limit}`, { tokens: refilled, updatedAt: at });
      return false;
    }
    this.state.set(`${key}:${limit}`, { tokens: refilled - 1, updatedAt: at });
    return true;
  }

  forget(key: string): void {
    for (const stored of [...this.state.keys()]) {
      if (stored.startsWith(`${key}:`)) this.state.delete(stored);
    }
  }
}
