-- ============================================================
-- CLIENT NOTES  (Business details on a client's profile)
--
-- Context about a client's business, written down as the team learns it, so
-- whoever opens that client's files next has the same picture as whoever
-- learned it first.
--
-- A list rather than one free-text field on `profiles`, because several people
-- add to this over months: a single column means the last person to save wins
-- and nobody can tell who wrote what or when.
--
-- INTERNAL. Staff and admin only. The client never reads these — they are
-- notes ABOUT the client, not FOR them, and the read policy says so.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

create table if not exists public.client_notes (
  id            uuid        primary key default gen_random_uuid(),
  -- Email rather than a profile id, to match how the folder tables and
  -- document_requirements already identify a client.
  client_email  text        not null,
  body          text        not null,
  -- Who wrote it, captured at write time. Kept as plain text so the note still
  -- reads correctly after that staff member leaves and their row is gone.
  author_email  text,
  author_name   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists client_notes_client_idx
  on public.client_notes (client_email, created_at desc);

-- ── Keep updated_at honest ───────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_client_notes_updated on public.client_notes;
create trigger on_client_notes_updated
  before update on public.client_notes
  for each row execute procedure public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
-- The anon key ships inside the public web bundle, so "no policy" is not
-- protection — every rule below is spelled out.
alter table public.client_notes enable row level security;

drop policy if exists "staff and admins read client notes" on public.client_notes;
create policy "staff and admins read client notes"
  on public.client_notes for select
  using (public.is_staff_or_admin());

drop policy if exists "staff and admins write client notes" on public.client_notes;
create policy "staff and admins write client notes"
  on public.client_notes for insert
  with check (public.is_staff_or_admin());

drop policy if exists "staff and admins edit client notes" on public.client_notes;
create policy "staff and admins edit client notes"
  on public.client_notes for update
  using      (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "staff and admins delete client notes" on public.client_notes;
create policy "staff and admins delete client notes"
  on public.client_notes for delete
  using (public.is_staff_or_admin());
