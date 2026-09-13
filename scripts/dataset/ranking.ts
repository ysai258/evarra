/**
 * Candidate ranking (PRD §23) — shared by the image and build stages so both agree
 * on who is in the dataset.
 *
 * The problem this solves: a naive "most famous person with a Telugu credit" sort
 * surfaces Bollywood stars with a single guest appearance. Telugu relevance is
 * therefore weighted far above raw global fame, and a Telugu Wikipedia article acts
 * as the strongest cheap relevance signal.
 */
import type { PersonMetadata } from './fetch-metadata.ts';
import type { Category, Difficulty } from '../../src/engine/types.ts';

const ACTING_OCCUPATIONS = new Set([
  'actor', 'film actor', 'television actor', 'voice actor', 'comedian',
]);
const DIRECTING_OCCUPATIONS = new Set(['film director', 'director']);
const COMPOSING_OCCUPATIONS = new Set([
  'composer', 'film score composer', 'music director', 'musician',
]);

/** Fewer Telugu credits than this and we cannot call someone a Telugu cinema face. */
export const MIN_TELUGU_FILMS = 5;
/** A guest star from another industry needs a lot of credits to qualify. */
export const MIN_FILMS_WITHOUT_TELUGU_WIKI = 10;

/**
 * The fame bar for being *playable*.
 *
 * Eligibility above only asks "is this person Telugu cinema?", which lets in a long
 * tail of side and bit-part actors. A face-recognition game needs faces people
 * actually recognise: nobody can identify a one-scene character actor at 92% blur,
 * and being asked to is just frustrating.
 *
 * Two ways to clear it, because the signals fail in opposite directions. Articles in
 * many Wikipedia languages mean broad public recognition, but they under-count
 * veterans who worked before the internet. A very large Telugu filmography means a
 * face the audience has seen a thousand times, even if the wider web barely covers
 * them — that is what keeps Kaikala Satyanarayana (489 films, 6 language editions).
 */
export const MIN_WIKIPEDIA_EDITIONS = 8;
export const PROLIFIC_FILM_COUNT = 40;

export function isFamousEnoughToGuess(person: PersonMetadata): boolean {
  return person.wikipediaCount >= MIN_WIKIPEDIA_EDITIONS
    || person.filmCount >= PROLIFIC_FILM_COUNT;
}

/**
 * The game is about faces people have seen, which in practice means the modern era.
 * A star whose last Telugu credit is from the 1970s is a film-history question, not a
 * recognition one.
 *
 * The line sits at 2010 rather than something tighter because these years come from
 * Wikidata's *Telugu* credits alone, which lag real filmographies badly — a stricter
 * cut-off starts throwing out people who are demonstrably still working simply because
 * their recent films have not been catalogued.
 */
export const MODERN_ERA_FROM = 2010;

export function isModernEra(person: PersonMetadata): boolean {
  return (person.lastFilmYear ?? 0) >= MODERN_ERA_FROM;
}

export function isActingCandidate(person: PersonMetadata): boolean {
  return person.occupations.some((occupation) => ACTING_OCCUPATIONS.has(occupation));
}

export function isDirectingCandidate(person: PersonMetadata): boolean {
  return person.occupations.some((occupation) => DIRECTING_OCCUPATIONS.has(occupation))
    || person.roles.includes('director');
}

export function isComposingCandidate(person: PersonMetadata): boolean {
  return person.occupations.some((occupation) => COMPOSING_OCCUPATIONS.has(occupation))
    || person.roles.includes('composer');
}

export function isEligible(person: PersonMetadata): boolean {
  if (person.imageFiles.length === 0) return false;
  if (!person.gender) return false;
  if (person.filmCount < MIN_TELUGU_FILMS) return false;
  if (!person.hasTeluguWiki && person.filmCount < MIN_FILMS_WITHOUT_TELUGU_WIKI) return false;
  return isActingCandidate(person) || isDirectingCandidate(person) || isComposingCandidate(person);
}

/**
 * Higher is more recognisable. Telugu filmography dominates; global fame is capped
 * so one very famous outsider cannot outrank an industry regular.
 */
export function rankScore(person: PersonMetadata): number {
  const relevance = person.hasTeluguWiki ? 1 : 0.6;
  const filmography = Math.sqrt(person.filmCount) * 12;
  const fame = Math.min(person.wikipediaCount, 45) * 2.2;
  return Math.round((filmography + fame) * relevance * 10) / 10;
}

/**
 * Comedians and character artists count as actors here rather than as a separate
 * unplayable category: some of the most instantly recognisable faces in Telugu cinema
 * are comedians, and excluding them would make the game poorer. `Category` keeps
 * 'character' for a future mode that wants to single them out.
 */
export function categoryOf(person: PersonMetadata): Category {
  if (isActingCandidate(person)) return person.gender === 'female' ? 'actress' : 'actor';
  // Composing is checked before directing: several music directors also hold a stray
  // directing credit, and the music is what they are known for.
  if (isComposingCandidate(person)) return 'composer';
  return 'director';
}

/**
 * Difficulty is a percentile of the rank score within the acting pool, so it stays
 * meaningful as the dataset grows. Daily selection then mixes 60/30/10.
 */
export function difficultyFor(score: number, sortedScores: readonly number[]): Difficulty {
  const rank = sortedScores.findIndex((value) => value <= score);
  const percentile = rank < 0 ? 1 : rank / sortedScores.length;
  return bandFor(percentile);
}

/**
 * Bands are wide on purpose. Daily selection asks for an easy star 60% of the time,
 * so a narrow easy tier would either repeat the same dozen faces or keep falling
 * through to the "anyone" tier.
 */
export function bandFor(percentile: number): Difficulty {
  if (percentile <= 0.35) return 'easy';
  if (percentile <= 0.7) return 'medium';
  return 'hard';
}

export function rankedCandidates(people: readonly PersonMetadata[]): PersonMetadata[] {
  return people.filter(isEligible).sort((a, b) => rankScore(b) - rankScore(a));
}
