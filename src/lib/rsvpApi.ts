/**
 * Client for the public RSVP endpoint (supabase/functions/rsvp).
 *
 * The RSVP page is the one screen an external guest reaches without an
 * account, so it can't go through the store: every table is locked to the
 * `authenticated` role. It talks to the Edge Function instead, which returns
 * exactly one invite and only the fields this page renders.
 */

const base = import.meta.env.VITE_SUPABASE_URL ?? '';
const endpoint = base ? `${base}/functions/v1/rsvp` : '';

export interface RsvpPayload {
  invite: { id: string; role: string | null; status: string; cabinLeader: boolean };
  event: {
    name: string | null;
    starts_at: string | null;
    ends_at: string | null;
    all_day: boolean;
    location: string | null;
    details: string | null;
  };
  bus: { name: string; label: string | null; departInfo: string | null } | null;
  cabin: { name: string } | null;
  room: { name: string } | null;
}

/** The invite behind a link, or null if it doesn't exist / can't be reached. */
export async function fetchInvite(id: string): Promise<RsvpPayload | null> {
  if (!endpoint) return null;
  try {
    const res = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return (await res.json()) as RsvpPayload;
  } catch {
    return null;
  }
}

/** Records the guest's reply. Returns false if it didn't stick. */
export async function respondToInvite(id: string, status: string): Promise<boolean> {
  if (!endpoint) return false;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
