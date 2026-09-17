import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useSession, initials, roleLabel } from '../lib/session';
import { canEditPerson, canToggleAdmin, canDeactivate, levelOf } from '../lib/access';
import { isMine, parse, fmtDateShort, fmtTime, statusColor, DEMO_TODAY } from '../lib/data';
import Modal, { primaryBtn } from '../components/Modal';
import type { PersonRec } from '../lib/types';

// One labelled access control. Disabled controls carry the reason in a tooltip
// and visually gray out — the courtesy layer; the server enforces for real.
function PermRow({
  label,
  hint,
  permit,
  children,
}: {
  label: string;
  hint?: string;
  permit: { ok: boolean; reason?: string };
  children: React.ReactNode;
}) {
  return (
    <div className="perm-row" title={permit.ok ? undefined : permit.reason}>
      <div>
        <div className="perm-label">{label}</div>
        {hint && <div className="perm-hint">{hint}</div>}
      </div>
      <div style={{ opacity: permit.ok ? 1 : 0.45, pointerEvents: permit.ok ? 'auto' : 'none' }}>{children}</div>
    </div>
  );
}

export default function PersonDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, updatePerson, reassignOwner } = useStore();
  const { user, setUser, role } = useSession();
  const [confirming, setConfirming] = useState(false);

  const target = db.people.find((p) => p.id === id);
  if (!target) return <div style={{ padding: 24 }}>Person not found.</div>;

  const isSelf = target.id === user.id;
  // Row-level security only accepts writes to `people` from an admin or
  // manager, so fold the real account's role in here. Without this the UI
  // would offer controls whose saves silently do nothing.
  const mayWritePeople = role === 'admin' || role === 'manager';
  const deny = { ok: false, reason: 'Your account does not have people-management rights.' };
  const editable = mayWritePeople ? canEditPerson(user, target) : deny;
  const adminPermit = mayWritePeople ? canToggleAdmin(user, target, db.people) : deny;
  const deactPermit = mayWritePeople ? canDeactivate(user, target, db.people) : deny;
  const inactive = target.active === false;

  const following = user.following ?? [];
  const isFollowing = following.includes(target.id);

  function set(patch: Partial<PersonRec>) {
    if (target) updatePerson(target.id, patch);
  }

  function toggleFollow() {
    if (!target) return;
    const next = isFollowing ? following.filter((x) => x !== target.id) : [...following, target.id];
    updatePerson(user.id, { following: next });
    setUser({ ...user, following: next });
  }

  // Their app calendar = events they own or are assigned to (never the public feed).
  const schedule = useMemo(() => {
    return db.events
      .filter((e) => e.source !== 'public' && e.starts_at && isMine(e, target.name))
      .filter((e) => parse(e.starts_at)!.getTime() >= DEMO_TODAY.getTime() - 86400000)
      .sort((a, b) => parse(a.starts_at)!.getTime() - parse(b.starts_at)!.getTime())
      .slice(0, 8);
  }, [db.events, target.name]);

  const ownedUpcoming = db.events.filter(
    (e) => e.owner === target.name && e.source !== 'public' && e.starts_at && parse(e.starts_at)!.getTime() >= DEMO_TODAY.getTime() - 86400000,
  );

  function deactivate(reassign: boolean) {
    if (!target) return;
    if (reassign) reassignOwner(target.name, user.name);
    set({ active: false });
    setConfirming(false);
  }

  return (
    <>
      <button className="back-link" onClick={() => nav('/people')}>
        <i className="ti ti-chevron-left" /> People
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '8px 0 20px' }}>
        <span className="avatar" style={{ width: 56, height: 56, fontSize: 20, opacity: inactive ? 0.5 : 1 }}>
          {initials(target.name)}
        </span>
        <div style={{ flex: 1 }}>
          <h1 className="page-h" style={{ margin: 0, fontSize: 26 }}>
            {target.name}
          </h1>
          <div className="page-sub" style={{ margin: '2px 0 0' }}>
            {roleLabel(target)}
            {target.resolves_conflicts ? ' · Conflict resolver' : ''}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{target.email}</div>
        </div>
        {inactive && <span className="pill" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>Deactivated</span>}
      </div>

      {!isSelf && (
        <button className="btn-soft" style={{ marginBottom: 22 }} onClick={toggleFollow}>
          <i className={'ti ' + (isFollowing ? 'ti-star-filled' : 'ti-star')} style={isFollowing ? { color: 'var(--gold)' } : undefined} />
          {isFollowing ? 'Following calendar' : 'Follow calendar'}
        </button>
      )}

      {/* ---- Access & permissions ---- */}
      <div className="section-h">Access &amp; permissions</div>
      {!editable.ok && (
        <div className="lock-note">
          <i className="ti ti-lock" /> {isSelf ? 'You can’t change your own access.' : editable.reason}
        </div>
      )}
      <div className="card">
        <PermRow label="Administrator" hint="Full control — approvals & people" permit={adminPermit}>
          <input type="checkbox" checked={target.site_admin} onChange={(e) => set({ site_admin: e.target.checked })} />
        </PermRow>
        <PermRow label="Conflict resolver" hint="Decides who wins a double-booking" permit={editable}>
          <input
            type="checkbox"
            checked={target.resolves_conflicts}
            onChange={(e) => set({ resolves_conflicts: e.target.checked })}
          />
        </PermRow>
        <PermRow label="Events" permit={editable}>
          <select className="perm-select" value={target.event} onChange={(e) => set({ event: e.target.value })}>
            <option>Viewer</option>
            <option>Creator</option>
            <option>Editor</option>
          </select>
        </PermRow>
        <PermRow label="Rooms" permit={editable}>
          <select className="perm-select" value={target.rooms} onChange={(e) => set({ rooms: e.target.value })}>
            <option>Viewer</option>
            <option>Editor</option>
          </select>
        </PermRow>
        <PermRow label="Resources" permit={editable}>
          <select className="perm-select" value={target.resources} onChange={(e) => set({ resources: e.target.value })}>
            <option>Viewer</option>
            <option>Editor</option>
          </select>
        </PermRow>
        <PermRow label="People" permit={editable}>
          <select className="perm-select" value={target.people} onChange={(e) => set({ people: e.target.value })}>
            <option>Viewer</option>
            <option>Editor</option>
          </select>
        </PermRow>
      </div>

      {/* ---- Their schedule ---- */}
      <div className="section-h" style={{ marginTop: 26 }}>
        Schedule
        <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: 13 }}> · app events only</span>
      </div>
      {schedule.length === 0 ? (
        <div style={{ padding: '16px 2px', color: 'var(--text-3)', fontSize: 14 }}>
          Nothing on {target.name.split(' ')[0]}’s calendar in the app yet.
        </div>
      ) : (
        <div className="list">
          {schedule.map((e, i) => (
            <div key={e.id}>
              {i > 0 && <div className="divider" />}
              <button className="space-row" onClick={() => nav('/event/' + e.id)}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: statusColor(e.status), marginRight: 8 }} />
                <span className="nm">{e.name}</span>
                <span className="meta">
                  {fmtDateShort(parse(e.starts_at)!)}
                  {!e.all_day && ` · ${fmtTime(e.starts_at)}`}
                </span>
                <i className="ti ti-chevron-right chev" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ---- Deactivate / reactivate ---- */}
      {levelOf(user) >= 1 && !isSelf && (
        <div style={{ marginTop: 30 }}>
          {inactive ? (
            <button className="btn-soft" onClick={() => set({ active: true })}>
              <i className="ti ti-user-check" /> Reactivate {target.name.split(' ')[0]}
            </button>
          ) : (
            <button
              className="btn-soft danger"
              title={deactPermit.ok ? undefined : deactPermit.reason}
              disabled={!deactPermit.ok}
              style={!deactPermit.ok ? { opacity: 0.45 } : undefined}
              onClick={() => setConfirming(true)}
            >
              <i className="ti ti-user-off" /> Deactivate {target.name.split(' ')[0]}
            </button>
          )}
        </div>
      )}

      {confirming && (
        <Modal title={`Deactivate ${target.name}?`} onClose={() => setConfirming(false)}>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 0 }}>
            They’ll keep their history but be hidden from pickers and can no longer sign in.
            {ownedUpcoming.length > 0 && (
              <>
                {' '}
                <strong>{target.name.split(' ')[0]} owns {ownedUpcoming.length} upcoming event{ownedUpcoming.length > 1 ? 's' : ''}.</strong>{' '}
                Reassign them so nothing falls through the cracks.
              </>
            )}
          </p>
          {ownedUpcoming.length > 0 ? (
            <>
              <button style={{ ...primaryBtn, marginTop: 4 }} onClick={() => deactivate(true)}>
                Reassign {ownedUpcoming.length} to me &amp; deactivate
              </button>
              <button className="btn-soft" style={{ width: '100%', marginTop: 10 }} onClick={() => deactivate(false)}>
                Deactivate &amp; leave events as-is
              </button>
            </>
          ) : (
            <button style={{ ...primaryBtn, marginTop: 4 }} onClick={() => deactivate(false)}>
              Deactivate
            </button>
          )}
        </Modal>
      )}
    </>
  );
}
