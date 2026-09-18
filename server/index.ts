import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from 'socket.io';
import { MULTIPLAYER_CONFIG } from '../src/multiplayer/config.ts';
import { celebrities } from '../src/data/index.ts';
import { readStageAsset } from './assets.ts';
import { createRoomManager, registerHandlers, type TypedServer } from './handlers.ts';
import { systemClock } from './room-manager.ts';
import { RateLimiter } from './rate-limit.ts';

/**
 * The multiplayer server.
 *
 * EVARRA? is otherwise a static site — a folder of files a CDN can hand out, with no
 * process behind it. Rooms cannot work that way: something has to hold the clock, own
 * the answers and decide when a question ends, and it has to stay alive between
 * requests. This is that something, and it is deliberately the smallest version of it:
 * one Node process, Socket.IO for the connections, and every room in memory.
 *
 * In-memory state is the one real constraint. It means **a single instance** — two of
 * these behind a load balancer would each hold half the rooms and neither would know
 * it. Scaling out is a Redis adapter and a shared room store away, but a game for a
 * group of friends does not need that, and pretending otherwise would be architecture
 * for its own sake (spec §73).
 *
 * The daily game is untouched by all of this. It still builds to static files and
 * still works with this server switched off.
 */

const port = Number(process.env.MULTIPLAYER_PORT ?? process.env.PORT ?? 8787);

/**
 * Which sites may talk to this server. The game's own origin differs from the
 * server's in every deployment — Pages serves the app, this serves the rooms — so
 * there is always a cross-origin hop to allow. Unset means "any", which is right for
 * a dev machine and wrong for a public one.
 */
const allowedOrigins = (process.env.MULTIPLAYER_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsOrigin(origin: string | undefined): string | undefined {
  if (allowedOrigins.length === 0) return origin ?? '*';
  return origin && allowedOrigins.includes(origin) ? origin : undefined;
}

const httpServer = createServer((request, response) => {
  void handleRequest(request, response);
});

const io: TypedServer = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length === 0 ? true : allowedOrigins,
    methods: ['GET', 'POST'],
  },
  // A phone that sleeps for a few seconds should come back to its seat, not to a new
  // one; the grace period in RoomManager is what actually holds the seat, and these
  // keep the socket itself from being declared dead too eagerly.
  pingInterval: 20_000,
  pingTimeout: 20_000,
});

const manager = createRoomManager(io, celebrities);
registerHandlers(io, manager, new RateLimiter(), systemClock.now);

setInterval(() => manager.cleanup(), MULTIPLAYER_CONFIG.CLEANUP_INTERVAL_MS).unref();

/**
 * Two routes: a health check, and the blurred photographs.
 *
 * The image route is the interesting one. It exists so that no filename ever reaches
 * a browser — see `assets.ts` — and it refuses to serve a stage the room's clock has
 * not reached, which is what makes the token a veil rather than a key.
 */
async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const origin = corsOrigin(request.headers.origin);
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  const url = new URL(request.url ?? '/', 'http://localhost');

  if (url.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, rooms: manager.size }));
    return;
  }

  const asset = /^\/mp\/asset\/([0-9a-f]{32})\/(\d)$/.exec(url.pathname);
  if (asset) {
    const resolved = manager.resolveAsset(asset[1]!);
    if (!resolved) {
      plain(response, 404, 'Not found');
      return;
    }
    const result = await readStageAsset(resolved.celebrity, Number(asset[2]), resolved.maxStage);
    if (!result.ok) {
      plain(response, result.status, result.status === 403 ? 'Not yet' : 'Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Length': result.body.byteLength,
      // Safe to cache: the URL carries both the question and the stage, and a stage
      // only becomes fetchable once it is already on everyone's screen.
      'Cache-Control': 'private, max-age=300',
    });
    response.end(result.body);
    return;
  }

  plain(response, 404, 'Not found');
}

/** Errors say nothing about the server (spec §79) — a status and a word is plenty. */
function plain(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
  response.end(body);
}

httpServer.listen(port, () => {
  const origins = allowedOrigins.length === 0 ? 'any (development)' : allowedOrigins.join(', ');
  console.log(`EVARRA? multiplayer listening on :${port} — origins: ${origins}`);
});
