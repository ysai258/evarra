import { useEffect, useState } from 'react';
import { formatCountdown, msUntilTomorrow } from '../engine/date.ts';

/** Ticks down to the local midnight rollover (PRD §32). */
export function Countdown() {
  const [remaining, setRemaining] = useState(() => msUntilTomorrow());

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(msUntilTomorrow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <p className="countdown">
      NEXT STAR IN
      <b>
        <time aria-live="off">{formatCountdown(remaining)}</time>
      </b>
    </p>
  );
}
