-- ============================================================
-- CUSTOM SUBFOLDERS  (staff/admin-created subfolders inside an
-- existing folder table). Global per folder table (NOT per client).
-- A document may optionally be filed into one subfolder via the
-- new `subfolder_id` column added to every folder table.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
-- Idempotent; also defined in other migrations. Safe if run standalone.
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- ── Table ────────────────────────────────────────────────────
create table if not exists public.custom_subfolders (
  id           uuid        primary key default gen_random_uuid(),
  parent_table text        not null,           -- which folder table this subfolder lives in
  name         text        not null,
  created_by   text,                           -- email of the staff/admin who made it
  created_at   timestamptz not null default now()
);

-- One subfolder name per folder table (case-insensitive).
create unique index if not exists custom_subfolders_parent_name_idx
  on public.custom_subfolders (parent_table, lower(name));

-- ── RLS ──────────────────────────────────────────────────────
alter table public.custom_subfolders enable row level security;

-- Read: everyone signed in (clients need to see the subfolder to view files inside).
drop policy if exists "read subfolders" on public.custom_subfolders;
create policy "read subfolders"
  on public.custom_subfolders for select
  using (true);

-- Manage (insert/update/delete): staff/admin only.
drop policy if exists "staff manage subfolders" on public.custom_subfolders;
create policy "staff manage subfolders"
  on public.custom_subfolders for all
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- ── Add nullable subfolder_id to every folder table ──────────
-- Loops over the known folder tables and adds the column + an index
-- if the table exists and the column is missing.
do $$
declare
  t text;
  folder_tables text[] := array[
    'tax_contracts','tax_invoices','tax_client_uploads','tax_additional_docs','tax_return_information',
    'bk_contracts','bk_invoices','bk_final_pnl','bk_mr_required_info','bk_mr_client_review','bk_mr_final_statements',
    'cfo_contracts','cfo_invoices','cfo_additional_docs','cfo_mr_required_info','cfo_mr_client_review','cfo_mr_final_statements'
  ];
begin
  foreach t in array folder_tables loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format(
        'alter table public.%I add column if not exists subfolder_id uuid references public.custom_subfolders(id) on delete set null',
        t
      );
      execute format(
        'create index if not exists %I on public.%I (subfolder_id)',
        t || '_subfolder_idx', t
      );
    end if;
  end loop;
end $$;
