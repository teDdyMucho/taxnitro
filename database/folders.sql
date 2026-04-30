-- ============================================================
-- FOLDERS TABLE
-- Document folders belonging to a user
-- ============================================================

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  status text not null default 'new' check (status in ('new', 'viewed', 'not_viewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.folders enable row level security;

create policy "Users can view own folders"
  on public.folders for select using (auth.uid() = user_id);

create policy "Users can insert own folders"
  on public.folders for insert with check (auth.uid() = user_id);

create policy "Users can update own folders"
  on public.folders for update using (auth.uid() = user_id);

create policy "Users can delete own folders"
  on public.folders for delete using (auth.uid() = user_id);

-- Auto-update updated_at
drop trigger if exists on_folders_updated on public.folders;
create trigger on_folders_updated
  before update on public.folders
  for each row execute procedure public.handle_updated_at();
