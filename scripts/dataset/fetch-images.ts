/**
 * Stage 3 — Find, rank and download candidate portraits from Wikimedia Commons.
 *
 * Licensing (PRD §19): every file comes from Wikimedia Commons, the full licence
 * record travels with the image, and a file whose licence cannot be read is marked
 * unusable rather than shipped. Nothing is taken from a search engine or an
 * unlicensed site.
 *
 * Candidates come from two places: the person's Wikidata P18 (the curated "the"
 * image) and their Commons category. The category matters — P18 is often a small
 * 300px snapshot while the same category holds a 2000px portrait, and PRD §49 wants
 * the best available image rather than the first one found.
 */
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { PersonMetadata } from './fetch-metadata.ts';
import {
  IMAGES_DIR, RAW, chunk, ensureDirs, getJson, httpGet, progress, readJson, requireStage,
  runStage, writeJson,
} from './lib.ts';
import { loadPhotoReview } from './photo-review.ts';
import { rankedCandidates } from './ranking.ts';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
/** Wide enough to crop a 800×1000 asset from, small enough to fetch hundreds of. */
const FETCH_WIDTH = 1400;
/** Images kept per person: one to play with, the rest as fallbacks / future modes. */
const KEEP_PER_PERSON = 3;
const CATEGORY_FILE_LIMIT = 30;

export type ImageRecord = {
  qid: string;
  file: string;
  localFile: string;
  originalUrl: string;
  descriptionUrl: string;
  sourceName: 'Wikimedia Commons';
  mime: string;
  width: number;
  height: number;
  /** True when this file is the person's Wikidata P18 — the curated portrait. */
  primary: boolean;
  rank: number;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  credit?: string;
  year?: number;
  downloaded: boolean;
  note?: string;
};

type ImageInfo = {
  url: string;
  thumburl?: string;
  descriptionurl: string;
  mime: string;
  width: number;
  height: number;
  extmetadata?: Record<string, { value: string }>;
};

type CommonsPage = { title?: string; imageinfo?: ImageInfo[] };

const SUPPORTED = /\.(jpe?g|png|webp)$/i;
/**
 * Commons categories hold far more than portraits: road signs named after the actor,
 * bronze statues, film posters, crowd shots at events. Title filtering catches the
 * obvious ones; validation catches the rest by requiring a detected face on any
 * candidate that did not come from the curated P18 statement.
 */
const EXCLUDED_TITLE = new RegExp(
  [
    'poster', 'logo', 'signature', 'autograph', 'banner', 'first look', 'teaser',
    'trailer', 'title card', 'book', 'cover', 'trophy', 'statue', 'graffiti', 'map',
    'flag', 'sign', 'signboard', 'road', 'street', 'memorial', 'grave', 'tomb',
    'stamp', 'temple', 'building', 'house', 'museum', 'mural', 'painting', 'sketch',
    'cutout', 'plaque', 'poster', 'wall', 'screenshot', 'collage', 'audio', 'music',
  ].join('|'),
  'i',
);

function plain(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text.slice(0, 240) : undefined;
}

