-- ============================================================
-- STORAGE BUCKET: avatars
-- Run this in the Supabase SQL editor
-- ============================================================

-- 1. Create the bucket (public so avatar URLs work without auth tokens)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 2. Allow authenticated users to upload their own avatar
create policy "Users can upload own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Allow authenticated users to update/replace their own avatar
create policy "Users can update own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Allow authenticated users to delete their own avatar
create policy "Users can delete own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Allow public read (bucket is public, but explicit policy is good practice)
create policy "Public read access for avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');
