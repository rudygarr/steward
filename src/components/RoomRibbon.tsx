import { DEMO_TODAY, eventsOnDay } from '../lib/data';
import type { Database } from '../lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ROOM RIBBON — the rail, turned on its side
 * ─────────────────────────────────────────────────────────────────────────
 *  Home and Calendar read the day down a spine. A room's day is the same
 *  object seen from the other end, so here it lies flat: one thin track per
 *  room showing when it is occupied, with the live moment marked.
 *
 *  It replaces a number ("8 bookings") with a shape. "Is the Theater free
 *  after lunch?" is the question people actually bring to this screen, and a
 *  count cannot answer it while a ribbon answers it at a glance.
 * ───────────────────────────────────────────────────────────────────────── */

/** The school day the ribbon spans. Anything outside is clamped to the ends. */
const DAY_START = 7 * 60;
const DAY_END = 19 * 60;
const SPAN = DAY_END - DAY_START;

function pct(minutes: number): number {
  return Math.max(0, Math.min(100, ((minutes - DAY_START) / SPAN) * 100));
}

function minutesOf(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export default function RoomRibbon({
  db,
  room,
  contested,
}: {
  db: Database;
  room: string;
  contested?: boolean;
}) {
  const today = eventsOnDay(db.events, DEMO_TODAY).filter(
    (e) => !e.all_day && !e.cancelled && !e.released && e.rooms.includes(room),
  );

  const blocks = today
    .map((e) => {
      const s = minutesOf(e.starts_at);
      const end = minutesOf(e.ends_at) ?? (s === null ? null : s + 60);
      if (s === null || end === null) return null;
      const left = pct(s);
      // Always leave a sliver visible: a 20-minute booking still matters.
      const width = Math.max(1.5, pct(end) - left);
      return { id: e.id, left, width, name: e.name };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const nowMin = DEMO_TODAY.getHours() * 60 + DEMO_TODAY.getMinutes();
  const nowPct = nowMin >= DAY_START && nowMin <= DAY_END ? pct(nowMin) : null;

  const label = blocks.length
    ? `${blocks.length} booking${blocks.length === 1 ? '' : 's'} today`
    : 'Free today';

  return (
    <div className="ribbon" role="img" aria-label={`${room}: ${label}`}>
      {blocks.map((b) => (
        <span
          key={b.id}
          className={'ribbon-block' + (contested ? ' is-contested' : '')}
          style={{ left: b.left + '%', width: b.width + '%' }}
        />
      ))}
      {nowPct !== null && <span className="ribbon-now" style={{ left: nowPct + '%' }} />}
    </div>
  );
}
