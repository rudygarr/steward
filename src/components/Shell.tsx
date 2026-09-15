import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useSession, initials, roleLabel } from '../lib/session';
import { levelOf } from '../lib/access';
import AddStaff from './AddStaff';
import { DeliveryPreview, NotifSettings } from './NotifExtras';
import { CHANNEL_META } from '../lib/notify';
import type { ReactNode } from 'react';
import type { Notif } from '../lib/types';
import helmetMark from '../assets/brand/warrior-helmet.png';

function RoleSwitcher() {
  const { user, setUser, signOut } = useSession();
  const { db, reset } = useStore();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const sorted = [...db.people]
    .filter((p) => p.active !== false)
    .sort((a, b) => (a.site_admin === b.site_admin ? a.name.localeCompare(b.name) : a.site_admin ? -1 : 1));
  return (
    <>
      <button className="userchip" onClick={() => setOpen(true)} aria-label="Switch user">
        <span>{user.name}</span>
        <span className="avatar">{initials(user.name)}</span>
      </button>
      {open && (
        <div className="switch-backdrop" onClick={() => setOpen(false)}>
          <div className="switch-panel" onClick={(e) => e.stopPropagation()}>
            <div className="switch-account">
              <div className="switch-account-who">
                <div className="switch-account-label">Signed in as</div>
                <div className="switch-account-email">{user.email || user.name}</div>
              </div>
              <button
                className="switch-signout"
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
              >
                <i className="ti ti-logout" /> Sign out
              </button>
            </div>
            <div className="switch-head">
              Viewing the app as another staff member changes what you see — it
              doesn&rsquo;t change who you&rsquo;re signed in as.
            </div>
            <button
              className="add-row"
              onClick={() => {
                setOpen(false);
                setAdding(true);
              }}
            >
              <i className="ti ti-user-plus" /> Add staff member
            </button>
            <div className="divider" />
            {sorted.map((p) => (
              <button
                key={p.id}
                className={'switch-row' + (p.id === user.id ? ' active' : '')}
                onClick={() => {
                  setUser(p);
                  setOpen(false);
                }}
              >
                <span className="avatar">{initials(p.name)}</span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, letterSpacing: '-0.01em' }}>{p.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                    {roleLabel(p)}
                    {p.resolves_conflicts ? ' · Conflict resolver' : ''}
                  </div>
                </span>
                {p.id === user.id && <i className="ti ti-check" style={{ color: 'var(--green)' }} />}
              </button>
            ))}
            <div className="divider" />
            <button
              className="add-row"
              style={{ color: 'var(--text-3)' }}
              onClick={() => {
                if (confirm('Reset all demo data back to the original seed? Any rooms, staff, or bookings you added will be removed.')) {
                  reset();
                  setOpen(false);
                }
              }}
            >
              <i className="ti ti-refresh" /> Reset demo data
            </button>

          </div>
        </div>
      )}
      {adding && (
        <AddStaff canMakeAdmin={levelOf(user) === 2} onAdded={setUser} onClose={() => setAdding(false)} />
      )}
    </>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

const NOTIF_ICON: Record<string, string> = {
  assigned: 'ti-clipboard-check',
  crew: 'ti-users-group',
  done: 'ti-circle-check',
  comment: 'ti-message-2',
};

function NotifBell() {
  const nav = useNavigate();
  const { user } = useSession();
  const { db, markNotifsReadFor } = useStore();
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [preview, setPreview] = useState<Notif | null>(null);

  const mine = db.notifications
    .filter((n) => n.to === user.name)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unread = mine.filter((n) => !n.read).length;

  function openPanel() {
    setOpen(true);
  }
  function close() {
    setOpen(false);
    // Mark read once they've had a look.
    markNotifsReadFor(user.name);
  }

  return (
    <>
      <button className="bell" onClick={openPanel} aria-label="Notifications">
        <i className="ti ti-bell" />
        {unread > 0 && <span className="bell-badge">{unread}</span>}
      </button>
      {open && (
        <div className="switch-backdrop" onClick={close}>
          <div className="switch-panel notif-panel" onClick={(e) => e.stopPropagation()}>
            <div className="switch-head notif-head">
              <span>Notifications for {user.name.split(' ')[0]} — these also go to email &amp; Teams.</span>
              <button
                className="notif-gear"
                aria-label="Notification settings"
                onClick={() => setSettings(true)}
              >
                <i className="ti ti-settings" />
              </button>
            </div>
            {mine.length === 0 && <div className="empty" style={{ margin: 12 }}>You're all caught up.</div>}
            {mine.map((n) => {
              const channels = (n.channels ?? ['in-app']).filter((c) => c !== 'in-app');
              return (
                <div key={n.id} className={'notif-row' + (n.read ? '' : ' unread')}>
                  <button
                    className="notif-main"
                    onClick={() => {
                      if (n.link) nav(n.link.replace(/^#/, ''));
                      close();
                    }}
                  >
                    <span className="notif-ic">
                      <i className={'ti ' + (NOTIF_ICON[n.kind] ?? 'ti-bell')} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="notif-title">{n.title}</span>
                      {n.body && <span className="notif-body">{n.body}</span>}
                      <span className="notif-meta">
                        <span className="notif-time">{timeAgo(n.createdAt)}</span>
                        {channels.map((c) => (
                          <span key={c} className="notif-chan">
                            <i className={'ti ' + CHANNEL_META[c].icon} />
                          </span>
                        ))}
                      </span>
                    </span>
                    {!n.read && <span className="notif-dot" />}
                  </button>
                  {channels.length > 0 && (
                    <button
                      className="notif-preview"
                      aria-label="Preview delivery"
                      onClick={() => setPreview(n)}
                    >
                      <i className="ti ti-eye" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {settings && <NotifSettings onClose={() => setSettings(false)} />}
      {preview && <DeliveryPreview notif={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

const tabs = [
  { to: '/', icon: 'ti-home', label: 'Home' },
  { to: '/calendar', icon: 'ti-calendar', label: 'Calendar' },
  { to: '/spaces', icon: 'ti-building', label: 'Spaces' },
  { to: '/people', icon: 'ti-users', label: 'People' },
  { to: '/requests', icon: 'ti-inbox', label: 'Requests' },
];

export default function Shell({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-inner">
          <button className="brand" onClick={() => nav('/')} style={{ background: 'none', border: 'none', padding: 0 }}>
            <span className="brand-mark">
              <img src={helmetMark} alt="" />
            </span>
            <span className="brand-name">STEWARD</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="bell" onClick={() => nav('/search')} aria-label="Search">
              <i className="ti ti-search" />
            </button>
            <NotifBell />
            <RoleSwitcher />
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 22 }}>
        {children}
      </div>

      <nav className="tabbar">
        <div className="tabbar-inner">
          {tabs.map((t) => {
            const active = t.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(t.to);
            return (
              <button key={t.to} className={'tab' + (active ? ' active' : '')} onClick={() => nav(t.to)}>
                <i className={'ti ' + t.icon} />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
