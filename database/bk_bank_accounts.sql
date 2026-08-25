-- ============================================================
-- BK BANK ACCOUNTS  (folder table)
--
-- A folder under "Bookkeeping & Financials" for bank-related documents —
-- statements, reconciliations, anything tied to an account — so they stop being
-- scattered through Additional BK Docs.
--
-- Bank accounts already exist on a client's profile, but only as required items:
-- one Bank Statements slot per account, for the monthly checklist. That is a
-- box to tick, not a place to keep things. This is the place.
--
-- Same shape as every other folder table, so src/db/documents.ts reads and
-- writes it with no special case — including the two columns later migrations
-- added to the others (uploaded_by_role/uploaded_by, subfolder_id).
--
-- SAFE TO RE-RUN.
-- ============================================================

create table if not exists public.bk_bank_accounts (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        references public.profiles(id) on delete cascade,
  name            text        not null default 'Document',
  file_name       text,
  document_url    text        not null,
  email           text,
  status          text        not null default 'new'      check (status in ('new', 'viewed', 'not_viewed')),
  approval_status text        not null default 'pending'  check (approval_status in ('pending', 'approved', 'rejected')),
  approval_note   text,
  approved_by     text,
  approved_at     timestamptz,
  -- Added to the other folder tables by folder_uploader.sql
  uploaded_by_role text       not null default 'client'   check (uploaded_by_role in ('client', 'staff', 'admin')),
  uploaded_by      text,
  -- Added to the other folder tables by subfolders.sql
  subfolder_id    uuid        references public.custom_subfolders(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── indexes ─────────────────────────────────────────────────
create index if not exists bk_bank_accounts_email_idx     on public.bk_bank_accounts (email);
create index if not exists bk_bank_accounts_user_id_idx   on public.bk_bank_accounts (user_id);
create index if not exists bk_bank_accounts_status_idx    on public.bk_bank_accounts (approval_status);
create index if not exists bk_bank_accounts_subfolder_idx on public.bk_bank_accounts (subfolder_id);

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- ── RLS ─────────────────────────────────────────────────────
-- Word for word what the other folder tables do: a client reaches their own
-- documents, matched on user_id or on the email their profile carries; staff
-- and admin reach everyone's.
alter table public.bk_bank_accounts enable row level security;

drop policy if exists "Users can view own bk_bank_accounts" on public.bk_bank_accounts;
create policy "Users can view own bk_bank_accounts"
  on public.bk_bank_accounts for select
  using (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "Users can insert own bk_bank_accounts" on public.bk_bank_accounts;
create policy "Users can insert own bk_bank_accounts"
  on public.bk_bank_accounts for insert
  with check (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "Users can update own bk_bank_accounts" on public.bk_bank_accounts;
create policy "Users can update own bk_bank_accounts"
  on public.bk_bank_accounts for update
  using (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "Staff and admins read bk_bank_accounts" on public.bk_bank_accounts;
create policy "Staff and admins read bk_bank_accounts"
  on public.bk_bank_accounts for select
  using (public.is_staff_or_admin());

drop policy if exists "Staff and admins write bk_bank_accounts" on public.bk_bank_accounts;
create policy "Staff and admins write bk_bank_accounts"
  on public.bk_bank_accounts for insert
  with check (public.is_staff_or_admin());

drop policy if exists "Staff and admins update bk_bank_accounts" on public.bk_bank_accounts;
create policy "Staff and admins update bk_bank_accounts"
  on public.bk_bank_accounts for update
  using      (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "Staff and admins delete bk_bank_accounts" on public.bk_bank_accounts;
create policy "Staff and admins delete bk_bank_accounts"
  on public.bk_bank_accounts for delete
  using (public.is_staff_or_admin());

-- ── Keep updated_at honest ──────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_bk_bank_accounts_updated on public.bk_bank_accounts;
create trigger on_bk_bank_accounts_updated
  before update on public.bk_bank_accounts
  for each row execute procedure public.handle_updated_at();
