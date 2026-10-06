-- ============================================================
-- WORK PROGRESS PER SERVICE
--
-- Camaree, app notes 3b: "Add a Progress Label for services to track where we
-- are on our end. The data entered here will inform the dashboard."
--
--   TAX and YER   Not Started · In Progress · Completed
--   BK and CFO    Not Started · In Progress · Current
--
-- "If possible, have 'Current' default back to 'Not Started' every 1st of the
-- month." Rather than a scheduled job that has to run on time, Current is
-- stored with the month it was set in, and the app reads it as Not Started
-- once that month is over. It is exact on the 1st, and there is nothing that
-- can fail to run. See src/lib/serviceProgress.ts.
--
-- Stored as one JSON object keyed by service, e.g.
--   { "TAX": { "status": "in_progress" },
--     "BK":  { "status": "current", "month": "2026-10" } }
--
-- This is FTG's note on where its own work stands, so a client must not be
-- able to set it. The trigger that pins the columns a client may not edit is
-- re-created below with service_progress added. Every column it already
-- pinned is carried over from its latest version (profiles_account_status.sql),
-- account_status included — leaving one out here would unprotect it.
--
-- SAFE TO RE-RUN.
-- ============================================================

alter table public.profiles
  add column if not exists service_progress jsonb not null default '{}'::jsonb;

create or replace function public.pin_client_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Staff and admin edit freely. So does anything running without a signed-in
  -- user, which is the signup trigger creating the row in the first place.
  if auth.uid() is null or public.is_staff_or_admin() then
    return new;
  end if;

  new.role             := old.role;
  new.is_active        := old.is_active;
  new.account_status   := old.account_status;
  new.client_id        := old.client_id;
  new.plan             := old.plan;
  new.email            := old.email;
  new.services         := old.services;
  new.has_qbo_access   := old.has_qbo_access;
  new.service_progress := old.service_progress;

  return new;
end;
$$;

drop trigger if exists pin_client_profile_columns on public.profiles;
create trigger pin_client_profile_columns
  before update on public.profiles
  for each row execute procedure public.pin_client_profile_columns();
