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
}

function minutesInto(iso: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export default function DayRail({ entries }: { entries: RailEntry[] }) {
  const nav = useNavigate();
  const nowMin = DEMO_TODAY.getHours() * 60 + DEMO_TODAY.getMinutes();
  const nowLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(DEMO_TODAY);

  // The now-rule belongs between the last thing past and the next thing due.
  const nextIdx = entries.findIndex((e) => minutesInto(e.ev.starts_at) >= nowMin);
  const nowAt = nextIdx === -1 ? entries.length : nextIdx;

  return (
    <div className="rail">
      <div className="rail-spine" aria-hidden="true" />

      {entries.map((entry, i) => (
        <div key={entry.ev.id}>
          {i === nowAt && <NowRule label={nowLabel} />}
          <RailRow entry={entry} past={minutesInto(entry.ev.starts_at) < nowMin} onOpen={() => nav('/event/' + entry.ev.id)} />
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
  const where = ev.rooms?.[0] ?? ev.location ?? '';
  const meta = [where, ev.owner].filter(Boolean).join(' · ');

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
    <button className={'rail-row rail-row-btn' + (past ? ' is-past' : '')} onClick={onOpen}>
      <div className="rail-time">{ev.all_day ? 'all day' : fmtTime(ev.starts_at)}</div>
      <div className="rail-body">
        <div className="rail-title">{ev.name}</div>
        {meta && <div className="rail-sub">{meta}</div>}
      </div>
    </button>
  );
}
