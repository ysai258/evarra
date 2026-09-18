import { describe, expect, it } from 'vitest';
import { currentRoute, parseRoute, routePath } from '../router.ts';

describe('routes', () => {
  it('sends the bare path to the daily game', () => {
    expect(parseRoute('/')).toEqual({ name: 'daily' });
    expect(parseRoute('/index.html')).toEqual({ name: 'daily' });
  });

  it('recognises the multiplayer front door', () => {
    expect(parseRoute('/multiplayer')).toEqual({ name: 'multiplayer' });
    expect(parseRoute('/multiplayer/')).toEqual({ name: 'multiplayer' });
  });

  it('pulls the room code out of an invite link', () => {
    expect(parseRoute('/room/AB7K9Q')).toEqual({ name: 'room', code: 'AB7K9Q' });
    expect(parseRoute('/room/ab7k9q')).toEqual({ name: 'room', code: 'AB7K9Q' });
  });

  /** A dead end that says nothing is worse than the front door. */
  it('falls back to the front door when the code is unreadable', () => {
    expect(parseRoute('/room/nope')).toEqual({ name: 'multiplayer' });
    expect(parseRoute('/room/AB7K9O')).toEqual({ name: 'multiplayer' });
  });

  it('builds the paths it parses', () => {
    expect(routePath({ name: 'multiplayer' })).toBe('/multiplayer');
    expect(routePath({ name: 'room', code: 'AB7K9Q' })).toBe('/room/AB7K9Q');
    expect(parseRoute(routePath({ name: 'room', code: 'AB7K9Q' })))
      .toEqual({ name: 'room', code: 'AB7K9Q' });
  });
});

describe('route snapshots', () => {
  /**
   * `useSyncExternalStore` compares by identity. A getter that built a new object each
   * call would look like a change on every render and spin the app — which is exactly
   * what it did until this was cached.
   */
  it('hands back the same object while the path has not moved', () => {
    window.history.replaceState(null, '', '/room/AB7K9Q');
    expect(currentRoute()).toBe(currentRoute());
    window.history.replaceState(null, '', '/multiplayer');
    expect(currentRoute()).toEqual({ name: 'multiplayer' });
    expect(currentRoute()).toBe(currentRoute());
  });
});
