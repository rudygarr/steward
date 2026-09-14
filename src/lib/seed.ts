import rawEvents from '../data/events.json';
import rawPeople from '../data/people.json';
import rawPublic from '../data/public-events.json';
import rawAthletic from '../data/athletic-events.json';
import { roomFolders, resourceFolders } from '../data/inventory';
import { seedDrivers, seedWorkItems, seedTemplates, deptStaff } from '../data/fulfillment';
import { seedAssets } from '../data/assets';
import { isVehicle, busPhoto } from './busPhoto';
import { DEMO_TODAY } from './data';
import type {
  Database, EventRec, PersonRec, WcsEvent, Person, Notif, ConflictNote, Rental, AuditEntry, RequestComment, CalendarView,
  CrewTeam, CrewPosition, CrewMember, PositionTemplate, CrewAssignment, Blockout, Program, GuardShift, EventInvite, CampBus, Room, CampCabin, CabinRoom, CampRole, CampShift, CampDuty,
} from './types';

// Bump this whenever the seed data changes (new events, people, rooms…).
// On load, any saved DB with an older version is thrown out and rebuilt from
// the new seed, so returning visitors don't get stuck on stale demo data.
export const SEED_VERSION = 34;

// Max occupancy per room. Rooms not listed are uncapped / not capacity-tracked.
const ROOM_CAPACITY: Record<string, number> = {
  'Lighthouse Theater': 450,
  'The Lighthouse Studio': 60,
  'Green Room': 20,
  'White Room': 20,
  'Art Gallery': 80,
  'Theatre class room': 30,
  'Band Room': 60,
  'Beacon Hall': 300,
  'Rehearsal Studio (Orchestra Classroom)': 50,
  'B 202 Choir Classroom': 40,
  'B 201 Dance Classroom': 30,
  'TIDE Conference Room': 16,
  'MS Conference Room': 14,
  'Gym': 1200,
  'SAC': 600,
  'ES Gym': 300,
  'NC101 Classroom': 28,
  'NC102 Classroom': 28,
};

// How many of each countable resource the school owns. Resources not listed
// here are services/personnel and aren't stock-tracked. (See lib/stock.)
const RESOURCE_STOCK: Record<string, number> = {
  'Chairs': 250,
  'Student Chairs': 400,
  'Table (rectangle)': 40,
  'Table (round)': 30,
  'Table (cafeteria-style)': 24,
  'Podium': 4,
  'Big Fan (Box Fan)': 8,
  'Tent': 6,
  'Choral (Rolling) Risers': 4,
  'Platforms': 12,
  'Microphone (hand-held)': 8,
  'Microphone (headset)': 6,
  'Portable Microphone/Speaker': 6,
  'Choir Mics': 16,
  'LED Screen': 2,
  'Projector Screen': 6,
  'Projector/Screen': 10,
  'TV': 15,
  'Owl Camera': 12,
  'Band Shell': 1,
  // School-wide nursing pool: two nurses cover the whole campus. Booking one onto
  // a field trip leaves one; a third request in a day trips the soft over-allocation
  // warning. (Athletic Trainer is deliberately omitted — elastic, AD-managed.)
  'Nurse': 2,
};

// Two big back-to-back events on DEMO_TODAY that together oversubscribe the
// chair and round-table stock — seeds a live inventory over-allocation so the
// availability warnings have something to show.
function seedInventoryDemand(): EventRec[] {
  const base = {
    all_day: false,
    setup_starts: null,
    teardown_ends: null,
    recurrence: null,
    percent_approved: 100,
    status: 'Approved',
    source: 'internal' as const,
    kind: 'booking' as const,
  };
  return [
    {
      ...base,
      id: 'e-inv-1',
      name: 'WCS Fall Open House',
      owner: 'Sherry Medder',
      location: 'Beacon Hall',
      rooms: ['Beacon Hall'],
      resources: ['Chairs', 'Table (round)', 'Microphone (hand-held)'],
      resourceQty: { 'Chairs': 200, 'Table (round)': 30, 'Microphone (hand-held)': 2 },
      starts_at: '2026-08-20T22:00:00.000Z', // 6pm EDT
      ends_at: '2026-08-21T01:00:00.000Z',
      details: 'Campus-wide open house for prospective families.',
      // FSAutomation demo: Beacon Hall climate + lighting warm up an hour ahead.
      climate: { hvac: true, lighting: true, preStartMin: 60 },
    },
    {
      ...base,
      id: 'e-inv-2',
      name: 'New Family Welcome Reception',
      owner: 'Lori Sakkab',
      location: 'ES Courtyard/Field',
      rooms: ['ES Courtyard/Field'],
      resources: ['Chairs', 'Table (round)'],
      resourceQty: { 'Chairs': 120, 'Table (round)': 12 },
      starts_at: '2026-08-20T15:00:00.000Z', // 11am EDT
      ends_at: '2026-08-20T17:00:00.000Z',
      checkInAt: '2026-08-20T15:02:00.000Z', // confirmed — keeps this an inventory demo, not a no-show
      details: 'Reception for newly enrolled families.',
    },
    // Buffer-only clash in the Gym on DEMO_TODAY: practice ends 10:00 but tears
    // down till 10:30, while PE setup starts 10:15 — the events don't overlap,
    // but the room can't be flipped in time.
    {
      ...base,
      id: 'e-buf-1',
      name: 'JV Volleyball Practice',
      owner: 'Adriana Marrero',
      location: 'Gym',
      rooms: ['Gym'],
      resources: [],
      setup_starts: null,
      teardown_ends: '2026-08-20T14:30:00.000Z', // 10:30 EDT
      starts_at: '2026-08-20T12:00:00.000Z', // 8:00 EDT
      ends_at: '2026-08-20T14:00:00.000Z', // 10:00 EDT
      details: 'Tear-down of nets & standards runs ~30 min past practice.',
    },
    {
      ...base,
      id: 'e-buf-2',
      name: 'MS PE Class',
      owner: 'Adriana Marrero',
      location: 'Gym',
      rooms: ['Gym'],
      resources: [],
      setup_starts: '2026-08-20T14:15:00.000Z', // 10:15 EDT
      teardown_ends: null,
      starts_at: '2026-08-20T14:30:00.000Z', // 10:30 EDT
      ends_at: '2026-08-20T16:00:00.000Z', // 12:00 EDT
      details: 'Needs the floor set before students arrive.',
    },
  ];
}

// A weekly recurring booking that demos series management (item S4): eight
// Thursday rehearsals sharing one seriesId, so the whole run can be moved,
// cancelled, or reinstated together from any occurrence. Starts on DEMO_TODAY.
function seedSeries(): EventRec[] {
  const base = {
    all_day: false,
    setup_starts: null,
    teardown_ends: null,
    percent_approved: 100,
    status: 'Approved',
    source: 'internal' as const,
    kind: 'booking' as const,
    resources: [],
    owner: 'Rudy Garrido',
    location: 'Band Room',
    rooms: ['Band Room'],
    recurrence: 'Weekly through Oct 8',
  };
  const startUTC = Date.UTC(2026, 7, 20, 19, 30); // Aug 20, 3:30pm EDT
  const out: EventRec[] = [];
  for (let i = 0; i < 8; i++) {
    const s = new Date(startUTC + i * 7 * 86400000);
    const e = new Date(startUTC + i * 7 * 86400000 + 90 * 60000);
    out.push({
      ...base,
      id: `e-ser-${i + 1}`,
      seriesId: 'ser-demo-rehearsal',
      name: 'Worship Team Rehearsal',
      starts_at: s.toISOString(),
      ends_at: e.toISOString(),
      details: 'Weekly student worship band rehearsal.',
    });
  }
  return out;
}

