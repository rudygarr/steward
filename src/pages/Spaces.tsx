import { useMemo, useState } from 'react';
import RoomRibbon from '../components/RoomRibbon';
import { useNavigate } from 'react-router-dom';
import { useStore, groupByFolder } from '../lib/store';
import { roomHasConflict, resourceHasConflict } from '../lib/conflicts';
import { CampusMap } from '../components/CampusMap';
import { availableOn } from '../lib/stock';
import { isVehicle, busPhoto } from '../lib/busPhoto';
import { dayKey, DEMO_TODAY } from '../lib/data';
import Modal, { field, primaryBtn } from '../components/Modal';
import type { Resource } from '../lib/types';

type Tab = 'rooms' | 'resources';

const roomIcons: Record<string, string> = {
  Athletics: 'ti-ball-basketball',
  'Wild Acre': 'ti-trees',
  'Nature Center': 'ti-leaf',
  'Lighthouse PAC': 'ti-masks-theater',
  'The Beacon': 'ti-music',
  'Fine Arts': 'ti-palette',
  'Elementary School': 'ti-school',
  'Middle School': 'ti-school',
  'High School': 'ti-school',
  'Media Center': 'ti-books',
  Administration: 'ti-briefcase',
};
const resIcons: Record<string, string> = {
  Maintenance: 'ti-tool',
  'Sound/Lights/Staging': 'ti-microphone',
  IT: 'ti-device-laptop',
  Transportation: 'ti-bus',
  'Custodial/Cleaning': 'ti-spray',
  Catering: 'ti-tools-kitchen-2',
  Administration: 'ti-shield',
  'Health Office': 'ti-stethoscope',
  Athletics: 'ti-first-aid-kit',
};

function AddSpace({
  kind,
  folders,
  editing,
  onClose,
}: {
  kind: 'rooms' | 'resources';
  folders: string[];
  editing?: Resource;
  onClose: () => void;
}) {
  const { addRoom, addResource, updateResource, removeResource } = useStore();
  const [name, setName] = useState(editing?.name ?? '');
  const [folder, setFolder] = useState(editing?.folder ?? folders[0] ?? '');
  const [qty, setQty] = useState(editing?.qty != null ? String(editing.qty) : '');
  const [photo, setPhoto] = useState<string>(editing?.photo ?? '');
  const [confirmDel, setConfirmDel] = useState(false);
  const label = kind === 'rooms' ? 'room' : 'resource';
  const isEdit = !!editing;
  const showPhoto = kind === 'resources' && isVehicle(name);
  function onPickPhoto(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(String(reader.result));
    reader.readAsDataURL(file);
  }
  function submit() {
    if (!name.trim() || !folder.trim()) return;
    const n = parseInt(qty, 10);
    const q = Number.isFinite(n) && n > 0 ? n : undefined;
    if (isEdit) updateResource(editing!.id, { name, folder: folder.trim(), qty: q ?? null, photo: showPhoto ? photo || null : undefined });
    else if (kind === 'rooms') addRoom(name, folder.trim());
    else addResource(name, folder.trim(), q);
    onClose();
  }
  return (
    <Modal title={isEdit ? 'Edit resource' : `Add ${label}`} onClose={onClose}>
      <label className="flabel">{label[0].toUpperCase() + label.slice(1)} name</label>
      <input style={field} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={kind === 'rooms' ? 'Room 204' : 'Projector cart'} />
      <label className="flabel">Group</label>
      <input style={field} list="folders" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Pick or type a new group" />
      <datalist id="folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {kind === 'resources' && (
        <>
          <label className="flabel">How many? (optional)</label>
          <input style={field} type="number" min="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 3 nurses, 200 chairs" />
          <div className="field-hint">
            Set a count to track availability and get over-booking warnings. Leave blank for an on-call service the team staffs as needed (e.g. an athletic trainer).
          </div>
        </>
      )}
      {showPhoto && (
        <>
          <label className="flabel">Vehicle photo</label>
          <div className="veh-edit">
            <img className="veh-edit-img" src={photo || busPhoto(name)} alt={name} />
            <div className="veh-edit-actions">
              <label className="btn-soft veh-upload">
                <i className="ti ti-camera" /> Upload photo
                <input type="file" accept="image/*" hidden onChange={(e) => onPickPhoto(e.target.files?.[0])} />
              </label>
              {photo && (
                <button className="del-link" onClick={() => setPhoto('')}>
                  Reset to drawn default
                </button>
              )}
            </div>
          </div>
          <div className="field-hint">
            A real photo removes all doubt for drivers and coaches. Until you upload one, Steward draws a labeled stand-in.
          </div>
        </>
      )}
      <button style={{ ...primaryBtn, marginTop: 18 }} onClick={submit}>
        {isEdit ? 'Save changes' : `Add ${label}`}
      </button>
      {isEdit &&
        (confirmDel ? (
          <div className="del-confirm">
            <span>Remove “{editing!.name}” from the catalog?</span>
            <div className="del-actions">
              <button className="btn-soft" onClick={() => setConfirmDel(false)}>
                Keep it
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  removeResource(editing!.id);
                  onClose();
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button className="del-link" onClick={() => setConfirmDel(true)}>
            <i className="ti ti-trash" /> Remove resource
          </button>
        ))}
    </Modal>
  );
}

