-- ============================================================
-- P&L AND BALANCE SHEET FOLDERS FOR EVERY TAX CLIENT
--
-- Belly Jane: "under tax client mag upload kasi ako dapat ng P&L & Balance sheet
-- pero pag click ko ng upload wala dun yung folder na balance sheet and p&l"
-- (Malaika Moran, a TAX client).
--
-- A business's tax return is prepared from its P&L and Balance Sheet, but the
-- TAX folders had nowhere for them: the "P&L Statement" and "Balance Sheet"
-- folders every BK client has (standard_subfolders.sql) live under BK's
-- Monthly Reporting, which a TAX client does not see, and the upload only
-- offers the folders of the services a client takes.
--
-- So every TAX client now has the same two inside Other Tax Docs, made the way
-- the BK ones are: once per client, skipping one already there by that name,
-- and for a client given TAX later too.
--
-- SAFE TO RE-RUN. Nothing is duplicated, nothing already there is touched, and
-- a folder someone has renamed or deleted on purpose is not forced back.
-- ============================================================

create or replace function public.tax_statement_subfolder_names()
returns text[] language sql immutable as $$
  select array['P&L Statement', 'Balance Sheet'];
$$;

/** Give one client the two, skipping any they already have (by name, any case). */
create or replace function public.ensure_tax_statement_subfolders(client_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  folder_name text;
begin
  if client_email is null or client_email = '' then
    return;
  end if;

  foreach folder_name in array public.tax_statement_subfolder_names() loop
    -- Against the client's own folders and the older shared ones (owner_email
    -- null), which a client sees too, so neither ends up beside a twin.
    if not exists (
      select 1 from public.custom_subfolders
      where parent_table = 'tax_additional_docs'
        and (owner_email = client_email or owner_email is null)
        and parent_subfolder_id is null
        and lower(name) = lower(folder_name)
    ) then
      insert into public.custom_subfolders (parent_table, owner_email, name, created_by)
      values ('tax_additional_docs', client_email, folder_name, 'system');
    end if;
  end loop;
end;
$$;

-- ── Every TAX client who already exists ──────────────────────
do $$
declare
  c record;
begin
  for c in
    select email from public.profiles
    where role = 'client'
      and email is not null
      and 'TAX' = any(coalesce(services, '{}'::text[]))
  loop
    perform public.ensure_tax_statement_subfolders(c.email);
  end loop;
end $$;

-- ── And every TAX client from now on ─────────────────────────
-- When a client is made, and when one is given TAX later. A new client's
-- services arrive just after the profile row does, so this fires on that
-- update rather than reading services that are not there yet.
create or replace function public.handle_client_tax_statement_subfolders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'client'
     and new.email is not null
     and 'TAX' = any(coalesce(new.services, '{}'::text[]))
  then
    perform public.ensure_tax_statement_subfolders(new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_client_tax_statement_subfolders on public.profiles;
create trigger on_client_tax_statement_subfolders
  after insert or update of services, role, email on public.profiles
  for each row execute procedure public.handle_client_tax_statement_subfolders();

revoke all on function public.ensure_tax_statement_subfolders(text) from public, anon, authenticated;
revoke all on function public.handle_client_tax_statement_subfolders() from public, anon, authenticated;