function yearFrom(value: string | undefined): number | undefined {
  const match = value?.match(/(18|19|20)\d{2}/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return year <= new Date().getFullYear() ? year : undefined;
}

/**
 * Names the download after the Commons file rather than its position in the list, so
 * re-running this stage after a ranking change reuses what is already on disk instead
 * of fetching several hundred megabytes again.
 */
function localName(qid: string, title: string, mime: string): string {
  const digest = createHash('sha1').update(title).digest('hex').slice(0, 8);
  return `${qid}-${digest}.${extension(mime)}`;
}

function extension(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

/**
 * Higher is better. Rewards resolution and a portrait-ish aspect ratio, because a
 * 4:5 game asset cropped from a wide group photo loses the face.
 */
function scoreImage(info: ImageInfo, isPrimary: boolean): number {
  const shortEdge = Math.min(info.width, info.height);
  const aspect = info.width / info.height;
  const resolution = Math.min(shortEdge, 1600) / 16;
  const portraitFit = aspect >= 0.6 && aspect <= 1.05 ? 25 : aspect < 0.6 ? 8 : 0;
  return resolution + portraitFit + (isPrimary ? 20 : 0);
}

/**
 * Category listings are the most request-hungry part of this stage — one call per
 * person — and they barely change. Caching them means a re-run after a ranking change
 * costs a handful of requests instead of several hundred, which matters because
 * Commons answers a sustained burst with 429s and ~50s Retry-After headers.
 * Delete `data/raw/category-files.json` to force a refresh.
 */
async function categoryFiles(category: string): Promise<string[]> {
  const url = `${COMMONS_API}?action=query&format=json&list=categorymembers&cmtype=file`
    + `&cmlimit=${CATEGORY_FILE_LIMIT}&cmtitle=${encodeURIComponent(`Category:${category}`)}`;
  try {
    const body = await getJson<{ query?: { categorymembers?: Array<{ title: string }> } }>(url);
    return (body.query?.categorymembers ?? [])
      .map((member) => member.title)
      .filter((title) => SUPPORTED.test(title) && !EXCLUDED_TITLE.test(title));
  } catch (err) {
    // Losing a category silently would quietly shrink the candidate pool.
    console.warn(`\n  ! category "${category}" unavailable: ${(err as Error).message}`);
    return [];
  }
}

async function imageInfo(titles: readonly string[]): Promise<Map<string, ImageInfo>> {
  const out = new Map<string, ImageInfo>();
  for (const batch of chunk(titles, 40)) {
    const url = `${COMMONS_API}?action=query&format=json&prop=imageinfo`
      + `&iiprop=url|size|mime|extmetadata&iiurlwidth=${FETCH_WIDTH}`
      + `&titles=${encodeURIComponent(batch.join('|'))}`;
    try {
      const body = await getJson<{
        query?: { pages?: Record<string, CommonsPage>; normalized?: Array<{ from: string; to: string }> };
      }>(url);
      const canonical = new Map<string, string>();
      for (const entry of body.query?.normalized ?? []) canonical.set(entry.to, entry.from);
      for (const page of Object.values(body.query?.pages ?? {})) {
        const info = page.imageinfo?.[0];
        const title = page.title ?? '';
        if (!info) continue;
        out.set(title, info);
        const requested = canonical.get(title);
        if (requested) out.set(requested, info);
      }
    } catch (err) {
      console.warn(`  ! imageinfo batch failed: ${(err as Error).message}`);
    }
  }
  return out;
}

async function download(url: string, destination: string): Promise<void> {
  // One image is never worth a ten-minute wait; a later run retries what is missing.
  const res = await httpGet(url, { maxBackoffMs: 45_000 });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destination));
}

