/**
 * The human photo review, applied by the fetch and validation stages.
 *
 * Automated checks cannot answer the one question that matters most — is this crop a
 * picture of this person, and only them? picojs finds upright frontal faces and misses
 * the rest, so a ceremony photo where the star is side-on reads as a clean portrait of
 * whoever stands next to them. The review file records the answer a person gave after
 * looking, keyed by Commons file title so it survives re-runs and re-ranking.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib.ts';

export type PhotoReview = {
  /** File title → why it must never be used. */
  rejected: Record<string, string>;
  /** File title → confirmation that only this person is in frame. */
  approved: Record<string, string>;
  /** Wikidata id → extra Commons file titles to consider. */
  extraCandidates: Record<string, string[]>;
};

export const PHOTO_REVIEW_PATH = resolve(ROOT, 'scripts/dataset/photo-review.json');

export function loadPhotoReview(path = PHOTO_REVIEW_PATH): PhotoReview {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PhotoReview>;
  return {
    rejected: raw.rejected ?? {},
    approved: raw.approved ?? {},
    extraCandidates: raw.extraCandidates ?? {},
  };
}
