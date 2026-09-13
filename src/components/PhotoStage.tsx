import { useEffect, useState } from 'react';
import { assetUrl } from '../engine/asset.ts';
import { stageAt } from '../engine/reveal.ts';
import type { Celebrity } from '../engine/types.ts';

type PhotoStageProps = {
  celebrity: Celebrity;
  stageIndex: number;
  revealed: boolean;
  shake: boolean;
};

/**
 * The photo.
 *
 * Each stage has its own file with the blur already in the pixels, so what the
 * network panel holds is exactly what is on screen — a CSS filter alone would leave a
 * sharp photograph one right-click away. The clear image is requested only when the
 * game ends, and no stage is fetched before the player reaches it: pre-loading the
 * next one would put a clearer picture in the browser than the game is showing.
 *
 * Stages the player has already passed stay mounted underneath, which turns each
 * reveal into a cross-fade and covers the moment the next file is loading.
 *
 * Also owns the fallback between licensed candidates when an image fails to load, and
 * therefore the credit line, so attribution always names the photo on screen.
 */
export function PhotoStage({ celebrity, stageIndex, revealed, shake }: PhotoStageProps) {
  const [candidate, setCandidate] = useState(0);
  const [failed, setFailed] = useState(false);
  const stage = stageAt(stageIndex);
  const image = celebrity.images[candidate];

  useEffect(() => {
    setCandidate(0);
    setFailed(false);
  }, [celebrity.id]);

  // Every stage up to the current one — all of them already earned.
  const layers = image
    ? (revealed
      ? [{ src: assetUrl(image.localPath), blur: 0 }]
      : image.previews.slice(0, stageIndex + 1).map((src, index) => ({
        src: assetUrl(src),
        // Pre-blurred assets need no CSS blur. A dataset built before they existed
        // falls back to painting it, so the game degrades rather than breaking.
        blur: 0,
        stage: index,
      })))
    : [];
  const fallbackBlur = image && image.previews.length === 0 && !revealed ? stage.blur : 0;
  const displayed = layers.at(-1)
    ?? (image && !revealed ? { src: assetUrl(image.localPath), blur: stage.blur } : undefined);

  const className = [
    'stage',
    revealed ? 'stage--revealed stage--win' : '',
    shake ? 'stage--shake' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <figure className={className} style={{ margin: 0 }}>
        {failed || !image || !displayed ? (
          <div className="stage__fallback">
            <span style={{ fontSize: 34 }} aria-hidden="true">🎞️</span>
            <p style={{ margin: 0 }}>
              Today&apos;s photo could not be loaded.
              <br />
              The clues still work — keep guessing.
            </p>
          </div>
        ) : (
          (layers.length > 0 ? layers : [displayed]).map((layer, index) => (
            <img
              key={layer.src}
              className="stage__image"
              src={layer.src}
              alt={
                index === (layers.length || 1) - 1
                  ? (revealed
                    ? `Photograph of ${celebrity.name}`
                    : `A ${stage.blurPercent}% blurred photograph of today's mystery star`)
                  : ''
              }
              aria-hidden={index === (layers.length || 1) - 1 ? undefined : true}
              draggable={false}
              decoding="async"
              fetchPriority="high"
              style={{
                // Stacking is DOM order: each stage paints over the one before it.
                filter: `blur(${fallbackBlur}px) saturate(${revealed ? 1 : stage.saturation})`,
              }}
              onError={() => {
                // Try the next licensed candidate before giving up on the photo.
                if (candidate + 1 < celebrity.images.length) setCandidate(candidate + 1);
                else setFailed(true);
              }}
            />
          ))
        )}
        <div className="stage__vignette" aria-hidden="true" />
        <figcaption className="stage__badge">
          {revealed ? <>REVEALED</> : <>BLUR <b>{stage.blurPercent}%</b></>}
        </figcaption>
      </figure>

      {revealed && image && (
        <p className="attribution">
          Photo:{' '}
          <a href={image.sourceUrl} target="_blank" rel="noreferrer noopener">
            {image.sourceName}
          </a>
          {image.license ? ` · ${image.license}` : ''}
          {image.attribution ? ` · ${image.attribution}` : ''}
        </p>
      )}
    </>
  );
}
