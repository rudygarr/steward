-- ─────────────────────────────────────────────────────────────────────────
--  STEWARD / SCHOOLHQ — schema baseline
-- ─────────────────────────────────────────────────────────────────────────
--  Consolidated current state, equivalent to these applied migrations:
--    20260916020503  steward_collection_tables
--    20260916031001  multi_tenant_schools
--    20260916031019  tenant_scope_collection_tables
--    20260916031048  harden_security_definer_functions   (superseded below)
--    20260916031128  school_modules
--    20260917015425  move_rls_helpers_to_private_schema_v2
--
--  Written as one baseline rather than six files because the fourth was
--  largely undone by the sixth, and replaying that sequence would teach a
--  future reader a mistake. The mistake itself is documented in NOTES.md.
--
--  Apply to a fresh project with: supabase db push
-- ─────────────────────────────────────────────────────────────────────────

-- ── Tenancy ──────────────────────────────────────────────────────────────

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  -- Per-school module switches, e.g. {"athletics": false}. The catalogue and
  -- defaults live in src/lib/modules.ts; a missing key means "use the
  -- default", so adding a module needs no migration.
  modules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- How a person is placed in a school without anyone administering
-- invitations: the school claims its email domain and staff signing in with
-- it land there. Operator configuration, never exposed to clients.
create table public.school_domains (
  domain text primary key,
  school_id uuid not null references public.schools (id) on delete cascade
);

create table public.memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (user_id, school_id)
);
create index memberships_school_idx on public.memberships (school_id);

-- ── RLS helpers ──────────────────────────────────────────────────────────
-- These live in `private`, which PostgREST does not expose, so they are not
-- reachable at /rest/v1/rpc. They must NOT be moved to `public` and must NOT
-- have EXECUTE revoked from `authenticated`: RLS policies evaluate as the
-- CALLING role, so revoking it breaks every read and write with
-- "permission denied for function user_school_ids". See NOTES.md.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.user_school_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select school_id from public.memberships where user_id = (select auth.uid())
$$;

create or replace function private.current_school_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select school_id from public.memberships
  where user_id = (select auth.uid())
  order by created_at
  limit 1
$$;

grant execute on function private.user_school_ids() to authenticated;
grant execute on function private.current_school_id() to authenticated;

-- ── Auto-placement on first sign-in ──────────────────────────────────────
-- Without this a new member of staff authenticates successfully and then sees
-- an empty app.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target uuid;
begin
  select d.school_id into target
  from public.school_domains d
  where d.domain = lower(split_part(new.email, '@', 2));

  if target is not null then
    insert into public.memberships (user_id, school_id)
    values (new.id, target)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Data tables ──────────────────────────────────────────────────────────
-- One table per collection on the Database interface in src/lib/types.ts.
-- Each row is one entity keyed by the id the app already generates, with the
-- record in jsonb: TypeScript stays the source of truth, and any table can be
-- promoted to typed columns independently later.
--
-- Key is (school_id, id) because two schools will both have a "room-1".
-- school_id defaults to the caller's own school, so no client code stamps
-- tenancy on an insert and the RLS check refuses anything cross-school.

do $$
declare
  t text;
  tables text[] := array[
    'rooms','resources','people','events','work_items','drivers','templates',
    'notifications','conflict_notes','assets','rentals','audit','comments',
    'calendar_views','crew_teams','crew_positions','crew_members',
    'position_templates','crew_assignments','blockouts','programs','invites',
    'camp_buses','camp_cabins','cabin_rooms','camp_roles','camp_shifts',
    'camp_duties','guard_shifts'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create table public.%I (
         school_id uuid not null default private.current_school_id()
           references public.schools (id) on delete cascade,
         id text not null,
         data jsonb not null,
         updated_at timestamptz not null default now(),
         updated_by uuid references auth.users (id) on delete set null,
         primary key (school_id, id)
       )', t);
    execute format('alter table public.%I enable row level security', t);
    -- Any signed-in member may read and write their own school's rows, which
    -- matches how the app behaves today (permissions enforced in the UI).
    -- TIGHTEN THIS once roles move into memberships.role — see NOTES.md.
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (school_id in (select private.user_school_ids()))
         with check (school_id in (select private.user_school_ids()))',
      t || '_rw', t);
    execute format(
      'create index %I on public.%I (school_id, updated_at desc)',
      t || '_school_updated_idx', t);
  end loop;
end $$;

-- Singletons that aren't collections (currently just seedVersion), so a client
-- can tell a seeded database from an empty one.
create table public.meta (
  school_id uuid not null default private.current_school_id()
    references public.schools (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (school_id, key)
);
alter table public.meta enable row level security;
create policy meta_rw on public.meta
  for all to authenticated
  using (school_id in (select private.user_school_ids()))
  with check (school_id in (select private.user_school_ids()));

-- ── Tenancy table policies ───────────────────────────────────────────────
-- You can see your own school and your own membership, nothing else.
-- school_domains deliberately has RLS with NO policy: deny-all to clients.

alter table public.schools enable row level security;
alter table public.school_domains enable row level security;
alter table public.memberships enable row level security;

create policy schools_read on public.schools
  for select to authenticated
  using (id in (select private.user_school_ids()));

create policy memberships_read on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.school_domains from anon, authenticated;

-- ── Tenant #1 ────────────────────────────────────────────────────────────

insert into public.schools (slug, name, modules)
values ('wcs', 'Westminster Christian School', '{"camps": false, "rentals": false}'::jsonb);

insert into public.school_domains (domain, school_id)
select 'wcsmiami.org', id from public.schools where slug = 'wcs';
