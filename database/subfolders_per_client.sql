-- ============================================================
-- CUSTOM SUBFOLDERS → per client
--
-- Subfolders were global per folder table: one "2024 Returns" for the whole
-- system. That is wrong on two counts once staff start filing per client —
--   · the unique index blocked a second client from reusing a name, and
--   · `using (true)` on select meant every client could read every other
--     client's folder names.
--
-- This adds an owner, scopes the uniqueness to that owner, and rewrites the
-- read policy so a client sees only their own.
--
-- Rows created before this migration have owner_email = NULL. Those stay
-- visible to everyone and keep working — they are the pre-existing shared
-- folders. Anything created from now on is owned.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- ── Owner column ─────────────────────────────────────────────
-- Email rather than a profile id, to match how the folder tables and
-- document_requirements already identify a client.
alter table public.custom_subfolders
  add column if not exists owner_email text;

create index if not exists custom_subfolders_owner_idx
  on public.custom_subfolders (owner_email);

-- ── Uniqueness is now per owner ──────────────────────────────
-- coalesce so the legacy NULL owners still collide with each other:
-- in a plain unique index NULLs are distinct, which would let duplicates in.
drop index if exists custom_subfolders_parent_name_idx;
create unique index if not exists custom_subfolders_parent_owner_name_idx
  on public.custom_subfolders (parent_table, coalesce(owner_email, ''), lower(name));

-- ── RLS ──────────────────────────────────────────────────────
alter table public.custom_subfolders enable row level security;

-- Read: staff/admin see everything; anyone else sees only folders they own.
--
-- The old policy was `using (true)`, which let ANY caller holding the anon key
-- — and that key ships in the public web bundle — list every subfolder name.
-- Those names are account identifiers ("Chase Checking 2997", "Amex 4003"),
-- so this was client financial data readable without signing in.
--
-- There is deliberately no exemption for the legacy owner_email IS NULL rows:
-- subfolders are read only by AdminFileBrowser and AdminUploadModal, both
-- staff-only, so nothing client-facing depends on seeing them. The owner
-- clause is here for when the client UI does gain subfolders.
drop policy if exists "read subfolders" on public.custom_subfolders;
create policy "read subfolders"
  on public.custom_subfolders for select
  using (
    public.is_staff_or_admin()
    or owner_email = (select email from public.profiles where id = auth.uid())
  );

-- Manage (insert/update/delete): staff/admin only. Unchanged.
drop policy if exists "staff manage subfolders" on public.custom_subfolders;
create policy "staff manage subfolders"
  on public.custom_subfolders for all
  using      (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());
