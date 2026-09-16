# SchoolHQ — the brief

Steward is the app Westminster Christian School uses. **SchoolHQ** is the
product underneath it: the same core serving any school, with Steward as
tenant #1 and, if you want, the name WCS keeps seeing.

---

## 1. Why this isn't just "CampHQ for schools"

The HQ family so far — CampHQ, FieldTripHQ, TicketsHQ — is **event-shaped**.
Something happens on a date, people attend, someone pays. The shared engine is
an event with a roster.

Steward isn't that. It's **operations for a permanent institution**: the same
49 rooms every day, work orders, IT tickets, a gate log, staff who are already
on payroll. Nobody registers. Nobody pays to attend. The engine that fits a
summer camp does not fit a facilities department, and forcing it would damage
both.

**So: SchoolHQ is a sibling to the HQ family, not a fork of the engine.**

| Shared with HQ | Its own |
|---|---|
| HQ Account (identity, profile) | Data model — spaces, work, tickets |
| PayHQ, if rentals ever bill | Permissions — object-centric, not attendee lists |
| Brand grammar (Niche-suffix apps) | Buyer, sales motion, pricing |
| Design language | Operational cadence — daily, not per-event |

The camps module in Steward is where the two touch: a school running an
overnight trip is doing something FieldTripHQ-shaped. That's an integration
seam later, not a reason to share a core now.

---

## 2. Who buys it

**Not** the same self-serve organiser as CampHQ. A school buys as an
institution, which changes everything about the motion:

- **Champion:** the person living the pain — a facilities director, an
  operations/AV lead, an IT director. (At WCS that's you.)
- **Approver:** a business manager or head of school. Cares about replacing a
  line item, not about features.
- **Blocker:** IT. Owns the tenant, the SSO, the data question. Win them early
  — the WCS notes already say this.
- **Cycle:** months, budget-year shaped. Nothing like a camp director signing
  up on a Tuesday.

The wedge is the **Brightly/Dude Solutions bundle**. WCS licenses eight apps
and uses a fraction of them; `wcs-data/brightly-suite-map.md` already maps
what Steward replaces. That map is the sales pitch for every school on that
bundle, and there are many.

---

## 3. Core vs WCS-specific — the actual product work

This is the part that decides whether school #2 is a configuration change or a
rewrite. Honest first pass:

### Universal (belongs in the core)
- Rooms, resources, bookings, conflicts, approvals
- **Conflicts are conversations, not hard blocks** — soft warnings you can
  accept. This is a genuine differentiator and it is not WCS-specific.
- **Object-centric permissions** — an Access tab on every room showing who
  oversees it, with inline grant. Better than burying approval groups, and
  true for any school.
- Work orders on a shared queue; the same model serving maintenance and IT
- Audit trail (compliance, everywhere)
- Mobile-first: staff are walking around a campus, not sitting at a desk

### Configuration (varies by school, must not be hard-coded)
- Room and resource inventory, folders, campus geography
- Who resolves conflicts, and approval routing
- Terminology — "Beacon" and "Lighthouse PAC" are WCS's words
- Which **modules** are on (see §4)
- Term dates, the school year, bell schedule
- Branding: name, mark, colours, the verse

### WCS-specific (do NOT promote to core)
- The seven named conflict resolvers, the org chart
- The kneeling-Warrior identity and 1 Peter 4:10–11 — that's Steward, not
  SchoolHQ. A Catholic school, a charter network, a district: none of them
  want it.
- Planning Center as the incumbent (others run FMX, Skedda, or paper)
- The athletics-digest spreadsheet format, which is one AD's habit

**Open question, and the one I'd most want answered by school #2:** how much
of the approval routing is universal shape versus WCS's politics. It's the
likeliest thing to need a rewrite.

---

## 4. Modules

A school switches features on and off. This is what lets one deployment serve
a 200-pupil elementary and a district high school without either drowning in
the other's screens — and it lets a new module ship dark and be enabled per
school rather than landing on everyone.

Catalogue lives in `src/lib/modules.ts`; per-school overrides in
`schools.modules` (jsonb). A key nobody has set falls back to the default, so
adding a module needs no migration.

| Module | Default | Notes |
|---|---|---|
| `scheduling` | on, required | Rooms, bookings, conflicts, approvals |
| `people` | on, required | Directory, roles, oversight |
| `work` | on | Maintenance & setup queue |
| `it` | on | Help desk on the same queue |
| `crew` | on | Teams, positions, event staffing |
| `assets` | on | Equipment inventory |
| `security` | on | Guard shifts; visitor logs stay off disk |
| `athletics` | on | Team schedules, transport, weekly digest |
| `programs` | on | Multi-session umbrellas |
| `invites` | on | Invitations + public RSVP links |
| `rentals` | **off** | Outside orgs renting space |
| `camps` | **off** | Buses, cabins, duties for overnight trips |
| `insights` | on | Utilisation and turnaround reporting |
| `audit` | on | Usually a compliance requirement |

Disabled modules are gated at the **route**, not just hidden in navigation, so
a deep link doesn't reach them.

---

## 5. Tenancy — what exists now

Done, because it was cheap while the database was empty and expensive later:

- `schools`, `school_domains`, `memberships`
- `school_id` on all 30 data tables, keyed `(school_id, id)` — two schools
  will both have a "room-1"
- RLS on every table scoped to the caller's schools via `user_school_ids()`
- `school_id` defaults to the caller's own school, so no client code stamps
  tenancy on an insert, and the RLS check refuses cross-school writes anyway
- **Onboarding by email domain:** a school claims `wcsmiami.org`; anyone
  signing in with that domain is placed in it automatically. No invitation
  admin, which matters when a school has 230 staff.

### Not done
- **Roles are still in app data, not in `memberships.role`.** Permissions are
  enforced in the UI, and RLS currently lets any member read and write their
  school's rows. Fine for a pilot; not fine for a real product. This is the
  next serious piece of work.
- Per-school branding — still hard-coded Steward.
- A settings screen to toggle modules (the data layer is ready; no UI).
- Invite ids are guessable-ish; they should be tokens before external use.
- Cross-school admin (a district running several schools).

---

## 6. What I'd do next, in order

1. **Ship Steward to Administration.** One real school in production beats any
   amount of multi-tenant theory, and none of the above blocks it.
2. **Move roles into `memberships.role`** and enforce in RLS. This is the gap
   between "pilot" and "product", and it gets harder with every feature.
3. **Per-school branding + a module settings screen.** Together these make
   school #2 a configuration exercise.
4. **Find school #2** — ideally one on the Brightly bundle, ideally not a
   WCS clone. Everything in §3 is a guess until a second school argues with it.
5. Decide where SchoolHQ sits next to PayHQ/HQ Account, only once rentals or
   any other billing is real.
