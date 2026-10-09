-- ============================================================
-- TEAM ONE — UPDATES AND REVIEW
--
-- Camaree: "For each assigned client Team One need a prompt to enter updates:
--   Select Service: TAX, BK or CFO
--   Estimated Completion Date: (Select Date for each service selected)
--   If BK or CFO selected then, add these fields to be filled out:
--     Query Sheet: (they should enter a link)   PNL: Upload Doc   Balance: Upload Doc
-- ... a notification for all OTHER staff that Team One has added new links or
-- files ... requiring a team member on the FTG side to mark the Link, or
-- uploads as: Approved, Denied, Escalate.
--   Approved: allows for file folder selection and alerts client
--   Denied:   sends alert back to Team One to revise errors
--   Escalate: sends alert to Daja to review. Once to Daja, she can either
--             select REVISE or add notes which will alert client."
--
-- One update per service Team One reports on. Each link or file in it is an
-- item, reviewed on its own. The alert to staff is the review queue itself; the
-- client is alerted through notifications when something of theirs is filed or
-- a note is left for them.
--
-- Run after team_one_access.sql. SAFE TO RE-RUN.
-- ============================================================

create table if not exists public.team_one_updates (
  id             uuid        primary key default gen_random_uuid(),
  client_email   text        not null check (client_email = lower(client_email)),
  service        text        not null check (service in ('TAX', 'BK', 'CFO')),
  est_completion date        not null,
  submitted_by   text,
  created_at     timestamptz not null default now()
);
create index if not exists team_one_updates_client_idx
  on public.team_one_updates (client_email, created_at desc);

create table if not exists public.team_one_items (
  id                uuid        primary key default gen_random_uuid(),
  update_id         uuid        not null references public.team_one_updates(id) on delete cascade,
  client_email      text        not null check (client_email = lower(client_email)),
  service           text        not null check (service in ('BK', 'CFO')),
  kind              text        not null check (kind in ('query_sheet', 'pnl', 'balance')),
  -- A link for the query sheet, the stored file for the other two.
  url               text        not null,
  file_name         text,
  status            text        not null default 'pending'
                    check (status in ('pending', 'approved', 'denied', 'escalated', 'revise', 'noted')),
  review_note       text,
  reviewed_by       text,
  reviewed_at       timestamptz,
  -- Where an approved item was filed for the client.
  filed_table       text,
  filed_document_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists team_one_items_status_idx on public.team_one_items (status, created_at desc);
create index if not exists team_one_items_client_idx on public.team_one_items (client_email, created_at desc);

drop trigger if exists on_team_one_items_updated on public.team_one_items;
create trigger on_team_one_items_updated
  before update on public.team_one_items
  for each row execute procedure public.handle_updated_at();

-- ── Who may do what ──────────────────────────────────────────
alter table public.team_one_updates enable row level security;
alter table public.team_one_items   enable row level security;

-- Staff read and review everything.
drop policy if exists "staff manage team one updates" on public.team_one_updates;
create policy "staff manage team one updates"
  on public.team_one_updates for all
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

drop policy if exists "staff manage team one items" on public.team_one_items;
create policy "staff manage team one items"
  on public.team_one_items for all
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- Team One reads and adds its own, for clients and services it is assigned.
drop policy if exists "team one reads its updates" on public.team_one_updates;
create policy "team one reads its updates"
  on public.team_one_updates for select
  using (public.team_one_sees(client_email, service));

drop policy if exists "team one adds updates" on public.team_one_updates;
create policy "team one adds updates"
  on public.team_one_updates for insert
  with check (public.team_one_sees(client_email, service));

drop policy if exists "team one reads its items" on public.team_one_items;
create policy "team one reads its items"
  on public.team_one_items for select
  using (public.team_one_sees(client_email, service));

-- An item goes in unreviewed, and under an update for the same client and
-- service. Reviewing is staff's: Team One has no update policy at all.
drop policy if exists "team one adds items" on public.team_one_items;
create policy "team one adds items"
  on public.team_one_items for insert
  with check (
    public.team_one_sees(client_email, service)
    and status = 'pending'
    and review_note is null and reviewed_by is null and reviewed_at is null
    and filed_table is null and filed_document_id is null
    and exists (select 1 from public.team_one_updates u
                where u.id = update_id and u.client_email = team_one_items.client_email
                  and u.service = team_one_items.service));

-- ── Team One's files ─────────────────────────────────────────
-- Stored in the documents bucket under team_one/<client email>/, and only for a
-- client it is assigned.
drop policy if exists "team one uploads for assigned clients" on storage.objects;
create policy "team one uploads for assigned clients"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'team_one'
    and public.team_one_sees((storage.foldername(name))[2], null));

-- ── Telling the client ───────────────────────────────────────
-- Notifications have no insert policy, so staff go through this. 'new' is a
-- type the table already allows.
create or replace function public.notify_client(p_email text, p_title text, p_message text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Only staff can notify a client';
  end if;
  insert into public.notifications (user_id, title, message, type)
  select id, p_title, p_message, 'new'
  from public.profiles
  where lower(email) = lower(p_email) and role = 'client';
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.notify_client(text, text, text) to authenticated;

-- ── Notes the client can read ────────────────────────────────
-- Unlike client_notes, which are internal and never shown to the client. Daja's
-- notes on an escalation land here, and so will the profile note comments on
-- the client's dashboard.
create table if not exists public.client_shared_notes (
  id           uuid        primary key default gen_random_uuid(),
  client_email text        not null check (client_email = lower(client_email)),
  body         text        not null,
  author_email text,
  author_name  text,
  source       text        not null default 'staff' check (source in ('staff', 'escalation')),
  created_at   timestamptz not null default now()
);
create index if not exists client_shared_notes_client_idx
  on public.client_shared_notes (client_email, created_at desc);

alter table public.client_shared_notes enable row level security;

drop policy if exists "staff manage shared notes" on public.client_shared_notes;
create policy "staff manage shared notes"
  on public.client_shared_notes for all
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

drop policy if exists "clients read their shared notes" on public.client_shared_notes;
create policy "clients read their shared notes"
  on public.client_shared_notes for select
  using (client_email = lower((select email from public.profiles where id = auth.uid())));
