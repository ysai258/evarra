/**
 * Stage 1 — Discover Telugu cinema personalities from Wikidata.
 *
 * Definition used: a human credited as cast member (P161) or director (P57) on at
 * least one film whose original language (P364) is Telugu (Q8097). That keeps the
 * dataset genuinely "Telugu cinema" rather than "any Indian celebrity".
 *
 * Three small queries instead of one aggregate: the public query service times out
 * (HTTP 504) on a GROUP BY across the whole Telugu filmography, but happily streams
 * the raw credit pairs. Counting happens here, where it is free.
 *
 * Requiring an image (P18) is deliberate — a person with no freely licensed portrait
 * can never become a puzzle, and the filter keeps the credit query inside budget.
 */
import { RAW, ensureDirs, qid, sparql, writeJson, runStage } from './lib.ts';

type Row = Record<string, { value: string } | undefined>;

export type FilmFacts = {
  qid: string;
  title: string;
  year?: number;
  sitelinks: number;
  /** Directors, most widely known first — the raw material for a memorable clue. */
  directors?: Array<{ qid: string; name: string; sitelinks: number }>;
};

export type Discovered = {
  qid: string;
  roles: string[];
  filmCount: number;
  filmIds: string[];
  firstFilmYear?: number;
  lastFilmYear?: number;
};

const TELUGU_FILM = `?film wdt:P31/wdt:P279* wd:Q11424 ; wdt:P364 wd:Q8097 .`;

const creditsQuery = (property: 'P161' | 'P57' | 'P86') => `
SELECT ?person ?film WHERE {
  ${TELUGU_FILM}
  ?film wdt:${property} ?person .
  ?person wdt:P18 ?image .
}`;

const filmsQuery = `
SELECT ?film ?filmLabel ?year ?sitelinks WHERE {
  ${TELUGU_FILM}
  ?film wikibase:sitelinks ?sitelinks .
  OPTIONAL { ?film wdt:P577 ?released . BIND(YEAR(?released) AS ?year) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

/**
 * Who directed what. "Has worked with S. S. Rajamouli" is the kind of thing a fan
 * actually carries around; "has 12 credits in Wikidata" is not. Director fame is
 * carried along so the clue can pick the name the player is most likely to know.
 */
const directorsQuery = `
SELECT ?film ?director ?directorLabel ?dirSitelinks WHERE {
  ${TELUGU_FILM}
  ?film wdt:P57 ?director .
  ?director wikibase:sitelinks ?dirSitelinks .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

function num(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main(): Promise<void> {
  ensureDirs();

  process.stdout.write('  querying Telugu filmography… ');
  const filmRows = await sparql<Row>(filmsQuery);
  const films = new Map<string, FilmFacts>();
  for (const row of filmRows) {
    const uri = row.film?.value;
    if (!uri) continue;
    const id = qid(uri);
    const title = row.filmLabel?.value;
    // The label service falls back to the Q-id when no English label exists.
    if (!title || /^Q\d+$/.test(title)) continue;
    const year = num(row.year?.value);
    const existing = films.get(id);
    if (existing) {
      // A film can carry several release dates — festival runs, other countries, a
      // re-release. The earliest is the one audiences date the film by.
      if (year !== undefined && (existing.year === undefined || year < existing.year)) {
        existing.year = year;
      }
      continue;
    }
    films.set(id, {
      qid: id,
      title,
      ...(year !== undefined ? { year } : {}),
      sitelinks: num(row.sitelinks?.value) ?? 0,
    });
  }
  console.log(`${films.size} films`);

  process.stdout.write('  querying directors… ');
  const directorRows = await sparql<Row>(directorsQuery);
  let directorLinks = 0;
  for (const row of directorRows) {
    const film = films.get(qid(row.film?.value ?? ''));
    const name = row.directorLabel?.value;
    const directorQid = row.director?.value ? qid(row.director.value) : undefined;
    if (!film || !name || !directorQid || /^Q\d+$/.test(name)) continue;
    film.directors = [
      ...(film.directors ?? []),
      { qid: directorQid, name, sitelinks: num(row.dirSitelinks?.value) ?? 0 },
    ];
    directorLinks += 1;
  }
  for (const film of films.values()) {
    film.directors?.sort((a, b) => b.sitelinks - a.sitelinks);
  }
  console.log(`${directorLinks} credits`);

  const byQid = new Map<string, Discovered>();
  // P86 is "composer": Telugu music directors are stars in their own right, and the
  // audience knows their faces as well as any lead's.
  for (const [role, property] of [
    ['cast', 'P161'], ['director', 'P57'], ['composer', 'P86'],
  ] as const) {
    process.stdout.write(`  querying ${role} credits… `);
    const rows = await sparql<Row>(creditsQuery(property));
    for (const row of rows) {
      const personUri = row.person?.value;
      const filmUri = row.film?.value;
      if (!personUri || !filmUri) continue;
      const id = qid(personUri);
      const entry = byQid.get(id) ?? { qid: id, roles: [], filmCount: 0, filmIds: [] };
      if (!entry.roles.includes(role)) entry.roles.push(role);
      const filmId = qid(filmUri);
      if (!entry.filmIds.includes(filmId)) {
        entry.filmIds.push(filmId);
        entry.filmCount += 1;
      }
      byQid.set(id, entry);
    }
    console.log(`${rows.length} credits`);
  }

  for (const person of byQid.values()) {
    const years = person.filmIds
      .map((id) => films.get(id)?.year)
      .filter((year): year is number => year !== undefined);
    if (years.length > 0) {
      person.firstFilmYear = Math.min(...years);
      person.lastFilmYear = Math.max(...years);
    }
  }

  const discovered = [...byQid.values()].sort((a, b) => b.filmCount - a.filmCount);
  writeJson(`${RAW}/films.json`, [...films.values()]);
  writeJson(`${RAW}/discovered.json`, discovered);
  console.log(`✓ discovered ${discovered.length} people -> data/raw/discovered.json`);
}

runStage(import.meta.url, main, 'discovery');
