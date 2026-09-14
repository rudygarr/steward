import type { Database } from './types';

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE ONE FILE TO SWAP FOR PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────
 *  The whole app reads and writes the database through these three async
 *  functions. The demo implements them with the browser's localStorage so
 *  every edit (new rooms, bookings, staff) survives a refresh on the same
 *  device, with a Reset button to restore the seed.
 *
 *  To ship the real build on Azure Static Web Apps + Microsoft Entra ID:
 *  replace the bodies below with calls to your backend (a Static Web Apps
 *  API function, Microsoft Graph, or any REST/DB layer). Keep the same
 *  `Database` shape and async signatures and NOTHING else in the app has to
 *  change. e.g.
 *
 *     export async function loadDB() {
 *       const r = await fetch('/api/db', { headers: authHeader() });
 *       return r.ok ? await r.json() : null;
 *     }
 *     export async function saveDB(db) {
 *       await fetch('/api/db', { method: 'PUT', body: JSON.stringify(db), headers: authHeader() });
 *     }
 * ─────────────────────────────────────────────────────────────────────────
 */

const KEY = 'steward-db-v1';

/** The key used before the 2026-09-14 rename. Read once, then retired. */
const LEGACY_KEY = 'wcs-spaces-db-v1';

/**
 * Returns the raw payload for KEY, carrying a pre-rename demo state forward
 * on first load. github.io is a single origin, so a browser that used the old
 * /wcs-spaces/ URL still has that data sitting here.
 */
function readRaw(): string | null {
  const current = localStorage.getItem(KEY);
  if (current !== null) {
    // The new key wins. Drop any old copy so it can't resurface later.
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
    return current;
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === null) return null;

  try {
    // Only retire the old copy once the new one is safely written, so a
    // storage failure can't lose the state instead of moving it.
    localStorage.setItem(KEY, legacy);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Migration failed (quota/private mode) — the old copy stays put and we
    // still run off it this session. We'll try again on the next load.
  }
  return legacy;
}

export async function loadDB(): Promise<Database | null> {
  try {
    const raw = readRaw();
    return raw ? (JSON.parse(raw) as Database) : null;
  } catch {
    return null;
  }
}

export async function saveDB(db: Database): Promise<void> {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // storage full or unavailable — demo keeps working in memory
  }
}

export async function clearDB(): Promise<void> {
  try {
    localStorage.removeItem(KEY);
    // Clear the pre-rename key too, or a Reset would be undone by the
    // migration resurrecting the old state on the next load.
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
