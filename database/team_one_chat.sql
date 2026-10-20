-- ============================================================
-- TEAM ONE ↔ FTG CHAT, ONE THREAD PER CLIENT
--
-- Daja, through Camaree: "within their client access, let's add a chat inside
-- of each client profile that will allow them to communicate with FTG. This
-- chat will only be visible to Team 1 and FTG. clients will not be able to see
-- this on their end."
--
-- FTG (staff and admin) read and write every client's thread. Team One reads
-- and writes the threads of the clients assigned to it, for as long as they
-- are. A client reads nothing here: there is no policy that lets them.
--
-- Everyone writes as themselves only, in their own role, so a message cannot
-- claim to be from someone else. "Read" is marked by the other side: FTG reads
-- what Team One wrote, Team One what FTG wrote.
--
-- Requires team_one_access.sql (is_team_one, team_one_sees). SAFE TO RE-RUN.
-- ============================================================

create table if not exists public.team_one_chat (
  id           uuid        primary key default gen_random_uuid(),
  client_email text        not null check (client_email = lower(client_email)),
  sender_id    uuid        not null references public.profiles(id) on delete cascade,
  sender_name  text,
  sender_role  text        not null check (sender_role in ('team_one', 'staff', 'admin')),
  message      text        not null check (length(btrim(message)) > 0 and length(message) <= 4000),
  is_read      boolean     not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists team_one_chat_client_idx on public.team_one_chat (client_email, created_at);
create index if not exists team_one_chat_unread_idx on public.team_one_chat (sender_role) where not is_read;

alter table public.team_one_chat enable row level security;

-- The caller's own role, read past the profiles table's own rules, the way
-- is_staff_or_admin() does — so the check below does not depend on them.
create or replace function public.my_profile_role()
returns text language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_profile_role() to authenticated;

drop policy if exists "FTG and the client's Team One read the chat" on public.team_one_chat;
create policy "FTG and the client's Team One read the chat"
  on public.team_one_chat for select
  using (public.is_staff_or_admin() or public.team_one_sees(client_email, null));

drop policy if exists "FTG and the client's Team One write the chat" on public.team_one_chat;
create policy "FTG and the client's Team One write the chat"
  on public.team_one_chat for insert
  with check (
    sender_id = auth.uid()
    and is_read = false
    and (
      (public.is_staff_or_admin() and sender_role = public.my_profile_role())
      or (sender_role = 'team_one' and public.team_one_sees(client_email, null))
    )
  );

-- Marking read: only the other side's messages, only in a thread you can see.
create or replace function public.read_team_one_chat(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_staff_or_admin() then
    update public.team_one_chat set is_read = true
     where client_email = lower(p_email) and sender_role = 'team_one' and not is_read;
  elsif public.team_one_sees(p_email, null) then
    update public.team_one_chat set is_read = true
     where client_email = lower(p_email) and sender_role in ('staff', 'admin') and not is_read;
  end if;
end;
$$;
revoke all on function public.read_team_one_chat(text) from public, anon;
grant execute on function public.read_team_one_chat(text) to authenticated;

-- New messages arrive in the open thread without a refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_one_chat') then
    alter publication supabase_realtime add table public.team_one_chat;
  end if;
end $$;