// Staff-coverage demo (Nurse / Athletic Trainer). On DEMO_TODAY a field trip
// takes one nurse off-campus and an on-campus physicals clinic books the other,
// so the school-wide pool reads 0 of 2 free — exactly the "who's covered today?"
// signal. A home volleyball game requests the (uncapped) athletic trainer to show
// demand the AD then staffs.
function seedCoverageDemo(): EventRec[] {
  const base = {
    all_day: false,
    setup_starts: null,
    teardown_ends: null,
    recurrence: null,
    percent_approved: 100,
    status: 'Approved',
    source: 'internal' as const,
    kind: 'booking' as const,
  };
  return [
    {
      ...base,
      id: 'e-cov-1',
      name: '5th Grade Field Trip — Zoo Miami',
      owner: 'Lori Sakkab',
      location: 'Off campus — Zoo Miami',
      rooms: [],
      resources: ['Nurse'],
      resourceQty: { 'Nurse': 1 },
      audience: 'Elementary',
      starts_at: '2026-08-20T13:00:00.000Z', // 9am EDT
      ends_at: '2026-08-20T18:00:00.000Z', // 2pm EDT
      details: 'Off-campus field trip — a campus nurse travels with the group, so one of the two is out today.',
    },
    {
      ...base,
      id: 'e-cov-2',
      name: 'Fall Sports Physicals',
      owner: 'Adriana Marrero',
      location: 'SAC',
      rooms: ['SAC'],
      resources: ['Nurse'],
      resourceQty: { 'Nurse': 1 },
      category: 'Athletics',
      starts_at: '2026-08-20T17:00:00.000Z', // 1pm EDT
      ends_at: '2026-08-20T20:00:00.000Z', // 4pm EDT
      details: 'On-campus physicals clinic books the second nurse. With both committed, no nurse is free for a new request today.',
    },
    {
      ...base,
      id: 'e-cov-3',
      name: 'Varsity Volleyball vs Gulliver Prep',
      owner: 'Adriana Marrero',
      location: 'Gym',
      rooms: ['Gym'],
      resources: ['Athletic Trainer'],
      category: 'Athletics',
      homeAway: 'Home',
      starts_at: '2026-08-20T22:30:00.000Z', // 6:30pm EDT
      ends_at: '2026-08-21T00:30:00.000Z', // 8:30pm EDT
      details: 'Home game — athletic trainer requested. The AD assigns a trainer (staff or seasonal intern); the request is visible here so coverage is planned.',
    },
  ];
}

// Three bookings on DEMO_TODAY (noon EDT) that show the check-in lifecycle:
// one awaiting confirmation (owned by the default demo user, so the Home
// check-in card shows), one already checked in, and one no-show the admin can
// reclaim. See lib/checkin.
function seedCheckinDemo(): EventRec[] {
  const base = {
    all_day: false,
    setup_starts: null,
    teardown_ends: null,
    recurrence: null,
    percent_approved: 100,
    status: 'Approved',
    source: 'internal' as const,
    kind: 'booking' as const,
    resources: [],
  };
  return [
    {
      ...base,
      id: 'e-ci-open',
      name: 'Admissions Family Tour',
      owner: 'Rudy Garrido',
      location: 'TIDE Conference Room',
      rooms: ['TIDE Conference Room'],
      starts_at: '2026-08-20T16:00:00.000Z', // 12:00 EDT — check-in window open now
      ends_at: '2026-08-20T17:00:00.000Z',
      expectedAttendance: 8,
      details: 'Walkthrough for a prospective family.',
    },
    {
      ...base,
      id: 'e-ci-in',
      name: 'Chapel Rehearsal',
      owner: 'Adriana Marrero',
      location: 'Lighthouse Theater',
      rooms: ['Lighthouse Theater'],
      starts_at: '2026-08-20T15:30:00.000Z', // 11:30 EDT
      ends_at: '2026-08-20T16:30:00.000Z',
      checkInAt: '2026-08-20T15:33:00.000Z', // confirmed on time
      details: 'Worship team run-through.',
    },
    {
      ...base,
      id: 'e-ci-noshow',
      name: 'Parent Volunteer Meeting',
      owner: 'Vicki Kaplan',
      location: 'Green Room',
      rooms: ['Green Room'],
      starts_at: '2026-08-20T15:30:00.000Z', // 11:30 EDT — past grace, still in window now
      ends_at: '2026-08-20T17:00:00.000Z', // 1:00 EDT
      details: 'No one checked in — slot can be reclaimed.',
    },
  ];
}

// External facility rentals — the community/booster/outside-org bookings WCS
// actually takes. Spread across the lifecycle so the ledger shows every state:
// a confirmed church with only the invoice outstanding, a tentative league still
// missing its COI, a fresh inquiry, and a closed-out reunion. The confirmed one
// also carries a real calendar event so it conflict-checks like any booking.
function seedRentals(): { rentals: Rental[]; events: EventRec[] } {
  const rentals: Rental[] = [
    {
      id: 'rent-1',
      org: 'Grace Community Church',
      contact: 'Pastor Daniel Reyes',
      email: 'office@gracecommunity.org',
      phone: '305-555-0211',
      purpose: 'Sunday worship service',
      room: 'Lighthouse Theater',
      date: '2026-08-23',
      startTime: '08:00',
      endTime: '12:00',
      attendance: 220,
      status: 'Confirmed',
      fee: 1200,
      deposit: 500,
      coi: 'received',
      depositStatus: 'paid',
      invoiceStatus: 'invoiced', // billed, not yet paid — the one open item
      notes: 'Recurring summer arrangement while their building is renovated.',
      eventId: 'rent-evt-1',
      createdAt: '2026-07-30T10:00:00-04:00',
    },
    {
      id: 'rent-2',
      org: 'Kendall Youth Soccer League',
      contact: 'Marisol Peña',
      email: 'kysl.fields@gmail.com',
      phone: '305-555-0288',
      purpose: 'Saturday match day (U10–U14)',
      room: 'Main Football Field',
      date: '2026-08-29',
      startTime: '09:00',
      endTime: '15:00',
      attendance: 180,
      status: 'Tentative',
      fee: 800,
      deposit: 300,
      coi: 'pending', // blocks confirmation until on file
      depositStatus: 'unpaid',
      invoiceStatus: 'unpaid',
      notes: 'Waiting on their certificate of insurance before we confirm.',
      createdAt: '2026-08-12T14:20:00-04:00',
    },
    {
      id: 'rent-3',
      org: 'Miami Robotics Co-op',
      contact: 'Henry Okafor',
      email: 'hello@miamirobotics.org',
      purpose: 'Weekend STEM workshop',
      room: 'Beacon Hall',
      date: '2026-09-12',
      startTime: '09:00',
      endTime: '16:00',
      attendance: 60,
      status: 'Inquiry',
      fee: 0, // not quoted yet
      deposit: 0,
      coi: 'pending',
      depositStatus: 'unpaid',
      invoiceStatus: 'unpaid',
      notes: 'New inquiry — needs a quote and a walkthrough.',
      createdAt: '2026-08-18T09:05:00-04:00',
    },
    {
      id: 'rent-4',
      org: 'Westminster Alumni Association',
      contact: 'Carla Domínguez',
      email: 'alumni@wcsmiami.org',
      purpose: 'Class of 2016 reunion dinner',
      room: 'Beacon Hall',
      date: '2026-06-06',
      startTime: '18:00',
      endTime: '22:00',
      attendance: 140,
      status: 'Completed',
      fee: 2000,
      deposit: 500,
      coi: 'received',
      depositStatus: 'paid',
      invoiceStatus: 'paid', // fully closed out
      createdAt: '2026-04-15T11:00:00-04:00',
    },
  ];
  // Calendar events for confirmed rentals (built to match the store's builder).
  const events: EventRec[] = [
    {
      ...base,
      id: 'rent-evt-1',
      name: 'Sunday worship service (Grace Community Church)',
      kind: 'booking',
      all_day: false,
      starts_at: '2026-08-23T08:00:00-04:00',
      ends_at: '2026-08-23T12:00:00-04:00',
      location: 'Lighthouse Theater',
      owner: 'Grace Community Church',
      details: 'External rental — Grace Community Church. Contact: Pastor Daniel Reyes.',
      rooms: ['Lighthouse Theater'],
      resources: [],
      source: 'internal',
      category: 'Rental',
      expectedAttendance: 220,
    },
  ];
  return { rentals, events };
}

