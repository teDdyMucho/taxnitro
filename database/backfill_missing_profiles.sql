-- ============================================================
-- BACKFILL MISSING PROFILES
--
-- An account can exist in auth.users with no matching row in public.profiles:
-- it signed up before handle_new_user() was in place, or its row was deleted.
-- The app copes rather than crashing — it keeps a minimal signed-in user and
-- logs "no profiles row for auth user …" — but that user is stuck. Their name
-- shows as "User", they have no client id or plan, and Edit Profile silently
-- does nothing because the update matches no row.
--
-- This creates the missing rows, taking the name from the signup metadata
-- where there is one.
--
-- SAFE TO RE-RUN — only inserts where a row is absent, and never touches an
-- existing profile.
-- ============================================================

-- ── Who is affected ─────────────────────────────────────────
-- Run this first. If it returns nothing, there is nothing to fix.
select u.id, u.email, u.created_at,
       u.raw_user_meta_data->>'full_name' as name_from_signup
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at;

-- ── The fix ─────────────────────────────────────────────────
insert into public.profiles (id, full_name, email)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', 'User'),
       u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ── Confirm ─────────────────────────────────────────────────
-- Should return no rows.
select u.id, u.email
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
