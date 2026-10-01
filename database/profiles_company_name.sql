-- ============================================================
-- COMPANY NAME  (the business a client's account is for)
--
-- Paul's spec for the clients screen: a TAX client is identified by their
-- personal name; BK, CFO and YER clients by their company name, with the
-- personal name kept for search. Sorting on that screen goes by company name
-- where there is one.
--
-- Until now the only name on a profile was full_name — a person's name — so
-- a bookkeeping client's card showed whoever signed up rather than the
-- business the books belong to.
--
-- Nullable on purpose: a TAX-only client has no company to name.
--
-- SAFE TO RE-RUN.
-- ============================================================

alter table public.profiles
  add column if not exists company_name text;

-- The clients screen sorts by it, so give the sort an index to lean on.
create index if not exists profiles_company_name_idx
  on public.profiles (company_name);
