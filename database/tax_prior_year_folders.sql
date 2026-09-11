-- ============================================================
-- PRIOR-YEAR TAX FOLDERS
--   tax_prior_returns      (Previous Tax Returns)
--   tax_prior_transcripts  (Previous Year Transcripts)
--
-- Belly Jane: "we need to add a tab in the app for Previous Tax Returns and
-- Previous Year Transcripts. This would make it easier for us to access and
-- organize clients' prior-year tax documents and transcripts in one place."
--
-- Two folders rather than one, so a return and an IRS transcript for the same
-- year never have to be told apart by filename. The app shows them together
-- under one "Prior Years" tab in the client's TAX folder.
--
-- Same shape/RLS/features as every other folder table, including the columns
-- later migrations added to the rest (period, subfolder_id), so this file alone
-- brings the two tables fully up to date. It also refreshes is_folder_table()
-- so Move and Delete accept them.
--
-- Run once in the Supabase SQL editor. SAFE TO RE-RUN.
-- ============================================================

-- Recursion-safe role check (also in profiles_services.sql).
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

do $$
declare
  t text;
  prior_year_tables text[] := array[
    'tax_prior_returns',
    'tax_prior_transcripts'
  ];
begin
  foreach t in array prior_year_tables loop
    execute format($ct$
      create table if not exists public.%I (
        id              uuid        primary key default gen_random_uuid(),
        user_id         uuid        references public.profiles(id) on delete cascade,
        name            text        not null default 'Document',
        file_name       text,
        document_url    text        not null,
        email           text,
        status          text        not null default 'new'     check (status in ('new','viewed','not_viewed')),
        approval_status text        not null default 'pending'  check (approval_status in ('pending','approved','rejected')),
        approval_note   text,
        approved_by     text,
        approved_at     timestamptz,
        uploaded_by_role text       not null default 'client'   check (uploaded_by_role in ('client','staff','admin')),
        uploaded_by     text,
        -- The month the document is about, as in document_period.sql. For a
        -- prior-year return that is the tax year, so it sorts where it belongs.
        period          text        default to_char(now(), 'YYYY-MM'),
        created_at      timestamptz not null default now(),
        updated_at      timestamptz not null default now()
      )
    $ct$, t);

    execute format('create index if not exists %I on public.%I (email)',           t || '_email_idx',  t);
    execute format('create index if not exists %I on public.%I (user_id)',         t || '_user_idx',   t);
    execute format('create index if not exists %I on public.%I (approval_status)', t || '_status_idx', t);
    execute format('create index if not exists %I on public.%I (period)',          t || '_period_idx', t);

    -- Subfolders (subfolders.sql). Guarded so this file also runs on a database
    -- where subfolders were never set up.
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = 'custom_subfolders') then
      execute format(
        'alter table public.%I add column if not exists subfolder_id uuid references public.custom_subfolders(id) on delete set null',
        t
      );
      execute format('create index if not exists %I on public.%I (subfolder_id)', t || '_subfolder_idx', t);
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', 'view own ' || t, t);
    execute format($p$
      create policy %I on public.%I for select
      using (auth.uid() = user_id or email = (select email from public.profiles where id = auth.uid()))
    $p$, 'view own ' || t, t);

    execute format('drop policy if exists %I on public.%I', 'insert own ' || t, t);
    execute format($p$
      create policy %I on public.%I for insert
      with check (auth.uid() = user_id or email = (select email from public.profiles where id = auth.uid()))
    $p$, 'insert own ' || t, t);

    execute format('drop policy if exists %I on public.%I', 'update own ' || t, t);
    execute format($p$
      create policy %I on public.%I for update
      using (auth.uid() = user_id or email = (select email from public.profiles where id = auth.uid()))
    $p$, 'update own ' || t, t);

    execute format('drop policy if exists %I on public.%I', 'delete own ' || t, t);
    execute format($p$
      create policy %I on public.%I for delete
      using (auth.uid() = user_id or email = (select email from public.profiles where id = auth.uid()))
    $p$, 'delete own ' || t, t);

    execute format('drop policy if exists %I on public.%I', 'staff manage ' || t, t);
    execute format($p$
      create policy %I on public.%I for all
      using (public.is_staff_or_admin()) with check (public.is_staff_or_admin())
    $p$, 'staff manage ' || t, t);

    execute format('drop trigger if exists %I on public.%I', 'on_' || t || '_updated', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute procedure public.handle_updated_at()',
      'on_' || t || '_updated', t
    );
  end loop;
end $$;

-- ── Let Move and Delete accept the new folders ───────────────
-- Same list as move_document.sql (which now includes these two as well);
-- repeated here so running this file alone is enough on an existing database.
-- Matches FOLDER_TABLES in src/db/documents.ts.
create or replace function public.is_folder_table(t text)
returns boolean language sql immutable as $$
  select t = any (array[
    'tax_contracts', 'tax_invoices', 'tax_client_uploads',
    'tax_additional_docs', 'tax_return_information',
    'tax_prior_returns', 'tax_prior_transcripts',
    'bk_contracts', 'bk_invoices', 'bk_bank_accounts', 'bk_final_pnl',
    'bk_mr_required_info', 'bk_mr_client_review', 'bk_mr_final_statements',
    'cfo_contracts', 'cfo_invoices', 'cfo_additional_docs',
    'cfo_mr_required_info', 'cfo_mr_client_review', 'cfo_mr_final_statements'
  ]);
$$;
