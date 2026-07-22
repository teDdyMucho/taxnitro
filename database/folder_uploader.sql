-- ============================================================
-- FOLDER TABLES: track who uploaded each file
-- Lets the client see Approve/Reject only on files STAFF placed in
-- their folders (deliverables), vs. their own uploads.
--
--   uploaded_by_role  'client' | 'staff' | 'admin'  (default 'client')
--   uploaded_by       profile id / email of the uploader (freeform text)
--
-- Applied to every folder table. Safe to re-run.
-- ============================================================

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
    -- Only touch tables that actually exist in this database.
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'alter table public.%I
           add column if not exists uploaded_by_role text not null default ''client''
             check (uploaded_by_role in (''client'',''staff'',''admin'')),
           add column if not exists uploaded_by text',
        t
      );
    end if;
  end loop;
end $$;
