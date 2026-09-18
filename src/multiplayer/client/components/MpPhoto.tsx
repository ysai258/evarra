import { multiplayerServerUrl } from '../socket.ts';
import { stageAt } from '../../../engine/reveal.ts';

type MpPhotoProps = {
  /** The question's opaque handle. Nothing here knows whose face this is. */
  assetToken: string;
  stageIndex: number;
  revealed: boolean;
  /** Set briefly on a wrong guess, to borrow the daily game's shake. */
  shake?: boolean;
};

/**
 * The photograph, fetched by token.
 *
 * This is the daily game's `PhotoStage` with its dataset knowledge removed. It cannot
 * name the person on screen and it cannot construct a filename — all it has is a token
 * and a stage number, and the server decides whether that combination is allowed yet.
 *
 * Stages already passed stay mounted underneath, exactly as in the daily game, so each
 * step up the ladder cross-fades instead of flashing while the next file loads.
 */
export function MpPhoto({ assetToken, stageIndex, revealed, shake }: MpPhotoProps) {
  const base = multiplayerServerUrl();
  const stage = stageAt(stageIndex);
  const top = revealed ? 0 : stage.blurPercent;

  // Mid-question every stage passed stays mounted underneath, so the ladder
  // cross-fades. At the reveal only the clear photograph is wanted — stacking four
  // blurred copies behind it would fetch four files to show none of them.
  const layers = revealed
    ? [{ src: `${base}/mp/asset/${assetToken}/${stageIndex}`, index: stageIndex }]
    : Array.from({ length: stageIndex + 1 }, (_, index) => ({
      src: `${base}/mp/asset/${assetToken}/${index}`,
      index,
    }));

  const className = [
    'stage',
    revealed ? 'stage--revealed stage--win' : '',
    shake ? 'stage--shake' : '',
  ].filter(Boolean).join(' ');

  return (
    <figure className={className} style={{ margin: 0 }}>
      {layers.map((layer) => (
        <img
          key={layer.src}
          className="stage__image"
          src={layer.src}
          alt={layer.index === stageIndex
            ? (revealed
              ? 'The revealed photograph'
              : `A ${stage.blurPercent}% blurred photograph of this round’s mystery star`)
            : ''}
          aria-hidden={layer.index === stageIndex ? undefined : true}
          draggable={false}
          decoding="async"
          fetchPriority="high"
          style={{ filter: `saturate(${revealed ? 1 : stage.saturation})` }}
        />
      ))}
      <div className="stage__vignette" aria-hidden="true" />
      <figcaption className="stage__badge">
        {revealed ? <>REVEALED</> : <>BLUR <b>{top}%</b></>}
      </figcaption>
    </figure>
  );
}