// Derive starter notifications from the seeded assignments, so each crew
// member already has a ringing bell when you "view as" them.
function seedNotifs(): Notif[] {
  const out: Notif[] = [];
  for (const w of seedWorkItems) {
    if (w.assignee) {
      out.push({
        id: `n-${w.id}-a`,
        to: w.assignee,
        kind: 'assigned',
        title: `New task: ${w.title}`,
        body: w.location ?? undefined,
        link: `#/work/${w.id}`,
        createdAt: w.createdAt,
      });
    }
    w.trip?.legs.forEach((l, i) => {
      if (l.driver) {
        out.push({
          id: `n-${w.id}-l${i}`,
          to: l.driver,
          kind: 'assigned',
          title: `You're driving: ${w.title}`,
          body: w.trip?.destination ?? undefined,
          link: `#/work/${w.id}`,
          createdAt: w.createdAt,
        });
      }
    });
  }
  // Seed delivery channels so the bell shows the email/Teams stand-ins live.
  return out.map((n) => ({ ...n, channels: ['in-app', 'email', 'teams'] as Notif['channels'] }));
}

// A seeded example of the conflict-as-conversation feature: two owners (Dance
// tech vs. the Spelling Bee) negotiating the Lighthouse Theater. Left OPEN so a
// demo can read the thread and resolve it live. Keyed by the sorted event-id
// pair (e-311/e-312, deterministic from events.json order) — see
// conflicts.conflictKey. If that order shifts, the thread simply won't attach.
function seedConflictNotes(): ConflictNote[] {
  const key = 'e-311|e-312';
  return [
    {
      id: 'cn-seed-1',
      conflictKey: key,
      author: 'Vicki Kaplan',
      body: 'Hi Adriana — the MS Spelling Bee is set for the Theater that morning. Any chance dance tech can start a little later?',
      at: '2026-11-05T14:10:00Z',
      kind: 'note',
    },
    {
      id: 'cn-seed-2',
      conflictKey: key,
      author: 'Adriana Marrero',
      body: 'We need the stage early for lighting, but we can hold the house until you wrap. Want to share the morning?',
      at: '2026-11-05T15:02:00Z',
      kind: 'note',
    },
  ];
}

// A few days of prior history so the audit trail reads as a living ledger on
// first load, not an empty page. Timestamps sit in the days before DEMO_TODAY
// (2026-08-20T16:00Z) and reference real seeded records so the links resolve.
function seedAudit(): AuditEntry[] {
  return [
    { id: 'au-1', at: '2026-08-13T18:22:00Z', actor: 'Rudy Garrido', action: 'New rental inquiry', entityType: 'rental', entityId: 'rent-1', entityLabel: 'Grace Community Church', detail: 'Beacon Hall · Sunday services', link: '#/rental/rent-1' },
    { id: 'au-2', at: '2026-08-14T15:05:00Z', actor: 'Rudy Garrido', action: 'COI: received', entityType: 'rental', entityId: 'rent-1', entityLabel: 'Grace Community Church', detail: 'pending → received', link: '#/rental/rent-1' },
    { id: 'au-3', at: '2026-08-14T15:06:00Z', actor: 'Rudy Garrido', action: 'Confirmed rental', entityType: 'rental', entityId: 'rent-1', entityLabel: 'Grace Community Church', detail: 'Added to calendar', link: '#/rental/rent-1' },
    { id: 'au-4', at: '2026-08-17T13:40:00Z', actor: 'Vicki Kaplan', action: 'Approved booking', entityType: 'approval', entityId: 'e-ci-open', entityLabel: 'Admissions Family Tour', detail: 'Administration', link: '#/event/e-ci-open' },
    { id: 'au-5', at: '2026-08-18T14:12:00Z', actor: 'Daniel Pérez', action: 'Marked In progress', entityType: 'work', entityId: 'w-m3', entityLabel: 'Room 204 AC not cooling', detail: 'Assigned → In progress', link: '#/work/w-m3' },
    { id: 'au-6', at: '2026-08-18T20:35:00Z', actor: 'Carlos Rivera', action: 'Logged service', entityType: 'asset', entityId: 'as-1', entityLabel: 'WCS-HVAC-001 · Gym Rooftop Unit RTU-1', detail: 'Replaced return-air filter', link: '#/asset/as-1' },
    { id: 'au-7', at: '2026-08-19T16:48:00Z', actor: 'Vicki Kaplan', action: 'Accepted overlap', entityType: 'conflict', entityLabel: 'Shared / accepted double-booking', detail: 'Theater shared — dance holds the stage, bee takes the house' },
    { id: 'au-8', at: '2026-08-20T12:30:00Z', actor: 'Rudy Garrido', action: 'Invoice: invoiced', entityType: 'rental', entityId: 'rent-1', entityLabel: 'Grace Community Church', detail: 'unpaid → invoiced', link: '#/rental/rent-1' },
    { id: 'au-9', at: '2026-08-20T13:15:00Z', actor: 'Carl Joseph', action: 'Checked in', entityType: 'booking', entityId: 'e-ci-in', entityLabel: 'Chapel Rehearsal', link: '#/event/e-ci-in' },
  ];
}

// A short conversation on a request, so the discussion thread isn't empty on
// first load. Anchored to w-m3 (Amy Williams → Jose Oviedo, the warm classroom).
function seedComments(): RequestComment[] {
  return [
    { id: 'cm-1', entityId: 'w-m3', author: 'Amy Williams', body: "Thanks for picking this up. It's worst right after lunch — is there anything we can do before Friday's parent visits?", at: '2026-08-19T13:10:00-04:00' },
    { id: 'cm-2', entityId: 'w-m3', author: 'Jose Oviedo', body: 'Looked at it this morning — the unit is low on refrigerant. Ordered the part, scheduling the fix for the 21st. I dropped a portable AC in the room for now.', at: '2026-08-19T15:42:00-04:00' },
    { id: 'cm-3', entityId: 'w-m3', author: 'Amy Williams', body: 'The portable unit is helping a lot, thank you! Friday should be fine.', at: '2026-08-20T09:05:00-04:00' },
  ];
}

// Shared starter calendar views, so the saved-view bar isn't empty on first
// load. Users can add their own on top (scoped to them).
function seedCalendarViews(): CalendarView[] {
  return [
    { id: 'cv-ath', name: 'Athletics', owner: '', shared: true, scope: 'school', folders: ['Athletics'], hideNotices: false },
    { id: 'cv-arts', name: 'Performing arts', owner: '', shared: true, scope: 'school', folders: ['Lighthouse PAC', 'The Beacon'], hideNotices: false },
    { id: 'cv-clean', name: 'Spaces only', owner: '', shared: true, scope: 'school', folders: [], hideNotices: true },
  ];
}

// ---- Teams / crew layer seed (services-module-spec §5 + §9) ----
// Two teams: a partially-staffed Chapel (every assignment state visible at once)
// and an UN-staffed Band Concert left open on purpose, so the demo can run the
// §9 walkthrough live (stamp a template, self-assign, request students).
interface CrewSeed {
  people: PersonRec[];
  events: EventRec[];
  teams: CrewTeam[];
  positions: CrewPosition[];
  members: CrewMember[];
  templates: PositionTemplate[];
  assignments: CrewAssignment[];
  blockouts: Blockout[];
}

