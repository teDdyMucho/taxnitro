-- ============================================================
-- NOTIFICATIONS: let people clear their own
--
-- notifications.sql enables RLS and creates a SELECT and an UPDATE policy and
-- nothing else. The app's Clear and Clear All (src/db/notifications.ts,
-- NotificationsScreen) issue a plain delete, which under RLS matches no rows —
-- PostgREST reports no error, the functions return true, the list empties in
-- the UI, and every notification is back on the next refresh.
--
-- A client may clear their own. Nothing here lets anyone touch somebody else's.
--
-- SAFE TO RE-RUN.
-- ============================================================

alter table public.notifications enable row level security;

drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- Pin the UPDATE policy as well. With USING alone, a row that is mine on the
-- way in may be handed to somebody else on the way out — "mark as read" is all
-- this is for, so the row must still be mine afterwards.
drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
