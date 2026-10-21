-- ============================================================
-- SOPS FOR TEAM ONE, AND A VIDEO FOR EACH HOW-TO
--
-- Camaree: "once SOP and knowledge base are done, chat bots are able to rely
-- on those for how to answer questions".
--
-- Team One works on FTG's side but is not staff: they see only the clients
-- assigned to them, and only to view. The help chat sends them to the staff
-- desk, whose procedures (approving uploads, managing staff) are not theirs.
-- 'team_one' is their own audience: a Team One login reads the client
-- procedures and these, never 'internal'.
--
-- video_url is the narrated how-to video for a procedure, where there is one,
-- so the help chat can offer it and the app can show it.
--
-- Run after sops.sql and team_one_access.sql (for is_team_one()), then run
-- sops_seed.sql. SAFE TO RE-RUN.
-- ============================================================

alter table public.sops drop constraint if exists sops_audience_check;
alter table public.sops add constraint sops_audience_check
  check (audience in ('client', 'internal', 'team_one'));

alter table public.sops add column if not exists video_url text;

-- Active Team One logins read theirs. The client procedures they already read
-- through "signed-in users read client sops"; 'internal' stays staff and admin.
drop policy if exists "team one reads team one sops" on public.sops;
create policy "team one reads team one sops"
  on public.sops for select
  to authenticated
  using (is_active and audience = 'team_one' and public.is_team_one());