function seedCrew(basePeople: PersonRec[]): CrewSeed {
  const NOW = DEMO_TODAY.toISOString();
  const rudyId = basePeople.find((p) => p.name === 'Rudy Garrido')?.id ?? 'p-0';
  // Synthetic students + a staff worship director. Public repo → @demo emails.
  const mk = (i: number, name: string): PersonRec => ({
    id: `cp-${i}`,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@demo.wcsmiami.org`,
    event: '', rooms: '', resources: '', people: '',
    resolves_conflicts: false, site_admin: false,
  });
  const P = {
    grace: mk(0, 'Grace Okafor'),
    maya: mk(1, 'Maya Delgado'),
    eli: mk(2, 'Eli Robinson'),
    sofia: mk(3, 'Sofia Marin'),
    caleb: mk(4, 'Caleb Tan'),
    hannah: mk(5, 'Hannah Brooks'),
    noah: mk(6, 'Noah Park'),
    diego: mk(7, 'Diego Ramos'),
    ava: mk(8, 'Ava Chen'),
    tyler: mk(9, 'Tyler Nguyen'),
    jordan: mk(10, 'Jordan Blake'),
  };
  const people = Object.values(P);

  const teams: CrewTeam[] = [
    { id: 'tw', name: 'Chapel Worship', icon: 'ti-music', blurb: 'Student worship band for weekly chapel.', leaderPersonId: P.grace.id },
    { id: 'tp', name: 'Production Services', icon: 'ti-broadcast', blurb: 'Media Services crew — sound, lights, camera, livestream for any event.', leaderPersonId: rudyId },
  ];

  // Positions (slots default 1; Vocals carries 3).
  let psort = 0;
  const pos = (teamId: string, name: string, slots?: number): CrewPosition => ({
    id: `pos-${teamId}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
    teamId, name, sort: psort++, ...(slots ? { slots } : {}),
  });
  const W = {
    leader: pos('tw', 'Worship Leader'),
    keys: pos('tw', 'Keys'),
    acoustic: pos('tw', 'Acoustic Guitar'),
    bass: pos('tw', 'Bass'),
    drums: pos('tw', 'Drums'),
    vocals: pos('tw', 'Vocals', 3),
  };
  const PR = {
    foh: pos('tp', 'FOH Sound'),
    mons: pos('tp', 'Monitors'),
    lx: pos('tp', 'Lighting'),
    cam1: pos('tp', 'Camera 1'),
    cam2: pos('tp', 'Camera 2'),
    stream: pos('tp', 'Livestream'),
    slides: pos('tp', 'ProPresenter / Slides'),
    sm: pos('tp', 'Stage Manager'),
    tech: pos('tp', 'AV Tech'),
    caster: pos('tp', 'Commentator / Scorebug'),
  };
  const positions: CrewPosition[] = [...Object.values(W), ...Object.values(PR)];

  // Member qualifications. Maya serves on BOTH teams (cross-team student).
  const mem = (teamId: string, person: PersonRec, positionIds: string[]): CrewMember => ({
    id: `cm-${teamId}-${person.id}`, teamId, personId: person.id, positionIds,
  });
  const members: CrewMember[] = [
    mem('tw', P.grace, [W.leader.id, W.vocals.id]),
    mem('tw', P.maya, [W.keys.id, W.vocals.id]),
    mem('tw', P.eli, [W.acoustic.id, W.leader.id]),
    mem('tw', P.sofia, [W.vocals.id]),
    mem('tw', P.caleb, [W.bass.id]),
    mem('tw', P.hannah, [W.drums.id]),
    mem('tw', P.noah, [W.vocals.id, W.keys.id]),
    // Production
    mem('tp', { id: rudyId } as PersonRec, [PR.foh.id, PR.slides.id, PR.sm.id, PR.tech.id]),
    mem('tp', P.diego, [PR.cam1.id, PR.cam2.id, PR.stream.id]),
    mem('tp', P.ava, [PR.slides.id, PR.lx.id]),
    mem('tp', P.tyler, [PR.foh.id, PR.mons.id, PR.tech.id]),
    mem('tp', P.jordan, [PR.cam1.id, PR.stream.id, PR.caster.id]),
    mem('tp', P.maya, [PR.cam2.id]),
  ];

  const templates: PositionTemplate[] = [
    { id: 'tpl-w-full', teamId: 'tw', name: 'Full Band', icon: 'ti-users-group', positionIds: [W.leader.id, W.keys.id, W.acoustic.id, W.bass.id, W.drums.id, W.vocals.id] },
    { id: 'tpl-w-acoustic', teamId: 'tw', name: 'Acoustic set', icon: 'ti-guitar-pick', positionIds: [W.leader.id, W.acoustic.id, W.vocals.id] },
    { id: 'tpl-p-full', teamId: 'tp', name: 'Full Production', icon: 'ti-stack-2', positionIds: [PR.foh.id, PR.mons.id, PR.lx.id, PR.cam1.id, PR.cam2.id, PR.stream.id, PR.slides.id, PR.sm.id] },
    { id: 'tpl-p-basic', teamId: 'tp', name: 'Basic AV (single tech)', icon: 'ti-device-audio-tape', positionIds: [PR.tech.id] },
    { id: 'tpl-p-stream', teamId: 'tp', name: 'Livestream package', icon: 'ti-video', positionIds: [PR.cam1.id, PR.stream.id, PR.foh.id] },
    { id: 'tpl-p-ath', teamId: 'tp', name: 'Athletics broadcast', icon: 'ti-ball-basketball', positionIds: [PR.cam1.id, PR.stream.id, PR.caster.id, PR.foh.id] },
  ];

  // Two events the crew rides (each a real Spaces booking that holds the room).
  const evBase = {
    all_day: false, setup_starts: null, teardown_ends: null, recurrence: null,
    percent_approved: 100, status: 'Approved' as const, source: 'internal' as const,
    kind: 'booking' as const, resources: [] as string[],
  };
  const events: EventRec[] = [
    {
      ...evBase, id: 'e-chapel-crew', name: 'Wednesday Chapel',
      starts_at: '2026-08-26T14:00:00Z', ends_at: '2026-08-26T14:40:00Z', // 10:00–10:40 EDT
      owner: 'Grace Okafor', location: 'Lighthouse PAC', rooms: ['Lighthouse PAC'],
      category: 'Chapel', details: 'Weekly all-school chapel. Worship band + message.',
    },
    {
      ...evBase, id: 'e-concert-crew', name: 'Fall Pops Concert',
      starts_at: '2026-09-18T23:00:00Z', ends_at: '2026-09-19T00:30:00Z', // Sep 18, 7:00–8:30 EDT
      owner: 'Lori Sakkab', location: 'Lighthouse PAC', rooms: ['Lighthouse PAC'],
      category: 'Concert', details: 'Bands & choir fall showcase. Needs full production crew.',
    },
  ];

  // Chapel is partially staffed so every state shows at once (§5):
  // most accepted, one pending, one declined (slot re-open), one open, plus a
  // drummer who is blocked that day but the coordinator scheduled anyway.
  const asg = (n: number, positionId: string, person: PersonRec | null, status: CrewAssignment['status']): CrewAssignment => ({
    id: `casg-${n}`, eventId: 'e-chapel-crew', teamId: 'tw', positionId,
    ...(person ? { personId: person.id } : {}),
    status,
    ...(status !== 'open' ? { requestedAt: NOW } : {}),
    ...(status === 'accepted' || status === 'declined' || status === 'self' ? { respondedAt: NOW } : {}),
  });
  const assignments: CrewAssignment[] = [
    asg(1, W.leader.id, P.grace, 'accepted'),
    asg(2, W.keys.id, P.maya, 'accepted'),
    asg(3, W.acoustic.id, P.eli, 'accepted'),
    asg(4, W.bass.id, P.caleb, 'requested'),
    asg(5, W.drums.id, P.hannah, 'accepted'), // blocked that day, scheduled anyway
    asg(6, W.vocals.id, P.sofia, 'accepted'),
    asg(7, W.vocals.id, P.noah, 'declined'),
    asg(8, W.vocals.id, null, 'open'),
  ];

  const blockouts: Blockout[] = [
    { id: 'blk-1', personId: P.hannah.id, start: '2026-08-25', end: '2026-08-27', allDay: true, reason: 'Family travel' },
  ];

  return { people, events, teams, positions, members, templates, assignments, blockouts };
}

