import { MAX_ATTEMPTS } from '../engine/reveal.ts';
import { winRate } from '../engine/stats.ts';
import type { Stats } from '../engine/types.ts';
import { Modal } from './Modal.tsx';

export function StatsPanel({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  const counts = Array.from({ length: MAX_ATTEMPTS }, (_, index) => stats.distribution[index + 1] ?? 0);
  const peak = Math.max(1, ...counts);

  return (
    <Modal title="Your stats" onClose={onClose}>
      {stats.gamesPlayed === 0 ? (
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          No games yet. Play today&apos;s star and your streak starts here.
        </p>
      ) : (
        <>
          <dl className="stats-grid">
            {([
              ['Played', String(stats.gamesPlayed)],
              ['Win rate', `${winRate(stats)}%`],
              ['Current', `🔥${stats.currentStreak}`],
              ['Best', String(stats.maxStreak)],
            ] as const).map(([label, value]) => (
              <div className="stat" key={label}>
                <dt className="stat__label">{label}</dt>
                <dd className="stat__value" style={{ margin: 0 }}>{value}</dd>
              </div>
            ))}
          </dl>

          <p style={{ color: 'var(--muted)', fontSize: 14, margin: '0 0 16px' }}>
            Average score <b style={{ color: 'var(--text)' }}>{stats.averageScore}</b> / 500
          </p>

          <h3 style={{ fontSize: 12, letterSpacing: '.7px', textTransform: 'uppercase', color: 'var(--muted-2)', margin: '0 0 10px' }}>
            Recognised on guess
          </h3>
          <div className="dist">
            {counts.map((count, index) => (
              <div className="dist__row" key={index}>
                <span style={{ color: 'var(--muted)' }}>{index + 1}</span>
                <span
                  className={`dist__bar${count === peak && count > 0 ? ' dist__bar--best' : ''}`}
                  style={{ width: `${Math.max(8, (count / peak) * 100)}%` }}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
