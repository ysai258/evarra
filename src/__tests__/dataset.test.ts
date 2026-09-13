/**
 * Integrity checks over the generated dataset. They run against whatever
 * `npm run dataset:build` produced, and are skipped (not failed) before the first
 * build so a fresh clone can still run the suite.
 */
import { describe, expect, it } from 'vitest';
import { celebrities, launchDate, playableCelebrities, scheduleThrough } from '../data/index.ts';
import { normalizeName } from '../engine/normalize.ts';
import { availableHints } from '../engine/hints.ts';
import { MAX_ATTEMPTS } from '../engine/reveal.ts';

const built = celebrities.length > 0;
const describeDataset = built ? describe : describe.skip;

describeDataset('generated dataset', () => {
  it('has no duplicate ids', () => {
    const ids = celebrities.map((celebrity) => celebrity.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate Wikidata entities', () => {
    const qids = celebrities.map((celebrity) => celebrity.wikidataId);
    expect(new Set(qids).size).toBe(qids.length);
  });

  it('has no two people sharing a normalised name', () => {
    const names = celebrities.map((celebrity) => normalizeName(celebrity.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('never reuses the same photo for two people', () => {
    const paths = celebrities.map((celebrity) => celebrity.images[0]?.localPath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every celebrity at least one image with full provenance', () => {
    for (const celebrity of celebrities) {
      expect(celebrity.images.length, celebrity.name).toBeGreaterThan(0);
      for (const image of celebrity.images) {
        expect(image.localPath, celebrity.name).toMatch(/^\/celebrities\/.+\.webp$/);
        expect(image.sourceUrl, celebrity.name).toMatch(/^https:\/\//);
        expect(image.sourceName, celebrity.name).toBeTruthy();
        expect(image.license, celebrity.name).toBeTruthy();
      }
    }
  });

  // A filename that carries the subject's Wikidata id hands the answer to anyone who
  // opens the network panel — no repository access needed.
  it('names assets opaquely, with no trace of the subject', () => {
    for (const celebrity of celebrities) {
      for (const image of celebrity.images) {
        const files = [image.localPath, ...image.previews.filter((p) => !p.startsWith('data:'))];
        // Only distinctive fragments: a one- or two-letter initial ("A. R. Rahman")
        // turns up in any hex string by chance and means nothing.
        const fragments = celebrity.id.split('-').filter((part) => part.length >= 4);
        for (const file of files) {
          expect(file, celebrity.name).not.toMatch(/Q\d{3,}/);
          for (const fragment of fragments) {
            expect(file.toLowerCase(), celebrity.name).not.toContain(fragment.toLowerCase());
          }
        }
      }
    }
  });

  it('ships one resolution-limited preview per blurred stage', () => {
    for (const celebrity of celebrities) {
      for (const image of celebrity.images) {
        expect(image.previews, celebrity.name).toHaveLength(MAX_ATTEMPTS - 1);
        // Stage one is inlined so it costs no request; the rest are files.
        expect(image.previews[0], celebrity.name).toMatch(/^data:image\/webp;base64,/);
        for (const preview of image.previews.slice(1)) {
          expect(preview, celebrity.name).toMatch(/^\/celebrities\/.+-s\d\.webp$/);
          expect(preview, celebrity.name).not.toBe(image.localPath);
        }
        expect(new Set(image.previews).size, celebrity.name).toBe(image.previews.length);
      }
    }
  });

  it('records a Wikidata source for every celebrity', () => {
    for (const celebrity of celebrities) {
      expect(celebrity.source.provider).toBe('wikidata');
      expect(celebrity.source.url).toContain(celebrity.wikidataId);
    }
  });

  it('gives every celebrity an era clue and most of them four or more', () => {
    const withFour = celebrities.filter((celebrity) => availableHints(celebrity).length >= 4);
    for (const celebrity of celebrities) {
      expect(celebrity.hints.era, celebrity.name).toBeTruthy();
    }
    expect(withFour.length / celebrities.length).toBeGreaterThan(0.8);
  });

  it('never states a database statistic as though it were a fact about the person', () => {
    for (const celebrity of celebrities) {
      for (const hint of Object.values(celebrity.hints)) {
        expect(hint, celebrity.name).not.toMatch(/credits|recorded|entries|database/i);
      }
    }
  });

  it('keeps the giveaway film for the last clue', () => {
    for (const celebrity of celebrities) {
      if (!celebrity.hints.signature) continue;
      expect(availableHints(celebrity).at(-1)?.key, celebrity.name).toBe('signature');
    }
  });

  it('plays leads, character actors, directors and music directors — not bit parts', () => {
    for (const celebrity of playableCelebrities) {
      expect(['actor', 'actress', 'director', 'composer']).toContain(celebrity.category);
    }
  });

  it('only ships stars working in the modern era', () => {
    for (const celebrity of playableCelebrities) {
      // The era clue carries the span, so it doubles as the assertion.
      const lastYear = Number(celebrity.hints.era.match(/(\d{4})\s*$/)?.[1] ?? '0');
      if (lastYear > 0) expect(lastYear, celebrity.name).toBeGreaterThanOrEqual(2010);
    }
  });

  /**
   * Deliberately below the PRD's 200 target. Eligibility alone ("is this person
   * Telugu cinema?") reached 243, but a third of those were bit-part actors nobody
   * could identify at 92% blur. The fame bar in ranking.ts trades count for a roster
   * of faces the player has actually seen.
   */
  it('ships a substantial roster of recognisable stars', () => {
    expect(playableCelebrities.length).toBeGreaterThanOrEqual(140);
  });

  it('ships only playable stars — the guess list can never waste a guess', () => {
    expect(celebrities.every((celebrity) => celebrity.playable)).toBe(true);
  });

  it('holds every playable star above the fame floor', () => {
    for (const celebrity of playableCelebrities) {
      expect(celebrity.popularity, celebrity.name).toBeGreaterThanOrEqual(40);
    }
  });

  it('covers both actors and actresses', () => {
    const actresses = playableCelebrities.filter((c) => c.category === 'actress');
    expect(actresses.length).toBeGreaterThan(50);
    expect(playableCelebrities.length - actresses.length).toBeGreaterThan(80);
  });

  it('spreads difficulty across all three bands', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      expect(
        playableCelebrities.filter((c) => c.difficulty === difficulty).length,
        difficulty,
      ).toBeGreaterThan(0);
    }
  });

  it('never lists a celebrity as their own alias', () => {
    for (const celebrity of celebrities) {
      expect(celebrity.aliases, celebrity.name).not.toContain(celebrity.name);
    }
  });
});

describeDataset('puzzle schedule', () => {
  const ids = new Set(celebrities.map((celebrity) => celebrity.id));

  it('pins a launch date', () => {
    expect(launchDate).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });

  // The repository is public: a committed schedule would simply be a list of answers.
  it('stores no schedule on disk', () => {
    const shipped = Object.keys(import.meta.glob('../data/*.json', { eager: true }));
    expect(shipped.some((path) => /puzzle|schedule/i.test(path))).toBe(false);
  });

  it('resolves every day since launch to a celebrity in the roster', () => {
    const schedule = scheduleThrough('2027-06-01');
    expect(Object.keys(schedule).length).toBeGreaterThan(200);
    for (const [date, id] of Object.entries(schedule)) {
      expect(ids.has(id), date + ' -> ' + id).toBe(true);
    }
  });
});