// ---- Program container demo (services-module-spec §13) ----
// One umbrella — a two-day Fine Arts Festival — over many real child sessions
// across rooms and times. Seeded as a Draft so the demo can submit-once and
// watch all sessions fan out to their room owners' queues at the same moment.
// Sessions sit at status 'Draft' (not yet in any queue) until that submit.
function seedPrograms(): { programs: Program[]; events: EventRec[] } {
  const programs: Program[] = [
    {
      id: 'prog-arts',
      name: 'Fine Arts Festival',
      owner: 'Rudy Garrido',
      startsDate: '2026-09-25',
      endsDate: '2026-09-26',
      status: 'Draft',
      notes: 'Annual two-day showcase — recitals, masterclasses, gallery, and the grand finale concert.',
    },
  ];
  const s = (
    id: string,
    name: string,
    room: string,
    starts: string,
    ends: string,
    extra: Partial<EventRec> = {},
  ): EventRec => ({
    ...base,
    id,
    name,
    kind: 'booking',
    all_day: false,
    status: 'Draft',
    percent_approved: 0,
    starts_at: `2026-09-${starts}-04:00`,
    ends_at: `2026-09-${ends}-04:00`,
    location: room,
    owner: 'Rudy Garrido',
    details: 'Part of the Fine Arts Festival.',
    rooms: [room],
    resources: [],
    source: 'internal',
    category: 'Fine Arts',
    programId: 'prog-arts',
    ...extra,
  });
  const events: EventRec[] = [
    // Day 1 — Friday Sep 25
    s('prog-s1', 'Gallery Exhibit — Student Works', 'Art Gallery', '25T17:00:00', '25T20:00:00', { expectedAttendance: 120, resources: ['Podium'] }),
    s('prog-s2', 'Opening Recital', 'Lighthouse Theater', '25T18:00:00', '25T19:30:00', { expectedAttendance: 300, resources: ['Microphone (hand-held)', 'Choral (Rolling) Risers'], resourceQty: { 'Microphone (hand-held)': 2 } }),
    s('prog-s3', 'Jazz Combo Set', 'Beacon Hall', '25T19:00:00', '25T20:30:00', { expectedAttendance: 90 }),
    // Day 2 — Saturday Sep 26
    s('prog-s4', 'Masterclass: Strings', 'Rehearsal Studio (Orchestra Classroom)', '26T09:00:00', '26T11:00:00', { expectedAttendance: 40 }),
    s('prog-s5', 'Choir Workshop', 'B 202 Choir Classroom', '26T09:30:00', '26T11:30:00', { expectedAttendance: 35, resources: ['Choir Mics'] }),
    s('prog-s6', 'Theater Scenes Showcase', 'The Lighthouse Studio', '26T11:00:00', '26T12:30:00', { expectedAttendance: 80 }),
    s('prog-s7', 'Grand Finale Concert', 'Lighthouse Theater', '26T14:00:00', '26T16:00:00', { expectedAttendance: 320, resources: ['Microphone (hand-held)', 'Microphone (headset)', 'Choral (Rolling) Risers'], resourceQty: { 'Microphone (hand-held)': 3 } }),
  ];
  return { programs, events };
}

// ---- Security & visitor demo (security-visitor-scope) ----
// Guards as people-resources on the Security calendar, a couple of pre-
// registered visitor heads-ups, and an after-hours booking that auto-flags
// "needs Security + Custodial." Everything is dated to DEMO_TODAY (Thu Aug 20)
// so the gate's day view is live on open. Visitor sign-ins are NOT seeded —
// those only ever exist in session memory (see lib/visitorLog).
function seedSecurity(): { guards: PersonRec[]; shifts: GuardShift[]; events: EventRec[] } {
  // Synthetic guards (public repo → @demo addresses, invented names).
  const guards: PersonRec[] = [
    { id: 'sg-0', name: 'Marcus Bell', email: 'mbell@demo.wcsmiami.org', event: '', rooms: '', resources: '', people: '', resolves_conflicts: false, site_admin: false },
    { id: 'sg-1', name: 'Tanya Cruz', email: 'tcruz@demo.wcsmiami.org', event: '', rooms: '', resources: '', people: '', resolves_conflicts: false, site_admin: false },
  ];
  // Thursday window is 6:30a–6:00p. Two posted shifts leave an 11:00a–1:00p
  // lunch gap on purpose, so the coverage view has something to flag.
  const day = '2026-08-20';
  const shifts: GuardShift[] = [
    { id: 'gs-1', personId: 'sg-0', date: day, start: '06:30', end: '11:00', post: 'Main Gate' },
    { id: 'gs-2', personId: 'sg-1', date: day, start: '13:00', end: '18:00', post: 'Carline / Roving patrol' },
  ];
  const events: EventRec[] = [
    {
      ...base, id: 'sec-tour', name: 'Admissions Tour — Prospective Family', kind: 'booking', all_day: false,
      starts_at: `${day}T09:30:00-04:00`, ends_at: `${day}T10:30:00-04:00`,
      location: 'MS Conference Room', owner: 'Vicki Kaplan', rooms: ['MS Conference Room'], resources: [],
      source: 'internal', category: 'Admissions', details: 'Campus tour for a prospective MS family.',
      expectedVisitors: { count: 3, contact: 'The Morales family', purpose: 'Campus tour', time: '09:30' },
    },
    {
      ...base, id: 'sec-vendor', name: 'Vendor Walkthrough — AV Upgrade', kind: 'booking', all_day: false,
      starts_at: `${day}T14:00:00-04:00`, ends_at: `${day}T15:00:00-04:00`,
      location: 'Lighthouse Theater', owner: 'Rudy Garrido', rooms: ['Lighthouse Theater'], resources: [],
      source: 'internal', category: 'Facilities', details: 'Site survey for the theater AV refresh.',
      expectedVisitors: { count: 2, contact: 'Pro AV Systems (2 techs)', purpose: 'Site survey', time: '14:00' },
    },
    {
      ...base, id: 'sec-booster', name: 'Booster Club Evening Meeting', kind: 'booking', all_day: false,
      starts_at: `${day}T18:30:00-04:00`, ends_at: `${day}T20:00:00-04:00`,
      location: 'Beacon Hall', owner: 'Sheryl Medder', rooms: ['Beacon Hall'], resources: ['Chairs'],
      resourceQty: { 'Chairs': 40 }, source: 'internal', category: 'Community', expectedAttendance: 35,
      details: 'After-hours — runs past the 6:00p close, so the gate needs a guard + custodian on site.',
      expectedVisitors: { count: 30, contact: 'Booster Club members', purpose: 'Monthly meeting', time: '18:30' },
    },
  ];
  return { guards, shifts, events };
}

