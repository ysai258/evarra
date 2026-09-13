import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchivePanel } from './components/ArchivePanel.tsx';
import { GameBoard } from './components/GameBoard.tsx';
import { HowToPlay } from './components/HowToPlay.tsx';
import { InfoPanel, type InfoPage } from './components/InfoPanel.tsx';
import { Landing } from './components/Landing.tsx';
import { StatsPanel } from './components/StatsPanel.tsx';
import {
  celebrities, datasetError, launchDate, playableCelebrities, scheduleThrough,
} from './data/index.ts';
import { archiveDates, describeDay, isPlayableDate, unplayedCount } from './engine/archive.ts';
import { syncClock, trustedToday } from './engine/clock.ts';
import { createGame, loadArchive, saveGame, type GameArchive } from './engine/game.ts';
import { resolveDailyPuzzle } from './engine/puzzle.ts';
import { computeStats } from './engine/stats.ts';
import { STORAGE_KEYS, readStore, writeStore } from './engine/storage.ts';
import type { GameState } from './engine/types.ts';

type Overlay = 'none' | 'stats' | 'how' | 'archive' | InfoPage;

/** Deep link to a past star: ?day=2026-09-10. */
const DAY_PARAM = 'day';

function dateFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = new URLSearchParams(window.location.search).get(DAY_PARAM);
  return value ?? undefined;
}

