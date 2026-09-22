-- ============================================================
-- TICKETS  (what the chat assistant raises when it cannot help)
--
-- One row = one ticket, numbered TKT-00001 upward. The number is what the
-- client quotes back and what staff search for, so it has to be unique per
-- ticket — not per conversation. A session id cannot do that job: one
-- conversation can raise a client ticket and later a second one, and both
-- would carry the same reference.
--
-- The row is written BEFORE the Slack message is posted, so the number
-- exists to put inside it. That order also means a ticket survives Slack
-- being down: the record is here either way, and `notified` says whether
-- anyone was actually told.
--
-- Slack is where tickets get worked. This table is the record that they
-- were raised at all — how many, by whom, of which kind — which a channel
-- alone cannot answer once messages scroll away.
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

-- The counter behind the number. A sequence rather than max(id)+1 so two
-- tickets raised at the same moment cannot take the same number.
create sequence if not exists public.ticket_number_seq start 1;

create table if not exists public.tickets (
  id            uuid        primary key default gen_random_uuid(),

  -- 'TKT-00001'. Generated, never passed in, so it cannot be duplicated or
  -- skipped by a caller.
  reference     text        not null unique
                  default 'TKT-' || lpad(nextval('public.ticket_number_seq')::text, 5, '0'),

  -- 'client'  → a support request, raised after the assistant failed to help
  -- 'staff'   → a bug report from someone who works here
  kind          text        not null check (kind in ('client', 'staff')),

  -- Who raised it, captured at write time. Plain text so the ticket still
  -- reads correctly after that person's profile is gone.
  reporter_name  text,
  reporter_email text,
  reporter_role  text,

  -- The conversation it came from, for reading back what was said.
  session_id    text,

  subject       text        not null,   -- their original question, one line
  body          text        not null,   -- the full ticket as posted to Slack

  -- Where it went, and whether it got there. False means the row exists but
  -- Slack never received it — those are the ones that need chasing.
  channel       text,
  notified      boolean     not null default false,

  -- 'open' until someone closes it. Nothing sets this automatically yet;
  -- it is here so closing a ticket has somewhere to go.
  status        text        not null default 'open'
                  check (status in ('open', 'closed')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists tickets_kind_status_idx on public.tickets (kind, status, created_at desc);
create index if not exists tickets_reporter_idx    on public.tickets (reporter_email, created_at desc);
create index if not exists tickets_session_idx     on public.tickets (session_id);

-- ── Keep updated_at honest ───────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_tickets_updated on public.tickets;
create trigger on_tickets_updated
  before update on public.tickets
  for each row execute procedure public.handle_updated_at();

-- ── What n8n calls ───────────────────────────────────────────
-- Raise a ticket and hand back its number, in one step. The flow calls this
-- first, puts the returned reference into the Slack message, and then marks
-- it notified once Slack confirms.
--
-- SECURITY DEFINER because the assistant raises tickets on behalf of a
-- client who has no insert rights of their own — a client may create their
-- own ticket but must not be able to forge one for somebody else, so the
-- reporter is whatever the flow passes and the number is ours.
create or replace function public.raise_ticket(
  p_kind           text,
  p_subject        text,
  p_body           text,
  p_reporter_name  text default null,
  p_reporter_email text default null,
  p_reporter_role  text default null,
  p_session_id     text default null,
  p_channel        text default null
)
returns table (id uuid, reference text)
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('client', 'staff') then
    raise exception 'raise_ticket: kind must be client or staff, got %', p_kind;
  end if;

  return query
  insert into public.tickets (kind, subject, body, reporter_name, reporter_email,
                              reporter_role, session_id, channel)
  values (p_kind, p_subject, p_body, p_reporter_name, p_reporter_email,
          p_reporter_role, p_session_id, p_channel)
  returning tickets.id, tickets.reference;
end;
$$;

grant execute on function public.raise_ticket(text, text, text, text, text, text, text, text)
  to authenticated, anon;

-- Called after Slack accepts the message, so an unnotified ticket is easy to
-- find: select * from tickets where not notified.
create or replace function public.mark_ticket_notified(p_reference text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.tickets set notified = true where reference = p_reference;
  return found;
end;
$$;

grant execute on function public.mark_ticket_notified(text) to authenticated, anon;

-- ── RLS ──────────────────────────────────────────────────────
-- The anon key ships inside the public web bundle, so every rule is spelled
-- out rather than assumed.
alter table public.tickets enable row level security;

-- A client may read their own tickets — enough to be told "that one is still
-- open" — and nothing of anybody else's. Staff bug reports are never theirs
-- to read even if the email matched, so kind is checked too.
drop policy if exists "clients read their own tickets" on public.tickets;
create policy "clients read their own tickets"
  on public.tickets for select
  to authenticated
  using (
    kind = 'client'
    and reporter_email = (select email from public.profiles where id = auth.uid())
  );

drop policy if exists "staff and admins read all tickets" on public.tickets;
create policy "staff and admins read all tickets"
  on public.tickets for select
  to authenticated
  using (public.is_staff_or_admin());

-- Tickets are created through raise_ticket(), which is SECURITY DEFINER and
-- bypasses these policies. No direct insert is granted to anyone: it would
-- let a caller set their own reference or impersonate another reporter.

drop policy if exists "staff and admins update tickets" on public.tickets;
create policy "staff and admins update tickets"
  on public.tickets for update
  to authenticated
  using      (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());
