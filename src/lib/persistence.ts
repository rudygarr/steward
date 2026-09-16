import { supabase } from './supabase';
import type { Database } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE ONE FILE THAT TALKS TO THE BACKEND
 * ─────────────────────────────────────────────────────────────────────────
 *  The whole app reads and writes the database through these three async
 *  functions, so the 150-odd mutators in store.tsx never learn where the
 *  data lives.
 *
 *  Storage is Supabase: one table per collection, one row per entity, the
 *  record itself in a jsonb column. That matters because store.tsx commits
 *  a whole new Database object on every edit — writing that wholesale would
 *  ship ~1MB per edit and let two people silently overwrite each other.
 *  Instead saveDB diffs what changed and writes only those rows.
 *
 *  The diff leans on immutability: store.tsx builds new objects with
 *  spreads, so an untouched collection keeps its array identity and an
 *  untouched record keeps its object identity. Reference equality is
 *  therefore enough to find the real changes, with no deep comparison.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Collection key on Database -> Postgres table. */
const TABLES: Record<string, string> = {
  rooms: 'rooms',
  resources: 'resources',
  people: 'people',
  events: 'events',
  workItems: 'work_items',
  drivers: 'drivers',
  templates: 'templates',
  notifications: 'notifications',
  conflictNotes: 'conflict_notes',
  assets: 'assets',
  rentals: 'rentals',
  audit: 'audit',
  comments: 'comments',
  calendarViews: 'calendar_views',
  crewTeams: 'crew_teams',
  crewPositions: 'crew_positions',
  crewMembers: 'crew_members',
  positionTemplates: 'position_templates',
  crewAssignments: 'crew_assignments',
  blockouts: 'blockouts',
  programs: 'programs',
  invites: 'invites',
  campBuses: 'camp_buses',
  campCabins: 'camp_cabins',
  cabinRooms: 'cabin_rooms',
  campRoles: 'camp_roles',
  campShifts: 'camp_shifts',
  campDuties: 'camp_duties',
  guardShifts: 'guard_shifts',
};

type Row = { id: string; data: unknown };
type Entity = { id: string };

/** What we believe is currently in Postgres, for diffing the next save. */
let mirror: Database | null = null;

export async function loadDB(): Promise<Database | null> {
  const sb = supabase;
  if (!sb) return null;

  const keys = Object.keys(TABLES);
  const [meta, ...results] = await Promise.all([
    sb.from('meta').select('key, value').eq('key', 'seedVersion').maybeSingle(),
    ...keys.map((k) => sb.from(TABLES[k]).select('id, data')),
  ]);

  // No seed marker means nobody has ever seeded this database: report empty
  // so the store builds the seed and saves it.
  if (meta.error || !meta.data) return null;

  const db = { seedVersion: meta.data.value } as unknown as Database;
  const out = db as unknown as Record<string, unknown>;
  results.forEach((res, i) => {
    if (res.error) throw res.error;
    out[keys[i]] = ((res.data ?? []) as Row[]).map((r) => r.data);
  });

  mirror = db;
  return db;
}

export async function saveDB(db: Database): Promise<void> {
  if (!supabase) return;
  queue(db);
}

/**
 * Saves run one at a time. store.tsx can fire several commits from a single
 * event handler, and each hands us a complete Database; only the newest is
 * worth writing, so anything arriving mid-flight collapses into one follow-up.
 */
let inFlight: Promise<void> | null = null;
let pending: Database | null = null;

function queue(db: Database): void {
  pending = db;
  if (inFlight) return;
  inFlight = (async () => {
    try {
      while (pending) {
        const next = pending;
        pending = null;
        await flush(next);
      }
    } finally {
      inFlight = null;
    }
  })();
}

async function flush(next: Database): Promise<void> {
  if (!supabase) return;
  const prev = mirror;
  const nextRec = next as unknown as Record<string, unknown>;
  const prevRec = (prev ?? {}) as unknown as Record<string, unknown>;
  const work: Promise<unknown>[] = [];

  for (const key of Object.keys(TABLES)) {
    const table = TABLES[key];
    const nextList = (nextRec[key] ?? []) as Entity[];
    const prevList = (prevRec[key] ?? []) as Entity[];
    // Untouched collections keep their array identity — nothing to do.
    if (prev && nextList === prevList) continue;

    const prevById = new Map(prevList.map((e) => [e.id, e]));
    const upserts = nextList
      .filter((e) => prevById.get(e.id) !== e) // new id, or a genuinely new object
      .map((e) => ({ id: e.id, data: e, updated_at: new Date().toISOString() }));

    const nextIds = new Set(nextList.map((e) => e.id));
    const removed = prevList.filter((e) => !nextIds.has(e.id)).map((e) => e.id);

    if (upserts.length) work.push(Promise.resolve(supabase.from(table).upsert(upserts)));
    if (removed.length) work.push(Promise.resolve(supabase.from(table).delete().in('id', removed)));
  }

  if (!prev || prev.seedVersion !== next.seedVersion) {
    work.push(
      Promise.resolve(
        supabase.from('meta').upsert({ key: 'seedVersion', value: next.seedVersion }),
      ),
    );
  }

  const results = await Promise.all(work);
  const failed = results.find((r) => (r as { error?: unknown })?.error);
  if (failed) {
    // Don't advance the mirror on failure, or the next diff would skip the
    // rows that never landed and they'd be lost silently.
    console.error('[steward] save failed', (failed as { error: unknown }).error);
    return;
  }
  mirror = next;
}

/**
 * Wipes the shared database. This is the "Reset demo data" button, and it now
 * resets it for EVERYONE, not just this browser.
 */
export async function clearDB(): Promise<void> {
  const sb = supabase;
  if (!sb) return;
  const entries: [string, string][] = [
    ...Object.values(TABLES).map((t) => [t, 'id'] as [string, string]),
    ['meta', 'key'],
  ];
  await Promise.all(
    // PostgREST requires a filter on delete; "key is not null" matches all.
    entries.map(([table, col]) => sb.from(table).delete().not(col, 'is', null)),
  );
  mirror = null;
}
