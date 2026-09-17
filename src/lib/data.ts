import type { WcsEvent, EventRec } from './types';

const TZ = 'America/New_York';

export function parse(d: string | null): Date | null {
  return d ? new Date(d) : null;
}

// YYYY-MM-DD key in school timezone, so day grouping is stable.
export function dayKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function fmtTime(d: string | null): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(d));
}

export function fmtDateLong(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(d);
}

export function fmtDateShort(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

export function startOfWeek(d: Date): Date {
  const local = new Date(dayKey(d) + 'T12:00:00');
  local.setDate(local.getDate() - local.getDay());
  return local;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function eventsOnDay<T extends WcsEvent>(list: T[], d: Date): T[] {
  const key = dayKey(d);
  return list
    .filter((e) => e.starts_at && dayKey(new Date(e.starts_at)) === key)
    // Compare by parsed instant, NOT by string. The seed mixes timestamp
    // formats — "…T08:30:00-04:00" alongside "…T12:00:00Z" and
    // "…T12:00:00.000Z" — and a lexical compare puts 2pm-with-offset before
    // noon-in-UTC, so the day came out in the wrong order.
    .sort(
      (a, b) =>
        (a.all_day === b.all_day ? 0 : a.all_day ? -1 : 1) ||
        new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime(),
    );
}

// The seed year runs Aug 2026–May 2027. "Today" for the demo anchors to the
// first lively week of school so the hub never looks empty.
export const DEMO_TODAY = new Date('2026-08-20T16:00:00Z');

// Condense a roster team name into the AD's weekly-email shorthand:
// "Volleyball - Girls - JV" → "JV G Volleyball", "Golf - Boys - Varsity" → "V B Golf".
export function shortTeam(name?: string): string {
  if (!name) return '';
  const parts = name.split(' - ').map((s) => s.trim());
  const sport = parts[0];
  const lvlMap: Record<string, string> = {
    Varsity: 'V',
    JV: 'JV',
    Freshmen: 'Fr',
    'Middle School': 'MS',
    'Middle School JV': 'MS JV',
    'Middle School Varsity': 'MS V',
    MS: 'MS',
  };
  let gender = '';
  let level = '';
  for (const p of parts.slice(1)) {
    if (p === 'Boys') gender = 'B';
    else if (p === 'Girls') gender = 'G';
    else if (p === 'Co-Ed') gender = '';
    else level = lvlMap[p] ?? p;
  }
  return [level, gender, sport].filter(Boolean).join(' ');
}

// "Mine" = I own it, or I'm assigned a need on it (AV, transport, chaperone…).
export function isMine(e: WcsEvent, name: string): boolean {
  if (e.owner === name) return true;
  return !!e.assignments?.some((a) => a.person === name);
}

export function statusColor(status: string): string {
  if (status === 'Approved') return 'var(--ok)';
  if (status === 'Pending') return 'var(--warn)';
  if (status === 'Declined') return 'var(--bad)';
  return 'var(--text-3)';
}

export interface Conflict {
  room: string;
  a: EventRec;
  b: EventRec;
  // true when only the setup/teardown buffers overlap — the events themselves
  // don't share the room, but the crew can't flip it fast enough. Softer than a
  // straight double-booking.
  buffer?: boolean;
}

// The window a room is actually tied up: from setup (if any) through teardown
// (if any), falling back to the event's own start/end.
export function occupancyWindow(e: EventRec): { start: number; end: number } {
  const start = new Date(e.setup_starts || e.starts_at!).getTime();
  const end = new Date(e.teardown_ends || e.ends_at || e.starts_at!).getTime();
  return { start, end };
}

function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  return bS < aE && aS < bE;
}

// Two events conflict if they share a room and their occupancy windows overlap.
// The window includes setup & teardown buffers, so a room counted "free" during
// another booking's teardown is now caught. We skip noise that isn't a real
// double-booking: parenthetical annotations like "(Music bleed into Beacon
// Hall…)", and the same event showing up twice across the internal + public
// calendar feeds (identical name & start).
export function findConflicts(list: EventRec[]): Conflict[] {
  const out: Conflict[] = [];
  const byRoom = new Map<string, EventRec[]>();
  for (const e of list) {
    if (e.all_day || e.status === 'Declined') continue;
    // A released (reclaimed no-show) or cancelled booking no longer holds its room.
    if (e.released || e.cancelled) continue;
    if (e.name.trim().startsWith('(')) continue;
    // The public master-calendar feed mirrors booked events (often with slightly
    // different names) — it's read-only awareness, not a source of real clashes.
    if (e.source === 'public') continue;
    for (const r of e.rooms) {
      if (!byRoom.has(r)) byRoom.set(r, []);
      byRoom.get(r)!.push(e);
    }
  }
  for (const [room, evs] of byRoom) {
    // Sort by occupancy start so the early-out break stays valid.
    evs.sort((a, b) => occupancyWindow(a).start - occupancyWindow(b).start);
    for (let i = 0; i < evs.length; i++) {
      const aWin = occupancyWindow(evs[i]);
      for (let j = i + 1; j < evs.length; j++) {
        const bWin = occupancyWindow(evs[j]);
        if (bWin.start >= aWin.end) break;
        // Same booking duplicated across feeds — not a real clash.
        if (evs[i].name === evs[j].name && evs[i].starts_at === evs[j].starts_at) continue;
        // Do the core event times overlap, or only the buffers?
        const aCoreS = new Date(evs[i].starts_at!).getTime();
        const aCoreE = new Date(evs[i].ends_at || evs[i].starts_at!).getTime();
        const bCoreS = new Date(evs[j].starts_at!).getTime();
        const bCoreE = new Date(evs[j].ends_at || evs[j].starts_at!).getTime();
        const buffer = !overlaps(aCoreS, aCoreE, bCoreS, bCoreE);
        out.push({ room, a: evs[i], b: evs[j], buffer });
      }
    }
  }
  return out;
}
