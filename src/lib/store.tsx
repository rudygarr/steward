import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Database, Room, Resource, PersonRec, EventRec, WorkItem, Driver, Template, Notif, ConflictNote, Asset, Rental, AuditEntry, RequestComment, CalendarView, CrewAssignment, Blockout, Program, EventInvite, InviteStatus, CampBus, CampCabin, CabinRoom, CabinKind, CampRole, CampShift, CampDuty } from './types';
import { buildSeed, SEED_VERSION } from './seed';
import { loadDB, saveDB, clearDB } from './persistence';
import { DEMO_TODAY } from './data';
import { channelsFor } from './notify';

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Recurring-series scope (item S4): just this occurrence, this one and every
// later one, or the whole run.
export type SeriesScope = 'one' | 'following' | 'all';

// The ids in a series that a scoped action should touch, anchored at one event.
function seriesScopeIds(events: EventRec[], seriesId: string, scope: SeriesScope, anchor?: EventRec): string[] {
  if (scope === 'one') return anchor ? [anchor.id] : [];
  const inSeries = events.filter((e) => e.seriesId === seriesId);
  if (scope === 'all') return inSeries.map((e) => e.id);
  // 'following': this occurrence and every later one (by start time).
  const from = anchor?.starts_at ?? '';
  return inSeries.filter((e) => (e.starts_at ?? '') >= from).map((e) => e.id);
}

// Who the audit trail attributes actions to. Kept in sync with the "view as"
// session actor (see setAuditActor, called from SessionProvider) so store
// mutations can stamp the right name without every call site passing it.
let auditActor = 'System';
export function setAuditActor(name: string) {
  auditActor = name || 'System';
}
function auditEntry(e: Omit<AuditEntry, 'id' | 'at' | 'actor'>): AuditEntry {
  // Demo-frame rule: stamp at the demo's "today", not real wall-clock.
  return { ...e, id: uid('au'), at: DEMO_TODAY.toISOString(), actor: auditActor };
}
function withAudit(d: Database, e: Omit<AuditEntry, 'id' | 'at' | 'actor'>): Database {
  return { ...d, audit: [...(d.audit ?? []), auditEntry(e)] };
}

// Fields whose change can alter — or void — a previously "accepted" overlap.
const CONFLICT_FIELDS: (keyof EventRec)[] = ['starts_at', 'ends_at', 'setup_starts', 'teardown_ends', 'rooms'];

// When an event's time or room changes, any "accept" that had cleared a clash
// involving it no longer reflects reality (the owners agreed to a *specific*
// overlap, not whatever it just became). Drop those accept notes so the warning
// returns for them to re-confirm. The conversation ('note') history is kept —
// conflictKey is the sorted "aId|bId" pair, so split('|') recovers both ids.
function invalidateAccepts(d: Database, id: string): Database {
  const notes = d.conflictNotes ?? [];
  const next = notes.filter((n) => !(n.kind === 'accept' && n.conflictKey.split('|').includes(id)));
  return next.length === notes.length ? d : { ...d, conflictNotes: next };
}

interface StoreCtx {
  db: Database;
  addRoom: (name: string, folder: string) => Room;
  updateRoom: (id: string, patch: { name?: string; folder?: string; capacity?: number | null }) => void;
  removeRoom: (id: string) => void;
  addResource: (name: string, folder: string, qty?: number) => Resource;
  updateResource: (id: string, patch: { name?: string; folder?: string; qty?: number | null; photo?: string | null }) => void;
  removeResource: (id: string) => void;
  addPerson: (p: Omit<PersonRec, 'id'>) => PersonRec;
  updatePerson: (id: string, patch: Partial<PersonRec>) => void;
  addEvent: (e: Omit<EventRec, 'id'>) => EventRec;
  addEvents: (list: Omit<EventRec, 'id'>[]) => EventRec[];
  updateEvent: (id: string, patch: Partial<EventRec>) => void;
  moveEventRoom: (id: string, fromRoom: string, toRoom: string) => void;
  checkInEvent: (id: string) => void;
  releaseEvent: (id: string) => void;
  restoreEvent: (id: string) => void;
  reassignOwner: (fromName: string, toName: string) => void;
  addWorkItem: (w: Omit<WorkItem, 'id'>) => WorkItem;
  updateWorkItem: (id: string, patch: Partial<WorkItem>) => void;
  addDriver: (d: Omit<Driver, 'id'>) => Driver;
  updateDriver: (id: string, patch: Partial<Driver>) => void;
  addTemplate: (t: Omit<Template, 'id'>) => Template;
  removeTemplate: (id: string) => void;
  notify: (n: Omit<Notif, 'id' | 'createdAt' | 'read'>) => void;
  markNotifsReadFor: (name: string) => void;
  addConflictNote: (n: Omit<ConflictNote, 'id' | 'at'>) => void;
  addAsset: (a: Omit<Asset, 'id'>) => Asset;
  updateAsset: (id: string, patch: Partial<Asset>) => void;
  logService: (id: string, by: string, note?: string) => void;
  addRental: (r: Omit<Rental, 'id' | 'createdAt'>) => Rental;
  updateRental: (id: string, patch: Partial<Rental>) => void;
  confirmRental: (id: string) => void;
  cancelRental: (id: string) => void;
  logAudit: (e: Omit<AuditEntry, 'id' | 'at' | 'actor'>) => void;
  addComment: (entityId: string, author: string, body: string) => void;
  withdrawRequest: (kind: 'work' | 'event', id: string, withdrawn: boolean) => void;
  addCalendarView: (v: Omit<CalendarView, 'id'>) => string;
  removeCalendarView: (id: string) => void;
  updateSeries: (seriesId: string, scope: SeriesScope, anchorId: string, patch: Partial<EventRec>) => number;
  setSeriesCancelled: (seriesId: string, scope: SeriesScope, anchorId: string, cancelled: boolean) => number;
  // Teams / crew layer
  applyPositionTemplate: (eventId: string, templateId: string) => void;
  addCrewSlot: (eventId: string, teamId: string, positionId: string) => void;
  removeCrewAssignment: (id: string) => void;
  assignCrew: (assignmentId: string, personId: string, mode: 'request' | 'self') => void;
  respondCrew: (assignmentId: string, accept: boolean) => void;
  addBlockout: (b: Omit<Blockout, 'id'>) => void;
  removeBlockout: (id: string) => void;
  // Program containers (§13)
  addProgram: (p: Omit<Program, 'id'>) => Program;
  updateProgram: (id: string, patch: Partial<Program>) => void;
  addProgramSession: (programId: string, e: Omit<EventRec, 'id'>) => EventRec;
  detachSession: (eventId: string) => void;
  submitProgram: (id: string) => void;
  cancelProgram: (id: string, cancelled: boolean) => void;
  // Event invites
  inviteToEvent: (eventId: string, who: { personId?: string; name: string; email?: string; role?: string; note?: string; busId?: string; cabinId?: string; cabinRoomId?: string; cabinLeader?: boolean }) => void;
  respondInvite: (inviteId: string, status: InviteStatus) => void;
  removeInvite: (inviteId: string) => void;
  remindInvite: (inviteId: string) => void;
  remindAllDue: (eventId: string) => number;
  // Camp buses (rental, surfaced as rooms)
  addCampBus: (eventId: string, bus: { name: string; label?: string; capacity?: number; rentalOrg?: string; departInfo?: string }) => void;
  removeCampBus: (busId: string) => void;
  assignToBus: (inviteId: string, busId: string | undefined) => void;
  // Camp cabins (lodging)
  addCampCabin: (eventId: string, cabin: { name: string; kind: CabinKind; beds?: number }) => void;
  removeCampCabin: (cabinId: string) => void;
  addCabinRoom: (cabinId: string, room: { name: string; beds: number }) => void;
  removeCabinRoom: (roomId: string) => void;
  assignToCabin: (inviteId: string, cabinId: string | undefined, cabinRoomId?: string) => void;
  setCabinLeader: (inviteId: string, leader: boolean) => void;
  // Camp roles & shifts
  addCampRole: (eventId: string, role: { name: string; icon?: string; blurb?: string }) => void;
  removeCampRole: (roleId: string) => void;
  addCampShift: (roleId: string, shift: { name: string; start?: string; end?: string }) => void;
  removeCampShift: (shiftId: string) => void;
  assignDuty: (eventId: string, roleId: string, who: { personId?: string; name: string; email?: string; shiftId?: string }) => void;
  removeDuty: (dutyId: string) => void;
  reset: () => void;
}

