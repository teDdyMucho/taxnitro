-- ============================================================
-- STANDARD SUBFOLDERS FOR CFO CLIENTS TOO
--
-- Belly, 2026-10-28: a CFO client's Query Sheet had nowhere to go. Upload
-- offered the client's CFO folders and none had a Query Sheet folder, while
-- their profile showed one: Bookkeeping's. standard_subfolders.sql gives every
-- BK client Query Sheet, P&L Statement and Balance Sheet under For Client
-- Review, and gave CFO clients nothing, though both For Client Review folders
-- take the same three (STAFF_UPLOAD_ITEMS in src/db/requirements.ts). Belly:
-- "pwede same function ang CFO and Bookkeeping".
--
-- New clients also stop getting Bookkeeping's three by accident. A login's
-- profile row is made before its services are filled in, and the trigger read
-- no services as BK, so a CFO-only client got BK's three a moment before their
-- real services arrived. Nine CFO-only clients carry them today; this file
-- leaves those where they are.
--
-- Needs standard_subfolders.sql (standard_subfolder_names). SAFE TO RE-RUN:
-- adds only what is missing, and removes nothing.
-- ============================================================

-- ── The three, under either For Client Review ────────────────
-- Matched case-insensitively, against the client's own folders and the older
-- shared ones (owner_email null), as the BK version is.
create or replace function public.ensure_standard_subfolders_in(client_email text, parent text)
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
      where parent_table = parent
        and (owner_email = client_email or owner_email is null)
        and parent_subfolder_id is null
        and lower(name) = lower(folder_name)
    ) then
      insert into public.custom_subfolders (parent_table, owner_email, name, created_by)
      values (parent, client_email, folder_name, 'system');
    end if;
  end loop;
end;
$$;

-- The one-argument form stays, and still means Bookkeeping's.
create or replace function public.ensure_standard_subfolders(client_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_standard_subfolders_in(client_email, 'bk_mr_client_review');
end;
$$;

-- ── Every CFO client who already exists ──────────────────────
do $$
declare
  c record;
begin
  for c in
    select email from public.profiles
    where role = 'client'
      and email is not null
      and 'CFO' = any(coalesce(services, '{}'::text[]))
  loop
    perform public.ensure_standard_subfolders_in(c.email, 'cfo_mr_client_review');
  end loop;
end $$;

-- ── And from now on, by the services the client actually has ─
create or replace function public.handle_client_standard_subfolders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.role, '') <> 'client' or new.email is null then
    return new;
  end if;
  -- A new login's row arrives with no services yet; they follow straight
  -- after as an update, and that is when the right folders are made.
  if tg_op = 'INSERT' and new.services is null then
    return new;
  end if;
  if 'BK' = any(coalesce(new.services, array['BK']::text[])) then
    perform public.ensure_standard_subfolders_in(new.email, 'bk_mr_client_review');
  end if;
  if 'CFO' = any(coalesce(new.services, '{}'::text[])) then
    perform public.ensure_standard_subfolders_in(new.email, 'cfo_mr_client_review');
  end if;
  return new;
end;
$$;

drop trigger if exists on_client_standard_subfolders on public.profiles;
create trigger on_client_standard_subfolders
  after insert or update of services, role, email on public.profiles
  for each row execute procedure public.handle_client_standard_subfolders();
