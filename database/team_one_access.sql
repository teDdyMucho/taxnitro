-- ============================================================
-- TEAM ONE — ACCESS
--
-- Camaree: "For the STAFF SIDE, we will have a special user called 'Team One'.
-- Team One can only view clients that are assigned to them. When a client is
-- assigned to Team One, an FTG staff member must be able to select and
-- deselect Team One Access to different clients and their respective folders
-- over time."
--
-- Team One is a role, beside client, staff and admin, so the team can share one
-- login or have several. A client is assigned to Team One per service — TAX,
-- YER, BK or CFO — and Team One then reads that client's profile and the
-- folders of those services. Nothing else: no other client, no other service,
-- and no writes anywhere.
--
-- is_staff_or_admin() is untouched and stays false for Team One, so none of
-- the staff policies open to them.
--
-- This only holds while the service-role key is out of the web bundle. That key
-- ignores every policy here.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── The role ─────────────────────────────────────────────────
-- Whatever check the live table has on role is replaced by one that also allows
-- team_one. Found by what it checks rather than by name: it was not made by a
-- file in this folder.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~* '\mrole\M'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles
  add constraint profiles_role_check check (role in ('client', 'staff', 'admin', 'team_one'));

-- An invite can be for Team One too.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.pending_staff'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~* '\mrole\M'
  loop
    execute format('alter table public.pending_staff drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.pending_staff
  add constraint pending_staff_role_check check (role in ('admin', 'staff', 'team_one'));

-- ── Who is Team One ──────────────────────────────────────────
-- A Team One login that has been switched off on the Staff page sees nothing.
create or replace function public.is_team_one()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'team_one' and coalesce(is_active, true));
$$;
grant execute on function public.is_team_one() to authenticated;

-- ── Which clients, and which of their services ───────────────
create table if not exists public.team_one_assignments (
  -- Lowercased on the way in, so a profile stored as CATRICEOLOGY@GMAIL.COM
  -- still matches.
  client_email text        primary key,
  -- Empty means no access. Kept rather than deleted, so who last changed it is
  -- still on record.
  services     text[]      not null default '{}',
  assigned_by  text,
  updated_at   timestamptz not null default now(),
  constraint team_one_services_known check (services <@ array['TAX', 'YER', 'BK', 'CFO']::text[]),
  constraint team_one_email_lower    check (client_email = lower(client_email))
);

alter table public.team_one_assignments enable row level security;

drop policy if exists "staff manage team one assignments" on public.team_one_assignments;
create policy "staff manage team one assignments"
  on public.team_one_assignments for all
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

drop policy if exists "team one reads its assignments" on public.team_one_assignments;
create policy "team one reads its assignments"
  on public.team_one_assignments for select using (public.is_team_one());

drop trigger if exists on_team_one_assignments_updated on public.team_one_assignments;
create trigger on_team_one_assignments_updated
  before update on public.team_one_assignments
  for each row execute procedure public.handle_updated_at();

-- Does the signed-in Team One login reach this client — for this service, or
-- for any service when p_service is null?
create or replace function public.team_one_sees(p_email text, p_service text)
returns boolean language sql security definer stable set search_path = public as $$
  select public.is_team_one() and exists (
    select 1 from public.team_one_assignments a
    where a.client_email = lower(p_email)
      and cardinality(a.services) > 0
      and (p_service is null or p_service = any(a.services)));
$$;
grant execute on function public.team_one_sees(text, text) to authenticated;

-- ── What Team One may read ───────────────────────────────────
-- Their assigned clients' profiles.
drop policy if exists "team one reads assigned clients" on public.profiles;
create policy "team one reads assigned clients"
  on public.profiles for select
  using (role = 'client' and public.team_one_sees(email, null));

-- Every folder table: any table holding a client's documents, which is any
-- table with both an email and a document_url. The service comes from the
-- table's prefix; unsorted uploads and the like belong to whichever services
-- the client is assigned for.
do $$
declare t record; svc text; pol text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables x
      on x.table_schema = c.table_schema and x.table_name = c.table_name and x.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'document_url'
      and exists (select 1 from information_schema.columns e
                  where e.table_schema = 'public' and e.table_name = c.table_name and e.column_name = 'email')
  loop
    svc := case
      when t.table_name like 'tax\_%' then 'TAX'
      when t.table_name like 'yer\_%' then 'YER'
      when t.table_name like 'bk\_%'  then 'BK'
      when t.table_name like 'cfo\_%' then 'CFO'
      else null
    end;
    pol := 'team one reads assigned ' || t.table_name;
    execute format('drop policy if exists %I on public.%I', pol, t.table_name);
    execute format('create policy %I on public.%I for select using (public.team_one_sees(email, %L))',
                   pol, t.table_name, svc);
  end loop;
end $$;

-- The folders staff have made inside those, theirs and the shared ones.
drop policy if exists "team one reads assigned subfolders" on public.custom_subfolders;
create policy "team one reads assigned subfolders"
  on public.custom_subfolders for select
  using (public.is_team_one() and (owner_email is null or public.team_one_sees(owner_email, null)));
