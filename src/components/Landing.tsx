import { assetUrl } from '../engine/asset.ts';
import { MAX_ATTEMPTS, stageAt } from '../engine/reveal.ts';
import { winRate } from '../engine/stats.ts';
import type { Celebrity, Stats } from '../engine/types.ts';

type LandingProps = {
  onPlay: () => void;
  hasProgress: boolean;
  /** Today's star, shown at maximum blur. At 92% it gives nothing away. */
  preview?: Celebrity | undefined;
  stats: Stats;
  /** Past days still waiting to be played. */
  catchUpCount: number;
  onBrowseArchive: () => void;
};

export function Landing({
  onPlay, hasProgress, preview, stats, catchUpCount, onBrowseArchive,
}: LandingProps) {
  const stage = stageAt(0);
  const poster = preview?.images[0];

  return (
    <main className="landing">
      <div className={`hero__poster${poster ? ' hero__poster--photo' : ''}`} aria-hidden="true">
        {poster && (
          <img
            src={assetUrl(poster.previews[0] ?? poster.localPath)}
            alt=""
            className="stage__image"
            draggable={false}
            style={{
              // The stage-1 asset is already blurred; only paint it if one is missing.
              filter: `blur(${poster.previews[0] ? 0 : stage.blur}px) saturate(${stage.saturation})`,
            }}
          />
        )}
      </div>

      {/* On phones this wrapper is `display: contents`, so its children stack with the
          poster and `order` slots the picture between the title and the tagline. On a
          wide screen it becomes the column beside the poster. */}
      <div className="landing__copy">
        <div className="landing__head">
          <h1 className="hero__title">EVARRA?</h1>
          <p className="hero__telugu telugu">ఒరేయ్ ఎవర్రా?</p>
        </div>

        <p className="hero__lines">
          One blurred face.
          <br />
          <strong>{MAX_ATTEMPTS} chances.</strong>
          <br />
          Can you recognise the star?
        </p>

        <div className="landing__actions">
          <button type="button" className="button button--primary" onClick={onPlay}>
            {hasProgress ? 'Continue today’s star' : 'Play today'}
          </button>
          {catchUpCount > 0 && (
            <button type="button" className="button button--ghost" onClick={onBrowseArchive}>
              {catchUpCount === 1
                ? 'You missed 1 past star — play it'
                : `You missed ${catchUpCount} past stars — catch up`}
            </button>
          )}
        </div>

        {stats.gamesPlayed > 0 && (
          <p className="landing__stats">
            <span><b>{stats.gamesPlayed}</b> played</span>
            <span><b>{winRate(stats)}%</b> found</span>
            <span><b>🔥 {stats.currentStreak}</b> streak</span>
            <span><b>{stats.averageScore}</b> avg</span>
          </p>
        )}

        <section className="steps">
          <h2>How to play</h2>
          <ol>
            <li>Look at the <strong>blurred face</strong></li>
            <li>Make your guess</li>
            <li>Reveal clues if you need them</li>
            <li>Recognise the star before the photo clears</li>
            <li>Share your score</li>
          </ol>
        </section>
      </div>
    </main>
  );
}
