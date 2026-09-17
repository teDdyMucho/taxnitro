-- ============================================================
-- SOPS  (Standard Operating Procedures — the chatbot's knowledge base)
--
-- One row = one procedure, written once and answered from many times. The
-- assistant in the client portal retrieves from here rather than being told
-- the rules in a prompt, so a procedure that changes is edited in one place
-- and every later answer changes with it.
--
-- THE AUDIENCE COLUMN IS A SECURITY BOUNDARY, NOT A LABEL.
--
-- `audience = 'internal'` rows describe how staff process a client's work:
-- what gets rejected and why, what the reviewer looks for, how a report is
-- sent. A client must never read those, and "the chatbot was told not to
-- quote them" is not a control — the retrieval step has to be unable to see
-- them in the first place. The read policy below enforces that: a client
-- session can select 'client' rows and nothing else.
--
-- This matters more here than in most tables because the anon key ships
-- inside the public web bundle. Anyone can open devtools, read the key and
-- query this table directly. Every rule is therefore spelled out rather than
-- assumed from "the app only asks for client rows".
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
-- Idempotent; also defined in profiles_services.sql. Safe if run standalone.
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

create table if not exists public.sops (
  id          uuid        primary key default gen_random_uuid(),

  -- Stable hand-written identifier ('upload-a-document'), not a generated id.
  -- The seed block below re-runs against this, so editing a procedure's text
  -- here updates the existing row instead of adding a second copy of it.
  slug        text        not null unique,

  title       text        not null,

  -- The procedure itself, in Markdown. Written to be read aloud by the
  -- assistant as an answer, so it opens with the answer rather than with
  -- scope and definitions.
  body        text        not null,

  -- Who may read this row. See the note at the top — this is the boundary.
  --   'client'   → the client portal assistant may retrieve it
  --   'internal' → staff and admin only
  audience    text        not null check (audience in ('client', 'internal')),

  -- Which part of the business it belongs to: 'uploads', 'documents',
  -- 'requirements', 'workflow', 'account', 'billing'. Free text rather than a
  -- CHECK so a new area does not need a migration to start using this table.
  category    text,

  -- Retrieval aids. `tags` carries the words a person would actually use that
  -- do not appear in the body — a client asks about a "voided check", the
  -- procedure calls it a "bank confirmation letter", and without the tag the
  -- lookup misses.
  tags        text[]      not null default '{}',

  -- Which services a procedure applies to: 'BK', 'CFO', 'TAX'. Empty = all of
  -- them. Lets the assistant skip BK-only rules when answering a TAX-only
  -- client, who would otherwise be told to send bank statements they do not owe.
  services    text[]      not null default '{}',

  -- Turn a procedure off without deleting it — the wording is still on record
  -- for whoever asks why an answer changed.
  is_active   boolean     not null default true,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Retrieval filters on audience + is_active on every query, so index that pair.
create index if not exists sops_audience_active_idx
  on public.sops (audience, is_active);

create index if not exists sops_tags_idx    on public.sops using gin (tags);
create index if not exists sops_services_idx on public.sops using gin (services);

-- Plain full-text search over title and body. Enough for a knowledge base this
-- size; if it grows past a few hundred procedures, this is the seam where a
-- pgvector embedding column would go instead.
create index if not exists sops_fts_idx
  on public.sops using gin (to_tsvector('english', title || ' ' || body));

-- ── Keep updated_at honest ───────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_sops_updated on public.sops;
create trigger on_sops_updated
  before update on public.sops
  for each row execute procedure public.handle_updated_at();

-- ── Search helper ────────────────────────────────────────────
-- What n8n calls to answer a question. SECURITY INVOKER (the default), so the
-- caller's RLS still applies and this cannot be used to read around the
-- audience boundary — a client session calling it with 'internal' gets nothing.
create or replace function public.search_sops(
  query          text,
  want_audience  text default 'client',
  want_service   text default null,
  max_results    int  default 5
)
returns table (slug text, title text, body text, category text, rank real)
language sql stable set search_path = public as $$
  select s.slug, s.title, s.body, s.category,
         ts_rank(to_tsvector('english', s.title || ' ' || s.body),
                 plainto_tsquery('english', query)) as rank
  from public.sops s
  where s.is_active
    and s.audience = want_audience
    -- Empty services = applies to everyone.
    and (want_service is null or cardinality(s.services) = 0
         or want_service = any (s.services))
    and (
      to_tsvector('english', s.title || ' ' || s.body) @@ plainto_tsquery('english', query)
      -- Fall back to the tags, which hold the words the body does not use.
      or exists (select 1 from unnest(s.tags) t where t ilike '%' || query || '%')
    )
  order by rank desc, s.title
  limit greatest(1, least(max_results, 20));
$$;

grant execute on function public.search_sops(text, text, text, int) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────
alter table public.sops enable row level security;

-- Any signed-in user may read the client-facing procedures. Note this is
-- `authenticated` only: the anon key alone reads nothing, so the key sitting
-- in the public bundle does not by itself open the knowledge base.
drop policy if exists "signed-in users read client sops" on public.sops;
create policy "signed-in users read client sops"
  on public.sops for select
  to authenticated
  using (is_active and audience = 'client');

-- Staff and admin additionally read the internal ones, active or not.
drop policy if exists "staff and admins read all sops" on public.sops;
create policy "staff and admins read all sops"
  on public.sops for select
  to authenticated
  using (public.is_staff_or_admin());

-- Writing is admin-only. These procedures are what the assistant tells clients
-- is true, so an edit here is a change to what the business says — a narrower
-- gate than the staff-wide one on most other tables.
drop policy if exists "admins write sops" on public.sops;
create policy "admins write sops"
  on public.sops for insert
  to authenticated
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "admins edit sops" on public.sops;
create policy "admins edit sops"
  on public.sops for update
  to authenticated
  using      (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "admins delete sops" on public.sops;
create policy "admins delete sops"
  on public.sops for delete
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