// ---- Event invites demo ----
// Two events that show both invite paths: a Faculty Staff Meeting TODAY (so the
// day-of reminder has pending replies to nudge) with internal staff, and an AP
// practice exam with a mix of internal students (accounts) and external students
// invited by email only (no account — the "just email them a link" case).
function seedInvites(people: PersonRec[]): { events: EventRec[]; invites: EventInvite[] } {
  const id = (name: string) => people.find((p) => p.name === name)?.id;
  const now = DEMO_TODAY.toISOString();
  const events: EventRec[] = [
    {
      ...base, id: 'inv-staff', name: 'Faculty Staff Meeting', kind: 'booking', all_day: false,
      starts_at: '2026-08-20T19:30:00-04:00', ends_at: '2026-08-20T20:30:00-04:00', // 3:30–4:30p EDT, today
      location: 'TIDE Conference Room', owner: 'Vicki Kaplan', rooms: ['TIDE Conference Room'], resources: [],
      source: 'internal', category: 'Staff', details: 'Back-to-school faculty meeting — agenda in the invite.',
    },
    {
      ...base, id: 'inv-ap', name: 'AP Calculus — Practice Exam', kind: 'booking', all_day: false,
      starts_at: '2026-09-12T08:30:00-04:00', ends_at: '2026-09-12T12:00:00-04:00', // 8:30a–12:00p EDT
      location: 'Beacon Hall', owner: 'Rudy Garrido', rooms: ['Beacon Hall'], resources: ['Student Chairs'],
      resourceQty: { 'Student Chairs': 60 }, source: 'internal', category: 'Academics', expectedAttendance: 48,
      details: 'Full-length practice exam. Students RSVP to claim a seat — no account needed, just the email link.',
    },
  ];
  // helper to build an invite row, internal if the name resolves to an account.
  let n = 0;
  const inv = (eventId: string, name: string, status: EventInvite['status'], opts: { email?: string; role?: string; external?: boolean; reminded?: boolean } = {}): EventInvite => {
    const personId = opts.external ? undefined : id(name);
    return {
      id: `inv-row-${++n}`, eventId, personId, name,
      email: opts.email, role: opts.role, status, invitedAt: now,
      respondedAt: status === 'invited' ? undefined : now,
      remindedAt: opts.reminded ? now : undefined,
    };
  };
  const invites: EventInvite[] = [
    // Staff meeting (today): most replied, two still pending → reminder demo.
    inv('inv-staff', 'Lori Sakkab', 'accepted'),
    inv('inv-staff', 'Adriana Marrero', 'accepted'),
    inv('inv-staff', 'Grace Okafor', 'accepted'),
    inv('inv-staff', 'Rudy Garrido', 'tentative'),
    inv('inv-staff', 'Sherry Medder', 'invited'),
    inv('inv-staff', 'Maya Delgado', 'invited'),
    // AP practice exam: internal students with accounts + external (email-only).
    inv('inv-ap', 'Eli Robinson', 'accepted', { role: 'Student' }),
    inv('inv-ap', 'Sofia Marin', 'accepted', { role: 'Student' }),
    inv('inv-ap', 'Noah Park', 'declined', { role: 'Student' }),
    inv('inv-ap', 'Diego Ramos', 'invited', { role: 'Student' }),
    inv('inv-ap', 'Ava Whitfield', 'accepted', { role: 'Student', external: true, email: 'awhitfield@demo.wcsmiami.org' }),
    inv('inv-ap', 'Caleb Nguyen', 'invited', { role: 'Student', external: true, email: 'cnguyen@demo.wcsmiami.org' }),
    inv('inv-ap', 'Maria Soto', 'tentative', { role: 'Student', external: true, email: 'msoto@demo.wcsmiami.org' }),
  ];
  return { events, invites };
}

