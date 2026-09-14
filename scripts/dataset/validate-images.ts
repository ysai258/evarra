/**
 * Stage 4 — Validate every downloaded image (PRD §21, §22).
 *
 * Hard rejections are limited to things that would visibly break the game: files
 * that will not decode, images too small to crop a 800×1000 asset from, extreme
 * aspect ratios, blank/flat images, and duplicates of a photo already in use.
 *
 * Face detection only *flags* — the detector misses profile shots, sunglasses and
 * low-contrast archive photos, so rejecting on it would throw away good portraits
 * of exactly the classic stars this game wants.
 */
import sharp from 'sharp';
import { normalizeName } from '../../src/engine/normalize.ts';
import type { PersonMetadata } from './fetch-metadata.ts';
import type { ImageRecord } from './fetch-images.ts';
import { detectFaces, faceDetectionAvailable, faceDetectionUnavailableReason, type Face } from './face.ts';
import { loadPhotoReview } from './photo-review.ts';
import { IMAGES_DIR, RAW, ensureDirs, progress, requireStage, writeJson, runStage } from './lib.ts';

/** Below this the source cannot fill an 800×1000 asset without upscaling mush. */
const MIN_DIMENSION = 400;
const PREFERRED_DIMENSION = 500;
const MIN_ASPECT = 0.35;
const MAX_ASPECT = 2.6;
/** Standard deviation below this means a flat/blank image. */
const MIN_STDDEV = 6;
const MAX_FACES = 4;
/** Face diameter as a fraction of the image's short edge. */
const MIN_FACE_SIZE = 0.07;
/**
 * A candidate pulled from a Commons category, rather than from the curated P18
 * statement, has to prove itself: exactly one clearly visible face. That is what
 * rejects the road signs, statues and crowd shots categories are full of, without
 * throwing away the profile and archive portraits P18 supplies.
 */
const MIN_FACE_SIZE_SECONDARY = 0.12;

/**
 * Commons holds plenty of things that are *about* a person without being a usable
 * photograph of them: a commemorative stamp, a bronze statue, a pencil sketch, a road
 * named after them. Word-boundary matching keeps "signature" from tripping "sign".
 *
 * Film stills are excluded too (PRD §19). Beyond the licensing question, a still from
 * someone's filmography is not reliably a picture of *them* — and when it is, it is
 * usually them in character, which makes for a poor face puzzle.
 */
const NON_PHOTOGRAPHIC = new RegExp(
  String.raw`\b(stamp|statue|bust|sketch|drawing|painting|mural|graffiti|caricature`
  + String.raw`|poster|logo|banner|plaque|memorial|grave|tomb|signboard|sign board`
  + String.raw`|road|street|temple|museum|cutout|collage|screenshot|book|cover`
  + String.raw`|still|stills|scene|screengrab|chart|graph|filmography|page)\b`
  + String.raw`|\(\d{4}[ _]film\)`,
  'i',
);

export type Verdict = 'valid' | 'review' | 'rejected';

export type ValidationResult = {
  qid: string;
  localFile: string;
  verdict: Verdict;
  reasons: string[];
  width: number;
  height: number;
  hash?: string;
  faces?: number;
  face?: Face;
  sharpness?: number;
};

