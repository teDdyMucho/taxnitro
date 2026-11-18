-- ============================================================
-- TAX ONBOARDING, ONE SEASON AT A TIME
--
-- Camaree: "I am thinking we will actually change to doing an onboarding
-- funnel ... specifically for tax preparation services" and "since we are
-- taking everything to the software application now, all tax clients in the
-- 2027 season can have the same onboarding process (as if they were new) to
-- ensure all information is current."
--
-- One row per client per tax season. '2027' is the season filed in 2027, for
-- the 2026 tax year. A new season is a new row, so every client starts again
-- at the first step, and last season's answers stay exactly as they were.
--
--   welcomed_at        they read the welcome and started
--   answers, status    the tax questionnaire, saved as they go
--   submitted_at       when they submitted it
--   docs_confirmed_at  when they told us every document is in
--
-- The documents are not kept here. They are tracked the way the monthly
-- required items are, in document_requirements: service 'TAX', and the season
-- in the month column. So FTG's Approve and Decline already move them,
-- deleting a file already reopens its item, and moving a file already carries
-- its item along (delete_document.sql, move_document.sql). That table allowed
-- only BK and CFO; TAX is added at the bottom of this file.
--
-- Answers are jsonb, as the monthly questionnaire's are: the questions are a
-- business list that will change (Camaree is updating the intake forms), and
-- a new question should not need a migration. Their shape is in
-- src/lib/taxOnboarding.ts.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller helpers (SECURITY DEFINER → no profiles-policy recursion) ─────────
-- Idempotent; also defined in profiles_services.sql and monthly_questionnaire.sql.
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff') and coalesce(is_active, true));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

create or replace function public.my_email()
returns text language sql security definer stable set search_path = public as $$
  select email from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_email() to authenticated;

-- ── The table ────────────────────────────────────────────────
create table if not exists public.tax_onboarding (
  id                 uuid        primary key default gen_random_uuid(),
  -- Email rather than a profile id, matching document_requirements and the
  -- folder tables, so a client is identified the same way everywhere.
  client_email       text        not null,
  season             text        not null,                 -- '2027'
  answers            jsonb       not null default '{}'::jsonb,
  status             text        not null default 'in_progress'
                                 check (status in ('in_progress', 'submitted')),
  welcomed_at        timestamptz,
  submitted_at       timestamptz,
  docs_confirmed_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- One onboarding per client per season. Also what the app's upsert
  -- conflicts on, so saving again updates the one row.
  unique (client_email, season)
);

create index if not exists tax_onboarding_season_idx
  on public.tax_onboarding (season, client_email);

-- ── Keep updated_at honest ───────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_tax_onboarding_updated on public.tax_onboarding;
create trigger on_tax_onboarding_updated
  before update on public.tax_onboarding
  for each row execute procedure public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
-- The anon key ships inside the public web bundle, so every rule is explicit.
-- A client reads and writes their own; staff and admin read and write
-- everyone's. The client's email comes from their profile, not from the
-- request, so answering as somebody else is not a matter of changing a field.
alter table public.tax_onboarding enable row level security;

drop policy if exists "read own or all as staff" on public.tax_onboarding;
create policy "read own or all as staff"
  on public.tax_onboarding for select
  using (client_email = public.my_email() or public.is_staff_or_admin());

drop policy if exists "start own" on public.tax_onboarding;
create policy "start own"
  on public.tax_onboarding for insert
  with check (client_email = public.my_email() or public.is_staff_or_admin());

drop policy if exists "update own" on public.tax_onboarding;
create policy "update own"
  on public.tax_onboarding for update
  using      (client_email = public.my_email() or public.is_staff_or_admin())
  with check (client_email = public.my_email() or public.is_staff_or_admin());

-- Nobody deletes an onboarding: it is the record of what the client told us
-- that season. Staff who need one gone can remove it from the SQL editor.

-- ── TAX items in document_requirements ───────────────────────
-- The service check is rebuilt the way document_requirements.sql rebuilds its
-- status check: drop whatever constrains `service` (its name may vary across
-- installs), then add a named one. BK and CFO rows are untouched; TAX joins.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'document_requirements'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%service%'
  loop
    execute format('alter table public.document_requirements drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.document_requirements
  add constraint document_requirements_service_check
  check (service in ('BK', 'CFO', 'TAX'));

-- Check: the table exists with its rules, and TAX is allowed.
select
  (select count(*) from public.tax_onboarding)                       as onboardings,
  (select count(*) from pg_policies where tablename = 'tax_onboarding') as policies,
  (select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'document_requirements_service_check')            as service_rule;
