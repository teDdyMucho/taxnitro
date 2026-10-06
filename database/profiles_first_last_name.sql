-- ============================================================
-- FIRST AND LAST NAME
--
-- Camaree, app notes 6a: "sorting should go by Last Name (if entered)" —
-- "last name is not currently a separate field".
--
-- full_name stays, and stays the one every screen shows. Staff now enter the
-- name as First and Last; the app writes all three, so full_name is always
-- "First Last". The client list sorts by last_name where it is entered and
-- falls back to what it sorted by before where it is not.
--
-- Nothing is split automatically. "Mary Ann Smith" has no reliable last word,
-- so existing names are left as they are until someone opens the client and
-- confirms the split the form offers.
--
-- A client may edit their own name, as they can full_name, so these are not
-- added to the columns pinned against client edits.
--
-- SAFE TO RE-RUN.
-- ============================================================

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

-- Sorting by last name is what this is for.
create index if not exists profiles_last_name_idx on public.profiles (lower(last_name));
