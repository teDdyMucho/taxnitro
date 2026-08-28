-- ============================================================
-- DELETE A DOCUMENT
--
-- Belly Jane: "I'm unable to delete or move the file." The move is sorted; this
-- is the other half.
--
-- Deleting went straight at the folder table and so ran under row-level
-- security. A folder whose delete policy never landed refuses silently: the
-- statement matches nothing, returns no error, and the app is left reporting a
-- delete that did not happen. Moving works for her and deleting does not, which
-- is the shape of exactly that.
--
-- So this does what move_document does — checks who is asking, in one place,
-- rather than depending on eighteen tables each having been given the right
-- policy.
--
-- It also clears up after the file, which the two delete paths did differently:
--
--   file_conversations        the replies, which have nothing to hang on
--   document_requirements     the slot it filled, which reopens
--   custom_document_requests  the request it answered, back to pending
--
-- The client path cleared the requirement and the admin path did not, so the
-- same delete left different traces depending on who did it. Now it does not.
--
-- The stored file is left in place. Nothing points at it, and removing bytes on
-- the way past is not something to do inside a transaction that is really about
-- a row.
--
-- SAFE TO RE-RUN. Requires move_document.sql for is_folder_table().
-- ============================================================

/**
 * Delete one document, and the records that referred to it.
 *
 * Raises on refusal rather than returning quietly, because a delete that says
 * nothing and does nothing is the thing being fixed.
 */
create or replace function public.delete_document(
  p_id    uuid,
  p_table text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner    uuid;
  v_email    text;
  v_me       uuid := auth.uid();
  v_me_email text;
  v_gone     int;
begin
  if not public.is_folder_table(p_table) then
    raise exception 'Not a folder: %', p_table;
  end if;

  execute format('select user_id, email from public.%I where id = $1', p_table)
    into v_owner, v_email using p_id;

  if not found then
    raise exception 'That file is no longer there';
  end if;

  -- SECURITY DEFINER runs this as the owner, so this check is the only thing
  -- between a caller and someone else's document. Written so that a missing
  -- value never grants access.
  select email into v_me_email from public.profiles where id = v_me;

  if not public.is_staff_or_admin()
     and not (v_owner is not null and v_me is not null and v_owner = v_me)
     and not (v_email is not null and v_me_email is not null
              and lower(v_email) = lower(v_me_email))
  then
    raise exception 'Not allowed to delete this document';
  end if;

  delete from public.file_conversations
   where file_id = p_id and folder_table = p_table;

  delete from public.document_requirements
   where document_id = p_id;

  update public.custom_document_requests
     set status = 'pending', document_id = null, document_table = null
   where document_id = p_id;

  execute format('delete from public.%I where id = $1', p_table) using p_id;
  get diagnostics v_gone = row_count;
  if v_gone = 0 then
    raise exception 'The file could not be deleted';
  end if;
end;
$$;

grant execute on function public.delete_document(uuid, text) to authenticated;