// ---- Camp buses demo ----
// Sleep-away camps charter buses (rental — not the school's fleet) and the kids
// get assigned to one so they know which bus is theirs. Buses surface as rental
// rooms; the roster is invites carrying a busId. GR8 Escape already exists as a
// notice (n-0); Warrior Week is added here.
function seedCamps(people: PersonRec[]): { events: EventRec[]; buses: CampBus[]; rooms: Room[]; invites: EventInvite[]; cabins: CampCabin[]; cabinRooms: CabinRoom[]; roles: CampRole[]; shifts: CampShift[]; duties: CampDuty[] } {
  const pid = (name: string) => people.find((p) => p.name === name)?.id;
  const now = DEMO_TODAY.toISOString();

  const events: EventRec[] = [
    {
      ...base, id: 'camp-ww', name: 'Warrior Week — HS Retreat', kind: 'notice', all_day: true,
      starts_at: '2026-09-23T00:00:00-04:00', ends_at: '2026-09-25T00:00:00-04:00',
      location: 'Off campus — Lake Aurora Retreat', owner: 'High School Office', audience: 'High School',
      rooms: [], resources: ['Transportation'], category: 'Community',
      details: 'Annual high-school overnight retreat. Buses are chartered and lodging is by cabin — check your bus and cabin below.',
    },
  ];

  const rooms: Room[] = [];
  // bus + its matching rental room, generated together so ids line up.
  let bn = 0;
  const buses: CampBus[] = [];
  const bus = (eventId: string, name: string, label: string, capacity: number, rentalOrg: string, departInfo: string) => {
    const id = `cb-${++bn}`;
    const roomId = `busroom-${bn}`;
    buses.push({ id, eventId, roomId, name, label, capacity, rentalOrg, departInfo });
    rooms.push({ id: roomId, name: `${name} — ${label}`, folder: 'Camp buses (rental)', isBus: true, rental: true, capacity });
    return id;
  };
  const g1 = bus('n-0', 'Bus 1', 'Coral Crew', 24, 'Sunshine Charters', 'Departs 7:30 AM · Main Lot');
  const g2 = bus('n-0', 'Bus 2', 'Mangrove Crew', 24, 'Sunshine Charters', 'Departs 7:30 AM · Main Lot');
  const w1 = bus('camp-ww', 'Bus 1', 'Gold Squad', 30, 'Gold Coast Coach', 'Departs 8:00 AM · Gym Lot');
  const w2 = bus('camp-ww', 'Bus 2', 'Green Squad', 30, 'Gold Coast Coach', 'Departs 8:00 AM · Gym Lot');

  // cabin (lodging) + its matching room in Spaces.
  let cn = 0;
  const cabins: CampCabin[] = [];
  const cabinRooms: CabinRoom[] = [];
  const cabin = (eventId: string, name: string, kind: CampCabin['kind'], beds?: number) => {
    const id = `cab-${++cn}`;
    const roomId = `cabinroom-${cn}`;
    cabins.push({ id, eventId, roomId, name, kind, beds });
    rooms.push({ id: roomId, name, folder: 'Camp cabins', isCabin: true, ...(beds ? { capacity: beds } : {}) });
    return id;
  };
  let crn = 0;
  const cabinRoom = (cabinId: string, name: string, beds: number) => {
    const id = `cr-${++crn}`;
    cabinRooms.push({ id, cabinId, name, beds });
    return id;
  };
  // Pine Lodge is split into rooms (detailed mode); the rest use a simple bed count.
  const pine = cabin('camp-ww', 'Pine Lodge', 'student');
  const pineA = cabinRoom(pine, 'Room A', 8);
  const pineB = cabinRoom(pine, 'Room B', 8);
  const cedar = cabin('camp-ww', 'Cedar Lodge', 'student', 16);
  const maple = cabin('camp-ww', 'Maple Hall', 'staff', 10);
  const willow = cabin('camp-ww', 'Willow Cabin', 'parent', 6);
  const birch = cabin('camp-ww', 'Birch Cottage', 'guest', 4);

  let rn = 0;
  type Opts = { email?: string; status?: EventInvite['status']; role?: string; cabinId?: string; cabinRoomId?: string; cabinLeader?: boolean };
  const person = (eventId: string, busId: string | undefined, name: string, o: Opts = {}): EventInvite => ({
    id: `camp-inv-${++rn}`, eventId, busId, name,
    personId: o.email ? undefined : pid(name), email: o.email,
    role: o.role ?? 'Camper', cabinId: o.cabinId, cabinRoomId: o.cabinRoomId, cabinLeader: o.cabinLeader,
    status: o.status ?? 'accepted', invitedAt: now, respondedAt: (o.status ?? 'accepted') === 'invited' ? undefined : now,
  });
  const invites: EventInvite[] = [
    // GR8 Escape — a couple internal students, the rest external (no account).
    person('n-0', g1, 'Eli Robinson'),
    person('n-0', g1, 'Jordan Blake', { email: 'jblake@demo.wcsmiami.org' }),
    person('n-0', g1, 'Mia Torres', { email: 'mtorres@demo.wcsmiami.org' }),
    person('n-0', g2, 'Sofia Marin'),
    person('n-0', g2, 'Liam Carter', { status: 'invited', email: 'lcarter@demo.wcsmiami.org' }),
    person('n-0', g2, 'Zoe Bennett', { email: 'zbennett@demo.wcsmiami.org' }),
    // Warrior Week — students, housed in cabins.
    person('camp-ww', w1, 'Ava Whitfield', { email: 'awhitfield@demo.wcsmiami.org', cabinId: pine, cabinRoomId: pineA }),
    person('camp-ww', w1, 'Noah Park', { cabinId: pine, cabinRoomId: pineA }),
    person('camp-ww', w2, 'Maria Soto', { email: 'msoto@demo.wcsmiami.org', cabinId: cedar }),
    person('camp-ww', w2, 'Caleb Nguyen', { status: 'invited', email: 'cnguyen2@demo.wcsmiami.org', cabinId: cedar }),
    // Cabin leaders — adults in charge of a cabin / room within it.
    person('camp-ww', w1, 'Coach Dan Rivera', { role: 'Cabin Leader', email: 'drivera@demo.wcsmiami.org', cabinId: pine, cabinRoomId: pineA, cabinLeader: true }),
    person('camp-ww', w1, 'Ms. Tara Hill', { role: 'Cabin Leader', email: 'thill@demo.wcsmiami.org', cabinId: pine, cabinRoomId: pineB, cabinLeader: true }),
    person('camp-ww', w2, 'Mr. Alan Pierce', { role: 'Cabin Leader', email: 'apierce@demo.wcsmiami.org', cabinId: cedar, cabinLeader: true }),
    // Staff, a parent volunteer, and a guest speaker — other cabin kinds.
    person('camp-ww', undefined, 'Rudy Garrido', { role: 'Staff', cabinId: maple }),
    person('camp-ww', undefined, 'Mrs. Elena Gomez', { role: 'Parent volunteer', email: 'egomez@demo.wcsmiami.org', cabinId: willow }),
    person('camp-ww', undefined, 'Pastor Mike Allen', { role: 'Guest speaker', email: 'mallen@demo.wcsmiami.org', cabinId: birch }),
  ];

  // ---- Camp roles & shifts (adult jobs) ----
  let roln = 0, shn = 0, dn = 0;
  const roles: CampRole[] = [];
  const shifts: CampShift[] = [];
  const duties: CampDuty[] = [];
  const role = (name: string, icon: string, blurb?: string) => {
    const id = `crole-${++roln}`;
    roles.push({ id, eventId: 'camp-ww', name, icon, blurb });
    return id;
  };
  const shift = (roleId: string, name: string, start?: string, end?: string) => {
    const id = `cshift-${++shn}`;
    shifts.push({ id, roleId, name, start, end });
    return id;
  };
  const duty = (roleId: string, name: string, opts: { email?: string; shiftId?: string } = {}) => {
    duties.push({ id: `cduty-${++dn}`, eventId: 'camp-ww', roleId, shiftId: opts.shiftId, personId: opts.email ? undefined : pid(name), name, email: opts.email });
  };

  // Straight roles (no shifts).
  const prod = role('Production', 'ti-broadcast', 'Sound, slides, and stage for the evening sessions.');
  duty(prod, 'Rudy Garrido');
  duty(prod, 'Mason Reed', { email: 'mreed@demo.wcsmiami.org' });
  const nurse = role('Nurse', 'ti-heartbeat', 'On-call for the whole camp.');
  duty(nurse, 'Karen Phillips', { email: 'kphillips@demo.wcsmiami.org' });
  const snack = role('Snack Station', 'ti-cookie', 'Afternoon and evening snacks.');
  duty(snack, 'Mrs. Elena Gomez', { email: 'egomez@demo.wcsmiami.org' });

  // Bus monitors — shifted by departure / return.
  const monitor = role('Bus Monitor', 'ti-bus', 'Ride along and account for every student.');
  const mDepart = shift(monitor, 'Departure (Wed AM)', '07:30', '10:00');
  const mReturn = shift(monitor, 'Return (Fri PM)', '14:00', '16:30');
  duty(monitor, 'Coach Dan Rivera', { email: 'drivera@demo.wcsmiami.org', shiftId: mDepart });
  duty(monitor, 'Ms. Tara Hill', { email: 'thill@demo.wcsmiami.org', shiftId: mDepart });
  duty(monitor, 'Coach Dan Rivera', { email: 'drivera@demo.wcsmiami.org', shiftId: mReturn });
  // mReturn left one short on purpose — coverage gap to fill in the demo.

  // Kitchen — shifted by meal.
  const kitchen = role('Kitchen Helper', 'ti-tools', 'Serve and clean up at meal times.');
  const kB = shift(kitchen, 'Breakfast', '06:30', '08:30');
  const kL = shift(kitchen, 'Lunch', '11:30', '13:30');
  const kD = shift(kitchen, 'Dinner', '17:00', '19:00');
  duty(kitchen, 'Mr. Alan Pierce', { email: 'apierce@demo.wcsmiami.org', shiftId: kB });
  duty(kitchen, 'Mrs. Elena Gomez', { email: 'egomez@demo.wcsmiami.org', shiftId: kL });
  duty(kitchen, 'Mr. Alan Pierce', { email: 'apierce@demo.wcsmiami.org', shiftId: kD });

  // Lifeguard — shifted by free-time block.
  const guard = role('Lifeguard', 'ti-swimming', 'Required whenever the lake is open.');
  const gAM = shift(guard, 'Free time — morning', '10:30', '12:00');
  shift(guard, 'Free time — afternoon', '15:00', '17:00');
  duty(guard, 'Coach Dan Rivera', { email: 'drivera@demo.wcsmiami.org', shiftId: gAM });

  return { events, buses, rooms, invites, cabins, cabinRooms, roles, shifts, duties };
}

