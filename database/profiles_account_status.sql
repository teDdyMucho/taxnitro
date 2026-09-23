-- ============================================================
-- ACCOUNT STATUS  (where a client's subscription stands)
--
-- `is_active` is a boolean, so it can only say yes or no. What the team
-- needs to tell apart is three things:
--
--   active — subscription is current
--   paused — subscription is paused or delayed; they are coming back
--   closed — service is cancelled or no longer provided
--
-- A paused client is not the same as a closed one: one is a gap, the other
-- is the end, and the list has to be filterable on that difference.
--
-- `is_active` stays, because sign-in checks it and RLS policies read it.
-- The two are kept in step by a trigger rather than by asking every caller
-- to remember: paused and closed are both not-active.
--
-- SAFE TO RE-RUN.
-- ============================================================

alter table public.profiles
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'paused', 'closed'));

-- Existing rows: anything already switched off becomes 'paused' rather than
-- 'closed'. Pausing is the reversible one, and a wrong guess there is a
-- smaller mistake than marking a live client as gone.
update public.profiles
   set account_status = 'paused'
 where is_active = false
   and account_status = 'active';

create index if not exists profiles_account_status_idx
  on public.profiles (account_status);

-- ── Keep is_active in step ───────────────────────────────────
-- Sign-in and several policies read is_active, so it must not drift from
-- the status. Setting either one updates the other.
create or replace function public.sync_account_status()
returns trigger language plpgsql as $$
begin
  -- On insert there is no OLD row to compare against, so this is handled
  -- on its own rather than folded into the update logic below.
  if tg_op = 'INSERT' then
    new.is_active := (new.account_status = 'active');
    return new;
  end if;

  -- Status was set explicitly: is_active follows it. Checked first, so a
  -- caller that sends both — as the client screen does — gets the status it
  -- asked for rather than whatever is_active implies.
  if new.account_status is distinct from old.account_status then
    new.is_active := (new.account_status = 'active');

  -- Only is_active was touched (the deactivate button on the staff page):
  -- switching off pauses, switching on makes current again. A closed client
  -- switched back on becomes active, which is the only sensible reading.
  elsif new.is_active is distinct from old.is_active then
    new.account_status := case when new.is_active then 'active' else 'paused' end;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_account_status on public.profiles;
create trigger sync_account_status
  before insert or update on public.profiles
  for each row execute procedure public.sync_account_status();

-- ── A client may not change their own ────────────────────────
-- profiles_client_editable.sql pins the columns a client must not touch.
-- Add this one to that list, or a client could reopen a closed account.
--
-- NOTE: this replaces the copy in profiles_client_editable.sql, which cannot
-- pin the column itself — it may be run against a database that does not have
-- it yet. So if that file is ever re-run after this one, run this one again
-- afterwards to put the pin back.
create or replace function public.pin_client_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_staff_or_admin() then
    return new;
  end if;

  new.role           := old.role;
  new.is_active      := old.is_active;
  new.account_status := old.account_status;
  new.client_id      := old.client_id;
  new.plan           := old.plan;
  new.email          := old.email;
  new.services       := old.services;
  new.has_qbo_access := old.has_qbo_access;

  return new;
end;
$$;
