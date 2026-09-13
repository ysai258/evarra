import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const RAW = resolve(ROOT, 'data/raw');
export const IMAGES_DIR = resolve(ROOT, 'data/images');
export const ASSETS_DIR = resolve(ROOT, 'public/celebrities');
export const DATA_DIR = resolve(ROOT, 'src/data');

/**
 * Wikimedia's User-Agent policy asks automated clients to identify themselves and
 * give a contact address. DATASET_CONTACT supplies one; it is optional, and no API
 * key is needed anywhere in this pipeline.
 */
export const USER_AGENT = `EvaruRaDatasetBot/1.0 (open-source daily guessing game${
  process.env.DATASET_CONTACT ? `; contact ${process.env.DATASET_CONTACT}` : ''
})`;

/**
 * Wikimedia asks for a descriptive UA and polite request rates. 350ms between calls
 * keeps a full rebuild inside the API's limits; going faster earns HTTP 429s that
 * cost more time than the throttle saves.
 */
const MIN_GAP_MS = 350;
let lastRequest = 0;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
}

/**
 * `maxBackoffMs` caps how long a caller is willing to wait out a rate limit. Commons
 * answers sustained use with `Retry-After: 600`, which is fine for a metadata call the
 * run cannot proceed without, and pointless for one image out of several hundred —
 * better to give up on it and let a later run pick it up.
 */
export async function httpGet(
  url: string,
  init: RequestInit & { maxBackoffMs?: number } = {},
  attempt = 1,
): Promise<Response> {
  await throttle();
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(90_000),
    });
    if (res.status === 429) {
      // Honour Retry-After when the server sends one; otherwise back off hard.
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      throw Object.assign(new Error('HTTP 429 (rate limited)'), {
        backoff: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5000 * attempt,
      });
    }
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (err) {
    if (attempt >= 5) throw err;
    const backoff = (err as { backoff?: number }).backoff ?? 1500 * attempt * attempt;
    if (init.maxBackoffMs !== undefined && backoff > init.maxBackoffMs) {
      throw new Error(`rate limited for ${Math.round(backoff / 1000)}s — skipping`);
    }
    console.warn(`\n  ↻ retry ${attempt} in ${Math.round(backoff / 1000)}s (${(err as Error).message})`);
    await sleep(backoff);
    return httpGet(url, init, attempt + 1);
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await httpGet(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function sparql<T = Record<string, { value: string }>>(
  query: string,
): Promise<T[]> {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
  const res = await httpGet(url, { headers: { Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const body = (await res.json()) as { results: { bindings: T[] } };
  return body.results.bindings;
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function ensureDirs(): void {
  for (const dir of [RAW, IMAGES_DIR, ASSETS_DIR, DATA_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function requireStage<T>(path: string, stage: string): T {
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run \`npm run ${stage}\` first.`);
  }
  return readJson<T>(path);
}

export function qid(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1);
}

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function progress(label: string, done: number, total: number): void {
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);
  // Overwriting a single line is only readable on a terminal; in a log, sample it.
  if (process.stdout.isTTY) {
    process.stdout.write(`\r  ${label}: ${done}/${total} (${pct}%)   `);
    if (done === total) process.stdout.write('\n');
  } else if (done === total || done % Math.max(1, Math.floor(total / 10)) === 0) {
    console.log(`  ${label}: ${done}/${total} (${pct}%)`);
  }
}

/**
 * Runs a pipeline stage only when its file is the process entry point. Stages export
 * helpers that other stages and tests import; without this, importing one would run
 * the whole stage as a side effect.
 */
export function runStage(moduleUrl: string, main: () => Promise<void> | void, label: string): void {
  const entry = process.argv[1];
  if (!entry || moduleUrl !== pathToFileURL(entry).href) return;
  void (async () => {
    try {
      await main();
    } catch (err) {
      console.error(`\u2717 ${label} failed:`, err);
      process.exit(1);
    }
  })();
}
