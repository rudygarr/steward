import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Public RSVP endpoint — the ONLY anonymous surface on this database.
 *
 * The invite link is emailed to guests who have no account, so this function
 * runs without a JWT. Every table is otherwise locked to the `authenticated`
 * role, so the service-role client here is deliberately fenced in:
 *
 *   - one invite, addressed by id, or 404. No listing, no search.
 *   - only the fields that page renders, never the whole event row or any
 *     other invitee.
 *   - writes are limited to this invite's own RSVP status.
 */

const ALLOWED_STATUS = new Set(['accepted', 'declined', 'tentative']);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** One row's jsonb payload, or null. */
async function record<T>(table: string, id: string | undefined): Promise<T | null> {
  if (!id) return null;
  const { data } = await db.from(table).select('data').eq('id', id).maybeSingle();
  return (data?.data as T) ?? null;
}

type Invite = {
  id: string;
  eventId: string;
  name?: string;
  role?: string;
  status?: string;
  busId?: string;
  cabinId?: string;
  cabinRoomId?: string;
  cabinLeader?: boolean;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const id: string | undefined = url.searchParams.get('id') ?? body.id;

    // Guard the id itself: it goes straight into a lookup, and an absurd one
    // is a probe rather than a real invite.
    if (!id || typeof id !== 'string' || id.length > 120) {
      return json({ error: 'not_found' }, 404);
    }

    const invite = await record<Invite>('invites', id);
    if (!invite) return json({ error: 'not_found' }, 404);

    if (req.method === 'POST') {
      const status = body.status;
      if (!ALLOWED_STATUS.has(status)) return json({ error: 'bad_status' }, 400);
      const next = { ...invite, status, respondedAt: new Date().toISOString() };
      const { error } = await db
        .from('invites')
        .update({ data: next, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return json({ error: 'save_failed' }, 500);
      return json({ ok: true, status });
    }

    const ev = await record<Record<string, unknown>>('events', invite.eventId);
    if (!ev) return json({ error: 'not_found' }, 404);

    const [bus, cabin, room] = await Promise.all([
      record<Record<string, unknown>>('camp_buses', invite.busId),
      record<Record<string, unknown>>('camp_cabins', invite.cabinId),
      record<Record<string, unknown>>('cabin_rooms', invite.cabinRoomId),
    ]);

    return json({
      invite: {
        id: invite.id,
        role: invite.role ?? null,
        status: invite.status ?? 'invited',
        cabinLeader: invite.cabinLeader ?? false,
      },
      // Only what the card shows. The rest of the event row stays private.
      event: {
        name: ev.name ?? null,
        starts_at: ev.starts_at ?? null,
        ends_at: ev.ends_at ?? null,
        all_day: ev.all_day ?? false,
        location: ev.location ?? null,
        details: ev.details ?? null,
      },
      bus: bus ? { name: bus.name, label: bus.label ?? null, departInfo: bus.departInfo ?? null } : null,
      cabin: cabin ? { name: cabin.name } : null,
      room: room ? { name: room.name } : null,
    });
  } catch {
    return json({ error: 'server_error' }, 500);
  }
});