// A confirmed rental shows up on the master calendar as a real (external)
// booking, so it conflict-checks and draws down rooms like anything else.
function rentalEvent(r: Rental, id: string): EventRec {
  const starts = r.startTime ? `${r.date}T${r.startTime}:00-04:00` : `${r.date}T00:00:00-04:00`;
  const ends = r.endTime ? `${r.date}T${r.endTime}:00-04:00` : starts;
  return {
    name: `${r.purpose} (${r.org})`,
    starts_at: starts,
    ends_at: ends,
    all_day: !r.startTime,
    setup_starts: null,
    teardown_ends: null,
    recurrence: null,
    location: r.room,
    owner: r.org,
    status: 'Approved',
    percent_approved: 100,
    details: `External rental — ${r.org}. Contact: ${r.contact}.`,
    rooms: [r.room],
    resources: [],
    source: 'internal',
    category: 'Rental',
    kind: 'booking',
    expectedAttendance: r.attendance,
    id,
  };
}

const Ctx = createContext<StoreCtx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);

  useEffect(() => {
    loadDB().then((saved) => {
      // The database is shared now, so only seed when it is genuinely empty.
      // (It used to reseed whenever SEED_VERSION moved, which was harmless
      // per-browser but here would let whoever loaded first wipe everyone
      // else's work. Use "Reset demo data" to reseed on purpose.)
      if (!saved) {
        const seed = buildSeed();
        setDb(seed);
        void saveDB(seed);
      } else {
        if (saved.seedVersion !== SEED_VERSION) {
          console.info(
            `[steward] shared data is at seed v${saved.seedVersion}, app expects v${SEED_VERSION}. ` +
              'Keeping the live data — use "Reset demo data" to reseed.',
          );
        }
        setDb(saved);
      }
    });
  }, []);

  // Functional commit: each mutation receives the latest state, so two
  // mutations fired in the same event handler (e.g. update an item *and* push
  // a notification) compose instead of clobbering each other.
  function commit(updater: (prev: Database) => Database) {
    setDb((prev) => {
      const next = updater(prev as Database);
      void saveDB(next);
      return next;
    });
  }

  if (!db) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: 'var(--text-3)' }}>Loading…</div>
    );
  }

  const api: StoreCtx = {
    db,
    addRoom(name, folder) {
      const room: Room = { id: uid('r'), name: name.trim(), folder };
      commit((d) => ({ ...d, rooms: [...d.rooms, room] }));
      return room;
    },
    updateRoom(id, patch) {
      commit((d) => ({
        ...d,
        rooms: d.rooms.map((r) => {
          if (r.id !== id) return r;
          const next: Room = { ...r };
          if (patch.name !== undefined) next.name = patch.name.trim();
          if (patch.folder !== undefined) next.folder = patch.folder.trim();
          // capacity: a positive number sets seats; null/0 clears it.
          if (patch.capacity !== undefined) {
            if (typeof patch.capacity === 'number' && patch.capacity > 0) next.capacity = patch.capacity;
            else delete next.capacity;
          }
          return next;
        }),
      }));
    },
    removeRoom(id) {
      // Retires the room from the catalog/pickers. Existing events reference rooms by
      // name (free text), so their records are untouched — same as removeResource.
      commit((d) => ({ ...d, rooms: d.rooms.filter((r) => r.id !== id) }));
    },
    addResource(name, folder, qty) {
      // A count makes it a tracked pool (availability + soft over-allocation, like
      // Nurses or Chairs); omitting it leaves an uncapped on-call service (like the
      // Athletic Trainer the AD staffs as needed).
      const resource: Resource = {
        id: uid('res'),
        name: name.trim(),
        folder,
        ...(typeof qty === 'number' && qty > 0 ? { qty } : {}),
      };
      commit((d) => ({ ...d, resources: [...d.resources, resource] }));
      return resource;
    },
    updateResource(id, patch) {
      commit((d) => ({
        ...d,
        resources: d.resources.map((r) => {
          if (r.id !== id) return r;
          const next: Resource = { ...r };
          if (patch.name !== undefined) next.name = patch.name.trim();
          if (patch.folder !== undefined) next.folder = patch.folder.trim();
          // qty: a positive number sets a tracked pool; null/0 clears it back to an
          // uncapped on-call service.
          if (patch.qty !== undefined) {
            if (typeof patch.qty === 'number' && patch.qty > 0) next.qty = patch.qty;
            else delete next.qty;
          }
          // photo: a data url sets it, null clears it back to the default.
          if (patch.photo !== undefined) {
            if (patch.photo) next.photo = patch.photo;
            else delete next.photo;
          }
          return next;
        }),
      }));
    },
    removeResource(id) {
      // Drops the resource from the catalog. Past bookings reference resources by
      // name (free text), so existing events are untouched — this just retires it
      // from the pickers.
      commit((d) => ({ ...d, resources: d.resources.filter((r) => r.id !== id) }));
    },
    addPerson(p) {
      const person: PersonRec = { ...p, id: uid('p') };
      commit((d) => ({ ...d, people: [...d.people, person] }));
      return person;
    },
    updatePerson(id, patch) {
      commit((d) => ({ ...d, people: d.people.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    },
    addEvent(e) {
      const ev: EventRec = { ...e, id: uid('e') };
      commit((d) => withAudit({ ...d, events: [...d.events, ev] }, { action: 'Created booking', entityType: 'booking', entityId: ev.id, entityLabel: ev.name, detail: ev.rooms?.length ? ev.rooms.join(', ') : undefined, link: `#/event/${ev.id}` }));
      return ev;
    },
    addEvents(list) {
      const evs: EventRec[] = list.map((e) => ({ ...e, id: uid('e') }));
      commit((d) => ({ ...d, events: [...d.events, ...evs] }));
      return evs;
    },
    updateEvent(id, patch) {
      commit((d) => {
        const nd = { ...d, events: d.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
        // A time/room edit voids any prior "accept" for clashes this event was in.
        return CONFLICT_FIELDS.some((f) => f in patch) ? invalidateAccepts(nd, id) : nd;
      });
    },
    // Conflict resolution by relocation: swap one room on a booking for a free
    // one (the "just move it" option in the conflict thread). Frees the contested
    // room, voids any stale accept, and is audited.
    moveEventRoom(id, fromRoom, toRoom) {
      commit((d) => {
        const ev = d.events.find((e) => e.id === id);
        if (!ev) return d;
        const swapped = ev.rooms.includes(fromRoom)
          ? ev.rooms.map((r) => (r === fromRoom ? toRoom : r))
          : [...ev.rooms, toRoom];
        const rooms = [...new Set(swapped)];
        let nd: Database = { ...d, events: d.events.map((e) => (e.id === id ? { ...e, rooms } : e)) };
        nd = invalidateAccepts(nd, id);
        return withAudit(nd, {
          action: 'Moved booking',
          entityType: 'booking',
          entityId: id,
          entityLabel: ev.name,
          detail: `${fromRoom} → ${toRoom}`,
          link: `#/event/${id}`,
        });
      });
    },
    // Confirm the space is in use. Stamps DEMO_TODAY (demo-frame rule) and clears
    // any prior release.
    checkInEvent(id) {
      const now = DEMO_TODAY.toISOString();
      commit((d) => {
        const ev = d.events.find((e) => e.id === id);
        const nd = { ...d, events: d.events.map((e) => (e.id === id ? { ...e, checkInAt: now, released: false } : e)) };
        return ev ? withAudit(nd, { action: 'Checked in', entityType: 'booking', entityId: id, entityLabel: ev.name, link: `#/event/${id}` }) : nd;
      });
    },
    // Reclaim a no-show's slot (frees room + stock). Reversible via restoreEvent.
    releaseEvent(id) {
      commit((d) => {
        const ev = d.events.find((e) => e.id === id);
        const nd = { ...d, events: d.events.map((e) => (e.id === id ? { ...e, released: true } : e)) };
        return ev ? withAudit(nd, { action: 'Released slot', entityType: 'booking', entityId: id, entityLabel: ev.name, detail: 'No-show reclaim', link: `#/event/${id}` }) : nd;
      });
    },
    restoreEvent(id) {
      commit((d) => {
        const ev = d.events.find((e) => e.id === id);
        const nd = { ...d, events: d.events.map((e) => (e.id === id ? { ...e, released: false } : e)) };
        return ev ? withAudit(nd, { action: 'Restored booking', entityType: 'booking', entityId: id, entityLabel: ev.name, link: `#/event/${id}` }) : nd;
      });
    },
    reassignOwner(fromName, toName) {
      commit((d) => ({
        ...d,
        events: d.events.map((e) => (e.owner === fromName ? { ...e, owner: toName } : e)),
      }));
    },
    addWorkItem(w) {
      const item: WorkItem = { ...w, id: uid('w') };
      commit((d) => ({ ...d, workItems: [...d.workItems, item] }));
      return item;
    },
    updateWorkItem(id, patch) {
      commit((d) => {
        const prev = d.workItems.find((w) => w.id === id);
        let nd: Database = {
          ...d,
          workItems: d.workItems.map((w) => {
            if (w.id !== id) return w;
            const next = { ...w, ...patch };
            // Stamp the moment a job first reaches Done, for turnaround reporting.
            if (next.status === 'Done' && !next.completedAt) next.completedAt = new Date().toISOString();
            return next;
          }),
        };
        // Audit the meaningful transitions: status changes and (re)assignment.
        if (prev) {
          if (patch.status && patch.status !== prev.status) {
            nd = withAudit(nd, { action: `Marked ${patch.status}`, entityType: 'work', entityId: id, entityLabel: prev.title, detail: `${prev.status} → ${patch.status}`, link: `#/work/${id}` });
          }
          if (patch.assignee !== undefined && patch.assignee !== prev.assignee) {
            nd = withAudit(nd, { action: patch.assignee ? 'Assigned work' : 'Unassigned work', entityType: 'work', entityId: id, entityLabel: prev.title, detail: patch.assignee ? `to ${patch.assignee}` : undefined, link: `#/work/${id}` });
          }
        }
        return nd;
      });
    },
    addDriver(dr) {
      const driver: Driver = { ...dr, id: uid('drv'), active: true };
      commit((d) => ({ ...d, drivers: [...d.drivers, driver] }));
      return driver;
    },
    updateDriver(id, patch) {
      commit((d) => ({ ...d, drivers: d.drivers.map((dr) => (dr.id === id ? { ...dr, ...patch } : dr)) }));
    },
    addTemplate(t) {
      const tpl: Template = { ...t, id: uid('tpl') };
      commit((d) => ({ ...d, templates: [...d.templates, tpl] }));
      return tpl;
    },
    removeTemplate(id) {
      commit((d) => ({ ...d, templates: d.templates.filter((t) => t.id !== id) }));
    },
    notify(n) {
      if (!n.to) return;
      commit((d) => {
        // Deliver on the recipient's chosen channels (in-app always, + email/Teams).
        const person = d.people.find((p) => p.name === n.to);
        const notif: Notif = {
          ...n,
          id: uid('n'),
          createdAt: new Date().toISOString(),
          channels: n.channels ?? channelsFor(person),
        };
        return { ...d, notifications: [...d.notifications, notif] };
      });
    },
    markNotifsReadFor(name) {
      commit((d) =>
        d.notifications.some((n) => n.to === name && !n.read)
          ? { ...d, notifications: d.notifications.map((n) => (n.to === name ? { ...n, read: true } : n)) }
          : d,
      );
    },
    addConflictNote(n) {
      const note: ConflictNote = { ...n, id: uid('cn'), at: new Date().toISOString() };
      commit((d) => {
        const nd = { ...d, conflictNotes: [...(d.conflictNotes ?? []), note] };
        // Only the resolving "accept" is audit-worthy; ordinary talk isn't.
        return note.kind === 'accept' ? withAudit(nd, { action: 'Accepted overlap', entityType: 'conflict', entityLabel: 'Shared / accepted double-booking', detail: note.body || undefined }) : nd;
      });
    },
    addAsset(a) {
      const asset: Asset = { ...a, id: uid('as') };
      commit((d) => ({ ...d, assets: [...(d.assets ?? []), asset] }));
      return asset;
    },
    updateAsset(id, patch) {
      commit((d) => ({ ...d, assets: (d.assets ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
    },
    logService(id, by, note) {
      // Stamp at the demo's "today" so logging service clears the PM in-frame.
      const now = DEMO_TODAY.toISOString();
      commit((d) => {
        const asset = (d.assets ?? []).find((a) => a.id === id);
        const nd = {
          ...d,
          assets: (d.assets ?? []).map((a) =>
            a.id === id
              ? { ...a, lastServiceAt: now, serviceLog: [{ at: now, by, note }, ...(a.serviceLog ?? [])] }
              : a,
          ),
        };
        return asset ? withAudit(nd, { action: 'Logged service', entityType: 'asset', entityId: id, entityLabel: `${asset.code} · ${asset.name}`, detail: note || undefined, link: `#/asset/${id}` }) : nd;
      });
    },
    addRental(r) {
      const rental: Rental = { ...r, id: uid('rent'), createdAt: DEMO_TODAY.toISOString() };
      commit((d) => withAudit({ ...d, rentals: [...(d.rentals ?? []), rental] }, { action: 'New rental inquiry', entityType: 'rental', entityId: rental.id, entityLabel: rental.org, detail: `${rental.room} · ${rental.purpose}`, link: `#/rental/${rental.id}` }));
      return rental;
    },
    updateRental(id, patch) {
      commit((d) => {
        const prev = (d.rentals ?? []).find((r) => r.id === id);
        let nd: Database = { ...d, rentals: (d.rentals ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) };
        if (prev) {
          // Audit the gate flips — COI, deposit, invoice — and explicit status moves.
          const gates: { key: 'coi' | 'depositStatus' | 'invoiceStatus'; label: string }[] = [
            { key: 'coi', label: 'COI' },
            { key: 'depositStatus', label: 'Deposit' },
            { key: 'invoiceStatus', label: 'Invoice' },
          ];
          for (const g of gates) {
            if (patch[g.key] !== undefined && patch[g.key] !== prev[g.key]) {
              nd = withAudit(nd, { action: `${g.label}: ${patch[g.key]}`, entityType: 'rental', entityId: id, entityLabel: prev.org, detail: `${prev[g.key]} → ${patch[g.key]}`, link: `#/rental/${id}` });
            }
          }
          if (patch.status && patch.status !== prev.status) {
            nd = withAudit(nd, { action: `Marked ${patch.status}`, entityType: 'rental', entityId: id, entityLabel: prev.org, detail: `${prev.status} → ${patch.status}`, link: `#/rental/${id}` });
          }
        }
        return nd;
      });
    },
    // Confirm a rental: put it on the calendar (create the linked event if needed,
    // or un-release a previously cancelled one) and mark it Confirmed.
    confirmRental(id) {
      commit((d) => {
        const r = (d.rentals ?? []).find((x) => x.id === id);
        if (!r) return d;
        let events = d.events;
        let eventId = r.eventId;
        if (eventId && events.some((e) => e.id === eventId)) {
          events = events.map((e) => (e.id === eventId ? { ...e, released: false } : e));
        } else {
          eventId = uid('rent-evt');
          events = [...events, rentalEvent(r, eventId)];
        }
        const nd = {
          ...d,
          events,
          rentals: (d.rentals ?? []).map((x) => (x.id === id ? { ...x, status: 'Confirmed' as const, eventId } : x)),
        };
        return withAudit(nd, { action: 'Confirmed rental', entityType: 'rental', entityId: id, entityLabel: r.org, detail: 'Added to calendar', link: `#/rental/${id}` });
      });
    },
    // Cancel: free the room by releasing the linked event (reversible — confirming
    // again restores it), and mark the rental Cancelled.
    cancelRental(id) {
      commit((d) => {
        const r = (d.rentals ?? []).find((x) => x.id === id);
        if (!r) return d;
        const events = r.eventId
          ? d.events.map((e) => (e.id === r.eventId ? { ...e, released: true } : e))
          : d.events;
        const nd = {
          ...d,
          events,
          rentals: (d.rentals ?? []).map((x) => (x.id === id ? { ...x, status: 'Cancelled' as const } : x)),
        };
        return withAudit(nd, { action: 'Cancelled rental', entityType: 'rental', entityId: id, entityLabel: r.org, detail: 'Released the space', link: `#/rental/${id}` });
      });
    },
    logAudit(e) {
      commit((d) => withAudit(d, e));
    },
    // Post a comment on a request. Demo-frame: stamp at DEMO_TODAY. Recipients
    // are notified by the caller (it knows the participants).
    addComment(entityId, author, body) {
      const comment: RequestComment = { id: uid('cm'), entityId, author, body: body.trim(), at: DEMO_TODAY.toISOString() };
      commit((d) => ({ ...d, comments: [...(d.comments ?? []), comment] }));
    },
    // Requester pulls a request back (or reinstates it). Reversible; audited.
    withdrawRequest(kind, id, withdrawn) {
      commit((d) => {
        if (kind === 'work') {
          const w = d.workItems.find((x) => x.id === id);
          if (!w) return d;
          const nd = { ...d, workItems: d.workItems.map((x) => (x.id === id ? { ...x, withdrawn } : x)) };
          return withAudit(nd, { action: withdrawn ? 'Withdrew request' : 'Reinstated request', entityType: 'work', entityId: id, entityLabel: w.title, link: `#/work/${id}` });
        }
        const e = d.events.find((x) => x.id === id);
        if (!e) return d;
        const nd = { ...d, events: d.events.map((x) => (x.id === id ? { ...x, withdrawn } : x)) };
        return withAudit(nd, { action: withdrawn ? 'Withdrew request' : 'Reinstated request', entityType: 'booking', entityId: id, entityLabel: e.name, link: `#/event/${id}` });
      });
    },
    addCalendarView(v) {
      const id = uid('cv');
      commit((d) => ({ ...d, calendarViews: [...(d.calendarViews ?? []), { ...v, id }] }));
      return id;
    },
    removeCalendarView(id) {
      commit((d) => ({ ...d, calendarViews: (d.calendarViews ?? []).filter((v) => v.id !== id) }));
    },
    // Apply a patch across a recurring series (move room, change details, etc.),
    // scoped to this / this & following / all. Returns how many were touched.
    updateSeries(seriesId, scope, anchorId, patch) {
      let n = 0;
      commit((d) => {
        const anchor = d.events.find((e) => e.id === anchorId);
        const ids = new Set(seriesScopeIds(d.events, seriesId, scope, anchor));
        n = ids.size;
        if (!n) return d;
        const nd = { ...d, events: d.events.map((e) => (ids.has(e.id) ? { ...e, ...patch } : e)) };
        const moved = Array.isArray(patch.rooms) ? ` → ${(patch.rooms as string[]).join(', ')}` : '';
        return withAudit(nd, {
          action: `Updated ${n} event${n === 1 ? '' : 's'} in series`,
          entityType: 'booking',
          entityId: anchorId,
          entityLabel: anchor?.name ?? 'Recurring series',
          detail: (moved || '').trim() || undefined,
          link: `#/event/${anchorId}`,
        });
      });
      return n;
    },
    // Cancel (or reinstate) part of a series — reversible; cancelled occurrences
    // free their room/stock and leave the queues but stay visible.
    setSeriesCancelled(seriesId, scope, anchorId, cancelled) {
      let n = 0;
      commit((d) => {
        const anchor = d.events.find((e) => e.id === anchorId);
        const ids = new Set(seriesScopeIds(d.events, seriesId, scope, anchor));
        n = ids.size;
        if (!n) return d;
        const nd = { ...d, events: d.events.map((e) => (ids.has(e.id) ? { ...e, cancelled } : e)) };
        return withAudit(nd, {
          action: `${cancelled ? 'Cancelled' : 'Reinstated'} ${n} event${n === 1 ? '' : 's'} in series`,
          entityType: 'booking',
          entityId: anchorId,
          entityLabel: anchor?.name ?? 'Recurring series',
          link: `#/event/${anchorId}`,
        });
      });
      return n;
    },
    // ---- Teams / crew layer ----
    // Stamp a saved bundle of positions onto an event as OPEN slots, ready to
    // staff (one row per slot — "Vocals (3)" lands three). Never removes existing
    // crew; applying twice just adds another set.
    applyPositionTemplate(eventId, templateId) {
      commit((d) => {
        const tpl = (d.positionTemplates ?? []).find((t) => t.id === templateId);
        if (!tpl) return d;
        const rows: CrewAssignment[] = [];
        for (const pid of tpl.positionIds) {
          const pos = (d.crewPositions ?? []).find((p) => p.id === pid);
          if (!pos) continue;
          const slots = pos.slots ?? 1;
          for (let i = 0; i < slots; i++) {
            rows.push({ id: uid('casg'), eventId, teamId: tpl.teamId, positionId: pid, status: 'open' });
          }
        }
        const ev = d.events.find((e) => e.id === eventId);
        const team = (d.crewTeams ?? []).find((t) => t.id === tpl.teamId);
        const nd = { ...d, crewAssignments: [...(d.crewAssignments ?? []), ...rows] };
        return withAudit(nd, {
          action: `Added ${team?.name ?? 'crew'} — ${tpl.name}`,
          entityType: 'booking', entityId: eventId, entityLabel: ev?.name ?? 'Event',
          detail: `${rows.length} position${rows.length === 1 ? '' : 's'}`, link: `#/event/${eventId}`,
        });
      });
    },
    addCrewSlot(eventId, teamId, positionId) {
      commit((d) => ({
        ...d,
        crewAssignments: [...(d.crewAssignments ?? []), { id: uid('casg'), eventId, teamId, positionId, status: 'open' }],
      }));
    },
    removeCrewAssignment(id) {
      commit((d) => ({ ...d, crewAssignments: (d.crewAssignments ?? []).filter((a) => a.id !== id) }));
    },
    // Place a person on a slot. 'self' is already confirmed (no round-trip); a
    // 'request' pings the person and waits on their accept/decline.
    assignCrew(assignmentId, personId, mode) {
      const now = DEMO_TODAY.toISOString();
      commit((d) => {
        const a = (d.crewAssignments ?? []).find((x) => x.id === assignmentId);
        if (!a) return d;
        const status: CrewAssignment['status'] = mode === 'self' ? 'self' : 'requested';
        const nd = {
          ...d,
          crewAssignments: (d.crewAssignments ?? []).map((x) =>
            x.id === assignmentId
              ? { ...x, personId, status, requestedAt: now, respondedAt: mode === 'self' ? now : undefined }
              : x,
          ),
        };
        const ev = d.events.find((e) => e.id === a.eventId);
        const pos = (d.crewPositions ?? []).find((p) => p.id === a.positionId);
        const person = d.people.find((p) => p.id === personId);
        const withLog = withAudit(nd, {
          action: mode === 'self' ? `Self-assigned — ${pos?.name ?? 'crew'}` : `Requested ${person?.name ?? 'crew'} — ${pos?.name ?? ''}`,
          entityType: 'booking', entityId: a.eventId, entityLabel: ev?.name ?? 'Event', link: `#/event/${a.eventId}`,
        });
        return withLog;
      });
      // Ping the requested person (outside commit so notify composes cleanly).
      if (mode === 'request') {
        const a = (db.crewAssignments ?? []).find((x) => x.id === assignmentId);
        const ev = a && db.events.find((e) => e.id === a.eventId);
        const pos = a && (db.crewPositions ?? []).find((p) => p.id === a.positionId);
        const person = db.people.find((p) => p.id === personId);
        if (person && ev) {
          api.notify({
            to: person.name, kind: 'crew',
            title: `Serving request — ${pos?.name ?? 'crew'}`,
            body: `${ev.name} · respond in My schedule`,
            link: `#/my-schedule`,
          });
        }
      }
    },
    // Musician's accept / decline. Decline re-opens the slot for coverage but
    // keeps the row (status 'declined') so the board shows what happened.
    respondCrew(assignmentId, accept) {
      const now = DEMO_TODAY.toISOString();
      commit((d) => {
        const a = (d.crewAssignments ?? []).find((x) => x.id === assignmentId);
        if (!a) return d;
        const nd = {
          ...d,
          crewAssignments: (d.crewAssignments ?? []).map((x) =>
            x.id === assignmentId ? { ...x, status: accept ? 'accepted' : 'declined', respondedAt: now } as CrewAssignment : x,
          ),
        };
        const ev = d.events.find((e) => e.id === a.eventId);
        const pos = (d.crewPositions ?? []).find((p) => p.id === a.positionId);
        const team = (d.crewTeams ?? []).find((t) => t.id === a.teamId);
        const leader = team?.leaderPersonId ? d.people.find((p) => p.id === team.leaderPersonId) : null;
        const person = a.personId ? d.people.find((p) => p.id === a.personId) : null;
        const withLog = withAudit(nd, {
          action: `${accept ? 'Accepted' : 'Declined'} — ${pos?.name ?? 'crew'}`,
          entityType: 'booking', entityId: a.eventId, entityLabel: ev?.name ?? 'Event', link: `#/event/${a.eventId}`,
        });
        // Let the coordinator know, especially on a decline (slot needs refilling).
        if (leader && person && ev) {
          return { ...withLog, notifications: [...withLog.notifications, {
            id: uid('n'), to: leader.name, kind: 'crew' as const,
            title: `${person.name} ${accept ? 'accepted' : 'declined'} — ${pos?.name ?? 'crew'}`,
            body: ev.name, link: `#/event/${a.eventId}`, createdAt: now,
          }] };
        }
        return withLog;
      });
    },
    addBlockout(b) {
      commit((d) => ({ ...d, blockouts: [...(d.blockouts ?? []), { ...b, id: uid('blk') }] }));
    },
    removeBlockout(id) {
      commit((d) => ({ ...d, blockouts: (d.blockouts ?? []).filter((b) => b.id !== id) }));
    },
    // ---- Program containers (§13) ----
    // A new umbrella. Holds no rooms/times itself; sessions get added next and
    // carry programId back up. Starts as a Draft so the owner can assemble the
    // agenda before submitting the whole thing for approval at once.
    addProgram(p) {
      const prog: Program = { ...p, id: uid('prog') };
      commit((d) => withAudit({ ...d, programs: [...(d.programs ?? []), prog] }, {
        action: 'Created program', entityType: 'booking', entityId: prog.id, entityLabel: prog.name,
        detail: prog.startsDate === prog.endsDate ? prog.startsDate : `${prog.startsDate} → ${prog.endsDate}`,
        link: `#/program/${prog.id}`,
      }));
      return prog;
    },
    updateProgram(id, patch) {
      commit((d) => ({ ...d, programs: (d.programs ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
    },
    // Add a session to a program: a real booking that carries programId. It
    // conflict-checks, holds its room, and routes approval like any event. While
    // the program is still a Draft the session sits as Pending but isn't in
    // anyone's queue yet — submitProgram fans them all out together.
    addProgramSession(programId, e) {
      const ev: EventRec = { ...e, programId, id: uid('e') };
      commit((d) => {
        const prog = (d.programs ?? []).find((p) => p.id === programId);
        const nd = { ...d, events: [...d.events, ev] };
        return withAudit(nd, {
          action: 'Added session', entityType: 'booking', entityId: ev.id, entityLabel: ev.name,
          detail: prog ? prog.name : undefined, link: `#/event/${ev.id}`,
        });
      });
      return ev;
    },
    // Pull a session out of its program (it stays a normal standalone booking).
    detachSession(eventId) {
      commit((d) => {
        const ev = d.events.find((e) => e.id === eventId);
        if (!ev) return d;
        const nd = { ...d, events: d.events.map((e) => (e.id === eventId ? { ...e, programId: undefined } : e)) };
        return withAudit(nd, { action: 'Removed session from program', entityType: 'booking', entityId: eventId, entityLabel: ev.name, link: `#/event/${eventId}` });
      });
    },
    // Submit once → fan out (§13.6). Flips the program to Submitted; each session
    // becomes a live Pending request so its room owner sees it in their queue.
    // Approval still happens per room (reusing approvals.ts) — this just releases
    // them all at the same moment instead of one booking at a time.
    submitProgram(id) {
      commit((d) => {
        const prog = (d.programs ?? []).find((p) => p.id === id);
        if (!prog) return d;
        const nd = {
          ...d,
          programs: (d.programs ?? []).map((p) => (p.id === id ? { ...p, status: 'Submitted' as const } : p)),
          events: d.events.map((e) => (e.programId === id && !e.cancelled ? { ...e, status: 'Pending', percent_approved: 0 } : e)),
        };
        const n = nd.events.filter((e) => e.programId === id && !e.cancelled).length;
        return withAudit(nd, {
          action: 'Submitted program for approval', entityType: 'booking', entityId: id, entityLabel: prog.name,
          detail: `${n} session${n === 1 ? '' : 's'} fanned out`, link: `#/program/${id}`,
        });
      });
    },
    // Cancel cascade (§14.2-B): cancelling the program cancels every session
    // (reversible — each frees its room/stock and leaves the queues but stays
    // visible). Reinstating restores them all.
    cancelProgram(id, cancelled) {
      commit((d) => {
        const prog = (d.programs ?? []).find((p) => p.id === id);
        if (!prog) return d;
        const nd = {
          ...d,
          programs: (d.programs ?? []).map((p) => (p.id === id ? { ...p, status: (cancelled ? 'Cancelled' : 'Submitted') as Program['status'] } : p)),
          events: d.events.map((e) => (e.programId === id ? { ...e, cancelled } : e)),
        };
        const n = d.events.filter((e) => e.programId === id).length;
        return withAudit(nd, {
          action: `${cancelled ? 'Cancelled' : 'Reinstated'} program`, entityType: 'booking', entityId: id, entityLabel: prog.name,
          detail: `${n} session${n === 1 ? '' : 's'}`, link: `#/program/${id}`,
        });
      });
    },
    // ---- Event invites ----
    // Invite one person to an event. Internal invitees (with an account) get a
    // notification on their channels and can RSVP in-app; external guests get an
    // emailed RSVP link to a no-login accept page (simulated here as an email
    // channel). Either way an invite row tracks their reply.
    inviteToEvent(eventId, who) {
      const invite: EventInvite = {
        id: uid('inv'), eventId, personId: who.personId, name: who.name,
        email: who.email, role: who.role, note: who.note, busId: who.busId,
        cabinId: who.cabinId, cabinRoomId: who.cabinRoomId, cabinLeader: who.cabinLeader,
        status: 'invited', invitedAt: DEMO_TODAY.toISOString(),
      };
      commit((d) => {
        const ev = d.events.find((e) => e.id === eventId);
        const nd = withAudit({ ...d, invites: [...(d.invites ?? []), invite] }, {
          action: 'Invited to event', entityType: 'booking', entityId: eventId, entityLabel: ev?.name ?? 'Event',
          detail: who.name, link: `#/event/${eventId}`,
        });
        // Internal account → in-app + their channels. (External email is shown
        // in the invite row UI; there's no notification recipient to route to.)
        if (who.personId) {
          const person = d.people.find((p) => p.id === who.personId);
          if (person && ev) {
            const notif: Notif = {
              id: uid('n'), to: person.name, kind: 'invite',
              title: `Invitation — ${ev.name}`,
              body: who.note || 'Tap to RSVP', link: `#/invites`,
              createdAt: DEMO_TODAY.toISOString(), channels: channelsFor(person),
            };
            return { ...nd, notifications: [...nd.notifications, notif] };
          }
        }
        return nd;
      });
    },
    // RSVP (works for both the in-app My-invites screen and the public link).
    respondInvite(inviteId, status) {
      commit((d) => {
        const inv = (d.invites ?? []).find((i) => i.id === inviteId);
        if (!inv) return d;
        const nd = {
          ...d,
          invites: (d.invites ?? []).map((i) => (i.id === inviteId ? { ...i, status, respondedAt: DEMO_TODAY.toISOString() } : i)),
        };
        const ev = d.events.find((e) => e.id === inv.eventId);
        const withLog = withAudit(nd, {
          action: `RSVP ${status}`, entityType: 'booking', entityId: inv.eventId, entityLabel: ev?.name ?? 'Event',
          detail: inv.name, link: `#/event/${inv.eventId}`,
        });
        // Let the organizer know how each guest replied.
        if (ev?.owner) {
          return { ...withLog, notifications: [...withLog.notifications, {
            id: uid('n'), to: ev.owner, kind: 'invite' as const,
            title: `${inv.name} ${status} — ${ev.name}`, link: `#/event/${inv.eventId}`,
            createdAt: DEMO_TODAY.toISOString(),
          }] };
        }
        return withLog;
      });
    },
    removeInvite(inviteId) {
      commit((d) => ({ ...d, invites: (d.invites ?? []).filter((i) => i.id !== inviteId) }));
    },
    // Day-of reminder for a single invitee who hasn't replied. Re-pings an
    // internal account; for an external guest it "resends the email."
    remindInvite(inviteId) {
      commit((d) => {
        const inv = (d.invites ?? []).find((i) => i.id === inviteId);
        if (!inv) return d;
        const ev = d.events.find((e) => e.id === inv.eventId);
        const nd = {
          ...d,
          invites: (d.invites ?? []).map((i) => (i.id === inviteId ? { ...i, remindedAt: DEMO_TODAY.toISOString() } : i)),
        };
        const withLog = withAudit(nd, {
          action: 'Sent day-of reminder', entityType: 'booking', entityId: inv.eventId, entityLabel: ev?.name ?? 'Event',
          detail: inv.name, link: `#/event/${inv.eventId}`,
        });
        if (inv.personId) {
          const person = d.people.find((p) => p.id === inv.personId);
          if (person && ev) {
            return { ...withLog, notifications: [...withLog.notifications, {
              id: uid('n'), to: person.name, kind: 'invite' as const,
              title: `Reminder — ${ev.name} is today`, body: 'You haven’t RSVP’d yet — tap to reply',
              link: `#/invites`, createdAt: DEMO_TODAY.toISOString(), channels: channelsFor(person),
            }] };
          }
        }
        return withLog;
      });
    },
    // Fire reminders to everyone on an event who still hasn't replied. Returns
    // how many went out.
    remindAllDue(eventId) {
      let n = 0;
      commit((d) => {
        const ev = d.events.find((e) => e.id === eventId);
        const now = DEMO_TODAY.toISOString();
        const targets = (d.invites ?? []).filter((i) => i.eventId === eventId && i.status === 'invited' && !i.remindedAt);
        n = targets.length;
        if (!n) return d;
        const targetIds = new Set(targets.map((t) => t.id));
        const newNotifs: Notif[] = [];
        for (const t of targets) {
          if (t.personId) {
            const person = d.people.find((p) => p.id === t.personId);
            if (person && ev) newNotifs.push({
              id: uid('n'), to: person.name, kind: 'invite',
              title: `Reminder — ${ev.name} is today`, body: 'You haven’t RSVP’d yet — tap to reply',
              link: `#/invites`, createdAt: now, channels: channelsFor(person),
            });
          }
        }
        const nd = {
          ...d,
          invites: (d.invites ?? []).map((i) => (targetIds.has(i.id) ? { ...i, remindedAt: now } : i)),
          notifications: [...d.notifications, ...newNotifs],
        };
        return withAudit(nd, {
          action: `Sent ${n} day-of reminder${n === 1 ? '' : 's'}`, entityType: 'booking', entityId: eventId,
          entityLabel: ev?.name ?? 'Event', link: `#/event/${eventId}`,
        });
      });
      return n;
    },
    // ---- Camp buses (rental, surfaced as rooms) ----
    // Charter a bus for a camp. It's added as a rental Room too, so "everything
    // is a space" — campers get assigned to it and it shows in Spaces, clearly
    // marked rental (not the school's fleet).
    addCampBus(eventId, bus) {
      const roomId = uid('busroom');
      const cb: CampBus = {
        id: uid('bus'), eventId, roomId, name: bus.name.trim(),
        label: bus.label?.trim() || undefined, capacity: bus.capacity,
        rentalOrg: bus.rentalOrg?.trim() || undefined, departInfo: bus.departInfo?.trim() || undefined,
      };
      const room: Room = {
        id: roomId, name: cb.label ? `${cb.name} — ${cb.label}` : cb.name,
        folder: 'Camp buses (rental)', isBus: true, rental: true,
        ...(bus.capacity ? { capacity: bus.capacity } : {}),
      };
      commit((d) => {
        const ev = d.events.find((e) => e.id === eventId);
        return withAudit({ ...d, campBuses: [...(d.campBuses ?? []), cb], rooms: [...d.rooms, room] }, {
          action: 'Added camp bus', entityType: 'booking', entityId: eventId, entityLabel: ev?.name ?? 'Camp',
          detail: `${cb.name}${cb.rentalOrg ? ` · ${cb.rentalOrg}` : ''}`, link: `#/event/${eventId}`,
        });
      });
    },
    removeCampBus(busId) {
      commit((d) => {
        const bus = (d.campBuses ?? []).find((b) => b.id === busId);
        return {
          ...d,
          campBuses: (d.campBuses ?? []).filter((b) => b.id !== busId),
          rooms: d.rooms.filter((r) => r.id !== bus?.roomId),
          // Un-assign anyone who was on it (their invite stays, bus cleared).
          invites: (d.invites ?? []).map((i) => (i.busId === busId ? { ...i, busId: undefined } : i)),
        };
      });
    },
    // Move a camper onto (or off, busId undefined) a bus.
    assignToBus(inviteId, busId) {
      commit((d) => ({
        ...d,
        invites: (d.invites ?? []).map((i) => (i.id === inviteId ? { ...i, busId } : i)),
      }));
    },
    // ---- Camp cabins (lodging) ----
    // A cabin is event lodging surfaced as a room (folder "Camp cabins"). Simple
    // mode carries a bed count; detailed mode adds rooms-within (see addCabinRoom).
    addCampCabin(eventId, cabin) {
      const roomId = uid('cabinroom');
      const cb: CampCabin = { id: uid('cabin'), eventId, roomId, name: cabin.name.trim(), kind: cabin.kind, beds: cabin.beds };
      const room: Room = {
        id: roomId, name: cb.name, folder: 'Camp cabins', isCabin: true,
        ...(cabin.beds ? { capacity: cabin.beds } : {}),
      };
      commit((d) => {
        const ev = d.events.find((e) => e.id === eventId);
        return withAudit({ ...d, campCabins: [...(d.campCabins ?? []), cb], rooms: [...d.rooms, room] }, {
          action: 'Added cabin', entityType: 'booking', entityId: eventId, entityLabel: ev?.name ?? 'Camp',
          detail: `${cb.name} · ${cb.kind}`, link: `#/event/${eventId}`,
        });
      });
    },
    removeCampCabin(cabinId) {
      commit((d) => {
        const cabin = (d.campCabins ?? []).find((c) => c.id === cabinId);
        const roomIds = new Set((d.cabinRooms ?? []).filter((r) => r.cabinId === cabinId).map((r) => r.id));
        return {
          ...d,
          campCabins: (d.campCabins ?? []).filter((c) => c.id !== cabinId),
          cabinRooms: (d.cabinRooms ?? []).filter((r) => r.cabinId !== cabinId),
          rooms: d.rooms.filter((r) => r.id !== cabin?.roomId),
          // Clear anyone who was housed there.
          invites: (d.invites ?? []).map((i) =>
            i.cabinId === cabinId || (i.cabinRoomId && roomIds.has(i.cabinRoomId))
              ? { ...i, cabinId: undefined, cabinRoomId: undefined, cabinLeader: undefined }
              : i,
          ),
        };
      });
    },
    addCabinRoom(cabinId, room) {
      const cr: CabinRoom = { id: uid('croom'), cabinId, name: room.name.trim(), beds: room.beds };
      commit((d) => ({ ...d, cabinRooms: [...(d.cabinRooms ?? []), cr] }));
    },
    removeCabinRoom(roomId) {
      commit((d) => ({
        ...d,
        cabinRooms: (d.cabinRooms ?? []).filter((r) => r.id !== roomId),
        invites: (d.invites ?? []).map((i) => (i.cabinRoomId === roomId ? { ...i, cabinRoomId: undefined } : i)),
      }));
    },
    // House someone in a cabin (and optionally a room within). Pass undefined to
    // move them out.
    assignToCabin(inviteId, cabinId, cabinRoomId) {
      commit((d) => ({
        ...d,
        invites: (d.invites ?? []).map((i) =>
          i.id === inviteId ? { ...i, cabinId, cabinRoomId: cabinId ? cabinRoomId : undefined } : i,
        ),
      }));
    },
    setCabinLeader(inviteId, leader) {
      commit((d) => ({
        ...d,
        invites: (d.invites ?? []).map((i) => (i.id === inviteId ? { ...i, cabinLeader: leader } : i)),
      }));
    },
    // ---- Camp roles & shifts ----
    addCampRole(eventId, role) {
      const r: CampRole = { id: uid('crole'), eventId, name: role.name.trim(), icon: role.icon, blurb: role.blurb?.trim() || undefined };
      commit((d) => {
        const ev = d.events.find((e) => e.id === eventId);
        return withAudit({ ...d, campRoles: [...(d.campRoles ?? []), r] }, {
          action: 'Added camp role', entityType: 'booking', entityId: eventId, entityLabel: ev?.name ?? 'Camp',
          detail: r.name, link: `#/event/${eventId}`,
        });
      });
    },
    removeCampRole(roleId) {
      commit((d) => {
        const shiftIds = new Set((d.campShifts ?? []).filter((s) => s.roleId === roleId).map((s) => s.id));
        return {
          ...d,
          campRoles: (d.campRoles ?? []).filter((r) => r.id !== roleId),
          campShifts: (d.campShifts ?? []).filter((s) => s.roleId !== roleId),
          campDuties: (d.campDuties ?? []).filter((du) => du.roleId !== roleId && !(du.shiftId && shiftIds.has(du.shiftId))),
        };
      });
    },
    addCampShift(roleId, shift) {
      const s: CampShift = { id: uid('cshift'), roleId, name: shift.name.trim(), start: shift.start, end: shift.end };
      commit((d) => ({ ...d, campShifts: [...(d.campShifts ?? []), s] }));
    },
    removeCampShift(shiftId) {
      commit((d) => ({
        ...d,
        campShifts: (d.campShifts ?? []).filter((s) => s.id !== shiftId),
        campDuties: (d.campDuties ?? []).filter((du) => du.shiftId !== shiftId),
      }));
    },
    // Put an adult on a role (and optionally a shift).
    assignDuty(eventId, roleId, who) {
      const duty: CampDuty = { id: uid('cduty'), eventId, roleId, shiftId: who.shiftId, personId: who.personId, name: who.name.trim(), email: who.email };
      commit((d) => ({ ...d, campDuties: [...(d.campDuties ?? []), duty] }));
    },
    removeDuty(dutyId) {
      commit((d) => ({ ...d, campDuties: (d.campDuties ?? []).filter((du) => du.id !== dutyId) }));
    },
    reset() {
      void clearDB();
      setDb(buildSeed());
    },
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside provider');
  return c;
}

// convenient grouping for the directory views
export function groupByFolder<T extends { folder: string }>(items: T[]): { name: string; items: T[] }[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const it of items) {
    if (!map.has(it.folder)) {
      map.set(it.folder, []);
      order.push(it.folder);
    }
    map.get(it.folder)!.push(it);
  }
  return order.map((name) => ({ name, items: map.get(name)! }));
}
