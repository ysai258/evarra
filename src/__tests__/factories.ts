import type { Celebrity } from '../engine/types.ts';

let counter = 0;

export function makeCelebrity(overrides: Partial<Celebrity> = {}): Celebrity {
  counter += 1;
  const name = overrides.name ?? `Star ${counter}`;
  return {
    id: overrides.id ?? `star-${counter}`,
    wikidataId: `Q${counter}`,
    name,
    aliases: [],
    gender: 'male',
    category: 'actor',
    difficulty: 'easy',
    profession: ['actor'],
    popularity: 5,
    playable: true,
    hints: { era: 'A Telugu actor working from the 2000s through to 2024.' },
    images: [
      {
        localPath: `/celebrities/${overrides.id ?? `star-${counter}`}.webp`,
        previews: [1, 2, 3, 4].map(
          (stage) => `/celebrities/${overrides.id ?? `star-${counter}`}-s${stage}.webp`,
        ),
        originalUrl: 'https://upload.wikimedia.org/example.jpg',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
        sourceName: 'Wikimedia Commons',
        license: 'CC BY-SA 4.0',
        width: 800,
        height: 1000,
      },
    ],
    source: {
      url: `https://www.wikidata.org/wiki/Q${counter}`,
      provider: 'wikidata',
      fetchedAt: '2026-09-12T00:00:00.000Z',
    },
    ...overrides,
  };
}

export function makeRoster(size: number): Celebrity[] {
  const difficulties = ['easy', 'medium', 'hard'] as const;
  return Array.from({ length: size }, (_, i) =>
    makeCelebrity({
      id: `celeb-${`${i}`.padStart(3, '0')}`,
      name: `Celebrity ${i}`,
      difficulty: difficulties[i % 3]!,
    }),
  );
}
