import { MAX_ATTEMPTS, REVEAL_STAGES } from '../engine/reveal.ts';

/**
 * Which blur stage the room is looking at, from the clock alone.
 *
 * In the daily game the photo clears because *you* guessed wrong — your mistakes buy
 * your clarity. That cannot work in a room: if one player's guess sharpened the
 * picture, everyone else would inherit an advantage they did not earn, and a player
 * who guessed early would hand the room a free clue.
 *
 * So multiplayer drives the ladder off elapsed time instead. Everyone sees the same
 * face at the same moment, and the only thing a guess changes is that player's score.
 * The question becomes "do I risk it now, blurred, for the points — or wait for the
 * picture and lose the time bonus?", which is the whole game (spec §59–61).
 *
 * The ladder is spread evenly across the question: with five stages that is a step
 * every 25% of the clock, and the last one — the clear photograph — lands exactly on
 * the buzzer, which is why nobody ever sees it while they can still answer.
 */
export function stageForElapsed(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return MAX_ATTEMPTS - 1;
  const ratio = elapsedMs / durationMs;
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  const steps = REVEAL_STAGES.length - 1;
  return Math.min(steps, Math.max(0, Math.floor(ratio * steps)));
}

/** When the next step lands, as a server timestamp — lets the client schedule a repaint. */
export function nextStageAt(
  startedAt: number,
  durationMs: number,
  stageIndex: number,
): number | undefined {
  const steps = REVEAL_STAGES.length - 1;
  if (stageIndex >= steps) return undefined;
  return startedAt + ((stageIndex + 1) / steps) * durationMs;
}