// Builds the initial in-memory database from the harvested seed data.
// This is the demo's starting point; the store persists edits on top of it.
export function buildSeed(): Database {
  const rooms = roomFolders.flatMap((f, fi) =>
    f.items.map((name, i) => ({
      id: `r-${fi}-${i}`,
      name,
      folder: f.name,
      ...(ROOM_CAPACITY[name] !== undefined ? { capacity: ROOM_CAPACITY[name] } : {}),
    })),
  );
  const resources = resourceFolders.flatMap((f, fi) =>
    f.items.map((name, i) => ({
      id: `res-${fi}-${i}`,
      name,
      folder: f.name,
      ...(RESOURCE_STOCK[name] !== undefined ? { qty: RESOURCE_STOCK[name] } : {}),
      ...(isVehicle(name) ? { photo: busPhoto(name) } : {}),
    })),
  );
  const basePeople: PersonRec[] = (rawPeople as Person[]).map((p, i) => ({
    ...p,
    id: `p-${i}`,
    ...(deptStaff[p.name] ?? {}),
  }));
  const crew = seedCrew(basePeople);
  const security = seedSecurity();
  const people = [...basePeople, ...crew.people, ...security.guards];
  // Internal bookings harvested from Planning Center, plus the public master
  // calendar pulled from the school's iCal feed.
  const internal: EventRec[] = (rawEvents as WcsEvent[])
    .filter((e) => !!e.starts_at)
    .map((e, i) => ({ source: 'internal', ...e, id: `e-${i}` }));
  const publicEvents: EventRec[] = (rawPublic as WcsEvent[]).map((e, i) => ({ ...e, id: `pub-${i}` }));
  // Athletics calendar — separate iCal feed (games, tournaments, dept events).
  const athletic: EventRec[] = (rawAthletic as WcsEvent[]).map((e, i) => ({ ...e, id: `ath-${i}` }));
  const rentalsSeed = seedRentals();
  const programsSeed = seedPrograms();
  const invitesSeed = seedInvites(people);
  const campsSeed = seedCamps(people);
  return {
    rooms: [...rooms, ...campsSeed.rooms],
    resources,
    people,
    events: [...internal, ...publicEvents, ...athletic, ...notices, ...seedInventoryDemand(), ...seedCheckinDemo(), ...seedSeries(), ...seedCoverageDemo(), ...rentalsSeed.events, ...crew.events, ...programsSeed.events, ...security.events, ...invitesSeed.events, ...campsSeed.events],
    workItems: seedWorkItems,
    drivers: seedDrivers,
    templates: seedTemplates,
    notifications: seedNotifs(),
    conflictNotes: seedConflictNotes(),
    assets: seedAssets,
    rentals: rentalsSeed.rentals,
    audit: seedAudit(),
    comments: seedComments(),
    calendarViews: seedCalendarViews(),
    crewTeams: crew.teams,
    crewPositions: crew.positions,
    crewMembers: crew.members,
    positionTemplates: crew.templates,
    crewAssignments: crew.assignments,
    blockouts: crew.blockouts,
    programs: programsSeed.programs,
    guardShifts: security.shifts,
    invites: [...invitesSeed.invites, ...campsSeed.invites],
    campBuses: campsSeed.buses,
    campCabins: campsSeed.cabins,
    cabinRooms: campsSeed.cabinRooms,
    campRoles: campsSeed.roles,
    campShifts: campsSeed.shifts,
    campDuties: campsSeed.duties,
    seedVersion: SEED_VERSION,
  };
}

// Hand-authored examples of the "notice" model: events that reserve no campus
// space but still belong on the calendar — and can still carry assignments.
const base = {
  setup_starts: null,
  teardown_ends: null,
  recurrence: null,
  percent_approved: 100,
  status: 'Approved' as const,
};

const notices: EventRec[] = [
  {
    ...base,
    id: 'n-0',
    name: 'GR8 Escape — 8th Grade Camp',
    kind: 'notice',
    audience: '8th Grade',
    all_day: true,
    starts_at: '2026-10-07T00:00:00-04:00',
    ends_at: '2026-10-09T00:00:00-04:00',
    location: 'Off campus — GR8 Escape retreat center',
    owner: 'Middle School Office',
    details: 'Annual overnight 8th-grade retreat. Nothing on campus to book — listed so the whole school knows the grade is away. Support needs are assigned below.',
    rooms: [],
    resources: ['Transportation'],
    category: 'Community',
    assignments: [
      { role: 'AV Support', person: 'Rudy Garrido', status: 'Approved' },
      { role: 'Transportation', person: 'Transportation Dept.', status: 'Approved' },
      { role: 'Lead Chaperone', person: 'Middle School Office', status: 'Approved' },
    ],
  },
  {
    ...base,
    id: 'n-1',
    name: 'All-School Convocation',
    kind: 'booking',
    audience: 'All School',
    all_day: false,
    starts_at: '2026-08-20T08:30:00-04:00',
    ends_at: '2026-08-20T09:30:00-04:00',
    location: 'The Lighthouse PAC - Main',
    owner: 'Spiritual Life',
    details: 'Opening convocation for the school year.',
    rooms: ['The Lighthouse PAC - Main'],
    resources: ['Sound', 'Lighting'],
    category: 'Community',
    setupStyle: 'theater',
    assignments: [{ role: 'AV Support', person: 'Rudy Garrido', status: 'Approved' }],
    runSheet: {
      start: '08:25',
      segments: [
        {
          id: 'cs-1',
          durationMin: 5,
          title: 'Doors / pre-service music',
          who: 'House & ushers',
          crew: [{ role: 'A1 (audio)', person: 'Rudy Garrido', call: '07:45' }],
          cues: [{ dept: 'AUD', action: 'Walk-in playlist up, house music' }],
        },
        {
          id: 'cs-2',
          durationMin: 5,
          title: 'Welcome & call to worship',
          who: 'Head of School',
          cues: [
            { dept: 'AUD', action: 'Mic 1 (podium) live, walk-in music out' },
            { dept: 'VID', action: 'Lower-third: speaker name' },
          ],
        },
        {
          id: 'cs-3',
          durationMin: 15,
          title: 'Worship set',
          who: 'Worship band',
          notes: '2 songs — band provides their own input list.',
          crew: [{ role: 'ProPresenter', person: 'Student tech', call: '08:00' }],
          cues: [
            { dept: 'LX', action: 'Stage wash 80%, house to 25%' },
            { dept: 'VID', action: 'Roll song lyrics' },
            { dept: 'AUD', action: 'Band mics + IEM mix' },
          ],
        },
        {
          id: 'cs-4',
          durationMin: 5,
          title: 'Scripture & prayer',
          who: 'Chaplain',
          cues: [{ dept: 'VID', action: 'Scripture slide (1 Peter 4:10–11)' }],
        },
        {
          id: 'cs-5',
          durationMin: 20,
          title: 'Convocation address',
          who: 'Head of School',
          cues: [
            { dept: 'VID', action: 'Presentation deck — advance on speaker' },
            { dept: 'LX', action: 'Podium special up, stage wash down' },
          ],
        },
        {
          id: 'cs-6',
          durationMin: 5,
          title: 'Charge & benediction',
          who: 'Chaplain',
          cues: [{ dept: 'AUD', action: 'Mic 1 live' }],
        },
        {
          id: 'cs-7',
          durationMin: 10,
          title: 'Alma mater & dismissal',
          who: 'Worship band',
          cues: [
            { dept: 'AUD', action: 'Recessional music up' },
            { dept: 'LX', action: 'House lights to full' },
          ],
        },
      ],
    },
  },
  {
    ...base,
    id: 'n-4',
    name: 'Varsity Soccer — Senior Night Team Meal',
    kind: 'booking',
    audience: 'Soccer - Boys - Varsity',
    all_day: false,
    starts_at: '2026-08-21T18:00:00-04:00',
    ends_at: '2026-08-21T20:00:00-04:00',
    location: 'Beacon Hall',
    owner: 'Athletics',
    details: 'Pre-season team dinner. 6 banquet rounds, seating ~48. Boosters cater.',
    rooms: ['Beacon Hall'],
    resources: ['Table (round)', 'Chairs'],
    category: 'Athletics',
    setupStyle: 'banquet',
    assignments: [
      { role: 'Setup crew', person: 'Maintenance', status: 'Approved' },
      { role: 'Catering', person: 'Booster Club', status: 'Approved' },
    ],
  },
  {
    ...base,
    id: 'n-2',
    name: 'No School — Teacher Workday',
    kind: 'notice',
    audience: 'All School',
    all_day: true,
    starts_at: '2026-10-12T00:00:00-04:00',
    ends_at: null,
    location: null,
    owner: "Head of School's Office",
    details: 'Campus closed to students.',
    rooms: [],
    resources: [],
    category: 'Community',
  },
  {
    ...base,
    id: 'n-3',
    name: 'Spirit Week',
    kind: 'notice',
    audience: 'All School',
    all_day: true,
    starts_at: '2026-10-19T00:00:00-04:00',
    ends_at: '2026-10-23T00:00:00-04:00',
    location: null,
    owner: 'Student Life',
    details: 'Themed dress-up days all week leading into Homecoming.',
    rooms: [],
    resources: [],
    category: 'Community',
  },
];
