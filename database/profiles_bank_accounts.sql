-- ============================================================
-- PROFILES: per-client bank accounts
-- A client can be asked for statements from SEVERAL bank accounts.
-- Staff/admin configure the list here; each account then becomes its OWN
-- required item (its own upload slot, radio and approve/reject) instead of
-- the single generic "Bank Statements (all accounts)" line.
--
-- Shape (see src/db/requirements.ts → BankAccount):
--   [ { "id": "ba_1a2b3c4d", "bank": "BDO", "last4": "4821" }, ... ]
--
--   id     → stable, generated once when the row is added. The requirement_key
--            (bank_statements__<id>) depends on it, so it must NEVER be reused
--            or renumbered — that would re-point an existing month's slot.
--   bank   → bank name, required
--   last4  → last 4 digits of the account number, required (4 digits)
--
-- An EMPTY array keeps the old behaviour: one generic "Bank Statements
-- (all accounts)" item. Existing clients are therefore unaffected.
--
-- No new RLS needed — this rides on the existing profiles policies:
--   · "staff and admins update profiles"  → staff/admin may set it
--   · "staff and admins read profiles"    → client reads their own row
-- (see profiles_services.sql)
--
-- Safe to re-run.
-- ============================================================

alter table public.profiles
  add column if not exists bank_accounts jsonb not null default '[]'::jsonb;

-- Guard: must be a JSON array. Element shape is enforced in the app
-- (normalizeBankAccounts) so adding a field later needs no migration.
alter table public.profiles drop constraint if exists profiles_bank_accounts_is_array;
alter table public.profiles
  add constraint profiles_bank_accounts_is_array
  check (jsonb_typeof(bank_accounts) = 'array');

-- Backfill any pre-existing NULLs (column may predate the NOT NULL default).
update public.profiles set bank_accounts = '[]'::jsonb where bank_accounts is null;
