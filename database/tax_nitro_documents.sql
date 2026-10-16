-- ============================================================
-- TAX NITRO UPLOADS INTO THE CLIENT'S FOLDERS
--
-- Camaree: "did you ever finish the code to allow for completed contracts
-- submitted and documents uploaded via Tax Nitro to load into the client's
-- profile in the app?"
--
-- What clients upload through Tax Nitro (GHL) already reaches this database:
-- an n8n flow writes each file into public.documents (documents.sql) with its
-- GHL download link. Nothing showed them. That table lets only the client read
-- a row, so staff saw nothing, and the app puts a document in the folder of the
-- table it is in, which for these is no folder at all. n8n also stores the
-- client's name where the file's name belongs.
--
-- Now each one is filed the moment n8n writes it, named as the file is named
-- in GHL (read from the download link itself):
--
--   a contract (document_type 'Internal', named as a contract or agreement)
--       → the Contracts folder of its service, as FTG's document
--   anything else from the client (document_type 'External')
--       → their Unsorted Uploads, as their own upload, waiting for FTG like
--         any other; staff Move it from there
--   anything else from FTG
--       → their Unsorted Uploads, as FTG's document
--
-- A client upload never goes to Contracts on its name alone: "SBA Loan
-- Agreement.pdf" is the client's document, not FTG's contract.
--
-- The row in public.documents stays as the record of what came in, marked with
-- where it went (filed_table, filed_id), so nothing is filed twice — nor a file
-- n8n sends again, retrying or replaying a past run for what it missed. A file for
-- someone who has no client account yet waits there, and is filed when the
-- account is made.
--
-- Run once in the Supabase SQL editor. It files everything already there too,
-- and says how many. SAFE TO RE-RUN.
-- ============================================================


-- ── Reading a file's name from its link ──────────────────────
-- GHL sends the name in the download's Content-Disposition header. The http
-- extension fetches it from here; without it, files are still filed, under
-- "Tax Nitro upload" and the date, for someone to rename.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'http') then
    create extension if not exists http with schema extensions;
  end if;
end $$;

alter table public.documents add column if not exists filed_table text;
alter table public.documents add column if not exists filed_id    uuid;


