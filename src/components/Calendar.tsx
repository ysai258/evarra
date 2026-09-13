import { useState } from 'react';
import type { ArchiveDay } from '../engine/archive.ts';
import { WEEKDAY_INITIALS, buildMonth, monthOf } from '../engine/calendar.ts';
import { formatPuzzleDate } from '../engine/date.ts';

type CalendarProps = {
  launch: string;
  today: string;
  selected: string;
  statuses: ReadonlyMap<string, ArchiveDay['status']>;
  onPick: (date: string) => void;
};

const STATUS_LABEL: Record<ArchiveDay['status'], string> = {
  won: 'solved',
  lost: 'missed',
  'in-progress': 'in progress',
  unplayed: 'not played yet',
};

/**
 * Month grid for picking a past star. Days before launch and after today are rendered
 * but disabled, so the shape of what is playable is obvious at a glance rather than
 * something you discover by tapping.
 */
export function Calendar({ launch, today, selected, statuses, onPick }: CalendarProps) {
  const [month, setMonth] = useState(() => monthOf(selected));
  const view = buildMonth(month, { launch, today, statuses });

  return (
    <div className="calendar">
      <div className="calendar__head">
        <button
          type="button"
          className="icon-button"
          onClick={() => view.previousMonth && setMonth(view.previousMonth)}
          disabled={!view.previousMonth}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3 className="calendar__month" aria-live="polite">{view.label}</h3>
        <button
          type="button"
          className="icon-button"
          onClick={() => view.nextMonth && setMonth(view.nextMonth)}
          disabled={!view.nextMonth}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="calendar__weekdays" aria-hidden="true">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <span key={index}>{initial}</span>
        ))}
      </div>

      <div className="calendar__grid" role="grid" aria-label="Past stars">
        {view.weeks.map((week, weekIndex) => (
          <div className="calendar__week" role="row" key={weekIndex}>
            {week.map((cell, dayIndex) => {
              if (!cell.date) {
                return <span className="cell cell--empty" role="gridcell" key={dayIndex} />;
              }
              const isSelected = cell.date === selected;
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={cell.date}
                  className={[
                    'cell',
                    `cell--${cell.status}`,
                    cell.isToday ? 'cell--today' : '',
                    isSelected ? 'cell--selected' : '',
                  ].filter(Boolean).join(' ')}
                  disabled={!cell.playable}
                  aria-current={isSelected ? 'date' : undefined}
                  aria-label={
                    cell.playable
                      ? `${formatPuzzleDate(cell.date)} — ${STATUS_LABEL[cell.status]}`
                      : `${formatPuzzleDate(cell.date)} — not available`
                  }
                  onClick={() => onPick(cell.date!)}
                >
                  <span className="cell__day">{cell.dayOfMonth}</span>
                  <span className="cell__dot" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="calendar__key">
        <span><i className="dot dot--won" /> solved</span>
        <span><i className="dot dot--lost" /> missed</span>
        <span><i className="dot dot--open" /> started</span>
      </p>
    </div>
  );
}
