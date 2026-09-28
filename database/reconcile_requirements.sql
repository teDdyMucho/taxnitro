-- ============================================================
-- RECONCILE DOCUMENT REQUIREMENTS
--
-- Removes requirement slots whose fulfilling file no longer exists in ANY
-- folder table — rows left behind by files deleted before delete_document()
-- cleaned up after itself.
--
-- READ THIS BEFORE RUNNING AN OLDER COPY OF THIS FILE. The first version
-- checked three tables: tax_required_documents, bk_required_documents and
-- tax_client_uploads. Requirements are not tagged from any of them. Client
-- uploads open a slot from the collector folders (bk_mr_required_info,
-- cfo_mr_required_info — see FOLDER_REQUIREMENT_ITEMS in src/db/requirements.ts)
-- and staff can tag from any folder at all. So every fulfilled slot in the
-- database matched none of the three, and one run would have deleted the whole
-- monthly progress history for every client, in a file whose header said it was
-- safe to re-run.
--
-- It now asks every folder table there is, and skips any that a given database
-- does not have. Adding a folder table needs no change here.
--
-- SAFE TO RE-RUN.
-- ============================================================

do $$
declare
  t            text;
  folder_tables text[] := array[
    'tax_contracts', 'tax_invoices', 'tax_client_uploads',
    'tax_additional_docs', 'tax_return_information',
    'tax_prior_returns', 'tax_prior_transcripts',
    'tax_required_documents',
    'bk_contracts', 'bk_invoices', 'bk_bank_accounts', 'bk_final_pnl',
    'bk_mr_required_info', 'bk_mr_client_review', 'bk_mr_final_statements',
    'bk_required_documents',
    'cfo_contracts', 'cfo_invoices', 'cfo_additional_docs',
    'cfo_mr_required_info', 'cfo_mr_client_review', 'cfo_mr_final_statements'
  ];
  present      text[] := '{}';
  parts        text[] := '{}';
  removed      int;
begin
  foreach t in array folder_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      present := present || t;
      parts   := parts || format('select 1 from public.%I x where x.id = dr.document_id', t);
    end if;
  end loop;

  -- No folder tables means this database is not the one this file is for.
  -- Deleting every slot because nothing was found is exactly the accident
  -- above, so it stops instead.
  if array_length(present, 1) is null then
    raise notice 'No folder tables found — nothing reconciled.';
    return;
  end if;

  execute
    'delete from public.document_requirements dr
      where dr.document_id is not null
        and not exists (' || array_to_string(parts, ' union all ') || ')';
  get diagnostics removed = row_count;
  raise notice 'Checked % folder tables; removed % orphaned requirement slot(s).',
    array_length(present, 1), removed;
end $$;
