-- ============================================================
-- PENDING STAFF  (Invite before they have an account)
--
-- Adding a staff member only ever PROMOTED an existing account:
--   update profiles set role = 'staff' where email = ...
-- which fails with "No account found" until that person has registered
-- themselves. Fine for one hire; painful for an external bookkeeping team,
-- who would each have to sign up first and be chased afterwards.
--
-- An invite is written here instead. When that email registers, the signup
-- trigger finds the invite, creates their profile with the role already set,
-- and clears the invite. Nobody has to be promoted afterwards.
--
-- No service-role key is involved: that key must never reach the web bundle,
-- and there is no backend to hold it. The whole flow is one table and the
-- trigger that already runs on signup.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

create table if not exists public.pending_staff (
  -- Lowercased on the way in, because auth emails are case-insensitive and an
  -- invite to Alex@x.com must still match a signup as alex@x.com.
  email       text        primary key,
  role        text        not null default 'staff' check (role in ('admin', 'staff')),
  invited_by  text,
  invited_at  timestamptz not null default now()
);

-- ── RLS ──────────────────────────────────────────────────────
-- The anon key ships inside the public web bundle, so every rule is explicit.
-- Nobody reads or writes this but staff and admin; the trigger below runs as
-- the function owner and bypasses these.
alter table public.pending_staff enable row level security;

drop policy if exists "staff and admins read invites" on public.pending_staff;
create policy "staff and admins read invites"
  on public.pending_staff for select using (public.is_staff_or_admin());

drop policy if exists "staff and admins create invites" on public.pending_staff;
create policy "staff and admins create invites"
  on public.pending_staff for insert with check (public.is_staff_or_admin());

drop policy if exists "staff and admins update invites" on public.pending_staff;
create policy "staff and admins update invites"
  on public.pending_staff for update
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

drop policy if exists "staff and admins cancel invites" on public.pending_staff;
create policy "staff and admins cancel invites"
  on public.pending_staff for delete using (public.is_staff_or_admin());

-- ── Signup: honour the invite ────────────────────────────────
-- Replaces the original trigger function. Everything it did is still here —
-- the only addition is the invite lookup and the role it produces.
--
-- `role` is left to the column's own default when there is no invite, rather
-- than hardcoding 'client' here, so this cannot quietly disagree with the
-- table if that default ever changes.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  invited_role text;
begin
  select role into invited_role
  from public.pending_staff
  where email = lower(new.email);

  if invited_role is not null then
    insert into public.profiles (id, full_name, email, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', 'User'),
      new.email,
      invited_role
    );
    -- Spent. Leaving it would re-apply on a future account with the same email.
    delete from public.pending_staff where email = lower(new.email);
  else
    insert into public.profiles (id, full_name, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', 'User'),
      new.email
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Housekeeping ─────────────────────────────────────────────
-- An invite for somebody who has since registered another way is dead weight,
-- and would misfire if that email were ever reused. Clear any that already
-- have an account.
delete from public.pending_staff p
where exists (select 1 from public.profiles pr where lower(pr.email) = p.email);