-- 'inline; filename="July 2026 Navy Federal.pdf"' → 'July 2026 Navy Federal.pdf'.
-- The encoded form (filename*=UTF-8''...) is preferred when both are there.
create or replace function public.tax_nitro_disposition_name(p_disposition text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v text;
begin
  if p_disposition is null then return null; end if;

  v := substring(p_disposition from '(?i)filename\*\s*=\s*[A-Za-z0-9_-]*''[^'']*''([^;]+)');
  if v is not null then
    begin
      select convert_from(coalesce(string_agg(
               case when t ~ '^%[0-9A-Fa-f]{2}$' then decode(substr(t, 2), 'hex')
                    else convert_to(t, 'UTF8') end, ''::bytea order by n), ''::bytea), 'UTF8')
        into v
        from regexp_matches(btrim(v), '%[0-9A-Fa-f]{2}|[^%]+|%', 'g') with ordinality as m(a, n),
             lateral (select a[1] as t) x;
    exception when others then
      v := null;
    end;
  end if;
  if v is null then v := substring(p_disposition from '(?i)filename\s*=\s*"([^"]*)"'); end if;
  if v is null then v := substring(p_disposition from '(?i)filename\s*=\s*([^;[:space:]]+)'); end if;

  -- A name, not a path.
  v := nullif(btrim(regexp_replace(coalesce(v, ''), '^.*[\\/]', '')), '');
  return left(v, 200);
end $$;


-- The name GHL gives a file, or null. Only GHL's own links: this reaches out
-- to the internet, so it does not go wherever a row happens to point. Never
-- raises — a file it cannot name is still filed.
create or replace function public.tax_nitro_file_name(p_url text)
returns text language plpgsql volatile set search_path = public as $$
declare
  v_schema text;
  v_disposition text;
begin
  if coalesce(p_url, '') !~* '^https://([a-z0-9-]+\.)*leadconnectorhq\.com/' then return null; end if;

  select n.nspname into v_schema
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.proname = 'http' and p.pronargs = 1 and n.nspname in ('extensions', 'public')
   limit 1;
  if v_schema is null then return null; end if;

  begin
    perform set_config('http.timeout_msec', '5000', true);
  exception when others then
    null;   -- a version without the setting: its own default applies
  end;
  -- One byte, for the headers: GHL turns HEAD away.
  execute format(
    'select h.value
       from %1$I.http((''GET'', $1,
              array[%1$I.http_header(''Range'', ''bytes=0-0''),
                    %1$I.http_header(''User-Agent'', ''FTG-App/1.0'')],
              null, null)::%1$I.http_request) r,
            unnest(r.headers) h
      where lower(h.field) = ''content-disposition''
      limit 1', v_schema)
    into v_disposition using p_url;

  return public.tax_nitro_disposition_name(v_disposition);
exception when others then
  raise warning 'tax_nitro_file_name: %', sqlerrm;
  return null;
end $$;


-- ── Filing ───────────────────────────────────────────────────
-- Everything not filed yet that belongs to a client account; or just one row
-- (p_doc), or one person's (p_email). Returns how many it filed.
create or replace function public.file_tax_nitro_documents(p_doc uuid default null, p_email text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_name text;
  v_ftg boolean;
  v_contract boolean;
  v_takes text[];
  v_named text;
  v_table text;
  v_id uuid;
  n integer := 0;
begin
  for r in
    select d.id, d.name, d.file_name, d.document_url, d.document_type, d.created_at,
           p.id as client_id, p.email as client_email, p.full_name, p.services
      from public.documents d
      join lateral (
        select p.id, p.email, p.full_name, p.services
          from public.profiles p
         where p.role = 'client'
           and (p.id = d.user_id or lower(p.email) = lower(d.email))
         order by (p.id = d.user_id) is true desc
         limit 1
      ) p on true
     where d.filed_table is null
       and coalesce(d.document_url, '') ~* '^https?://'
       and (p_doc is null or d.id = p_doc)
       and (p_email is null or lower(d.email) = lower(btrim(p_email)))
     order by d.created_at
       for update of d skip locked
  loop
    -- The same file again — n8n retrying, or a past run replayed to bring in
    -- the files it missed — is marked as filed where the first copy went,
    -- rather than copied in twice.
    select d2.filed_table, d2.filed_id into v_table, v_id
      from public.documents d2
     where d2.document_url = r.document_url
       and d2.filed_table is not null
       and d2.id <> r.id
       and (d2.user_id = r.client_id or lower(d2.email) = lower(r.client_email))
     limit 1;
    if v_table is not null then
      update public.documents set filed_table = v_table, filed_id = v_id where id = r.id;
      continue;
    end if;

    -- Its name: what n8n sent if it is a file's name — not the client's own
    -- name, which is what it sends now — else what GHL calls it.
    v_name := nullif(btrim(coalesce(r.file_name, '')), '');
    if v_name is null
       and btrim(r.name) ~ '\.[A-Za-z0-9]{2,5}$'
       and lower(btrim(r.name)) <> lower(btrim(coalesce(r.full_name, ''))) then
      v_name := btrim(r.name);
    end if;
    if v_name is null then v_name := public.tax_nitro_file_name(r.document_url); end if;
    if v_name is null then v_name := 'Tax Nitro upload, ' || to_char(r.created_at, 'Mon FMDD, YYYY'); end if;

    v_ftg      := coalesce(r.document_type, '') ilike 'internal';
    v_contract := v_ftg and v_name ~* '(contract|agreement|engagement)';

    -- Which service's Contracts: the one it names, if they take it; else the
    -- only one they take. An account with none recorded is read as BK, as the
    -- app reads it. Otherwise it waits in Unsorted Uploads for staff.
    v_takes := array(select s from unnest(coalesce(nullif(r.services, '{}'), '{BK}')) s where s in ('TAX', 'BK', 'CFO'));
    v_named := case when v_name ~* '\mtax'             then 'TAX'
                    when v_name ~* '(bookkeep|\mbk\M)' then 'BK'
                    when v_name ~* '\mcfo\M'           then 'CFO' end;
    v_table := case
      when not v_contract                              then 'unsorted_uploads'
      when v_named = any(v_takes)                      then lower(v_named) || '_contracts'
      when v_named is null and cardinality(v_takes) = 1 then lower(v_takes[1]) || '_contracts'
      else 'unsorted_uploads' end;

    -- As the app would have filed it: a client's upload waits for FTG, FTG's
    -- own document is already settled. It keeps the day it arrived.
    execute format(
      'insert into public.%I (user_id, email, name, file_name, document_url, status, approval_status,
                              approved_at, uploaded_by_role, uploaded_by, period, created_at, updated_at)
       values ($1, $2, $3, $3, $4, ''new'', $5, $6, $7, ''Tax Nitro'', to_char($8, ''YYYY-MM''), $8, now())
       returning id', v_table)
      into v_id
      using r.client_id, r.client_email, v_name, r.document_url,
            case when v_ftg then 'approved' else 'pending' end,
            case when v_ftg then r.created_at end,
            case when v_ftg then 'staff' else 'client' end,
            r.created_at;

    update public.documents set filed_table = v_table, filed_id = v_id where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;


-- ── When n8n writes one ──────────────────────────────────────
-- Filing must never cost n8n its write: if it fails, the row is still saved,
-- unfiled, and the next run of this file (or the account being made) files it.
create or replace function public.documents_file_tax_nitro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.file_tax_nitro_documents(new.id, null);
  exception when others then
    raise warning 'Tax Nitro document % not filed: %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists documents_file_tax_nitro on public.documents;
create trigger documents_file_tax_nitro
  after insert on public.documents
  for each row execute function public.documents_file_tax_nitro();


-- ── When the client's account is made ────────────────────────
-- Someone can upload through Tax Nitro before they have an app login.
create or replace function public.profiles_file_tax_nitro()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'client' and coalesce(new.email, '') <> '' then
    begin
      perform public.file_tax_nitro_documents(null, new.email);
    exception when others then
      raise warning 'Tax Nitro documents for % not filed: %', new.email, sqlerrm;
    end;
  end if;
  return null;
end $$;

drop trigger if exists profiles_file_tax_nitro on public.profiles;
create trigger profiles_file_tax_nitro
  after insert or update of role, email on public.profiles
  for each row execute function public.profiles_file_tax_nitro();


-- Not for anyone to call from the app: the triggers do it.
revoke all on function public.tax_nitro_disposition_name(text)         from public, anon, authenticated;
revoke all on function public.tax_nitro_file_name(text)                from public, anon, authenticated;
revoke all on function public.file_tax_nitro_documents(uuid, text)     from public, anon, authenticated;
revoke all on function public.documents_file_tax_nitro()               from public, anon, authenticated;
revoke all on function public.profiles_file_tax_nitro()                from public, anon, authenticated;


-- ── Everything already there ─────────────────────────────────
select public.file_tax_nitro_documents() as filed_now;
