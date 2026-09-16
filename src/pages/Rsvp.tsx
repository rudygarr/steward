import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fmtDateLong, fmtTime } from '../lib/data';
import { fetchInvite, respondToInvite, type RsvpPayload } from '../lib/rsvpApi';
import helmetMark from '../assets/brand/warrior-helmet.png';
import type { InviteStatus } from '../lib/types';

// The public RSVP page — what an external guest (no account) reaches from the
// emailed invite link. No login gate: they read the details and reply.
//
// It deliberately does NOT use the store. The data lives in Supabase behind
// row-level security that only admits signed-in WCS accounts, so this page
// goes through the public RSVP Edge Function, which hands back exactly one
// invite and only the fields rendered below.
export default function Rsvp() {
  const { id } = useParams();
  const [state, setState] = useState<'loading' | 'ready' | 'gone'>('loading');
  const [data, setData] = useState<RsvpPayload | null>(null);
  const [done, setDone] = useState<InviteStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return setState('gone');
    let cancelled = false;
    void fetchInvite(id).then((payload) => {
      if (cancelled) return;
      if (!payload) return setState('gone');
      setData(payload);
      const s = payload.invite.status;
      if (s && s !== 'invited') setDone(s as InviteStatus);
      setState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function reply(status: InviteStatus) {
    if (!id) return;
    setSaving(true);
    setFailed(false);
    const ok = await respondToInvite(id, status);
    setSaving(false);
    // Only claim it landed if it actually did — this is the guest's single
    // chance to reply, and a silent failure would strand them.
    if (ok) setDone(status);
    else setFailed(true);
  }

  const ev = data?.event;

  return (
    <div className="rsvp-page">
      <div className="rsvp-card">
        <div className="rsvp-brand"><img src={helmetMark} alt="" /> Steward</div>

        {state === 'loading' ? (
          <div className="rsvp-gone">Loading your invitation…</div>
        ) : state === 'gone' || !ev ? (
          <div className="rsvp-gone">This invitation link is no longer valid.</div>
        ) : (
          <>
            <div className="rsvp-kicker">
              You’re invited{data?.invite.role ? ` · ${data.invite.role}` : ''}
            </div>
            <h1 className="rsvp-title">{ev.name}</h1>
            <div className="rsvp-meta">
              <div><i className="ti ti-calendar" /> {ev.starts_at ? fmtDateLong(new Date(ev.starts_at)) : 'TBD'}</div>
              <div><i className="ti ti-clock" /> {ev.all_day ? 'All day' : `${fmtTime(ev.starts_at)} – ${fmtTime(ev.ends_at)}`}</div>
              {ev.location && <div><i className="ti ti-map-pin" /> {ev.location}</div>}
            </div>
            {data?.bus && (
              <div className="rsvp-bus">
                <i className="ti ti-bus" /> Your bus:{' '}
                <strong>{data.bus.label ? `${data.bus.name} · ${data.bus.label}` : data.bus.name}</strong>
                {data.bus.departInfo ? <span> · {data.bus.departInfo}</span> : null}
              </div>
            )}
            {data?.cabin && (
              <div className="rsvp-bus">
                <i className="ti ti-home" /> Your cabin:{' '}
                <strong>{data.cabin.name}{data.room ? ` · ${data.room.name}` : ''}</strong>
                {data.invite.cabinLeader ? <span> · you're a leader</span> : null}
              </div>
            )}
            {ev.details && <div className="rsvp-details">{ev.details}</div>}

            {done ? (
              <div className={'rsvp-done ' + done}>
                <i className={'ti ' + (done === 'accepted' ? 'ti-circle-check' : done === 'declined' ? 'ti-circle-x' : 'ti-help-circle')} />
                {done === 'accepted' ? 'You’re in — see you there!' : done === 'declined' ? 'Thanks for letting us know.' : 'Marked as maybe.'}
                <button className="rsvp-change" onClick={() => setDone(null)}>Change response</button>
              </div>
            ) : (
              <>
                <div className="rsvp-actions">
                  <button className="rsvp-btn yes" disabled={saving} onClick={() => void reply('accepted')}><i className="ti ti-check" /> Accept</button>
                  <button className="rsvp-btn maybe" disabled={saving} onClick={() => void reply('tentative')}>Maybe</button>
                  <button className="rsvp-btn no" disabled={saving} onClick={() => void reply('declined')}>Decline</button>
                </div>
                {failed && (
                  <div className="rsvp-details" style={{ color: '#e2a0a0' }}>
                    We couldn’t save your reply. Please check your connection and try again.
                  </div>
                )}
              </>
            )}
            <div className="rsvp-foot">No account needed — your reply goes straight to the organizer.</div>
          </>
        )}
      </div>
    </div>
  );
}
