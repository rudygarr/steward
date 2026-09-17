import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEMO_TODAY, eventsOnDay, findConflicts, fmtTime, isMine } from '../lib/data';
import { useStore } from '../lib/store';
import { useSession } from '../lib/session';
import { assignedToMe, canWorkPool } from '../lib/fulfill';
import { itGlyph } from '../data/it-problem-types';
import { statusTint, priorityColor } from './Queue';
import type { Department, PersonRec, WorkItem } from '../lib/types';
import { allConflicts, CONFLICT_ICON } from '../lib/conflicts';
import { pendingForApprover } from '../lib/approvals';
import { pmDueCount } from '../lib/assets';
import { checkinState } from '../lib/checkin';
import { rentalFollowups, uncollectedTotal, money } from '../lib/rentals';
import { pendingForPerson } from '../lib/crew';
import { pendingInviteCount } from '../lib/invites';
import { isSectionHidden } from '../lib/dashboard';
import Shortcuts from '../components/Shortcuts';
import DayRail, { type RailEntry } from '../components/DayRail';
import DashboardCustomizer from '../components/DashboardCustomizer';

const tiles = [
  { cls: 't-book', icon: 'ti-calendar-plus', label: 'Book', to: '/book' },
  { cls: 't-maint', icon: 'ti-tool', label: 'Maintenance', to: '/requests?door=maintenance' },
  { cls: 't-it', icon: 'ti-device-laptop', label: 'IT', to: '/requests?door=it' },
  { cls: 't-ath', icon: 'ti-ball-basketball', label: 'Athletics', to: '/athletics' },
  { cls: 't-visit', icon: 'ti-id', label: 'Visitor', to: '/requests?door=visitor' },
];

const DEPT_META: Record<Department, { icon: string; cls: string; noun: string }> = {
  Maintenance: { icon: 'ti-tool', cls: 't-maint', noun: 'work orders' },
  IT: { icon: 'ti-device-laptop', cls: 't-it', noun: 'tickets' },
  Transportation: { icon: 'ti-bus', cls: 't-ath', noun: 'trips' },
};
const STATUS_RANK: Record<string, number> = { New: 0, Assigned: 1, Scheduled: 2, 'In progress': 3, Done: 4 };
const PRIO_RANK: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

