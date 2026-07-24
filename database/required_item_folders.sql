-- ============================================================
-- REQUIRED-ITEM FOLDER TABLES
-- The old "Required Documents" folder (tax_required_documents / bk_required_documents)
-- is replaced by one folder PER required item. Each new folder is a normal document
-- table; uploading into it auto-fulfills the matching requirement (progress radios).
--
--   TAX: tax_prior_month_bookkeeping, tax_ar_ap_aging
--   BK : bk_bank_statements, bk_credit_card_statements, bk_loan_statements, bk_payroll_reports
--
-- (Additional BK Docs reuses the existing bk_final_pnl table — no new table needed.)
-- Same shape/RLS/features as every other folder table. Idempotent. Safe to re-run.
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
  item_tables text[] := array[
    'tax_prior_month_bookkeeping',
    'tax_ar_ap_aging',
    'bk_bank_statements',
    'bk_credit_card_statements',
    'bk_loan_statements',
    'bk_payroll_reports'
  ];
begin
  foreach t in array item_tables loop
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
        created_at      timestamptz not null default now(),
        updated_at      timestamptz not null default now()
      )
    $ct$, t);

    execute format('create index if not exists %I on public.%I (email)',          t || '_email_idx',  t);
    execute format('create index if not exists %I on public.%I (user_id)',         t || '_user_idx',   t);
    execute format('create index if not exists %I on public.%I (approval_status)', t || '_status_idx', t);

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
