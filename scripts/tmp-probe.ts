import { readJson } from './dataset/lib.ts';
import { entityIds, fetchEntities } from './dataset/wikidata.ts';
import type { Celebrity } from '../src/engine/types.ts';
import type { PersonMetadata } from './dataset/fetch-metadata.ts';

const RELATIONS = { P22: 'father', P25: 'mother', P26: 'spouse', P3373: 'sibling', P40: 'child' };

async function main() {
  const ds = readJson<Celebrity[]>('src/data/celebrities.json').filter((c) => c.playable);
  const everyone = new Set(readJson<PersonMetadata[]>('data/raw/people.json').map((p) => p.qid));
  const sample = ds.slice(0, 120).map((c) => c.wikidataId);
  const entities = await fetchEntities(sample, 'claims');

  let anyRelation = 0;
  let inIndustry = 0;
  let awards = 0;
  const examples: string[] = [];
  for (const c of ds.slice(0, 120)) {
    const e = entities.get(c.wikidataId);
    if (!e) continue;
    const rels = Object.entries(RELATIONS).flatMap(([prop, label]) =>
      entityIds(e, prop).map((qid) => ({ label, qid })));
    if (rels.length > 0) anyRelation += 1;
    const filmy = rels.filter((r) => everyone.has(r.qid));
    if (filmy.length > 0) {
      inIndustry += 1;
      if (examples.length < 8) examples.push(`${c.name} -> ${filmy.map((r) => r.label).join(', ')}`);
    }
    if (entityIds(e, 'P166').length > 0) awards += 1;
  }
  console.log(`sample of 120 playable stars:`);
  console.log(`  with any family relation recorded: ${anyRelation}`);
  console.log(`  with a relative who is also in our Telugu cinema set: ${inIndustry}`);
  console.log(`  with an award recorded: ${awards}`);
  for (const e of examples) console.log(`    ${e}`);

  const works = ds.map((c) => (c.notableWorks ?? []).length);
  console.log(`\nnotableWorks in shipped data: ${works.filter((n) => n > 0).length}/${ds.length}`);
}
main();
