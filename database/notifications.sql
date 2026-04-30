-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  message text not null,
  type text not null default 'upload' check (type in ('new', 'upload', 'viewed', 'reminder')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications for update using (auth.uid() = user_id);
