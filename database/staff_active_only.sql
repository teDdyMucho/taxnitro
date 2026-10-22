-- ============================================================
-- A DEACTIVATED STAFF MEMBER LOSES STAFF ACCESS
--
-- Staff → Deactivate sets profiles.is_active = false and promises the person
-- "won't be able to sign in". Nothing enforced it: is_staff_or_admin(), which
-- every folder and client table's policies use, checked the role alone, so a
-- deactivated staff member could still sign in and read every client's files
-- (database/SOP-GAPS.md, item 1). Team One already worked this way:
-- is_team_one() checks is_active.
--
-- Now it checks is_active too, so every policy built on it shuts at once. The
-- app also signs a deactivated staff, admin or Team One login straight back
-- out, with a message saying why (src/context/AuthContext.tsx). Clients are
-- not touched: a Paused or Closed client keeps signing in as before.
--
-- The same function is redefined in about twenty older files; each copy now
-- reads the same, so re-running any of them cannot quietly undo this.
--
-- SAFE TO RE-RUN.
-- ============================================================

create or replace function public.is_staff_or_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff') and coalesce(is_active, true));
$$;
grant execute on function public.is_staff_or_admin() to authenticated, anon;
