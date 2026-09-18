import { normalizeRoomCode } from './multiplayer/code.ts';

/**
 * Three routes, hand-rolled.
 *
 * The daily game never needed a router — it deep-links with `?day=` and rewrites the
 * URL with `history.replaceState`. Multiplayer adds exactly two paths, and pulling in
 * a routing library to serve them would be more dependency than navigation.
 *
 * Everything here is base-aware, because the game is served from a subdirectory on
 * GitHub Pages and from the root everywhere else — the same reason `assetUrl` exists.
 */
export type Route =
  | { name: 'daily' }
  | { name: 'multiplayer' }
  | { name: 'room'; code: string };

function basePath(): string {
  const base = import.meta.env.BASE_URL || '/';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function parseRoute(pathname: string): Route {
  const base = basePath();
  const path = (pathname.startsWith(base) ? pathname.slice(base.length) : pathname) || '/';

  const room = /^\/room\/([^/]+)\/?$/.exec(path);
  if (room) {
    const code = normalizeRoomCode(decodeURIComponent(room[1]!));
    // An unreadable code is not a room; sending them to the multiplayer front door is
    // kinder than a dead end that says nothing.
    return code ? { name: 'room', code } : { name: 'multiplayer' };
  }
  if (/^\/multiplayer\/?$/.test(path)) return { name: 'multiplayer' };
  return { name: 'daily' };
}

export function routePath(route: Route): string {
  const base = basePath();
  if (route.name === 'multiplayer') return `${base}/multiplayer`;
  if (route.name === 'room') return `${base}/room/${route.code}`;
  return `${base}/` || '/';
}

/**
 * The daily route, as a single shared object.
 *
 * `useSyncExternalStore` compares snapshots by identity, so a getter that builds a
 * fresh object every call looks like a change every render and spins. Both this and
 * `currentRoute` therefore hand back the *same* value until the path actually moves.
 */
export const DAILY_ROUTE: Route = { name: 'daily' };

let cachedPath: string | undefined;
let cachedRoute: Route = DAILY_ROUTE;

export function currentRoute(): Route {
  if (typeof window === 'undefined') return DAILY_ROUTE;
  const path = window.location.pathname;
  if (path !== cachedPath) {
    cachedPath = path;
    cachedRoute = parseRoute(path);
  }
  return cachedRoute;
}

/** Pushes a route, preserving the query string the daily game uses for `?day=`. */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.pathname = routePath(route);
  if (route.name !== 'daily') url.search = '';
  if (options.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Subscribes a component to the current route. Back and forward both land here. */
export function subscribeToRoute(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
