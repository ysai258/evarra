/**
 * Face detection for the ingestion pipeline.
 *
 * Uses pico.js (MIT) — a ~200-line pure-JavaScript pixel-intensity-comparison
 * detector with a vendored cascade, chosen over TensorFlow-based detectors because
 * the PRD requires face detection not to become a hard dependency of the project.
 * It runs on a greyscale buffer produced by sharp, needs no native build step, and
 * if the cascade is missing the pipeline degrades to "unknown" rather than failing.
 *
 * The cascade only recognises upright frontal faces, which misses a lot of press
 * photography — heads tilt. So an image with no hit at 0° is retried on a rotated
 * copy and the hit is mapped back to original coordinates.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { ROOT } from './lib.ts';

const require = createRequire(import.meta.url);
const CASCADE_PATH = resolve(ROOT, 'scripts/dataset/vendor/facefinder');
/** Anything below this confidence is noise for our purposes. */
const CONFIDENCE_THRESHOLD = 45;
/** Rotated passes see black canvas corners, so they have to clear a higher bar. */
const ROTATED_CONFIDENCE_THRESHOLD = 60;
/** pico works on intensity; 640px on the long edge is plenty and keeps it fast. */
const DETECT_SIZE = 640;
/** Tried in order; the first angle that finds a face wins. */
const ANGLES = [0, -22, 22, -38, 38] as const;

export type Face = {
  /** Centre, as 0..1 fractions of the original image. */
  cx: number;
  cy: number;
  /**
   * Detection window *diameter*, as a fraction of the image's short edge. pico's
   * third output is the window size, not a radius — treating it as a radius makes
   * every crop twice as loose as intended.
   */
  size: number;
  confidence: number;
  /** The rotation, in degrees, at which this face was found. */
  angle: number;
};

type Classify = (r: number, c: number, s: number, pixels: Uint8Array, ldim: number) => number;

type Pico = {
  unpack_cascade: (bytes: Int8Array) => Classify;
  run_cascade: (
    image: { pixels: Uint8Array; nrows: number; ncols: number; ldim: number },
    classify: Classify,
    params: { scalefactor: number; shiftfactor: number; minsize: number; maxsize: number },
  ) => number[][];
  cluster_detections: (dets: number[][], iouThreshold: number) => number[][];
};

let classifier: Classify | null = null;
let pico: Pico | null = null;
let unavailableReason: string | undefined;

function load(): boolean {
  if (classifier) return true;
  if (unavailableReason) return false;
  try {
    if (!existsSync(CASCADE_PATH)) {
      unavailableReason = `cascade missing at ${CASCADE_PATH}`;
      return false;
    }
    pico = require('picojs') as Pico;
    classifier = pico.unpack_cascade(new Int8Array(readFileSync(CASCADE_PATH)));
    return true;
  } catch (err) {
    unavailableReason = (err as Error).message;
    return false;
  }
}

export function faceDetectionAvailable(): boolean {
  return load();
}

export function faceDetectionUnavailableReason(): string | undefined {
  load();
  return unavailableReason;
}

type Detection = { cx: number; cy: number; size: number; confidence: number };

async function detectIn(buffer: Buffer, threshold: number): Promise<Detection[]> {
  const { data, info } = await sharp(buffer)
    .greyscale()
    .resize(DETECT_SIZE, DETECT_SIZE, { fit: 'inside', withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const raw = pico!.run_cascade(
    {
      pixels: new Uint8Array(data.buffer, data.byteOffset, data.length),
      nrows: info.height,
      ncols: info.width,
      ldim: info.width,
    },
    classifier!,
    {
      shiftfactor: 0.1,
      minsize: Math.round(Math.min(info.width, info.height) * 0.08),
      maxsize: Math.max(info.width, info.height),
      scalefactor: 1.1,
    },
  );

  return pico!
    .cluster_detections(raw, 0.2)
    .filter((detection) => (detection[3] ?? 0) > threshold)
    .map((detection) => ({
      cy: (detection[0] ?? 0) / info.height,
      cx: (detection[1] ?? 0) / info.width,
      size: (detection[2] ?? 0) / Math.min(info.width, info.height),
      confidence: detection[3] ?? 0,
    }));
}

/**
 * Maps a hit found on a clockwise-rotated, expanded canvas back onto the original.
 * Returns undefined when the point lands outside the original image, which happens
 * for false positives in the black corners the rotation introduces.
 */
function unrotate(
  detection: Detection,
  angleDegrees: number,
  original: { width: number; height: number },
  rotated: { width: number; height: number },
): Face | undefined {
  const theta = (angleDegrees * Math.PI) / 180;
  const dx = detection.cx * rotated.width - rotated.width / 2;
  const dy = detection.cy * rotated.height - rotated.height / 2;
  const x = original.width / 2 + dx * Math.cos(theta) + dy * Math.sin(theta);
  const y = original.height / 2 - dx * Math.sin(theta) + dy * Math.cos(theta);
  if (x < 0 || y < 0 || x > original.width || y > original.height) return undefined;

  const scale = Math.min(rotated.width, rotated.height) / Math.min(original.width, original.height);
  return {
    cx: x / original.width,
    cy: y / original.height,
    size: detection.size * scale,
    confidence: detection.confidence,
    angle: angleDegrees,
  };
}

export async function detectFaces(file: string): Promise<Face[] | undefined> {
  if (!load() || !pico || !classifier) return undefined;

  // Auto-orient once so every pass — and the crop that follows — shares coordinates.
  const upright = await sharp(file).rotate().toBuffer({ resolveWithObject: true });
  const original = { width: upright.info.width, height: upright.info.height };

  for (const angle of ANGLES) {
    if (angle === 0) {
      const found = await detectIn(upright.data, CONFIDENCE_THRESHOLD);
      if (found.length > 0) {
        return found
          .map((detection) => ({ ...detection, angle }))
          .sort((a, b) => b.size - a.size);
      }
      continue;
    }

    const rotatedBuffer = await sharp(upright.data)
      .rotate(angle, { background: { r: 0, g: 0, b: 0 } })
      .toBuffer({ resolveWithObject: true });
    const found = await detectIn(rotatedBuffer.data, ROTATED_CONFIDENCE_THRESHOLD);
    const mapped = found
      .flatMap((detection) => {
        const face = unrotate(detection, angle, original, {
          width: rotatedBuffer.info.width,
          height: rotatedBuffer.info.height,
        });
        return face ? [face] : [];
      })
      .sort((a, b) => b.size - a.size);
    if (mapped.length > 0) return mapped;
  }

  return [];
}
