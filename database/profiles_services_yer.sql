-- ============================================================
-- YER BECOMES A SERVICE
--
-- Paul's spec for the master dashboard names four categories a client can be
-- assigned to: TAX, YER, BK, CFO. Until now the database refused the fourth —
-- the services constraint listed three.
--
-- This only teaches the database to accept 'YER' on a profile. It does NOT
-- create YER folder tables or required items; a YER client's folder tab is
-- empty until those are decided and built. Shipping the assignment first is
-- deliberate: the dashboard's progress cards count by assignment, and that
-- works the moment a client can be assigned.
--
-- SAFE TO RE-RUN.
-- ============================================================

alter table public.profiles drop constraint if exists profiles_services_valid;
alter table public.profiles
  add constraint profiles_services_valid
  check (
    array_length(services, 1) >= 1
    and services <@ array['BK','TAX','CFO','YER']::text[]
  );
