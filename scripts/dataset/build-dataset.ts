/**
 * Stage 6 — Assemble the shipped dataset.
 *
 * Two outputs:
 *   src/data/celebrities.json — what the app bundles: only what gameplay and
 *     attribution need.
 *   data/dataset.json — the full provenance record (every source URL, licence and
 *     validation verdict) kept out of the bundle but available for audit.
 *
 * Hints are assembled here from Wikidata statements only. Nothing is written that is
 * not backed by a field in the dataset (PRD §10, §51).
 */
import { nameSignature } from '../../src/engine/normalize.ts';
import type { Celebrity, CelebrityImage, Difficulty } from '../../src/engine/types.ts';
import type { AssetRecord } from './generate-assets.ts';
import type { ImageRecord } from './fetch-images.ts';
import type { PersonMetadata } from './fetch-metadata.ts';
import { readFileSync } from 'node:fs';
import { ASSETS_DIR, DATA_DIR, RAW, ROOT, ensureDirs, requireStage, slugify, writeJson, runStage } from './lib.ts';
import {
  bandFor, categoryOf, isFamousEnoughToGuess, isModernEra, rankScore, rankedCandidates,
} from './ranking.ts';
import { titleMentions, type ValidationResult } from './validate-images.ts';

/** Images per celebrity kept in the shipped dataset: one to play, the rest as fallbacks. */
const IMAGES_PER_CELEBRITY = 2;

function difficultyFor(score: number, sorted: readonly number[]): Difficulty {
  const position = sorted.findIndex((value) => value <= score);
  return bandFor(position < 0 ? 1 : position / Math.max(1, sorted.length - 1));
}

/**
 * Assembles the clue ladder, vaguest first.
 *
 * Everything here is a Wikidata statement rendered into a sentence — nothing is
 * generated, and a missing field simply means one fewer clue. The ordering principle
 * is memorability: a fan recognises a face through the films it was in and the people
 * it worked with, so those are the clues, and the strongest one is last because it is
 * nearly the answer.
 */
function buildHints(person: PersonMetadata): Celebrity['hints'] {
  const category = categoryOf(person);
  const who = category === 'director'
    ? 'director'
    : category === 'composer'
      ? 'music director'
      : person.gender === 'female' ? 'actress' : 'actor';

  // Which generation they belong to, which is how people place a half-remembered face.
  const first = person.firstFilmYear;
  const last = person.lastFilmYear;
  // "Their films span…" rather than "working from…": a child-actor credit would make
  // the second phrasing claim a career that had not started yet.
  const era = first && last && last - first >= 3
    ? `Telugu ${who} · films from ${decadeOf(first)} to ${last}`
    : first
      ? `Telugu ${who} · films from ${decadeOf(first)}`
      : `A Telugu ${who}`;

  const hints: Celebrity['hints'] = { era };

  const family: Record<NonNullable<PersonMetadata['filmFamily']>, string> = {
    parent: 'From a film family — a parent is in the industry',
    sibling: 'From a film family — a sibling is in the industry',
    spouse: 'Married into the industry',
    child: 'From a film family — their child is in the industry',
  };

  if (person.filmFamily) hints.origin = family[person.filmFamily];
  else if (person.birthPlace) hints.origin = `Born in ${person.birthPlace}`;
  else if (person.birthYear) hints.origin = `Born in ${person.birthYear}`;

  if (person.topDirector) hints.director = `Worked with ${person.topDirector}`;

  // Two films: a lesser-known one first, the signature one last. The signature film is
  // close enough to a giveaway that it has to be the final, most expensive clue.
  const signature = person.signatureFilm;
  const otherFilm = person.notableWorks.find((work) => !signature || !work.startsWith(signature.title));
  if (otherFilm) hints.film = `Was in ${otherFilm}`;
  if (signature) {
    // Deliberately "was in", not "best known for". The most-linked film is the
    // strongest clue, but for a character actor with hundreds of credits it is not
    // necessarily what they are known for, and the clue must not claim it is.
    hints.signature = `Also in ${signature.title}`
      + `${signature.year ? ` (${signature.year})` : ''}`;
  }

  // Without a signature film the ladder ends on a weaker rung; promote a second film.
  if (!hints.signature && person.notableWorks[1] && person.notableWorks[1] !== otherFilm) {
    hints.signature = `Also in ${person.notableWorks[1]}`;
  }

  return hints;
}

