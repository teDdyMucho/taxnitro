-- ============================================================
-- MOVE A DOCUMENT TO ANOTHER FOLDER
--
-- Belly Jane: "I accidentally saved the client's bank statement under Bank
-- Accounts, but it was supposed to be uploaded under Monthly Reporting –
-- Required Info. Unfortunately, I'm unable to delete or move the file."
--
-- And on the feedback list, 25 Aug: "Please add a 'Move' option. For example, if
-- I accidentally upload a document to the wrong folder, I would like to be able
-- to move it to the correct folder."
--
-- Every folder is its own table, so moving a file between folders means moving
-- the ROW between tables. That is five statements, not one, because three other
-- tables record which folder a document is in alongside its id:
--
--   file_conversations        file_id + folder_table     — the replies on a file
--   document_requirements     document_id + document_table
--   custom_document_requests  document_id + document_table
--
-- Done from the app that is five round trips, and a failure halfway leaves the
-- file in two folders at once, or in one folder with its conversation pointing at
-- the other. A function keeps it to one transaction: it all lands or none of it
-- does.
--
-- The row keeps its id. That is what leaves those three links intact — only the
-- folder name they store has to be corrected.
--
-- The stored file itself is not touched. Its path in storage still names the old
-- folder, which is untidy and invisible; re-uploading the bytes to rename them
-- would risk the file to fix something nobody sees.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Which tables are folders ─────────────────────────────────
-- The function takes table names, so it decides for itself what a folder is.
-- Without this, anyone who can call it could name any table in the database.
-- Matches FOLDER_TABLES in src/db/documents.ts.
create or replace function public.is_folder_table(t text)
returns boolean language sql immutable as $$
  select t = any (array[
    'tax_contracts', 'tax_invoices', 'tax_client_uploads',
    'tax_additional_docs', 'tax_return_information',
    'bk_contracts', 'bk_invoices', 'bk_bank_accounts', 'bk_final_pnl',
    'bk_mr_required_info', 'bk_mr_client_review', 'bk_mr_final_statements',
    'cfo_contracts', 'cfo_invoices', 'cfo_additional_docs',
    'cfo_mr_required_info', 'cfo_mr_client_review', 'cfo_mr_final_statements'
  ]);
$$;

/**
 * Move one document from one folder to another.
 *
 * Returns nothing on success and raises on failure, so a caller that sees no
 * error knows the move happened — the whole point of doing it in one place.
 */
create or replace function public.move_document(
  p_id   uuid,
  p_from text,
  p_to   text
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
  v_moved    int;
begin
  if not public.is_folder_table(p_from) then
    raise exception 'Not a folder: %', p_from;
  end if;
  if not public.is_folder_table(p_to) then
    raise exception 'Not a folder: %', p_to;
  end if;
  if p_from = p_to then
    return;                       -- already there; nothing to do and no error
  end if;

  -- Who the file belongs to, and whether it is there at all. SECURITY DEFINER
  -- runs this as the owner, so the permission check below is the only thing
  -- standing between a caller and someone else's document — it is not optional.
  execute format('select user_id, email from public.%I where id = $1', p_from)
    into v_owner, v_email using p_id;

  if not found then
    raise exception 'No such document in %', p_from;
  end if;

  -- Staff and admin may move anything. A client may move their own file, which
  -- is the same rule the delete policies already apply.
  --
  -- Written so that a missing value never grants access. Comparing with coalesce
  -- to '' would let a document with no email match a caller with no email, which
  -- is two unknowns being read as a match.
  select email into v_me_email from public.profiles where id = v_me;

  if not public.is_staff_or_admin()
     and not (v_owner is not null and v_me is not null and v_owner = v_me)
     and not (v_email is not null and v_me_email is not null
              and lower(v_email) = lower(v_me_email))
  then
    raise exception 'Not allowed to move this document';
  end if;

  -- Copied column by column rather than with a wildcard, so a column added to one
  -- folder table and not another cannot make this fail at an awkward moment.
  --
  -- subfolder_id is deliberately dropped: a subfolder belongs to one folder, so
  -- carrying the id across would file the document under a subfolder of the
  -- folder it just left. It arrives at the new folder's root.
  execute format($f$
    insert into public.%I (
      id, user_id, name, file_name, document_url, email,
      status, approval_status, approval_note, approved_by, approved_at,
      uploaded_by_role, uploaded_by, period, created_at, updated_at
    )
    select
      id, user_id, name, file_name, document_url, email,
      status, approval_status, approval_note, approved_by, approved_at,
      uploaded_by_role, uploaded_by, period, created_at, now()
    from public.%I where id = $1
  $f$, p_to, p_from) using p_id;

  execute format('delete from public.%I where id = $1', p_from) using p_id;
  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    -- The copy is already in; leaving the original would show the file twice.
    raise exception 'Could not remove the document from %', p_from;
  end if;

  -- The three places that record which folder a document sits in. Missed, the
  -- file arrives with its replies gone and any requirement it satisfied looking
  -- unfulfilled.
  update public.file_conversations
     set folder_table = p_to
   where file_id = p_id and folder_table = p_from;

  update public.document_requirements
     set document_table = p_to
   where document_id = p_id and document_table = p_from;

  update public.custom_document_requests
     set document_table = p_to
   where document_id = p_id and document_table = p_from;
end;
$$;

grant execute on function public.move_document(uuid, text, text) to authenticated;
grant execute on function public.is_folder_table(text) to authenticated;
