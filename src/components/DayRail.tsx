import { useNavigate } from 'react-router-dom';
import { DEMO_TODAY, fmtTime, type Conflict } from '../lib/data';
import type { EventRec } from '../lib/types';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE DAY RAIL
 * ─────────────────────────────────────────────────────────────────────────
 *  The day as one continuous measure rather than a stack of cards. Time runs
 *  down a single spine; everything that happens hangs off it, and a live gold
 *  rule marks the present moment.
 *
 *  Why this shape: the job here is fundamentally *when* and *where*. A card
 *  grid flattens that — every item the same size, order implied rather than
 *  shown. On the rail, "what's next", "what just slipped" and "how full is
 *  this afternoon" are all read at a glance, because time is the layout.
 *
 *  Conflicts don't become another card either: the entry grows a gold bar and
 *  the decision is offered in place, where the collision actually is.
 * ───────────────────────────────────────────────────────────────────────── */

export interface RailEntry {
  ev: EventRec;
  /** The clash this event is part of, if any. */
  conflict?: Conflict;
  /** What it collides with, phrased for a human. */
  clashWith?: string;
  /** Struck through and receded: cancelled, or a no-show whose room was reclaimed. */
  struck?: boolean;
  /** Calendar-only awareness — nothing is holding a room. */
  notice?: boolean;
  /** A short state word for the right margin ("Checked in", "No-show", "Pending"). */
  note?: string;
  /** Someone the viewer follows is involved. */
  followed?: boolean;
  /** Extra lines beneath the location — resources, crew roles. */
  extras?: string[];
}

function minutesInto(iso: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export default function DayRail({
  entries,
  now = DEMO_TODAY,
}: {
  entries: RailEntry[];
  /** The moment to draw the live rule at. Null on any day that isn't today —
   *  there is no "now" on Thursday next week, and drawing one would be a lie. */
  now?: Date | null;
}) {
  const nav = useNavigate();
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : -1;
  const nowLabel = now
    ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(now)
    : '';

  // The now-rule belongs between the last thing past and the next thing due.
  const nextIdx = entries.findIndex((e) => minutesInto(e.ev.starts_at) >= nowMin);
  const nowAt = !now ? -1 : nextIdx === -1 ? entries.length : nextIdx;

  return (
    <div className="rail">
      <div className="rail-spine" aria-hidden="true" />

      {entries.map((entry, i) => (
        <div key={entry.ev.id}>
          {i === nowAt && <NowRule label={nowLabel} />}
          <RailRow
            entry={entry}
            past={!!now && minutesInto(entry.ev.starts_at) < nowMin}
            onOpen={() => nav('/event/' + entry.ev.id)}
          />
        </div>
      ))}

      {nowAt === entries.length && <NowRule label={nowLabel} />}

      {entries.length === 0 && (
        <div className="rail-empty">Nothing on the calendar today.</div>
      )}
    </div>
  );
}

function NowRule({ label }: { label: string }) {
  return (
    <div className="rail-now">
      <div className="rail-time rail-now-time">{label}</div>
      <div className="rail-now-line">
        <span className="rail-now-dot" />
      </div>
    </div>
  );
}

function RailRow({ entry, past, onOpen }: { entry: RailEntry; past: boolean; onOpen: () => void }) {
  const { ev, clashWith } = entry;
  const where = entry.notice
    ? ev.location || 'No space booked'
    : ev.rooms?.join(', ') || ev.location || 'No room';
  const meta = [where, ev.owner].filter(Boolean).join(' · ');

  const stateClass =
    (past ? ' is-past' : '') + (entry.struck ? ' is-struck' : '') + (entry.notice ? ' is-notice' : '');

  if (clashWith) {
    return (
      <div className="rail-row rail-row-clash">
        <div className="rail-time">{ev.all_day ? 'all day' : fmtTime(ev.starts_at)}</div>
        <div className="rail-body">
          <div className="rail-flag">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l9.5 17h-19z" /><path d="M12 10v4.5" /><path d="M12 17.5v.01" />
            </svg>
            <span>Double-booked</span>
          </div>
          <button className="rail-title rail-title-btn" onClick={onOpen}>{ev.name}</button>
          <div className="rail-sub">
            {where && <span>{where}</span>}
            {where && ' — also held by '}
            <span className="rail-emph">{clashWith}</span>
          </div>
          <div className="rail-acts">
            <button className="rail-act rail-act-primary" onClick={onOpen}>Resolve</button>
            <button className="rail-act" onClick={onOpen}>Share the room</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button className={'rail-row rail-row-btn' + stateClass} onClick={onOpen}>
      <div className="rail-time">
        {ev.all_day ? 'all day' : fmtTime(ev.starts_at)}
        {!ev.all_day && ev.ends_at && <span className="rail-until">{fmtTime(ev.ends_at)}</span>}
      </div>
      <div className="rail-body">
        <div className="rail-title">
          {entry.followed && <span className="rail-follow" title="Someone you follow" />}
          {ev.name}
        </div>
        {meta && <div className="rail-sub">{meta}</div>}
        {entry.extras?.map((x) => (
          <div key={x} className="rail-sub rail-extra">{x}</div>
        ))}
      </div>
      {entry.note && <div className="rail-note">{entry.note}</div>}
    </button>
  );
}
