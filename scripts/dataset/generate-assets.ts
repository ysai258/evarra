/**
 * Stage 5 — Turn validated source photos into game-ready assets.
 *
 * Filenames are opaque on purpose. They used to carry the Wikidata Q-id of the
 * subject, which meant the network panel handed over the answer without any effort at
 * all — a Q-number pasted into a search engine returns the person's name and
 * photograph. A salted hash carries no meaning outside this repository.
 *
 * Each image becomes a 800×1000 (4:5) WebP plus one small preview per blurred stage.
 *
 * Why previews exist, when the PRD asks for CSS blur alone: a CSS filter is paint,
 * not redaction. With one clear file behind the blur, "open image in new tab" — or
 * the network panel, or a long-press on a phone — hands the player the answer.
 *
 * So each stage gets its own file with the blur already in the pixels. What the
 * server sends is exactly what the player sees; there is no sharper version of the
 * photo anywhere in the browser until the game ends. Each preview is also rendered at
 * a resolution matched to its own blur — blurred detail is not worth storing — which
 * keeps all four under 20 KB together, so a player who gets it at stage 1 downloads a
 * fraction of what a full photo would cost.
 *
 * Cropping matters more than it sounds: a 4:5 crop of a full-length red-carpet photo
 * leaves a face 40px tall, which makes the blurred stages meaningless. Where a face
 * was detected the crop is built around it; otherwise sharp's attention strategy
 * picks the most salient region.
 */
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { ImageRecord } from './fetch-images.ts';
import { ASSETS_DIR, IMAGES_DIR, RAW, ensureDirs, progress, requireStage, writeJson, runStage } from './lib.ts';
import { REFERENCE_WIDTH, stageAt } from '../../src/engine/reveal.ts';
import type { ValidationResult } from './validate-images.ts';

const OUTPUT_WIDTH = 800;
const OUTPUT_HEIGHT = 1000;
const ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;
const QUALITY = 80;
const PREVIEW_QUALITY = 78;
/**
 * Render width per blurred stage. Blur has already destroyed the fine detail, so
 * there is nothing to gain from storing these large. Each width is paired with the
 * stage's blur in `previewPlan` below, which scales the sigma to match: blur the
 * image at this width, upscale it to the display width, and the result is exactly the
 * blur the stage calls for.
 */
const PREVIEW_WIDTHS = [64, 128, 192, 320] as const;

/**
 * Salt for asset filenames. Not a secret — it lives here — but it means a filename
 * carries no meaning outside this codebase.
 */
const ASSET_SALT = 'evarra-assets:v1';
/** Face diameter as a share of the crop height — tuned so the head fills the frame. */
const FACE_SHARE = 0.36;
/** Push the crop down from the face centre so shoulders stay in shot. */
const CHIN_BIAS = 0.14;
/**
 * Never crop so tight that the 800×1000 output is mostly upscaled mush. Below this
 * the crop is widened instead, which zooms out a little rather than going soft.
 */
const MIN_CROP_WIDTH = 520;

/**
 * Sigma has to be scaled into the preview's own pixel space: blurring a 96px-wide
 * image by 25px would obliterate it, because those 96 pixels become 440 on screen.
 */
export function previewPlan(): Array<{ width: number; height: number; sigma: number }> {
  return PREVIEW_WIDTHS.map((width, stage) => ({
    width,
    height: Math.round(width / ASPECT),
    sigma: Math.max(0.3, (stageAt(stage).blur * width) / REFERENCE_WIDTH),
  }));
}

export type AssetRecord = {
  qid: string;
  localFile: string;
  /** The full-resolution reveal, served only when the game ends. */
  assetPath: string;
  /** One resolution-limited preview per blurred stage, in stage order. */
  previewPaths: string[];
  bytes: number;
  crop: 'face' | 'attention';
};

type Rect = { left: number; top: number; width: number; height: number };

