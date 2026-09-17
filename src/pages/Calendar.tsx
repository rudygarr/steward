import { useState } from 'react';
import DayRail, { type RailEntry } from '../components/DayRail';
import { useNavigate } from 'react-router-dom';
import {
  DEMO_TODAY,
  eventsOnDay,
  findConflicts,
  fmtDateLong,
  fmtDateShort,
  addDays,
  startOfWeek,
  dayKey,
  isMine,
} from '../lib/data';
import { blackoutForDate } from '../lib/calendar';
import { checkinState } from '../lib/checkin';
import { buildICS, downloadICS } from '../lib/ics';
import { useStore } from '../lib/store';
import { useSession } from '../lib/session';
import type { EventRec } from '../lib/types';

export default function Calendar() {
  const nav = useNavigate();
  const { db, addCalendarView, removeCalendarView } = useStore();
  const { user } = useSession();
  const [day, setDay] = useState<Date>(DEMO_TODAY);
  const [view, setView] = useState<'mine' | 'following' | 'school'>('school');
  const [folders, setFolders] = useState<string[]>([]); // room folders to include; [] = all
  const [hideNotices, setHideNotices] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Room → folder, and the distinct folder list for the filter chips.
  const roomFolder = new Map(db.rooms.map((r) => [r.name, r.folder]));
  const allFolders = [...new Set(db.rooms.map((r) => r.folder))].sort();

  // People this user follows (ids → names). An event "involves" a followed
  // person when they own it or are assigned to it — that's the overlay.
  const followedIds = new Set(user.following ?? []);
  const followedNames = new Set(db.people.filter((p) => followedIds.has(p.id)).map((p) => p.name));
  const involvesFollowed = (e: EventRec) =>
    (!!e.owner && followedNames.has(e.owner)) || (e.assignments?.some((a) => followedNames.has(a.person)) ?? false);

  // One predicate drives both the day list and the export, so what you see is
  // what you get out.
  const matchesFilters = (e: EventRec) => {
    if (view === 'mine' && !isMine(e, user.name)) return false;
    if (view === 'following' && !involvesFollowed(e)) return false;
    if (e.kind === 'notice') return !hideNotices; // FYI entries are toggled, not folder-filtered
    if (folders.length === 0) return true;
    return e.rooms.some((r) => {
      const f = roomFolder.get(r);
      return f != null && folders.includes(f);
    });
  };

  const dayEvents = eventsOnDay(db.events, day);
  const list = dayEvents.filter(matchesFilters);
  const conflicts = findConflicts(dayEvents);

  // The same rail as Home, carrying this page's richer per-event state. The
  // now-rule only belongs on today — on any other date there is no "now" to
  // draw, and showing one would be a lie.
  const isToday = dayKey(day) === dayKey(DEMO_TODAY);
  const clashOf = new Map<string, string>();
  for (const c of conflicts) {
    clashOf.set(c.a.id, c.b.name);
    clashOf.set(c.b.id, c.a.name);
  }
  const railEntries: RailEntry[] = list.map((e) => {
    const ci = checkinState(e, DEMO_TODAY);
    const extras: string[] = [];
    if (e.resources.length) extras.push(e.resources.join(', '));
    if (e.assignments?.length) extras.push(e.assignments.map((a) => a.role).join(', '));
    return {
      ev: e,
      clashWith: clashOf.get(e.id),
      struck: !!e.cancelled || ci === 'released',
      notice: e.kind === 'notice',
      followed: view !== 'following' && !e.cancelled && involvesFollowed(e),
      note: e.cancelled
        ? 'Cancelled'
        : ci === 'in'
          ? 'Checked in'
          : ci === 'noshow'
            ? 'No-show'
            : e.kind === 'notice'
              ? 'FYI'
              : e.status === 'Pending'
                ? 'Pending'
                : undefined,
      extras,
    };
  });
  const week = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(day), i));

  // Saved views available to this user: shared (seeded) + their own.
  const myViews = (db.calendarViews ?? []).filter((v) => v.shared || v.owner === user.name);
  const sameFolders = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const activeView = myViews.find((v) => v.scope === view && v.hideNotices === hideNotices && sameFolders(v.folders, folders));
  const filterCount = folders.length + (hideNotices ? 1 : 0);
  const isDefault = view === 'school' && filterCount === 0;

  function toggleFolder(f: string) {
    setFolders((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }
  function clearFilters() {
    setView('school');
    setFolders([]);
    setHideNotices(false);
  }
  function applyView(v: (typeof myViews)[number]) {
    setView(v.scope);
    setFolders(v.folders);
    setHideNotices(v.hideNotices);
  }
  function saveCurrentView() {
    const name = window.prompt('Name this view (e.g. "My theater week")');
    if (!name?.trim()) return;
    addCalendarView({ name: name.trim(), owner: user.name, scope: view, folders, hideNotices });
  }

  return (
    <>
      <div className="daynav">
        <button onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
          <i className="ti ti-chevron-left" />
        </button>
        <div className="label">{fmtDateLong(day)}</div>
        <button onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
          <i className="ti ti-chevron-right" />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {week.map((d) => {
          const active = dayKey(d) === dayKey(day);
          const has = eventsOnDay(db.events, d).length;
          return (
            <button
              key={dayKey(d)}
              onClick={() => setDay(d)}
              style={{
                flex: 1,
                border: '0.5px solid var(--border)',
                background: active ? 'var(--green)' : 'var(--surface)',
                color: active ? '#fff' : 'var(--text-1)',
                borderRadius: 'var(--r-md)',
                padding: '8px 0 7px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <span style={{ fontSize: 11, color: active ? 'rgba(255,255,255,.8)' : 'var(--text-3)' }}>
                {fmtDateShort(d).split(',')[0]}
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }} className="tnum">
                {new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', day: 'numeric' }).format(d)}
              </span>
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 50,
                  background: has ? (active ? 'var(--gold)' : 'var(--green)') : 'transparent',
                }}
              />
            </button>
          );
        })}
      </div>

      {/* ---- Saved views: recall a scope + folder + notice filter in one tap ---- */}
      <div className="view-bar">
        <button className={'view-chip' + (isDefault ? ' on' : '')} onClick={clearFilters}>
          All events
        </button>
        {myViews.map((v) => (
          <button key={v.id} className={'view-chip' + (activeView?.id === v.id ? ' on' : '')} onClick={() => applyView(v)}>
            {!v.shared && <i className="ti ti-user" style={{ fontSize: 12, marginRight: 4, opacity: 0.7 }} />}
            {v.name}
            {!v.shared && (
              <i
                className="ti ti-x view-chip-x"
                role="button"
                aria-label={`Delete ${v.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete the saved view "${v.name}"?`)) removeCalendarView(v.id);
                }}
              />
            )}
          </button>
        ))}
        <button className="view-chip view-chip-add" onClick={saveCurrentView}>
          <i className="ti ti-plus" /> Save
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: showFilters ? 10 : 14 }}>
        <div className="seg seg-sm" style={{ flex: 1 }}>
          <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>
            Yours
          </button>
          {followedNames.size > 0 && (
            <button
              className={view === 'following' ? 'active' : ''}
              onClick={() => setView('following')}
              title="People you follow"
              aria-label="People you follow"
              style={{ flex: '0 0 auto', paddingLeft: 14, paddingRight: 14 }}
            >
              <i className="ti ti-star-filled" style={{ fontSize: 14, color: view === 'following' ? undefined : 'var(--gold)' }} />
            </button>
          )}
          <button className={view === 'school' ? 'active' : ''} onClick={() => setView('school')}>
            School
          </button>
        </div>
        <button
          className={'btn-soft' + (filterCount ? ' active-filter' : '')}
          aria-label="Filters"
          style={{ padding: '0 12px' }}
          onClick={() => setShowFilters((v) => !v)}
        >
          <i className="ti ti-filter" />
          {filterCount > 0 && <span style={{ marginLeft: 4 }}>{filterCount}</span>}
        </button>
        <button
          className="btn-soft"
          aria-label="Export to calendar"
          style={{ padding: '0 12px' }}
          onClick={() => {
            const evs = db.events.filter((e) => e.starts_at && matchesFilters(e));
            const named = !isDefault;
            downloadICS(view === 'mine' ? 'my-wcs-calendar' : 'wcs-calendar', buildICS(evs, named ? `WCS — ${activeView?.name ?? 'Filtered'}` : 'WCS School Calendar'));
          }}
        >
          <i className="ti ti-calendar-down" />
        </button>
        <button className="fab" onClick={() => nav('/book?date=' + dayKey(day))}>
          <i className="ti ti-plus" /> Book
        </button>
      </div>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-head">
            <span>Spaces</span>
            {filterCount > 0 && (
              <button className="filter-clear" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
          <div className="view-bar" style={{ marginBottom: 10 }}>
            {allFolders.map((f) => (
              <button key={f} className={'chip' + (folders.includes(f) ? ' on' : '')} onClick={() => toggleFolder(f)}>
                {f}
              </button>
            ))}
          </div>
          <button className={'chip' + (hideNotices ? ' on' : '')} onClick={() => setHideNotices((v) => !v)}>
            <i className={'ti ' + (hideNotices ? 'ti-eye-off' : 'ti-eye')} style={{ fontSize: 13, marginRight: 5 }} />
            Hide FYI / notices
          </button>
        </div>
      )}

      {blackoutForDate(day) && (
        <div className="banner" style={{ background: 'var(--info-tint, var(--surface-2))', borderColor: 'var(--info)', color: 'var(--info)' }}>
          <i className="ti ti-calendar-off" />
          <span>
            <b>No school</b> — {blackoutForDate(day)!.label}.
          </span>
        </div>
      )}

      {list.length === 0 ? (
        <button
          className="rail-empty"
          style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => (filterCount ? clearFilters() : setView('school'))}
        >
          {view === 'mine' && filterCount === 0
            ? 'Nothing of yours this day — see school events \u2192'
            : view === 'following'
              ? 'No one you follow has events this day \u2192'
              : filterCount > 0
                ? 'Nothing matches this view — tap to clear filters'
                : 'Nothing scheduled this day.'}
        </button>
      ) : (
        <DayRail entries={railEntries} now={isToday ? DEMO_TODAY : null} />
      )}

      <div style={{ height: 16 }} />
    </>
  );
}
