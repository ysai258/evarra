/** Shared domain types. Generated dataset files are validated against these. */

export type Gender = 'male' | 'female';

/** Categories the architecture supports. Only actor/actress are playable in the MVP. */
export type Category = 'actor' | 'actress' | 'director' | 'composer' | 'character';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Future modes live here so the engine never has to be restructured to add them. */
export type GameMode =
  | 'ACTOR'
  | 'ACTRESS'
  | 'MIXED'
  | 'DIRECTOR'
  | 'CHARACTER'
  | 'THEN_AND_NOW'
  | 'EYES_ONLY'
  | 'HAIR_ONLY'
  | 'MOVIE_STILL';

export type CelebrityImage = {
  /**
   * The full-resolution reveal. Requested only once the game is over — see `previews`
   * for why.
   */
  localPath: string;
  /**
   * One image per blurred stage, each downscaled below what that stage's blur radius
   * would preserve. A CSS filter is paint, not redaction: with a single clear file
   * behind the blur, "open image in new tab" hands the player the answer. Serving
   * resolution-limited previews means the browser never holds detail the player has
   * not earned.
   */
  previews: string[];
  /**
   * Original file on the source platform. Kept in the full provenance record
   * (`data/dataset.json`) but stripped from the bundle — `sourceUrl` is what
   * attribution links to.
   */
  originalUrl?: string;
  /** Human-visitable page describing the file (required for attribution). */
  sourceUrl: string;
  sourceName: string;
  license?: string;
  licenseUrl?: string;
  attribution?: string;
  width: number;
  height: number;
  /** Year the photo was taken, when the source records it. Enables THEN_AND_NOW. */
  year?: number;
};

/**
 * Clues, vaguest first. Each is assembled from Wikidata statements at build time —
 * never generated at runtime — and each is meant to be something a filmgoer actually
 * carries around: who they worked with, what they were in, which generation they
 * belong to. A credit count or a database statistic is not a clue.
 */
export type CelebrityHints = {
  /** Which generation of Telugu cinema they belong to. */
  era: string;
  /** A film family, or where they were born. */
  origin?: string;
  /** A director they are associated with. */
  director?: string;
  /** A film they were in. */
  film?: string;
  /** The film they are best known for — the last clue, and close to the answer. */
  signature?: string;
};

export type Celebrity = {
  id: string;
  wikidataId: string;
  name: string;
  /** Native-script name, shown only after the answer is revealed. */
  nameTelugu?: string;
  aliases: string[];
  gender: Gender;
  category: Category;
  difficulty: Difficulty;
  birthYear?: number;
  birthPlace?: string;
  debutYear?: number;
  notableWorks?: string[];
  profession: string[];
  /** Ranking signal kept in the dataset so puzzle selection can be tuned later. */
  popularity: number;
  playable: boolean;
  hints: CelebrityHints;
  /** images[0] is the image the MVP plays with; more enable THEN_AND_NOW. */
  images: CelebrityImage[];
  source: {
    url: string;
    provider: string;
    fetchedAt: string;
  };
};

export type DailyPuzzle = {
  date: string;
  celebrityId: string;
  mode: GameMode;
  createdAt: string;
};

export type GameState = {
  date: string;
  celebrityId: string;
  /** 0-based index into REVEAL_STAGES: the stage currently on screen. */
  currentStage: number;
  guesses: string[];
  hintsUsed: number[];
  score?: number;
  completed: boolean;
  won: boolean;
};

export type Stats = {
  gamesPlayed: number;
  gamesWon: number;
  currentStreak: number;
  maxStreak: number;
  totalScore: number;
  averageScore: number;
  /** Attempt number (1-5) on which the player won -> count. */
  distribution: Record<number, number>;
  lastPlayedDate?: string;
};
