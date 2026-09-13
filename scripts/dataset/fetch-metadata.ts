/**
 * Stage 2 — Fetch structured biographical metadata for every discovered person.
 *
 * Everything written here comes from a Wikidata statement. Nothing is inferred,
 * paraphrased or generated: a missing birthplace stays missing (PRD §51).
 */
import type { Discovered, FilmFacts } from './discover-celebrities.ts';
import { RAW, ensureDirs, progress, requireStage, writeJson, runStage } from './lib.ts';
import {
  aliasList,
  entityId,
  entityIds,
  fetchEntities,
  label,
  stringValues,
  hasWikipedia,
  wikipediaCount,
  wikipediaUrl,
  yearValue,
} from './wikidata.ts';

const GENDER_MALE = 'Q6581097';
const GENDER_FEMALE = 'Q6581072';
/** Occupations that make someone a plausible "face" puzzle. */
const OCCUPATION_LABELS: Record<string, string> = {
  Q33999: 'actor',
  Q10800557: 'film actor',
  Q10798782: 'television actor',
  Q2405480: 'voice actor',
  Q2526255: 'film director',
  Q3282637: 'film producer',
  Q28389: 'screenwriter',
  Q177220: 'singer',
  Q245068: 'comedian',
  Q36180: 'writer',
  Q639669: 'musician',
  Q82955: 'politician',
  Q11569986: 'playback singer',
  Q36834: 'composer',
  Q1259917: 'film score composer',
  Q806349: 'music director',
  Q5716684: 'dancer',
  Q3455803: 'director',
};

export type PersonMetadata = {
  qid: string;
  name: string;
  nameTelugu?: string;
  description?: string;
  aliases: string[];
  gender?: 'male' | 'female';
  occupations: string[];
  occupationIds: string[];
  birthYear?: number;
  birthPlace?: string;
  deathYear?: number;
  workPeriodStart?: number;
  imageFiles: string[];
  commonsCategory?: string;
  wikipediaCount: number;
  hasTeluguWiki: boolean;
  wikipediaUrl?: string;
  roles: string[];
  filmCount: number;
  firstFilmYear?: number;
  lastFilmYear?: number;
  notableWorks: string[];
  /** The player-facing raw material for clues, all from Wikidata statements. */
  debutFilm?: { title: string; year?: number };
  signatureFilm?: { title: string; year?: number };
  topDirector?: string;
  /** True when a parent, sibling, spouse or child is also in Telugu cinema. */
  filmFamily?: 'parent' | 'sibling' | 'spouse' | 'child';
  fetchedAt: string;
};

const FAMILY_PROPERTIES: ReadonlyArray<readonly [string, 'parent' | 'sibling' | 'spouse' | 'child']> = [
  ['P22', 'parent'], ['P25', 'parent'], ['P3373', 'sibling'], ['P26', 'spouse'], ['P40', 'child'],
];

