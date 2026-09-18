import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_ATTEMPTS } from '../src/engine/reveal.ts';
import type { Celebrity } from '../src/engine/types.ts';

/**
 * Serving the photograph without naming it.
 *
 * The browser bundle carries the whole dataset — it has to, or the guess box could not
 * autocomplete. That makes an image URL a spoiler: `/celebrities/a0b0…-s2.webp` appears
 * verbatim in `celebrities.json` next to the name it belongs to, so a player with the
 * network panel open could read the answer off a request (spec §58).
 *
 * So the server hands out no filenames. A question is minted with an opaque random
 * token, and the bytes come back through `/mp/asset/:token/:stage` — the same picture,
 * with nothing in the URL that maps to a person.
 *
 * The token alone is not the protection, though. `maxStage` is: the room's clock
 * decides how far up the ladder anyone may fetch, so asking for the clear photograph
 * during a question is refused no matter who asks. Without that check the token would
 * be a key to the answer rather than a veil over it.
 */

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

export type AssetResult =
  | { ok: true; body: Buffer; contentType: string }
  | { ok: false; status: 404 | 403 };

export async function readStageAsset(
  celebrity: Celebrity,
  stage: number,
  maxStage: number,
): Promise<AssetResult> {
  if (!Number.isInteger(stage) || stage < 0 || stage >= MAX_ATTEMPTS) {
    return { ok: false, status: 404 };
  }
  if (stage > maxStage) return { ok: false, status: 403 };

  const image = celebrity.images[0];
  if (!image) return { ok: false, status: 404 };

  // previews holds the blurred rungs; the clear photograph is the last stage and lives
  // at localPath. A dataset built before previews existed falls back to the clear file,
  // which the stage gate still keeps out of reach until the reveal.
  const source = stage < image.previews.length
    ? image.previews[stage]!
    : image.localPath;

  if (source.startsWith('data:')) return decodeDataUri(source);

  const body = await readAsset(source);
  return body
    ? { ok: true, body, contentType: 'image/webp' }
    : { ok: false, status: 404 };
}

/** The first rung is inlined into the dataset as a data URI, so it never hits disk. */
function decodeDataUri(uri: string): AssetResult {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(uri);
  if (!match) return { ok: false, status: 404 };
  return { ok: true, body: Buffer.from(match[2]!, 'base64'), contentType: match[1]! };
}

/**
 * Reads a dataset path out of `public/`, and only out of `public/`. The paths come
 * from a generated file rather than from a request, but a path join that can be walked
 * out of is worth closing whatever feeds it.
 */
async function readAsset(assetPath: string): Promise<Buffer | undefined> {
  const resolved = normalize(join(PUBLIC_DIR, assetPath.replace(/^\/+/, '')));
  if (!resolved.startsWith(PUBLIC_DIR.replace(new RegExp(`${sep}$`), '') + sep)) {
    return undefined;
  }
  try {
    return await readFile(resolved);
  } catch {
    return undefined;
  }
}
