/**
 * Stage 7 — Pin the launch date, and report what the schedule will look like.
 *
 * The schedule itself is deliberately *not* written anywhere. This repository is
 * public, and a committed date -> celebrity file would let anyone read off future
 * answers without even running the game. The browser replays the same deterministic
 * sequence from the roster, the launch date and the repeat gap, none of which reveals
 * an answer on its own.
 *
 * The preview below is printed, never saved, so a maintainer can sanity-check the
 * rotation without leaving it on disk.
 */
import type { Celebrity } from '../../src/engine/types.ts';
import { DEFAULT_REPEAT_GAP_DAYS, generateSchedule } from '../../src/engine/puzzle.ts';
import { existsSync } from 'node:fs';
import { DATA_DIR, ensureDirs, readJson, requireStage, runStage, writeJson } from './lib.ts';

/** Long enough that a deployed build never runs dry, short enough to stay small. */
const DAYS = 540;

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, '0'),
    `${date.getDate()}`.padStart(2, '0'),
  ].join('-');
}

/**
 * The game's first puzzle day, and the floor of the archive.
 *
 * Pinned rather than derived from "now": regenerating the schedule six months after
 * launch must not move the start date forward and strand every day already played.
 * The existing schedule's first date wins; LAUNCH_DATE overrides it; a first-ever run
 * starts today, so on launch day the only playable star is today's.
 */
function resolveLaunchDate(): string {
  const override = process.env.LAUNCH_DATE;
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) {
      throw new Error(`LAUNCH_DATE must be YYYY-MM-DD, got "${override}"`);
    }
    return override;
  }

  const existing = `${DATA_DIR}/launch.json`;
  if (existsSync(existing)) {
    const saved = readJson<{ date?: string }>(existing).date;
    if (saved) return saved;
  }

  return dateKey(new Date());
}

async function main(): Promise<void> {
  ensureDirs();
  const celebrities = requireStage<Celebrity[]>(`${DATA_DIR}/celebrities.json`, 'dataset:build');
  const playable = celebrities.filter((celebrity) => celebrity.playable);
  if (playable.length === 0) throw new Error('No playable celebrities in the dataset.');

  const launch = resolveLaunchDate();
  const repeatGapDays = Math.min(DEFAULT_REPEAT_GAP_DAYS, Math.max(1, playable.length - 1));
  const schedule = generateSchedule(celebrities, launch, DAYS, { repeatGapDays });

  writeJson(`${DATA_DIR}/launch.json`, { date: launch });

  const unique = new Set(schedule.map((puzzle) => puzzle.celebrityId)).size;
  console.log(
    `✓ scheduled ${schedule.length} days from launch ${launch} → ${schedule.at(-1)!.date}, `
    + `${unique} distinct stars, ${repeatGapDays}-day repeat gap`,
  );
  console.log(`  the archive opens on ${launch}; set LAUNCH_DATE to move it`);
  console.log('  the schedule is replayed in the browser and never written to disk');
}

runStage(import.meta.url, main, 'puzzle generation');
