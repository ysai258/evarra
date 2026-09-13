import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { HINT_PENALTY, MAX_SCORE } from '../engine/scoring.ts';
import { Modal } from './Modal.tsx';

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose}>
      <ol className="steps__list" style={{ margin: 0, paddingLeft: 20, color: 'var(--muted)' }}>
        <li style={{ margin: '10px 0' }}>
          A Telugu cinema star appears, <strong>heavily blurred</strong>.
        </li>
        <li style={{ margin: '10px 0' }}>
          You get <strong>{MAX_ATTEMPTS} guesses</strong>. Every wrong guess clears the photo a
          little more.
        </li>
        <li style={{ margin: '10px 0' }}>
          Stuck? <strong>Reveal a clue</strong> — but each one costs {HINT_PENALTY} points.
        </li>
        <li style={{ margin: '10px 0' }}>
          Recognise them at the first stage for the full <strong>{MAX_SCORE}</strong>. The longer it
          takes, the less it is worth.
        </li>
        <li style={{ margin: '10px 0' }}>
          Share your score — the grid gives nothing away.
        </li>
      </ol>
      <p style={{ color: 'var(--muted-2)', fontSize: 13, marginBottom: 0 }}>
        One star a day, the same for everyone, with a new one at midnight in your own
        timezone. Missed a day? It stays in <strong>Evarra meerantha?</strong> — the
        back catalogue — until you play it.
      </p>
    </Modal>
  );
}
