-- ============================================================
-- THE MONTH A DOCUMENT COVERS
--
-- Camaree: "being able to tag documents with the month and year would be great
-- to allow us to easily sort information by date regardless of what folders
-- they may be in."
--
-- Until now a document's date was created_at — when it was UPLOADED. A January
-- statement handed over in March sorted under March, which is exactly the
-- problem. `period` is the month the document is ABOUT, which is the thing
-- anyone sorting by date actually means.
--
-- 'YYYY-MM', matching monthOf() in src/db/requirements.ts and the month column
-- on document_requirements, so the two line up without conversion.
--
-- Existing rows are backfilled from created_at. That is a guess, but it is the
-- same guess the app was already making by showing created_at, so nothing gets
-- worse and most of it will be right.
--
-- SAFE TO RE-RUN.
-- ============================================================

do $$
declare
  t text;
  folder_tables text[] := array[
    'tax_contracts',
    'tax_invoices',
    'tax_client_uploads',
    'tax_additional_docs',
    'tax_return_information',
    'bk_contracts',
    'bk_invoices',
    'bk_bank_accounts',
    'bk_final_pnl',
    'bk_mr_required_info',
    'bk_mr_client_review',
    'bk_mr_final_statements',
    'cfo_contracts',
    'cfo_invoices',
    'cfo_additional_docs',
    'cfo_mr_required_info',
    'cfo_mr_client_review',
    'cfo_mr_final_statements'
  ];
begin
  foreach t in array folder_tables loop
    -- Only touch tables that actually exist in this database.
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'alter table public.%I add column if not exists period text', t
      );

      -- Sorting by month is the whole point, so it is worth an index.
      execute format(
        'create index if not exists %I on public.%I (period)',
        t || '_period_idx', t
      );

      -- Backfill only what has no period yet, so re-running leaves alone
      -- anything since corrected by hand.
      execute format(
        'update public.%I set period = to_char(created_at, ''YYYY-MM'')
           where period is null', t
      );

      -- New rows default to the month they arrive in, which is right far more
      -- often than not, and the upload lets it be changed.
      execute format(
        'alter table public.%I alter column period set default to_char(now(), ''YYYY-MM'')', t
      );
    end if;
  end loop;
end $$;
