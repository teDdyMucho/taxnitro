-- ============================================================
-- STANDARD SUBFOLDERS FOR EVERY BK CLIENT
--
-- Camaree: "could you create standard subfolders under Monthly Reporting
-- (client view) such as Profit & Loss, Balance Sheet, and Query Sheet? ... so we
-- won't have to create them individually for every client."
--
-- Subfolders already existed, but every one of them had to be made by hand, per
-- client, per folder. These three are the deliverables FTG issues every month —
-- the same names the upload already puts in front of the file — so they should
-- simply be there.
--
-- Done in the database rather than the app because a client can READ their own
-- subfolders but cannot create one: if this waited for a screen to run it, a
-- client who opened their folder before any staff member did would find it
-- empty.
--
-- SAFE TO RE-RUN. Nothing is duplicated, nothing already there is touched, and
-- a folder someone has renamed or deleted on purpose is not forced back.
-- ============================================================

-- ── The three, and where they live ───────────────────────────
-- Names match STAFF_UPLOAD_ITEMS in src/db/requirements.ts, so a file uploaded
-- as "Query Sheet — june.pdf" has an obvious home.
create or replace function public.standard_subfolder_names()
returns text[] language sql immutable as $$
  select array['Query Sheet', 'P&L Statement', 'Balance Sheet'];
$$;

/**
 * Give one client the standard set, skipping any they already have.
 *
 * Matched case-insensitively on name: a client whose staff already made a
 * "query sheet" by hand keeps theirs rather than ending up with two.
 */
create or replace function public.ensure_standard_subfolders(client_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  folder_name text;
begin
  if client_email is null or client_email = '' then
    return;
  end if;

  foreach folder_name in array public.standard_subfolder_names() loop
    if not exists (
      select 1 from public.custom_subfolders
      where parent_table = 'bk_mr_client_review'
        and owner_email = client_email
        and parent_subfolder_id is null
        and lower(name) = lower(folder_name)
    ) then
      insert into public.custom_subfolders (parent_table, owner_email, name, created_by)
      values ('bk_mr_client_review', client_email, folder_name, 'system');
    end if;
  end loop;
end;
$$;

-- ── Every BK client who already exists ───────────────────────
do $$
declare
  c record;
begin
  for c in
    select email from public.profiles
    where role = 'client'
      and email is not null
      and 'BK' = any(coalesce(services, array['BK']::text[]))
  loop
    perform public.ensure_standard_subfolders(c.email);
  end loop;
end $$;

-- ── And every BK client from now on ──────────────────────────
-- Fires when a client is created, and when an existing one is given BK later.
-- Only when BK is actually present, so a TAX-only client gets nothing.
create or replace function public.handle_client_standard_subfolders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'client'
     and new.email is not null
     and 'BK' = any(coalesce(new.services, array['BK']::text[]))
  then
    perform public.ensure_standard_subfolders(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_client_standard_subfolders on public.profiles;
create trigger on_client_standard_subfolders
  after insert or update of services, role, email on public.profiles
  for each row execute procedure public.handle_client_standard_subfolders();