export function App() {
  const problem = datasetError();
  // Until the server's clock has been read, nothing is shown: rendering against the
  // device clock first would give a wound-forward device a glimpse of a future star.
  const [clockReady, setClockReady] = useState(false);
  const [today, setToday] = useState(() => trustedToday());
  const [archive, setArchive] = useState<GameArchive>(() => (problem ? {} : loadArchive()));
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number>(0);

  const [selectedDate, setSelectedDate] = useState(() => trustedToday());

  const [started, setStarted] = useState(() => {
    if (problem) return false;
    if (dateFromUrl()) return true;
    const returning = readStore<boolean>(STORAGE_KEYS.seenHowToPlay, false);
    return returning || Object.keys(loadArchive()).length > 0;
  });

  // One clock read on load, then the ?day= request is judged against it.
  useEffect(() => {
    const controller = new AbortController();
    void syncClock(controller.signal).then(() => {
      const current = trustedToday();
      const requested = dateFromUrl();
      setToday(current);
      setSelectedDate(
        requested && isPlayableDate(requested, launchDate, current) ? requested : current,
      );
      setClockReady(true);
    });
    return () => controller.abort();
  }, []);

  const schedule = useMemo(
    () => (problem ? {} : scheduleThrough(today)),
    [today, problem],
  );

  const celebrity = useMemo(() => {
    if (problem) return undefined;
    // A day already played keeps the star it was played with, even if a later roster
    // change would shift the schedule underneath it.
    const saved = archive[selectedDate];
    const fromSave = saved && celebrities.find((c) => c.id === saved.celebrityId);
    return fromSave ?? resolveDailyPuzzle(selectedDate, celebrities, schedule);
  }, [selectedDate, problem, schedule, archive]);

  const stats = useMemo(() => computeStats(archive, today), [archive, today]);

  const days = useMemo(
    () => archiveDates(launchDate, today)
      .map((date) => describeDay(date, archive[date], today)),
    [archive, today],
  );

  const game: GameState | undefined = useMemo(() => {
    if (!celebrity) return undefined;
    return archive[selectedDate] ?? createGame(selectedDate, celebrity.id);
  }, [archive, selectedDate, celebrity]);

  // The date can roll over while the tab is open — pick up the new star without a reload.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = trustedToday();
      setToday((previous) => {
        if (previous === current) return previous;
        // Only follow the rollover if the player is sitting on what used to be today.
        setSelectedDate((selected) => (selected === previous ? current : selected));
        return current;
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Keep the URL in step so a refresh — or a shared link — lands on the same day.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (selectedDate === today) url.searchParams.delete(DAY_PARAM);
    else url.searchParams.set(DAY_PARAM, selectedDate);
    window.history.replaceState(null, '', url);
  }, [selectedDate, today]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  const onGameChange = useCallback((next: GameState) => {
    saveGame(next);
    setArchive((previous) => ({ ...previous, [next.date]: next }));
  }, []);

  function onPlay() {
    setStarted(true);
    writeStore(STORAGE_KEYS.seenHowToPlay, true);
  }

  function onPickDay(date: string) {
    setSelectedDate(date);
    setStarted(true);
    setOverlay('none');
  }

  if (!clockReady && !problem) {
    return (
      <div className="app">
        <main className="error-screen">
          <p className="loading telugu">ఒరేయ్…</p>
          <p style={{ color: 'var(--ink-soft)' }}>Finding today&apos;s star…</p>
        </main>
      </div>
    );
  }

  if (problem) {
    return (
      <div className="app">
        <main className="error-screen">
          <h1 className="hero__title" style={{ fontSize: 48 }}>EVARRA?</h1>
          <p style={{ color: 'var(--muted)' }}>{problem}</p>
        </main>
      </div>
    );
  }

  const playing = started && Boolean(celebrity && game);

  return (
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="wordmark"
          onClick={() => setStarted(false)}
          aria-label="EVARRA? — back to the home screen"
        >
          <span className="wordmark__en">EVARRA?</span>
          <span className="wordmark__te telugu">ఎవర్రా?</span>
        </button>
        <div className="topbar__actions">
          <button
            type="button"
            className="icon-button"
            onClick={() => setOverlay('archive')}
            aria-label="Past stars"
          >
            🗓
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setOverlay('how')}
            aria-label="How to play"
          >
            ?
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setOverlay('stats')}
            aria-label="Your stats"
          >
            📊
          </button>
        </div>
      </header>

      {!started ? (
        <Landing
          onPlay={onPlay}
          hasProgress={(game?.guesses.length ?? 0) > 0 || (game?.completed ?? false)}
          preview={game?.completed ? undefined : celebrity}
          stats={stats}
          catchUpCount={unplayedCount(days.filter((day) => !day.isToday))}
          onBrowseArchive={() => setOverlay('archive')}
        />
      ) : celebrity && game ? (
        <GameBoard
          celebrity={celebrity}
          roster={playableCelebrities}
          game={game}
          stats={stats}
          isToday={selectedDate === today}
          onChange={onGameChange}
          onToast={showToast}
          onBackToToday={() => setSelectedDate(today)}
          onBrowseArchive={() => setOverlay('archive')}
        />
      ) : (
        <main className="error-screen">
          <p style={{ color: 'var(--muted)' }}>
            That day&apos;s puzzle could not be loaded.
          </p>
          <button
            type="button"
            className="button button--subtle"
            onClick={() => setSelectedDate(today)}
          >
            Back to today
          </button>
        </main>
      )}

      {/* While a game is on screen the footer keeps only its links: the board is one
          viewport and every line of prose there costs the photograph height. */}
      <footer className={`footer${playing ? ' footer--compact' : ''}`}>
        {!playing && (
          <>
            A new star every day at midnight, your local time.
            <br />
            Photos from Wikimedia Commons under their own licences.
          </>
        )}
        <span className="footer__links">
          <button type="button" onClick={() => setOverlay('about')}>About</button>
          <button type="button" onClick={() => setOverlay('privacy')}>Privacy</button>
          <button type="button" onClick={() => setOverlay('contact')}>Contact</button>
        </span>
      </footer>

      {overlay === 'stats' && <StatsPanel stats={stats} onClose={() => setOverlay('none')} />}
      {overlay === 'how' && <HowToPlay onClose={() => setOverlay('none')} />}
      {overlay === 'archive' && (
        <ArchivePanel
          days={days}
          launch={launchDate}
          today={today}
          selected={selectedDate}
          onPick={onPickDay}
          onClose={() => setOverlay('none')}
        />
      )}
      {(overlay === 'about' || overlay === 'privacy' || overlay === 'contact') && (
        <InfoPanel page={overlay} onClose={() => setOverlay('none')} />
      )}
      {toast && <output className="toast">{toast}</output>}
    </div>
  );
}
