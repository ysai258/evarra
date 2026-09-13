/**
 * The progressive reveal ladder.
 *
 * The blur is baked into the image bytes rather than painted by CSS. A CSS filter is
 * only paint: the file behind it stays sharp, so anyone opening the network panel —
 * or right-clicking the picture — gets a clearer view than the game is offering. With
 * the blur applied at build time, what the server sends *is* what the player sees.
 *
 * `blur` is therefore a build-time instruction as much as a style: the asset pipeline
 * blurs each stage by this many pixels relative to REFERENCE_WIDTH, and the app only
 * falls back to painting it if an asset is missing.
 */
export type RevealStage = {
  /** Gaussian sigma in px, at REFERENCE_WIDTH. Baked into the asset. */
  blur: number;
  /** Extra desaturation makes the hardest stages read as "silhouette", not "colour blob". */
  saturation: number;
  /** Marketing-friendly "how blurred was it" number shown on the result screen. */
  blurPercent: number;
  label: string;
};

export const REVEAL_STAGES: readonly RevealStage[] = [
  { blur: 25, saturation: 0.55, blurPercent: 92, label: 'Almost impossible' },
  { blur: 18, saturation: 0.7, blurPercent: 75, label: 'Shapes only' },
  { blur: 11, saturation: 0.85, blurPercent: 55, label: 'Getting there' },
  { blur: 5, saturation: 1, blurPercent: 30, label: 'Nearly clear' },
  { blur: 0, saturation: 1, blurPercent: 0, label: 'Fully revealed' },
];

export const MAX_ATTEMPTS = REVEAL_STAGES.length;

/**
 * The display width the blur amounts are tuned for. The photo renders between about
 * 358px (a narrow phone) and 500px (desktop), so a single baked blur is a touch soft
 * at one end and a touch crisp at the other — far below anything a player notices.
 */
export const REFERENCE_WIDTH = 440;

export function stageAt(index: number): RevealStage {
  const clamped = Math.min(Math.max(index, 0), REVEAL_STAGES.length - 1);
  // Index is clamped into range, so this element always exists.
  return REVEAL_STAGES[clamped]!;
}
