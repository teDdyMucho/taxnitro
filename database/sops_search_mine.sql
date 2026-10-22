-- ============================================================
-- THE HELP CHAT READS THE PROCEDURES AS THE PERSON ASKING
--
-- The chat widget sends each question to the n8n chatbot flow with the role
-- the browser says it has, and the flow chose which procedures to search from
-- that. A browser can say anything, so anyone could have asked as staff and
-- been answered from the internal procedures (database/SOP-GAPS.md, item 6).
--
-- search_my_sops() takes no audience. Called with the person's own session,
-- which the widget now sends as accessToken, it works out who they are from
-- the database: a client gets the client procedures, Team One theirs, staff
-- and admin the internal ones. It runs as the caller, so RLS applies on top,
-- and a switched-off login gets the client ones at most. It also returns each
-- procedure's video, for the chat to offer.
--
-- Any word of the question can match, ranked by how many do: people type
-- whole questions, and requiring every word found nothing for most of them.
--
-- The flow calls it as:
--   POST <supabase url>/rest/v1/rpc/search_my_sops
--   apikey: <anon key>    Authorization: Bearer <accessToken>
--   { "query": "<the question>" }
--
-- Run after sops_team_one.sql (video_url) and team_one_access.sql
-- (is_team_one). SAFE TO RE-RUN.
-- ============================================================

create or replace function public.search_my_sops(query text, max_results int default 5)
returns table (slug text, title text, body text, category text, video_url text, rank real)
language sql stable set search_path = public as $$
  with me as (
    select case
      when public.is_staff_or_admin() then 'internal'
      when public.is_team_one() then 'team_one'
      else 'client'
    end as audience
  ),
  q as (
    select nullif(replace(plainto_tsquery('english', coalesce(query, ''))::text, ' & ', ' | '), '')::tsquery as words
  )
  select s.slug, s.title, s.body, s.category, s.video_url,
         coalesce(ts_rank(to_tsvector('english', s.title || ' ' || s.body), q.words), 0)::real as rank
  from public.sops s, me, q
  where s.is_active
    and s.audience = me.audience
    and (
      (q.words is not null and to_tsvector('english', s.title || ' ' || s.body) @@ q.words)
      or exists (select 1 from unnest(s.tags) t where length(t) > 2 and coalesce(query, '') ilike '%' || t || '%')
    )
  order by rank desc, s.title
  limit greatest(1, least(coalesce(max_results, 5), 20));
$$;

revoke execute on function public.search_my_sops(text, int) from public, anon;
grant execute on function public.search_my_sops(text, int) to authenticated;
