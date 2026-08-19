-- ============================================================
-- MONTHLY QUESTIONNAIRE  (Bookkeeping and CFO clients)
--
-- A set of questions the client answers before they start uploading for the
-- month. One row per client per month, holding every answer.
--
-- Answers are jsonb rather than a column each: the questions are a business
-- list that will change, and adding or reordering one should not need a
-- migration. The shape is defined in src/db/questionnaire.ts, which is also
-- what decides whether an answer is finished.
--
-- Half-finished is a real state. Someone who answers YES to the financing
-- question but has not got the document to hand saves and comes back, so the
-- row exists with status 'in_progress' and the upload gate stays shut.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

create table if not exists public.monthly_questionnaires (
  id            uuid        primary key default gen_random_uuid(),
  -- Email rather than a profile id, matching document_requirements and the
  -- folder tables, so a client is identified the same way everywhere.
  client_email  text        not null,
  month         text        not null,                      -- 'YYYY-MM'
  status        text        not null default 'in_progress'
                            check (status in ('in_progress', 'submitted')),
  answers       jsonb       not null default '{}'::jsonb,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- One questionnaire per client per month. This is also what the upsert in
  -- saveQuestionnaire conflicts on, so saving repeatedly updates one row.
  unique (client_email, month)
);

create index if not exists monthly_questionnaires_client_idx
  on public.monthly_questionnaires (client_email, month desc);

-- ── Keep updated_at honest ───────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_monthly_questionnaires_updated on public.monthly_questionnaires;
create trigger on_monthly_questionnaires_updated
  before update on public.monthly_questionnaires
  for each row execute procedure public.handle_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
-- The anon key ships inside the public web bundle, so every rule is explicit.
-- A client reads and writes their own; staff and admin read everyone's.
--
-- The client's own email comes from their profile rather than from the request,
-- so answering as somebody else is not a matter of changing a field.
alter table public.monthly_questionnaires enable row level security;

create or replace function public.my_email()
returns text language sql security definer stable set search_path = public as $$
  select email from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_email() to authenticated;

drop policy if exists "read own or all as staff" on public.monthly_questionnaires;
create policy "read own or all as staff"
  on public.monthly_questionnaires for select
  using (client_email = public.my_email() or public.is_staff_or_admin());

drop policy if exists "answer own" on public.monthly_questionnaires;
create policy "answer own"
  on public.monthly_questionnaires for insert
  with check (client_email = public.my_email() or public.is_staff_or_admin());

drop policy if exists "update own" on public.monthly_questionnaires;
create policy "update own"
  on public.monthly_questionnaires for update
  using      (client_email = public.my_email() or public.is_staff_or_admin())
  with check (client_email = public.my_email() or public.is_staff_or_admin());

-- Nobody deletes a questionnaire: it is the record of what the client told us
-- that month. Staff who need one gone can remove it from the SQL editor.