/** Builds a 4:5 rectangle around a detected face, clamped inside the image. */
export function faceCrop(
  image: { width: number; height: number },
  face: { cx: number; cy: number; size: number },
): Rect {
  const shortEdge = Math.min(image.width, image.height);
  const faceDiameter = face.size * shortEdge;

  let width = Math.max((faceDiameter / FACE_SHARE) * ASPECT, MIN_CROP_WIDTH);
  let height = width / ASPECT;

  if (width > image.width) {
    width = image.width;
    height = width / ASPECT;
  }
  if (height > image.height) {
    height = image.height;
    width = height * ASPECT;
  }

  const centreX = face.cx * image.width;
  const centreY = face.cy * image.height + height * CHIN_BIAS;

  // Round the size down *first*, then clamp the offset against the rounded size.
  // Rounding both independently can put left + width one pixel past the edge, which
  // sharp rejects outright with "bad extract area".
  const cropWidth = Math.max(1, Math.floor(width));
  const cropHeight = Math.max(1, Math.floor(height));
  const clamp = (value: number, max: number) => Math.round(Math.min(Math.max(0, value), max));

  return {
    left: clamp(centreX - cropWidth / 2, image.width - cropWidth),
    top: clamp(centreY - cropHeight / 2, image.height - cropHeight),
    width: cropWidth,
    height: cropHeight,
  };
}

async function main(): Promise<void> {
  ensureDirs();
  const images = requireStage<ImageRecord[]>(`${RAW}/images.json`, 'dataset:images');
  const validation = requireStage<ValidationResult[]>(`${RAW}/validation.json`, 'dataset:validate');
  const verdicts = new Map(validation.map((result) => [result.localFile, result]));

  const usable = images.filter((image) => {
    const verdict = verdicts.get(image.localFile);
    return image.downloaded && verdict && verdict.verdict !== 'rejected';
  });

  const assets: AssetRecord[] = [];
  let done = 0;

  for (const image of usable) {
    const verdict = verdicts.get(image.localFile)!;
    const source = `${IMAGES_DIR}/${image.localFile}`;
    const assetName = `${createHash('sha256')
      .update(`${ASSET_SALT}|${image.localFile}`)
      .digest('hex')
      .slice(0, 16)}.webp`;
    try {
      const pipeline = sharp(source).rotate();
      const meta = await pipeline.metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (width === 0 || height === 0) throw new Error('no dimensions');

      const face = verdict.face;
      const crop: AssetRecord['crop'] = face ? 'face' : 'attention';
      const output = face
        ? pipeline.extract(faceCrop({ width, height }, face))
        : pipeline;

      const master = await output
        .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
          fit: 'cover',
          position: face ? 'centre' : sharp.strategy.attention,
        })
        .webp({ quality: QUALITY, effort: 5 })
        .toBuffer();
      await writeFile(`${ASSETS_DIR}/${assetName}`, master);

      const previewPaths: string[] = [];
      let bytes = master.length;
      for (const [stage, plan] of previewPlan().entries()) {
        const previewName = `${assetName.replace(/\.webp$/, '')}-s${stage + 1}.webp`;
        const preview = await sharp(master)
          .resize(plan.width, plan.height, { fit: 'cover' })
          .blur(plan.sigma)
          .webp({ quality: PREVIEW_QUALITY, effort: 5 })
          .toBuffer();
        await writeFile(`${ASSETS_DIR}/${previewName}`, preview);
        previewPaths.push(`/celebrities/${previewName}`);
        bytes += preview.length;
      }

      assets.push({
        qid: image.qid,
        localFile: image.localFile,
        assetPath: `/celebrities/${assetName}`,
        previewPaths,
        bytes,
        crop,
      });
    } catch (err) {
      console.warn(`\n  ! ${image.localFile}: ${(err as Error).message}`);
    }
    done += 1;
    progress('assets', done, usable.length);
  }

  writeJson(`${RAW}/assets.json`, assets);
  const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const faceCrops = assets.filter((asset) => asset.crop === 'face').length;
  console.log(
    `✓ ${assets.length} assets + ${assets.length * PREVIEW_WIDTHS.length} pre-blurred stage previews `
    + `(${faceCrops} face-centred, ${assets.length - faceCrops} attention-cropped), `
    + `${(total / 1024 / 1024).toFixed(1)} MB total -> public/celebrities/`,
  );
}

runStage(import.meta.url, main, 'asset generation');
