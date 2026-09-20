import { multiplayerServerUrl } from '../socket.ts';
import { blurPercentAt, saturationAt, visibleStages } from '../../stage.ts';
import { MAX_ATTEMPTS } from '../../../engine/reveal.ts';

type MpPhotoProps = {
  /** The question's opaque handle. Nothing here knows whose face this is. */
  assetToken: string;
  /**
   * Continuous position along the stage ladder. 1.5 means stage 2 half-faded over
   * stage 1 — the mixture that makes the reveal gradual rather than a slideshow.
   */
  position: number;
  revealed: boolean;
  /** Set briefly on a wrong guess, to borrow the daily game's shake. */
  shake?: boolean;
};

/**
 * The photograph, fetched by token and dissolved on the clock.
 *
 * This is the daily game's `PhotoStage` with its dataset knowledge removed — it cannot
 * name the person on screen and it cannot construct a filename. All it has is a token
 * and a position, and the server decides whether the rungs that implies are allowed yet.
 *
 * Every rung already passed stays mounted underneath. In the daily game that covers the
 * moment a file loads; here it does the real work, because the picture on screen is a
 * blend of the settled rung and the one fading in over it. The opacity is driven from
 * the shared clock, and a CSS transition smooths the gap between ticks, so the face
 * sharpens continuously instead of four times a question.
 */
export function MpPhoto({ assetToken, position, revealed, shake }: MpPhotoProps) {
  const base = multiplayerServerUrl();
  const { base: settled, top, topOpacity } = visibleStages(position);

  const url = (stage: number) => `${base}/mp/asset/${assetToken}/${stage}`;

  // At the reveal only the clear photograph is wanted; stacking four blurred copies
  // behind it would fetch four files to show none of them.
  const layers = revealed
    ? [{ stage: MAX_ATTEMPTS - 1, opacity: 1 }]
    : [
      ...Array.from({ length: settled + 1 }, (_, stage) => ({ stage, opacity: 1 })),
      { stage: top, opacity: topOpacity },
    ];

  const blurPercent = revealed ? 0 : blurPercentAt(position);
  const saturation = revealed ? 1 : saturationAt(position);
  const topStage = layers.at(-1)!.stage;

  const className = [
    'stage',
    revealed ? 'stage--revealed stage--win' : '',
    shake ? 'stage--shake' : '',
  ].filter(Boolean).join(' ');

  return (
    <figure className={className} style={{ margin: 0 }}>
      {layers.map((layer) => (
        <img
          key={layer.stage}
          // The daily game fades each rung in on mount; here opacity is owned by the
          // clock, so that animation is switched off and a transition takes its place.
          className="stage__image stage__image--dissolve"
          src={url(layer.stage)}
          // Deliberately does not name the blur percentage, which now changes four
          // times a second: an alt that churns is noise, and the figure is already on
          // the badge for anyone reading the page.
          alt={layer.stage === topStage
            ? (revealed
              ? 'The revealed photograph'
              : 'A blurred photograph of this round’s mystery star, clearing as the clock runs')
            : ''}
          aria-hidden={layer.stage === topStage ? undefined : true}
          draggable={false}
          decoding="async"
          fetchPriority="high"
          style={{ opacity: layer.opacity, filter: `saturate(${saturation})` }}
        />
      ))}
      <div className="stage__vignette" aria-hidden="true" />
      <figcaption className="stage__badge">
        {revealed ? <>REVEALED</> : <>BLUR <b>{blurPercent}%</b></>}
      </figcaption>
    </figure>
  );
}
