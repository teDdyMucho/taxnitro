-- ============================================================
-- WHEN A CLIENT WAS LAST INVITED TO THE PORTAL
--
-- Camaree: "can we create an Invite button to allow us to invite clients to
-- the app directly from the app?" The admin-users function's invite_client
-- action emails the client a link from info@ to set a password and sign in,
-- and notes the time here, so their profile can offer "Invite again".
--
-- Written only by the function, as the service role. SAFE TO RE-RUN.
-- ============================================================

alter table public.profiles add column if not exists invited_at timestamptz;