/** 64-bit average hash — enough to spot the same photo reused for two people. */
async function averageHash(file: string): Promise<string> {
  const { data } = await sharp(file)
    .rotate()
    .greyscale()
    .resize(8, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mean = [...data].reduce((sum: number, value: number) => sum + value, 0) / data.length;
  let bits = '';
  for (const value of data) bits += value > mean ? '1' : '0';
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

function hamming(a: string, b: string): number {
  let distance = 0;
  let xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

/** True when a Commons file title carries a distinctive part of the person's name. */
export function titleMentions(title: string, name: string | undefined): boolean {
  if (!name) return false;
  const haystack = normalizeName(title).replace(/ /g, '');
  return normalizeName(name)
    .split(' ')
    .filter((token) => token.length >= 4)
    .some((token) => haystack.includes(token));
}

function tokens(value: string): string[] {
  return normalizeName(value).split(' ').filter(Boolean);
}

/** True when `needle`'s tokens appear as a contiguous run inside `haystack`'s. */
function containsTokenRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  return haystack.some((_, start) =>
    needle.every((token, offset) => haystack[start + offset] === token));
}

/** A name specific enough that finding it in a title means something. */
export function isDistinctiveName(name: string): boolean {
  const parts = tokens(name);
  return parts.length >= 2 || (parts[0]?.length ?? 0) >= 8;
}

/**
 * Returns the other celebrity a file title names, if any.
 *
 * This is the defence against the single most damaging dataset error: a press photo
 * captioned "X and Y" where the face detector locks onto Y. The game would then show
 * the wrong person's face and call them X. Matching on contiguous name tokens (rather
 * than substrings) keeps "Suhasini Maniratnam" from colliding with "Mani Ratnam", and
 * a name contained in the subject's own name is never treated as someone else.
 */
export function namesAnotherPerson(
  title: string,
  self: string,
  everyone: ReadonlyArray<{ name: string; tokens: string[] }>,
): string | undefined {
  const titleTokens = tokens(title);
  const selfTokens = tokens(self);
  return everyone.find((other) =>
    other.name !== self
    && !containsTokenRun(selfTokens, other.tokens)
    && containsTokenRun(titleTokens, other.tokens))?.name;
}

/**
 * Nobody should fall out of the game purely because the face detector could not see
 * their face. Where every candidate a person has was rejected for that alone, the
 * largest one is restored for review — that is what keeps names like N. T. Rama Rao
 * Jr., whose only free photographs defeat an upright-frontal cascade.
 */
export function rescueFacelessOnly(results: ValidationResult[]): number {
  const byPerson = new Map<string, ValidationResult[]>();
  for (const result of results) {
    byPerson.set(result.qid, [...(byPerson.get(result.qid) ?? []), result]);
  }

  let rescued = 0;
  for (const person of byPerson.values()) {
    if (person.some((result) => result.verdict !== 'rejected')) continue;
    const candidates = person
      .filter((result) =>
        result.reasons.length === 1 && result.reasons[0] === 'no face detected')
      .sort((a, b) => b.width * b.height - a.width * a.height);
    const best = candidates[0];
    if (!best) continue;
    best.verdict = 'review';
    best.reasons = ['no face detected — kept as this person’s only usable photo'];
    rescued += 1;
  }
  return rescued;
}

async function main(): Promise<void> {
  ensureDirs();
  const images = requireStage<ImageRecord[]>(`${RAW}/images.json`, 'dataset:images');
  const people = requireStage<PersonMetadata[]>(`${RAW}/people.json`, 'dataset:fetch');
  const names = new Map(people.map((person) => [person.qid, person.name] as const));
  const everyone = people
    .filter((person) => isDistinctiveName(person.name))
    .map((person) => ({
      name: person.name,
      tokens: normalizeName(person.name).split(' ').filter(Boolean),
    }));
  const downloaded = images.filter((image) => image.downloaded);
  const review = loadPhotoReview();

  if (faceDetectionAvailable()) console.log('  face detection: pico.js (vendored cascade)');
  else console.log(`  face detection unavailable (${faceDetectionUnavailableReason()}) — images will be flagged for review instead`);

  const results: ValidationResult[] = [];
  const seen: Array<{ hash: string; file: string }> = [];
  let done = 0;

  for (const image of images) {
    const reasons: string[] = [];
    const file = `${IMAGES_DIR}/${image.localFile}`;
    const result: ValidationResult = {
      qid: image.qid,
      localFile: image.localFile,
      verdict: 'valid',
      reasons,
      width: image.width,
      height: image.height,
    };

    if (!image.downloaded) {
      result.verdict = 'rejected';
      reasons.push(image.note ?? 'not downloaded');
      results.push(result);
      continue;
    }
    const rejectedOnReview = review.rejected[image.file];
    if (rejectedOnReview) {
      result.verdict = 'rejected';
      reasons.push(`rejected on photo review: ${rejectedOnReview}`);
      results.push(result);
      continue;
    }
    // A reviewer saw this photo and confirmed only this person is in it, which settles
    // the two questions the detector and the title check exist to guess at.
    const approved = Boolean(review.approved[image.file]);

    if (!image.license) {
      result.verdict = 'rejected';
      reasons.push('licence could not be established');
      results.push(result);
      continue;
    }

    if (NON_PHOTOGRAPHIC.test(image.file)) {
      result.verdict = 'rejected';
      reasons.push('not a photograph of the person (stamp, statue, sketch, …)');
      results.push(result);
      continue;
    }

    const alsoNamed = namesAnotherPerson(image.file, names.get(image.qid) ?? '', everyone);
    if (alsoNamed && !approved) {
      result.verdict = 'rejected';
      reasons.push(`the file also names ${alsoNamed} — the crop could be the wrong person`);
      results.push(result);
      continue;
    }

    try {
      const meta = await sharp(file).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      result.width = image.width;
      result.height = image.height;
      if (width === 0 || height === 0) throw new Error('no dimensions');

      const sourceMin = Math.min(image.width, image.height);
      if (sourceMin < MIN_DIMENSION) reasons.push(`source too small (${image.width}×${image.height})`);
      else if (sourceMin < PREFERRED_DIMENSION) reasons.push(`below preferred 500px (${image.width}×${image.height})`);

      const aspect = width / height;
      if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) reasons.push(`extreme aspect ratio ${aspect.toFixed(2)}`);

      const stats = await sharp(file).stats();
      const spread = Math.max(...stats.channels.map((channel) => channel.stdev));
      result.sharpness = Math.round(spread * 10) / 10;
      if (spread < MIN_STDDEV) reasons.push('blank or flat image');

      result.hash = await averageHash(file);
      const duplicate = seen.find((entry) => hamming(entry.hash, result.hash!) <= 4);
      if (duplicate) reasons.push(`duplicate of ${duplicate.file}`);
      else seen.push({ hash: result.hash, file: image.localFile });

      const faces = await detectFaces(file);
      if (faces) {
        const minSize = image.primary ? MIN_FACE_SIZE : MIN_FACE_SIZE_SECONDARY;
        const maxFaces = image.primary ? MAX_FACES : 1;
        result.faces = faces.length;
        if (faces[0]) result.face = faces[0];
        if (faces.length === 0) {
          reasons.push('no face detected');
          // With no face to verify, the filename is the only evidence the photo is
          // even of this person — event photos of a crowd routinely are not.
          if (!titleMentions(image.file, names.get(image.qid))) {
            reasons.push('no face detected and the file is not named after them');
          }
        } else if (faces.length > maxFaces) reasons.push(`${faces.length} competing faces`);
        else if (faces[0]!.size < minSize) reasons.push('face too small in frame');
      } else {
        reasons.push('face detection unavailable');
      }
    } catch (err) {
      reasons.push(`unreadable: ${(err as Error).message}`);
    }

    /**
     * Wikidata's P18 is a curated choice, so a missed face there is forgiven — the
     * detector only handles upright frontal faces and misses sunglasses, profiles and
     * archive photography. A candidate scraped from a Commons category gets no such
     * benefit: with no face to verify, "no face detected" there means a filmography
     * chart, a painted portrait or a ceremony group shot just as often as a photo.
     * Anyone left with nothing by this rule is rescued in the pass below.
     */
    const faceReason = (reason: string) =>
      reason === 'no face detected'
      || reason.endsWith('competing faces')
      || reason === 'face too small in frame';

    const fatal = reasons.some((reason) =>
      reason.startsWith('unreadable')
      || reason.startsWith('source too small')
      || reason.startsWith('extreme aspect')
      || reason.startsWith('blank')
      || reason.startsWith('duplicate')
      || (!approved && reason.startsWith('no face detected and'))
      || (!image.primary && !approved && faceReason(reason)));
    result.verdict = fatal ? 'rejected' : reasons.length > 0 ? 'review' : 'valid';
    results.push(result);
    done += 1;
    progress('validating', done, downloaded.length);
  }

  rescueFacelessOnly(results);

  writeJson(`${RAW}/validation.json`, results);
  const counts = { valid: 0, review: 0, rejected: 0 };
  for (const result of results) counts[result.verdict] += 1;
  console.log('\nDataset validation\n');
  console.log(`  ✓ ${counts.valid} valid`);
  console.log(`  ⚠ ${counts.review} require review`);
  console.log(`  ✗ ${counts.rejected} rejected`);
}

runStage(import.meta.url, main, 'validation');
