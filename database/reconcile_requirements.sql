-- ============================================================
-- RECONCILE DOCUMENT REQUIREMENTS
-- Removes requirement slots whose fulfilling file no longer exists in ANY
-- folder table (e.g. rows left behind by files deleted before the on-delete
-- cleanup was in place). Safe to re-run anytime.
--
-- A slot is orphaned when its document_id is set but matches no row in any of
-- the folder tables that can fulfil a requirement.
-- ============================================================

delete from public.document_requirements dr
where dr.document_id is not null
  and not exists (
    select 1 from public.tax_required_documents t where t.id = dr.document_id
    union all
    select 1 from public.bk_required_documents  b where b.id = dr.document_id
    union all
    select 1 from public.tax_client_uploads     c where c.id = dr.document_id
  );

-- NOTE: the sub-selects list the folder tables that uploads can be tagged from.
-- If you later allow tagging from other folders, add them here so their files
-- aren't treated as orphaned.
