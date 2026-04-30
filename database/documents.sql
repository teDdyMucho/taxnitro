-- ============================================================
-- DOCUMENTS TABLE  (GHL → n8n → Supabase)
-- Fields sent by n8n: document_url, name, email, contact_id
-- ============================================================

create table if not exists public.documents (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references public.profiles(id) on delete cascade,
  name         text        not null default 'Document',
  document_url text        not null,
  email        text,
  contact_id   text,
  status       text        not null default 'new' check (status in ('new', 'viewed', 'not_viewed')),
  created_at   timestamptz not null default now()
);

-- ── indexes ─────────────────────────────────────────────────
create index if not exists documents_email_idx on public.documents (email);
create index if not exists documents_user_id_idx on public.documents (user_id);

-- ── RLS ─────────────────────────────────────────────────────
alter table public.documents enable row level security;

-- Users see documents where their profile email matches
create policy "Users can view own documents"
  on public.documents for select
  using (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

create policy "Users can update own documents"
  on public.documents for update
  using (
    auth.uid() = user_id
    or email = (select email from public.profiles where id = auth.uid())
  );

-- ── n8n inserts using service_role key (bypasses RLS) ───────
-- In n8n Supabase node: use the service_role key, not anon key
-- Fields to send from n8n:
--   document_url  → the GHL download URL
--   name          → originalname from GHL (e.g. "Tax Client Intake Agreement.pdf")
--   email         → contact email from GHL
--   contact_id    → GHL contact id

-- ── migration (if table already exists with old schema) ──────
-- alter table public.documents
--   drop column if exists folder_id,
--   drop column if exists file_type,
--   drop column if exists file_size,
--   drop column if exists updated_at,
--   add column if not exists email text,
--   add column if not exists contact_id text,
--   add column if not exists document_url text not null default '',
--   alter column user_id drop not null,
--   alter column name set default 'Document';
--
-- alter table public.documents
--   drop column if exists storage_path;
