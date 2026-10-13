-- ============================================================
-- PUT A SUBFOLDER INSIDE ANOTHER ONE
--
-- Belly Jane: "hindi pa pwede ma drag ang isang folder or ma move ang isang
-- folder para maging sub folder na siya" — moving the Desert Financial x9279
-- folder into Statement, so it sits inside it.
--
-- move_subfolder.sql moves a subfolder, and everything in it, to the top of
-- another folder. This puts it inside another subfolder instead — or, given no
-- target, takes it back out to the top of the folder it is in.
--
-- A subfolder's children live in the same folder table as it does (the cycle
-- trigger in subfolders_nested.sql insists), so if the target is in another
-- table the whole subfolder is first moved there with move_subfolder, files and
-- all, and then hung under the target. One transaction: it lands whole or not
-- at all.
--
-- Run after move_subfolder.sql. SAFE TO RE-RUN.
-- ============================================================

create or replace function public.nest_subfolder(p_id uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table      text;
  v_owner      text;
  v_name       text;
  v_parent     uuid;
  v_into_table text;
  v_into_owner text;
  v_me_email   text;
begin
  select parent_table, owner_email, name, parent_subfolder_id
    into v_table, v_owner, v_name, v_parent
    from public.custom_subfolders where id = p_id;
  if not found then
    raise exception 'No such subfolder';
  end if;

  -- SECURITY DEFINER runs this as the owner, so this check is the only thing
  -- between a caller and someone else's folders. The same rule as move_subfolder.
  select email into v_me_email from public.profiles where id = auth.uid();
  if not public.is_staff_or_admin()
     and not (v_owner is not null and v_me_email is not null
              and lower(v_owner) = lower(v_me_email))
  then
    raise exception 'Not allowed to move this subfolder';
  end if;

  -- Back out to the top of its own folder.
  if p_into is null then
    if v_parent is null then
      return;                       -- already there
    end if;
    if exists (select 1 from public.custom_subfolders
                where parent_table = v_table and parent_subfolder_id is null
                  and coalesce(owner_email, '') = coalesce(v_owner, '')
                  and lower(name) = lower(v_name) and id <> p_id) then
      raise exception 'There is already a folder called % at the top', v_name;
    end if;
    update public.custom_subfolders set parent_subfolder_id = null where id = p_id;
    return;
  end if;

  if p_into = p_id then
    raise exception 'A folder cannot be inside itself';
  end if;

  select parent_table, owner_email into v_into_table, v_into_owner
    from public.custom_subfolders where id = p_into;
  if not found then
    raise exception 'The folder to move into is gone';
  end if;

  -- One client's folder never goes into another's, nor into a shared one.
  if coalesce(v_owner, '') <> coalesce(v_into_owner, '') then
    raise exception 'Both folders must belong to the same client';
  end if;

  if exists (select 1 from public.custom_subfolders
              where parent_subfolder_id = p_into
                and lower(name) = lower(v_name) and id <> p_id) then
    raise exception 'That folder already has a subfolder called %', v_name;
  end if;

  -- Into a folder in another table: take it there first, everything in it with
  -- it. move_subfolder leaves it at the top of that table.
  if v_into_table <> v_table then
    perform public.move_subfolder(p_id, v_into_table);
  end if;

  -- The cycle trigger refuses a target inside the folder being moved.
  update public.custom_subfolders set parent_subfolder_id = p_into where id = p_id;
end;
$$;

grant execute on function public.nest_subfolder(uuid, uuid) to authenticated;