async function main(): Promise<void> {
  ensureDirs();
  const people = requireStage<PersonMetadata[]>(`${RAW}/people.json`, 'dataset:fetch');
  const candidates = rankedCandidates(people);
  console.log(`  ${candidates.length} ranked candidates`);

  // 1. Collect candidate file titles per person.
  //
  // Category listing is one API call per person and by far the most expensive part of
  // this stage — Commons answers a sustained burst with 429 and a ~55s Retry-After,
  // which turns a few hundred people into hours. Two things keep it cheap:
  //
  //   - anyone whose candidates a previous run already chose is reused as-is, so
  //     adding a new group of people costs only their own listings;
  //   - the cache is written as it goes, so an interrupted run loses nothing.
  const cachePath = `${RAW}/category-files.json`;
  const cache: Record<string, string[]> = existsSync(cachePath) ? readJson(cachePath) : {};
  const previousByQid = new Map<string, string[]>();
  const previousPath = `${RAW}/images.json`;
  if (existsSync(previousPath)) {
    for (const record of readJson<ImageRecord[]>(previousPath)) {
      previousByQid.set(record.qid, [...(previousByQid.get(record.qid) ?? []), record.file]);
    }
  }

  const review = loadPhotoReview();
  const titlesByPerson = new Map<
    string,
    { primary: Set<string>; extra: Set<string>; all: Set<string> }
  >();
  let listed = 0;
  let fetchedCategories = 0;
  for (const person of candidates) {
    const primary = new Set(
      person.imageFiles.map((file) => `File:${file.replace(/_/g, ' ')}`),
    );
    // Files a reviewer added by hand are always candidates, whatever the listing says.
    const extra = new Set(review.extraCandidates[person.qid] ?? []);
    const all = new Set([...primary, ...extra]);
    const previous = previousByQid.get(person.qid);
    if (previous) {
      for (const title of previous) all.add(title);
    } else if (person.commonsCategory) {
      if (!cache[person.commonsCategory]) {
        cache[person.commonsCategory] = await categoryFiles(person.commonsCategory);
        fetchedCategories += 1;
        writeJson(cachePath, cache);
      }
      for (const title of cache[person.commonsCategory]!) all.add(title);
    }
    titlesByPerson.set(person.qid, { primary, extra, all });
    listed += 1;
    progress('commons categories', listed, candidates.length);
  }
  console.log(`  ${fetchedCategories} categories fetched, ${candidates.length - fetchedCategories} reused`);

  // 2. One imageinfo lookup per unique file.
  const uniqueTitles = [...new Set([...titlesByPerson.values()].flatMap((set) => [...set.all]))];
  console.log(`  resolving ${uniqueTitles.length} Commons files…`);
  const info = await imageInfo(uniqueTitles);

  // 3. Keep the best few per person.
  const records: ImageRecord[] = [];
  const downloadUrls = new Map<string, string>();
  for (const person of candidates) {
    const entry = titlesByPerson.get(person.qid);
    if (!entry) continue;
    const ranked = [...entry.all]
      .flatMap((title) => {
        const found = info.get(title);
        return found ? [{ title, info: found, primary: entry.primary.has(title) }] : [];
      })
      .map((item) => ({ ...item, score: scoreImage(item.info, item.primary) }))
      .sort((a, b) => b.score - a.score);

    // Wikidata's P18 is always kept, however it scores. It is the one image a human
    // chose to represent this person, and a 4000px group shot from their Commons
    // category should not be able to push it out of the running.
    // Reviewer-added files get the same guarantee, and reviewer-rejected ones never
    // take a slot a usable photo could have had.
    const usable = ranked.filter((item) => !review.rejected[item.title]);
    const pinned = usable.filter((item) => item.primary || entry.extra.has(item.title));
    const scored = [
      ...pinned,
      ...usable
        .filter((item) => !pinned.includes(item))
        .slice(0, Math.max(0, KEEP_PER_PERSON - pinned.length)),
    ];

    scored.forEach((item, index) => {
      const meta = item.info.extmetadata ?? {};
      const license = plain(meta.LicenseShortName?.value);
      const localFile = localName(person.qid, item.title, item.info.mime);
      records.push({
        qid: person.qid,
        file: item.title,
        localFile,
        originalUrl: item.info.url,
        descriptionUrl: item.info.descriptionurl,
        sourceName: 'Wikimedia Commons',
        mime: item.info.mime,
        width: item.info.width,
        height: item.info.height,
        primary: item.primary,
        rank: index,
        ...(license ? { license } : {}),
        ...(plain(meta.LicenseUrl?.value) ? { licenseUrl: plain(meta.LicenseUrl?.value) } : {}),
        ...(plain(meta.Artist?.value) ? { attribution: plain(meta.Artist?.value) } : {}),
        ...(plain(meta.Credit?.value) ? { credit: plain(meta.Credit?.value) } : {}),
        ...(yearFrom(meta.DateTimeOriginal?.value)
          ? { year: yearFrom(meta.DateTimeOriginal?.value) }
          : {}),
        downloaded: false,
        ...(license ? {} : { note: 'no licence recorded on Commons' }),
      });
      downloadUrls.set(localFile, item.info.thumburl ?? item.info.url);
    });
  }

  // 4. Download. Written as it goes: a run interrupted by a long rate limit keeps
  //    everything it has fetched, and re-running only retries what is still missing.
  console.log(`  downloading ${records.length} images…`);
  let done = 0;
  let skipped = 0;
  for (const record of records) {
    const destination = `${IMAGES_DIR}/${record.localFile}`;
    const url = downloadUrls.get(record.localFile);
    if (!url) {
      record.note = 'no download url';
    } else if (existsSync(destination)) {
      record.downloaded = true;
    } else {
      try {
        await download(url, destination);
        record.downloaded = true;
      } catch (err) {
        record.note = `download failed: ${(err as Error).message}`;
        skipped += 1;
      }
    }
    done += 1;
    if (done % 50 === 0) writeJson(`${RAW}/images.json`, records);
    progress('downloads', done, records.length);
  }

  if (skipped > 0) console.log(`  ${skipped} skipped — re-run to retry just those`);
  writeJson(`${RAW}/images.json`, records);
  const ok = records.filter((record) => record.downloaded).length;
  const withPeople = new Set(records.filter((r) => r.downloaded).map((r) => r.qid)).size;
  console.log(`✓ downloaded ${ok}/${records.length} images for ${withPeople} people -> data/images/`);
}

runStage(import.meta.url, main, 'image fetch');
