-- ============================================================
-- LET TEXT BECOME A document_status WHEN A FILE MOVES
--
-- Belly Jane moving the Desert Financial x9279 folder into Statement got:
--   column "status" is of type document_status but expression is of type text
--
-- Eight folder tables keep status as the enum document_status (bk_final_pnl —
-- Additional BK Docs — bk_contracts, bk_invoices, bk_for_client_review,
-- tax_client_uploads, tax_contracts, tax_invoices, tax_return_information);
-- every other folder keeps it as text. move_document and move_subfolder copy a
-- row from one folder table to another, and Postgres turns an enum into text by
-- itself but not text back into an enum. So any move into one of those eight
-- from a text folder failed, whole, before anything changed.
--
-- This allows that one conversion on assignment. The value is still checked
-- against the enum — a status the enum does not have is still refused — so the
-- move functions work unchanged, and nothing else about them is touched (the
-- live ones differ from this repository's copies, so they are not redefined).
--
-- SAFE TO RE-RUN.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_cast c
    join pg_type s on s.oid = c.castsource
    join pg_type t on t.oid = c.casttarget
    join pg_namespace n on n.oid = t.typnamespace
    where s.typname = 'text' and t.typname = 'document_status' and n.nspname = 'public'
  ) then
    create cast (text as public.document_status) with inout as assignment;
  end if;
end $$;