async function main(): Promise<void> {
  ensureDirs();
  const discovered = requireStage<Discovered[]>(`${RAW}/discovered.json`, 'dataset:discover');
  const films = new Map(
    requireStage<FilmFacts[]>(`${RAW}/films.json`, 'dataset:discover').map((f) => [f.qid, f]),
  );

  console.log(`  fetching metadata for ${discovered.length} people…`);
  const entities = await fetchEntities(
    discovered.map((person) => person.qid),
    'labels|descriptions|aliases|claims|sitelinks',
    (done, total) => progress('entities', done, total),
  );

  // Second pass: resolve the place-of-birth Q-ids we collected into readable names.
  const placeIds = new Set<string>();
  for (const entity of entities.values()) {
    const place = entityId(entity, 'P19');
    if (place) placeIds.add(place);
  }
  console.log(`  resolving ${placeIds.size} birthplaces…`);
  const places = await fetchEntities([...placeIds], 'labels', (done, total) =>
    progress('places', done, total));

  const fetchedAt = new Date().toISOString();
  const people: PersonMetadata[] = [];
  // Telugu cinema is dynastic, and "they are from a film family" is a clue a fan can
  // actually use. A relative only counts if they are in this dataset too — otherwise
  // we would be asserting something about a person we know nothing about.
  const inTeluguCinema = new Set(discovered.map((person) => person.qid));

  for (const person of discovered) {
    const entity = entities.get(person.qid);
    const name = entity ? label(entity) : undefined;
    if (!entity || !name) continue;

    const genderId = entityId(entity, 'P21');
    const occupationIds = entityIds(entity, 'P106');
    const personFilms = person.filmIds
      .map((id) => films.get(id))
      .filter((film): film is FilmFacts => film !== undefined);

    const dated = personFilms.filter((film) => film.year !== undefined);
    const debut = dated.length > 0
      ? dated.reduce((earliest, film) => (film.year! < earliest.year! ? film : earliest))
      : undefined;
    const signature = personFilms.length > 0
      ? personFilms.reduce((best, film) => (film.sitelinks > best.sitelinks ? film : best))
      : undefined;

    /*
     * The director a fan would associate with them. Repeat collaborations count for
     * more than raw fame: Rajamouli directed Prabhas twice, and "has worked with
     * Rajamouli" is the association people hold — picking purely by the director's own
     * renown would surface whoever happened to be most famous on a single credit.
     */
    const collaborations = new Map<string, { name: string; films: number; sitelinks: number }>();
    for (const film of personFilms) {
      for (const d of film.directors ?? []) {
        if (d.qid === person.qid) continue;
        const seen = collaborations.get(d.qid);
        collaborations.set(d.qid, {
          name: d.name,
          films: (seen?.films ?? 0) + 1,
          sitelinks: Math.max(seen?.sitelinks ?? 0, d.sitelinks),
        });
      }
    }
    const director = [...collaborations.values()]
      .map((d) => ({ ...d, score: d.films * 3 + Math.min(d.sitelinks, 60) / 10 }))
      .sort((a, b) => b.score - a.score)[0];

    const relation = FAMILY_PROPERTIES
      .find(([property]) => entityIds(entity, property).some((qid) => inTeluguCinema.has(qid)))?.[1];

    const notableWorks = person.filmIds
      .map((id) => films.get(id))
      .filter((film): film is FilmFacts => film !== undefined)
      .sort((a, b) => b.sitelinks - a.sitelinks || (b.year ?? 0) - (a.year ?? 0))
      .slice(0, 6)
      .map((film) => (film.year ? `${film.title} (${film.year})` : film.title));

    people.push({
      qid: person.qid,
      name,
      ...(label(entity, 'te') ? { nameTelugu: label(entity, 'te') } : {}),
      ...(entity.descriptions?.en ? { description: entity.descriptions.en.value } : {}),
      aliases: [...new Set([...aliasList(entity, 'en'), ...aliasList(entity, 'te')])],
      ...(genderId === GENDER_MALE
        ? { gender: 'male' as const }
        : genderId === GENDER_FEMALE
          ? { gender: 'female' as const }
          : {}),
      occupations: occupationIds.flatMap((id) => OCCUPATION_LABELS[id] ?? []),
      occupationIds,
      ...(yearValue(entity, 'P569') ? { birthYear: yearValue(entity, 'P569') } : {}),
      ...(yearValue(entity, 'P570') ? { deathYear: yearValue(entity, 'P570') } : {}),
      ...(yearValue(entity, 'P2031') ? { workPeriodStart: yearValue(entity, 'P2031') } : {}),
      ...(() => {
        const placeId = entityId(entity, 'P19');
        const placeName = placeId ? label(places.get(placeId)) : undefined;
        return placeName ? { birthPlace: placeName } : {};
      })(),
      imageFiles: stringValues(entity, 'P18'),
      ...(() => {
        // P373 is the curated Commons category; the commonswiki sitelink is the fallback.
        const category = stringValues(entity, 'P373')[0]
          ?? entity.sitelinks?.commonswiki?.title.replace(/^Category:/, '');
        return category ? { commonsCategory: category } : {};
      })(),
      wikipediaCount: wikipediaCount(entity),
      hasTeluguWiki: hasWikipedia(entity, 'te'),
      ...(wikipediaUrl(entity) ? { wikipediaUrl: wikipediaUrl(entity) } : {}),
      roles: person.roles,
      filmCount: person.filmCount,
      ...(person.firstFilmYear ? { firstFilmYear: person.firstFilmYear } : {}),
      ...(person.lastFilmYear ? { lastFilmYear: person.lastFilmYear } : {}),
      notableWorks,
      ...(debut ? { debutFilm: { title: debut.title, ...(debut.year ? { year: debut.year } : {}) } } : {}),
      ...(signature
        ? { signatureFilm: { title: signature.title, ...(signature.year ? { year: signature.year } : {}) } }
        : {}),
      ...(director && director.sitelinks >= 4 ? { topDirector: director.name } : {}),
      ...(relation ? { filmFamily: relation } : {}),
      fetchedAt,
    });
  }

  writeJson(`${RAW}/people.json`, people);
  const withGender = people.filter((p) => p.gender).length;
  console.log(`✓ metadata for ${people.length} people (${withGender} with gender) -> data/raw/people.json`);
}

runStage(import.meta.url, main, 'metadata fetch');
