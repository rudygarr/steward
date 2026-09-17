import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useSession, initials, roleLabel } from '../lib/session';
import { canManagePeople, levelOf } from '../lib/access';
import AddStaff from '../components/AddStaff';

export default function People() {
  const { db } = useStore();
  const { user, role } = useSession();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const following = user.following ?? [];
  // Both must hold: the UI model says you may, AND the database will accept
  // it. `role` belongs to the signed-in account, so "view as" can't conjure
  // rights the server would refuse — it would just fail silently.
  const canAdd = canManagePeople(user) && (role === 'admin' || role === 'manager');
  const inactiveCount = db.people.filter((p) => p.active === false).length;
  const activeCount = db.people.length - inactiveCount;

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...db.people]
      .filter((p) => (showInactive ? p.active === false : p.active !== false))
      .filter((p) => !term || p.name.toLowerCase().includes(term) || roleLabel(p).toLowerCase().includes(term))
      .sort((a, b) => (a.site_admin === b.site_admin ? a.name.localeCompare(b.name) : a.site_admin ? -1 : 1));
  }, [db.people, q, showInactive]);

  return (
    <>
      <h1 className="page-h">People</h1>
      <div className="page-sub">{activeCount} staff with access</div>

      <div className="search-wrap" style={{ marginBottom: 14 }}>
        <i className="ti ti-search" />
        <input
          className="search"
          placeholder="Search staff or role"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {canAdd && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <button className="btn-soft" onClick={() => setAdding(true)}>
            <i className="ti ti-user-plus" /> Add person
          </button>
        </div>
      )}

      <div className="list">
        {list.map((p, i) => (
          <div key={p.id}>
            {i > 0 && <div className="divider" style={{ marginLeft: 58 }} />}
            <button className="space-row" onClick={() => nav('/person/' + p.id)}>
              <span className="avatar" style={{ width: 34, height: 34, opacity: p.active === false ? 0.45 : 1 }}>
                {initials(p.name)}
              </span>
              <span className="nm" style={p.active === false ? { color: 'var(--text-3)' } : undefined}>
                {p.name}
                {following.includes(p.id) && (
                  <i className="ti ti-star-filled" style={{ color: 'var(--gold)', fontSize: 13, marginLeft: 7 }} />
                )}
              </span>
              <span className="meta">
                {roleLabel(p)}
                {p.resolves_conflicts ? ' · resolver' : ''}
              </span>
              <i className="ti ti-chevron-right chev" />
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <div style={{ padding: '22px 16px', color: 'var(--text-3)', fontSize: 14 }}>No one matches “{q}”.</div>
        )}
      </div>

      {inactiveCount > 0 && (
        <button
          className="add-row"
          style={{ color: 'var(--text-3)', marginTop: 14 }}
          onClick={() => setShowInactive((v) => !v)}
        >
          <i className={'ti ' + (showInactive ? 'ti-eye-off' : 'ti-eye')} />{' '}
          {showInactive ? 'Hide deactivated' : `Show ${inactiveCount} deactivated`}
        </button>
      )}

      {adding && <AddStaff canMakeAdmin={levelOf(user) === 2} onClose={() => setAdding(false)} />}
    </>
  );
}
