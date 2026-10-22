-- ============================================================
-- HOW-TO VIDEOS
--
-- Camaree: "can we have Ai generate how to text and videos for SOPs for the
-- team". Each video walks through one procedure in the real app, with a
-- narrated voice and captions, recorded against made-up demo data only (a
-- sample bakery, .example addresses), so no client appears in any of them.
--
-- They live in the public storage bucket 'how-to' as <slug>.mp4, with a still
-- beside each as <slug>.jpg for the How-to page. Public is safe: nothing in
-- them is real. This links each procedure to its video; the How-to page shows
-- it, and the help chat can offer it.
--
-- Run after sops_team_one.sql (which adds video_url). SAFE TO RE-RUN.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('how-to', 'how-to', true)
on conflict (id) do update set public = true;

update public.sops
   set video_url = 'https://ruducnccpiasyhcebzcv.supabase.co/storage/v1/object/public/how-to/' || slug || '.mp4'
 where slug in (
   -- clients
   'client-sign-in', 'client-find-documents', 'client-upload-a-document', 'client-review-ftg-file',
   'client-monthly-questionnaire', 'client-message-ftg',
   -- FTG staff
   'internal-add-client', 'internal-approve-reject-upload', 'internal-upload-for-client',
   'internal-team-one-access', 'internal-team-one-review', 'internal-client-password',
   -- Team One
   'teamone-send-update', 'teamone-chat'
 );
