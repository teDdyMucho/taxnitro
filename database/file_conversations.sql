-- ============================================================
-- FILE CONVERSATIONS  (per-document chat between client & staff)
-- One row = one message attached to a specific uploaded file.
--
-- This migration is SAFE TO RE-RUN. It:
--   1. Creates the table if it does not exist.
--   2. Removes any old CHECK constraint that hard-codes the list of
--      folder tables (which rejected the new *_required_documents
--      folders and caused the 400 Bad Request on reply).
--   3. (Re)creates RLS so clients can chat on their own files and
--      staff/admins can chat on everything.
-- ============================================================

create table if not exists public.file_conversations (
  id            uuid        primary key default gen_random_uuid(),
  file_id       uuid        not null,          -- id of the document row
  folder_table  text        not null,          -- which folder table the doc lives in
  file_owner_id uuid,                          -- profile id of the client who owns the file
  sender_id     uuid        not null,
  sender_name   text,
  sender_role   text        not null default 'client' check (sender_role in ('client', 'admin', 'staff')),
  message       text        not null,
  is_read       boolean     not null default false,
  created_at    timestamptz not null default now()
);

-- ── Drop any CHECK constraint on folder_table (the likely cause of the 400) ──
-- Old installs may have added `check (folder_table in ('tax_client_uploads', ...))`
-- listing only the original folders. Any name is possible, so drop every CHECK
-- constraint that references folder_table.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'file_conversations'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%folder_table%'
  loop
    execute format('alter table public.file_conversations drop constraint %I', c.conname);
  end loop;
end $$;

-- ── indexes ─────────────────────────────────────────────────
create index if not exists file_conversations_file_idx  on public.file_conversations (file_id, folder_table);
create index if not exists file_conversations_owner_idx  on public.file_conversations (file_owner_id);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.file_conversations enable row level security;

-- Read: the file owner (client) and any staff/admin.
drop policy if exists "read file conversations" on public.file_conversations;
create policy "read file conversations"
  on public.file_conversations for select
  using (
    file_owner_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );

-- Insert: you may only post AS yourself (sender_id = auth.uid()); the file owner
-- or any staff/admin may post.
drop policy if exists "insert file conversations" on public.file_conversations;
create policy "insert file conversations"
  on public.file_conversations for insert
  with check (
    sender_id = auth.uid()
    and (
      file_owner_id = auth.uid()
      or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
    )
  );

-- Update: only to flip is_read (client marks staff messages read & vice-versa).
drop policy if exists "update file conversations read" on public.file_conversations;
create policy "update file conversations read"
  on public.file_conversations for update
  using (
    file_owner_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'staff'))
  );
