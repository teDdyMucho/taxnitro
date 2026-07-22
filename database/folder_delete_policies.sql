-- ============================================================
-- FOLDER TABLES: client + staff/admin DELETE policies
-- Fixes "0 rows deleted (blocked by RLS)" — the older folder tables
-- (tax_client_uploads, *_contracts, *_invoices, etc.) never had a DELETE
-- policy, so clients couldn't delete their own files.
--
-- Adds, for EVERY folder table:
--   • a client policy: delete rows you own (by user_id or profile email)
--   • a staff/admin policy: delete anything
-- Idempotent (drop-if-exists). Safe to re-run.
--
-- Requires public.is_staff_or_admin() (defined in profiles_services.sql); this
-- file also (re)creates it so it can run standalone.
-- ============================================================

-- Recursion-safe role check (also in profiles_services.sql).
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

do $$
declare
  t text;
  folder_tables text[] := array[
    'tax_client_uploads',
    'tax_required_documents',
    'tax_contracts',
    'tax_invoices',
    'tax_return_information',
    'bk_required_documents',
    'bk_contracts',
    'bk_invoices',
    'bk_for_client_review',
    'bk_final_pnl'
  ];
begin
  foreach t in array folder_tables loop
    -- Only touch tables that exist.
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      -- Make sure RLS is on (harmless if already enabled).
      execute format('alter table public.%I enable row level security', t);

      -- Client: delete own rows (matched by user_id or profile email).
      execute format('drop policy if exists %I on public.%I', 'clients delete own ' || t, t);
      execute format($f$
        create policy %I on public.%I for delete
        using (
          auth.uid() = user_id
          or email = (select email from public.profiles where id = auth.uid())
        )
      $f$, 'clients delete own ' || t, t);

      -- Staff / admin: delete anything.
      execute format('drop policy if exists %I on public.%I', 'staff delete ' || t, t);
      execute format($f$
        create policy %I on public.%I for delete
        using (public.is_staff_or_admin())
      $f$, 'staff delete ' || t, t);
    end if;
  end loop;
end $$;
