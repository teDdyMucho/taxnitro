-- ============================================================
-- REMOVE BOOKKEEPING'S EMPTY FOLDERS FROM ACCOUNTS WITHOUT BOOKKEEPING
--
-- Until cfo_standard_subfolders.sql, a new login's profile row came before its
-- services, and standard_subfolders.sql read no services as BK. So clients
-- without Bookkeeping, and staff, admin and Team One logins, were given BK's
-- Query Sheet, P&L Statement and Balance Sheet under For Client Review. On a
-- CFO client's profile they show beside the real folders, and Upload never
-- offers them (Belly, 2026-10-28, on Jennifer Armstrong's).
--
-- Removes one of those three only when ALL of these hold:
--   - it sits at the top of bk_mr_client_review (For Client Review),
--   - its owner is not a client with BK (no services still counts as BK),
--   - no file is filed in it, and no folder is inside it.
-- A folder with anything in it stays. Bank-account folders are not touched.
-- Lists what it removed. SAFE TO RE-RUN: a second run removes nothing.
-- ============================================================

delete from public.custom_subfolders s
where s.parent_table = 'bk_mr_client_review'
  and s.parent_subfolder_id is null
  and lower(trim(s.name)) in ('query sheet', 'p&l statement', 'balance sheet')
  and s.owner_email is not null
  and not exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(s.owner_email)
      and p.role = 'client'
      and 'BK' = any(coalesce(p.services, array['BK']::text[]))
  )
  and not exists (select 1 from public.bk_mr_client_review d where d.subfolder_id = s.id)
  and not exists (select 1 from public.custom_subfolders c where c.parent_subfolder_id = s.id)
returning s.owner_email, s.name;
