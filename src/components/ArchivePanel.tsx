import type { ArchiveDay } from '../engine/archive.ts';
import { Calendar } from './Calendar.tsx';
import { Modal } from './Modal.tsx';

type ArchivePanelProps = {
  days: readonly ArchiveDay[];
  launch: string;
  today: string;
  selected: string;
  onPick: (date: string) => void;
  onClose: () => void;
};

/** The back catalogue: every star since launch, on a calendar. */
export function ArchivePanel({
  days, launch, today, selected, onPick, onClose,
}: ArchivePanelProps) {
  const statuses = new Map(days.map((day) => [day.date, day.status]));

  return (
    <Modal title="Evarra meerantha?" onClose={onClose}>
      <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 14 }}>
        <span className="telugu" style={{ color: 'var(--text)' }}>ఎవర్రా మీరంతా?</span>
        {' — '}
        every star since launch. Missed days stay open; each is scored on its own and
        counts towards your streak for that date.
      </p>
      <Calendar
        launch={launch}
        today={today}
        selected={selected}
        statuses={statuses}
        onPick={onPick}
      />
    </Modal>
  );
}
