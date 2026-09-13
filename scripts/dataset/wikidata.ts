/** Minimal typings + accessors for the slice of the Wikidata entity API we use. */
import { chunk, getJson } from './lib.ts';

type Snak = {
  mainsnak?: {
    snaktype?: string;
    datavalue?: { value: unknown; type: string };
  };
  rank?: 'preferred' | 'normal' | 'deprecated';
  qualifiers?: Record<string, Array<{ datavalue?: { value: unknown } }>>;
};

export type Entity = {
  id: string;
  labels?: Record<string, { language: string; value: string }>;
  descriptions?: Record<string, { language: string; value: string }>;
  aliases?: Record<string, Array<{ language: string; value: string }>>;
  claims?: Record<string, Snak[]>;
  sitelinks?: Record<string, { site: string; title: string }>;
};

const API = 'https://www.wikidata.org/w/api.php';

export async function fetchEntities(
  ids: readonly string[],
  props = 'labels|descriptions|aliases|claims|sitelinks',
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Entity>> {
  const out = new Map<string, Entity>();
  const batches = chunk(ids, 50);
  let done = 0;
  for (const batch of batches) {
    const url = `${API}?action=wbgetentities&format=json&props=${props}&ids=${batch.join('|')}`;
    const body = await getJson<{ entities?: Record<string, Entity> }>(url);
    for (const [id, entity] of Object.entries(body.entities ?? {})) {
      if (entity.id) out.set(id, entity);
    }
    done += batch.length;
    onProgress?.(Math.min(done, ids.length), ids.length);
  }
  return out;
}

/** Statements sorted so `preferred` rank wins and `deprecated` is dropped. */
function ranked(entity: Entity, property: string): Snak[] {
  const claims = entity.claims?.[property] ?? [];
  return claims
    .filter((claim) => claim.rank !== 'deprecated' && claim.mainsnak?.snaktype === 'value')
    .sort((a, b) => (a.rank === 'preferred' ? -1 : 0) - (b.rank === 'preferred' ? -1 : 0));
}

export function entityIds(entity: Entity, property: string): string[] {
  return ranked(entity, property).flatMap((claim) => {
    const value = claim.mainsnak?.datavalue?.value as { id?: string } | undefined;
    return value?.id ? [value.id] : [];
  });
}

export function entityId(entity: Entity, property: string): string | undefined {
  return entityIds(entity, property)[0];
}

export function stringValues(entity: Entity, property: string): string[] {
  return ranked(entity, property).flatMap((claim) => {
    const value = claim.mainsnak?.datavalue?.value;
    return typeof value === 'string' ? [value] : [];
  });
}

/** Wikidata times look like "+1975-08-09T00:00:00Z"; BCE and unknown years are rejected. */
export function yearValue(entity: Entity, property: string): number | undefined {
  for (const claim of ranked(entity, property)) {
    const value = claim.mainsnak?.datavalue?.value as { time?: string } | undefined;
    const match = value?.time?.match(/^\+(\d{4})-/);
    if (match) {
      const year = Number(match[1]);
      if (year > 1850 && year <= new Date().getFullYear()) return year;
    }
  }
  return undefined;
}

export function label(entity: Entity | undefined, language = 'en'): string | undefined {
  return entity?.labels?.[language]?.value;
}

export function aliasList(entity: Entity, language = 'en'): string[] {
  return (entity.aliases?.[language] ?? []).map((alias) => alias.value);
}

/** Wikipedia editions only — a decent, cheap proxy for how well known someone is. */
export function wikipediaCount(entity: Entity): number {
  return Object.keys(entity.sitelinks ?? {}).filter((site) => site.endsWith('wiki')).length;
}

/**
 * A Telugu Wikipedia article is the strongest cheap signal that someone belongs to
 * Telugu cinema rather than being a pan-Indian guest star with one Telugu credit.
 */
export function hasWikipedia(entity: Entity, language: string): boolean {
  return entity.sitelinks?.[`${language}wiki`] !== undefined;
}

export function wikipediaUrl(entity: Entity, language = 'en'): string | undefined {
  const link = entity.sitelinks?.[`${language}wiki`];
  return link ? `https://${language}.wikipedia.org/wiki/${encodeURIComponent(link.title.replace(/ /g, '_'))}` : undefined;
}
