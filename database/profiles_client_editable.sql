-- ============================================================
-- WHAT A CLIENT MAY CHANGE ON THEIR OWN PROFILE
--
-- The original policy is:
--   create policy "Users can update own profile"
--     on public.profiles for update using (auth.uid() = id);
--
-- With no WITH CHECK, Postgres applies the USING expression as the check, so
-- the only thing it actually forbids is changing your own id. Every other
-- column is fair game — including `role`, which any signed-in client could set
-- to 'admin' straight from the anon key that ships in the web bundle.
--
-- This is not about the questionnaire, but the questionnaire is what made it
-- matter: closing an account now writes to the client's own bank_accounts, and
-- that write should not need a policy this wide.
--
-- Rather than list columns in a policy — which silently lets through any column
-- added later — a trigger pins the ones a client must not touch back to what
-- they were. Staff and admin are unaffected and still edit everything.
--
-- SAFE TO RE-RUN.
-- ============================================================

-- ── Caller-role helper (SECURITY DEFINER → no profiles-policy recursion) ─────
create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;

-- A client edits their name, their photo and their own bank accounts. Anything
-- that decides what they can see or do is set by staff, and is put back here if
-- an update tries to change it.
create or replace function public.pin_client_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Staff and admin edit freely. So does anything running without a signed-in
  -- user, which is the signup trigger creating the row in the first place.
  if auth.uid() is null or public.is_staff_or_admin() then
    return new;
  end if;

  new.role           := old.role;
  new.is_active      := old.is_active;
  new.client_id      := old.client_id;
  new.plan           := old.plan;
  new.email          := old.email;
  new.services       := old.services;
  new.has_qbo_access := old.has_qbo_access;

  return new;
end;
$$;

drop trigger if exists pin_client_profile_columns on public.profiles;
create trigger pin_client_profile_columns
  before update on public.profiles
  for each row execute procedure public.pin_client_profile_columns();
