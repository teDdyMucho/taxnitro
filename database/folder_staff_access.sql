-- ============================================================
-- STAFF CAN FILE INTO EVERY FOLDER
--
-- Belly, 2026-10-27: uploading a client's tax return to Tax Returns failed with
-- "No files could be saved". The file reached storage on every try; the row
-- never did. tax_return_information is one of the original folder tables, made
-- before this repo's folder SQL, and nothing ever let staff add a row to it:
-- it had held no file at all, from anyone. The same row saves with the service
-- key, so the table is sound and the policies were the gap.
--
-- Tax Returns gets the rules every folder table has: its owner sees, adds and
-- updates their own (the client approves or rejects what FTG files there), and
-- staff manage all of it. The staff rule also goes on every other folder table,
-- so a folder nobody has filed into yet, such as the three Contracts folders,
-- cannot fail the same way the first time someone does. Deleting is
-- folder_delete_policies.sql's, and is left alone.
--
-- Additive: only the policies named here are dropped and made again, so a
-- policy anyone else made stays. SAFE TO RE-RUN.
-- ============================================================

-- Recursion-safe role check (also in profiles_services.sql).
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff') and coalesce(is_active, true));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- ── Tax Returns ──────────────────────────────────────────────
alter table public.tax_return_information enable row level security;
grant select, insert, update, delete on public.tax_return_information to authenticated;

drop policy if exists "view own tax_return_information" on public.tax_return_information;
create policy "view own tax_return_information" on public.tax_return_information for select
  using (auth.uid() = user_id or email = (select email from public.profiles where id = auth.uid()));

drop policy if exists "insert own tax_return_information" on public.tax_return_information;
create policy "insert own tax_return_information" on public.tax_return_information for insert
  with check (auth.uid() = user_id or email = (select email from public.profiles where id = auth.uid()));

drop policy if exists "update own tax_return_information" on public.tax_return_information;
create policy "update own tax_return_information" on public.tax_return_information for update
  using (auth.uid() = user_id or email = (select email from public.profiles where id = auth.uid()));

-- ── Staff manage every folder table ──────────────────────────
-- Matches FOLDER_TABLES in src/db/documents.ts.
do $$
declare
  t text;
  folder_tables text[] := array[
    'tax_contracts', 'tax_invoices', 'tax_client_uploads', 'tax_additional_docs',
    'tax_return_information', 'tax_prior_returns', 'tax_prior_transcripts',
    'tax_identification', 'tax_irs_notices', 'tax_ip_pins', 'unsorted_uploads',
    'bk_contracts', 'bk_invoices', 'bk_bank_accounts', 'bk_final_pnl',
    'bk_mr_required_info', 'bk_mr_client_review', 'bk_mr_final_statements',
    'cfo_contracts', 'cfo_invoices', 'cfo_additional_docs',
    'cfo_mr_required_info', 'cfo_mr_client_review', 'cfo_mr_final_statements'
  ];
begin
  foreach t in array folder_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'staff manage ' || t, t);
      execute format($p$
        create policy %I on public.%I for all
        using (public.is_staff_or_admin()) with check (public.is_staff_or_admin())
      $p$, 'staff manage ' || t, t);
    end if;
  end loop;
end $$;

-- What Tax Returns allows now, every policy on it whoever made it.
select policyname, cmd, permissive, roles
from pg_policies
where schemaname = 'public' and tablename = 'tax_return_information'
order by cmd, policyname;
