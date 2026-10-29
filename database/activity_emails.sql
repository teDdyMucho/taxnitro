-- ============================================================
-- WHO THE ACTIVITY EMAILS GO TO
--
-- Camaree: "email notifications for all activity and updates for Team One,
-- Clients, and Staff". The app tells n8n what happened (src/lib/activityEmail.ts)
-- and n8n emails it from info@ (automation/n8n/ftg-activity-email.json). n8n
-- takes every address from here, never from the request, because anyone can
-- call its webhook.
--
--   email_ready_clients   Clients who have signed in, or were sent an invite
--                         with the Invite button. Nobody hears from the portal
--                         before FTG invites them: on 2026-10-29, 30 of the 36
--                         clients had done neither. The upload email's "Find
--                         the client" step can read it too, for the same rule.
--   email_ready_team_one  Team One's logins that are switched on. Not FTG's own
--                         preview logins (@financetherapygroup.com), which are
--                         not anyone's inbox.
--   team_one_clients      The clients Team One has, by the name Team One sees.
--
-- They read auth.users and every profile, so only the service role (n8n's
-- Supabase credential) may read them, never a signed-in user.
--
-- SAFE TO RE-RUN.
-- ============================================================

create or replace view public.email_ready_clients as
select p.email,
       lower(p.email) as email_key,
       p.first_name,
       p.full_name
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'client'
  and coalesce(p.is_active, true)
  and p.email is not null
  and (u.last_sign_in_at is not null or p.invited_at is not null);

create or replace view public.email_ready_team_one as
select p.email,
       lower(p.email) as email_key,
       p.first_name,
       p.full_name,
       p.role
from public.profiles p
where p.role = 'team_one'
  and coalesce(p.is_active, true)
  and p.email is not null
  and lower(p.email) not like '%@financetherapygroup.com';

create or replace view public.team_one_clients as
select a.client_email as email_key,
       coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.company_name), ''), a.client_email) as name
from public.team_one_assignments a
left join public.profiles p on lower(p.email) = a.client_email and p.role = 'client'
where cardinality(a.services) > 0;

revoke all on public.email_ready_clients, public.email_ready_team_one, public.team_one_clients
  from public, anon, authenticated;
grant select on public.email_ready_clients, public.email_ready_team_one, public.team_one_clients
  to service_role;

-- What n8n will see: how many clients and Team One logins can be emailed now.
select (select count(*) from public.email_ready_clients)  as clients_emailed,
       (select count(*) from public.email_ready_team_one) as team_one_emailed,
       (select count(*) from public.team_one_clients)     as team_one_clients;
