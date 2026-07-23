-- ============================================================
-- PROFILES: client service type + QBO access
-- Tailors what a client sees in their portal:
--   services        → which categories/requirements are visible
--                     '{BK}'      = Bookkeeping only
--                     '{CFO}'     = CFO only
--                     '{BK,CFO}'  = both
--   has_qbo_access  → when true, the "Prior Month Bookkeeping / QBO Access"
--                     required item is hidden (we already have access).
--
-- Both are editable later by an admin (BK client upgrading to CFO; QBO access
-- established). Safe to re-run.
-- ============================================================

alter table public.profiles
  add column if not exists services       text[]  not null default '{BK}',
  add column if not exists has_qbo_access  boolean not null default false;

-- Guard: services may only contain BK / TAX / CFO (and must be non-empty).
-- Drop-and-recreate so re-runs pick up new allowed values.
alter table public.profiles drop constraint if exists profiles_services_valid;
alter table public.profiles
  add constraint profiles_services_valid
  check (
    array_length(services, 1) >= 1
    and services <@ array['BK','TAX','CFO']::text[]
  );

-- ── RLS: let staff/admins read + update client profiles ──────
--
-- IMPORTANT: a profiles policy must NOT run a sub-SELECT on `profiles`, or Postgres
-- recurses ("infinite recursion detected in policy for relation profiles") and every
-- query 500s. We check the caller's role via a SECURITY DEFINER function that reads
-- profiles with RLS bypassed — no recursion.
create or replace function public.is_staff_or_admin()
returns boolean
language sql
security definer            -- runs as owner → skips RLS on the read below
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  );
$$;

grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- Staff/admins may update any client profile (Clients screen edits).
drop policy if exists "staff and admins update profiles" on public.profiles;
create policy "staff and admins update profiles"
  on public.profiles for update
  using      (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- Staff/admins may read all profiles; everyone can still read their own.
drop policy if exists "staff and admins read profiles" on public.profiles;
create policy "staff and admins read profiles"
  on public.profiles for select
  using (auth.uid() = id or public.is_staff_or_admin());
