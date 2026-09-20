import { REVEAL_STAGES } from '../engine/reveal.ts';

/**
 * The photograph clearing, continuously, on the clock.
 *
 * In the daily game the photo clears because *you* guessed wrong — your mistakes buy
 * your clarity. That cannot work in a room: if one player's guess sharpened the
 * picture, everyone else would inherit an advantage they did not earn, and a player
 * who guessed early would hand the room a free clue. So multiplayer drives the reveal
 * off elapsed time instead, and everyone sees the same face at the same moment.
 *
 * The blur itself is still baked into the image bytes, and there are only five of
 * those per star — a CSS filter over a sharp file would put the answer one right-click
 * away, which is the thing this whole project is built to prevent. Five files cannot
 * make a per-second reveal on their own.
 *
 * What they can do is *dissolve*. The position below is continuous: at 1.5 the room is
 * looking at stage 1 painted half-opaque over stage 2, which reads as a picture midway
 * between them. Run that every frame and the photograph sharpens smoothly from the
 * first second to the buzzer, without any file existing that is sharper than what is
 * on screen.
 *
 * The cost, stated plainly: a dissolve means the browser is *holding* the stage it is
 * fading in, at whatever opacity. Someone in developer tools could force that layer to
 * full and see up to one stage ahead of the room. It is bounded, it needs devtools,
 * and it is the price of the reveal not being a slideshow — see the README.
 */

/** Stages a question may use. The last rung — the clear photo — belongs to the reveal. */
export const QUESTION_STAGES = REVEAL_STAGES.length - 1;

/** Transitions between them: 0→1, 1→2, 2→3. The position runs across these. */
export const DISSOLVE_COUNT = QUESTION_STAGES - 1;

/**
 * Where the reveal has got to, as a continuous position across the stage ladder.
 *
 * 0 is the opening frame at maximum blur and `DISSOLVE_COUNT` is the buzzer, so the
 * fractional part is exactly how far the current dissolve has run.
 */
export function revealPosition(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return DISSOLVE_COUNT;
  const progress = elapsedMs / durationMs;
  if (!Number.isFinite(progress) || progress <= 0) return 0;
  return Math.min(1, progress) * DISSOLVE_COUNT;
}

export type VisibleStages = {
  /** The settled picture underneath. */
  base: number;
  /** The one fading in over it — never more than one rung above `base`. */
  top: number;
  /** How far in it is, 0..1. */
  topOpacity: number;
};

/** What to paint, and in what mixture, at a given position. */
export function visibleStages(position: number): VisibleStages {
  const clamped = Math.min(Math.max(position, 0), DISSOLVE_COUNT);
  const base = Math.min(Math.floor(clamped), DISSOLVE_COUNT - 1);
  return { base, top: base + 1, topOpacity: clamped - base };
}

/**
 * The furthest rung a client may fetch right now.
 *
 * This is the anti-cheat line, and it is the *top* of the dissolve rather than the
 * settled stage: a client legitimately needs the layer it is fading in. It never
 * reaches the clear photograph, which is why a question cannot end with the answer
 * already in anyone's cache.
 */
export function maxFetchableStage(position: number): number {
  return visibleStages(position).top;
}

/**
 * How blurred the picture looks right now, as the percentage the badge shows.
 *
 * Interpolated between the two rungs being mixed, so the number falls every second
 * alongside the photograph instead of jumping four times a question.
 */
export function blurPercentAt(position: number): number {
  const { base, top, topOpacity } = visibleStages(position);
  const from = REVEAL_STAGES[base]!.blurPercent;
  const to = REVEAL_STAGES[top]!.blurPercent;
  return Math.round(from + (to - from) * topOpacity);
}

/** Desaturation likewise eases between rungs, so the colour does not step either. */
export function saturationAt(position: number): number {
  const { base, top, topOpacity } = visibleStages(position);
  const from = REVEAL_STAGES[base]!.saturation;
  const to = REVEAL_STAGES[top]!.saturation;
  return from + (to - from) * topOpacity;
}
