-- ============================================================
-- DOCUMENT REQUIREMENTS  (Upload progress tracking)
-- One row = one required monthly item that the admin has
-- ACCEPTED (approved) and TAGGED for a client, in a given month.
--
-- The client-side progress bar = fulfilled slots / total required items.
-- Only admin-accepted + tagged documents create a row here, so the
-- progress only moves when the admin confirms an upload.
-- ============================================================

create table if not exists public.document_requirements (
  id              uuid        primary key default gen_random_uuid(),
  client_email    text        not null,
  document_id     uuid,                       -- the doc that fulfilled / is fulfilling it
  document_table  text,                       -- which folder table the doc lives in
  service         text        not null check (service in ('BK', 'CFO')),
  requirement_key text        not null,       -- e.g. 'bank_statements' (see src/db/requirements.ts)
  month           text        not null,       -- 'YYYY-MM'
  -- 'pending'  = client uploaded a file against this item, awaiting admin approval  → yellow radio
  -- 'approved' = admin approved the upload for this item                            → green radio
  status          text        not null default 'approved' check (status in ('pending', 'approved')),
  tagged_by       text,                        -- admin email (who approved)
  created_at      timestamptz not null default now(),

  -- Each required item counts once per client per month ("1 slot per item")
  unique (client_email, month, service, requirement_key)
);

-- Migration for existing installs: add the status column if the table predates it.
-- Existing rows were all admin-tagged, so they are 'approved'.
alter table public.document_requirements
  add column if not exists status text not null default 'approved'
  check (status in ('pending', 'approved'));

create index if not exists doc_req_email_month_idx
  on public.document_requirements (client_email, month);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.document_requirements enable row level security;

-- Clients can read their own requirement rows (matched by profile email)
drop policy if exists "clients read own requirements" on public.document_requirements;
create policy "clients read own requirements"
  on public.document_requirements for select
  using (client_email = (select email from public.profiles where id = auth.uid()));

-- Clients may create / update ONLY their own rows, and only as 'pending'.
-- (Approval → 'approved' is done by staff/admin under the policy below.)
drop policy if exists "clients insert own pending requirements" on public.document_requirements;
create policy "clients insert own pending requirements"
  on public.document_requirements for insert
  with check (
    status = 'pending'
    and client_email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "clients update own pending requirements" on public.document_requirements;
create policy "clients update own pending requirements"
  on public.document_requirements for update
  using  (client_email = (select email from public.profiles where id = auth.uid()))
  with check (
    status = 'pending'
    and client_email = (select email from public.profiles where id = auth.uid())
  );

-- Clients may delete their own PENDING slot (e.g. when they delete the file they
-- uploaded for it) → dashboard radio returns to grey. Approved slots are protected.
drop policy if exists "clients delete own pending requirements" on public.document_requirements;
create policy "clients delete own pending requirements"
  on public.document_requirements for delete
  using (
    status = 'pending'
    and client_email = (select email from public.profiles where id = auth.uid())
  );

-- Staff and admins can read/write everything (both work the Documents queue)
drop policy if exists "admins manage requirements" on public.document_requirements;
drop policy if exists "staff and admins manage requirements" on public.document_requirements;
create policy "staff and admins manage requirements"
  on public.document_requirements for all
  using     (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff')))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff')));
