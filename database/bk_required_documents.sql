-- ============================================================
-- BK REQUIRED DOCUMENTS  (folder table)
-- A client-upload folder under "Bookkeeping & Financials",
-- mirroring the Tax "Client Uploads" folder. Clients upload
-- their required bookkeeping documents here; admins/staff
-- review and approve/reject them.
--
-- Matches the columns read/written by src/db/documents.ts
-- (Document interface + createDocumentRecord / approve / reject).
-- ============================================================

create table if not exists public.bk_required_documents (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        references public.profiles(id) on delete cascade,
  name            text        not null default 'Document',
  file_name       text,
  document_url    text        not null,
  email           text,
  status          text        not null default 'new'     check (status in ('new', 'viewed', 'not_viewed')),
  approval_status text        not null default 'pending'  check (approval_status in ('pending', 'approved', 'rejected')),
  approval_note   text,
  approved_by     text,
  approved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── indexes ─────────────────────────────────────────────────
create index if not exists bk_required_documents_email_idx   on public.bk_required_documents (email);
create index if not exists bk_required_documents_user_id_idx on public.bk_required_documents (user_id);
create index if not exists bk_required_documents_status_idx  on public.bk_required_documents (approval_status);

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- ── RLS ─────────────────────────────────────────────────────
alter table public.bk_required_documents enable row level security;

-- Clients see / update their own docs (matched by profile email or user_id)
drop policy if exists "Users can view own bk_required_documents" on public.bk_required_documents;
create policy "Users can view own bk_required_documents"
  on public.bk_required_documents for select
  using (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "Users can insert own bk_required_documents" on public.bk_required_documents;
create policy "Users can insert own bk_required_documents"
  on public.bk_required_documents for insert
  with check (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "Users can update own bk_required_documents" on public.bk_required_documents;
create policy "Users can update own bk_required_documents"
  on public.bk_required_documents for update
  using (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "Users can delete own bk_required_documents" on public.bk_required_documents;
create policy "Users can delete own bk_required_documents"
  on public.bk_required_documents for delete
  using (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

-- Staff and admins manage everything (they work the Documents queue)
drop policy if exists "staff and admins manage bk_required_documents" on public.bk_required_documents;
create policy "staff and admins manage bk_required_documents"
  on public.bk_required_documents for all
  using      (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- ── Auto-update updated_at ──────────────────────────────────
drop trigger if exists on_bk_required_documents_updated on public.bk_required_documents;
create trigger on_bk_required_documents_updated
  before update on public.bk_required_documents
  for each row execute procedure public.handle_updated_at();
