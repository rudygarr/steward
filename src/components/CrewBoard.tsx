import { useState } from 'react';
import { useStore } from '../lib/store';
import { useSession, initials } from '../lib/session';
import {
  coverage, coverageLabel, coverageTone, qualifiedFor, blockoutForEvent,
  eventCrew, teamsOnEvent,
} from '../lib/crew';
import Modal from './Modal';
import type { EventRec, CrewAssignment, CrewStatus, CrewTeam } from '../lib/types';

const STATUS_META: Record<CrewStatus, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'cb-open' },
  requested: { label: 'Requested', cls: 'cb-pending' },
  accepted: { label: 'Accepted', cls: 'cb-ok' },
  declined: { label: 'Declined', cls: 'cb-declined' },
  self: { label: 'Self', cls: 'cb-ok' },
};

// The assign picker — qualified members for one open slot, each flagged if
// they're blocked that day (soft warning, accept-to-override; never a block).
function AssignPicker({ ev, assignment, onClose }: { ev: EventRec; assignment: CrewAssignment; onClose: () => void }) {
  const { db, assignCrew } = useStore();
  const { user } = useSession();
  const cands = qualifiedFor(db, ev.id, assignment.positionId);
  const pos = db.crewPositions?.find((p) => p.id === assignment.positionId);
  function pick(personId: string) {
    const blk = blockoutForEvent(db, personId, ev);
    const person = db.people.find((p) => p.id === personId);
    if (blk && !confirm(`${person?.name?.split(' ')[0] ?? 'They'} blocked ${blk.start}${blk.reason ? ` — ${blk.reason}` : ''}. Request anyway?`)) return;
    assignCrew(assignment.id, personId, 'request');
    onClose();
  }
  return (
    <Modal title={`Staff — ${pos?.name ?? 'position'}`} onClose={onClose}>
      <div className="cb-pick-sub">Qualified team members. Sending a request pings them to accept or decline.</div>
      {cands.length === 0 && <div className="empty" style={{ margin: 10 }}>No other qualified member is free for this slot.</div>}
      <div className="cb-pick-list">
        {cands.map((m) => {
          const p = db.people.find((x) => x.id === m.personId);
          if (!p) return null;
          const blk = blockoutForEvent(db, m.personId, ev);
          const isMe = p.id === user.id;
          return (
            <div key={m.id} className="cb-pick-row">
              <span className="avatar sm">{initials(p.name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div className="cb-pick-name">{p.name}{isMe ? ' (you)' : ''}</div>
                {blk && <div className="cb-blk"><i className="ti ti-alert-triangle" /> Blocked {blk.start}{blk.reason ? ` · ${blk.reason}` : ''}</div>}
              </span>
              {isMe ? (
                <button className="btn-soft sm" onClick={() => { assignCrew(assignment.id, p.id, 'self'); onClose(); }}>
                  Place myself
                </button>
              ) : (
                <button className="btn-soft sm" onClick={() => pick(p.id)}>Request</button>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// Pick a template to stamp onto the event (grouped by team).
function TemplateMenu({ ev, onClose }: { ev: EventRec; onClose: () => void }) {
  const { db, applyPositionTemplate } = useStore();
  const teams = db.crewTeams ?? [];
  return (
    <Modal title="Add a crew team" onClose={onClose}>
      <div className="cb-pick-sub">Stamp a ready-made set of positions onto this event, then staff each one.</div>
      {teams.map((t) => {
        const tpls = (db.positionTemplates ?? []).filter((x) => x.teamId === t.id);
        if (!tpls.length) return null;
        return (
          <div key={t.id} className="cb-tpl-group">
            <div className="cb-tpl-team"><i className={'ti ' + (t.icon ?? 'ti-users-group')} /> {t.name}</div>
            <div className="cb-tpl-grid">
              {tpls.map((tpl) => (
                <button key={tpl.id} className="cb-tpl-card" onClick={() => { applyPositionTemplate(ev.id, tpl.id); onClose(); }}>
                  <i className={'ti ' + (tpl.icon ?? 'ti-stack-2')} />
                  <span>{tpl.name}</span>
                  <span className="cb-tpl-n">{tpl.positionIds.length} pos.</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

function TeamSection({ ev, team, canManage }: { ev: EventRec; team: CrewTeam; canManage: boolean }) {
  const { db, respondCrew, removeCrewAssignment, assignCrew } = useStore();
  const { user } = useSession();
  const [picking, setPicking] = useState<CrewAssignment | null>(null);
  const cov = coverage(db, ev.id, team.id);
  const rows = eventCrew(db, ev.id, team.id);
  const posById = new Map((db.crewPositions ?? []).map((p) => [p.id, p]));
  // Sort by the position's own sort order, then assignment id for stable slots.
  const sorted = [...rows].sort((a, b) => (posById.get(a.positionId)?.sort ?? 0) - (posById.get(b.positionId)?.sort ?? 0) || a.id.localeCompare(b.id));
  // Can the current user place THEMSELVES on an open slot of this position?
  const iQualify = (positionId: string) =>
    (db.crewMembers ?? []).some((m) => m.teamId === team.id && m.personId === user.id && m.positionIds.includes(positionId));

  return (
    <div className="cb-team">
      <div className="cb-team-head">
        <span className="cb-team-name"><i className={'ti ' + (team.icon ?? 'ti-users-group')} /> {team.name}</span>
        <span className={'cb-cov ' + coverageTone(cov)}>{coverageLabel(cov)}</span>
      </div>
      <div className="cb-rows">
        {sorted.map((a) => {
          const pos = posById.get(a.positionId);
          const person = a.personId ? db.people.find((p) => p.id === a.personId) : null;
          const meta = STATUS_META[a.status];
          const open = a.status === 'open' || a.status === 'declined';
          const blk = person ? blockoutForEvent(db, person.id, ev) : null;
          const mineToAnswer = a.status === 'requested' && a.personId === user.id;
          return (
            <div key={a.id} className="cb-row">
              <span className="cb-pos">{pos?.name ?? 'Position'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {person ? (
                  <span className="cb-person">
                    <span className="avatar sm">{initials(person.name)}</span>
                    <span className="cb-person-name">{person.name}{a.personId === user.id ? ' (you)' : ''}</span>
                    {blk && <i className="ti ti-alert-triangle cb-blk-ic" title={`Blocked ${blk.start}${blk.reason ? ' — ' + blk.reason : ''}`} />}
                  </span>
                ) : (
                  <span className="cb-empty-slot">Unfilled</span>
                )}
              </span>
              <span className={'cb-chip ' + meta.cls}>{meta.label}</span>
              {mineToAnswer ? (
                <span className="cb-actions">
                  <button className="cb-yes" onClick={() => respondCrew(a.id, true)}>Accept</button>
                  <button className="cb-no" onClick={() => respondCrew(a.id, false)}>Decline</button>
                </span>
              ) : open ? (
                <span className="cb-actions">
                  {iQualify(a.positionId) && (
                    <button className="cb-self" title="Place myself" onClick={() => assignCrew(a.id, user.id, 'self')}>
                      <i className="ti ti-user-check" />
                    </button>
                  )}
                  {canManage && (
                    <button className="cb-assign" onClick={() => setPicking(a)}>Assign</button>
                  )}
                  {canManage && (
                    <button className="cb-x" title="Remove slot" onClick={() => removeCrewAssignment(a.id)}>
                      <i className="ti ti-x" />
                    </button>
                  )}
                </span>
              ) : canManage ? (
                <button className="cb-x" title="Remove" onClick={() => removeCrewAssignment(a.id)}>
                  <i className="ti ti-x" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {picking && <AssignPicker ev={ev} assignment={picking} onClose={() => setPicking(null)} />}
    </div>
  );
}

export default function CrewBoard({ ev }: { ev: EventRec }) {
  const { db } = useStore();
  const { user } = useSession();
  const [menu, setMenu] = useState(false);
  const teamIds = teamsOnEvent(db, ev.id);
  const teams = (db.crewTeams ?? []).filter((t) => teamIds.includes(t.id));
  // Who can staff: admins, conflict resolvers, the event owner, or a team lead.
  const isLead = (db.crewTeams ?? []).some((t) => t.leaderPersonId === user.id);
  const canManage = user.site_admin || user.resolves_conflicts || ev.owner === user.name || isLead;

  // Zero footprint until summoned: just the one quiet affordance.
  if (teams.length === 0) {
    if (!canManage) return null;
    return (
      <>
        <button className="rs-add" onClick={() => setMenu(true)}>
          <i className="ti ti-users-group" /> Add crew team
        </button>
        {menu && <TemplateMenu ev={ev} onClose={() => setMenu(false)} />}
      </>
    );
  }

  return (
    <div className="cb">
      <div className="cb-head">
        <span className="lbl"><i className="ti ti-users-group" /> Crew</span>
        {canManage && (
          <button className="cb-add" onClick={() => setMenu(true)}><i className="ti ti-plus" /> Add team</button>
        )}
      </div>
      {teams.map((t) => (
        <TeamSection key={t.id} ev={ev} team={t} canManage={canManage} />
      ))}
      {menu && <TemplateMenu ev={ev} onClose={() => setMenu(false)} />}
    </div>
  );
}