function decadeOf(year: number): string {
  return `the ${Math.floor(year / 10) * 10}s`;
}

function buildAliases(person: PersonMetadata): string[] {
  const aliases = new Set<string>();
  for (const alias of person.aliases) {
    const trimmed = alias.trim();
    // Wikidata aliases include the occasional essay; keep them name-shaped.
    if (trimmed.length > 1 && trimmed.length <= 48) aliases.add(trimmed);
  }
  if (person.nameTelugu) aliases.add(person.nameTelugu);
  aliases.delete(person.name);
  return [...aliases];
}

async function main(): Promise<void> {
  ensureDirs();
  const people = requireStage<PersonMetadata[]>(`${RAW}/people.json`, 'dataset:fetch');
  const images = requireStage<ImageRecord[]>(`${RAW}/images.json`, 'dataset:images');
  const validation = requireStage<ValidationResult[]>(`${RAW}/validation.json`, 'dataset:validate');
  const assets = requireStage<AssetRecord[]>(`${RAW}/assets.json`, 'dataset:assets');

  const imageByFile = new Map(images.map((image) => [image.localFile, image]));
  const verdictByFile = new Map(validation.map((result) => [result.localFile, result]));
  const assetsByQid = new Map<string, AssetRecord[]>();
  for (const asset of assets) {
    assetsByQid.set(asset.qid, [...(assetsByQid.get(asset.qid) ?? []), asset]);
  }

  const candidates = rankedCandidates(people);
  const scores = candidates.map(rankScore).sort((a, b) => b - a);

  const celebrities: Celebrity[] = [];
  const full: unknown[] = [];
  const usedSlugs = new Map<string, number>();
  const usedSignatures = new Map<string, string>();
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const person of candidates) {
    /**
     * Picks which photo the game actually plays with. Beyond "did it validate", the
     * two things that matter are whether the frame holds exactly one face — a group
     * shot risks cropping to the wrong person — and whether the file is named after
     * them, which is the only other evidence of who is in it.
     */
    const photoScore = (localFile: string, name: string, fileTitle: string): number => {
      const verdict = verdictByFile.get(localFile);
      let score = verdict?.verdict === 'valid' ? 40 : 0;
      if (verdict?.faces === 1) score += 30;
      else if ((verdict?.faces ?? 0) > 1) score -= (verdict!.faces! - 1) * 8;
      if (titleMentions(fileTitle, name)) score += 15;
      if (verdict?.face) score += Math.min(verdict.face.size, 0.6) * 20;
      return score;
    };

    const personAssets = (assetsByQid.get(person.qid) ?? [])
      .map((asset) => ({ asset, image: imageByFile.get(asset.localFile)! }))
      .filter((entry) => entry.image)
      .sort((a, b) =>
        photoScore(b.asset.localFile, person.name, b.image.file)
        - photoScore(a.asset.localFile, person.name, a.image.file)
        || a.image.rank - b.image.rank);

    if (personAssets.length === 0) {
      skipped.push({ name: person.name, reason: 'no usable image' });
      continue;
    }

    // Deduplicate people who slipped through as two Wikidata entities.
    const signature = nameSignature(person.name);
    const clash = usedSignatures.get(signature);
    if (clash) {
      skipped.push({ name: person.name, reason: `duplicate of ${clash}` });
      continue;
    }
    usedSignatures.set(signature, person.name);

    const base = slugify(person.name) || person.qid.toLowerCase();
    const seen = usedSlugs.get(base) ?? 0;
    usedSlugs.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;

    const category = categoryOf(person);
    const score = rankScore(person);

    /**
     * The first stage is inlined as a data URI rather than fetched.
     *
     * At stage one the full 500 is still on the table, and a request for a file named
     * after this person is all a curious player needs to read out of the network
     * panel. Inlining means there is no request to read. Digging the base64 out of the
     * bundle only yields the same 92%-blurred thumbnail already on screen — at 64px
     * wide it holds nothing the blur has not already destroyed. Later stages are
     * fetched normally; by then a guess has been spent.
     */
    const inlineFirstStage = (paths: string[]): string[] => paths.map((path, stage) => {
      if (stage > 0) return path;
      const bytes = readFileSync(`${ASSETS_DIR}/${path.split('/').pop()}`);
      return `data:image/webp;base64,${bytes.toString('base64')}`;
    });

    const buildImage = (entry: (typeof personAssets)[number]): CelebrityImage => ({
      localPath: entry.asset.assetPath,
      previews: inlineFirstStage(entry.asset.previewPaths),
      sourceUrl: entry.image.descriptionUrl,
      sourceName: entry.image.sourceName,
      ...(entry.image.license ? { license: entry.image.license } : {}),
      ...(entry.image.licenseUrl ? { licenseUrl: entry.image.licenseUrl } : {}),
      ...(entry.image.attribution ? { attribution: entry.image.attribution } : {}),
      width: entry.image.width,
      height: entry.image.height,
      ...(entry.image.year ? { year: entry.image.year } : {}),
    });

    const celebrity: Celebrity = {
      id,
      wikidataId: person.qid,
      name: person.name,
      ...(person.nameTelugu ? { nameTelugu: person.nameTelugu } : {}),
      aliases: buildAliases(person),
      gender: person.gender!,
      category,
      difficulty: difficultyFor(score, scores),
      ...(person.birthYear ? { birthYear: person.birthYear } : {}),
      ...(person.birthPlace ? { birthPlace: person.birthPlace } : {}),
      ...(person.firstFilmYear ? { debutYear: person.firstFilmYear } : {}),
      ...(person.notableWorks.length > 0
        ? { notableWorks: person.notableWorks.slice(0, 3) }
        : {}),
      profession: person.occupations,
      popularity: Math.round(score),
      // Leads, character actors, comedians, villains and directors are all fair game
      // as long as they are famous enough to recognise and working in the modern era.
      // Everyone else stays in data/dataset.json.
      playable: ['actor', 'actress', 'director', 'composer'].includes(category)
        && isFamousEnoughToGuess(person)
        && isModernEra(person),
      hints: buildHints(person),
      images: personAssets.slice(0, IMAGES_PER_CELEBRITY).map(buildImage),
      source: {
        url: `https://www.wikidata.org/wiki/${person.qid}`,
        provider: 'wikidata',
        fetchedAt: person.fetchedAt,
      },
    };

    celebrities.push(celebrity);
    full.push({
      ...celebrity,
      notableWorks: person.notableWorks,
      allImages: personAssets.map((entry) => ({
        ...buildImage(entry),
        originalUrl: entry.image.originalUrl,
        validation: verdictByFile.get(entry.asset.localFile),
      })),
      wikipediaUrl: person.wikipediaUrl,
      wikipediaCount: person.wikipediaCount,
      hasTeluguWiki: person.hasTeluguWiki,
      filmCount: person.filmCount,
    });
  }

  celebrities.sort((a, b) => a.name.localeCompare(b.name));

  // The bundle ships only what the game plays with. Directors, character artists and
  // everyone below the fame bar stay in the full provenance record instead of costing
  // every player a download — and keeping the guess list to playable names means a
  // player can never waste a guess on someone who could not be the answer.
  const shipped = celebrities.filter((celebrity) => celebrity.playable);

  writeJson(`${DATA_DIR}/celebrities.json`, shipped);
  writeJson(`${ROOT}/data/dataset.json`, full);

  const playable = shipped;
  const byCategory = new Map<string, number>();
  const byDifficulty = new Map<string, number>();
  for (const celebrity of celebrities) {
    byCategory.set(celebrity.category, (byCategory.get(celebrity.category) ?? 0) + 1);
  }
  for (const celebrity of playable) {
    byDifficulty.set(celebrity.difficulty, (byDifficulty.get(celebrity.difficulty) ?? 0) + 1);
  }

  console.log(`✓ dataset built: ${celebrities.length} people, ${playable.length} playable and shipped`);
  console.log(`  categories: ${[...byCategory].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  difficulty: ${[...byDifficulty].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  if (skipped.length > 0) console.log(`  skipped ${skipped.length} (${skipped.slice(0, 3).map((s) => s.reason).join('; ')}…)`);
  const belowBar = celebrities.length - playable.length;
  console.log(`  held back: ${belowBar} below the fame bar or not actors (kept in data/dataset.json)`);
  if (playable.length < 150) {
    console.warn(`  ⚠ only ${playable.length} playable celebrities — the fame bar may be too strict`);
  }
}

runStage(import.meta.url, main, 'dataset build');
