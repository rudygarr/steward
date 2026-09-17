# Steward — build notes

Decisions, the reasoning behind them, and the mistakes worth not repeating.
Kept deliberately: several of these cost hours and are invisible in the code.

---

## Sign-in

**Redirect, never a popup.** MSAL popup sign-in was tried first and failed
repeatedly on a real machine: the browser blocked or re-routed the popup, the
auth code landed in the main window, and the flow could never complete. A
popup depends on the browser allowing it *and* on `window.opener` surviving.
A redirect depends on neither and works in an installed PWA window.

**Auth goes through Supabase, not MSAL.** Not a style preference — Supabase's
row-level security identifies the user from the Supabase JWT. A Microsoft
token held on the side would leave every policy seeing an anonymous caller,
and the publishable key in the bundle would then be enough to read the whole
database.

**The Entra registration needs a WEB platform redirect URI**, not just the
Single-page application one:

```
https://vydzfxigipyzafyxoofb.supabase.co/auth/v1/callback
```

Supabase authenticates as a *confidential* client (code + secret, exchanged
server-side), which only matches the Web list. The same URI sitting in the
SPA list is invisible to it and produces `AADSTS50011`. This was the cause of
every `AADSTS50011` we hit, and it is not obvious from the error text.

**Supabase → Authentication → URL Configuration must be filled in.** Site URL
defaults to `http://localhost:3000` and the redirect allow-list starts empty.
Currently: Site URL `https://rudygarr.github.io/steward/`, allow-list
`https://rudygarr.github.io/steward/**` and `http://localhost:5173/**`.

**The client secret expires.** When it does, sign-in stops for everyone with
no warning. Diarise a month before. A certificate avoids the cliff.

### Debugging AADSTS errors

Probing the `authorize` endpoint validates the **tenant and client id only** —
a bogus client id fails immediately with `AADSTS700038`. It does **not**
validate `redirect_uri`: a deliberately unregistered URI still returns a
normal sign-in page, because Microsoft defers that check until after
authentication. Don't conclude a redirect URI is registered from a clean
probe. (This was claimed once here and was wrong.)

---

## Data

**One table per collection, one row per entity, record in `jsonb`.** The
TypeScript types stay the source of truth and any table can be promoted to
typed columns independently. Chosen over a single blob row because store.tsx
commits a whole new `Database` on every edit — persisting that wholesale would
ship ~1MB per edit and let two people silently overwrite each other.

**`saveDB` diffs by reference equality.** The store is immutable, so an
untouched collection keeps its array identity and an untouched record keeps
its object identity. That makes a deep comparison unnecessary and means none
of the ~151 mutators had to change: `persistence.ts` was always the designed
seam. Saves are serialised and coalesced, and the mirror of "what's in
Postgres" does not advance on failure — otherwise the next diff would skip
rows that never landed and lose them silently.

**Seed only when the database is empty.** It used to reseed whenever
`SEED_VERSION` changed, which was harmless per-browser but on shared data lets
whoever loads first wipe everyone's work. Use "Reset demo data" to reseed
deliberately — and note that button now wipes it for *everyone*.

**`SessionProvider` must wrap `StoreProvider`, not the reverse.** Mounting the
store first fires `loadDB()` as an anonymous caller, gets nothing back, and
seeds a fresh database over the shared one.

---

## Row-level security

**RLS policies evaluate as the CALLING role, not the table owner.** Supabase's
advisor flags SECURITY DEFINER functions as "callable over RPC"; revoking
`EXECUTE` from `authenticated` to satisfy it broke every read and write with:

```
42501  permission denied for function user_school_ids
```

The fix is **not** to grant it back in `public` — that re-opens what the
advisory flagged. Put the helpers in a schema PostgREST does not expose
(`private`) and grant execute there. Policies work, RPC surface gone.

**Reproduce RLS truthfully in SQL** rather than trusting the browser console,
which replays buffered errors and can make a working fix look broken:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
insert into public.rooms (id, data) values ('probe', '{}'::jsonb);
```

**Two advisor findings are intentional.** `school_domains` has RLS with no
policy — that is deny-all by design. `private.current_school_id()` must stay
executable by `authenticated` because it is the DEFAULT on every `school_id`
column, and defaults evaluate as the inserting role; it only ever returns the
caller's own school.

---

## Public RSVP

The emailed RSVP link is for guests with **no account**, so it cannot go
through the database — every table is locked to `authenticated`. It goes
through `supabase/functions/rsvp`, the only anonymous surface: one invite by
id, only the fields the card renders, no listing or search, and writes limited
to that invite's own status. Extra fields in the body are ignored, not merged.

**Known weakness:** invite ids are `inv-<timestamp>-<5 random chars>`, and
seeded demo invites use readable ids like `inv-staff`. Guessing one exposes
that invite's event name, time and location. These should become unguessable
tokens before real external use.

---

## Roles

`memberships.role` is the authority, enforced by RLS:

| role | access.ts level | can |
|---|---|---|
| `admin` | 2 | manage people and access |
| `manager` | 1 | manage people, not admin grants |
| `member` | 0 | normal work — bookings, requests, comments |

**Why this mattered:** `people` is what defines UI privilege (`site_admin` ->
level 2). While any member could write that table, any member could set their
own `site_admin`, reload, and be an administrator. Enforcing it in the UI
alone was never enforcement. `people` is now readable by all members and
writable only by admins/managers, and `audit` is append-only — an audit trail
its subjects can edit is not an audit trail.

Verified by impersonating a plain member in SQL: the escalating UPDATE
affected 0 rows, the escalating INSERT was refused by RLS, DELETE on audit
removed 0 rows, and ordinary event/audit inserts still worked.

**The UI takes privilege from the server role, not from the roster.** The
published roster carries sanitised `@demo.wcsmiami.org` addresses, so a real
sign-in (`rgarrido@wcsmiami.org`) matched nothing and every genuine user
silently landed as a Viewer — with their real name on it, which made it look
like it had worked. A roster match now supplies human details only;
privilege comes from `memberships.role`, the same value RLS checks. That also
keeps the two from disagreeing, which would show up as buttons whose saves
silently do nothing.

**The first member of a school becomes its admin**, otherwise a new school
has nobody who can manage anyone. Everyone after starts as `member`.

**Still coarse:** the app's object-centric permissions (per-room editors,
conflict resolvers, department leads) are still UI-only. A `member` can write
any booking in their school. Tightening that is the next step, and needs the
per-object model expressed in RLS.

## Open work, in the order it matters

1. **Invite tokens** (above).
3. **Per-school branding** — still hard-coded Steward.
4. **A settings screen for modules** — the data layer is ready, there's no UI.
5. **Gotham fonts 404** — licensed to JDRF, not WCS. Falls back to Montserrat
   cleanly. Needs a WCS licence to fix properly.
6. **~1MB JS bundle.** Fine for a pilot; worth code-splitting before rollout.