export default function Spaces() {
  const nav = useNavigate();
  const { db } = useStore();
  const [tab, setTab] = useState<Tab>('rooms');
  const [roomView, setRoomView] = useState<'list' | 'map'>('list');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of db.events) {
      for (const r of e.rooms) m.set(r, (m.get(r) || 0) + 1);
      for (const r of e.resources) m.set(r, (m.get(r) || 0) + 1);
    }
    return m;
  }, [db.events]);

  const roomGroups = useMemo(() => groupByFolder(db.rooms), [db.rooms]);
  const resGroups = useMemo(() => groupByFolder(db.resources), [db.resources]);

  return (
    <>
      <h1 className="page-h">Spaces</h1>
      <div className="page-sub">{`${(tab === 'rooms' ? db.rooms : db.resources).length} bookable ${tab}`}</div>

      <div className="seg" style={{ marginBottom: 18 }}>
        <button className={tab === 'rooms' ? 'active' : ''} onClick={() => setTab('rooms')}>
          Rooms
        </button>
        <button className={tab === 'resources' ? 'active' : ''} onClick={() => setTab('resources')}>
          Resources
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        {tab === 'rooms' ? (
          <div className="seg seg-sm" style={{ width: 156 }}>
            <button className={roomView === 'list' ? 'active' : ''} onClick={() => setRoomView('list')}>
              <i className="ti ti-list" /> List
            </button>
            <button className={roomView === 'map' ? 'active' : ''} onClick={() => setRoomView('map')}>
              <i className="ti ti-map-2" /> Map
            </button>
          </div>
        ) : (
          <span />
        )}
        <button className="btn-soft" onClick={() => setAdding(true)}>
          <i className="ti ti-plus" /> Add {tab === 'rooms' ? 'room' : 'resource'}
        </button>
      </div>

      {tab === 'rooms' && roomView === 'map' && <CampusMap />}

      {!(tab === 'rooms' && roomView === 'map') &&
        (tab === 'rooms' ? roomGroups : resGroups).map((f) => {
          const icons = tab === 'rooms' ? roomIcons : resIcons;
          return (
            <div className="folder" key={f.name}>
              <div className="folder-h">
                <span className="name">{f.name}</span>
                <span className="count">{f.items.length}</span>
              </div>
              <div className="list">
                {f.items.map((item, i) => {
                  const contested =
                    tab === 'rooms' ? roomHasConflict(db, item.name) : resourceHasConflict(db, item.name);
                  // Today's stock availability for countable resources.
                  const res = tab === 'resources' ? (item as Resource) : null;
                  const avail = res && typeof res.qty === 'number' ? availableOn(db, res.name, dayKey(DEMO_TODAY)) : null;
                  const over = avail !== null && avail < 0;
                  const cap = tab === 'rooms' ? (item as { capacity?: number }).capacity : undefined;
                  return (
                    <div key={item.id}>
                      {i > 0 && <div className="divider" style={{ marginLeft: 58 }} />}
                      <button
                        className="space-row"
                        onClick={() => (tab === 'rooms' ? nav('/room/' + item.id) : setEditing(item as Resource))}
                      >
                        {res?.photo ? (
                          <img className="space-thumb" src={res.photo} alt={res.name} />
                        ) : (
                          <span className="space-ico">
                            <i className={'ti ' + (icons[f.name] || 'ti-point')} />
                          </span>
                        )}
                        <span className="nm">
                          <span className={contested ? 'nm-contested' : undefined}>
                            {contested && <i className="ti ti-alert-triangle" style={{ fontSize: 13, marginRight: 5 }} />}
                            {item.name}
                          </span>
                          {/* A room's day as a shape, not a count. */}
                          {tab === 'rooms' && (
                            <RoomRibbon db={db} room={item.name} contested={contested} />
                          )}
                        </span>
                        <span className="meta" style={over ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
                          {avail !== null
                            ? over
                              ? `over by ${-avail} today`
                              : `${avail}/${res!.qty} free`
                            : cap
                              ? `seats ${cap}`
                              : counts.get(item.name)
                                ? `${counts.get(item.name)} bookings`
                                : '—'}
                        </span>
                        <i className={'ti chev ' + (tab === 'rooms' ? 'ti-chevron-right' : 'ti-pencil')} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      <div style={{ height: 12 }} />

      {adding && (
        <AddSpace
          kind={tab}
          folders={(tab === 'rooms' ? roomGroups : resGroups).map((g) => g.name)}
          onClose={() => setAdding(false)}
        />
      )}

      {editing && (
        <AddSpace
          kind="resources"
          folders={resGroups.map((g) => g.name)}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
