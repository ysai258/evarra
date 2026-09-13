/** Prints a summary of the generated dataset (PRD §47). */
import type { Celebrity } from '../../src/engine/types.ts';
import type { ImageRecord } from './fetch-images.ts';
import { DATA_DIR, RAW, readJson } from './lib.ts';
import type { ValidationResult } from './validate-images.ts';

function tally<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
}

function print(title: string, counts: Map<string, number>): void {
  console.log(`\n${title}:`);
  for (const [label, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label.padEnd(24)} ${count}`);
  }
}

function main(): void {
  const celebrities = readJson<Celebrity[]>(`${DATA_DIR}/celebrities.json`);
  const validation = readJson<ValidationResult[]>(`${RAW}/validation.json`);
  const images = readJson<ImageRecord[]>(`${RAW}/images.json`);

  console.log(`\nCelebrities: ${celebrities.length}`);
  console.log(`Playable:    ${celebrities.filter((c) => c.playable).length}`);

  print('Categories', tally(celebrities, (c) => c.category));
  print('Difficulty', tally(celebrities.filter((c) => c.playable), (c) => c.difficulty));
  print('Images', tally(validation, (v) => v.verdict));
  print('Sources', tally(images, (i) => i.sourceName));
  print('Licences', tally(
    images.filter((i) => i.downloaded),
    (i) => i.license ?? 'unrecorded',
  ));

  const hintCounts = celebrities.map((c) => Object.values(c.hints).filter(Boolean).length);
  const withThree = hintCounts.filter((count) => count >= 3).length;
  console.log(`\nHints: ${withThree}/${celebrities.length} have 3 or more`);

  const telugu = celebrities.filter((c) => c.nameTelugu).length;
  console.log(`Telugu names: ${telugu}/${celebrities.length}`);
}

main();
