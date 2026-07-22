-- ============================================================
-- CUSTOM DOCUMENT REQUESTS  (staff → client, one-off asks)
-- A unique document staff needs from a client for a given month, outside the
-- standard required-uploads list. Appears in the client's Required Documents
-- checklist and is fulfilled by uploading a file.
--
--   status  'pending'  → client hasn't uploaded yet            (grey)
--           'uploaded' → client uploaded, awaiting staff review (yellow)
--           'approved' → staff accepted                         (green)
--           'rejected' → staff declined                          (red)
-- ============================================================

create table if not exists public.custom_document_requests (
  id             uuid        primary key default gen_random_uuid(),
  client_email   text        not null,
  title          text        not null,          -- e.g. "August bank reconciliation"
  note           text,                           -- optional instructions to the client
  month          text        not null,           -- 'YYYY-MM'
  status         text        not null default 'pending'
                 check (status in ('pending', 'uploaded', 'approved', 'rejected')),
  document_id    uuid,                            -- the uploaded file fulfilling it
  document_table text,
  requested_by   text,                            -- staff email
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists custom_req_email_month_idx
  on public.custom_document_requests (client_email, month);

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
-- Idempotent; also defined in profiles_services.sql. Safe if run standalone.
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- ── RLS ─────────────────────────────────────────────────────
alter table public.custom_document_requests enable row level security;

-- Clients read their own requests.
drop policy if exists "clients read own custom requests" on public.custom_document_requests;
create policy "clients read own custom requests"
  on public.custom_document_requests for select
  using (client_email = (select email from public.profiles where id = auth.uid()));

-- Clients may update their own request to mark it 'uploaded' (attach a file).
-- They can't self-approve — status limited to pending/uploaded on their writes.
drop policy if exists "clients update own custom requests" on public.custom_document_requests;
create policy "clients update own custom requests"
  on public.custom_document_requests for update
  using  (client_email = (select email from public.profiles where id = auth.uid()))
  with check (
    status in ('pending', 'uploaded')
    and client_email = (select email from public.profiles where id = auth.uid())
  );

-- Staff / admins manage everything (create, approve, reject, delete).
drop policy if exists "staff and admins manage custom requests" on public.custom_document_requests;
create policy "staff and admins manage custom requests"
  on public.custom_document_requests for all
  using      (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- Auto-update updated_at
drop trigger if exists on_custom_document_requests_updated on public.custom_document_requests;
create trigger on_custom_document_requests_updated
  before update on public.custom_document_requests
  for each row execute procedure public.handle_updated_at();
