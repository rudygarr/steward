import { useState } from 'react';
import DayRail, { type RailEntry } from '../components/DayRail';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../lib/store';
import { fmtTime, fmtDateShort, statusColor, DEMO_TODAY, eventsOnDay, findConflicts } from '../lib/data';
import Modal, { field, primaryBtn } from '../components/Modal';
import type { Room } from '../lib/types';

function EditRoom({ room, folders, upcomingCount, onClose }: { room: Room; folders: string[]; upcomingCount: number; onClose: () => void }) {
  const { updateRoom, removeRoom } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState(room.name);
  const [folder, setFolder] = useState(room.folder);
  const [cap, setCap] = useState(room.capacity != null ? String(room.capacity) : '');
  const [confirmDel, setConfirmDel] = useState(false);
  function save() {
    if (!name.trim() || !folder.trim()) return;
    const n = parseInt(cap, 10);
    updateRoom(room.id, { name, folder: folder.trim(), capacity: Number.isFinite(n) && n > 0 ? n : null });
    onClose();
  }
  return (
    <Modal title="Edit room" onClose={onClose}>
      <label className="flabel">Room name</label>
      <input style={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <label className="flabel">Group</label>
      <input style={field} list="room-folders" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Pick or type a new group" />
      <datalist id="room-folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <label className="flabel">Capacity / seats (optional)</label>
      <input style={field} type="number" min="1" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="e.g. 250" />
      <div className="field-hint">Used for the soft over-capacity warning when a booking's expected attendance exceeds the room.</div>
      <button style={{ ...primaryBtn, marginTop: 18 }} onClick={save}>
        Save changes
      </button>
      {confirmDel ? (
        <div className="del-confirm">
          <span>
            Remove “{room.name}” from the catalog?
            {upcomingCount > 0 && ` Its ${upcomingCount} upcoming booking${upcomingCount === 1 ? '' : 's'} keep their records, but the room leaves the pickers.`}
          </span>
          <div className="del-actions">
            <button className="btn-soft" onClick={() => setConfirmDel(false)}>
              Keep it
            </button>
            <button
              className="btn-danger"
              onClick={() => {
                removeRoom(room.id);
                nav('/spaces');
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button className="del-link" onClick={() => setConfirmDel(true)}>
          <i className="ti ti-trash" /> Remove room
        </button>
      )}
    </Modal>
  );
}

export default function RoomDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db } = useStore();
  const [editing, setEditing] = useState(false);
  const room = db.rooms.find((r) => r.id === id);

  if (!room) {
    return (
      <div style={{ paddingTop: 40, textAlign: 'center' }}>
        <div className="page-sub">Room not found.</div>
        <button className="btn-soft" style={{ marginTop: 16 }} onClick={() => nav('/spaces')}>
          Back to Spaces
        </button>
      </div>
    );
  }

  const now = DEMO_TODAY.getTime();

  // This room's today, on the same rail the rest of the app reads time on —
  // a room's day is the campus day seen from one room's side.
  const todayHere = eventsOnDay(db.events, DEMO_TODAY).filter((e) => e.rooms.includes(room.name));
  const clashesHere = findConflicts(todayHere);
  const clashOf = new Map<string, string>();
  for (const c of clashesHere) {
    clashOf.set(c.a.id, c.b.name);
    clashOf.set(c.b.id, c.a.name);
  }
  const railEntries: RailEntry[] = todayHere.map((e) => ({
    ev: e,
    clashWith: clashOf.get(e.id),
    struck: !!e.cancelled,
    notice: e.kind === 'notice',
  }));
  const todayIds = new Set(todayHere.map((e) => e.id));

  const upcoming = db.events
    .filter((e) => e.rooms.includes(room.name) && e.starts_at && new Date(e.starts_at).getTime() >= now - 12 * 3600e3)
    // By instant, not string: the seed mixes offset and UTC timestamps.
    .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())
    .filter((e) => !todayIds.has(e.id))
    .slice(0, 25);

  return (
    <>
      <button className="back-link" onClick={() => nav('/spaces')}>
        <i className="ti ti-chevron-left" /> Spaces
      </button>

      <h1 className="page-h" style={{ marginTop: 6 }}>
        {room.name}
      </h1>
      <div className="page-sub">
        {room.folder}
        {typeof room.capacity === 'number' && (
          <>
            {' · '}
            <i className="ti ti-users" style={{ fontSize: 13, margin: '0 3px 0 1px' }} />
            seats {room.capacity}
          </>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, margin: '14px 0' }}>
        <button className="btn-soft" onClick={() => setEditing(true)}>
          <i className="ti ti-pencil" /> Edit
        </button>
        <button className="fab" onClick={() => nav('/book')}>
          <i className="ti ti-plus" /> Book this room
        </button>
      </div>

      <div className="section-label">
        <span className="lbl">Today in this room</span>
        <span className="act">{todayHere.length}</span>
      </div>
      {todayHere.length === 0 ? (
        <div className="rail-empty">Free all day.</div>
      ) : (
        <DayRail entries={railEntries} />
      )}

      <div className="section-label" style={{ marginTop: 26 }}>
        <span className="lbl">Later</span>
        <span className="act">{upcoming.length}</span>
      </div>

      <div className="list">
        {upcoming.length === 0 && <div className="empty">Nothing booked beyond today.</div>}
        {upcoming.map((e, i) => (
          <div key={e.id}>
            {i > 0 && <div className="divider" />}
            <button className="row" onClick={() => nav('/event/' + e.id)}>
              <span className="time tnum" style={{ width: 64 }}>
                {fmtDateShort(new Date(e.starts_at!)).replace(/^[A-Za-z]+, /, '')}
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.all_day ? 'All day' : fmtTime(e.starts_at)}</div>
              </span>
              <span className="dot" style={{ background: statusColor(e.status) }} />
              <span className="body">
                <span className="title">{e.name}</span>
                <span className="sub">{e.owner || 'No owner'}</span>
              </span>
              <i className="ti ti-chevron-right chev" />
            </button>
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />

      {editing && (
        <EditRoom
          room={room}
          folders={[...new Set(db.rooms.map((r) => r.folder))]}
          upcomingCount={upcoming.length}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
