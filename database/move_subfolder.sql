-- ============================================================
-- MOVE A SUBFOLDER, WITH EVERYTHING IN IT
--
-- Belly Jane: "d ba naka subfolder ako sa bank account gusto ko yung sub folder
-- na un ma move ko lahat para kasama na ang laman."
--
-- move_document.sql moves one file. This moves a subfolder and takes its
-- contents along: the files directly in it, the subfolders nested inside it, and
-- the files in those.
--
-- The files are rows in the folder's own table, so they move between tables the
-- same way a single document does — and the same three tables that record which
-- folder a document is in have to be corrected for every one of them.
--
-- One difference from moving a single file: subfolder_id is KEPT here. When a
-- lone document moves, the subfolder it was in stays behind, so its filing has
-- to be dropped. Here the subfolder is moving too, so every file stays exactly
-- where it was inside it.
--
-- The subfolder itself arrives at the destination's top level. Whatever it was
-- nested under is not coming with it, so it cannot stay nested under it.
--
-- SAFE TO RE-RUN.
-- ============================================================

/**
 * Move one subfolder, and everything under it, into another folder.
 *
 * Raises on failure rather than returning false, so a caller that sees no error
 * knows the whole thing landed.
 */
create or replace function public.move_subfolder(
  p_id uuid,
  p_to text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from     text;
  v_owner    text;
  v_name     text;
  v_me       uuid := auth.uid();
  v_me_email text;
  v_ids      uuid[];
  v_clash    text;
begin
  if not public.is_folder_table(p_to) then
    raise exception 'Not a folder: %', p_to;
  end if;

  select parent_table, owner_email, name
    into v_from, v_owner, v_name
    from public.custom_subfolders where id = p_id;

  if not found then
    raise exception 'No such subfolder';
  end if;
  if v_from = p_to then
    return;                       -- already there
  end if;
  if not public.is_folder_table(v_from) then
    raise exception 'Not a folder: %', v_from;
  end if;

  -- SECURITY DEFINER runs this as the owner, so this check is the only thing
  -- between a caller and someone else's documents.
  select email into v_me_email from public.profiles where id = v_me;

  if not public.is_staff_or_admin()
     and not (v_owner is not null and v_me_email is not null
              and lower(v_owner) = lower(v_me_email))
  then
    raise exception 'Not allowed to move this subfolder';
  end if;

  -- The subfolder and everything nested underneath it, however deep.
  with recursive tree as (
    select id from public.custom_subfolders where id = p_id
    union all
    select c.id
      from public.custom_subfolders c
      join tree t on c.parent_subfolder_id = t.id
  )
  select array_agg(id) into v_ids from tree;

  -- Subfolder names are unique per folder per owner, so a name already in use at
  -- the destination would fail the move partway. Caught first, and named, rather
  -- than surfacing as a constraint violation nobody can act on.
  select string_agg(s.name, ', ') into v_clash
    from public.custom_subfolders s
   where s.id = any(v_ids)
     and exists (
       select 1 from public.custom_subfolders d
        where d.parent_table = p_to
          and coalesce(d.owner_email, '') = coalesce(s.owner_email, '')
          and lower(d.name) = lower(s.name)
          and d.id <> s.id
     );
  if v_clash is not null then
    raise exception 'That folder already has a subfolder called %', v_clash;
  end if;

  -- The files, keeping which subfolder each one sits in.
  execute format($f$
    insert into public.%I (
      id, user_id, name, file_name, document_url, email,
      status, approval_status, approval_note, approved_by, approved_at,
      uploaded_by_role, uploaded_by, period, subfolder_id, created_at, updated_at
    )
    select
      id, user_id, name, file_name, document_url, email,
      status, approval_status, approval_note, approved_by, approved_at,
      uploaded_by_role, uploaded_by, period, subfolder_id, created_at, now()
    from public.%I where subfolder_id = any($1)
  $f$, p_to, v_from) using v_ids;

  -- What moved, so the three link tables can be corrected for exactly those rows.
  create temporary table if not exists moved_docs (id uuid) on commit drop;
  delete from moved_docs;

  execute format(
    'insert into moved_docs (id) select id from public.%I where subfolder_id = any($1)',
    v_from) using v_ids;

  execute format('delete from public.%I where subfolder_id = any($1)', v_from) using v_ids;

  update public.file_conversations
     set folder_table = p_to
   where folder_table = v_from and file_id in (select id from moved_docs);

  update public.document_requirements
     set document_table = p_to
   where document_table = v_from and document_id in (select id from moved_docs);

  update public.custom_document_requests
     set document_table = p_to
   where document_table = v_from and document_id in (select id from moved_docs);

  -- The subfolders themselves. The one being moved comes to rest at the
  -- destination's top level; the ones under it keep the shape they had.
  update public.custom_subfolders
     set parent_table = p_to
   where id = any(v_ids);

  update public.custom_subfolders
     set parent_subfolder_id = null
   where id = p_id;
end;
$$;

grant execute on function public.move_subfolder(uuid, text) to authenticated;
