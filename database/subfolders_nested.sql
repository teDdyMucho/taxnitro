-- ============================================================
-- SUBFOLDERS INSIDE SUBFOLDERS
--
-- A subfolder could only sit directly in a folder table, one level deep. That
-- is enough for "2024 Returns" but not for organising by bank, then year, then
-- month — each of which wants a level of its own.
--
-- This adds a parent. A subfolder with no parent sits in the folder table as
-- before; one with a parent sits inside that subfolder. Every existing row has
-- no parent, so nothing moves.
--
-- Deleting a subfolder now takes its children with it (cascade). The documents
-- inside are NOT deleted — their subfolder_id is reset by the ON DELETE SET
-- NULL that was already on it, so they return to the folder root rather than
-- disappearing with the folder that held them.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- ── The parent ───────────────────────────────────────────────
alter table public.custom_subfolders
  add column if not exists parent_subfolder_id uuid
    references public.custom_subfolders(id) on delete cascade;

create index if not exists custom_subfolders_parent_sub_idx
  on public.custom_subfolders (parent_subfolder_id);

-- ── Uniqueness is per set of siblings ────────────────────────
-- A name has to be unique among the folders sitting alongside it, not across
-- the whole folder table: "2024" under Chase and "2024" under Amex are two
-- different folders and both are reasonable.
--
-- coalesce on both nullable columns, because in a plain unique index NULLs are
-- distinct — every top-level folder would count as unique and duplicates would
-- walk straight in.
drop index if exists custom_subfolders_parent_owner_name_idx;
create unique index if not exists custom_subfolders_sibling_name_idx
  on public.custom_subfolders (
    parent_table,
    coalesce(owner_email, ''),
    coalesce(parent_subfolder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

-- ── A folder cannot be inside itself ─────────────────────────
-- Walk up from the proposed parent; if we meet this row, the move would make a
-- ring that nothing could ever list or delete.
create or replace function public.check_subfolder_cycle()
returns trigger language plpgsql as $$
declare
  hop uuid := new.parent_subfolder_id;
  guard int := 0;
begin
  if new.parent_subfolder_id is null then
    return new;
  end if;

  if new.parent_subfolder_id = new.id then
    raise exception 'A folder cannot be inside itself';
  end if;

  -- The guard is a backstop: a ring that predates this trigger would otherwise
  -- spin here forever.
  while hop is not null and guard < 64 loop
    if hop = new.id then
      raise exception 'A folder cannot be moved inside one of its own subfolders';
    end if;
    select parent_subfolder_id into hop from public.custom_subfolders where id = hop;
    guard := guard + 1;
  end loop;

  -- Children live in the same folder table and belong to the same client as
  -- their parent; otherwise a folder could be filed into another client's tree.
  if exists (
    select 1 from public.custom_subfolders p
    where p.id = new.parent_subfolder_id
      and (p.parent_table <> new.parent_table
           or coalesce(p.owner_email, '') <> coalesce(new.owner_email, ''))
  ) then
    raise exception 'A subfolder must sit in the same folder and belong to the same client as its parent';
  end if;

  return new;
end;
$$;

drop trigger if exists check_subfolder_cycle on public.custom_subfolders;
create trigger check_subfolder_cycle
  before insert or update on public.custom_subfolders
  for each row execute procedure public.check_subfolder_cycle();