// The role-aware lead block: department staff land on their pool, not a generic
// calendar — "it's their daily job." IT gets the full shared-pool treatment
// (emergencies pinned, one-tap "Assign to me"); other departments get the same
// triage board, gated to leads. The calendar drops to a secondary strip below.
function PoolHero({ dept, user }: { dept: Department; user: PersonRec }) {
  const nav = useNavigate();
  const { db, updateWorkItem } = useStore();
  const meta = DEPT_META[dept];
  const canWork = canWorkPool(user, dept);

  const open = db.workItems
    .filter((w) => !w.withdrawn && w.department === dept && w.status !== 'Done')
    .sort((a, b) => {
      if (!!b.emergency !== !!a.emergency) return a.emergency ? -1 : 1;
      const sr = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      if (sr !== 0) return sr;
      const pr = (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9);
      if (pr !== 0) return pr;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  const unassigned = open.filter((w) => !w.assignee && !w.trip).length;
  const emergencies = open.filter((w) => w.emergency).length;

  function grab(w: WorkItem) {
    updateWorkItem(w.id, { assignee: user.name, status: w.status === 'New' ? 'Assigned' : w.status });
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <button
        className="row"
        onClick={() => nav('/queue?dept=' + dept)}
        style={{ width: '100%', background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--r-lg) var(--r-lg) 0 0', padding: '14px 16px' }}
      >
        <span className={'tile-icon ' + meta.cls} style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
          <i className={'ti ' + meta.icon} />
        </span>
        <span className="body">
          <span className="title">{dept === 'IT' ? 'IT ticket pool' : dept + ' queue'}</span>
          <span className="sub">
            {open.length} open · {unassigned} unassigned
            {emergencies > 0 ? ` · ${emergencies} emergency` : ''}
          </span>
        </span>
        <i className="ti ti-chevron-right chev" />
      </button>

      <div className="list" style={{ borderRadius: '0 0 var(--r-lg) var(--r-lg)', borderTop: 'none' }}>
        {open.length === 0 && <div className="empty">Nothing open — pool's clear.</div>}
        {open.slice(0, 5).map((w, i) => {
          const icon = dept === 'IT' ? itGlyph(w.type) : meta.icon;
          const canGrab = canWork && !w.assignee && !w.trip;
          return (
            <div key={w.id}>
              {i > 0 && <div className="divider" style={{ marginLeft: 16 }} />}
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button className="row" onClick={() => nav('/work/' + w.id)} style={{ flex: 1, minWidth: 0, background: 'none', alignItems: 'flex-start' }}>
                  <span className={'tile-icon ' + meta.cls} style={{ width: 32, height: 32, borderRadius: 9, fontSize: 16, flexShrink: 0, marginTop: 2 }}>
                    <i className={'ti ' + icon} />
                  </span>
                  <span className="body">
                    <span className="title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {w.emergency && <i className="ti ti-alert-triangle-filled" style={{ color: 'var(--bad)', fontSize: 14 }} />}
                      {!w.emergency && w.priority !== 'Normal' && w.priority !== 'Low' && (
                        <span className="dot" style={{ background: priorityColor(w.priority), width: 7, height: 7 }} />
                      )}
                      {w.title}
                    </span>
                    <span className="sub">
                      {w.type}
                      {w.location ? ' · ' + w.location : ''}
                      {w.assignee ? ' · ' + w.assignee : ''}
                    </span>
                  </span>
                </button>
                {canGrab ? (
                  <button
                    onClick={() => grab(w)}
                    style={{ flexShrink: 0, marginRight: 12, padding: '6px 11px', borderRadius: 999, border: 'none', background: 'var(--green-tint)', color: 'var(--green)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Assign to me
                  </button>
                ) : (
                  <span className="pill" style={{ flexShrink: 0, marginRight: 12, background: 'color-mix(in srgb, ' + statusTint(w.status) + ' 14%, transparent)', color: statusTint(w.status), fontSize: 11.5 }}>
                    {w.status}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {open.length > 5 && (
          <button className="cc-more" style={{ width: '100%' }} onClick={() => nav('/queue?dept=' + dept)}>
            +{open.length - 5} more in the pool
          </button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const nav = useNavigate();
  const { user } = useSession();
  const { db, checkInEvent } = useStore();
  const [view, setView] = useState<'mine' | 'school'>('school');
  const [showCustomize, setShowCustomize] = useState(false);
  // Read the live person so saved dashboard prefs are reflected (the session
  // user is a static snapshot).
  const me = db.people.find((p) => p.id === user.id) ?? user;
  const prefs = me.dashboard;
  const today = eventsOnDay(db.events, DEMO_TODAY);
  const mine = today.filter((e) => isMine(e, user.name));
  const shown = view === 'mine' ? mine : today;
  const conflicts = findConflicts(today);
  const liveConflicts = allConflicts(db);
  const pendingCount = db.events.filter((e) => e.status === 'Pending' && !e.withdrawn && !e.cancelled).length;
  const openWork = (dept: string) => db.workItems.filter((w) => !w.withdrawn && w.department === dept && w.status !== 'Done').length;
  const myTasks = db.workItems.filter((w) => !w.withdrawn && w.status !== 'Done' && assignedToMe(w, user)).length;
  const myOpenReqs =
    db.workItems.filter((w) => !w.withdrawn && w.requestedBy === user.name && w.status !== 'Done').length +
    db.events.filter((e) => e.owner === user.name && e.kind !== 'notice' && e.status === 'Pending' && !e.withdrawn).length;
  const myApprovals = pendingForApprover(db, user.name).length;
  const myCrewRequests = pendingForPerson(db, user.id).length;
  const hasTeams = (db.crewTeams ?? []).length > 0;
  const hasPrograms = (db.programs ?? []).length > 0;
  const myInviteCount = pendingInviteCount(db, user.id);
  const canSeePM = user.site_admin || user.department === 'Maintenance';
  const pmDue = pmDueCount(db);
  // Check-in: my bookings happening now that still need confirmation.
  const myCheckins = mine.filter((e) => e.owner === user.name && checkinState(e, DEMO_TODAY) === 'open');
  // No-shows today an admin/resolver can reclaim.
  const canManageNoShows = user.site_admin || user.resolves_conflicts;
  const noShows = today.filter((e) => checkinState(e, DEMO_TODAY) === 'noshow');
  // External facility rentals needing attention (COI/deposit/invoice).
  const rentFollowups = user.site_admin ? rentalFollowups(db).length : 0;
  const rentUncollected = uncollectedTotal(db);
  const deptQueues = [
    { id: 'Maintenance', icon: 'ti-tool', cls: 't-maint' },
    { id: 'IT', icon: 'ti-device-laptop', cls: 't-it' },
    { id: 'Transportation', icon: 'ti-bus', cls: 't-ath' },
  ];
  const needs = pendingCount + conflicts.length;

  // The rail is the lead: today's events in time order, each carrying the
  // clash it's part of so the collision is shown where it happens rather
  // than summarised in a separate card.
  const clashOf = new Map<string, string>();
  for (const c of conflicts) {
    clashOf.set(c.a.id, c.b.name);
    clashOf.set(c.b.id, c.a.name);
  }
  const railEntries: RailEntry[] = shown.map((ev) => ({ ev, clashWith: clashOf.get(ev.id) }));
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(DEMO_TODAY);
  const dayStamp = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' })
    .format(DEMO_TODAY)
    .toUpperCase();

  return (
    <>
      {/* The day states itself: weekday large, the count of what matters as
          numerals. A greeting is pleasant but it isn't information. */}
      <div className="day-head">
        <div className="day-line">
          <h1 className="day-weekday">{weekday}</h1>
          <span className="day-date">{dayStamp}</span>
        </div>
        <div className="day-stats">
          <button className="stat" onClick={() => nav('/calendar')}>
            <span className="stat-n">{today.length}</span>
            <span className="stat-l">events</span>
          </button>
          {liveConflicts.length > 0 && (
            <button className="stat is-alert" onClick={() => nav('/calendar')}>
              <span className="stat-n">{liveConflicts.length}</span>
              <span className="stat-l">conflicts</span>
            </button>
          )}
          <button className="stat" onClick={() => nav('/approvals')}>
            <span className="stat-n">{pendingCount}</span>
            <span className="stat-l">to approve</span>
          </button>
        </div>
      </div>

      {!isSectionHidden(prefs, 'today') && (
        <>
          <div className="rail-scope">
            <button className={view === 'school' ? 'active' : ''} onClick={() => setView('school')}>
              Whole campus
            </button>
            <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')}>
              Yours
            </button>
            <span className="rail-scope-sep" />
            <button className="rail-scope-all" onClick={() => nav('/calendar')}>Calendar</button>
          </div>
          <DayRail entries={railEntries} />
        </>
      )}

      <Shortcuts prefs={prefs} onCustomize={() => setShowCustomize(true)} />

      {/* Role-aware lead: department staff open straight onto their pool. */}
      {user.department && <PoolHero dept={user.department} user={user} />}

      {liveConflicts.length > 0 && (
        <div className="conflict-card" style={{ marginBottom: 26 }}>
          <div className="cc-head">
            <i className={'ti ' + CONFLICT_ICON} />
            <span>
              {liveConflicts.length} scheduling conflict{liveConflicts.length === 1 ? '' : 's'} need a look
            </span>
          </div>
          {liveConflicts.slice(0, 4).map((c) => (
            <button key={c.id} className="cc-row" onClick={() => nav(c.link)}>
              <span className="cc-kind">{c.kind === 'trip' ? 'Trip' : 'Room'}</span>
              <span className="cc-body">
                <span className="cc-title">{c.title}</span>
                <span className="cc-detail">{c.detail}</span>
              </span>
              <i className="ti ti-chevron-right chev" />
            </button>
          ))}
          {liveConflicts.length > 4 && (
            <button className="cc-more" onClick={() => nav('/calendar')}>
              +{liveConflicts.length - 4} more
            </button>
          )}
        </div>
      )}

      {myCheckins.length > 0 && (
        <div className="ci-card ci-open" style={{ marginTop: 0, marginBottom: 16 }}>
          <button
            className="ci-text"
            onClick={() => nav('/event/' + myCheckins[0].id)}
            style={{ textAlign: 'left', background: 'none', border: 'none', padding: 0 }}
          >
            <span className="ci-title"><i className="ti ti-map-pin-check" /> Check in to your space</span>
            <span className="ci-sub">
              {myCheckins[0].name} · {fmtTime(myCheckins[0].starts_at)}
              {myCheckins.length > 1 ? ` · +${myCheckins.length - 1} more` : ''}
            </span>
          </button>
          <button className="ci-btn ci-btn-go" onClick={() => checkInEvent(myCheckins[0].id)}>
            <i className="ti ti-check" /> Check in
          </button>
        </div>
      )}

      {canManageNoShows && noShows.length > 0 && (
        <button
          className="row"
          onClick={() => nav(noShows.length === 1 ? '/event/' + noShows[0].id : '/calendar')}
          style={{ width: '100%', background: 'var(--warn-tint)', border: '0.5px solid var(--warn)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-ath" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0, background: 'var(--warn)' }}>
            <i className="ti ti-user-x" />
          </span>
          <span className="body">
            <span className="title" style={{ color: 'var(--warn)' }}>No-shows today</span>
            <span className="sub">
              {noShows.length} booking{noShows.length === 1 ? '' : 's'} with no check-in — reclaim the slot{noShows.length === 1 ? '' : 's'}
            </span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      <div className="tiles" style={{ marginBottom: 30 }}>
        {tiles.map((t) => (
          <button key={t.label} className="tile" onClick={() => nav(t.to)}>
            <span className={'tile-icon ' + t.cls}>
              <i className={'ti ' + t.icon} />
            </span>
            <span className="tile-label">{t.label}</span>
          </button>
        ))}
      </div>


      {myTasks > 0 && (
        <button
          className="row"
          onClick={() => nav('/queue?mine=1')}
          style={{ width: '100%', background: 'var(--green-tint)', border: '0.5px solid var(--green)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-ath" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
            <i className="ti ti-user-check" />
          </span>
          <span className="body">
            <span className="title" style={{ color: 'var(--green)' }}>Assigned to you</span>
            <span className="sub">{myTasks} task{myTasks === 1 ? '' : 's'} on your plate</span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      {myApprovals > 0 && (
        <button
          className="row"
          onClick={() => nav('/approvals')}
          style={{ width: '100%', background: 'var(--warn-tint)', border: '0.5px solid var(--warn)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-maint" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
            <i className="ti ti-stamp" />
          </span>
          <span className="body">
            <span className="title" style={{ color: 'var(--warn)' }}>Awaiting your approval</span>
            <span className="sub">{myApprovals} booking{myApprovals === 1 ? '' : 's'} routed to you</span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      {canSeePM && pmDue.overdue + pmDue.soon > 0 && (
        <button
          className="row"
          onClick={() => nav('/assets')}
          style={{ width: '100%', background: pmDue.overdue > 0 ? 'color-mix(in srgb, var(--bad) 9%, transparent)' : 'var(--warn-tint)', border: '0.5px solid ' + (pmDue.overdue > 0 ? 'var(--bad)' : 'var(--warn)'), borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-maint" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
            <i className="ti ti-tools" />
          </span>
          <span className="body">
            <span className="title" style={{ color: pmDue.overdue > 0 ? 'var(--bad)' : 'var(--warn)' }}>Preventive maintenance</span>
            <span className="sub">
              {pmDue.overdue > 0 ? `${pmDue.overdue} overdue` : ''}
              {pmDue.overdue > 0 && pmDue.soon > 0 ? ' · ' : ''}
              {pmDue.soon > 0 ? `${pmDue.soon} due soon` : ''}
            </span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      {user.site_admin && rentFollowups > 0 && (
        <button
          className="row"
          onClick={() => nav('/rentals')}
          style={{ width: '100%', background: 'var(--warn-tint)', border: '0.5px solid var(--warn)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-rental" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
            <i className="ti ti-building-community" />
          </span>
          <span className="body">
            <span className="title" style={{ color: 'var(--warn)' }}>Facility rentals</span>
            <span className="sub">
              {rentFollowups} need follow-up{rentUncollected > 0 ? ` · ${money(rentUncollected)} uncollected` : ''}
            </span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      {myCrewRequests > 0 && (
        <button
          className="row"
          onClick={() => nav('/my-schedule')}
          style={{ width: '100%', background: 'var(--green-tint)', border: '0.5px solid var(--green)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-book" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0, background: 'var(--green)' }}>
            <i className="ti ti-users-group" />
          </span>
          <span className="body">
            <span className="title" style={{ color: 'var(--green)' }}>Serving requests</span>
            <span className="sub">{myCrewRequests} waiting on your Accept / Decline</span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      {myInviteCount > 0 && (
        <button
          className="row"
          onClick={() => nav('/invites')}
          style={{ width: '100%', background: 'var(--green-tint)', border: '0.5px solid var(--green)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-book" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0, background: 'var(--green)' }}>
            <i className="ti ti-mail" />
          </span>
          <span className="body">
            <span className="title" style={{ color: 'var(--green)' }}>Invitations</span>
            <span className="sub">{myInviteCount} waiting on your RSVP</span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      {hasTeams && (
        <button
          className="row"
          onClick={() => nav('/teams')}
          style={{ width: '100%', background: 'var(--surface)', border: '0.5px solid var(--border-2)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-book" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
            <i className="ti ti-users-group" />
          </span>
          <span className="body">
            <span className="title">Teams</span>
            <span className="sub">Worship &amp; production crews — coverage and rosters</span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      {hasPrograms && (
        <button
          className="row"
          onClick={() => nav('/programs')}
          style={{ width: '100%', background: 'var(--surface)', border: '0.5px solid var(--border-2)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-book" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
            <i className="ti ti-layout-grid" />
          </span>
          <span className="body">
            <span className="title">Programs</span>
            <span className="sub">Multi-session events — festivals, conferences, rentals</span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      <button
        className="row"
        onClick={() => nav('/security')}
        style={{ width: '100%', background: 'var(--surface)', border: '0.5px solid var(--border-2)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
      >
        <span className="tile-icon t-book" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
          <i className="ti ti-shield-half" />
        </span>
        <span className="body">
          <span className="title">Security &amp; visitors</span>
          <span className="sub">Gate coverage, expected guests, after-hours flags, visitor log</span>
        </span>
        <i className="ti ti-chevron-right chev" />
      </button>

      {myOpenReqs > 0 && (
        <button
          className="row"
          onClick={() => nav('/my')}
          style={{ width: '100%', background: 'var(--surface)', border: '0.5px solid var(--border-2)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 16 }}
        >
          <span className="tile-icon t-book" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18, flexShrink: 0 }}>
            <i className="ti ti-clipboard-list" />
          </span>
          <span className="body">
            <span className="title">Your requests</span>
            <span className="sub">{myOpenReqs} in progress — track status</span>
          </span>
          <i className="ti ti-chevron-right chev" />
        </button>
      )}

      {!isSectionHidden(prefs, 'queues') && <>
      <div className="section-label">
        <span className="lbl">Work queues</span>
        <span className="act" onClick={() => nav('/queue')} style={{ cursor: 'pointer' }}>
          Open
        </span>
      </div>
      <div className="list" style={{ marginBottom: 24 }}>
        {deptQueues.map((d, i) => (
          <div key={d.id}>
            {i > 0 && <div className="divider" style={{ marginLeft: 16 }} />}
            <button className="row" onClick={() => nav('/queue?dept=' + d.id)}>
              <span className={'tile-icon ' + d.cls} style={{ width: 34, height: 34, borderRadius: 10, fontSize: 17, flexShrink: 0 }}>
                <i className={'ti ' + d.icon} />
              </span>
              <span className="body">
                <span className="title">{d.id}</span>
                <span className="sub">{openWork(d.id)} open request{openWork(d.id) === 1 ? '' : 's'}</span>
              </span>
              <i className="ti ti-chevron-right chev" />
            </button>
          </div>
        ))}
      </div>
      </>}

      {!isSectionHidden(prefs, 'stats') && <div className="widgets" style={{ marginBottom: 24 }}>
        <button className="widget" onClick={() => nav('/calendar')}>
          <div className="widget-top">
            <span>Needs you</span>
            <i className="ti ti-flag-3" style={{ color: 'var(--warn)', fontSize: 16 }} />
          </div>
          <div className="widget-num">{needs}</div>
          <div className="widget-sub">
            {pendingCount} approvals · {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
          </div>
        </button>
        {user.site_admin || user.resolves_conflicts || user.department ? (
          <button className="widget" onClick={() => nav('/insights')}>
            <div className="widget-top">
              <span>Insights</span>
              <i className="ti ti-chart-bar" style={{ color: 'var(--green)', fontSize: 16 }} />
            </div>
            <div className="widget-num">{db.events.filter((e) => e.kind !== 'notice').length}</div>
            <div className="widget-sub">bookings · usage &amp; turnaround →</div>
          </button>
        ) : (
          <div className="widget">
            <div className="widget-top">
              <span>School open</span>
              <span className="dot" style={{ background: 'var(--ok)' }} />
            </div>
            <div className="widget-num tnum">
              7:30<span style={{ fontSize: 17, color: 'var(--text-3)' }}>–4:00</span>
            </div>
            <div className="widget-sub">2 guards on duty</div>
          </div>
        )}
      </div>}

      <div className="statstrip">
        <span>
          <b>{db.rooms.length}</b> rooms
        </span>
        <span>
          <b>{db.resources.length}</b> resources
        </span>
        <span>
          <b>{db.people.length}</b> staff
        </span>
        <span>
          <b>{db.events.length}</b> events
        </span>
      </div>

      {showCustomize && <DashboardCustomizer prefs={prefs} onClose={() => setShowCustomize(false)} />}
    </>
  );
}
